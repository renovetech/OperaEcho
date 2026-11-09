/* Painéis (/dashboard): cada rota gera as mesmas consultas para visão global, lotação restrita e sem lotação.
 * Limite do banco falso: a consulta de notificações começa igual à da sessão e é respondida por ela
 * (função "Teste"), então só o ramo de quem não aprova cadastros é exercitado. */
const { caracterizar } = require('../apoio/caracterizacao');

const PERIODO = 'dataInicio=2026-10-01&dataFim=2026-10-31';
const ESCOPO = /SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id/;
const global = [ESCOPO, [{ id_lotacao: 0 }]];
const globalNulo = [ESCOPO, [{ id_lotacao: null }]];
const lotado = [ESCOPO, [{ id_lotacao: 2 }]];
const semUsuario = [ESCOPO, []];

const linhasAtividade = [
    { id_atividade: 1, nome_projeto: 'Projeto A', implantador: 'Ana', unidade: 'UBS Centro', motivo: 'Treinamento' },
    { id_atividade: 1, nome_projeto: 'Projeto A', implantador: 'Bia', unidade: 'UBS Centro', motivo: 'Treinamento' },
    { id_atividade: 2, nome_projeto: 'Projeto A', implantador: 'Ana', unidade: 'UBS Norte', motivo: 'Visita' },
    { id_atividade: 3, nome_projeto: 'Equipe Geral', implantador: null, unidade: null, motivo: null },
    { id_atividade: 4, nome_projeto: 'Projeto B', implantador: 'Caio', unidade: 'UPA', motivo: 'Apoio' }
];
const respostaAtividades = [/WITH TodosVinculos AS \(SELECT id_atividade, id_implantador FROM tab_/, linhasAtividade];

const casos = [
    { nome: 'totais: visão global', url: '/dashboard/totais', respostas: [global] },
    { nome: 'totais: global com lotação nula', url: '/dashboard/totais', respostas: [globalNulo] },
    { nome: 'totais: lotação restrita', url: '/dashboard/totais', respostas: [lotado], perfil: 'Implantador', id: 7 },
    { nome: 'totais: usuário sem lotação', url: '/dashboard/totais', respostas: [semUsuario] },
    { nome: 'totais: sem login', url: '/dashboard/totais', anonimo: true },

    { nome: 'proximas-ferias: visão global', url: '/dashboard/proximas-ferias', respostas: [global, [/FROM tab_ferias f/, [{ nome_completo: 'Ana', data_inicio: '2026-12-01T03:00:00.000Z', data_fim: '2026-12-15T03:00:00.000Z' }]]] },
    { nome: 'proximas-ferias: lotação restrita', url: '/dashboard/proximas-ferias', respostas: [lotado] },
    { nome: 'proximas-ferias: usuário sem lotação', url: '/dashboard/proximas-ferias', respostas: [semUsuario] },

    { nome: 'progresso-planos: visão global', url: '/dashboard/progresso-planos', respostas: [global, [/FROM tab_plano_acao p LEFT JOIN tab_projetos proj/, [
        { id_plano: 1, titulo: 'Plano 1', nome_projeto: 'Projeto A', total_tarefas: 10, tarefas_concluidas: 5, tarefas_andamento: 3, tarefas_atrasadas: 1 },
        { id_plano: 2, titulo: 'Plano 2', nome_projeto: 'Projeto Geral', total_tarefas: 0, tarefas_concluidas: 0, tarefas_andamento: 0, tarefas_atrasadas: 0 }
    ]]] },
    { nome: 'progresso-planos: lotação restrita', url: '/dashboard/progresso-planos', respostas: [lotado] },
    { nome: 'progresso-planos: usuário sem lotação', url: '/dashboard/progresso-planos', respostas: [semUsuario] },

    { nome: 'atividades-hoje: sem data', url: '/dashboard/atividades-hoje', respostas: [respostaAtividades] },
    { nome: 'atividades-hoje: com data', url: '/dashboard/atividades-hoje?data=2026-10-15', respostas: [respostaAtividades] },
    { nome: 'atividades-hoje: sem atividades', url: '/dashboard/atividades-hoje', respostas: [[/WITH TodosVinculos/, []]] },
    { nome: 'atividades-hoje-projetos: sem data', url: '/dashboard/atividades-hoje-projetos', respostas: [respostaAtividades] },
    { nome: 'atividades-hoje-projetos: com data', url: '/dashboard/atividades-hoje-projetos?data=2026-10-15', respostas: [respostaAtividades], perfil: 'Implantador', id: 7 },

    { nome: 'notificacoes: quem não aprova recebe lista vazia', url: '/dashboard/notificacoes' },
    { nome: 'notificacoes: perfil restrito', url: '/dashboard/notificacoes', perfil: 'Implantador', id: 7 },

    { nome: 'mapa-implantacao: sem período', url: '/dashboard/mapa-implantacao', respostas: [[/FROM tab_atividades a JOIN tab_projetos p/, [{ id_atividade: 1, profissionais_env: 'Maria', motivos: 'Treinamento', data_inicio: '2026-10-01T03:00:00.000Z', data_fim: null, nome_projeto: 'Projeto A', nome_unidade: 'UBS', cidade: 'Niteroi', uf: 'RJ', latitude: '-22.9', longitude: '-43.1' }]]] },
    { nome: 'mapa-implantacao: com período', url: `/dashboard/mapa-implantacao?${PERIODO}` },
    { nome: 'mapa-implantacao: só data inicial é recusada', url: '/dashboard/mapa-implantacao?dataInicio=2026-10-01' },

    { nome: 'produtividade-produtos', url: '/dashboard/produtividade-produtos', respostas: [
        [/FROM tab_produtos p LEFT JOIN tab_unidade_produtos up/, [{ nome_produto: 'Prontuario', qtd_unidades: 4 }]],
        [/FROM tab_usuarios u INNER JOIN tab_atividade_implantadores ai/, [{ implantador: 'Ana', nome_produto: 'Prontuario', qtd_atividades: 2 }]]
    ] },
    { nome: 'detalhes-produto: sem período', url: '/dashboard/detalhes-produto?nome_produto=Prontuario', respostas: [[/CROSS APPLY STRING_SPLIT\(a\.produtos_trabalhados/, [{ implantador: 'Ana', projeto: 'Projeto A', unidade: 'UBS', data_atividade: '2026-10-01T12:00:00', motivos: 'Treinamento' }]]] },
    { nome: 'detalhes-produto: com período', url: `/dashboard/detalhes-produto?nome_produto=Prontuario&${PERIODO}` },
    { nome: 'estatisticas-produtividade: sem período', url: '/dashboard/estatisticas-produtividade', respostas: [[/WITH TodosImplantadores/, [{ implantador: 'Ana', total_atividades_real: 4, qtd_implantacao: 1, qtd_treinamento: 2, qtd_visita: 1, qtd_apoio: 0 }]]] },
    { nome: 'estatisticas-produtividade: com período', url: `/dashboard/estatisticas-produtividade?${PERIODO}` },
    { nome: 'detalhe-produtividade: só implantador', url: '/dashboard/detalhe-produtividade?implantador=Ana', respostas: [[/WITH TodosImplantadores/, [{ data: '2026-10-01T12:00:00', projeto: 'Projeto A', unidade: 'UBS', profissionais_env: 'Maria' }]]] },
    { nome: 'detalhe-produtividade: motivo e período', url: `/dashboard/detalhe-produtividade?implantador=Ana&motivo=Treinamento&${PERIODO}` },
    { nome: 'metricas-implantacao: sem período', url: '/dashboard/metricas-implantacao', respostas: [[/WITH TodosVinculos AS .* BaseReal AS/, [{ implantador: 'Ana', produto: 'Prontuario', total_real_implantador: 4, qtd_implantacao: 1, qtd_treinamento: 2 }]]] },
    { nome: 'metricas-implantacao: com período', url: `/dashboard/metricas-implantacao?${PERIODO}` },
];

const REGRAS_DOS_PAINEIS = [/FROM tab_regras_acesso/, ['painel_consolidado', 'painel_prod_ind', 'painel_prod_uni', 'painel_metricas'].map((nome_modulo) => ({ nome_modulo, pode_acessar: true, pode_novo: true, pode_editar: true }))];
const comModuloDoPerfil = (caso) => (caso.perfil ? { ...caso, respostas: [REGRAS_DOS_PAINEIS, ...(caso.respostas ?? [])] } : caso);
const ROTAS_PROTEGIDAS = ['mapa-implantacao', 'detalhes-produto?nome_produto=X', 'estatisticas-produtividade', 'detalhe-produtividade?implantador=X', 'metricas-implantacao', 'produtividade-produtos'];
const semModulo = ROTAS_PROTEGIDAS.map((rota) => ({ nome: `sem módulo: ${rota}`, url: `/dashboard/${rota}`, perfil: 'Visitante', id: 7, respostas: [[/FROM tab_regras_acesso/, []]] }));

caracterizar('paineis', casos.map(comModuloDoPerfil).concat(semModulo));
