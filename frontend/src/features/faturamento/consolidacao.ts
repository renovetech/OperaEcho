/* Cálculos do Faturamento Consolidado: tudo deriva da resposta da API e da métrica ativa. */
import type { DadosPainel } from '@/features/faturamento/api';
import { fmtNum } from '@/features/sigtap/formatos';

export type Metrica = 'vl' | 'qt';
type PorCompetencia = Record<string, number>;

/** Paleta categórica de ordem fixa, nunca reciclada; "Outros" fica em cinza. */
export const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const COR_OUTROS = '#a8a79f';
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const LIMITE_COMPETENCIAS = 120;
const PROPORCAO_SEM_VALOR = 0.5;
const MESES_DA_MEDIA = 3;
const QTD_FOCO = 6;

export const rotComp = (competencia?: string) => (/^\d{6}$/.test(competencia ?? '') ? `${MESES[Number(competencia?.slice(4)) - 1]}/${competencia?.slice(2, 4)}` : '-');

function proximaCompetencia(competencia: string): string {
    const ano = Number(competencia.slice(0, 4));
    const mes = Number(competencia.slice(4)) + 1;
    return mes > 12 ? `${ano + 1}01` : `${ano}${String(mes).padStart(2, '0')}`;
}

function faixaDeCompetencias(inicio: string, fim: string): string[] {
    const faixa: string[] = [];
    for (let atual = inicio; atual <= fim && faixa.length < LIMITE_COMPETENCIAS; atual = proximaCompetencia(atual)) faixa.push(atual);
    return faixa;
}

export const varPerc = (atual: number, anterior: number | null | undefined) => (anterior ? (atual - anterior) / anterior : null);

export const fmtVar = (valor?: number | null) => (valor === null || valor === undefined
    ? '-'
    : `${valor > 0 ? '+' : ''}${(valor * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);

export const fmtPart = (valor: number) => `${(valor * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export function moedaCurta(valor: number): string {
    const absoluto = Math.abs(valor);
    if (absoluto >= 1e6) return `R$ ${(valor / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (absoluto >= 1e3) return `R$ ${(valor / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

export const numCurto = (valor: number) => (Math.abs(valor) >= 1e3 ? `${(valor / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtNum(valor));
export const comSinal = (valor: number, formatar: (v: number) => string) => `${valor > 0 ? '+' : ''}${formatar(valor)}`;

/** Mais da metade da quantidade sem valor SIGTAP é Atenção Primária: abre em quantidade. Com AIH, sempre em valor. */
export function metricaSugerida(dados: DadosPainel): Metrica {
    if (dados.mensal.some((mes) => (mes.qt_aih ?? 0) > 0)) return 'vl';
    const total = dados.procedimentos.reduce((soma, item) => soma + item.qt, 0);
    const semValor = dados.procedimentos.filter((item) => !item.vl).reduce((soma, item) => soma + item.qt, 0);
    return total && semValor / total > PROPORCAO_SEM_VALOR ? 'qt' : 'vl';
}

export interface ProcedimentoConsolidado {
    cod: string;
    nome: string;
    grupo: string;
    vl: PorCompetencia;
    qt: PorCompetencia;
    v: PorCompetencia;
    totalVl: number;
    totalQt: number;
    total: number;
    part: number;
    varUlt: number;
    varPeriodo: number | null;
    meses: number;
}

export interface UnidadeConsolidada {
    id: number;
    nome: string;
    projeto: string;
    v: PorCompetencia;
    vl: PorCompetencia;
    qt: PorCompetencia;
    total: number;
}

function montarProcedimentos(dados: DadosPainel, metrica: Metrica, comps: string[], total: number, ultima: string, penultima: string | undefined, primeira: string): ProcedimentoConsolidado[] {
    const mapa = new Map<string, { nome: string; vl: PorCompetencia; qt: PorCompetencia; totalVl: number; totalQt: number }>();
    dados.procedimentos.forEach((item) => {
        const atual = mapa.get(item.co_procedimento) ?? { nome: 'Não encontrado na SIGTAP', vl: {}, qt: {}, totalVl: 0, totalQt: 0 };
        mapa.set(item.co_procedimento, {
            nome: item.no_procedimento || atual.nome,
            vl: { ...atual.vl, [item.competencia]: (atual.vl[item.competencia] ?? 0) + item.vl },
            qt: { ...atual.qt, [item.competencia]: (atual.qt[item.competencia] ?? 0) + item.qt },
            totalVl: atual.totalVl + item.vl,
            totalQt: atual.totalQt + item.qt
        });
    });
    return [...mapa.entries()].map(([cod, item]) => {
        const v = metrica === 'vl' ? item.vl : item.qt;
        const totalItem = metrica === 'vl' ? item.totalVl : item.totalQt;
        return {
            ...item, cod, v,
            grupo: cod.slice(0, 4),
            total: totalItem,
            part: total ? totalItem / total : 0,
            varUlt: penultima ? (v[ultima] ?? 0) - (v[penultima] ?? 0) : 0,
            varPeriodo: varPerc(v[ultima] ?? 0, v[primeira] ?? 0),
            meses: comps.filter((competencia) => (item.qt[competencia] ?? 0) > 0).length
        };
    });
}

function montarGrupos(dados: DadosPainel, procedimentos: ProcedimentoConsolidado[], comps: string[]) {
    const mapa = new Map<string, { cod: string; nome: string; v: PorCompetencia; total: number }>();
    procedimentos.forEach((item) => {
        const atual = mapa.get(item.grupo) ?? { cod: item.grupo, nome: dados.subgrupos[item.grupo] ?? 'Subgrupo não identificado', v: {}, total: 0 };
        mapa.set(item.grupo, {
            ...atual,
            total: atual.total + item.total,
            v: Object.fromEntries(comps.map((competencia) => [competencia, (atual.v[competencia] ?? 0) + (item.v[competencia] ?? 0)]))
        });
    });
    const ordenados = [...mapa.values()].filter((grupo) => grupo.total > 0).sort((a, b) => b.total - a.total);
    const principais = ordenados.slice(0, ordenados.length > CORES.length ? CORES.length - 1 : CORES.length);
    const outros = ordenados.slice(principais.length);
    // Cor pela ordem do código, não do ranking: não repinta ao trocar o filtro.
    const corGrupo: Record<string, string> = Object.fromEntries([...principais].sort((a, b) => a.cod.localeCompare(b.cod)).map((grupo, indice) => [grupo.cod, CORES[indice] ?? COR_OUTROS]));
    const serieGrupos = comps.map((competencia) => ({
        rot: rotComp(competencia),
        ...Object.fromEntries(principais.map((grupo) => [grupo.cod, grupo.v[competencia] ?? 0])),
        ...(outros.length > 0 && { outros: outros.reduce((soma, grupo) => soma + (grupo.v[competencia] ?? 0), 0) })
    }));
    return { gruposOrd: ordenados, topGrupos: principais, outros, corGrupo, serieGrupos };
}

function montarUnidades(dados: DadosPainel, metrica: Metrica): UnidadeConsolidada[] {
    const mapa = new Map<number, UnidadeConsolidada>();
    dados.unidades.forEach((item) => {
        const atual = mapa.get(item.id_unidade) ?? { id: item.id_unidade, nome: item.nome_unidade, projeto: item.nome_projeto, v: {}, vl: {}, qt: {}, total: 0 };
        const valor = metrica === 'vl' ? item.vl : item.qt;
        mapa.set(item.id_unidade, {
            ...atual,
            v: { ...atual.v, [item.competencia]: valor },
            vl: { ...atual.vl, [item.competencia]: item.vl },
            qt: { ...atual.qt, [item.competencia]: item.qt },
            total: atual.total + valor
        });
    });
    return [...mapa.values()].sort((a, b) => b.total - a.total);
}

function montarCbos(dados: DadosPainel, metrica: Metrica) {
    const mapa = new Map<string, { cod: string; nome: string; v: PorCompetencia; totalVl: number; totalQt: number; total: number }>();
    dados.cbos.forEach((item) => {
        const atual = mapa.get(item.co_cbo) ?? { cod: item.co_cbo, nome: dados.ocupacoes[item.co_cbo] ?? `CBO ${item.co_cbo}`, v: {}, totalVl: 0, totalQt: 0, total: 0 };
        const valor = metrica === 'vl' ? item.vl : item.qt;
        mapa.set(item.co_cbo, {
            ...atual,
            v: { ...atual.v, [item.competencia]: (atual.v[item.competencia] ?? 0) + valor },
            totalVl: atual.totalVl + item.vl,
            totalQt: atual.totalQt + item.qt,
            total: atual.total + valor
        });
    });
    return [...mapa.values()].filter((item) => item.total > 0).sort((a, b) => b.total - a.total);
}

export function consolidar(dados: DadosPainel, metrica: Metrica) {
    const inicio = dados.mensal[0]?.competencia;
    const fim = dados.mensal[dados.mensal.length - 1]?.competencia;
    if (!inicio || !fim) return null;
    const comps = faixaDeCompetencias(inicio, fim);
    const porComp = new Map(dados.mensal.map((mes) => [mes.competencia, mes]));
    const primeira = inicio;
    const ultima = comps[comps.length - 1] ?? fim;
    const penultima = comps[comps.length - 2];
    const valorDe = (mes?: { vl_total: number; qt_total: number }) => (metrica === 'vl' ? mes?.vl_total : mes?.qt_total) ?? 0;

    const serie = comps.reduce<{ c: string; rot: string; vl: number; qt: number; v: number; acum: number; sem: boolean; uni: number; pac: number; aih: number; varV: number | null; varP: number | null }[]>((lista, c, indice) => {
        const mes = porComp.get(c);
        const v = valorDe(mes);
        const anterior = indice > 0 ? comps[indice - 1] : undefined;
        const vAnterior = anterior ? valorDe(porComp.get(anterior)) : null;
        return [...lista, {
            c, v,
            rot: rotComp(c),
            vl: mes?.vl_total ?? 0,
            qt: mes?.qt_total ?? 0,
            acum: (lista[lista.length - 1]?.acum ?? 0) + v,
            sem: !mes,
            uni: mes?.qt_unidades ?? 0,
            pac: mes?.qt_pacientes ?? 0,
            aih: mes?.qt_aih ?? 0,
            varV: vAnterior === null ? null : v - vAnterior,
            varP: vAnterior === null ? null : varPerc(v, vAnterior)
        }];
    }, []);

    const total = serie.reduce((soma, item) => soma + item.v, 0);
    const listaProcs = montarProcedimentos(dados, metrica, comps, total, ultima, penultima, primeira);
    const listaUnis = montarUnidades(dados, metrica);
    const comDados = serie.filter((item) => !item.sem);
    const primeiroMes = comDados[0] ?? serie[0];
    const ult = serie[serie.length - 1];
    if (!primeiroMes || !ult) return null;
    const anteriores = comDados.filter((item) => item.c < ultima).slice(-MESES_DA_MEDIA);
    const media3 = anteriores.length ? anteriores.reduce((soma, item) => soma + item.v, 0) / anteriores.length : null;

    return {
        comps, serie, listaProcs, listaUnis, total, ult, ultima, penultima, primeira,
        ...montarGrupos(dados, listaProcs, comps),
        maxCelula: Math.max(1, ...listaUnis.flatMap((unidade) => Object.values(unidade.v))),
        listaCbos: montarCbos(dados, metrica),
        totalVl: serie.reduce((soma, item) => soma + item.vl, 0),
        totalQt: serie.reduce((soma, item) => soma + item.qt, 0),
        maior: comDados.reduce((a, b) => (b.v > a.v ? b : a), primeiroMes),
        menor: comDados.reduce((a, b) => (b.v < a.v ? b : a), primeiroMes),
        nMeses: comDados.length,
        media: comDados.length ? total / comDados.length : 0,
        crescimento: varPerc(ult.v, serie[0]?.v),
        vsMedia: media3 ? varPerc(ult.v, media3) : null,
        quedas: penultima ? listaProcs.filter((item) => item.varUlt < 0).sort((a, b) => a.varUlt - b.varUlt).slice(0, QTD_FOCO) : [],
        altas: penultima ? listaProcs.filter((item) => item.varUlt > 0).sort((a, b) => b.varUlt - a.varUlt).slice(0, QTD_FOCO) : [],
        pararam: penultima ? listaProcs.filter((item) => (item.qt[penultima] ?? 0) > 0 && !(item.qt[ultima] ?? 0)).sort((a, b) => (b.v[penultima] ?? 0) - (a.v[penultima] ?? 0)) : [],
        novos: penultima ? listaProcs.filter((item) => !(item.qt[penultima] ?? 0) && (item.qt[ultima] ?? 0) > 0) : [],
        semEnvio: listaUnis.filter((unidade) => unidade.qt[ultima] === undefined),
        pacientes: comDados.reduce((soma, item) => soma + item.pac, 0),
        internacoes: comDados.reduce((soma, item) => soma + item.aih, 0)
    };
}

export type Consolidado = NonNullable<ReturnType<typeof consolidar>>;
