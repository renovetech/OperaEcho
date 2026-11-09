/* Usuários: listagens, cadastro (inclusive o autocadastro anônimo), aprovação de acesso, exclusão e contato do próprio usuário. */
const express = require('express');
const { connectToDb } = require('../../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { parseIntSafe } = require('../../shared/validators');
const { lotacaoNoEscopo } = require('../../middlewares/lotacao');
const { limitar } = require('../../shared/rateLimit');
const { podeVerColaborador } = require('../ferias/ferias.service');
const repositorio = require('./usuarios.repository');
const servico = require('./usuarios.service');
const esquemas = require('./usuarios.schema');

const router = express.Router();

const UMA_HORA_MS = 60 * 60 * 1000;
const MAXIMO_AUTOCADASTROS_POR_HORA = 5;
const MSG_SEM_PERMISSAO = 'Sem permissão para esta ação.';

// Autocadastro anônimo: no máximo 5 solicitações por hora por IP.
const limiteAutocadastroBase = limitar({ compartilhado: 'autocadastro', janelaMs: UMA_HORA_MS, max: MAXIMO_AUTOCADASTROS_POR_HORA, mensagem: 'Muitas solicitações de cadastro. Tente novamente mais tarde.' });
const limiteAutocadastro = (req, res, next) => (req.usuario ? next() : limiteAutocadastroBase(req, res, next));

const responderFalha = (res, falha) => res.status(falha.status).json({ erro: falha.erro });

const RESPOSTA_DE_SUCESSO = { mensagem: 'Salvo com sucesso' };
const CONFLITO = 409;

/** No autocadastro anônimo, dado já existente responde como sucesso: a tela não pode revelar quem tem cadastro. */
const responderCadastroRecusado = (req, res, falha) => (!req.usuario && falha.status === CONFLITO ? res.json(RESPOSTA_DE_SUCESSO) : responderFalha(res, falha));

/** Lotação escolhida na tela (id_projeto ou lotacao); "Todos" e vazio valem como sem escolha. */
const lotacaoEscolhida = (consulta) => {
    const escolhida = consulta.id_projeto || consulta.lotacao;
    return escolhida && escolhida !== 'Todos' ? escolhida : null;
};

// Visibilidade definida pela FUNÇÃO do usuário logado (módulo IMPLANTAÇÃO); nos Projetos, isolada pela lotação escolhida.
router.get('/implantadores', autenticar, asyncHandler(async (req, res) => {
    const { id_projeto: idProjeto, lotacao, escala_inicio: escalaInicio, escala_fim: escalaFim, escala } = req.query;
    const pool = await connectToDb();
    res.json(await servico.listarImplantadores(pool, { idProjeto, lotacao, escalaInicio, escalaFim, escala }, req.escopo));
}));

router.get('/usuarios/buscar', autenticar, asyncHandler(async (req, res) => {
    const { id, termo } = req.query;
    const escolhida = lotacaoEscolhida(req.query);
    // Lotação informada precisa estar no escopo de quem consulta.
    if (escolhida && !lotacaoNoEscopo(req.escopo, escolhida)) {
        return res.status(403).json({ erro: 'Lotação fora do seu escopo.' });
    }
    const pool = await connectToDb();
    const usuarios = await repositorio.buscarUsuarios(pool, {
        termo,
        id,
        idLotacao: escolhida ? parseIntSafe(escolhida) : undefined,
        escopo: req.escopo
    });
    return res.json(usuarios.map(servico.semSenha));
}));

/** Vínculos de outra pessoa: só com o módulo de usuários e dentro do escopo. */
const podeVerVinculos = asyncHandler(async (req, res, next) => {
    const alvo = parseInt(req.params.id);
    const proprio = alvo === parseInt(req.usuario.id_usuario);
    if (proprio || (await temPermissao(req, 'usuarios') && await podeVerColaborador(await connectToDb(), req, alvo))) return next();
    return res.status(403).json({ erro: MSG_SEM_PERMISSAO });
});

router.get('/usuarios/:id/produtos', autenticar, podeVerVinculos, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarIdsDeProdutos(await connectToDb(), req.params.id));
}));

router.get('/usuarios/:id/lotacoes', autenticar, podeVerVinculos, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarIdsDeLotacoes(await connectToDb(), req.params.id));
}));

// Sem token só cria uma solicitação (inativa, perfil Solicitante); com token, exige permissão no módulo e respeita o escopo.
router.post('/usuarios/salvar', limiteAutocadastro, validarCorpo(esquemas.salvarUsuario), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const entrada = servico.conferirEntrada(req.body);
    if (entrada.falha) return responderFalha(res, entrada.falha);
    let dados = entrada.dados;

    if (!req.usuario) {
        const autocadastro = servico.prepararAutocadastro(dados);
        if (autocadastro.falha) return responderFalha(res, autocadastro.falha);
        dados = autocadastro.dados;
    } else {
        if (!(await temPermissao(req, 'usuarios', dados.id_usuario ? 'editar' : 'novo'))) {
            return res.status(403).json({ erro: MSG_SEM_PERMISSAO });
        }
        const foraDoEscopo = await servico.conferirEscopoDoCadastro(req, pool, dados);
        if (foraDoEscopo) return responderFalha(res, foraDoEscopo);
        const senhaFraca = servico.conferirSenhaDefinida(dados);
        if (senhaFraca) return responderFalha(res, senhaFraca);
    }

    const conflito = await servico.conferirLoginEPerfil(req, pool, dados);
    if (conflito) return responderCadastroRecusado(req, res, conflito);

    const gravacao = await servico.gravarUsuario(pool, dados);
    if (gravacao.falha) return responderCadastroRecusado(req, res, gravacao.falha);
    return res.json(RESPOSTA_DE_SUCESSO);
}));

// Aprovar acesso exige o módulo; perfil Administrador só pelo login "admin".
router.post('/usuarios/ativar', autenticar, validarCorpo(esquemas.ativarUsuario), asyncHandler(async (req, res) => {
    const { id_usuario: idUsuario, perfil } = req.body;
    const idFinal = idUsuario || req.body.id;

    if (!idFinal || !perfil || typeof perfil !== 'string') {
        return res.status(400).json({ erro: 'ID e perfil são obrigatórios.' });
    }
    if (!(await temPermissao(req, ['notificacoes_acesso', 'usuarios'], 'editar'))) {
        return res.status(403).json({ erro: 'Sem permissão para aprovar acessos.' });
    }

    const pool = await connectToDb();
    const impedimento = await servico.conferirAtivacao(req, pool, idFinal, perfil);
    if (impedimento) return responderFalha(res, impedimento);

    await repositorio.ativarUsuario(pool, idFinal, perfil);
    return res.json({ mensagem: 'Ativado' });
}));

router.delete('/usuarios/:id', autenticar, autorizarModulo('usuarios', 'editar'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const id = parseInt(req.params.id);
    if (!id) return res.status(400).json({ erro: 'ID inválido.' });
    if (id === parseInt(req.usuario.id_usuario)) return res.status(403).json({ erro: 'Não é possível excluir o próprio usuário.' });

    const impedimento = await servico.conferirExclusao(req, pool, id);
    if (impedimento) return responderFalha(res, impedimento);

    await servico.excluirUsuario(pool, id);
    return res.json({ mensagem: 'Usuário excluído com sucesso.' });
}));

router.get('/perfis', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarPerfis(await connectToDb()));
}));

router.get('/setores', asyncHandler(async (req, res) => {
    res.json(await repositorio.listarSetores(await connectToDb()));
}));

router.get('/funcoes', asyncHandler(async (req, res) => {
    res.json(await repositorio.listarFuncoes(await connectToDb()));
}));

// MEU CONTATO: o próprio usuário completa celular (WhatsApp) e e-mail. O Dashboard pede isso após o login de quem
// ainda não tem WhatsApp confirmado.
router.get('/meu-cadastro/contato', autenticar, asyncHandler(async (req, res) => {
    const u = await repositorio.buscarContato(await connectToDb(), req.usuario.id_usuario) || {};
    res.json({ celular: u.celular || '', celular_whatsapp: !!u.celular_whatsapp, email: u.email || '', completo: servico.celularCompleto(u.celular) });
}));

router.put('/meu-cadastro/contato', autenticar, validarCorpo(esquemas.atualizarContato), asyncHandler(async (req, res) => {
    const contato = servico.validarContato(req.body);
    if (contato.erro) return res.status(400).json({ erro: contato.erro });
    await repositorio.atualizarContato(await connectToDb(), req.usuario.id_usuario, contato);
    return res.json({ mensagem: 'Contato atualizado.', celular: contato.celular, celular_whatsapp: true, email: contato.email || '' });
}));

module.exports = router;
