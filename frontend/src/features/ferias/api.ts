import api from '@/shared/api';

export type ModuloFerias = 'implantacao' | 'projetos';

export interface ColaboradorFerias {
    id_usuario: number;
    nome_completo: string;
    funcao?: string | null;
    data_admissao?: string | null;
}

export interface SolicitacaoFerias {
    id_ferias: number;
    id_usuario: number;
    periodo_aquisitivo: number;
    tipo_solicitacao: string;
    data_inicio: string;
    data_fim: string;
    data_solicitacao: string;
    status: string;
    nome_completo?: string;
    cpf?: string | null;
    matricula?: string | null;
    setor?: string | null;
    funcao?: string | null;
    data_nascimento?: string | null;
    data_admissao?: string | null;
    nome_lotacao?: string | null;
}

export interface ConflitoFerias {
    nome_completo: string;
    data_inicio: string;
    data_fim: string;
    status: string;
}

export interface PrazoFerias {
    matricula?: string | null;
    nome_completo: string;
    data_admissao: string;
    periodo_aquisitivo: number;
    inicio_pa: string;
    data_limite: string;
    dias_gozados: number;
    dias_em_analise?: number;
    saldo_restante: number;
    status_prazo: 'VENCIDO' | 'PROXIMO_LIMITE' | string;
}

export interface NovaSolicitacao {
    id_usuario: number;
    periodo_aquisitivo: string;
    tipo_solicitacao: string;
    data_inicio: string;
    data_fim: string;
    dias_restantes: number;
}

export interface EdicaoFerias {
    periodo_aquisitivo: string;
    tipo_solicitacao: string;
    data_inicio: string;
    data_fim: string;
}

export async function listarColaboradores(modulo: ModuloFerias, lotacao?: string): Promise<ColaboradorFerias[]> {
    const { data } = await api.get<ColaboradorFerias[]>('/ferias/colaboradores', { params: { modulo, ...(lotacao && { lotacao }) } });
    return data;
}

export async function listarHistorico(idUsuario: string): Promise<SolicitacaoFerias[]> {
    const { data } = await api.get<SolicitacaoFerias[]>(`/ferias/historico/${idUsuario}`);
    return data;
}

export const solicitarFerias = (solicitacao: NovaSolicitacao) => api.post('/ferias/salvar', solicitacao);

/** Visão gerencial, já limitada pelo servidor ao escopo de quem consulta. */
export async function listarSolicitacoes(lotacao: string): Promise<SolicitacaoFerias[]> {
    const { data } = await api.get<SolicitacaoFerias[]>('/ferias/listar', { params: lotacao ? { lotacao } : {} });
    return [...data].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
}

export async function verificarConflitos(idFerias: number, inicio: string, fim: string): Promise<ConflitoFerias[]> {
    const { data } = await api.post<ConflitoFerias[]>('/ferias/conflitos', { id_ferias: idFerias, data_inicio: inicio, data_fim: fim });
    return data;
}

export const editarFerias = (idFerias: number, edicao: EdicaoFerias) => api.put(`/ferias/editar/${idFerias}`, edicao);

export const alterarStatus = (idFerias: number, status: 'APROVADO' | 'RECUSADO') => api.put(`/ferias/status/${idFerias}`, { status });

export async function listarPrazos(): Promise<PrazoFerias[]> {
    const { data } = await api.get<PrazoFerias[]>('/ferias/relatorio-prazos');
    return data ?? [];
}
