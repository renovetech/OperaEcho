/* Relatórios (somente leitura): URLs, permissões e leitura dos filtros. O SQL fica nos repositórios
 * e a combinação de dados feita no Node, nos serviços. */
const express = require('express');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { valido } = require('./relatorios.filtros');
const atividades = require('./relatorios.atividades.repository');
const presenca = require('./relatorios.presenca.repository');
const presencaServico = require('./relatorios.presenca.service');
const projetosServico = require('./relatorios.projetos.service');
const { tempoMedioDeAcao } = require('./relatorios.tempoMedio.service');
const { relatorioPlanoAcao } = require('./relatorios.planoAcao.service');

const router = express.Router();

const MENSAGEM_PERIODO_OBRIGATORIO = 'Informe o período (dataInicio e dataFim).';
const MENSAGEM_PROJETO_OU_CATEGORIA = 'Informe o projeto ou a categoria.';

router.get('/relatorios/estatisticas-atividades', autenticar, autorizarModulo('rel_estatisticas'), asyncHandler(async (req, res) => {
    res.json(await atividades.estatisticasAtividades(req, req.query));
}));

// Mesmo molde das estatísticas da implantação, sobre os registros de OPERAÇÕES > PROJETOS.
router.get('/relatorios/estatisticas-projetos', autenticar, autorizarModulo('rel_estatisticas_projetos'), asyncHandler(async (req, res) => {
    res.json(await atividades.estatisticasProjetos(req, req.query));
}));

router.get('/relatorios/auditoria-localizacao', autenticar, autorizarModulo('rel_auditoria_loc'), asyncHandler(async (req, res) => {
    res.json(await atividades.auditoriaLocalizacao(req.query));
}));

// Por projeto > unidade > implantador > lista de datas
router.get('/relatorios/presenca-implantador', autenticar, autorizarModulo('rel_presenca_implantador'), asyncHandler(async (req, res) => {
    if (!req.query.dataInicio || !req.query.dataFim) return res.status(400).json({ erro: MENSAGEM_PERIODO_OBRIGATORIO });
    res.json(presencaServico.agruparPorImplantador(await presenca.escalasPorImplantador(req.query, req)));
}));

// Por projeto > unidade > data > [implantadores]
router.get('/relatorios/presenca-equipe', autenticar, autorizarModulo('rel_presenca_equipe'), asyncHandler(async (req, res) => {
    if (!req.query.dataInicio || !req.query.dataFim) return res.status(400).json({ erro: MENSAGEM_PERIODO_OBRIGATORIO });
    res.json(presencaServico.agruparPorData(await presenca.escalasPorData(req.query, req)));
}));

// Atuação / presença de implantadores e equipe (lista plana)
router.get('/relatorios/presenca-implantadores', autenticar, autorizarModulo(['rel_presenca_implantador', 'rel_presenca_equipe']), asyncHandler(async (req, res) => {
    res.json(await presenca.presencaImplantadores(req.query, req));
}));

// Resumo por projeto: unidades, municípios, produtos, georreferenciamento e movimento de atividades no período.
router.get('/relatorios/projetos-ativos', autenticar, autorizarModulo('rel_projetos_ativos'), asyncHandler(async (req, res) => {
    res.json(await projetosServico.projetosAtivos(req, req.query));
}));

// Unidades com coordenadas; sem projeto definido, exige a categoria (evita carregar todas as unidades).
router.get('/relatorios/mapa-unidades', autenticar, autorizarModulo('rel_mapa_unidades'), asyncHandler(async (req, res) => {
    const { id_projeto: idProjeto, categoria } = req.query;
    if (!valido(idProjeto, 'Todos') && !valido(categoria, 'Todas')) return res.status(400).json({ erro: MENSAGEM_PROJETO_OU_CATEGORIA });
    res.json(await projetosServico.mapaUnidades(req, req.query));
}));

router.get('/relatorios/tempo-medio-acao', autenticar, autorizarModulo('rel_tempo_medio'), asyncHandler(async (req, res) => {
    res.json(await tempoMedioDeAcao(req, req.query));
}));

router.get('/relatorios/plano-acao', autenticar, autorizarModulo(['rel_plano_acao', 'plano_acao']), asyncHandler(async (req, res) => {
    res.json(await relatorioPlanoAcao(req, req.query));
}));

module.exports = router;
