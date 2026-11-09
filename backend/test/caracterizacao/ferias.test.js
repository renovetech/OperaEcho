/* Férias: cada rota continua gerando as mesmas consultas, status e respostas.
 * Obs.: a consulta de usuários com LEFT JOIN tab_funcoes é tratada pelo banco falso como consulta da sessão
 * (ver test/apoio/caracterizacao.js); por isso /ferias/relatorio-prazos e /ferias/colaboradores (implantação, visão global)
 * recebem a linha da sessão. O cálculo do relatório é coberto em test/ferias.service.test.js. */
const { caracterizar } = require('../apoio/caracterizacao');

const COLABORADOR = { id_usuario: 5, nome_completo: 'Maria Souza', senha_hash: 'segredo', funcao: 'Implantador', ativo: true, data_admissao: new Date('2020-03-15T00:00:00.000Z') };
const ADMISSAO = [/SELECT data_admissao FROM tab_usuarios/, [{ data_admissao: new Date('2020-03-15T00:00:00.000Z') }]];
const SEM_ADMISSAO = [/SELECT data_admissao FROM tab_usuarios/, [{ data_admissao: null }]];
const FORA_DO_ESCOPO = [/SELECT 1 AS ok FROM tab_usuarios/, []];
const NO_ESCOPO = [/SELECT 1 AS ok FROM tab_usuarios/, [{ ok: 1 }]];
const PERIODOS = [/SELECT id_ferias, tipo_solicitacao FROM tab_ferias/, [
    { id_ferias: 10, tipo_solicitacao: '2º Período (15 Dias)' },
    { id_ferias: 11, tipo_solicitacao: '1º Período (15 Dias)' },
    { id_ferias: 12, tipo_solicitacao: '1º Período (15 Dias)' }
]];
const SO_UM_PERIODO = [/SELECT id_ferias, tipo_solicitacao FROM tab_ferias/, [{ id_ferias: 10, tipo_solicitacao: '1º Período (15 Dias)' }]];

const SOLICITACAO = { id_usuario: 5, periodo_aquisitivo: 2025, tipo_solicitacao: '1º Período (15 Dias)', data_inicio: '2026-02-02', data_fim: '2026-02-16', dias_restantes: 30 };
const SOLICITACAO_WEB = { ...SOLICITACAO, periodo_aquisitivo: '2025' };
const EDICAO = { periodo_aquisitivo: '2025', tipo_solicitacao: '2º Período (15 Dias)', data_inicio: '2026-03-02', data_fim: '2026-03-04' };

const donoDaSolicitacao = (extra = {}) => [/SELECT f\.id_usuario, f\.status, u\.funcao AS funcao_txt/, [{ id_usuario: 5, status: 'PENDENTE', funcao_txt: 'Implantador', nome_funcao: 'Implantador', ...extra }]];
const feriasAntigas = (extra = {}) => [/^SELECT \* FROM tab_ferias WHERE id_ferias = @id$/, [{ id_ferias: 3, id_usuario: 5, periodo_aquisitivo: 2025, status: 'PENDENTE', data_inicio: '2026-01-10', data_fim: '2026-01-12', ...extra }]];
const alvoDoStatus = (extra = {}) => [/SELECT u\.funcao AS funcao_txt, fn\.nome_funcao/, [{ funcao_txt: 'Implantador', nome_funcao: 'Implantador', ...extra }]];

const LINHA_FERIAS = { id_ferias: 3, id_usuario: 5, nome_completo: 'Maria Souza', status: 'PENDENTE', data_inicio: '2026-01-10', data_fim: '2026-01-12', nome_lotacao: 'SEDE - GD' };
const listaFerias = [/FROM tab_ferias f INNER JOIN tab_usuarios u/, [LINHA_FERIAS]];

const colaboradores = [
    { nome: 'colaboradores: projetos sem lotação', url: '/ferias/colaboradores?modulo=projetos' },
    { nome: 'colaboradores: projetos lotação fora do escopo', url: '/ferias/colaboradores?modulo=projetos&lotacao=9', perfil: 'Implantador', id: 7 },
    { nome: 'colaboradores: projetos como visão global', url: '/ferias/colaboradores?modulo=projetos&lotacao=2', respostas: [[/WHERE ativo = 1 AND \( id_lotacao = @lot/, [COLABORADOR]]] },
    { nome: 'colaboradores: projetos função comum vê só a si', url: '/ferias/colaboradores?modulo=projetos&lotacao=2', perfil: 'Implantador', id: 7, respostas: [[/^SELECT \* FROM tab_usuarios WHERE id_usuario = @id$/, [{ ...COLABORADOR, id_usuario: 7 }]]] },
    { nome: 'colaboradores: implantação como visão global', url: '/ferias/colaboradores?modulo=implantacao' },
    { nome: 'colaboradores: implantação sem módulo vê só a si', url: '/ferias/colaboradores', perfil: 'Implantador', id: 7, respostas: [[/^SELECT \* FROM tab_usuarios WHERE id_usuario = @id$/, [{ ...COLABORADOR, id_usuario: 7 }]]] }
];

const historico = [
    { nome: 'historico: gestão vê qualquer colaborador', url: '/ferias/historico/5', respostas: [[/FROM tab_ferias f INNER JOIN tab_usuarios u ON f\.id_usuario = u\.id_usuario WHERE f\.id_usuario = @id/, [LINHA_FERIAS]]] },
    { nome: 'historico: o próprio colaborador', url: '/ferias/historico/7', perfil: 'Implantador', id: 7, respostas: [[/WHERE f\.id_usuario = @id/, [{ ...LINHA_FERIAS, id_usuario: 7 }]]] },
    { nome: 'historico: outro colaborador da lotação', url: '/ferias/historico/9', perfil: 'Implantador', id: 7, respostas: [NO_ESCOPO, [/WHERE f\.id_usuario = @id/, [{ ...LINHA_FERIAS, id_usuario: 9 }]]] },
    { nome: 'historico: outro colaborador fora do escopo', url: '/ferias/historico/9', perfil: 'Implantador', id: 7, respostas: [FORA_DO_ESCOPO] },
    { nome: 'historico: identificador inválido', url: '/ferias/historico/abc', perfil: 'Implantador', id: 7 }
];

const conflitos = [
    { nome: 'conflitos: dono com lotação', metodo: 'POST', url: '/ferias/conflitos', corpo: { id_ferias: 3, data_inicio: '2026-01-10', data_fim: '2026-01-20' }, respostas: [[/SELECT u\.id_lotacao, u\.funcao/, [{ id_lotacao: 2, funcao: 'Implantador' }]], [/SELECT u\.nome_completo, f\.data_inicio/, [{ nome_completo: 'João', data_inicio: '2026-01-12', data_fim: '2026-01-15', status: 'APROVADO' }]]] },
    { nome: 'conflitos: dono sem lotação (SEDE)', metodo: 'POST', url: '/ferias/conflitos', corpo: { id_ferias: 3, data_inicio: '2026-01-10', data_fim: '2026-01-20' }, respostas: [[/SELECT u\.id_lotacao, u\.funcao/, [{ id_lotacao: null, funcao: 'IMPLANTADOR' }]], [/SELECT u\.nome_completo, f\.data_inicio/, []]] },
    { nome: 'conflitos: solicitação inexistente', metodo: 'POST', url: '/ferias/conflitos', corpo: { id_ferias: 99, data_inicio: '2026-01-10', data_fim: '2026-01-20' }, perfil: 'Implantador', id: 7, respostas: [[/SELECT u\.id_lotacao, u\.funcao/, []], [/SELECT u\.nome_completo, f\.data_inicio/, []]] },
    { nome: 'conflitos: nova solicitação sem id', metodo: 'POST', url: '/ferias/conflitos', corpo: { data_inicio: '2026-01-10', data_fim: '2026-01-20' }, respostas: [[/SELECT u\.id_lotacao, u\.funcao/, []], [/SELECT u\.nome_completo, f\.data_inicio/, []]] }
];

const salvar = [
    { nome: 'salvar: gestão (formato web)', metodo: 'POST', url: '/ferias/salvar', corpo: SOLICITACAO_WEB, respostas: [ADMISSAO, PERIODOS] },
    { nome: 'salvar: o próprio colaborador (formato mobile)', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, id_usuario: 7 }, perfil: 'Implantador', id: 7, respostas: [ADMISSAO, SO_UM_PERIODO] },
    { nome: 'salvar: colaborador da lotação', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, id_usuario: 9 }, perfil: 'Implantador', id: 7, respostas: [NO_ESCOPO, ADMISSAO, PERIODOS] },
    { nome: 'salvar: colaborador fora do escopo', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, id_usuario: 9 }, perfil: 'Implantador', id: 7, respostas: [FORA_DO_ESCOPO] },
    { nome: 'salvar: data final antes da inicial', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, data_inicio: '2026-02-10', data_fim: '2026-02-01' } },
    { nome: 'salvar: período acima do máximo', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, data_inicio: '2026-02-01', data_fim: '2026-06-01' } },
    { nome: 'salvar: sem data de admissão', metodo: 'POST', url: '/ferias/salvar', corpo: SOLICITACAO, respostas: [SEM_ADMISSAO] },
    { nome: 'salvar: acima do prazo legal', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, data_inicio: '2028-01-01', data_fim: '2028-01-15' }, respostas: [ADMISSAO] }
];

const editar = [
    { nome: 'editar: período inválido', metodo: 'PUT', url: '/ferias/editar/3', corpo: { ...EDICAO, data_fim: '2026-02-01' } },
    { nome: 'editar: férias inexistentes', metodo: 'PUT', url: '/ferias/editar/99', corpo: EDICAO, respostas: [[/SELECT f\.id_usuario, f\.status/, []]] },
    { nome: 'editar: colaborador fora do escopo', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, perfil: 'Implantador', id: 7, respostas: [donoDaSolicitacao({ id_usuario: 9 }), FORA_DO_ESCOPO] },
    { nome: 'editar: aprovadas sem poder aprovar', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, perfil: 'Implantador', id: 7, respostas: [donoDaSolicitacao({ id_usuario: 7, status: 'APROVADO' })] },
    { nome: 'editar: pendente pela gestão', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, respostas: [donoDaSolicitacao(), feriasAntigas(), ADMISSAO, PERIODOS] },
    { nome: 'editar: aprovada pela gestão refaz a escala', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, respostas: [donoDaSolicitacao({ status: 'APROVADO' }), feriasAntigas({ status: 'APROVADO' }), ADMISSAO, SO_UM_PERIODO] },
    { nome: 'editar: pendente do próprio colaborador', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, perfil: 'Implantador', id: 7, respostas: [donoDaSolicitacao({ id_usuario: 7 }), feriasAntigas({ id_usuario: 7 }), ADMISSAO, PERIODOS] },
    { nome: 'editar: acima do prazo legal desfaz a transação', metodo: 'PUT', url: '/ferias/editar/3', corpo: { ...EDICAO, data_inicio: '2028-01-01', data_fim: '2028-01-05' }, respostas: [donoDaSolicitacao(), feriasAntigas(), ADMISSAO] },
    { nome: 'editar: registro some durante a edição', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, respostas: [donoDaSolicitacao(), [/^SELECT \* FROM tab_ferias WHERE id_ferias = @id$/, []]] }
];

const listar = [
    { nome: 'listar: visão gerencial global', url: '/ferias/listar', respostas: [listaFerias] },
    { nome: 'listar: gerencial filtro SEDE', url: '/ferias/listar?lotacao=SEDE', respostas: [listaFerias] },
    { nome: 'listar: gerencial filtro de lotação', url: '/ferias/listar?lotacao=2', respostas: [listaFerias] },
    { nome: 'listar: gerencial filtro Todos', url: '/ferias/listar?lotacao=Todos', respostas: [listaFerias] },
    { nome: 'listar: administrador com id_usuario continua gerencial', url: '/ferias/listar?id_usuario=5', respostas: [listaFerias] },
    { nome: 'listar: o próprio colaborador', url: '/ferias/listar?id_usuario=7', perfil: 'Implantador', id: 7, respostas: [listaFerias] },
    { nome: 'listar: outro colaborador da lotação', url: '/ferias/listar?id_usuario=9', perfil: 'Implantador', id: 7, respostas: [NO_ESCOPO, listaFerias] },
    { nome: 'listar: outro colaborador fora do escopo', url: '/ferias/listar?id_usuario=9', perfil: 'Implantador', id: 7, respostas: [FORA_DO_ESCOPO] },
    { nome: 'listar: gestor sem filtro isola pela lotação', url: '/ferias/listar', perfil: 'Gestor', id: 8, respostas: [listaFerias] },
    { nome: 'listar: gestor filtro SEDE sem visão global', url: '/ferias/listar?lotacao=SEDE', perfil: 'Gestor', id: 8, respostas: [listaFerias] },
    { nome: 'listar: gestor lotação do escopo', url: '/ferias/listar?lotacao=2', perfil: 'Gestor', id: 8, respostas: [listaFerias] },
    { nome: 'listar: gestor lotação fora do escopo', url: '/ferias/listar?lotacao=9', perfil: 'Gestor', id: 8, respostas: [listaFerias] }
];

const relatorio = [
    { nome: 'relatorio-prazos: gestão', url: '/ferias/relatorio-prazos' },
    { nome: 'relatorio-prazos: perfil comum', url: '/ferias/relatorio-prazos', perfil: 'Implantador', id: 7 }
];

const status = [
    { nome: 'status: valor inválido', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'TALVEZ' } },
    { nome: 'status: sem valor', metodo: 'PUT', url: '/ferias/status/3', corpo: {} },
    { nome: 'status: solicitação inexistente', metodo: 'PUT', url: '/ferias/status/99', corpo: { status: 'APROVADO' }, respostas: [[/SELECT u\.funcao AS funcao_txt, fn\.nome_funcao/, []]] },
    { nome: 'status: sem permissão para a função', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'APROVADO' }, perfil: 'Implantador', id: 7, respostas: [alvoDoStatus()] },
    { nome: 'status: aprovar', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'APROVADO' }, respostas: [alvoDoStatus(), feriasAntigas({ id_ferias: 3 }), SO_UM_PERIODO] },
    { nome: 'status: recusar', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'RECUSADO' }, respostas: [alvoDoStatus({ nome_funcao: null }), feriasAntigas(), PERIODOS] },
    { nome: 'status: voltar para pendente', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'PENDENTE' }, respostas: [alvoDoStatus(), feriasAntigas(), SO_UM_PERIODO] },
    { nome: 'status: registro some depois da atualização', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'APROVADO' }, respostas: [alvoDoStatus(), [/^SELECT \* FROM tab_ferias WHERE id_ferias = @id$/, []]] },
    { nome: 'status: aprovação com período absurdo desfaz a transação', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'APROVADO' }, respostas: [alvoDoStatus(), feriasAntigas({ data_fim: '2027-12-31' })] }
];

const permissaoTotal = (modulo) => ({ nome_modulo: modulo, pode_acessar: true, pode_novo: true, pode_editar: true });
const REGRAS_DE_FERIAS = [/FROM tab_regras_acesso/, [permissaoTotal('ferias_gestao'), permissaoTotal('ferias_solicitacao')]];
const SEM_MODULO = { perfil: 'Visitante', id: 7, respostas: [[/FROM tab_regras_acesso/, []]] };
const comModuloDoPerfil = (caso) => (caso.perfil ? { ...caso, respostas: [REGRAS_DE_FERIAS, ...(caso.respostas ?? [])] } : caso);

const semModulo = [
    { nome: 'sem módulo: conflitos', metodo: 'POST', url: '/ferias/conflitos', corpo: { data_inicio: '2026-01-10', data_fim: '2026-01-20' }, ...SEM_MODULO },
    { nome: 'sem módulo: salvar', metodo: 'POST', url: '/ferias/salvar', corpo: { ...SOLICITACAO, id_usuario: 7 }, ...SEM_MODULO },
    { nome: 'sem módulo: editar', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, ...SEM_MODULO },
    { nome: 'sem módulo: listar outro colaborador', url: '/ferias/listar?id_usuario=9', ...SEM_MODULO },
    { nome: 'sem módulo: listar visão gerencial', url: '/ferias/listar', ...SEM_MODULO },
    { nome: 'sem módulo: listar a própria visão', url: '/ferias/listar?id_usuario=7', ...SEM_MODULO },
    { nome: 'sem módulo: relatório de prazos', url: '/ferias/relatorio-prazos', ...SEM_MODULO },
    { nome: 'sem módulo: status', metodo: 'PUT', url: '/ferias/status/3', corpo: { status: 'APROVADO' }, ...SEM_MODULO }
];

const ATIVAS = /FROM tab_ferias WHERE id_usuario = @id AND status <> 'RECUSADO'/;
const QUINZE_DIAS = { ...SOLICITACAO, tipo_solicitacao: '1º Período (15 Dias)', data_inicio: '2026-02-01', data_fim: '2026-02-15' };
const ativa = (extra = {}) => ({ id_ferias: 20, periodo_aquisitivo: 2025, tipo_solicitacao: '1º Período (15 Dias)', data_inicio: '2026-06-01', data_fim: '2026-06-20', ...extra });
const saldo = [
    { nome: 'saldo: acima do disponível', metodo: 'POST', url: '/ferias/salvar', corpo: QUINZE_DIAS, respostas: [ADMISSAO, [ATIVAS, [ativa()]]] },
    { nome: 'saldo: venda de dias consome os 30', metodo: 'POST', url: '/ferias/salvar', corpo: QUINZE_DIAS, respostas: [ADMISSAO, [ATIVAS, [ativa({ tipo_solicitacao: '20 Dias (c/ 10 Vendidos)' })]]] },
    { nome: 'saldo: outro período aquisitivo não conta', metodo: 'POST', url: '/ferias/salvar', corpo: QUINZE_DIAS, respostas: [ADMISSAO, PERIODOS, [ATIVAS, [ativa({ periodo_aquisitivo: 2024 })]]] },
    { nome: 'saldo: grava o valor calculado no servidor', metodo: 'POST', url: '/ferias/salvar', corpo: { ...QUINZE_DIAS, dias_restantes: 999 }, respostas: [ADMISSAO, PERIODOS, [ATIVAS, [ativa({ data_fim: '2026-06-10' })]]] },
    { nome: 'saldo: férias sobrepostas às próprias', metodo: 'POST', url: '/ferias/salvar', corpo: QUINZE_DIAS, respostas: [ADMISSAO, [ATIVAS, [ativa({ periodo_aquisitivo: 2024, data_inicio: '2026-02-10', data_fim: '2026-02-20' })]]] },
    { nome: 'saldo: edição ignora o próprio registro', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, respostas: [donoDaSolicitacao(), feriasAntigas(), ADMISSAO, PERIODOS, [ATIVAS, [ativa({ id_ferias: 3, data_inicio: '2026-03-02', data_fim: '2026-03-16' })]]] },
    { nome: 'saldo: edição com histórico acima do saldo sem aumentar dias', metodo: 'PUT', url: '/ferias/editar/3', corpo: EDICAO, respostas: [donoDaSolicitacao(), feriasAntigas(), ADMISSAO, PERIODOS, [ATIVAS, [ativa({ id_ferias: 3, data_inicio: '2026-03-02', data_fim: '2026-03-16' }), ativa({ data_fim: '2026-07-10' })]]] }
];

caracterizar('ferias', [...colaboradores, ...historico, ...conflitos, ...salvar, ...editar, ...listar, ...relatorio, ...status].map(comModuloDoPerfil).concat(semModulo, saldo));
