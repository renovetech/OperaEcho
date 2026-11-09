/* Férias: solicitação, aprovação, histórico e relatório de prazos legais.
 * Rotas: URLs, permissões e validação aqui; SQL em ferias.repository.js; regras em ferias.service.js. */
const express = require('express');
const { connectToDb, sql } = require('../../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { lotacaoNoEscopo } = require('../../middlewares/lotacao');
const notificacoes = require('../whatsapp/notificacoes');
const repositorio = require('./ferias.repository');
const servico = require('./ferias.service');
const esquemas = require('./ferias.schema');

const router = express.Router();

const STATUS_VALIDOS = ['APROVADO', 'RECUSADO', 'PENDENTE'];
const FORA_DO_ESCOPO = { erro: 'Colaborador fora do seu escopo.' };
const PERIODO_INVALIDO = { erro: servico.MENSAGEM_PERIODO_INVALIDO };
const MODULO_GESTAO = 'ferias_gestao';
const exigeGestao = autorizarModulo(MODULO_GESTAO);
const exigeSolicitacao = autorizarModulo(['ferias_solicitacao', 'proj_ferias_solicitacao', MODULO_GESTAO]);

const { podeVerColaborador, periodoValido } = servico;

/** Reverte a transação sem esconder o erro original quando ela já foi finalizada. */
const desfazer = (transacao) => transacao.rollback().catch(() => {});

// ==============================================================================
// COLABORADORES SELECIONÁVEIS PARA SOLICITAÇÃO (isolado por escopo/lotação)
// modulo=implantacao -> global vê todos os implantadores; senão só o próprio
// modulo=projetos   -> global/Líder de Projeto vê os usuários da lotação;
//                       demais funções só veem a si mesmos
// ==============================================================================
async function colaboradoresDeProjetos(pool, req) {
    const escopo = req.escopo || {};
    const idLot = parseInt(req.query.lotacao);
    if (!idLot) return { falha: { status: 400, corpo: { erro: 'Selecione a lotação.' } } };
    if (!escopo.global && !lotacaoNoEscopo(escopo, idLot)) {
        return { falha: { status: 403, corpo: { erro: 'Lotação fora do seu escopo.' } } };
    }
    const ehLider = servico.normalizarFuncao(escopo.nome_funcao) === 'LIDER DE PROJETO';
    if (escopo.global || ehLider) return { registros: await repositorio.listarUsuariosDaLotacao(pool, idLot) };
    return { registros: await repositorio.buscarUsuario(pool, req.usuario && req.usuario.id_usuario) };
}

async function colaboradoresDeImplantacao(pool, req) {
    if ((req.escopo || {}).global) return { registros: await repositorio.listarImplantadores(pool) };
    return { registros: await repositorio.buscarUsuario(pool, req.usuario && req.usuario.id_usuario) };
}

router.get('/ferias/colaboradores', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const resultado = req.query.modulo === 'projetos' ? await colaboradoresDeProjetos(pool, req) : await colaboradoresDeImplantacao(pool, req);
    if (resultado.falha) return res.status(resultado.falha.status).json(resultado.falha.corpo);
    const limpos = resultado.registros.map(({ senha_hash, ...u }) => u);
    return res.json(limpos);
}));

// ==============================================================================
// HISTÓRICO DE FÉRIAS DE UM COLABORADOR (saldo / tabela da solicitação)
// Sempre filtra pelo id_usuario informado (não usa visão gerencial).
// ==============================================================================
router.get('/ferias/historico/:id', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    if (!(await podeVerColaborador(pool, req, req.params.id))) return res.status(403).json(FORA_DO_ESCOPO);
    return res.json(await repositorio.listarHistorico(pool, parseInt(req.params.id)));
}));

// ==============================================================================
// CONFLITOS
// ==============================================================================
router.post('/ferias/conflitos', autenticar, exigeGestao, validarCorpo(esquemas.verificarConflitos), asyncHandler(async (req, res) => {
    const { id_ferias, data_inicio, data_fim } = req.body;
    const pool = await connectToDb();
    const [solicitante] = await repositorio.buscarDonoParaEdicao(pool, id_ferias || 0);
    if (solicitante && !(await podeVerColaborador(pool, req, solicitante.id_usuario))) return res.status(403).json(FORA_DO_ESCOPO);
    const dono = await repositorio.buscarDonoDosConflitos(pool, id_ferias);
    res.json(await repositorio.listarConflitos(pool, { idFerias: id_ferias, dataInicio: data_inicio, dataFim: data_fim, dono }));
}));

// ==============================================================================
// SALVAR FÉRIAS
// ==============================================================================
router.post('/ferias/salvar', autenticar, exigeSolicitacao, validarCorpo(esquemas.solicitarFerias), asyncHandler(async (req, res) => {
    const { id_usuario, periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim } = req.body;

    const pool = await connectToDb();
    if (!(await podeVerColaborador(pool, req, id_usuario))) return res.status(403).json(FORA_DO_ESCOPO);
    if (!periodoValido(data_inicio, data_fim)) return res.status(400).json(PERIODO_INVALIDO);

    // Validação CLT - Art. 134 (limite de 1 ano e 11 meses)
    const validacao = await servico.validarLimitePeriodoAquisitivo(id_usuario, periodo_aquisitivo, data_fim);
    if (!validacao.valido) return res.status(400).json({ erro: validacao.motivo, data_limite: validacao.data_limite });

    const saldo = await servico.conferirSaldoESobreposicao(pool, { idUsuario: id_usuario, periodoAquisitivo: periodo_aquisitivo, tipoSolicitacao: tipo_solicitacao, dataInicio: data_inicio, dataFim: data_fim });
    if (saldo.erro) return res.status(400).json({ erro: saldo.erro });

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await repositorio.inserirFerias(t, {
            idUsuario: id_usuario, periodoAquisitivo: periodo_aquisitivo, tipoSolicitacao: tipo_solicitacao,
            dataInicio: data_inicio, dataFim: data_fim, diasRestantes: saldo.restante
        });
        await t.commit();
        await servico.reordenarPeriodosDeFerias(id_usuario, periodo_aquisitivo);
        res.json({ mensagem: 'OK' });
    } catch (err) { await t.rollback().catch(() => undefined); throw err; }
}));

// ==============================================================================
// EDITAR FÉRIAS
// ==============================================================================
/** Edição só dentro do escopo; férias aprovadas só por quem pode aprová-las. Devolve a falha ou o dono. */
async function conferirPermissaoDeEdicao(pool, req, idFerias) {
    const donos = await repositorio.buscarDonoParaEdicao(pool, idFerias);
    if (donos.length === 0) return { falha: { status: 404, corpo: { erro: 'Férias não encontradas.' } } };
    const dono = donos[0];
    if (!(await podeVerColaborador(pool, req, dono.id_usuario))) return { falha: { status: 403, corpo: FORA_DO_ESCOPO } };
    if (dono.status === 'APROVADO' && !servico.podeAprovarFuncao(req.escopo, dono.nome_funcao || dono.funcao_txt)) {
        return { falha: { status: 403, corpo: { erro: 'Férias já aprovadas só podem ser alteradas por quem pode aprová-las.' } } };
    }
    return { dono };
}

/** Dentro da transação: refaz a escala se as férias já estavam aprovadas. Devolve a falha de prazo, se houver. */
async function gravarEdicao(t, idFerias, d) {
    const dadosAntigos = await repositorio.buscarFerias(t, idFerias);
    if (!dadosAntigos) throw new Error("Férias não encontradas");

    // Validação CLT - Art. 134 (limite de 1 ano e 11 meses)
    const validacao = await servico.validarLimitePeriodoAquisitivo(dadosAntigos.id_usuario, d.periodoAquisitivo, d.dataFim);
    if (!validacao.valido) return { validacao };

    const aprovado = dadosAntigos.status === 'APROVADO';
    if (aprovado) await servico.syncEscalaFerias(t, dadosAntigos.id_usuario, dadosAntigos.data_inicio, dadosAntigos.data_fim, 'remover');
    await repositorio.atualizarFerias(t, idFerias, d);
    if (aprovado) await servico.syncEscalaFerias(t, dadosAntigos.id_usuario, d.dataInicio, d.dataFim, 'inserir');
    return { idUsuario: dadosAntigos.id_usuario };
}

router.put('/ferias/editar/:id', autenticar, exigeGestao, validarCorpo(esquemas.editarFerias), asyncHandler(async (req, res) => {
    const { periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim } = req.body;
    const idFerias = parseInt(req.params.id);
    const pool = await connectToDb();
    if (!periodoValido(data_inicio, data_fim)) return res.status(400).json(PERIODO_INVALIDO);

    const permissao = await conferirPermissaoDeEdicao(pool, req, idFerias);
    if (permissao.falha) return res.status(permissao.falha.status).json(permissao.falha.corpo);

    const saldo = await servico.conferirSaldoESobreposicao(pool, { idUsuario: permissao.dono.id_usuario, periodoAquisitivo: periodo_aquisitivo, tipoSolicitacao: tipo_solicitacao, dataInicio: data_inicio, dataFim: data_fim, idIgnorado: idFerias });
    if (saldo.erro) return res.status(400).json({ erro: saldo.erro });

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const edicao = { periodoAquisitivo: periodo_aquisitivo, tipoSolicitacao: tipo_solicitacao, dataInicio: data_inicio, dataFim: data_fim };
        const gravado = await gravarEdicao(t, idFerias, edicao);
        if (gravado.validacao) {
            await t.rollback().catch(() => undefined);
            return res.status(400).json({ erro: gravado.validacao.motivo, data_limite: gravado.validacao.data_limite });
        }
        await t.commit();
        await servico.reordenarPeriodosDeFerias(gravado.idUsuario, periodo_aquisitivo);
        return res.json({ mensagem: 'Atualizado e sincronizado com sucesso' });
    } catch (err) { await t.rollback().catch(() => undefined); throw err; }
}));

// ==============================================================================
// LISTAR FÉRIAS
// Regra: colaboradores inativos não aparecem na visão gerencial.
// Antes de listar, remove automaticamente as solicitações "PENDENTE" (Em Análise)
// pertencentes a colaboradores inativos, e filtra a listagem para retornar
// apenas registros de colaboradores ativos.
// Observação: na visão pessoal (id_usuario informado, perfil comum), mantém
// o comportamento original para o próprio usuário ver seu histórico.
// ==============================================================================
/** Limpeza automática: só na visão gerencial, para não rodar a cada consulta pessoal. Falha não impede a listagem. */
async function limparPendentesDeInativos(pool) {
    try {
        await repositorio.removerPendentesDeInativos(pool);
    } catch (errLimpeza) {
        console.error("Erro ao limpar solicitações Em Análise de colaboradores inativos:", errLimpeza);
    }
}

router.get('/ferias/listar', autenticar, asyncHandler(async (req, res) => {
    const { id_usuario, lotacao } = req.query;
    const pool = await connectToDb();
    const escopo = req.escopo || {};
    // Perfil do TOKEN, nunca da query (o front envia ?perfil=..., agora ignorado).
    const perfil = escopo.perfil_acesso || (req.usuario && req.usuario.perfil_acesso);

    const ehGestao = perfil === 'Administrador' || perfil === 'Gestor';
    // Fora da própria visão pessoal, é preciso o módulo de gestão.
    const propriaVisao = Boolean(id_usuario) && parseInt(id_usuario) === parseInt(req.usuario.id_usuario) && !ehGestao;
    if (!propriaVisao && !(await temPermissao(req, MODULO_GESTAO))) return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    const ehVisaoGerencial = !id_usuario || ehGestao;
    // Visão pessoal de outro colaborador: só dentro do escopo.
    if (!ehVisaoGerencial && !(await podeVerColaborador(pool, req, id_usuario))) return res.status(403).json(FORA_DO_ESCOPO);

    if (ehVisaoGerencial) await limparPendentesDeInativos(pool);

    const pessoal = Boolean(id_usuario) && !ehGestao;
    res.json(await repositorio.listarSolicitacoes(pool, { pessoal, idUsuario: id_usuario, lotacao, escopo }));
}));

// ==============================================================================
// RELATÓRIO DE PRAZOS LEGAIS (CLT - Art. 134) - Convenção RH
// ==============================================================================
router.get('/ferias/relatorio-prazos', autenticar, exigeGestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const usuarios = await repositorio.listarImplantadoresAdmitidos(pool, req.escopo);
    const ferias = await repositorio.listarFeriasDosImplantadores(pool, req.escopo);
    res.json(servico.montarRelatorioPrazos(usuarios, ferias));
}));

// ==============================================================================
// ALTERAR STATUS (APROVAR / RECUSAR)
// ==============================================================================
/** Dentro da transação: grava o status e sincroniza a escala. Devolve a linha de férias, se existir. */
async function gravarStatus(t, idFerias, status) {
    await repositorio.atualizarStatus(t, idFerias, status);
    const d = await repositorio.buscarFerias(t, idFerias);
    if (d && status === 'APROVADO') await servico.syncEscalaFerias(t, d.id_usuario, d.data_inicio, d.data_fim, 'inserir');
    else if (d && status === 'RECUSADO') await servico.syncEscalaFerias(t, d.id_usuario, d.data_inicio, d.data_fim, 'remover');
    return d;
}

router.put('/ferias/status/:id', autenticar, exigeGestao, validarCorpo(esquemas.alterarStatus), asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ erro: 'Status inválido.' });
    const pool = await connectToDb();

    // Trava por função: confere se o aprovador pode atuar sobre a função do solicitante
    const alvos = await repositorio.buscarAlvoDoStatus(pool, req.params.id);
    if (alvos.length === 0) return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    const funcaoSolicitante = alvos[0].nome_funcao || alvos[0].funcao_txt;
    if (!servico.podeAprovarFuncao(req.escopo, funcaoSolicitante)) {
        return res.status(403).json({ erro: 'Você não tem permissão para aprovar/recusar férias desta função.' });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const d = await gravarStatus(t, req.params.id, status);
        await t.commit();
        // Pós-commit: falha aqui não pode tentar rollback de transação já finalizada
        if (d) {
            try { await servico.reordenarPeriodosDeFerias(d.id_usuario, d.periodo_aquisitivo); }
            catch (e) { console.error('[ferias] reordenação de períodos falhou:', e.message); }
        }
        res.json({ ok: true });
        // Aviso ao solicitante pelo WhatsApp (não bloqueia a resposta)
        if (d) notificacoes.feriasStatus(d.id_ferias, status, req.usuario.id_usuario);
    } catch (err) {
        await desfazer(t);
        throw err;
    }
}));

module.exports = router;
