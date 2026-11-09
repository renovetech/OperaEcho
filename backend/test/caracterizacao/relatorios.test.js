/* Relatórios: cada rota gera as mesmas consultas, em cada combinação de filtros e de perfil. */
const { caracterizar } = require('../apoio/caracterizacao');

// O plano de ação depende do dia atual: congela o relógio para a base não mudar de um dia para o outro.
const INSTANTE_FIXO = new Date('2026-11-08T15:00:00Z').getTime();
Date.now = () => INSTANTE_FIXO;

const MODULOS = ['rel_estatisticas', 'rel_estatisticas_projetos', 'rel_auditoria_loc', 'rel_presenca_implantador', 'rel_presenca_equipe',
    'rel_projetos_ativos', 'rel_mapa_unidades', 'rel_tempo_medio', 'rel_plano_acao'];
const concede = (modulos) => [/FROM tab_regras_acesso/, modulos.map((nome) => ({ nome_modulo: nome, pode_acessar: true, pode_novo: false, pode_editar: false }))];
const REGRAS_RESTRITO = concede(MODULOS);
const SEM_REGRAS = [/FROM tab_regras_acesso/, []];
const PERIODO = 'dataInicio=2026-10-01&dataFim=2026-10-31';

const linhaEstatistica = { motivos: 'Treinamento', nome_projeto: 'Projeto A', nome_unidade: 'UBS Centro', produtos_trabalhados: 'Prontuario', profissionais_env: 'Maria', data_inicial: '01/10/2026', tempo_gasto: '02:00', qtd: 3, implantadores: 'Ana, Bia', equipe_projeto: 'Caio' };
const linhasEscala = [
    { nome_projeto: 'Projeto A', nome_unidade: 'UBS Centro', nome_implantador: 'Ana', data_fmt: '01/10/2026', data_escala: '2026-10-01T03:00:00.000Z' },
    { nome_projeto: 'Projeto A', nome_unidade: 'UBS Centro', nome_implantador: 'Ana', data_fmt: '02/10/2026', data_escala: '2026-10-02T03:00:00.000Z' },
    { nome_projeto: 'Projeto A', nome_unidade: 'UBS Centro', nome_implantador: 'Bia', data_fmt: '01/10/2026', data_escala: '2026-10-01T03:00:00.000Z' },
    { nome_projeto: 'Projeto A', nome_unidade: 'UBS Norte', nome_implantador: 'Bia', data_fmt: '03/10/2026', data_escala: '2026-10-03T03:00:00.000Z' },
    { nome_projeto: 'Projeto B', nome_unidade: 'UPA', nome_implantador: 'Caio', data_fmt: '05/10/2026', data_escala: '2026-10-05T03:00:00.000Z' }
];
const linhasPresenca = [
    { id_atividade: 10, data_inicio: '2026-10-01', data_fim: '2026-10-01', nome_projeto: 'Projeto A', nome_unidade: 'UBS Centro', nome_implantador: 'Ana' },
    { id_atividade: 11, data_inicio: '2026-10-02', data_fim: '2026-10-02', nome_projeto: 'Projeto B', nome_unidade: 'UPA', nome_implantador: 'Caio' }
];
const linhasProjetos = [
    { id_projeto: 2, nome_projeto: 'Projeto A', gera_lotacao: true, categoria: 'A' },
    { id_projeto: 3, nome_projeto: 'Projeto B', gera_lotacao: false, categoria: 'B' }
];
const respostasProjetosAtivos = [
    [/SELECT p\.id_projeto, p\.nome_projeto, p\.gera_lotacao/, linhasProjetos],
    [/SUM\(CASE WHEN u\.ativo = 1 THEN 1/, [{ id_projeto: 2, ativas: 4, inativas: 1, georref: 3, municipios: 2 }]],
    [/SELECT DISTINCT u\.id_projeto, e\.sigla/, [{ id_projeto: 2, sigla: 'RJ' }, { id_projeto: 2, sigla: 'SP' }]],
    [/CONVERT\(varchar\(10\), MAX/, [{ id_projeto: 2, data: '30/10/2026' }]],
    [/COUNT\(\*\) AS qtd FROM tab_atividades a/, [{ id_projeto: 2, qtd: 7 }]],
    [/COUNT\(\*\) AS qtd FROM tab_proj_atividades a/, [{ id_projeto: 3, qtd: 2 }]],
    [/FROM tab_unidade_produtos up JOIN tab_unidades u/, [{ id_projeto: 2, id_produto: 9, nome_produto: 'Prontuario', unidades: 4 }]]
];
const linhasMapa = [
    { id_unidade: 1, nome_unidade: 'UBS Centro', cnes: '123', ativo: true, id_projeto: 2, nome_projeto: 'Projeto A', categoria: 'A', id_cidade: 5, nome_cidade: 'Niteroi', uf: 'RJ', latitude: '-22.9', longitude: '-43.1', lat_cidade: '-22.8', lng_cidade: '-43.0', ids_produtos: '9,10', nomes_produtos: 'Prontuario||Agenda' },
    { id_unidade: 2, nome_unidade: 'UBS Norte', cnes: '456', ativo: true, id_projeto: 2, nome_projeto: 'Projeto A', categoria: 'A', id_cidade: 5, nome_cidade: 'Niteroi', uf: 'RJ', latitude: null, longitude: null, lat_cidade: '-22.8', lng_cidade: '-43.0', ids_produtos: null, nomes_produtos: null },
    { id_unidade: 3, nome_unidade: 'UPA', cnes: '789', ativo: false, id_projeto: 3, nome_projeto: 'Projeto B', categoria: 'B', id_cidade: 6, nome_cidade: 'Macae', uf: 'RJ', latitude: null, longitude: null, lat_cidade: null, lng_cidade: null, ids_produtos: '9', nomes_produtos: '' }
];
const linhasTempo = [
    { id_item: 1, descricao: 'Treinar', responsavel: 'Ana', status: 'Fechado', prioridade: 'Alta', modulo: 'Agenda', titulo_plano: 'Plano 1', nome_projeto: 'Projeto A', previsto_min: 60, gasto_min: 90, inicio_real: '01/10/2026', fim_real: '02/10/2026' },
    { id_item: 2, descricao: 'Treinar', responsavel: 'Bia', status: 'Fechado', prioridade: 'Alta', modulo: 'Agenda', titulo_plano: 'Plano 1', nome_projeto: 'Projeto A', previsto_min: 60, gasto_min: 30, inicio_real: null, fim_real: null },
    { id_item: 3, descricao: 'Instalar', responsavel: 'Ana', status: 'Fechado', prioridade: 'Media', modulo: 'Prontuario', titulo_plano: 'Plano 1', nome_projeto: 'Projeto A', previsto_min: 100, gasto_min: 105, inicio_real: null, fim_real: null },
    { id_item: 4, descricao: '', responsavel: '', status: 'A Iniciar', prioridade: 'Baixa', modulo: null, titulo_plano: 'Plano 2', nome_projeto: null, previsto_min: 0, gasto_min: null, inicio_real: null, fim_real: null }
];
const planoBase = [
    [/FROM tab_plano_acao p LEFT JOIN tab_projetos pj/, [{ id_plano: 1, titulo: 'Plano 1', status: 'EM ANDAMENTO', sub_tipo: 'Implantacao', cliente: 'Prefeitura', descricao: 'x', data_criacao: '2026-09-01T03:00:00.000Z', data_inicio_prevista: '2026-09-01', data_fim_prevista: '2026-12-01', data_encerramento: null, publico: false, token_publico: null, criado_por: 'Ana', id_projeto: 2, nome_projeto: 'Projeto A', nome_produto: 'Prontuario' }]],
    [/FROM tab_plano_itens i LEFT JOIN tab_unidades u/, [
        { id_item: 1, id_plano: 1, id_unidade: 5, nome_unidade: 'UBS Centro', modulo: 'Agenda', grupo: 'G', descricao: 'Treinar', responsavel: 'Ana', cliente: null, observacao: '', status: 'Fechado', prioridade: 'Alta', ordem: 1, percentual: 100, data_inicio: '2026-09-01', data_fim: '2026-09-10', data_inicio_real: '2026-09-01', data_fim_real: '2026-09-09', tempo_previsto: 60, tempo_gasto: 50, horas_trabalhadas: 1 },
        { id_item: 2, id_plano: 1, id_unidade: null, nome_unidade: null, modulo: 'Prontuario', grupo: null, descricao: 'Instalar', responsavel: 'Bia', cliente: null, observacao: '', status: 'Em andamento', prioridade: 'Media', ordem: 2, percentual: 40, data_inicio: '2026-10-01', data_fim: '2026-10-20', data_inicio_real: null, data_fim_real: null, tempo_previsto: 120, tempo_gasto: 30, horas_trabalhadas: 0 },
        { id_item: 3, id_plano: 1, id_unidade: 5, nome_unidade: 'UBS Centro', modulo: 'Agenda', grupo: 'G', descricao: 'Revisar', responsavel: 'Ana', cliente: null, observacao: '', status: 'A Iniciar', prioridade: 'Baixa', ordem: 3, percentual: 0, data_inicio: null, data_fim: '2026-12-30', data_inicio_real: null, data_fim_real: null, tempo_previsto: 0, tempo_gasto: 0, horas_trabalhadas: 0 }
    ]],
    [/FROM tab_plano_item_equipe e/, [{ id_item: 1, id_plano: 1, id_usuario: 3, nome_completo: 'Ana Maria Souza' }]],
    [/FROM tab_plano_apontamentos a/, [{ id_item: 1, id_plano: 1, id_usuario: 3, nome_nome: 'x', nome_completo: 'Ana Maria Souza', data_execucao: '2026-09-05', minutos: 50 }]]
];

const comPerfilRestrito = { perfil: 'Implantador', id: 7 };
const semPermissao = { perfil: 'Visitante', id: 8, respostas: [SEM_REGRAS] };
const restrito = (extra = []) => ({ ...comPerfilRestrito, respostas: [REGRAS_RESTRITO, ...extra] });

const casos = [
    // Estatísticas da implantação
    { nome: 'estatisticas-atividades: sem filtros', url: '/relatorios/estatisticas-atividades', respostas: [[/WITH ImpAtiv/, [linhaEstatistica]]] },
    { nome: 'estatisticas-atividades: todos os filtros', url: `/relatorios/estatisticas-atividades?${PERIODO}&motivo=Treinamento&projeto=2&unidade=5`, respostas: [[/WITH ImpAtiv/, [linhaEstatistica]]] },
    { nome: 'estatisticas-atividades: Todos/Todas ignorados', url: '/relatorios/estatisticas-atividades?motivo=Todos&projeto=Todos&unidade=Todas' },
    { nome: 'estatisticas-atividades: perfil restrito', url: '/relatorios/estatisticas-atividades', ...restrito([[/WITH ImpAtiv/, [linhaEstatistica]]]) },
    { nome: 'estatisticas-atividades: sem permissão', url: '/relatorios/estatisticas-atividades', ...semPermissao },
    { nome: 'estatisticas-atividades: só data inicial é recusada', url: '/relatorios/estatisticas-atividades?dataInicio=2026-10-01' },
    { nome: 'estatisticas-atividades: sem login', url: '/relatorios/estatisticas-atividades', anonimo: true },

    // Estatísticas dos projetos
    { nome: 'estatisticas-projetos: sem filtros', url: '/relatorios/estatisticas-projetos', respostas: [[/FROM tab_proj_atividades a JOIN/, [linhaEstatistica]]] },
    { nome: 'estatisticas-projetos: todos os filtros', url: `/relatorios/estatisticas-projetos?${PERIODO}&motivo=Visita&projeto=3&unidade=6`, respostas: [[/FROM tab_proj_atividades a JOIN/, [linhaEstatistica]]] },
    { nome: 'estatisticas-projetos: perfil restrito isola por projeto', url: '/relatorios/estatisticas-projetos', ...restrito([[/FROM tab_proj_atividades a JOIN/, [linhaEstatistica]]]) },
    { nome: 'estatisticas-projetos: sem permissão', url: '/relatorios/estatisticas-projetos', ...semPermissao },

    // Auditoria de localização
    { nome: 'auditoria-localizacao: sem filtros', url: '/relatorios/auditoria-localizacao', respostas: [[/FROM tab_rastreamento_app/, [{ id_rastreio: 1, usuario: 'ana', latitude: '-22.9', longitude: '-43.1', tipo_registro: 'ATIVIDADE', data_hora: '2026-10-01T10:00:00.000Z', detalhes_registro: 'x' }]]] },
    { nome: 'auditoria-localizacao: todos os filtros', url: `/relatorios/auditoria-localizacao?${PERIODO}&usuario=ana&tipo_registro=ATIVIDADE` },
    { nome: 'auditoria-localizacao: Todos ignorados', url: '/relatorios/auditoria-localizacao?usuario=Todos&tipo_registro=Todos' },
    { nome: 'auditoria-localizacao: perfil restrito', url: '/relatorios/auditoria-localizacao', ...restrito() },
    { nome: 'auditoria-localizacao: sem permissão', url: '/relatorios/auditoria-localizacao', ...semPermissao },

    // Presença por implantador
    { nome: 'presenca-implantador: sem período', url: '/relatorios/presenca-implantador' },
    { nome: 'presenca-implantador: período', url: `/relatorios/presenca-implantador?${PERIODO}`, respostas: [[/FROM tab_escalas e JOIN/, linhasEscala]] },
    { nome: 'presenca-implantador: projeto e unidade', url: `/relatorios/presenca-implantador?${PERIODO}&id_projeto=2&id_unidade=5`, respostas: [[/FROM tab_escalas e JOIN/, linhasEscala]] },
    { nome: 'presenca-implantador: Todos ignorados', url: `/relatorios/presenca-implantador?${PERIODO}&id_projeto=Todos&id_unidade=Todas` },
    { nome: 'presenca-implantador: perfil restrito', url: `/relatorios/presenca-implantador?${PERIODO}`, ...restrito([[/FROM tab_escalas e JOIN/, linhasEscala]]) },
    { nome: 'presenca-implantador: sem permissão', url: `/relatorios/presenca-implantador?${PERIODO}`, ...semPermissao },

    // Presença por data (equipe)
    { nome: 'presenca-equipe: sem período', url: '/relatorios/presenca-equipe' },
    { nome: 'presenca-equipe: período', url: `/relatorios/presenca-equipe?${PERIODO}`, respostas: [[/FROM tab_escalas e JOIN/, linhasEscala]] },
    { nome: 'presenca-equipe: projeto e unidade', url: `/relatorios/presenca-equipe?${PERIODO}&id_projeto=2&id_unidade=5`, respostas: [[/FROM tab_escalas e JOIN/, linhasEscala]] },
    { nome: 'presenca-equipe: Todos ignorados', url: `/relatorios/presenca-equipe?${PERIODO}&id_projeto=Todos&id_unidade=Todas` },
    { nome: 'presenca-equipe: perfil restrito', url: `/relatorios/presenca-equipe?${PERIODO}`, ...restrito([[/FROM tab_escalas e JOIN/, linhasEscala]]) },
    { nome: 'presenca-equipe: sem permissão', url: `/relatorios/presenca-equipe?${PERIODO}`, ...semPermissao },

    // Presença de implantadores e equipe (lista plana)
    { nome: 'presenca-implantadores: sem filtros', url: '/relatorios/presenca-implantadores', respostas: [[/FROM tab_escalas e INNER JOIN/, linhasPresenca]] },
    { nome: 'presenca-implantadores: todos os filtros', url: `/relatorios/presenca-implantadores?${PERIODO}&id_projeto=2&id_unidade=5&motivo=Treinamento`, respostas: [[/FROM tab_escalas e INNER JOIN/, linhasPresenca]] },
    { nome: 'presenca-implantadores: Todos e vazios ignorados', url: '/relatorios/presenca-implantadores?id_projeto=Todos&id_unidade=Todas&motivo=Todos' },
    { nome: 'presenca-implantadores: filtros vazios', url: '/relatorios/presenca-implantadores?id_projeto=&id_unidade=&motivo=' },
    { nome: 'presenca-implantadores: perfil restrito', url: `/relatorios/presenca-implantadores?${PERIODO}`, ...restrito([[/FROM tab_escalas e INNER JOIN/, linhasPresenca]]) },
    { nome: 'presenca-implantadores: basta um dos dois módulos', url: '/relatorios/presenca-implantadores', perfil: 'Coordenador', id: 9, respostas: [concede(['rel_presenca_equipe']), [/FROM tab_escalas e INNER JOIN/, linhasPresenca]] },
    { nome: 'presenca-implantadores: sem permissão', url: '/relatorios/presenca-implantadores', ...semPermissao },

    // Projetos ativos
    { nome: 'projetos-ativos: sem filtros', url: '/relatorios/projetos-ativos', respostas: respostasProjetosAtivos },
    { nome: 'projetos-ativos: todos os filtros', url: `/relatorios/projetos-ativos?${PERIODO}&id_projeto=2&categoria=a`, respostas: respostasProjetosAtivos },
    { nome: 'projetos-ativos: período fora do formato é ignorado', url: '/relatorios/projetos-ativos?dataInicio=Todos&dataFim=Todos', respostas: respostasProjetosAtivos },
    { nome: 'projetos-ativos: Todos ignorados', url: '/relatorios/projetos-ativos?id_projeto=Todos&categoria=Todas', respostas: respostasProjetosAtivos },
    { nome: 'projetos-ativos: nenhum projeto', url: `/relatorios/projetos-ativos?${PERIODO}`, respostas: [[/SELECT p\.id_projeto, p\.nome_projeto, p\.gera_lotacao/, []]] },
    { nome: 'projetos-ativos: perfil restrito', url: '/relatorios/projetos-ativos', ...restrito(respostasProjetosAtivos) },
    { nome: 'projetos-ativos: sem permissão', url: '/relatorios/projetos-ativos', ...semPermissao },

    // Mapa de unidades
    { nome: 'mapa-unidades: sem projeto nem categoria', url: '/relatorios/mapa-unidades' },
    { nome: 'mapa-unidades: por projeto', url: '/relatorios/mapa-unidades?id_projeto=2', respostas: [[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]] },
    { nome: 'mapa-unidades: por categoria', url: '/relatorios/mapa-unidades?categoria=b', respostas: [[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]] },
    { nome: 'mapa-unidades: todos os filtros', url: '/relatorios/mapa-unidades?id_projeto=2&categoria=A&id_produto=9&status=false&id_cidade=5&uf=RJ', respostas: [[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]] },
    { nome: 'mapa-unidades: status Todos', url: '/relatorios/mapa-unidades?id_projeto=2&status=Todos&id_produto=Todos&id_cidade=Todos&uf=Todos', respostas: [[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]] },
    { nome: 'mapa-unidades: status true', url: '/relatorios/mapa-unidades?id_projeto=2&status=true', respostas: [[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]] },
    { nome: 'mapa-unidades: perfil restrito', url: '/relatorios/mapa-unidades?id_projeto=2', ...restrito([[/FROM tab_unidades u LEFT JOIN tab_cidades c/, linhasMapa]]) },
    { nome: 'mapa-unidades: sem permissão', url: '/relatorios/mapa-unidades?id_projeto=2', ...semPermissao },

    // Tempo médio de ação
    { nome: 'tempo-medio-acao: sem filtros', url: '/relatorios/tempo-medio-acao', respostas: [[/FROM tab_plano_itens i JOIN tab_plano_acao pa/, linhasTempo]] },
    { nome: 'tempo-medio-acao: todos os filtros', url: `/relatorios/tempo-medio-acao?${PERIODO}&id_projeto=2&responsavel=Ana&status=Fechado`, respostas: [[/FROM tab_plano_itens i JOIN tab_plano_acao pa/, linhasTempo]] },
    { nome: 'tempo-medio-acao: Todos e vazios ignorados', url: '/relatorios/tempo-medio-acao?id_projeto=Todos&responsavel=&status=Todos' },
    { nome: 'tempo-medio-acao: sem nenhuma linha', url: '/relatorios/tempo-medio-acao', respostas: [[/FROM tab_plano_itens i JOIN tab_plano_acao pa/, []]] },
    { nome: 'tempo-medio-acao: perfil restrito isola por projeto', url: '/relatorios/tempo-medio-acao', ...restrito([[/FROM tab_plano_itens i JOIN tab_plano_acao pa/, linhasTempo]]) },
    { nome: 'tempo-medio-acao: sem permissão', url: '/relatorios/tempo-medio-acao', ...semPermissao },

    // Plano de ação
    { nome: 'plano-acao: sem filtros', url: '/relatorios/plano-acao', respostas: planoBase },
    { nome: 'plano-acao: filtros da base', url: `/relatorios/plano-acao?${PERIODO}&id_plano=1&id_projeto=2&status_plano=EM%20ANDAMENTO&cliente=Prefeitura`, respostas: planoBase },
    { nome: 'plano-acao: filtros dos itens', url: '/relatorios/plano-acao?responsavel=Ana&status=Fechado&situacao_prazo=NO%20PRAZO', respostas: planoBase },
    { nome: 'plano-acao: filtros dos itens sem resultado', url: '/relatorios/plano-acao?responsavel=Zoe', respostas: planoBase },
    { nome: 'plano-acao: Todos ignorados e valores inválidos', url: '/relatorios/plano-acao?id_projeto=Todos&status_plano=Todos&id_plano=abc&responsavel=Todos&status=Todos&situacao_prazo=Todos', respostas: planoBase },
    { nome: 'plano-acao: nenhum plano', url: '/relatorios/plano-acao', respostas: [[/FROM tab_plano_acao p LEFT JOIN tab_projetos pj/, []]] },
    { nome: 'plano-acao: perfil restrito isola por projeto', url: '/relatorios/plano-acao', ...restrito(planoBase) },
    { nome: 'plano-acao: sem permissão', url: '/relatorios/plano-acao', ...semPermissao }
];

caracterizar('relatorios', casos);
