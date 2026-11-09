import api from '@/shared/api';

export interface Periodo {
    dataInicio: string;
    dataFim: string;
}

export interface RegistroMapa {
    latitude?: number | null;
    longitude?: number | null;
    cidade?: string;
    estado?: string;
    nome_projeto?: string;
    nome_unidade: string;
    motivos?: string | null;
    profissionais_env?: number | null;
    data_inicio?: string | null;
    data_fim?: string | null;
}

export interface LinhaProdutividade {
    implantador: string;
    total_atividades_real?: number;
    qtd_implantacao: number;
    qtd_treinamento: number;
    qtd_visita: number;
    qtd_apoio?: number;
}

export interface DetalheProdutividade { data: string; unidade?: string; projeto?: string }

export interface LinhaMetrica {
    implantador: string;
    produto: string;
    qtd_implantacao: number;
    qtd_treinamento: number;
    total_real_implantador?: number;
}

export interface DadosProdutos {
    geral: { nome_produto: string; qtd_unidades: number }[];
    detalheImplantadores: { implantador: string; nome_produto: string; qtd_atividades: number }[];
}

export interface DetalheProduto {
    data_atividade: string;
    unidade?: string;
    projeto?: string;
    implantador?: string;
    motivos?: string;
}

/** Só envia o período quando as duas datas estão preenchidas. */
const paramsPeriodo = ({ dataInicio, dataFim }: Periodo) => (dataInicio && dataFim ? { dataInicio, dataFim } : {});

export async function listarNomesAtivos(): Promise<Set<string>> {
    const { data } = await api.get<{ nome_completo: string }[]>('/implantadores');
    return new Set(data.map((pessoa) => pessoa.nome_completo.toUpperCase()));
}

export async function buscarMapa(periodo: Periodo): Promise<RegistroMapa[]> {
    const { data } = await api.get<RegistroMapa[]>('/dashboard/mapa-implantacao', { params: paramsPeriodo(periodo) });
    return data ?? [];
}

export async function buscarProdutividade(periodo: Periodo): Promise<LinhaProdutividade[]> {
    const { data } = await api.get<LinhaProdutividade[]>('/dashboard/estatisticas-produtividade', { params: paramsPeriodo(periodo) });
    return data ?? [];
}

export async function buscarDetalheProdutividade(implantador: string, periodo: Periodo): Promise<DetalheProdutividade[]> {
    const { data } = await api.get<DetalheProdutividade[]>('/dashboard/detalhe-produtividade', { params: { implantador, ...paramsPeriodo(periodo) } });
    return data ?? [];
}

export async function buscarMetricas(periodo: Periodo): Promise<LinhaMetrica[]> {
    const { data } = await api.get<LinhaMetrica[]>('/dashboard/metricas-implantacao', { params: paramsPeriodo(periodo) });
    return data ?? [];
}

export async function buscarProdutos(): Promise<DadosProdutos> {
    const { data } = await api.get<DadosProdutos>('/dashboard/produtividade-produtos');
    return data ?? { geral: [], detalheImplantadores: [] };
}

export async function buscarDetalheProduto(nomeProduto: string): Promise<DetalheProduto[]> {
    const { data } = await api.get<DetalheProduto[]>('/dashboard/detalhes-produto', { params: { nome_produto: nomeProduto } });
    return data ?? [];
}
