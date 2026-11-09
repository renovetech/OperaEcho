import api from '@/shared/api';

export interface Projeto {
    id_projeto: number;
    nome_projeto: string;
    categoria?: string | null;
    ativo: boolean;
    gera_lotacao: boolean;
    painel_publico?: boolean;
    slug_publico?: string | null;
}

export interface FormProjeto {
    id_projeto: number | '';
    nome_projeto: string;
    categoria: string;
    ativo: boolean;
    gera_lotacao: boolean;
    painel_publico: boolean;
    slug_publico: string;
}

export async function listarProjetos(): Promise<Projeto[]> {
    const { data } = await api.get<Projeto[]>('/projetos');
    return data;
}

export async function salvarProjeto(payload: Omit<FormProjeto, 'id_projeto'> & { id_projeto: number | null }): Promise<string | undefined> {
    const { data } = await api.post<{ slug_publico?: string }>('/projetos/salvar', payload);
    return data?.slug_publico;
}
