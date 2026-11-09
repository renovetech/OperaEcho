import api from '@/shared/api';

export interface PlanoResumo {
    id_plano: number;
    titulo: string;
    cliente?: string | null;
    cliente_informado?: boolean;
    nome_projeto?: string | null;
    modulos?: string | null;
    qtd_unidades: number;
    progresso: number;
    esperado: number;
    fechados: number;
    total: number;
    saude: string;
    atrasados: number;
    proximo_prazo?: string | null;
    status: string;
    data_criacao?: string | null;
    publico?: boolean;
    token_publico?: string | null;
    pode_editar?: boolean;
    pode_excluir?: boolean;
}

export interface FiltrosPlano {
    data: string;
    projeto: string;
    status: string;
    busca: string;
}

export interface PessoaEquipe {
    id_usuario: number;
    nome_completo: string;
    nome_funcao?: string | null;
    ativo?: boolean;
}

export interface ItemPlano {
    id_item: number;
    descricao?: string | null;
    responsavel?: string | null;
    cliente?: string | null;
    observacao?: string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    data_inicio_real?: string | null;
    data_fim_real?: string | null;
    percentual?: number | null;
    tempo_previsto?: number | null;
    tempo_previsto_bloqueado?: boolean;
    tempo_gasto?: number | null;
    horas_trabalhadas?: number | null;
    prioridade?: string | null;
    status?: string | null;
    modulo?: string | null;
    titulo?: string | null;
    id_unidade?: number | null;
    equipe?: PessoaEquipe[];
    /** Texto digitado no campo hh:mm, só na tela. */
    _tempo_str?: string;
}

export interface CabecalhoPlano {
    id_plano: number;
    titulo: string;
    cliente?: string | null;
    descricao?: string | null;
    nome_projeto?: string | null;
    nome_produto?: string | null;
    id_projeto?: number | null;
    sub_tipo?: string | null;
    status: string;
    data_criacao?: string | null;
    data_encerramento?: string | null;
    justificativa_encerramento?: string | null;
    data_inicio_prevista?: string | null;
    data_fim_prevista?: string | null;
    publico?: boolean;
    token_publico?: string | null;
}

export interface IndicadoresPlano {
    progresso?: number;
    esperado?: number;
    saude?: string;
    fechados?: number;
    total?: number;
    andamento?: number;
    atrasados?: number;
    vencendo_7d?: number;
    aderencia?: number | null;
    trabalhado_min?: number;
}

export interface UnidadeDoPlano { id_unidade: number; nome_unidade: string }

export interface PlanoCompleto {
    cabecalho: CabecalhoPlano;
    etapas?: ItemPlano[];
    indicadores?: IndicadoresPlano;
    permissoes?: { editar: boolean; novo: boolean };
    detalhes?: UnidadeDoPlano[];
}

export interface EventoHistorico {
    id_historico: number;
    data_hora: string;
    usuario?: string | null;
    acao: string;
    campo?: string | null;
    item?: string | null;
    valor_anterior?: string | null;
    valor_novo?: string | null;
}

export interface Apontamento {
    id_apontamento: number;
    id_usuario: number;
    registrado_por?: number;
    nome_completo?: string;
    data_execucao: string;
    minutos: number;
    descricao?: string | null;
}

export interface NovaAcaoItem {
    descricao: string;
    responsavel?: string | null;
    cliente?: string | null;
    data_inicio?: string | null;
    data_fim?: string | null;
    prioridade?: string;
    grupo?: string | null;
    modulo?: string | null;
    id_unidade?: number | null;
    apos_id_item?: number | null;
}

export interface ProdutoDoPlano { id_produto: number; nome_produto: string }

export interface DadosPlano {
    titulo: string;
    cliente?: string | null;
    descricao?: string | null;
    data_inicio_prevista?: string | null;
    data_fim_prevista?: string | null;
}

const url = (id: number | string) => `/plano-acao/${id}`;

export async function listarPlanos(filtros: FiltrosPlano): Promise<PlanoResumo[]> {
    const { data } = await api.get<PlanoResumo[]>('/plano-acao/buscar', { params: filtros });
    return data ?? [];
}

export const excluirPlano = (id: number) => api.delete(url(id));
export const encerrarPlano = (id: number, justificativa: string | null) => api.put(`/plano-acao/encerrar/${id}`, { justificativa });
export const reabrirPlano = (id: number) => api.put(`/plano-acao/reabrir/${id}`);

export async function alterarPublicacao(id: number, publico: boolean, regenerar = false): Promise<string> {
    const { data } = await api.post<{ token_publico: string }>(`${url(id)}/publico`, { publico, regenerar });
    return data?.token_publico;
}

export async function listarProdutosDoPlano(): Promise<ProdutoDoPlano[]> {
    const { data } = await api.get<ProdutoDoPlano[]>('/produtos/plano-acao');
    return data ?? [];
}

export async function idsDeProdutosDaUnidade(idUnidade: number): Promise<number[]> {
    const { data } = await api.get<{ id_produto: number }[]>(`/unidades/${idUnidade}/produtos`);
    return (data ?? []).map((produto) => produto.id_produto);
}

export async function criarPlano(corpo: Record<string, unknown>): Promise<number> {
    const { data } = await api.post<{ id_plano: number }>('/plano-acao/salvar', corpo);
    return data.id_plano;
}

export async function buscarPlano(id: string): Promise<PlanoCompleto> {
    const { data } = await api.get<PlanoCompleto>(url(id));
    return data;
}

export async function listarEquipeDisponivel(id: string): Promise<PessoaEquipe[]> {
    const { data } = await api.get<PessoaEquipe[]>(`${url(id)}/equipe-disponivel`);
    return data ?? [];
}

export async function salvarItens(id: string, etapas: Record<string, unknown>[]): Promise<{ id_item: number; msg: string }[]> {
    const { data } = await api.post<{ ajustes?: { id_item: number; msg: string }[] }>('/plano-acao/atualizar-lote-etapas', { id_plano: Number(id), etapas });
    return data?.ajustes ?? [];
}

export const adicionarUnidade = (id: string, idUnidade: number, etapasTemplate: unknown[]) =>
    api.post('/plano-acao/adicionar-unidade-etapas', { id_plano: Number(id), id_unidade: idUnidade, etapas_template: etapasTemplate });

export const removerUnidade = (id: string, idUnidade: number, forcar: boolean) =>
    api.delete(`${url(id)}/unidades/${idUnidade}`, { params: forcar ? { forcar: 1 } : {} });

export const criarItem = (id: string, item: NovaAcaoItem) => api.post(`${url(id)}/itens`, item);
export const renomearEtapa = (id: string, modulo: string | null, de: string, para: string) => api.put(`${url(id)}/etapas`, { modulo, de, para });

export const excluirEtapa = (id: string, nome: string, modulo: string | null, forcar: boolean) =>
    api.delete(`${url(id)}/etapas`, { params: { nome, ...(modulo && { modulo }), ...(forcar && { forcar: 1 }) } });

export const excluirItem = (idItem: number, forcar: boolean) => api.delete(`/plano-acao/itens/${idItem}`, { params: forcar ? { forcar: 1 } : {} });
export const moverItem = (idItem: number, direcao: 'cima' | 'baixo') => api.post(`/plano-acao/itens/${idItem}/mover`, { direcao });
export const atualizarDadosPlano = (id: number, dados: DadosPlano) => api.put(url(id), dados);

export async function listarHistorico(id: string): Promise<EventoHistorico[]> {
    const { data } = await api.get<EventoHistorico[]>(`${url(id)}/historico`);
    return data ?? [];
}

export async function listarApontamentos(idItem: number): Promise<Apontamento[]> {
    const { data } = await api.get<Apontamento[]>(`/plano-acao/itens/${idItem}/apontamentos`);
    return data ?? [];
}

export const apontarHoras = (idItem: number, apontamento: { data_execucao: string; minutos: number; descricao: string; id_usuario?: number }) =>
    api.post(`/plano-acao/itens/${idItem}/apontamentos`, apontamento);

export const excluirApontamento = (id: number) => api.delete(`/plano-acao/apontamentos/${id}`);

export interface LinhaPainel {
    nome: string;
    total: number;
    fechados: number;
    andamento?: number;
    atrasados: number;
    progresso: number;
}

export interface PontoCurva {
    semana: string;
    acum_previsto: number;
    acum_realizado: number;
    concluidos: number;
}

export interface PrazoPainel {
    id_item: number;
    descricao: string;
    plano?: string;
    cliente?: string;
    unidade?: string;
    responsavel?: string;
    data_fim?: string;
    dias_atraso?: number;
    dias_restantes?: number;
}

export interface PlanoDoPainel {
    id_plano?: number;
    token_publico?: string | null;
    titulo: string;
    produto?: string;
    cliente?: string;
    nome_projeto?: string;
    saude: string;
    progresso: number;
    esperado?: number;
    fechados: number;
    total: number;
    atrasados: number;
    proximo_prazo?: string;
    data_fim_prevista?: string;
}

export interface EtapaPainel {
    descricao: string;
    cliente?: string;
    responsavel?: string;
    modulo?: string;
    unidade?: string;
    grupo?: string;
    data_inicio?: string;
    data_fim?: string;
    data_inicio_real?: string;
    data_fim_real?: string;
    status: string;
}

export interface DadosPainel {
    gerado_em: string;
    resumo: {
        planos: number;
        planos_ativos: number;
        planos_concluidos: number;
        progresso: number;
        esperado: number;
        desvio: number;
        total: number;
        fechados: number;
        andamento: number;
        atrasados: number;
        vencendo_7d: number;
        aderencia: number | null;
        trabalhado_min?: number;
        previsto_min?: number;
        unidades?: number;
        saude?: Record<string, number>;
    };
    plano?: { titulo: string; cliente?: string; nome_projeto?: string; status: string; data_inicio_prevista?: string; data_fim_prevista?: string; descricao?: string } | null;
    planos: PlanoDoPainel[];
    por_status: { nome: string; total: number }[];
    evolucao?: PontoCurva[];
    por_etapa?: LinhaPainel[];
    por_responsavel?: LinhaPainel[];
    por_unidade?: LinhaPainel[];
    por_cliente?: LinhaPainel[];
    por_modulo?: LinhaPainel[];
    por_prioridade?: LinhaPainel[];
    atrasados: PrazoPainel[];
    proximos_prazos: PrazoPainel[];
    por_pessoa?: { id_usuario: number; nome: string; itens: number; abertos: number; atrasados: number; apontamentos: number; trabalhado_min: number }[];
    etapas?: EtapaPainel[];
}

export async function buscarPainel(filtros: Record<string, string>): Promise<DadosPainel> {
    const { data } = await api.get<DadosPainel>('/plano-acao/painel', { params: filtros });
    return data;
}

export async function buscarPainelPublico(token?: string): Promise<DadosPainel> {
    const { data } = await api.get<DadosPainel>(token ? `/publico/plano-acao/painel/${encodeURIComponent(token)}` : '/publico/plano-acao/painel');
    return data;
}
