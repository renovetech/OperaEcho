/* Painéis do dashboard (somente leitura): URLs e leitura dos filtros. Escopo por lotação e regras ficam
 * em paineis.service; o SQL, em paineis.repository e paineis.produtividade.repository. */
const express = require('express');
const { connectToDb } = require('../../config/database');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const servico = require('./paineis.service');
const produtividade = require('./paineis.produtividade.repository');

const router = express.Router();

/** Rota autenticada que recebe o pool e o id do usuário (sempre do token) e devolve JSON. */
const rotaDoUsuario = (url, executar) => router.get(url, autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    res.json(await executar(pool, req.usuario.id_usuario));
}));

/** Rota autenticada que repassa os parâmetros da query ao repositório. */
const rotaDeConsulta = (url, executar, modulo) => router.get(url, autenticar, ...(modulo ? [autorizarModulo(modulo)] : []), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    res.json(await executar(pool, req.query));
}));

rotaDoUsuario('/dashboard/totais', servico.totais);
rotaDoUsuario('/dashboard/proximas-ferias', servico.proximasFerias);
rotaDoUsuario('/dashboard/progresso-planos', servico.progressoPlanos);
rotaDoUsuario('/dashboard/notificacoes', servico.notificacoes);

rotaDeConsulta('/dashboard/atividades-hoje', (pool, { data }) => servico.atividadesHojeImplantacao(pool, data));
rotaDeConsulta('/dashboard/atividades-hoje-projetos', (pool, { data }) => servico.atividadesHojeProjetos(pool, data));

rotaDeConsulta('/dashboard/mapa-implantacao', produtividade.mapaImplantacao, 'painel_consolidado');
rotaDeConsulta('/dashboard/detalhes-produto', produtividade.detalhesDoProduto, 'painel_prod_uni');
rotaDeConsulta('/dashboard/estatisticas-produtividade', produtividade.estatisticasProdutividade, 'painel_prod_ind');
rotaDeConsulta('/dashboard/detalhe-produtividade', produtividade.detalheProdutividade, 'painel_prod_ind');
rotaDeConsulta('/dashboard/metricas-implantacao', produtividade.metricasImplantacao, 'painel_metricas');

router.get('/dashboard/produtividade-produtos', autenticar, autorizarModulo('painel_prod_uni'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const geral = await produtividade.produtosPorUnidade(pool);
    const detalheImplantadores = await produtividade.produtosPorImplantador(pool);
    res.json({ geral, detalheImplantadores });
}));

module.exports = router;
