import api from '@/shared/api';

export interface ProjetoFiltro { id_projeto: number; nome_projeto: string; ativo?: boolean | number; categoria?: string | null }
export interface UnidadeFiltro { id_unidade: number; nome_unidade: string; id_projeto?: number }

export interface LinhaEstatistica {
    motivos: string;
    nome_projeto: string;
    nome_unidade: string;
    produtos_trabalhados?: string | null;
    profissionais_env?: number | string | null;
    data_inicial?: string | null;
    tempo_gasto?: string | null;
    implantadores?: string | null;
    equipe_projeto?: string | null;
    operadores_analistas?: string | null;
}

export interface PontoAuditoria {
    id_rastreio: number;
    usuario: string;
    latitude?: number | null;
    longitude?: number | null;
    tipo_registro: string;
    data_hora: string;
    detalhes_registro?: string | null;
}

export interface LinhaPresenca {
    data_inicio: string;
    nome_projeto: string;
    nome_unidade: string;
    nome_implantador: string;
}

export interface ResumoTempo {
    com_dados: number;
    sem_dados: number;
    media_previsto: number;
    media_gasto: number;
    media_desvio: number;
    qtd_estourado: number;
    qtd_na_media: number;
    qtd_legal: number;
    media_tempo_estourado: number;
    media_tempo_na_media: number;
    media_tempo_legal: number;
}

export interface GrupoTempo { qtd: number; media_previsto: number; media_gasto: number; media_desvio: number; estourados: number }

export interface ItemTempo {
    id_item: number;
    descricao: string;
    responsavel?: string | null;
    modulo?: string | null;
    nome_projeto?: string | null;
    previsto_min: number;
    gasto_min: number;
    desvio_min: number;
    classificacao: string;
}

export interface DadosTempo {
    resumo: ResumoTempo;
    porResponsavel: (GrupoTempo & { responsavel: string })[];
    porAcao: (GrupoTempo & { descricao: string })[];
    itens: ItemTempo[];
}

export interface GrupoPlano { nome: string; total: number; fechados: number; andamento?: number; atrasados: number; progresso: number }

export interface ItemRelatorioPlano {
    id_item: number;
    plano: string;
    descricao: string;
    cliente?: string | null;
    nome_projeto?: string | null;
    modulo?: string | null;
    grupo?: string | null;
    unidade?: string | null;
    responsavel?: string | null;
    equipe?: string | null;
    prioridade?: string | null;
    status: string;
    percentual: number;
    data_inicio?: string | null;
    data_fim?: string | null;
    data_inicio_real?: string | null;
    data_fim_real?: string | null;
    situacao_prazo: string;
    dias_atraso?: number | null;
    dias_restantes?: number | null;
    tempo_previsto?: number | null;
    tempo_gasto?: number | null;
    horas_trabalhadas?: number | null;
    observacao?: string | null;
}

export interface PlanoResumoRelatorio {
    id_plano: number;
    titulo: string;
    cliente?: string | null;
    nome_projeto?: string | null;
    status: string;
    saude: string;
    progresso: number;
    esperado: number;
    desvio: number;
    total: number;
    fechados: number;
    andamento: number;
    atrasados: number;
    proximo_prazo?: string | null;
    data_fim_prevista?: string | null;
    trabalhado_min?: number | null;
}

export interface DadosPlano {
    resumo: {
        planos: number; planos_ativos: number; planos_concluidos: number; progresso: number; esperado: number; desvio: number;
        aderencia: number | null; fechados_no_prazo: number; fechados_com_prazo: number; fechados: number; total: number;
        andamento: number; a_iniciar: number; atrasados: number; vencendo_7d: number; trabalhado_min: number; previsto_min: number;
        unidades: number; clientes: number;
    };
    planos: PlanoResumoRelatorio[];
    itens: ItemRelatorioPlano[];
    atrasados: ItemRelatorioPlano[];
    proximos_prazos: ItemRelatorioPlano[];
    por_status: { nome: string; total: number }[];
    por_etapa: GrupoPlano[];
    por_responsavel: GrupoPlano[];
    por_unidade: GrupoPlano[];
    por_cliente: GrupoPlano[];
    por_modulo: GrupoPlano[];
    por_prioridade: GrupoPlano[];
    por_pessoa: { id_usuario: number; nome: string; itens: number; abertos: number; atrasados: number; apontamentos: number; trabalhado_min: number }[];
}

export interface ProjetoAtivo {
    id_projeto: number;
    nome_projeto: string;
    categoria?: string | null;
    ufs?: string | null;
    gera_lotacao?: boolean | number;
    unidades_ativas: number;
    unidades_inativas: number;
    unidades_georref: number;
    municipios: number;
    atividades_implantacao: number;
    atividades_projetos: number;
    ultima_atividade?: string | null;
    produtos: { id_produto: number; nome_produto: string; unidades: number }[];
}

export interface UnidadeMapa {
    id_unidade: number;
    nome_unidade: string;
    nome_projeto: string;
    cnes?: string | null;
    ativo: boolean | number;
    id_cidade?: number | null;
    nome_cidade?: string | null;
    uf?: string | null;
    latitude: number | null;
    longitude: number | null;
    aproximada: boolean;
    produtos: { id_produto: number; nome_produto: string }[];
}

const buscar = async <T>(rota: string, params?: object): Promise<T> => (await api.get<T>(rota, { params })).data;

export const listarProjetos = () => buscar<ProjetoFiltro[]>('/projetos');
export const listarProjetosAtivosFiltro = async () => (await listarProjetos()).filter((projeto) => projeto.ativo === true || projeto.ativo === 1);
export const listarTodasUnidades = async () => (await buscar<{ dados?: UnidadeFiltro[] }>('/unidades/buscar', { limite: 1000 })).dados ?? [];
export const listarPlanos = (projeto: string) => buscar<{ id_plano: number; titulo: string }[]>('/plano-acao/buscar', projeto ? { projeto } : undefined);

export const buscarEstatisticas = (deProjetos: boolean, params: object) => buscar<LinhaEstatistica[]>(deProjetos ? '/relatorios/estatisticas-projetos' : '/relatorios/estatisticas-atividades', params);
export const buscarAuditoria = async (params: object) => {
    const dados = await buscar<PontoAuditoria[]>('/relatorios/auditoria-localizacao', params);
    return Array.isArray(dados) ? dados : [];
};
export const buscarPresenca = (params: object) => buscar<LinhaPresenca[]>('/relatorios/presenca-implantadores', params);
export const buscarTempoMedio = (params: object) => buscar<DadosTempo>('/relatorios/tempo-medio-acao', params);
export const buscarPlanoAcao = (params: object) => buscar<DadosPlano>('/relatorios/plano-acao', params);
export const buscarProjetosAtivos = async (params: object) => {
    const dados = await buscar<ProjetoAtivo[]>('/relatorios/projetos-ativos', params);
    return Array.isArray(dados) ? dados : [];
};
export const buscarMapaUnidades = async (params: object) => {
    const dados = await buscar<UnidadeMapa[]>('/relatorios/mapa-unidades', params);
    return Array.isArray(dados) ? dados : [];
};
