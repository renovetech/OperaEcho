/* Gravação da grade do plano em lote: valida cada linha, aplica as regras de situação, cronômetro e equipe, e audita campo a campo. */
const { connectToDb } = require('../../config/database');
const { httpErro } = require('../../middlewares/errorHandler');
const dominio = require('./planoAcao.dominio');
const base = require('./planoAcao.base.repository');
const repositorio = require('./planoAcao.repository');
const repositorioItens = require('./planoAcao.itens.repository');
const { toInt, txt, dataOk } = require('./planoAcao.entrada');
const { idUser, planoNoEscopo, garantirEditavel } = require('./planoAcao.acesso');

const { ST, STATUS_VALIDOS, PRIORIDADES, hojeISO, iso, normStatus, ehFechado } = dominio;
const LIMITE_LOTE = 3000;
const LIMITE_EQUIPE = 50;
const LIMITE_TEMPO_PREVISTO = 100000;
const PRIORIDADE_PADRAO = 'Alta';
const CAMPOS_DE_DATA = ['data_inicio', 'data_fim', 'data_inicio_real', 'data_fim_real'];

const CAMPOS_AUDITADOS = {
    descricao: 'Ação', responsavel: 'Responsável', cliente: 'Cliente', observacao: 'Observação',
    data_inicio: 'Início previsto', data_fim: 'Fim previsto', data_inicio_real: 'Início realizado',
    data_fim_real: 'Fim realizado', prioridade: 'Prioridade', status: 'Situação', percentual: '% Execução'
};

/** Valores propostos para a linha: o que veio no lote ou, se o campo não veio, o que já está gravado. */
function montarProposta(e, atual) {
    const tem = (k) => Object.prototype.hasOwnProperty.call(e, k);
    return {
        descricao: tem('descricao') ? txt(e.descricao, 1000) : atual.descricao,
        responsavel: tem('responsavel') ? txt(e.responsavel, 100) : atual.responsavel,
        cliente: tem('cliente') ? txt(e.cliente, 200) : atual.cliente,
        observacao: tem('observacao') ? txt(e.observacao, 1000) : atual.observacao,
        prioridade: tem('prioridade') ? (e.prioridade || PRIORIDADE_PADRAO) : (atual.prioridade || PRIORIDADE_PADRAO),
        status: tem('status') ? e.status : normStatus(atual.status),
        percentual: tem('percentual') ? (e.percentual === '' || e.percentual == null ? null : toInt(e.percentual)) : atual.percentual,
        data_inicio: tem('data_inicio') ? dataOk(e.data_inicio) : iso(atual.data_inicio),
        data_fim: tem('data_fim') ? dataOk(e.data_fim) : iso(atual.data_fim),
        data_inicio_real: tem('data_inicio_real') ? dataOk(e.data_inicio_real) : iso(atual.data_inicio_real),
        data_fim_real: tem('data_fim_real') ? dataOk(e.data_fim_real) : iso(atual.data_fim_real)
    };
}

/** Mensagens das regras violadas pela linha, na ordem de verificação. */
function validarLinha(novo, tp, hoje) {
    const msgs = [];
    const err = (msg) => msgs.push(msg);
    if (!novo.descricao) err('A descrição da ação é obrigatória.');
    if (!STATUS_VALIDOS.includes(novo.status)) err('Situação inválida.');
    if (!PRIORIDADES.includes(novo.prioridade)) err('Prioridade inválida.');
    if (CAMPOS_DE_DATA.some(k => novo[k] === undefined)) err('Data em formato inválido.');
    if (novo.percentual != null && (novo.percentual < 0 || novo.percentual > 100)) err('% de execução deve estar entre 0 e 100.');
    if (tp != null && (tp < 0 || tp > LIMITE_TEMPO_PREVISTO)) err('Tempo previsto inválido.');
    if (novo.data_inicio && novo.data_fim && novo.data_fim < novo.data_inicio) err('Fim previsto anterior ao início previsto.');
    if (novo.data_inicio_real && novo.data_inicio_real > hoje) err('Início realizado não pode ser data futura.');
    if (novo.data_fim_real && novo.data_fim_real > hoje) err('Fim realizado não pode ser data futura.');
    if (novo.data_inicio_real && novo.data_fim_real && novo.data_fim_real < novo.data_inicio_real) err('Fim realizado anterior ao início realizado.');
    return msgs;
}

/** Analisa as linhas do lote: devolve os erros por item, os ajustes automáticos e o plano de gravação. */
function planejarLote(etapas, atuais, hoje) {
    const erros = [], ajustes = [], planejados = [];
    for (const e of etapas) {
        const atual = atuais.get(toInt(e.id_item));
        const novo = montarProposta(e, atual);
        const tp = (e.tempo_previsto === '' || e.tempo_previsto == null) ? null : toInt(e.tempo_previsto);
        const mensagens = validarLinha(novo, tp, hoje);
        if (novo.data_fim_real && novo.status !== ST.FECHADO && !ehFechado(atual.status)) {
            // informar a data de conclusão implica fechar
            novo.status = ST.FECHADO;
            ajustes.push({ id_item: atual.id_item, msg: 'Fim realizado informado: item fechado automaticamente.' });
        }
        let equipeNova = null;
        if (Array.isArray(e.equipe)) {
            equipeNova = new Set(e.equipe.map(toInt).filter(Boolean));
            if (equipeNova.size > LIMITE_EQUIPE) mensagens.push(`Equipe excede o limite de ${LIMITE_EQUIPE} pessoas.`);
        }
        mensagens.forEach(erro => erros.push({ id_item: atual.id_item, descricao: atual.descricao, erro }));
        planejados.push({ atual, novo, tp, equipeNova });
    }
    return { erros, ajustes, planejados };
}

/** Regras automáticas de situação: repactuação de prazo, atraso, cronômetro, fechamento e reabertura. */
function aplicarRegras(atual, novo, hoje, ajustes) {
    const stAnt = normStatus(atual.status);
    let dtIni = atual.dt_inicio_andamento || null;
    let dtFech = atual.dt_fechamento || null;
    let tempoGasto = atual.tempo_gasto != null ? atual.tempo_gasto : null;

    // Regra: atraso automático deixa de valer quando o prazo é repactuado para hoje ou depois
    if (novo.status === ST.ATRASADO && stAnt === ST.ATRASADO && (!novo.data_fim || novo.data_fim >= hoje)
        && novo.data_fim !== iso(atual.data_fim)) {
        novo.status = (dtIni || novo.data_inicio_real) ? ST.ANDAMENTO : ST.A_INICIAR;
        ajustes.push({ id_item: atual.id_item, msg: `Prazo repactuado: situação ajustada para "${novo.status}".` });
    }
    // Regra: prazo vencido e não fechado => Atrasado
    if ((novo.status === ST.A_INICIAR || novo.status === ST.ANDAMENTO) && novo.data_fim && novo.data_fim < hoje) {
        novo.status = ST.ATRASADO;
        ajustes.push({ id_item: atual.id_item, msg: 'Prazo previsto vencido: situação ajustada para "Atrasado".' });
    }
    // Regra: entrar em execução liga o cronômetro e registra o início realizado
    if (novo.status === ST.ANDAMENTO || (novo.status === ST.ATRASADO && novo.data_inicio_real)) {
        if (!dtIni) dtIni = dominio.agoraBR();
        if (!novo.data_inicio_real) novo.data_inicio_real = hoje;
    }
    // Regra: fechamento para o cronômetro, calcula o tempo e completa datas
    if (novo.status === ST.FECHADO && stAnt !== ST.FECHADO) {
        dtFech = dominio.agoraBR();
        if (dtIni) tempoGasto = dominio.minutosUteis(new Date(dtIni), dtFech);
        else if (atual.horas_trabalhadas) tempoGasto = atual.horas_trabalhadas;
        if (!novo.data_fim_real) novo.data_fim_real = hoje;
        if (!novo.data_inicio_real) novo.data_inicio_real = dtIni ? iso(dtIni) : novo.data_fim_real;
        if (novo.data_inicio_real > novo.data_fim_real) novo.data_inicio_real = novo.data_fim_real;
        novo.percentual = 100;
    }
    // Regra: reabertura limpa o fechamento
    if (novo.status !== ST.FECHADO && stAnt === ST.FECHADO) {
        dtFech = null;
        novo.data_fim_real = null;
        if (novo.percentual === 100) novo.percentual = 90;
        ajustes.push({ id_item: atual.id_item, msg: 'Item reaberto: fim realizado removido.' });
    }
    return { stAnt, dtIni, dtFech, tempoGasto };
}

/** Auditoria campo a campo: registra no histórico o que mudou. */
async function auditarMudancas(R, idPlano, atual, stAnt, novo, eu) {
    const antigo = { ...atual, status: stAnt, data_inicio: iso(atual.data_inicio), data_fim: iso(atual.data_fim),
        data_inicio_real: iso(atual.data_inicio_real), data_fim_real: iso(atual.data_fim_real), prioridade: atual.prioridade || PRIORIDADE_PADRAO };
    for (const k of Object.keys(CAMPOS_AUDITADOS)) {
        const a = antigo[k] == null ? null : String(antigo[k]);
        const n = novo[k] == null ? null : String(novo[k]);
        if (a !== n) await repositorio.registrar(R, { id_plano: idPlano, id_item: atual.id_item, acao: 'ALTERACAO', campo: k, de: a, para: n, id_usuario: eu });
    }
}

/** Equipe (diferencial): remove quem saiu, inclui quem entrou e registra a troca. */
async function atualizarEquipe(R, idPlano, atual, equipeNova, equipeAtual, eu) {
    const ant = equipeAtual.get(atual.id_item) || new Set();
    const add = [...equipeNova].filter(x => !ant.has(x));
    const rem = [...ant].filter(x => !equipeNova.has(x));
    for (const u of rem) await repositorioItens.removerDaEquipe(R, atual.id_item, u);
    for (const u of add) await repositorioItens.incluirNaEquipe(R, atual.id_item, u);
    if (add.length || rem.length) await repositorio.registrar(R, { id_plano: idPlano, id_item: atual.id_item, acao: 'ALTERACAO', campo: 'equipe', de: [...ant].join(','), para: [...equipeNova].join(','), id_usuario: eu });
}

async function gravarLinha(R, idPlano, linha, contexto) {
    const { atual, novo, tp, equipeNova } = linha;
    const { hoje, ajustes, equipeAtual, eu } = contexto;
    const { stAnt, dtIni, dtFech, tempoGasto } = aplicarRegras(atual, novo, hoje, ajustes);
    await repositorioItens.atualizarItemDaGrade(R, {
        id: atual.id_item, ...novo, tempoPrevisto: tp, inicioAndamento: dtIni, fechamento: dtFech, tempoGasto
    });
    await auditarMudancas(R, idPlano, atual, stAnt, novo, eu);
    if (equipeNova) await atualizarEquipe(R, idPlano, atual, equipeNova, equipeAtual, eu);
}

/** Carrega os itens do lote e confere que existem e pertencem a um único plano; devolve { atuais, idPlano }. */
async function carregarItensDoLote(pool, etapas, idPlanoInformado) {
    const ids = [...new Set(etapas.map(e => toInt(e.id_item)).filter(Boolean))];
    if (ids.length !== etapas.length) throw httpErro(400, 'Itens inválidos no lote.');
    const atuais = await repositorioItens.buscarItensPorIds(pool, ids);
    if (atuais.size !== ids.length) throw httpErro(404, 'Um ou mais itens não existem mais. Recarregue o plano.');
    const planos = new Set([...atuais.values()].map(x => x.id_plano));
    const idPlano = toInt(idPlanoInformado) || [...planos][0];
    if (planos.size !== 1 || !planos.has(idPlano)) throw httpErro(400, 'Todos os itens devem pertencer ao mesmo plano.');
    return { atuais, idPlano };
}

/** Salva a grade. Devolve { ok, ajustes, status_plano } ou { invalido } com os erros por item (a rota responde 400). */
async function salvarGrade(req, b) {
    const etapas = Array.isArray(b.etapas) ? b.etapas : [];
    if (!etapas.length) return { ok: true, ajustes: [] };
    if (etapas.length > LIMITE_LOTE) throw httpErro(413, 'Lote muito grande.');

    const pool = await connectToDb();
    const { atuais, idPlano } = await carregarItensDoLote(pool, etapas, b.id_plano);
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);
    const equipeAtual = await repositorioItens.buscarEquipeDoPlano(pool, idPlano);

    const hoje = hojeISO();
    const { erros, ajustes, planejados } = planejarLote(etapas, atuais, hoje);
    if (erros.length) return { invalido: { erro: `${erros.length} item(ns) com dados inválidos.`, erros } };

    const contexto = { hoje, ajustes, equipeAtual, eu: idUser(req) };
    const statusPlano = await repositorio.emTransacao(pool, async (R) => {
        for (const linha of planejados) await gravarLinha(R, idPlano, linha, contexto);
        const status = await base.recalcularStatusPlano(R, idPlano);
        await repositorio.tocarPlano(R, idPlano);
        return status;
    });
    return { ok: true, ajustes, status_plano: statusPlano };
}

module.exports = { salvarGrade };
