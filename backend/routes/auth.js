/* routes/auth.js */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { connectToDb, sql } = require('../config/database');
const { gerarToken } = require('../utils/token');
const { validarForcaSenha } = require('../utils/validators');
const { asyncHandler } = require('../middlewares/errorHandler');
const { limitar } = require('../utils/rateLimit');
const email = require('../services/email');
const evo = require('../services/whatsapp/evolution');
const notificacoes = require('../services/whatsapp/notificacoes');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const SENHAS_PADRAO = ['123', 'Eco123'];

// Anti força-bruta em três camadas:
//  - IP + login: 10 tentativas / 15 min (erro de digitação do próprio usuário)
//  - só IP: 30 / 15 min (impede "password spraying": 1 senha testada em muitos logins)
//  - só login: 30 / 15 min (impede ataque distribuído em muitos IPs contra 1 conta)
const loginDoCorpo = (req) => String((req.body && req.body.usuario) || '').trim().toLowerCase().slice(0, 100);
const MSG_LOGIN = 'Muitas tentativas de login. Aguarde alguns minutos e tente novamente.';
const limiteLogin = limitar({ janelaMs: 15 * 60 * 1000, max: 10, chave: (req) => `${req.ip}|${loginDoCorpo(req)}`, mensagem: MSG_LOGIN });
const limiteLoginIp = limitar({ janelaMs: 15 * 60 * 1000, max: 30, mensagem: MSG_LOGIN });
const limiteLoginConta = limitar({ janelaMs: 15 * 60 * 1000, max: 30, chave: loginDoCorpo, mensagem: MSG_LOGIN });
const limiteRecuperacao = limitar({ janelaMs: 15 * 60 * 1000, max: 10, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' });

// "Impressão digital" da senha atual: o token de troca deixa de valer assim que
// a senha muda (uso único).
const digitalSenha = (hash) => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);

// Token curto, de finalidade única, para troca de senha (primeiro acesso / recuperação).
// Substitui o antigo fluxo em que bastava enviar qualquer id_usuario.
const gerarTokenReset = (idUsuario, senhaHash) =>
    jwt.sign({ id_usuario: idUsuario, finalidade: 'reset_senha', fp: digitalSenha(senhaHash) }, process.env.JWT_SECRET, { expiresIn: '15m' });

// Comparação em tempo constante (senhas legadas em texto puro)
function iguaisSeguro(a, b) {
    const x = Buffer.from(String(a)), y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Hash fictício: quando o login não existe, ainda roda um bcrypt para o tempo de
// resposta não revelar quais logins existem.
const HASH_FICTICIO = bcrypt.hashSync('nao-existe-' + Date.now(), 10);

// ==============================================================================
// LOGIN
// ==============================================================================
router.post('/login', limiteLoginIp, limiteLoginConta, limiteLogin, asyncHandler(async (req, res) => {
    const { usuario, senha } = req.body || {};

    if (!usuario || !senha || typeof usuario !== 'string' || typeof senha !== 'string') {
        return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
    }
    // bcrypt só considera 72 bytes; senhas enormes são só custo de CPU (DoS)
    if (usuario.length > 100 || senha.length > 200) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos (ou acesso ainda não aprovado).' });
    }

    const pool = await connectToDb();
    const r = await pool.request()
        .input('u', sql.VarChar, usuario)
        .query("SELECT * FROM tab_usuarios WHERE usuario=@u AND ativo=1");

    if (r.recordset.length === 0) {
        await bcrypt.compare(senha, HASH_FICTICIO);
        return res.status(401).json({ erro: 'Usuário ou senha inválidos (ou acesso ainda não aprovado).' });
    }

    const user = r.recordset[0];

    // ---------------------------------------------------------------
    // COMPATIBILIDADE: Suporta senhas legadas (texto puro) E bcrypt.
    // Se a senha no banco NÃO é hash bcrypt, compara direto
    // e faz a migração automática para bcrypt no próximo login.
    // ---------------------------------------------------------------
    let senhaValida = false;
    const isBcrypt = !!user.senha_hash && /^\$2[aby]\$/.test(user.senha_hash);

    if (isBcrypt) {
        senhaValida = await bcrypt.compare(senha, user.senha_hash);
    } else {
        // Legado: comparação direta (texto puro)
        senhaValida = !!user.senha_hash && iguaisSeguro(user.senha_hash, senha);

        // Migração silenciosa: se login OK com senha legada, converte pra bcrypt
        if (senhaValida && !SENHAS_PADRAO.includes(senha)) {
            const hash = await bcrypt.hash(senha, SALT_ROUNDS);
            await pool.request()
                .input('id', sql.Int, user.id_usuario)
                .input('h', sql.VarChar, hash)
                .query("UPDATE tab_usuarios SET senha_hash = @h WHERE id_usuario = @id");
        }
    }

    if (!senhaValida) {
        return res.status(401).json({ erro: 'Usuário ou senha inválidos (ou acesso ainda não aprovado).' });
    }

    limiteLogin.zerar(req);
    limiteLoginConta.zerar(req);

    // Verifica se precisa trocar senha padrão
    if (SENHAS_PADRAO.includes(senha) || (!isBcrypt && SENHAS_PADRAO.includes(user.senha_hash))) {
        return res.json({
            trocar_senha: true,
            id_usuario: user.id_usuario,
            token_reset: gerarTokenReset(user.id_usuario, user.senha_hash),
            mensagem: 'Troca de senha obrigatória no primeiro acesso.'
        });
    }

    // Gera token JWT
    const token = gerarToken(user);

    // Retorna dados do usuário SEM a senha
    const { senha_hash, ...dadosUsuario } = user;

    res.json({ token, usuario: dadosUsuario });
}));

// ==============================================================================
// RECUPERAR SENHA POR CÓDIGO (WhatsApp ou e-mail)
// 1) /canais    login + matrícula -> canais cadastrados (mascarados)
// 2) /solicitar envia um código de 6 dígitos pelo canal escolhido
// 3) /verificar código correto -> token_reset (curto, uso único) -> /confirmar
// O código prova a posse do celular/e-mail; login + matrícula sozinhos (dados
// pouco secretos) não bastam mais - o antigo /validar foi desativado.
// ==============================================================================
const CODIGO_VALIDADE_MIN = 10;
const CODIGO_MAX_TENTATIVAS = 5;
const CODIGO_INTERVALO_SEG = 60;

const limiteRecCanais = limitar({ janelaMs: 15 * 60 * 1000, max: 15, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' });
const limiteRecEnvioIp = limitar({ janelaMs: 60 * 60 * 1000, max: 10, mensagem: 'Muitos códigos solicitados. Aguarde e tente novamente.' });
const limiteRecEnvioConta = limitar({ janelaMs: 60 * 60 * 1000, max: 5, chave: loginDoCorpo, mensagem: 'Muitos códigos solicitados para este usuário. Aguarde 1 hora.' });
const limiteRecVerificar = limitar({ janelaMs: 15 * 60 * 1000, max: 20, mensagem: 'Muitas tentativas. Aguarde alguns minutos.' });

const hashCodigo = (idUsuario, codigo) =>
    crypto.createHmac('sha256', process.env.JWT_SECRET).update(`${idUsuario}:${codigo}`).digest('hex');

const emailValido = (e) => /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(String(e || '').trim());
const mascararEmail = (e) => {
    const [u, d] = String(e).trim().split('@');
    return `${u.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(6, u.length - 1)))}@${d}`;
};

async function usuarioDaRecuperacao(pool, body) {
    const { matricula, usuario } = body || {};
    if (!matricula || !usuario || typeof usuario !== 'string') return null;
    const r = await pool.request()
        .input('m', sql.VarChar, String(matricula).trim().slice(0, 50))
        .input('u', sql.VarChar, String(usuario).trim().slice(0, 100))
        .query("SELECT id_usuario, nome_completo, email, senha_hash FROM tab_usuarios WHERE matricula = @m AND usuario = @u AND ativo = 1");
    return r.recordset[0] || null;
}

async function canaisDoUsuario(pool, u) {
    const lista = [];
    const numero = await notificacoes.whatsappParaCodigo(pool, u.id_usuario);
    if (numero) lista.push({ canal: 'WHATSAPP', destino: evo.mascararCelular(numero) });
    if (email.configurado() && emailValido(u.email)) lista.push({ canal: 'EMAIL', destino: mascararEmail(u.email) });
    return lista;
}

const MSG_NAO_ENCONTRADO = 'Usuário/Matrícula não encontrados ou inativos.';

router.post('/recuperar-senha/canais', limiteRecCanais, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const u = await usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });
    const canais = await canaisDoUsuario(pool, u);
    if (!canais.length) {
        return res.status(409).json({ erro: 'Não há celular com WhatsApp nem e-mail cadastrado para enviar o código. Procure o administrador do sistema para redefinir a senha.' });
    }
    res.json({ canais });
}));

router.post('/recuperar-senha/solicitar', limiteRecEnvioIp, limiteRecEnvioConta, asyncHandler(async (req, res) => {
    const canal = String((req.body && req.body.canal) || '').toUpperCase();
    const pool = await connectToDb();
    const u = await usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });

    const canais = await canaisDoUsuario(pool, u);
    const escolhido = canais.find(c => c.canal === canal);
    if (!escolhido) return res.status(400).json({ erro: 'Canal indisponível para este usuário.' });

    // Intervalo mínimo entre pedidos (evita usar o sistema para "bombardear" o celular/e-mail)
    const rec = await pool.request().input('u', sql.Int, u.id_usuario).input('s', sql.Int, CODIGO_INTERVALO_SEG)
        .query('SELECT TOP 1 1 AS x FROM tab_codigos_senha WHERE id_usuario = @u AND data_criacao > DATEADD(SECOND, -@s, GETDATE())');
    if (rec.recordset.length) return res.status(429).json({ erro: `Aguarde ${CODIGO_INTERVALO_SEG} segundos para pedir um novo código.` });

    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    // Só o código mais recente vale
    await pool.request().input('u', sql.Int, u.id_usuario)
        .query('UPDATE tab_codigos_senha SET usado_em = GETDATE() WHERE id_usuario = @u AND usado_em IS NULL');
    await pool.request()
        .input('u', sql.Int, u.id_usuario).input('c', sql.VarChar(10), canal)
        .input('h', sql.Char(64), hashCodigo(u.id_usuario, codigo))
        .input('d', sql.VarChar(150), escolhido.destino)
        .input('min', sql.Int, CODIGO_VALIDADE_MIN)
        .input('ip', sql.VarChar(50), String(req.ip || '').slice(0, 50))
        .query(`INSERT INTO tab_codigos_senha (id_usuario, canal, codigo_hash, destino, expira_em, ip)
                VALUES (@u, @c, @h, @d, DATEADD(MINUTE, @min, GETDATE()), @ip)`);

    if (canal === 'WHATSAPP') {
        await notificacoes.codigoSenha(pool, u.id_usuario, codigo, CODIGO_VALIDADE_MIN);
    } else {
        try {
            await email.enviarCodigoSenha({ para: String(u.email).trim(), nome: u.nome_completo, codigo, validadeMin: CODIGO_VALIDADE_MIN });
        } catch (e) {
            console.error('[E-mail] Falha ao enviar código:', e.message);
            await pool.request().input('u', sql.Int, u.id_usuario).query('UPDATE tab_codigos_senha SET usado_em = GETDATE() WHERE id_usuario = @u AND usado_em IS NULL');
            return res.status(502).json({ erro: 'Não foi possível enviar o e-mail agora. Tente pelo WhatsApp ou mais tarde.' });
        }
    }
    res.json({ mensagem: 'Código enviado.', canal, destino: escolhido.destino, validade_min: CODIGO_VALIDADE_MIN });
}));

router.post('/recuperar-senha/verificar', limiteRecVerificar, asyncHandler(async (req, res) => {
    const codigo = String((req.body && req.body.codigo) || '').replace(/\D/g, '');
    if (codigo.length !== 6) return res.status(400).json({ erro: 'Informe o código de 6 dígitos.' });
    const pool = await connectToDb();
    const u = await usuarioDaRecuperacao(pool, req.body);
    if (!u) return res.status(404).json({ erro: MSG_NAO_ENCONTRADO });

    const r = await pool.request().input('u', sql.Int, u.id_usuario).query(`
        SELECT TOP 1 id_codigo, codigo_hash, tentativas FROM tab_codigos_senha
        WHERE id_usuario = @u AND usado_em IS NULL AND expira_em > GETDATE() ORDER BY id_codigo DESC`);
    const c = r.recordset[0];
    if (!c) return res.status(400).json({ erro: 'Código expirado ou inexistente. Peça um novo código.' });

    const ok = iguaisSeguro(c.codigo_hash.trim(), hashCodigo(u.id_usuario, codigo));
    if (!ok) {
        const tent = c.tentativas + 1;
        await pool.request().input('id', sql.Int, c.id_codigo).input('t', sql.Int, tent)
            .query(`UPDATE tab_codigos_senha SET tentativas = @t, usado_em = CASE WHEN @t >= ${CODIGO_MAX_TENTATIVAS} THEN GETDATE() ELSE NULL END WHERE id_codigo = @id`);
        const restam = CODIGO_MAX_TENTATIVAS - tent;
        return res.status(400).json({ erro: restam > 0 ? `Código incorreto. Restam ${restam} tentativa(s).` : 'Código bloqueado por excesso de tentativas. Peça um novo código.' });
    }
    await pool.request().input('id', sql.Int, c.id_codigo).query('UPDATE tab_codigos_senha SET usado_em = GETDATE() WHERE id_codigo = @id');
    res.json({ mensagem: 'Código confirmado.', id_usuario: u.id_usuario, token_reset: gerarTokenReset(u.id_usuario, u.senha_hash) });
}));

// Fluxo antigo (só login + matrícula) desativado: era a porta de tomada de contas.
router.post('/recuperar-senha/validar', (req, res) => {
    res.status(410).json({ erro: 'A redefinição agora é feita por código enviado no WhatsApp ou e-mail. Atualize a página/aplicativo e use "Esqueci minha senha".' });
});

// ==============================================================================
// RECUPERAR / ALTERAR SENHA - CONFIRMAÇÃO (COM BCRYPT)
// Aceita:
//  - token_reset (corpo) emitido por /login (primeiro acesso) ou /recuperar-senha/validar;
//  - OU sessão válida (Authorization: Bearer) - troca da PRÓPRIA senha.
// O id do usuário vem SEMPRE do token, nunca do corpo.
// ==============================================================================
router.post('/recuperar-senha/confirmar', limiteRecuperacao, asyncHandler(async (req, res) => {
    const { nova_senha, token_reset } = req.body || {};

    let idUsuario = null;
    let digitalEsperada = null;
    try {
        if (token_reset) {
            const d = jwt.verify(String(token_reset), process.env.JWT_SECRET);
            if (d.finalidade === 'reset_senha') { idUsuario = d.id_usuario; digitalEsperada = d.fp || ''; }
        } else if ((req.headers.authorization || '').startsWith('Bearer ')) {
            const d = jwt.verify(req.headers.authorization.split(' ')[1], process.env.JWT_SECRET);
            if (!d.finalidade) idUsuario = d.id_usuario;
        }
    } catch (e) {
        return res.status(401).json({ erro: 'Autorização expirada. Refaça a validação.' });
    }

    if (!idUsuario) {
        return res.status(401).json({ erro: 'Autorização para troca de senha ausente ou inválida.' });
    }
    if (!nova_senha || typeof nova_senha !== 'string') {
        return res.status(400).json({ erro: 'Dados incompletos.' });
    }
    if (nova_senha.length > 72 || !validarForcaSenha(nova_senha) || SENHAS_PADRAO.includes(nova_senha)) {
        return res.status(400).json({ erro: 'A senha não atende aos requisitos de segurança (mín 7 e máx 72 chars, maiúscula, minúscula, número, especial).' });
    }

    const pool = await connectToDb();

    // Conta precisa estar ativa; token de troca vale uma única vez (senha mudou => digital muda)
    const rAtual = await pool.request().input('id', sql.Int, idUsuario)
        .query("SELECT senha_hash, ativo FROM tab_usuarios WHERE id_usuario = @id");
    const atual = rAtual.recordset[0];
    if (!atual || !atual.ativo || (digitalEsperada !== null && digitalEsperada !== digitalSenha(atual.senha_hash))) {
        return res.status(401).json({ erro: 'Autorização expirada. Refaça a validação.' });
    }

    const hash = await bcrypt.hash(nova_senha, SALT_ROUNDS);

    await pool.request()
        .input('id', sql.Int, idUsuario)
        .input('s', sql.VarChar, hash)
        .query("UPDATE tab_usuarios SET senha_hash = @s WHERE id_usuario = @id");

    res.json({ mensagem: 'Senha alterada com sucesso!' });
}));

module.exports = router;
