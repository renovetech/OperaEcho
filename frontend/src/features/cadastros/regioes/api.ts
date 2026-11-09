import api from '@/shared/api';

export interface Micro {
    id_micro: number;
    id_macro: number;
    nome_micro: string;
    sigla?: string | null;
    cor?: string | null;
    ativo: boolean;
    ordem?: number;
    unidades: number;
}

export interface Macro {
    id_macro: number;
    nome_macro: string;
    sigla?: string | null;
    cor?: string | null;
    ativo: boolean;
    ordem?: number;
    unidades: number;
    micros: Micro[];
}

export interface UnidadeRegiao {
    id_unidade: number;
    nome_unidade: string;
    cnes?: string | null;
    nome_cidade?: string | null;
    uf?: string | null;
    ativo: boolean;
    id_macro?: number | null;
    id_micro?: number | null;
}

export interface FormMacro {
    id_macro: number | '';
    nome_macro: string;
    sigla: string;
    cor: string;
    ativo: boolean;
    ordem?: number;
}

export interface FormMicro {
    id_micro: number | '';
    id_macro?: number | string;
    nome_micro: string;
    sigla: string;
    cor: string;
    ativo: boolean;
    ordem?: number;
}

export interface Vinculo {
    id_macro: number | string;
    id_micro: number | string;
}

export async function listarMacros(idProjeto: string): Promise<Macro[]> {
    const { data } = await api.get<Macro[]>(`/regioes/projeto/${idProjeto}`);
    return data || [];
}

export async function listarUnidadesDoProjeto(idProjeto: string): Promise<UnidadeRegiao[]> {
    const { data } = await api.get<UnidadeRegiao[]>(`/regioes/unidades/${idProjeto}`);
    return data || [];
}

export const salvarMacro = (payload: FormMacro & { id_projeto: string; ordem: number }) => api.post('/regioes/macro/salvar', payload);
export const excluirMacro = (id: number) => api.delete(`/regioes/macro/${id}`);
export const salvarMicro = (payload: Omit<FormMicro, 'cor'> & { id_macro: number | string; cor: string | null; ordem: number }) => api.post('/regioes/micro/salvar', payload);
export const excluirMicro = (id: number) => api.delete(`/regioes/micro/${id}`);

export async function salvarVinculos(idProjeto: string, alteracoes: Record<number, Vinculo>): Promise<string | undefined> {
    const itens = Object.entries(alteracoes).map(([idUnidade, vinculo]) => ({
        id_unidade: Number(idUnidade),
        id_macro: vinculo.id_macro || null,
        id_micro: vinculo.id_micro || null
    }));
    const { data } = await api.post<{ mensagem?: string }>('/regioes/unidades/vincular', { id_projeto: idProjeto, itens });
    return data?.mensagem;
}
