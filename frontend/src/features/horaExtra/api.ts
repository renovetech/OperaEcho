/* Lançamentos de hora extra. Implantação usa /hora-extra; Projetos, /projetos/hora-extra (isolado por lotação). */
import api from '@/shared/api';
import type { DetalheSalvo, LinhaDia, TotaisHoras } from '@/features/horaExtra/calculos';

export interface LancamentoResumo {
    id_lancamento: number;
    mes_referencia: string;
    status: string;
    id_usuario: number;
    id_projeto: number | null;
    id_unidade: number | null;
    colaborador: string | null;
    nome_projeto: string;
}

export interface Colaborador { id_usuario: number; nome_completo: string }

export interface LancamentoParaSalvar {
    id_lancamento: number | null;
    id_usuario: number;
    id_projeto: number | null;
    id_unidade: number | null;
    mes_referencia: string;
    detalhes_dias: LinhaDia[];
    totais: TotaisHoras;
}

/** Do mês mais recente para o mais antigo; no mesmo mês, por colaborador. */
export function ordenarLancamentos(lista: LancamentoResumo[]): LancamentoResumo[] {
    return [...lista].sort((a, b) => b.mes_referencia.localeCompare(a.mes_referencia) || (a.colaborador ?? '').localeCompare(b.colaborador ?? ''));
}

/** Com lotação (submenu Projetos), só os lançamentos dela; o acesso continua conferido no servidor. */
export async function listarLancamentos(apiBase: string, lotacao?: string): Promise<LancamentoResumo[]> {
    const { data } = await api.get<LancamentoResumo[]>(`${apiBase}/hora-extra/buscar`, { params: lotacao ? { id_projeto: lotacao } : {} });
    return ordenarLancamentos(data);
}

export async function buscarDetalhes(apiBase: string, id: number): Promise<DetalheSalvo[]> {
    const { data } = await api.get<{ detalhes?: DetalheSalvo[] }>(`${apiBase}/hora-extra/detalhes/${id}`);
    return data.detalhes ?? [];
}

export async function salvarLancamento(apiBase: string, lancamento: LancamentoParaSalvar): Promise<void> {
    await api.post(`${apiBase}/hora-extra/salvar`, lancamento);
}

export async function excluirLancamento(apiBase: string, id: number): Promise<void> {
    await api.delete(`${apiBase}/hora-extra/${id}`);
}

export async function listarColaboradores(lotacao?: string): Promise<Colaborador[]> {
    const { data } = await api.get<Colaborador[]>('/implantadores', { params: lotacao ? { id_projeto: lotacao } : {} });
    return data;
}
