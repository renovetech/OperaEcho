/*
 * ---------------------------------------------------------------------------
 * Regras de negócio do plano de ação (criação, listagem, detalhe, publicação, encerramento) e ponto de
 * reexportação do que outros arquivos usam (relatórios e painel público):
 *   - rotas internas                       planoAcao.routes.js
 *   - relatórios                           modules/relatorios/relatorios.routes.js
 *   - painel público (somente leitura)     planoAcaoPublico.routes.js
 * Ações, apontamentos, grade e unidades ficam em planoAcao.itens.service.js.
 * --------------------------------------------------------------------------- */
const crypto = require('crypto');
const { connectToDb } = require('../../config/database');
const { temPermissao } = require('../../middlewares/auth');
const { httpErro } = require('../../middlewares/errorHandler');
const { lotacaoNoEscopo } = require('../../middlewares/lotacao');
const dominio = require('./planoAcao.dominio');
const indicadores = require('./planoAcao.indicadores');
const base = require('./planoAcao.base.repository');
const repositorio = require('./planoAcao.repository');
const repositorioItens = require('./planoAcao.itens.repository');
const { toInt, txt, dataOk } = require('./planoAcao.entrada');
const { MODULO, idUser, escopoPlanos, podeEditarPlano, planoNoEscopo, garantirEditavel } = require('./planoAcao.acesso');

const { PLANO, nomeCurto, hojeISO, iso } = dominio;
const LIMITE_TITULO = 300;
const LIMITE_ETAPA = 1000;
const LIMITE_ERROS_ETAPA = 5;
const JUSTIFICATIVA_MINIMA = 10;

/* ================================ CRIAÇÃO ================================ */
const periodoOk = (inicio, fim) => !(inicio && fim && fim < inicio);

/** Mensagens das etapas com data inválida ou fim antes do início (até LIMITE_ERROS_ETAPA). */
function errosDasEtapas(etapas) {
    const erros = [];
    etapas.forEach((e, i) => {
        const di = dataOk(e.data_inicio), df = dataOk(e.data_fim);
        if (di === undefined || df === undefined) erros.push(`Ação ${i + 1}: data inválida.`);
        else if (!periodoOk(di, df)) erros.push(`"${String(e.acao || '').slice(0, 40)}": fim anterior ao início.`);
    });
    return erros.slice(0, LIMITE_ERROS_ETAPA);
}

/** Lê e valida o corpo de "criar plano"; lança 400 com a mensagem da primeira regra violada. */
function lerNovoPlano(b) {
    const titulo = txt(b.titulo, LIMITE_TITULO);
    const idProjeto = toInt(b.id_projeto);
    const unidades = [...new Set((Array.isArray(b.unidades_ids) ? b.unidades_ids : []).map(toInt).filter(Boolean))];
    const etapasPadrao = Array.isArray(b.etapas_padrao) ? b.etapas_padrao : [];
    const etapasUnidade = Array.isArray(b.etapas_unidade) ? b.etapas_unidade : [];
    const dIni = dataOk(b.data_inicio_prevista), dFim = dataOk(b.data_fim_prevista);

    if (!titulo) throw httpErro(400, 'Informe o título do plano.');
    if (!idProjeto) throw httpErro(400, 'Selecione o projeto.');
    if (dIni === undefined || dFim === undefined) throw httpErro(400, 'Datas previstas inválidas.');
    if (!periodoOk(dIni, dFim)) throw httpErro(400, 'O término previsto não pode ser anterior ao início.');
    // Plano pode nascer vazio (montado do zero) - etapas/ações são validadas uma a uma
    const erros = errosDasEtapas([...etapasPadrao, ...etapasUnidade]);
    if (erros.length) throw httpErro(400, erros.join(' '));
    return { titulo, idProjeto, unidades, etapasPadrao, etapasUnidade, dIni, dFim };
}

const itemDaEtapa = (e, extra) => ({
    modulo: txt(e.modulo, 60), descricao: txt(e.acao, LIMITE_ETAPA), responsavel: txt(e.responsavel, 100), prioridade: e.prioridade,
    data_inicio: dataOk(e.data_inicio) || null, data_fim: dataOk(e.data_fim) || null, ...extra
});

async function gravarEtapasDaUnidade(R, idPlano, idUnidade, etapas, eu) {
    let ordem = 1;
    for (const e of etapas) {
        if (!txt(e.acao, LIMITE_ETAPA)) continue;
        await repositorioItens.inserirItem(R, itemDaEtapa(e, { id_plano: idPlano, id_unidade: idUnidade, ordem: ordem++, criado_por: eu }));
    }
}

async function gravarEtapasGerais(R, idPlano, etapas, eu) {
    let ordem = 1;
    for (const e of etapas) {
        if (!txt(e.acao, LIMITE_ETAPA)) continue;
        await repositorioItens.inserirItem(R, itemDaEtapa(e, { id_plano: idPlano, grupo: (txt(e.grupo, 120) || 'GERAL').toUpperCase(), ordem: ordem++, criado_por: eu }));
    }
}

async function criarPlano(req, b) {
    const novo = lerNovoPlano(b);
    if (req.escopo && !req.escopo.global && !lotacaoNoEscopo(req.escopo, novo.idProjeto)) {
        throw httpErro(403, 'Projeto fora da sua lotação.');
    }
    const pool = await connectToDb();
    const eu = idUser(req);
    return repositorio.emTransacao(pool, async (R) => {
        const publico = !!b.publico;
        const idPlano = await repositorio.inserirPlano(R, {
            titulo: novo.titulo, idProjeto: novo.idProjeto, idProduto: toInt(b.id_produto), subTipo: txt(b.sub_tipo, 60), cliente: txt(b.cliente, 200),
            descricao: txt(b.descricao, 1000), dataInicio: novo.dIni, dataFim: novo.dFim, publico, token: publico ? crypto.randomUUID() : null, criadoPor: eu
        });
        // Unidades + etapas por unidade (repetidas para cada unidade × módulo)
        for (const idUnidade of novo.unidades) {
            await repositorio.inserirUnidade(R, idPlano, idUnidade);
            await gravarEtapasDaUnidade(R, idPlano, idUnidade, novo.etapasUnidade, eu);
        }
        // Etapas gerais (sem unidade) - grupo em "titulo", módulo em "modulo"
        await gravarEtapasGerais(R, idPlano, novo.etapasPadrao, eu);
        await repositorio.registrar(R, { id_plano: idPlano, acao: 'CRIACAO', para: novo.titulo, id_usuario: eu });
        return idPlano;
    });
}

/* ============================ LISTAGEM E PAINEL ========================== */
async function listarPlanos(req, query) {
    const { data, projeto, status, busca } = query;
    const pool = await connectToDb();
    await base.sincronizarAtrasos(pool);
    const carga = await base.carregarBase(pool, {
        data: dataOk(data) || null, id_projeto: toInt(projeto), status_plano: txt(status, 30), busca: txt(busca, 100)
    }, escopoPlanos(req));
    const painel = indicadores.montarPainel(carga);
    const brutos = new Map(carga.planos.map(p => [p.id_plano, p]));
    const gestor = await temPermissao(req, MODULO, 'editar');
    const lista = [];
    for (const p of painel.planos) {
        const b = brutos.get(p.id_plano);
        lista.push({ ...p, qtd_unidades: p.unidades, modulos: p.produto, nome_produto: p.produto,
            pode_editar: gestor || (await podeEditarPlano(req, b)),
            pode_excluir: gestor || (b && b.criado_por === idUser(req)) });
    }
    return lista;
}

async function montarPainelInterno(req, q) {
    const pool = await connectToDb();
    await base.sincronizarAtrasos(pool);
    const carga = await base.carregarBase(pool, {
        id_plano: toInt(q.id_plano), id_projeto: toInt(q.projeto), status_plano: txt(q.status, 30), cliente: txt(q.cliente, 200),
        dataInicio: dataOk(q.dataInicio) || null, dataFim: dataOk(q.dataFim) || null
    }, escopoPlanos(req));
    return indicadores.montarPainel(carga);
}

async function detalharPlano(req, idPlano) {
    const pool = await connectToDb();
    await planoNoEscopo(pool, req, idPlano);
    await base.sincronizarAtrasos(pool, idPlano);

    const { cabecalho: cab, unidades, itens, equipe } = await repositorio.lerDetalhe(pool, idPlano);
    const equipePorItem = new Map();
    equipe.forEach(x => {
        if (!equipePorItem.has(x.id_item)) equipePorItem.set(x.id_item, []);
        equipePorItem.get(x.id_item).push({ id_usuario: x.id_usuario, nome_completo: nomeCurto(x.nome_completo) });
    });
    const etapas = itens.map(i => ({ ...i, status: dominio.normStatus(i.status), equipe: equipePorItem.get(i.id_item) || [] }));
    if (cab && cab.token_publico) cab.token_publico = String(cab.token_publico).toLowerCase();
    const resumo = indicadores.resumirItens(etapas, hojeISO());
    return {
        cabecalho: cab,
        detalhes: unidades,
        etapas,
        indicadores: { ...resumo, saude: indicadores.saudePlano(cab, resumo, hojeISO()) },
        permissoes: {
            editar: await podeEditarPlano(req, cab),
            excluir: (await temPermissao(req, MODULO, 'editar')) || (cab && cab.criado_por === idUser(req)),
            novo: await temPermissao(req, MODULO, 'novo')
        }
    };
}

async function listarHistorico(req, idPlano) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano);
    const linhas = await repositorio.listarHistorico(pool, plano.id_plano);
    return linhas.map(x => ({ ...x, usuario: nomeCurto(x.usuario) }));
}

async function listarEquipeDisponivel(req, idPlano) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano);
    const linhas = await repositorio.listarEquipeDisponivel(pool, plano.id_plano);
    return linhas.map(u => ({ ...u, nome_exibicao: nomeCurto(u.nome_completo), ativo: !!u.ativo, da_lotacao: !!u.da_lotacao }));
}

/* ======================= DADOS, PUBLICAÇÃO E CICLO DE VIDA =============== */
async function atualizarDados(req, idPlano, b) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const titulo = txt(b.titulo, LIMITE_TITULO);
    const dIni = dataOk(b.data_inicio_prevista), dFim = dataOk(b.data_fim_prevista);
    if (!titulo) throw httpErro(400, 'Informe o título do plano.');
    if (dIni === undefined || dFim === undefined) throw httpErro(400, 'Datas previstas inválidas.');
    if (!periodoOk(dIni, dFim)) throw httpErro(400, 'O término previsto não pode ser anterior ao início.');
    const atual = await repositorio.buscarCompleto(pool, plano.id_plano);
    const novo = { titulo, cliente: txt(b.cliente, 200), descricao: txt(b.descricao, 1000), data_inicio_prevista: dIni, data_fim_prevista: dFim };

    await repositorio.emTransacao(pool, async (R) => {
        await repositorio.atualizarDados(R, plano.id_plano, novo);
        for (const k of Object.keys(novo)) {
            const a = atual[k] instanceof Date ? iso(atual[k]) : (atual[k] == null ? null : String(atual[k]));
            if (a !== (novo[k] == null ? null : String(novo[k]))) {
                await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'ALTERACAO_PLANO', campo: k, de: a, para: novo[k], id_usuario: idUser(req) });
            }
        }
    });
}

/** Publicação do painel do plano (link público somente leitura). */
async function alterarPublicacao(req, idPlano, b) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    const publicar = !!b.publico;
    const regenerar = !!b.regenerar;
    let token = plano.token_publico;
    if (publicar && (!token || regenerar)) token = crypto.randomUUID();
    await repositorio.atualizarPublicacao(pool, plano.id_plano, publicar, token);
    await repositorio.registrar(() => pool.request(), { id_plano: plano.id_plano, acao: publicar ? 'PUBLICACAO' : 'DESPUBLICACAO', para: regenerar ? 'novo link' : null, id_usuario: idUser(req) });
    return { publico: publicar, token_publico: publicar ? token : null };
}

/** Devolve { mensagem, pendentes? }. Encerrar com itens abertos exige justificativa. */
async function encerrarPlano(req, idPlano, b) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    if (plano.status === PLANO.ENCERRADO) return { mensagem: 'Plano já encerrado.' };
    const just = txt(b.justificativa, 1000);
    const pendentes = await repositorio.contarItensAbertos(pool, plano.id_plano);
    // Regra: encerrar com pendências exige justificativa
    if (pendentes > 0 && (!just || just.length < JUSTIFICATIVA_MINIMA)) {
        throw httpErro(400, `Há ${pendentes} item(ns) não fechados. Informe uma justificativa (mín. ${JUSTIFICATIVA_MINIMA} caracteres) para encerrar.`);
    }
    await repositorio.emTransacao(pool, async (R) => {
        await repositorio.marcarEncerrado(R, plano.id_plano, just);
        await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'ENCERRAMENTO', de: plano.status, para: just ? `ENCERRADO - ${just}` : 'ENCERRADO', id_usuario: idUser(req) });
    });
    return { mensagem: 'Plano encerrado.', pendentes };
}

async function reabrirPlano(req, idPlano) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    if (plano.status !== PLANO.ENCERRADO) return { mensagem: 'Plano já está aberto.', status: plano.status };
    const status = await repositorio.emTransacao(pool, async (R) => {
        await repositorio.marcarReaberto(R, plano.id_plano);
        const st = await base.recalcularStatusPlano(R, plano.id_plano);
        await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'REABERTURA', de: 'ENCERRADO', para: st, id_usuario: idUser(req) });
        return st;
    });
    return { mensagem: 'Plano reaberto.', status };
}

async function excluirPlano(req, idPlano) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { excluir: true });
    await repositorio.emTransacao(pool, (R) => repositorio.excluirPlano(R, plano.id_plano));
}

module.exports = {
    ...dominio, ...indicadores, ...base,
    criarPlano, listarPlanos, montarPainelInterno, detalharPlano, listarHistorico, listarEquipeDisponivel, atualizarDados,
    alterarPublicacao, encerrarPlano, reabrirPlano, excluirPlano
};
