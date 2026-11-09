/* Relatório do plano de ação: usa o mesmo motor do painel (planoAcao.service) e acrescenta os itens detalhados. */
const { connectToDb } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');
const PA = require('../planoAcao/planoAcao.service');

const TAMANHO_MAXIMO_STATUS = 30;
const TAMANHO_MAXIMO_CLIENTE = 200;
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;

const paraInteiro = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
const dataOuNulo = (v) => (FORMATO_DATA.test(String(v || '')) ? v : null);
const informado = (v) => v && v !== 'Todos';

function filtrosDaBase(q) {
    return {
        id_plano: paraInteiro(q.id_plano),
        id_projeto: q.id_projeto && q.id_projeto !== 'Todos' ? paraInteiro(q.id_projeto) : null,
        status_plano: q.status_plano && q.status_plano !== 'Todos' ? String(q.status_plano).slice(0, TAMANHO_MAXIMO_STATUS) : null,
        cliente: q.cliente ? String(q.cliente).slice(0, TAMANHO_MAXIMO_CLIENTE) : null,
        dataInicio: dataOuNulo(q.dataInicio), dataFim: dataOuNulo(q.dataFim)
    };
}

function filtrarItens(itens, q) {
    let filtrados = itens;
    if (informado(q.responsavel)) filtrados = filtrados.filter((i) => i.responsavel === q.responsavel);
    if (informado(q.status)) filtrados = filtrados.filter((i) => i.status === q.status);
    if (informado(q.situacao_prazo)) filtrados = filtrados.filter((i) => i.situacao_prazo === q.situacao_prazo);
    return filtrados;
}

/** Status, etapas e execução dos planos, respeitando a lotação do usuário. */
async function relatorioPlanoAcao(req, q) {
    const pool = await connectToDb();
    await PA.sincronizarAtrasos(pool);
    const base = await PA.carregarBase(pool, filtrosDaBase(q),
        (request) => ((req.escopo && !req.escopo.global) ? filtroPorProjeto(request, req.escopo, 'p.id_projeto') : ''));

    const itens = filtrarItens(PA.itensDetalhados(base), q);

    // Indicadores recalculados sobre o recorte de itens filtrado
    const ids = new Set(itens.map((i) => i.id_item));
    const recorte = { ...base, itens: base.itens.filter((i) => ids.has(i.id_item)) };
    return { ...PA.montarPainel(recorte), itens };
}

module.exports = { relatorioPlanoAcao };
