import api from '@/shared/api';

export interface Competencia {
    competencia: string;
    qt_procedimentos: number;
    data_importacao?: string;
    usuario?: string;
}

export interface ItemCodigo {
    codigo: string;
    nome: string;
}

export interface MetaFiltros {
    grupos: ItemCodigo[];
    subgrupos: ItemCodigo[];
    formas: ItemCodigo[];
    financiamentos: ItemCodigo[];
    registros: ItemCodigo[];
    modalidades: ItemCodigo[];
}

export interface ProcedimentoLista {
    co_procedimento: string;
    no_procedimento: string;
    no_financiamento?: string;
    tp_complexidade: number | string;
    registros?: string;
    vl_sa?: number;
    vl_sh?: number;
    vl_sp?: number;
}

export interface Pagina<T> {
    itens: T[];
    total: number;
    tamanho: number;
}

export interface CidProcedimento extends ItemCodigo { principal: string }
export interface ServicoProcedimento { servico: string; nome_servico: string; classificacao: string; nome_classificacao: string }
export interface HabilitacaoProcedimento extends ItemCodigo { grupo?: string; nome_grupo?: string; descricao_grupo?: string }
export interface IncrementoProcedimento extends ItemCodigo { sh: number; sa: number; sp: number }
export interface RedeProcedimento extends ItemCodigo { rede: string }
export interface SiaSihProcedimento extends ItemCodigo { tipo: string }
export interface RegraProcedimento extends ItemCodigo { descricao?: string }
export interface DetalheProcedimentoItem extends ItemCodigo { descricao?: string }
export interface CompatItem extends ItemCodigo { reg_principal: string; reg_compativel: string; tipo: number; quantidade?: number }
export interface CompatExcecao {
    restricao: string; nome_restricao: string; principal: string; nome_principal: string; reg_principal: string;
    compativel: string; nome_compativel: string; reg_compativel: string; tipo: number;
}

export interface HistoricoProcedimento {
    competencia: string;
    no_procedimento: string;
    vl_sa: number;
    vl_sh: number;
    vl_sp: number;
    tp_complexidade: number;
    qt_maxima_execucao: number;
    vl_idade_minima: number;
    vl_idade_maxima: number;
}

export interface FichaProcedimentoDados {
    procedimento: {
        no_procedimento: string; no_grupo: string; no_sub_grupo: string; no_forma_organizacao: string;
        ds_procedimento?: string; tp_complexidade: number; no_financiamento?: string; no_rubrica?: string; tp_sexo: string;
        qt_maxima_execucao: number; vl_idade_minima: number; vl_idade_maxima: number; qt_dias_permanencia: number; qt_tempo_permanencia: number;
        qt_pontos?: number; vl_sa: number; vl_sh: number; vl_sp: number;
    };
    nomesRegistro?: Record<string, string>;
    modalidades: ItemCodigo[];
    registros: ItemCodigo[];
    detalhes: DetalheProcedimentoItem[];
    cids: CidProcedimento[];
    cbos: ItemCodigo[];
    compatibilidades: { comoPrincipal: CompatItem[]; comoSecundario: CompatItem[]; excecoes: CompatExcecao[] };
    servicos: ServicoProcedimento[];
    habilitacoes: HabilitacaoProcedimento[];
    incrementos: IncrementoProcedimento[];
    leitos: ItemCodigo[];
    redes: RedeProcedimento[];
    origens: ItemCodigo[];
    siaSih: SiaSihProcedimento[];
    regras: RegraProcedimento[];
    renases: ItemCodigo[];
    tuss: ItemCodigo[];
    historico: HistoricoProcedimento[];
}

export interface TipoCompatibilidade {
    reg_principal: string;
    reg_compativel: string;
    tipo: number;
    nome_principal: string;
    nome_compativel: string;
    quantidade: number;
}

export interface RegraCompatibilidade {
    principal: string;
    nome_principal: string;
    reg_principal: string;
    secundario: string;
    nome_secundario: string;
    reg_compativel: string;
    tipo: number;
    quantidade?: number;
}

export interface TabelaAuxiliar {
    chave: string;
    titulo: string;
}

export type RegistroTabela = ItemCodigo & { qt_procedimentos: number } & Record<string, unknown>;

export interface PaginaTabela extends Pagina<RegistroTabela> {
    titulo?: string;
    vinculo?: string;
}

export interface Importacao {
    id_importacao: number;
    arquivo: string;
    usuario?: string;
    competencia: string;
    situacao: string;
    etapa?: string;
    percentual?: number;
    mensagem?: string;
    removida?: boolean;
    inicio?: string;
    fim?: string;
    duracao_seg?: number;
    qt_procedimentos?: number;
    qt_novos?: number;
    qt_compatibilidades?: number;
}

export interface ResumoImportacao {
    competenciaVigente?: string;
    competencias: Competencia[];
    ultimaConcluida?: Importacao;
    emAndamento?: Importacao;
}

export interface FiltroHistorico {
    competencia: string;
    situacao: string;
}

export async function listarCompetencias(): Promise<Competencia[]> {
    const { data } = await api.get<Competencia[]>('/sigtap/competencias');
    return data || [];
}

export async function buscarFiltros(competencia: string): Promise<MetaFiltros> {
    const { data } = await api.get<MetaFiltros>('/sigtap/filtros', { params: { competencia } });
    return data;
}

export async function buscarProcedimentos(params: Record<string, string | number>): Promise<Pagina<ProcedimentoLista>> {
    const { data } = await api.get<Pagina<ProcedimentoLista>>('/sigtap/procedimentos', { params });
    return data;
}

export async function buscarFicha(codigo: string, competencia: string): Promise<FichaProcedimentoDados> {
    const { data } = await api.get<FichaProcedimentoDados>(`/sigtap/procedimentos/${codigo}`, { params: { competencia } });
    return data;
}

export async function listarTiposCompatibilidade(competencia: string): Promise<TipoCompatibilidade[]> {
    const { data } = await api.get<{ tipos?: TipoCompatibilidade[] }>('/sigtap/compatibilidades/tipos', { params: { competencia } });
    return data.tipos ?? [];
}

export async function buscarCompatibilidades(params: Record<string, string | number>): Promise<Pagina<RegraCompatibilidade>> {
    const { data } = await api.get<Pagina<RegraCompatibilidade>>('/sigtap/compatibilidades', { params });
    return data;
}

export async function listarTabelas(): Promise<TabelaAuxiliar[]> {
    const { data } = await api.get<TabelaAuxiliar[]>('/sigtap/tabelas');
    return data || [];
}

export async function buscarTabela(tabela: string, params: Record<string, string | number>): Promise<PaginaTabela> {
    const { data } = await api.get<PaginaTabela>(`/sigtap/tabelas/${tabela}`, { params });
    return data;
}

export async function buscarResumo(): Promise<ResumoImportacao> {
    const { data } = await api.get<ResumoImportacao>('/sigtap/resumo');
    return data;
}

export async function listarImportacoes(filtro: FiltroHistorico, pagina: number): Promise<Pagina<Importacao>> {
    const { data } = await api.get<Pagina<Importacao>>('/sigtap/importacoes', { params: { ...filtro, pagina, tamanho: 10 } });
    return data;
}

export async function buscarImportacao(id: number): Promise<Importacao> {
    const { data } = await api.get<Importacao>(`/sigtap/importacoes/${id}`);
    return data;
}

export async function enviarPacote(arquivo: File, aoProgredir: (percentual: number) => void): Promise<Importacao> {
    const formulario = new FormData();
    formulario.append('arquivo', arquivo);
    const { data } = await api.post<Importacao>('/sigtap/importacoes', formulario, {
        onUploadProgress: (evento) => {
            if (evento.total) aoProgredir(Math.max(1, Math.round((evento.loaded / evento.total) * 100)));
        }
    });
    return data;
}

export const removerCompetencia = (competencia: string) => api.delete(`/sigtap/competencias/${competencia}`);
