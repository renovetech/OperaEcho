import api from '@/shared/api';

export interface ProdutoFaturamento {
    id_produto: number;
    nome_produto: string;
    tipos: string[];
    estrutura?: string;
}

export interface UnidadeFaturamento {
    id_unidade: number;
    id_projeto: number;
    nome_unidade: string;
    cnes?: string | null;
    produtos?: number[];
}

export interface OpcoesFaturamento {
    projetos: { id_projeto: number; nome_projeto: string; ativo?: boolean }[];
    unidades: UnidadeFaturamento[];
    produtos: ProdutoFaturamento[];
    sigtap: unknown[];
}

export interface FormLancamento {
    id_projeto: string;
    id_unidade: string;
    id_produto: string;
    tipo: string;
    competencia: string;
}

export interface LancamentoExistente {
    vl_total: number;
    usuario: string;
    dt_lancamento: string;
}

export interface ProcedimentoPrevia {
    co_procedimento: string;
    no_procedimento?: string | null;
    encontrado?: boolean;
    quantidade: number;
    vl_unitario?: number;
    vl_total: number;
}

export interface PreviaLancamento {
    resumo: {
        unidade: string;
        projeto: string;
        produto: string;
        tipo: string;
        origem?: string;
        vl_total: number;
        competencia: string;
        competencia_arquivo?: string;
        cnes_arquivo?: string;
        cnes_unidade?: string;
        qt_total: number;
        qt_procedimentos: number;
        qt_registros: number;
        qt_pacientes?: number;
        sigtap_competencia?: string;
        por_origem: { origem: string; quantidade: number; vl_total: number }[];
    };
    avisos: { nivel: 'erro' | 'alerta' | 'info'; texto: string }[];
    existente?: LancamentoExistente | null;
    procedimentos: ProcedimentoPrevia[];
}

export interface Lancamento {
    id_lancamento: number;
    nome_unidade: string;
    nome_projeto: string;
    nome_produto: string;
    cnes?: string | null;
    competencia: string;
    competencia_arquivo?: string;
    tipo: string;
    arquivo?: string | null;
    qt_total: number;
    qt_registros: number;
    qt_procedimentos: number;
    vl_total: number;
    sigtap_competencia: string;
    usuario: string;
    dt_lancamento: string;
}

export interface PaginaLancamentos {
    itens: Lancamento[];
    total: number;
    pagina: number;
    tamanho: number;
}

export interface FiltroLancamentos {
    projeto: string;
    unidade: string;
    competencia: string;
    tipo: string;
}

export interface ResultadoLancamento {
    mensagem: string;
    resumo: { unidade: string; competencia: string; tipo: string; vl_total: number; qt_total: number };
}

export interface DadosPainel {
    mensal: { competencia: string; vl_total: number; qt_total: number; qt_unidades?: number; qt_pacientes?: number; qt_aih?: number }[];
    procedimentos: { co_procedimento: string; no_procedimento?: string | null; competencia: string; vl: number; qt: number }[];
    unidades: { id_unidade: number; nome_unidade: string; nome_projeto: string; competencia: string; vl: number; qt: number }[];
    cbos: { co_cbo: string; competencia: string; vl: number; qt: number }[];
    subgrupos: Record<string, string>;
    ocupacoes: Record<string, string>;
    competencias_disponiveis?: string[];
}

export async function buscarOpcoes(): Promise<OpcoesFaturamento> {
    const { data } = await api.get<OpcoesFaturamento>('/faturamento/opcoes');
    return data;
}

const montarEnvio = (form: FormLancamento, arquivo: File, extra: Record<string, string> = {}) => {
    const dados = new FormData();
    Object.entries({ ...form, competencia: form.competencia.replace('-', ''), ...extra }).forEach(([chave, valor]) => dados.append(chave, valor));
    dados.append('arquivo', arquivo);
    return dados;
};

export async function analisarArquivo(form: FormLancamento, arquivo: File): Promise<PreviaLancamento> {
    const { data } = await api.post<PreviaLancamento>('/faturamento/analisar', montarEnvio(form, arquivo));
    return data;
}

export async function gravarLancamento(form: FormLancamento, arquivo: File, substituir: boolean, aoProgredir: (percentual: number) => void): Promise<ResultadoLancamento> {
    const { data } = await api.post<ResultadoLancamento>('/faturamento/lancamentos', montarEnvio(form, arquivo, { substituir: substituir ? '1' : '0' }), {
        onUploadProgress: (evento) => { if (evento.total) aoProgredir(Math.max(1, Math.round((evento.loaded / evento.total) * 100))); }
    });
    return data;
}

export async function listarLancamentos(filtro: FiltroLancamentos, pagina: number): Promise<PaginaLancamentos> {
    const { data } = await api.get<PaginaLancamentos>('/faturamento/lancamentos', { params: { ...filtro, competencia: filtro.competencia.replace('-', ''), pagina, tamanho: 15 } });
    return data;
}

export async function buscarLancamento(id: number): Promise<{ procedimentos: ProcedimentoPrevia[] }> {
    const { data } = await api.get<{ procedimentos: ProcedimentoPrevia[] }>(`/faturamento/lancamentos/${id}`);
    return data;
}

export const excluirLancamento = (id: number) => api.delete(`/faturamento/lancamentos/${id}`);

export async function revalorizarLancamento(id: number): Promise<{ mensagem: string; vl_anterior: number; vl_total: number }> {
    const { data } = await api.post<{ mensagem: string; vl_anterior: number; vl_total: number }>(`/faturamento/lancamentos/${id}/revalorizar`);
    return data;
}

export async function buscarPainel(params: Record<string, string>): Promise<DadosPainel> {
    const { data } = await api.get<DadosPainel>('/faturamento/painel', { params });
    return data;
}
