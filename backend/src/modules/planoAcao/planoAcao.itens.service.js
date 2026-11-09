/* Regras de negócio das ações do plano: apontamento de horas, ordem, inclusão e exclusão de ações, unidades e etapas. */
const { connectToDb } = require('../../config/database');
const { httpErro } = require('../../middlewares/errorHandler');
const dominio = require('./planoAcao.dominio');
const base = require('./planoAcao.base.repository');
const repositorio = require('./planoAcao.repository');
const repositorioItens = require('./planoAcao.itens.repository');
const { toInt, txt, dataOk } = require('./planoAcao.entrada');
const { idUser, podeEditarPlano, planoNoEscopo, garantirEditavel, itemComPlano } = require('./planoAcao.acesso');

const { ST, hojeISO, iso, nomeCurto, normStatus, ehFechado } = dominio;
const MINUTOS_POR_DIA = 1440;
const LIMITE_DESCRICAO = 1000;
const ETAPA_PADRAO_DA_UNIDADE = 'INICIAR IMPLANTAÇÃO NA UNIDADE';
const formatarDuracao = (minutos) => `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`;

/* ============================== APONTAMENTOS ============================= */
async function listarApontamentos(req, idItem) {
    const pool = await connectToDb();
    const { item } = await itemComPlano(pool, req, idItem);
    const linhas = await repositorioItens.listarApontamentos(pool, item.id_item);
    return linhas.map(x => ({ ...x, nome_completo: nomeCurto(x.nome_completo) }));
}

/** Lê e valida o apontamento; lança 400/409 conforme a regra violada. */
function lerApontamento(b, item, eu) {
    const dataExec = dataOk(b.data_execucao) || hojeISO();
    const minutos = toInt(b.minutos);
    if (dataOk(b.data_execucao) === undefined) throw httpErro(400, 'Data da execução inválida.');
    if (dataExec > hojeISO()) throw httpErro(400, 'Não é possível apontar horas em data futura.');
    if (!minutos || minutos <= 0 || minutos > MINUTOS_POR_DIA) throw httpErro(400, 'Informe um tempo entre 00:01 e 24:00.');
    if (ehFechado(item.status)) throw httpErro(409, 'Item fechado: reabra-o para apontar novas horas.');
    return { alvo: toInt(b.id_usuario) || eu, dataExec, minutos };
}

/** Regra: aponta para si quem está na equipe do item; para terceiros, só quem pode editar o plano. Teto diário: 24h por pessoa. */
async function conferirQuemPodeApontar(pool, req, item, plano, { alvo, dataExec, minutos }) {
    const eu = idUser(req);
    const podeGerir = await podeEditarPlano(req, plano);
    const naEquipe = await repositorioItens.pessoaNaEquipe(pool, item.id_item, eu);
    if (!podeGerir && (alvo !== eu || !naEquipe)) {
        throw httpErro(403, 'Apenas integrantes da equipe do item (ou gestores do plano) podem apontar horas.');
    }
    const jaApontado = await repositorioItens.minutosApontadosNoDia(pool, alvo, dataExec);
    if (jaApontado + minutos > MINUTOS_POR_DIA) throw httpErro(400, 'O total apontado para a pessoa nesta data ultrapassa 24h.');
}

/** Primeira execução tira o item de "A Iniciar" e liga o cronômetro; devolve a nova situação (ou null). */
async function ajustarInicioDoItem(R, item, dataExec) {
    if (normStatus(item.status) === ST.A_INICIAR) {
        await repositorioItens.iniciarAndamento(R, item.id_item, item.dt_inicio_andamento || dominio.agoraBR(), iso(item.data_inicio_real) || dataExec);
        return ST.ANDAMENTO;
    }
    if (!item.data_inicio_real || iso(item.data_inicio_real) > dataExec) await repositorioItens.ajustarInicioReal(R, item.id_item, dataExec);
    return null;
}

async function apontarHoras(req, idItem, b) {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, idItem);
    garantirEditavel(plano);
    const eu = idUser(req);
    const apontamento = lerApontamento(b, item, eu);
    const { alvo, dataExec, minutos } = apontamento;
    await conferirQuemPodeApontar(pool, req, item, plano, apontamento);

    return repositorio.emTransacao(pool, async (R) => {
        await repositorioItens.inserirApontamento(R, {
            idItem: item.id_item, idPlano: item.id_plano, idUsuario: alvo, dataExecucao: dataExec, minutos, descricao: txt(b.descricao, 500), registradoPor: eu
        });
        await repositorioItens.garantirNaEquipe(R, item.id_item, alvo);
        const mudouStatus = await ajustarInicioDoItem(R, item, dataExec);
        await repositorioItens.recalcularHoras(R, item.id_item);
        await repositorio.registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'APONTAMENTO', campo: 'horas',
            para: `${formatarDuracao(minutos)} em ${dataExec}`, id_usuario: eu });
        if (mudouStatus) await repositorio.registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'ALTERACAO', campo: 'status', de: item.status, para: mudouStatus, id_usuario: eu });
        return { ok: true, status: mudouStatus || item.status };
    });
}

async function excluirApontamento(req, idApontamento) {
    const pool = await connectToDb();
    const a = await repositorioItens.buscarApontamento(pool, idApontamento);
    if (!a) throw httpErro(404, 'Apontamento não encontrado.');
    const plano = await planoNoEscopo(pool, req, a.id_plano);
    garantirEditavel(plano);
    const eu = idUser(req);
    if (a.id_usuario !== eu && a.registrado_por !== eu && !(await podeEditarPlano(req, plano))) {
        throw httpErro(403, 'Você só pode excluir os seus próprios apontamentos.');
    }
    await repositorio.emTransacao(pool, async (R) => {
        await repositorioItens.excluirApontamento(R, a.id_apontamento);
        await repositorioItens.recalcularHoras(R, a.id_item);
        await repositorio.registrar(R, { id_plano: a.id_plano, id_item: a.id_item, acao: 'EXCLUSAO_APONTAMENTO', campo: 'horas',
            de: `${a.minutos} min em ${iso(a.data_execucao)}`, id_usuario: eu });
    });
}

/* ============================ ORDEM E EXCLUSÃO =========================== */
async function moverItem(req, idItem, direcao) {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, idItem, { editar: true });
    garantirEditavel(plano);
    const sobe = direcao === 'cima';
    const viz = await repositorioItens.buscarVizinho(pool, item, sobe);
    if (!viz) return { ok: true, movido: false };
    let oA = item.ordem || 0;
    const oB = viz.ordem || 0;
    if (oA === oB) { if (sobe) oA = oB - 1; else oA = oB + 1; }
    await repositorio.emTransacao(pool, (R) => repositorioItens.trocarOrdem(R, item.id_item, oB, viz.id_item, oA));
    return { ok: true, movido: true };
}

async function excluirItem(req, idItem, forcar) {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, idItem, { editar: true });
    garantirEditavel(plano);
    const apontamentos = await repositorioItens.contarApontamentosDoItem(pool, item.id_item);
    if (apontamentos > 0 && !forcar) {
        throw httpErro(409, `Este item possui ${apontamentos} apontamento(s) de horas. Confirme para excluir junto.`);
    }
    await repositorio.emTransacao(pool, async (R) => {
        await repositorioItens.excluirItem(R, item.id_item);
        await repositorio.registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'EXCLUSAO_ITEM', de: item.descricao, id_usuario: idUser(req) });
        await base.recalcularStatusPlano(R, item.id_plano);
    });
}

/** Lê e valida a nova ação; lança 400 se faltar descrição ou as datas forem inválidas. */
function lerNovaAcao(b) {
    const descricao = txt(b.descricao, LIMITE_DESCRICAO);
    const di = dataOk(b.data_inicio), df = dataOk(b.data_fim);
    if (!descricao) throw httpErro(400, 'Descreva a ação.');
    if (di === undefined || df === undefined) throw httpErro(400, 'Datas inválidas.');
    if (di && df && df < di) throw httpErro(400, 'O fim previsto não pode ser anterior ao início.');
    return { descricao, di, df };
}

/** Ordem da nova ação: logo após a ação indicada (abrindo espaço) ou no fim do contexto. */
async function definirOrdem(R, contexto, aposItem) {
    if (aposItem) {
        const ordemAnterior = await repositorioItens.ordemDoItemNoContexto(R, contexto, aposItem);
        if (ordemAnterior != null) {
            const ordem = ordemAnterior + 1;
            await repositorioItens.abrirEspacoNaOrdem(R, contexto, ordem);
            return ordem;
        }
    }
    return repositorioItens.proximaOrdem(R, contexto);
}

async function incluirItem(req, idPlano, b) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const { descricao, di, df } = lerNovaAcao(b);
    const idUnidade = toInt(b.id_unidade);
    if (idUnidade && !await repositorio.unidadePertenceAoPlano(pool, plano.id_plano, idUnidade)) {
        throw httpErro(400, 'A unidade não pertence a este plano.');
    }
    const modulo = txt(b.modulo, 60);
    const grupo = idUnidade ? null : (txt(b.grupo, 120) || 'GERAL').toUpperCase();
    const aposItem = toInt(b.apos_id_item);

    return repositorio.emTransacao(pool, async (R) => {
        const contexto = { idPlano: plano.id_plano, idUnidade, modulo, grupo };
        const ordem = await definirOrdem(R, contexto, aposItem);
        const idItem = await repositorioItens.inserirItem(R, {
            id_plano: plano.id_plano, id_unidade: idUnidade, grupo, modulo, descricao,
            responsavel: txt(b.responsavel, 100), cliente: txt(b.cliente, 200), prioridade: b.prioridade,
            data_inicio: di, data_fim: df, ordem, criado_por: idUser(req)
        });
        await repositorio.registrar(R, { id_plano: plano.id_plano, id_item: idItem, acao: 'INCLUSAO_ITEM', para: descricao, id_usuario: idUser(req) });
        await base.recalcularStatusPlano(R, plano.id_plano);
        return { ok: true, id_item: idItem };
    });
}

/* ================================ UNIDADES =============================== */
/** Devolve { jaExiste: true } se a unidade já está no plano; senão cria a unidade com as etapas do modelo. */
async function adicionarUnidade(req, b) {
    const { id_plano: idPlanoInformado, id_unidade: idUnidadeInformada, etapas_template: etapasTemplate } = b;
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(idPlanoInformado), { editar: true });
    garantirEditavel(plano);
    const idUnidade = toInt(idUnidadeInformada);
    if (!idUnidade) throw httpErro(400, 'Unidade inválida.');
    if (await repositorio.unidadeJaNoPlano(pool, plano.id_plano, idUnidade)) return { jaExiste: true };

    await repositorio.emTransacao(pool, async (R) => {
        await repositorio.inserirUnidade(R, plano.id_plano, idUnidade);
        let o = 1;
        const lista = Array.isArray(etapasTemplate) && etapasTemplate.length ? etapasTemplate : [{ acao: ETAPA_PADRAO_DA_UNIDADE }];
        for (const e of lista) {
            const desc = txt(e.acao, LIMITE_DESCRICAO);
            if (!desc) continue;
            await repositorioItens.inserirItem(R, { id_plano: plano.id_plano, id_unidade: idUnidade, modulo: txt(e.modulo, 60), descricao: desc,
                responsavel: txt(e.responsavel, 100), prioridade: e.prioridade, ordem: o++, criado_por: idUser(req) });
        }
        const nome = await repositorio.buscarNomeUnidade(R, idUnidade);
        await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'INCLUSAO_UNIDADE', para: nome, id_usuario: idUser(req) });
        await base.recalcularStatusPlano(R, plano.id_plano);
    });
    return { ok: true };
}

async function removerUnidade(req, idPlano, idUnidade, forcar) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const info = await repositorio.resumirUnidade(pool, plano.id_plano, idUnidade);
    if ((info.iniciados > 0 || info.apontamentos > 0) && !forcar) {
        throw httpErro(409, `A unidade possui ${info.iniciados || 0} item(ns) já iniciados e ${info.apontamentos || 0} apontamento(s). Confirme para remover mesmo assim.`);
    }
    await repositorio.emTransacao(pool, async (R) => {
        await repositorio.excluirUnidade(R, plano.id_plano, idUnidade);
        await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'EXCLUSAO_UNIDADE', de: idUnidade, id_usuario: idUser(req) });
        await base.recalcularStatusPlano(R, plano.id_plano);
    });
}

/* ================================= ETAPAS ================================ */
async function renomearEtapa(req, idPlano, b) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const de = txt(b.de, 120), para = (txt(b.para, 120) || '').toUpperCase();
    if (!de || !para) throw httpErro(400, 'Informe o nome atual e o novo nome da etapa.');
    const alterados = await repositorioItens.renomearEtapa(pool, { idPlano: plano.id_plano, modulo: txt(b.modulo, 60), de, para });
    await repositorio.registrar(() => pool.request(), { id_plano: plano.id_plano, acao: 'ALTERACAO', campo: 'etapa', de, para, id_usuario: idUser(req) });
    return { ok: true, alterados };
}

async function excluirEtapa(req, idPlano, query) {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const nome = txt(query.nome, 120), modulo = txt(query.modulo, 60);
    if (!nome) throw httpErro(400, 'Etapa inválida.');
    const etapa = { idPlano: plano.id_plano, modulo, nome };
    const info = await repositorioItens.resumirEtapa(pool, etapa);
    if (info.apontamentos > 0 && query.forcar !== '1') {
        throw httpErro(409, `A etapa possui ${info.apontamentos} apontamento(s) de horas. Confirme para excluir mesmo assim.`);
    }
    await repositorio.emTransacao(pool, async (R) => {
        await repositorioItens.excluirEtapa(R, etapa);
        await repositorio.registrar(R, { id_plano: plano.id_plano, acao: 'EXCLUSAO_ETAPA', de: `${nome} (${info.itens} ações)`, id_usuario: idUser(req) });
        await base.recalcularStatusPlano(R, plano.id_plano);
    });
}

module.exports = {
    listarApontamentos, apontarHoras, excluirApontamento, moverItem, excluirItem, incluirItem,
    adicionarUnidade, removerUnidade, renomearEtapa, excluirEtapa
};
