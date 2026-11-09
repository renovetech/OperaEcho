/* Classificação e agregações do tempo médio de ação, feitas no Node sobre os itens lidos do banco. */
const repositorio = require('./relatorios.tempoMedio.repository');

// Tolerância de 10% entre o previsto e o gasto para considerar o item "na média".
const TOLERANCIA = 0.10;
const SEM_DADOS = 'SEM DADOS';
const ESTOURADO = 'ESTOURADO';
const LEGAL = 'LEGAL';
const NA_MEDIA = 'NA MEDIA';

function classificar(previsto, gasto) {
    if (!previsto || previsto <= 0 || !gasto || gasto <= 0) return SEM_DADOS;
    const razao = gasto / previsto;
    if (razao > 1 + TOLERANCIA) return ESTOURADO;
    if (razao < 1 - TOLERANCIA) return LEGAL;
    return NA_MEDIA;
}

const soma = (lista, campo) => lista.reduce((s, x) => s + (x[campo] || 0), 0);
const media = (lista, campo) => (lista.length ? Math.round(soma(lista, campo) / lista.length) : 0);
const contar = (lista, classificacao) => lista.filter((x) => x.classificacao === classificacao).length;

function agrupar(lista, chave) {
    const grupos = {};
    lista.forEach((i) => {
        const k = i[chave] || (chave === 'responsavel' ? '(Sem responsável)' : '(Sem descrição)');
        (grupos[k] = grupos[k] || []).push(i);
    });
    return grupos;
}

function porResponsavel(comDados) {
    return Object.entries(agrupar(comDados, 'responsavel')).map(([responsavel, arr]) => ({
        responsavel,
        qtd: arr.length,
        previsto_total: soma(arr, 'previsto_min'),
        gasto_total: soma(arr, 'gasto_min'),
        media_previsto: media(arr, 'previsto_min'),
        media_gasto: media(arr, 'gasto_min'),
        media_desvio: media(arr, 'desvio_min'),
        estourados: contar(arr, ESTOURADO)
    })).sort((a, b) => b.media_desvio - a.media_desvio);
}

function porAcao(comDados) {
    return Object.entries(agrupar(comDados, 'descricao')).map(([descricao, arr]) => ({
        descricao,
        qtd: arr.length,
        media_previsto: media(arr, 'previsto_min'),
        media_gasto: media(arr, 'gasto_min'),
        media_desvio: media(arr, 'desvio_min'),
        estourados: contar(arr, ESTOURADO)
    })).sort((a, b) => b.media_gasto - a.media_gasto);
}

function resumir(itens, comDados) {
    const estourado = comDados.filter((i) => i.classificacao === ESTOURADO);
    const naMedia = comDados.filter((i) => i.classificacao === NA_MEDIA);
    const legal = comDados.filter((i) => i.classificacao === LEGAL);
    return {
        total_itens: itens.length,
        com_dados: comDados.length,
        sem_dados: itens.length - comDados.length,
        previsto_total: soma(comDados, 'previsto_min'),
        gasto_total: soma(comDados, 'gasto_min'),
        media_previsto: media(comDados, 'previsto_min'),
        media_gasto: media(comDados, 'gasto_min'),
        media_desvio: media(comDados, 'desvio_min'),
        qtd_estourado: estourado.length,
        qtd_na_media: naMedia.length,
        qtd_legal: legal.length,
        media_tempo_estourado: media(estourado, 'gasto_min'),
        media_tempo_na_media: media(naMedia, 'gasto_min'),
        media_tempo_legal: media(legal, 'gasto_min')
    };
}

async function tempoMedioDeAcao(req, filtros) {
    const linhas = await repositorio.itensComTempo(req, filtros);
    const itens = linhas.map((l) => ({
        ...l,
        desvio_min: (l.gasto_min || 0) - (l.previsto_min || 0),
        classificacao: classificar(l.previsto_min, l.gasto_min)
    }));
    const comDados = itens.filter((i) => i.classificacao !== SEM_DADOS);
    return { itens, porResponsavel: porResponsavel(comDados), porAcao: porAcao(comDados), resumo: resumir(itens, comDados) };
}

module.exports = { tempoMedioDeAcao };
