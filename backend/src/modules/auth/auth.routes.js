/* Login e recuperação de senha (rotas públicas, antes da barreira de sessão).
 * Recuperação por código (WhatsApp ou e-mail):
 *   /canais     login + matrícula -> canais cadastrados (mascarados)
 *   /solicitar  envia um código de 6 dígitos pelo canal escolhido
 *   /verificar  código correto -> token_reset (curto, uso único) -> /confirmar
 * O código prova a posse do celular/e-mail; login + matrícula sozinhos (dados pouco secretos) não bastam mais:
 * o antigo /validar foi desativado. */
const express = require('express');
const { connectToDb } = require('../../config/database');
const { gerarToken } = require('../../shared/token');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { limitar } = require('../../shared/rateLimit');
const repositorio = require('./auth.repository');
const servico = require('./auth.service');
const esquemas = require('./auth.schema');

const router = express.Router();

const QUINZE_MINUTOS_MS = 15 * 60 * 1000;
const UMA_HORA_MS = 60 * 60 * 1000;
const TAMANHO_CODIGO = 6;
const MSG_LOGIN = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const MSG_TENTATIVAS = 'Muitas tentativas. Aguarde alguns minutos.';
const MSG_CREDENCIAIS = 'Usuário ou senha inválidos (ou acesso ainda não aprovado).';
const MSG_NAO_ENCONTRADO = 'Usuário/Matrícula não encontrados ou inativos.';
const MSG_AUTORIZACAO_EXPIRADA = 'Autorização expirada. Refaça a validação.';

// Anti força-bruta em três camadas:
//  - IP + login: 10 tentativas / 15 min (erro de digitação do próprio usuário)
//  - só IP: 30 / 15 min (impede "password spraying": 1 senha testada em muitos logins)
//  - só login: 30 / 15 min (impede ataque distribuído em muitos IPs contra 1 conta)
const loginDoCorpo = (req) => String((req.body && req.body.usuario) || '').trim().toLowerCase().slice(0, 100);
const limiteLogin = limitar({ compartilhado: 'limiteLogin', janelaMs: QUINZE_MINUTOS_MS, max: 10, chave: (req) => `${req.ip}|${loginDoCorpo(req)}`, mensagem: MSG_LOGIN });
const limiteLoginIp = limitar({ compartilhado: 'limiteLoginIp', janelaMs: QUINZE_MINUTOS_MS, max: 30, mensagem: MSG_LOGIN });
const limiteLoginConta = limitar({ compartilhado: 'limiteLoginConta', janelaMs: QUINZE_MINUTOS_MS, max: 30, chave: loginDoCorpo, mensagem: MSG_LOGIN });
const limiteRecuperacao = limitar({ compartilhado: 'limiteRecuperacao', janelaMs: QUINZE_MINUTOS_MS, max: 10, mensagem: MSG_TENTATIVAS });
const limiteRecCanais = limitar({ compartilhado: 'limiteRecCanais', janelaMs: QUINZE_MINUTOS_MS, max: 15, mensagem: MSG_TENTATIVAS });
const limiteRecEnvioIp = limitar({ compartilhado: 'limiteRecEnvioIp', janelaMs: UMA_HORA_MS, max: 10, mensagem: 'Muitos códigos solicitados. Aguarde e tente novamente.' });
const limiteRecEnvioConta = limitar({ compartilhado: 'limiteRecEnvioConta', janelaMs: UMA_HORA_MS, max: 5, chave: loginDoCorpo, mensagem: 'Muitos códigos solicitados para este usuário. Aguarde 1 hora.' });
const limiteRecVerificar = limitar({ compartilhado: 'limiteRecVerificar', janelaMs: QUINZE_MINUTOS_MS, max: 20, mensagem: MSG_TENTATIVAS });

router.post('/login', limiteLoginIp, limiteLoginConta, limiteLogin, validarCorpo(esquemas.login), asyncHandler(async (req, res) => {
    const { usuario, senha } = req.body;

    if (!servico.camposDoLoginValidos(usuario, senha)) {
        return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
    }
    if (servico.camposDoLoginGrandesDemais(usuario, senha)) {
        return res.status(401).json({ erro: MSG_CREDENCIAIS });
    }

    const pool = await connectToDb();
    const user = await repositorio.buscarAtivoPorLogin(pool, usuario);
    if (!user) {
        await servico.gastarTempoDeConferencia(senha);
        return res.status(401).json({ erro: MSG_CREDENCIAIS });
    }

    const { valida, ehBcrypt } = await servico.conferirSenha(pool, user, senha);
    if (!valida) return res.status(401).json({ erro: MSG_CREDENCIAIS });

    limiteLogin.zerar(req);
    limiteLoginConta.zerar(req);

    if (servico.exigeTrocaDeSenha(user, senha, ehBcrypt)) {
        return res.json({
            trocar_senha: true,
            id_usuario: user.id_usuario,
            token_reset: servico.gerarTokenReset(user.id_usuario, user.senha_hash),
            mensagem: 'Troca de senha obrigatória no primeiro acesso.'
        });
    }

    // Retorna dados do usuário SEM a senha
    const { senha_hash, ...dadosUsuario } = user;
    return res.json({ token: gerarToken(user), usuario: dadosUsuario });
}));

router.post('/recuperar-senha/canais', limiteRecCanais, validarCorpo(esquemas.consultarCanais), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const u = await servico.usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });
    const canais = await servico.canaisDoUsuario(pool, u);
    if (!canais.length) {
        return res.status(409).json({ erro: 'Não há celular com WhatsApp nem e-mail cadastrado para enviar o código. Procure o administrador do sistema para redefinir a senha.' });
    }
    return res.json({ canais });
}));

router.post('/recuperar-senha/solicitar', limiteRecEnvioIp, limiteRecEnvioConta, validarCorpo(esquemas.solicitarCodigo), asyncHandler(async (req, res) => {
    const canal = String(req.body.canal || '').toUpperCase();
    const pool = await connectToDb();
    const u = await servico.usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });

    const canais = await servico.canaisDoUsuario(pool, u);
    const escolhido = canais.find((c) => c.canal === canal);
    if (!escolhido) return res.status(400).json({ erro: 'Canal indisponível para este usuário.' });

    // Intervalo mínimo entre pedidos (evita usar o sistema para "bombardear" o celular/e-mail)
    if (await repositorio.existePedidoRecente(pool, u.id_usuario, servico.CODIGO_INTERVALO_SEG)) {
        return res.status(429).json({ erro: `Aguarde ${servico.CODIGO_INTERVALO_SEG} segundos para pedir um novo código.` });
    }

    const codigo = servico.sortearCodigo();
    await repositorio.encerrarCodigosAbertos(pool, u.id_usuario);
    await repositorio.gravarCodigo(pool, {
        idUsuario: u.id_usuario,
        canal,
        hash: servico.hashCodigo(u.id_usuario, codigo),
        destino: escolhido.destino,
        validadeMin: servico.CODIGO_VALIDADE_MIN,
        ip: String(req.ip || '').slice(0, 50)
    });

    if (!await servico.entregarCodigo(pool, u, canal, codigo)) {
        await repositorio.encerrarCodigosAbertos(pool, u.id_usuario);
        return res.status(502).json({ erro: 'Não foi possível enviar o e-mail agora. Tente pelo WhatsApp ou mais tarde.' });
    }
    return res.json({ mensagem: 'Código enviado.', canal, destino: escolhido.destino, validade_min: servico.CODIGO_VALIDADE_MIN });
}));

router.post('/recuperar-senha/verificar', limiteRecVerificar, validarCorpo(esquemas.verificarCodigo), asyncHandler(async (req, res) => {
    const codigo = String(req.body.codigo || '').replace(/\D/g, '');
    if (codigo.length !== TAMANHO_CODIGO) return res.status(400).json({ erro: 'Informe o código de 6 dígitos.' });
    const pool = await connectToDb();
    const u = await servico.usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });

    const c = await repositorio.buscarCodigoAberto(pool, u.id_usuario);
    if (!c) return res.status(400).json({ erro: 'Código expirado ou inexistente. Peça um novo código.' });

    if (!servico.codigoConfere(c.codigo_hash, u.id_usuario, codigo)) {
        const tentativas = c.tentativas + 1;
        await repositorio.registrarTentativaErrada(pool, c.id_codigo, tentativas, servico.CODIGO_MAX_TENTATIVAS);
        return res.status(400).json({ erro: servico.mensagemDeCodigoIncorreto(tentativas) });
    }
    await repositorio.encerrarCodigo(pool, c.id_codigo);
    return res.json({ mensagem: 'Código confirmado.', id_usuario: u.id_usuario, token_reset: servico.gerarTokenReset(u.id_usuario, u.senha_hash) });
}));

// Aceita token_reset (corpo) emitido por /login (primeiro acesso) ou /verificar; OU sessão válida (Authorization: Bearer),
// na troca da PRÓPRIA senha. O id do usuário vem SEMPRE do token, nunca do corpo.
router.post('/recuperar-senha/confirmar', limiteRecuperacao, validarCorpo(esquemas.confirmarSenha), asyncHandler(async (req, res) => {
    const { nova_senha: novaSenha, token_reset: tokenReset } = req.body;

    let titular;
    try {
        titular = servico.titularDaTroca(req.headers.authorization, tokenReset);
    } catch (e) {
        return res.status(401).json({ erro: MSG_AUTORIZACAO_EXPIRADA });
    }
    const { idUsuario, digitalEsperada } = titular;

    if (!idUsuario) {
        return res.status(401).json({ erro: 'Autorização para troca de senha ausente ou inválida.' });
    }
    if (!novaSenha || typeof novaSenha !== 'string') {
        return res.status(400).json({ erro: 'Dados incompletos.' });
    }
    if (!servico.senhaNovaAceita(novaSenha)) {
        return res.status(400).json({ erro: 'A senha não atende aos requisitos de segurança (mín 7 e máx 72 chars, maiúscula, minúscula, número, especial).' });
    }

    const pool = await connectToDb();
    const atual = await repositorio.buscarSenhaEAtivo(pool, idUsuario);
    if (!servico.trocaAutorizada(atual, digitalEsperada)) {
        return res.status(401).json({ erro: MSG_AUTORIZACAO_EXPIRADA });
    }

    await repositorio.gravarNovaSenha(pool, idUsuario, await servico.gerarHashDaSenha(novaSenha));
    return res.json({ mensagem: 'Senha alterada com sucesso!' });
}));

module.exports = router;
