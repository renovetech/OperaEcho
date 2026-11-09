/* Painéis, relatórios, abas e menu: fonte única para a navegação e para as rotas. */
export interface ItemCatalogo {
    slug: string;
    chave: string;
    modulo: string;
    titulo: string;
}

export const PAINEIS: ItemCatalogo[] = [
    { slug: 'implantacoes-consolidadas', chave: 'implatacao_consolidada', modulo: 'painel_consolidado', titulo: 'Implantações Consolidadas' },
    { slug: 'produtividade-individual', chave: 'produtividade', modulo: 'painel_prod_ind', titulo: 'Produtividade Individual' },
    { slug: 'produtividade-unidade', chave: 'produtos_detalhado', modulo: 'painel_prod_uni', titulo: 'Produtividade Por Unidade' },
    { slug: 'metricas-implantacao', chave: 'metricas_implantacao', modulo: 'painel_metricas', titulo: 'Métricas da Implantação' }
];

export const RELATORIOS: ItemCatalogo[] = [
    { slug: 'estatistica-atividades', chave: 'estatistica_atividades', modulo: 'rel_estatisticas', titulo: 'Estatísticas da Implantação' },
    { slug: 'estatistica-projetos', chave: 'estatistica_projetos', modulo: 'rel_estatisticas_projetos', titulo: 'Estatística dos Projetos' },
    { slug: 'tempo-medio-acao', chave: 'tempo_medio_acao', modulo: 'rel_tempo_medio', titulo: 'Tempo Médio de Ação' },
    { slug: 'plano-acao-status', chave: 'plano_acao_status', modulo: 'rel_plano_acao', titulo: 'Plano de Ação - Status e Execução' },
    { slug: 'auditoria-localizacao', chave: 'auditoria_localizacao', modulo: 'rel_auditoria_loc', titulo: 'Auditoria de Localização' },
    { slug: 'presenca-implantador', chave: 'presenca_implantador', modulo: 'rel_presenca_implantador', titulo: 'Presença por Implantador' },
    { slug: 'presenca-equipe', chave: 'presenca_equipe', modulo: 'rel_presenca_equipe', titulo: 'Presença por Equipe' },
    { slug: 'projetos-ativos', chave: 'projetos_ativos', modulo: 'rel_projetos_ativos', titulo: 'Projetos Ativos' },
    { slug: 'mapa-unidades', chave: 'mapa_unidades', modulo: 'rel_mapa_unidades', titulo: 'Mapa de Unidades' }
];

export interface ItemMenu {
    rotulo: string;
    para: string;
    modulo: string;
}

export interface GrupoMenu {
    titulo?: string;
    itens: ItemMenu[];
}

export interface SecaoMenu {
    rotulo: string;
    grupos: GrupoMenu[];
}

const itensDoCatalogo = (catalogo: ItemCatalogo[], raiz: string, modulos?: string[]): ItemMenu[] => catalogo
    .filter((item) => !modulos || modulos.includes(item.modulo))
    .map((item) => ({ rotulo: item.titulo, para: `${raiz}/${item.slug}`, modulo: item.modulo }));

export const MENU: SecaoMenu[] = [
    {
        rotulo: 'Cadastros',
        grupos: [{
            itens: [
                { rotulo: 'Usuários', para: '/system/cadastros/usuarios', modulo: 'usuarios' },
                { rotulo: 'Produtos', para: '/system/cadastros/produtos', modulo: 'produtos' },
                { rotulo: 'Projetos', para: '/system/cadastros/projetos', modulo: 'projetos' },
                { rotulo: 'Unidades', para: '/system/cadastros/unidades', modulo: 'unidades' },
                { rotulo: 'Macro e Micro Regiões', para: '/system/cadastros/regioes', modulo: 'regioes' },
                { rotulo: 'Perfil de Acesso', para: '/system/cadastros/perfis', modulo: 'perfis' }
            ]
        }]
    },
    {
        rotulo: 'Implantação',
        grupos: [{
            itens: [
                { rotulo: 'Registro de Atividades', para: '/system/implantacao/atividades', modulo: 'registro_atividades' },
                { rotulo: 'Lançar Hora Extra', para: '/system/implantacao/hora-extra', modulo: 'hora_extra' },
                { rotulo: 'Gerador de Escalas', para: '/system/implantacao/escalas', modulo: 'escala' },
                { rotulo: 'Solicitação de Férias', para: '/system/implantacao/ferias', modulo: 'ferias_solicitacao' }
            ]
        }]
    },
    {
        rotulo: 'Projetos',
        grupos: [{
            itens: [
                { rotulo: 'Registro de Atividades', para: '/system/projetos/atividades', modulo: 'proj_registro_atividades' },
                { rotulo: 'Lançar Hora Extra', para: '/system/projetos/hora-extra', modulo: 'proj_hora_extra' },
                { rotulo: 'Gerador de Escalas', para: '/system/projetos/escalas', modulo: 'proj_escala' },
                { rotulo: 'Solicitação de Férias', para: '/system/projetos/ferias', modulo: 'proj_ferias_solicitacao' }
            ]
        }]
    },
    {
        rotulo: 'Painéis',
        grupos: [{
            itens: [
                ...itensDoCatalogo(PAINEIS, '/system/paineis'),
                { rotulo: 'Plano de Ação', para: '/system/plano-acao/painel', modulo: 'painel_plano_acao' },
                { rotulo: 'Faturamento Consolidado', para: '/system/faturamento/consolidado', modulo: 'painel_faturamento' }
            ]
        }]
    },
    {
        rotulo: 'Operações',
        grupos: [{
            itens: [
                { rotulo: 'Plano de Ação', para: '/system/plano-acao', modulo: 'plano_acao' },
                { rotulo: 'Aprovação de Férias', para: '/system/gestao/ferias', modulo: 'ferias_gestao' },
                { rotulo: 'Lançar Faturamento', para: '/system/faturamento/lancamento', modulo: 'faturamento_lancar' },
                { rotulo: 'Links Externos', para: '/system/links', modulo: 'links_externos' },
                { rotulo: 'Consulta SIGTAP', para: '/sigtap', modulo: 'sigtap' },
                { rotulo: 'Indicadores APS', para: '/system/indicadores-aps', modulo: 'indicadores_aps' }
            ]
        }]
    },
    {
        rotulo: 'Relatórios',
        grupos: [
            { titulo: 'Operação', itens: itensDoCatalogo(RELATORIOS, '/system/relatorios', ['rel_estatisticas', 'rel_estatisticas_projetos', 'rel_tempo_medio', 'rel_plano_acao']) },
            { titulo: 'Localização & Presença', itens: itensDoCatalogo(RELATORIOS, '/system/relatorios', ['rel_auditoria_loc', 'rel_presenca_implantador', 'rel_presenca_equipe']) },
            { titulo: 'Projetos & Unidades', itens: itensDoCatalogo(RELATORIOS, '/system/relatorios', ['rel_projetos_ativos', 'rel_mapa_unidades']) }
        ]
    }
];

export const LINK_PARAMETROS: ItemMenu = { rotulo: 'Parâmetros', para: '/system/parametros', modulo: 'parametros' };

/** Rotas da seção: "/system/plano-acao/:id" pertence a Operações; o painel, a Painéis. */
export function secaoDoCaminho(caminho: string): string | undefined {
    if (caminho.startsWith(LINK_PARAMETROS.para)) return LINK_PARAMETROS.rotulo;
    const candidatos = MENU.flatMap((secao) => secao.grupos.flatMap((grupo) => grupo.itens.map((item) => ({ secao: secao.rotulo, para: item.para }))));
    const melhor = candidatos
        .filter(({ para }) => caminho === para || caminho.startsWith(`${para}/`))
        .sort((a, b) => b.para.length - a.para.length)[0];
    return melhor?.secao;
}
