import api from '@/shared/api';

export interface ModuloSistema {
    chave: string;
    rotulo: string;
    categoria: string;
    temNovo: boolean;
    temEditar: boolean;
}

export interface Regra {
    pode_acessar: boolean;
    pode_novo: boolean;
    pode_editar: boolean;
}

export type RegrasPorModulo = Record<string, Regra>;

const m = (chave: string, rotulo: string, categoria: string, temNovo = false, temEditar = false): ModuloSistema =>
    ({ chave, rotulo, categoria, temNovo, temEditar });

export const MODULOS_DO_SISTEMA: ModuloSistema[] = [
    m('usuarios', 'Cadastro de Usuários', 'Cadastros', true, true),
    m('produtos', 'Cadastro de Produtos', 'Cadastros', true, true),
    m('projetos', 'Cadastro de Projetos', 'Cadastros', true, true),
    m('unidades', 'Cadastro de Unidades', 'Cadastros', true, true),
    m('regioes', 'Macro e Micro Regiões', 'Cadastros', true, true),
    m('perfis', 'Perfis de Acesso', 'Cadastros', false, true),
    m('registro_atividades', 'Registro de Atividades', 'Implantação', true, true),
    m('hora_extra', 'Lançar Hora Extra', 'Implantação', true, true),
    m('escala', 'Gerador de Escalas', 'Implantação', false, true),
    m('painel_consolidado', 'Painel: Implantações Consolidadas', 'Implantação'),
    m('painel_prod_ind', 'Painel: Produtividade Individual', 'Implantação'),
    m('painel_prod_uni', 'Painel: Produtividade por Unidade', 'Implantação'),
    m('painel_metricas', 'Painel: Métricas da Implantação', 'Implantação'),
    m('proj_registro_atividades', 'Registro de Atividades', 'Projetos', true, true),
    m('proj_hora_extra', 'Lançar Hora Extra', 'Projetos', true, true),
    m('proj_escala', 'Gerador de Escalas', 'Projetos', false, true),
    m('painel_plano_acao', 'Painel: Plano de Ação', 'Operacional'),
    m('plano_acao', 'Plano de Ação', 'Operacional', true, true),
    m('links_externos', 'Links Externos', 'Operacional', true, true),
    m('sigtap', 'Consulta SIGTAP', 'Operacional'),
    m('indicadores_aps', 'Indicadores APS', 'Operacional'),
    m('faturamento_lancar', 'Lançar Faturamento', 'Operacional', true, true),
    m('painel_faturamento', 'Painel: Faturamento Consolidado', 'Operacional'),
    m('ferias_solicitacao', 'Solicitação de Férias (Implantação)', 'Férias', true, false),
    m('proj_ferias_solicitacao', 'Solicitação de Férias (Projetos)', 'Férias', true, false),
    m('ferias_gestao', 'Aprovação de Férias', 'Férias', false, true),
    m('rel_estatisticas', 'Estatísticas da Atividade', 'Relatórios'),
    m('rel_estatisticas_projetos', 'Estatística dos Projetos', 'Relatórios'),
    m('rel_auditoria_loc', 'Auditoria de Localização', 'Relatórios'),
    m('rel_presenca_implantador', 'Presença por Implantador', 'Relatórios'),
    m('rel_presenca_equipe', 'Presença por Equipe', 'Relatórios'),
    m('rel_tempo_medio', 'Tempo Médio de Ação', 'Relatórios'),
    m('rel_plano_acao', 'Plano de Ação - Status e Execução', 'Relatórios'),
    m('rel_projetos_ativos', 'Projetos Ativos', 'Relatórios'),
    m('rel_mapa_unidades', 'Mapa de Unidades', 'Relatórios'),
    m('parametros', 'Parâmetros do Sistema', 'Sistema', false, true),
    m('notificacoes_acesso', 'Aprovar Acessos (Notificações)', 'Sistema', false, true)
];

export async function listarNomesDePerfis(): Promise<string[]> {
    const { data } = await api.get<{ nome_perfil: string }[]>('/perfis');
    return data.map((perfil) => perfil.nome_perfil);
}

export async function buscarRegras(perfil: string): Promise<RegrasPorModulo> {
    const { data } = await api.get<(Regra & { nome_modulo: string })[]>(`/regras/${encodeURIComponent(perfil)}`);
    const regras: RegrasPorModulo = {};
    MODULOS_DO_SISTEMA.forEach(({ chave }) => {
        const salva = data.find((regra) => regra.nome_modulo === chave);
        regras[chave] = {
            pode_acessar: Boolean(salva?.pode_acessar),
            pode_novo: Boolean(salva?.pode_novo),
            pode_editar: Boolean(salva?.pode_editar)
        };
    });
    return regras;
}

export async function salvarRegras(perfil: string, regras: RegrasPorModulo): Promise<void> {
    await api.post('/regras/salvar', {
        perfil,
        regras: Object.entries(regras).map(([modulo, regra]) => ({ modulo, ...regra }))
    });
}
