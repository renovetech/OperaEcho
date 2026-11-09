import api from '@/shared/api';
import { hojeLocal } from '@/shared/lib';

export interface Totais {
    implantadores: number;
    operadores: number;
    projetos: number;
    unidades: number;
    produtos: number;
}

export interface FeriasAgendada {
    nome_completo?: string;
    data_inicio?: string;
    data_fim?: string;
}

export interface ProgressoPlano {
    id_plano: number;
    nome_projeto: string;
    titulo: string;
    total_unidades: number;
    perc_concluido: number;
    perc_andamento: number;
    perc_atrasado: number;
    unidades_concluidas: number;
    unidades_andamento: number;
    unidades_atrasadas: number;
}

export interface EquipeDoDia {
    nome: string;
    total: number;
    implantador?: string;
    unidade?: string;
    motivo?: string;
}

export interface AtividadesDoDia {
    total: number;
    por_equipe: EquipeDoDia[];
}

export const SEM_ATIVIDADES: AtividadesDoDia = { total: 0, por_equipe: [] };

const emLista = <T,>(dados: unknown): T[] => (Array.isArray(dados) ? (dados as T[]) : []);

export async function buscarTotais(idUsuario: number): Promise<Totais> {
    const { data } = await api.get<Totais>(`/dashboard/totais?id_usuario=${idUsuario}`);
    return data;
}

export async function buscarFerias(idUsuario: number): Promise<FeriasAgendada[]> {
    const { data } = await api.get(`/dashboard/proximas-ferias?id_usuario=${idUsuario}`);
    return emLista<FeriasAgendada>(data);
}

export async function buscarPlanos(idUsuario: number): Promise<ProgressoPlano[]> {
    const { data } = await api.get(`/dashboard/progresso-planos?id_usuario=${idUsuario}`);
    return emLista<ProgressoPlano>(data);
}

export async function buscarAtividadesDoDia(
    recurso: 'atividades-hoje' | 'atividades-hoje-projetos',
    idUsuario: number
): Promise<AtividadesDoDia> {
    const { data } = await api.get<Partial<AtividadesDoDia>>(`/dashboard/${recurso}?id_usuario=${idUsuario}&data=${hojeLocal()}`);
    return { total: data?.total || 0, por_equipe: emLista(data?.por_equipe) };
}
