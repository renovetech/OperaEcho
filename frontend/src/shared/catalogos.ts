/* Listas de apoio usadas por mais de um módulo. */
import api from '@/shared/api';

export interface ProjetoResumo { id_projeto: number; nome_projeto: string; ativo: boolean }
export interface UnidadeResumo { id_unidade: number; nome_unidade: string }

export interface LotacaoResumo { id_projeto: number; nome_projeto: string }

/** Lotações que o usuário pode operar; o servidor já filtra pelo escopo dele. */
export async function listarMinhasLotacoes(): Promise<{ lotacoes: LotacaoResumo[]; global: boolean }> {
    const { data } = await api.get<{ lotacoes?: LotacaoResumo[]; global?: boolean }>('/projetos/minhas-lotacoes');
    return { lotacoes: data.lotacoes ?? [], global: Boolean(data.global) };
}

/** Projetos ativos; com lotação, só ela (submenu Projetos). */
export async function listarProjetosAtivos(lotacao?: string): Promise<ProjetoResumo[]> {
    const { data } = await api.get<ProjetoResumo[]>('/projetos');
    return data.filter((projeto) => projeto.ativo && (!lotacao || String(projeto.id_projeto) === lotacao));
}

export async function listarUnidadesDoProjeto(idProjeto: string): Promise<UnidadeResumo[]> {
    const { data } = await api.get<{ dados?: UnidadeResumo[] }>('/unidades/buscar', { params: { projeto: idProjeto, status: true, limite: 1000 } });
    return data.dados ?? [];
}
