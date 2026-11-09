/* Painel do Projeto: tudo deriva da resposta da API e dos filtros da URL. */
import { COR_SEM_PRODUTO, mapaDeCores, PALETA_PRODUTOS } from '@/shared/mapaUnidades';
import type { AtividadePainel, DadosPainelProjeto, MacroRegiao, MicroRegiao, TipoUnidade, UnidadePainel } from '@/features/painelProjeto/api';

export const PALETA_REGIOES = ['#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F', '#AD1457', '#5D4037', '#9C7A3C', '#283593', '#558B2F', '#0277BD'];
export const COR_SEM_REGIAO = '#90A4AE';
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_NO_GRAFICO = 12;
const TOP_UNIDADES = 10;

export type Visao = 'geral' | 'macro' | 'micro';
export type Agrupar = 'macro' | 'micro' | 'lista';

export interface FiltroPainel {
    visao: Visao;
    macro: string;
    micro: string;
    produto: string;
    tipo: string;
    de: string;
    ate: string;
    agrupar: Agrupar;
}

export const normalizar = (texto: unknown) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const fmtNum = (valor: number) => valor.toLocaleString('pt-BR');
export const dataBR = (iso?: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');

export function fmtHoras(minutos: number): string {
    const horas = Math.floor(minutos / 60);
    const resto = Math.round(minutos % 60);
    if (!horas) return `${resto}min`;
    return `${fmtNum(horas)}h${resto ? ` ${String(resto).padStart(2, '0')}min` : ''}`;
}

export function rotuloMes(anoMes: string): string {
    const [ano = '', mes = '1'] = anoMes.split('-');
    return `${MESES[Number(mes) - 1]}/${ano.slice(2)}`;
}

export interface ItemBarra {
    chave: string | number;
    nome: string;
    valor: number;
    cor?: string;
    titulo?: string;
}

export interface LinhaRegiao extends ItemBarra {
    alvo?: { macro?: number; micro?: number };
}

interface Acumulado { qtd: number; min: number; ultima: string | null }

export interface GrupoTabela {
    k: string;
    nome: string;
    sub: string;
    cor: string;
    ordem: number;
    alvo: { visao: Visao; macro: string; micro: string } | null;
    unidades: UnidadePainel[];
    qtd: number;
    min: number;
    atendidas: number;
    municipios: number;
    ultima: string | null;
}

const fimDe = (atividade: AtividadePainel) => atividade[2] ?? atividade[1];

function acumularPorUnidade(atividades: AtividadePainel[]): Map<number, Acumulado> {
    return atividades.reduce((mapa, atividade) => {
        const atual = mapa.get(atividade[0]) ?? { qtd: 0, min: 0, ultima: null };
        const fim = fimDe(atividade);
        return mapa.set(atividade[0], { qtd: atual.qtd + 1, min: atual.min + atividade[6], ultima: !atual.ultima || fim > atual.ultima ? fim : atual.ultima });
    }, new Map<number, Acumulado>());
}

function contarPor<T>(lista: T[], chave: (item: T) => string[]): Map<string, number> {
    return lista.flatMap(chave).reduce((mapa, item) => mapa.set(item, (mapa.get(item) ?? 0) + 1), new Map<string, number>());
}

export function montarRegioes(regioes: MacroRegiao[]) {
    const macros = new Map(regioes.map((macro, indice) => [macro.id_macro, { ...macro, corFinal: macro.cor || PALETA_REGIOES[indice % PALETA_REGIOES.length] || COR_SEM_REGIAO }]));
    const micros = new Map(regioes.flatMap((macro, indice) => macro.micros.map((micro, posicao): [number, MicroRegiao & { corFinal: string }] => [
        micro.id_micro,
        { ...micro, corFinal: micro.cor || PALETA_REGIOES[(indice * 3 + posicao + 1) % PALETA_REGIOES.length] || COR_SEM_REGIAO }
    ])));
    return { macros, micros };
}

export type Regioes = ReturnType<typeof montarRegioes>;

/** Cor da região conforme a visão: Geral e Macro usam a macro; Micro usa a micro. */
export function corDaRegiao({ macros, micros }: Regioes, visao: Visao, idMacro?: number | null, idMicro?: number | null): string {
    const corMacro = macros.get(idMacro ?? 0)?.corFinal;
    if (visao !== 'micro') return corMacro ?? COR_SEM_REGIAO;
    return micros.get(idMicro ?? 0)?.corFinal ?? corMacro ?? COR_SEM_REGIAO;
}

export function corDaMicro({ macros, micros }: Regioes, idMacro?: number | null, idMicro?: number | null): string {
    return micros.get(idMicro ?? 0)?.corFinal ?? macros.get(idMacro ?? 0)?.corFinal ?? COR_SEM_REGIAO;
}

/** Distribuição um nível abaixo da visão atual: macro no Geral, micro na Macro, município na Micro. */
function distribuirPorRegiao(unidades: UnidadePainel[], porUnidade: Map<number, Acumulado>, regioes: Regioes, visao: Visao): LinhaRegiao[] {
    const destino = (unidade: UnidadePainel): LinhaRegiao => {
        if (visao === 'geral') {
            const macro = regioes.macros.get(unidade.id_macro ?? 0);
            return macro ? { chave: `ma${macro.id_macro}`, nome: macro.nome_macro, cor: macro.corFinal, valor: 0, alvo: { macro: macro.id_macro } } : { chave: 'sem', nome: 'Sem região', cor: COR_SEM_REGIAO, valor: 0 };
        }
        if (visao === 'macro') {
            const micro = regioes.micros.get(unidade.id_micro ?? 0);
            return micro ? { chave: `mi${micro.id_micro}`, nome: micro.nome_micro, cor: micro.corFinal, valor: 0, alvo: { micro: micro.id_micro } } : { chave: 'sem', nome: 'Sem micro região', cor: COR_SEM_REGIAO, valor: 0 };
        }
        return { chave: `c${unidade.id_cidade}`, nome: unidade.nome_cidade || 'Sem município', cor: corDaRegiao(regioes, visao, unidade.id_macro, unidade.id_micro), valor: 0 };
    };
    const mapa = unidades.reduce((acumulado, unidade) => {
        const base = destino(unidade);
        const atual = acumulado.get(base.chave) ?? { ...base, unidades: 0, min: 0 };
        const dados = porUnidade.get(unidade.id_unidade);
        return acumulado.set(base.chave, { ...atual, valor: atual.valor + (dados?.qtd ?? 0), min: atual.min + (dados?.min ?? 0), unidades: atual.unidades + 1 });
    }, new Map<string | number, LinhaRegiao & { unidades: number; min: number }>());
    return [...mapa.values()]
        .sort((a, b) => b.valor - a.valor || b.unidades - a.unidades)
        .map((linha) => ({ ...linha, titulo: `${linha.nome}: ${linha.valor} atividade(s) · ${linha.unidades} unidade(s) · ${fmtHoras(linha.min)}` }));
}

function grupoDaUnidade(unidade: UnidadePainel, agrupar: Agrupar, regioes: Regioes, ordemMacro: Map<number, number>, ordemMicro: Map<number, number>): Pick<GrupoTabela, 'k' | 'nome' | 'sub' | 'cor' | 'ordem' | 'alvo'> {
    const macro = regioes.macros.get(unidade.id_macro ?? 0);
    const micro = regioes.micros.get(unidade.id_micro ?? 0);
    if (agrupar === 'lista') return { k: 'todas', nome: 'Todas as unidades', sub: '', cor: '#2e7d32', ordem: 0, alvo: null };
    if (agrupar === 'macro') {
        if (!macro) return { k: 'sem', nome: 'Sem macro região', sub: '', cor: COR_SEM_REGIAO, ordem: Number.MAX_SAFE_INTEGER, alvo: null };
        return { k: `ma${macro.id_macro}`, nome: macro.nome_macro, sub: '', cor: macro.corFinal, ordem: ordemMacro.get(macro.id_macro) ?? 0, alvo: { visao: 'macro', macro: String(macro.id_macro), micro: '' } };
    }
    if (micro) return { k: `mi${micro.id_micro}`, nome: micro.nome_micro, sub: macro?.nome_macro ?? '', cor: micro.corFinal, ordem: ordemMicro.get(micro.id_micro) ?? 0, alvo: { visao: 'micro', macro: String(micro.id_macro), micro: String(micro.id_micro) } };
    return { k: macro ? `ma${macro.id_macro}-sem` : 'sem', nome: 'Sem micro região', sub: macro?.nome_macro ?? 'Sem macro região', cor: COR_SEM_REGIAO, ordem: Number.MAX_SAFE_INTEGER, alvo: null };
}

function agruparTabela(unidades: UnidadePainel[], porUnidade: Map<number, Acumulado>, agrupar: Agrupar, lista: MacroRegiao[], regioes: Regioes): GrupoTabela[] {
    const ordemMacro = new Map(lista.map((macro, indice) => [macro.id_macro, indice]));
    const ordemMicro = new Map(lista.flatMap((macro, indice) => macro.micros.map((micro, posicao): [number, number] => [micro.id_micro, indice * 1000 + posicao])));
    const mapa = new Map<string, GrupoTabela & { cidades: Set<number> }>();
    unidades.forEach((unidade) => {
        const base = grupoDaUnidade(unidade, agrupar, regioes, ordemMacro, ordemMicro);
        const atual = mapa.get(base.k) ?? { ...base, unidades: [], qtd: 0, min: 0, atendidas: 0, municipios: 0, ultima: null, cidades: new Set<number>() };
        const dados = porUnidade.get(unidade.id_unidade);
        mapa.set(base.k, {
            ...atual,
            unidades: [...atual.unidades, unidade],
            qtd: atual.qtd + (dados?.qtd ?? 0),
            min: atual.min + (dados?.min ?? 0),
            atendidas: atual.atendidas + (dados ? 1 : 0),
            ultima: dados?.ultima && (!atual.ultima || dados.ultima > atual.ultima) ? dados.ultima : atual.ultima,
            cidades: unidade.id_cidade ? new Set([...atual.cidades, unidade.id_cidade]) : atual.cidades
        });
    });
    const nomeMicro = (unidade: UnidadePainel) => regioes.micros.get(unidade.id_micro ?? 0)?.nome_micro ?? '~';
    const comparar = (a: UnidadePainel, b: UnidadePainel) => (agrupar === 'macro' ? nomeMicro(a).localeCompare(nomeMicro(b), 'pt-BR') : 0)
        || String(a.nome_cidade ?? '').localeCompare(String(b.nome_cidade ?? ''), 'pt-BR')
        || a.nome_unidade.localeCompare(b.nome_unidade, 'pt-BR');
    return [...mapa.values()]
        .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR'))
        .map(({ cidades, ...grupo }) => ({ ...grupo, municipios: cidades.size, unidades: [...grupo.unidades].sort(comparar) }));
}

export function consolidarPainel(dados: DadosPainelProjeto, filtro: FiltroPainel) {
    const regioes = montarRegioes(dados.regioes);
    const coresProduto = mapaDeCores(dados.produtos) as Record<number, string>;
    const corProduto = (id: number) => coresProduto[id] ?? COR_SEM_PRODUTO;
    const macroAtual = filtro.macro ? regioes.macros.get(Number(filtro.macro)) : undefined;
    const microAtual = filtro.micro ? regioes.micros.get(Number(filtro.micro)) : undefined;
    const produtoAtual = dados.produtos.find((produto) => String(produto.id_produto) === filtro.produto);
    const tipoPorId = new Map(dados.tipos.map((tipo): [number, TipoUnidade] => [tipo.id_tipo_unidade, tipo]));
    const tipoAtual = filtro.tipo ? tipoPorId.get(Number(filtro.tipo)) : undefined;
    const temProduto = (unidade: UnidadePainel) => !produtoAtual || unidade.produtos.includes(produtoAtual.id_produto);

    const unidadesEscopo = dados.unidades.filter((unidade) => (filtro.visao === 'geral' || !filtro.macro || String(unidade.id_macro) === filtro.macro)
        && (filtro.visao !== 'micro' || !filtro.micro || String(unidade.id_micro) === filtro.micro));
    const unidadesFiltro = unidadesEscopo.filter((unidade) => temProduto(unidade) && (!filtro.tipo || String(unidade.id_tipo_unidade) === filtro.tipo));
    const idsFiltro = new Set(unidadesFiltro.map((unidade) => unidade.id_unidade));
    const nomeProduto = produtoAtual ? normalizar(produtoAtual.nome_produto) : null;

    const atividades = dados.atividades.filter((atividade) => idsFiltro.has(atividade[0])
        && (!filtro.de || fimDe(atividade) >= filtro.de)
        && (!filtro.ate || atividade[1] <= filtro.ate)
        && (!nomeProduto || atividade[5].some((nome) => normalizar(nome) === nomeProduto)));
    const porUnidade = acumularPorUnidade(atividades);

    const implantacao = atividades.filter((atividade) => atividade[3] === 0).length;
    const kpi = {
        atividades: atividades.length,
        implantacao,
        projetos: atividades.length - implantacao,
        minutos: atividades.reduce((soma, atividade) => soma + atividade[6], 0),
        semHoras: atividades.filter((atividade) => !atividade[6]).length,
        ultima: atividades.reduce((ultima, atividade) => (fimDe(atividade) > ultima ? fimDe(atividade) : ultima), ''),
        unidades: unidadesFiltro.length,
        atendidas: unidadesFiltro.filter((unidade) => porUnidade.has(unidade.id_unidade)).length,
        municipios: new Set(unidadesFiltro.map((unidade) => unidade.id_cidade).filter(Boolean)).size
    };

    const meses = atividades.reduce((mapa, atividade) => {
        const mes = atividade[1]?.slice(0, 7);
        if (!mes) return mapa;
        const atual = mapa.get(mes) ?? { mes, qtd: 0, min: 0 };
        return mapa.set(mes, { mes, qtd: atual.qtd + 1, min: atual.min + atividade[6] });
    }, new Map<string, { mes: string; qtd: number; min: number }>());
    const serieMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-MESES_NO_GRAFICO);

    const porMotivo: ItemBarra[] = [...contarPor(atividades, (atividade) => (atividade[4].length ? atividade[4] : ['Não informado'])).entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([nome, valor], indice) => ({ chave: nome, nome, valor, cor: PALETA_PRODUTOS[indice % PALETA_PRODUTOS.length] }));

    const topUnidades = unidadesFiltro
        .map((unidade) => ({ chave: unidade.id_unidade, nome: unidade.nome_unidade, valor: porUnidade.get(unidade.id_unidade)?.qtd ?? 0, cor: corDaRegiao(regioes, filtro.visao, unidade.id_macro, unidade.id_micro), unidade }))
        .filter((item) => item.valor > 0)
        .sort((a, b) => b.valor - a.valor)
        .slice(0, TOP_UNIDADES);

    const resumoProdutos = dados.produtos
        .map((produto) => ({ ...produto, unidades: unidadesEscopo.filter((unidade) => unidade.produtos.includes(produto.id_produto)).length }))
        .filter((produto) => produto.unidades > 0)
        .sort((a, b) => b.unidades - a.unidades);

    const contagemTipos = contarPor(unidadesEscopo.filter(temProduto), (unidade) => [String(unidade.id_tipo_unidade ?? 0)]);
    const resumoTipos = [
        ...dados.tipos.map((tipo) => ({ ...tipo, qtd: contagemTipos.get(String(tipo.id_tipo_unidade)) ?? 0 })),
        { id_tipo_unidade: 0, sigla: '?', nome_tipo: 'Sem tipo', qtd: contagemTipos.get('0') ?? 0 }
    ].filter((tipo) => tipo.qtd > 0);

    const tituloMacro = macroAtual?.nome_macro ? `${macroAtual.nome_macro} · ` : '';
    let tituloEscopo = 'Todas as regiões';
    if (filtro.visao === 'macro') tituloEscopo = macroAtual?.nome_macro ?? 'Selecione a macro região';
    if (filtro.visao === 'micro') tituloEscopo = microAtual ? `${tituloMacro}${microAtual.nome_micro}` : 'Selecione a micro região';

    return {
        regioes, corProduto, macroAtual, microAtual, produtoAtual, tipoAtual, tipoPorId, unidadesEscopo, unidadesFiltro, porUnidade, kpi, serieMes, porMotivo, topUnidades, resumoProdutos, resumoTipos, tituloEscopo,
        porRegiao: distribuirPorRegiao(unidadesFiltro, porUnidade, regioes, filtro.visao),
        gruposTabela: agruparTabela(unidadesFiltro, porUnidade, filtro.agrupar, dados.regioes, regioes),
        siglaDe: (unidade: UnidadePainel) => tipoPorId.get(unidade.id_tipo_unidade ?? 0)?.sigla ?? '?'
    };
}

export type ConsolidadoPainel = ReturnType<typeof consolidarPainel>;
