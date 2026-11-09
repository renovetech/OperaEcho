/* Escalas (Implantação e Projetos, com os mesmos casos) e Regras de acesso. As datas de 2099 ficam sempre no futuro,
 * para o aviso de alteração gravar em tab_whatsapp_envios: é nessa gravação que aparece o módulo de cada envio. */
const { caracterizar, SESSAO, regra, comRegras } = require('../apoio/atividadesEscalas');

const DIA_FUTURO = '2099-03-02';
const OUTRO_DIA_FUTURO = '2099-03-03';
const DIA_PASSADO = '2020-01-06';

const CONFIG_ATIVA = { id: 1, ativo: true, escala_alteracao_ativa: true, escala_semanal_ativa: false, escala_alteracao_espera: 15 };
const comConfig = (config = CONFIG_ATIVA) => [/FROM tab_whatsapp_config/, [config]];
const SEM_ENVIO_AGUARDANDO = [/SELECT TOP 1 id_envio, referencia/, []];
const COM_ENVIO_AGUARDANDO = [/SELECT TOP 1 id_envio, referencia/, [{ id_envio: 55, referencia: '2099-03-05,2099-03-01' }]];
const ORIGEM = [/SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id/, [{ nome_completo: 'Gestora Teste' }]];
const INSERIDA = [/OUTPUT INSERTED\.id_escala/, [{ id_escala: 300 }]];
const AVISO_NOVO = [comConfig(), SEM_ENVIO_AGUARDANDO, ORIGEM, INSERIDA];
const FORA_DO_ESCOPO = (fora) => [/SELECT COUNT\(\*\) AS fora/, [{ fora }]];

const LINHAS_ESCALA = [
    { id_escala: 1, id_usuario: 3, data_escala: '2026-10-05T00:00:00.000Z', tipo: 'TRABALHO', turno: 'DIURNO', nome_projeto: 'Projeto Dois', nome_unidade: 'UBS Centro', nomes_produtos: 'Agenda, Prontuário', ids_produtos_str: '4,12' },
    { id_escala: 2, id_usuario: 4, data_escala: '2026-10-06T00:00:00.000Z', tipo: 'FOLGA', turno: 'NORMAL', nome_projeto: null, nome_unidade: null, nomes_produtos: null, ids_produtos_str: null }
];
const LISTA = [[/e\.data_escala BETWEEN @i AND @f/, LINHAS_ESCALA]];

const trabalho = (extras = {}) => ({ tipo: 'TRABALHO', id_usuario: 3, data_escala: DIA_FUTURO, id_projeto: '2', id_unidade: '5', produtos: [4, 12], turno: 'DIURNO', redmine: 'RM-12', ...extras });
const REGISTRO_INSERIDO_LOTE = [trabalho(), trabalho({ data_escala: OUTRO_DIA_FUTURO }), trabalho({ id_usuario: 4, tipo: 'FOLGA', id_projeto: null, id_unidade: null, produtos: [], turno: 'NORMAL', redmine: '' })];

function casosDeLeitura(p, url, mod) {
    const periodo = '?inicio=2026-10-01&fim=2026-10-31';
    const COM_MODULO = comRegras(regra(mod));
    return [
        { nome: `${p}: listar sem o módulo`, url: `${url}${periodo}`, perfil: 'Restrito', id: 7, respostas: [comRegras()] },
        { nome: `${p}: listar a própria escala sem o módulo`, url: `${url}${periodo}&id_usuario=7`, perfil: 'Restrito', id: 7, respostas: LISTA },
        { nome: `${p}: listar a escala de outro sem o módulo`, url: `${url}${periodo}&id_usuario=3`, perfil: 'Restrito', id: 7, respostas: [comRegras()] },
        { nome: `${p}: listar período`, url: `${url}${periodo}`, respostas: LISTA },
        { nome: `${p}: listar vazio`, url: `${url}${periodo}`, respostas: [[/e\.data_escala BETWEEN/, []]] },
        { nome: `${p}: listar por colaborador`, url: `${url}${periodo}&id_usuario=3`, respostas: LISTA },
        { nome: `${p}: colaborador não numérico é ignorado`, url: `${url}${periodo}&id_usuario=abc`, respostas: LISTA },
        { nome: `${p}: listar sem período`, url, respostas: LISTA },
        { nome: `${p}: data inválida`, url: `${url}?inicio=20226-01-01&fim=2026-10-31` },
        { nome: `${p}: listar anônimo`, url: `${url}${periodo}`, anonimo: true },
        { nome: `${p}: listar como implantador lotado`, url: `${url}${periodo}`, perfil: 'Implantador', id: 7, respostas: [COM_MODULO, ...LISTA] },
        { nome: `${p}: listar colaborador como implantador lotado`, url: `${url}${periodo}&id_usuario=3`, perfil: 'Implantador', id: 7, respostas: [COM_MODULO, ...LISTA] },
        { nome: `${p}: listar como analista`, url: `${url}${periodo}`, perfil: 'Implantador', id: SESSAO.ANALISTA, respostas: [COM_MODULO, ...LISTA] },
        { nome: `${p}: listar com função global`, url: `${url}${periodo}`, perfil: 'Implantador', id: SESSAO.FUNCAO_GLOBAL, respostas: [COM_MODULO, ...LISTA] },
        { nome: `${p}: listar sem lotação`, url: `${url}${periodo}`, perfil: 'Implantador', id: SESSAO.SEM_LOTACAO, respostas: [COM_MODULO, ...LISTA] },
        { nome: `${p}: listar com duas lotações`, url: `${url}${periodo}`, perfil: 'Implantador', id: SESSAO.DUAS_LOTACOES, respostas: [COM_MODULO, ...LISTA] }
    ];
}

function casosDeGravacao(p, url) {
    const salvar = { metodo: 'POST', url: `${url}/salvar` };
    return [
        { ...salvar, nome: `${p}: salvar trabalho completo e avisar`, corpo: trabalho(), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: salvar atualiza aviso aguardando`, corpo: trabalho(), respostas: [comConfig(), COM_ENVIO_AGUARDANDO, ORIGEM, INSERIDA] },
        { ...salvar, nome: `${p}: salvar sem origem conhecida`, corpo: trabalho(), respostas: [comConfig(), SEM_ENVIO_AGUARDANDO, [/SELECT nome_completo FROM tab_usuarios/, []], INSERIDA] },
        { ...salvar, nome: `${p}: limpar dia`, corpo: { id_usuario: 3, data_escala: DIA_FUTURO, tipo: null }, respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: id de usuário em texto`, corpo: trabalho({ id_usuario: '3' }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: folga sem redmine nem projeto`, corpo: trabalho({ tipo: 'FOLGA', id_projeto: null, id_unidade: null, produtos: [], turno: 'NORMAL', redmine: '' }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: apoio descarta redmine`, corpo: trabalho({ tipo: 'APOIO', id_unidade: null, redmine: 'RM-1' }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: trabalho com campos vazios da tela`, corpo: trabalho({ id_projeto: '', id_unidade: '', redmine: '', produtos: [] }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: redmine sanitizado e cortado`, corpo: trabalho({ redmine: ` #12/a.b-c <script> ${'9'.repeat(40)}` }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: redmine numérico`, corpo: trabalho({ redmine: 123 }), respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: sem turno usa normal`, corpo: { tipo: 'SEDE', id_usuario: 3, data_escala: DIA_FUTURO }, respostas: AVISO_NOVO },
        { ...salvar, nome: `${p}: data passada não avisa`, corpo: trabalho({ data_escala: DIA_PASSADO }), respostas: [comConfig(), INSERIDA] },
        { ...salvar, nome: `${p}: a própria escala não avisa`, corpo: trabalho({ id_usuario: 1 }), respostas: [comConfig(), ORIGEM, INSERIDA] },
        { ...salvar, nome: `${p}: integração inativa não avisa`, corpo: trabalho(), respostas: [comConfig({ ...CONFIG_ATIVA, ativo: false }), INSERIDA] },
        { ...salvar, nome: `${p}: aviso de alteração desligado`, corpo: trabalho(), respostas: [comConfig({ ...CONFIG_ATIVA, escala_alteracao_ativa: false }), INSERIDA] },
        { ...salvar, nome: `${p}: sem configuração não avisa`, corpo: trabalho(), respostas: [[/FROM tab_whatsapp_config/, []], INSERIDA] },
        { ...salvar, nome: `${p}: semana ainda não publicada não avisa`, corpo: trabalho(), respostas: [comConfig({ ...CONFIG_ATIVA, escala_semanal_ativa: true, escala_semanal_ultima: null }), INSERIDA] },
        { ...salvar, nome: `${p}: falha no insert desfaz a transação`, corpo: trabalho(), respostas: [[/OUTPUT INSERTED\.id_escala/, []]] },
        { ...salvar, nome: `${p}: salvar anônimo`, corpo: trabalho(), anonimo: true }
    ];
}

function casosDeLote(p, url) {
    const lote = { metodo: 'POST', url: `${url}/salvar-lote` };
    return [
        { ...lote, nome: `${p}: lote completo e avisos`, corpo: REGISTRO_INSERIDO_LOTE, respostas: AVISO_NOVO },
        { ...lote, nome: `${p}: lote com id em texto e limpeza`, corpo: [trabalho({ id_usuario: '3' }), { id_usuario: 4, data_escala: DIA_FUTURO, tipo: null }], respostas: AVISO_NOVO },
        { ...lote, nome: `${p}: lote vazio`, corpo: [] },
        { ...lote, nome: `${p}: lote que não é lista`, corpo: { id_usuario: 3 } },
        { ...lote, nome: `${p}: lote sem corpo` },
        { ...lote, nome: `${p}: lote muito grande`, corpo: Array.from({ length: 5001 }, () => ({ id_usuario: 3, data_escala: DIA_FUTURO, tipo: null })) },
        { ...lote, nome: `${p}: falha no insert do lote desfaz a transação`, corpo: REGISTRO_INSERIDO_LOTE, respostas: [[/OUTPUT INSERTED\.id_escala/, []]] },
        { ...lote, nome: `${p}: lote anônimo`, corpo: REGISTRO_INSERIDO_LOTE, anonimo: true }
    ];
}

function casosDePermissao(p, url, mod, outroMod) {
    const restrito = { metodo: 'POST', perfil: 'Restrito', id: 7 };
    const salvar = { ...restrito, url: `${url}/salvar`, corpo: trabalho() };
    const lote = { ...restrito, url: `${url}/salvar-lote`, corpo: REGISTRO_INSERIDO_LOTE };
    const permitido = comRegras(regra(mod));
    return [
        { ...salvar, nome: `${p}: salvar sem regra`, respostas: [comRegras()] },
        { ...salvar, nome: `${p}: salvar com regra só do outro módulo`, respostas: [comRegras(regra(outroMod))] },
        { ...salvar, nome: `${p}: salvar sem poder editar`, respostas: [comRegras(regra(mod, { editar: false }))] },
        { ...salvar, nome: `${p}: salvar editar sem acessar`, respostas: [comRegras(regra(mod, { acessar: false }))] },
        { ...salvar, nome: `${p}: salvar colaborador da lotação`, respostas: [permitido, FORA_DO_ESCOPO(0), ...AVISO_NOVO] },
        { ...salvar, nome: `${p}: salvar colaborador fora da lotação`, respostas: [permitido, FORA_DO_ESCOPO(1), ...AVISO_NOVO] },
        { ...salvar, nome: `${p}: salvar sem nenhuma lotação`, id: SESSAO.SEM_LOTACAO, respostas: [permitido, ...AVISO_NOVO] },
        { ...salvar, nome: `${p}: salvar com duas lotações`, id: SESSAO.DUAS_LOTACOES, respostas: [permitido, FORA_DO_ESCOPO(0), ...AVISO_NOVO] },
        { ...salvar, nome: `${p}: salvar fora com função global`, id: SESSAO.FUNCAO_GLOBAL, respostas: [permitido, FORA_DO_ESCOPO(1), ...AVISO_NOVO] },
        { ...lote, nome: `${p}: lote sem regra`, respostas: [comRegras()] },
        { ...lote, nome: `${p}: lote com regra só do outro módulo`, respostas: [comRegras(regra(outroMod))] },
        { ...lote, nome: `${p}: lote vazio sem permissão`, corpo: [], respostas: [comRegras()] },
        { ...lote, nome: `${p}: lote vazio com permissão`, corpo: [], respostas: [permitido] },
        { ...lote, nome: `${p}: lote de colaboradores da lotação`, respostas: [permitido, FORA_DO_ESCOPO(0), ...AVISO_NOVO] },
        { ...lote, nome: `${p}: lote com colaborador fora da lotação`, respostas: [permitido, FORA_DO_ESCOPO(1), ...AVISO_NOVO] },
        { ...lote, nome: `${p}: lote sem nenhuma lotação`, id: SESSAO.SEM_LOTACAO, respostas: [permitido, ...AVISO_NOVO] },
        { ...lote, nome: `${p}: lote fora com função global`, id: SESSAO.FUNCAO_GLOBAL, respostas: [permitido, FORA_DO_ESCOPO(1), ...AVISO_NOVO] }
    ];
}

/* Só em Projetos: o escopo responde com mensagem própria antes de qualquer validação do corpo. */
function casosDeEscopoSemCorpoValido(url, mod) {
    const restrito = { metodo: 'POST', perfil: 'Restrito', id: 7, respostas: [comRegras(regra(mod))] };
    return [
        { ...restrito, nome: 'projetos: salvar sem colaborador responde pelo escopo', url: `${url}/salvar`, corpo: { data_escala: DIA_FUTURO } },
        { ...restrito, nome: 'projetos: salvar com colaborador inválido responde pelo escopo', url: `${url}/salvar`, corpo: trabalho({ id_usuario: 'abc' }) },
        { ...restrito, nome: 'projetos: lote sem colaborador válido responde pelo escopo', url: `${url}/salvar-lote`, corpo: [{ data_escala: DIA_FUTURO }, { id_usuario: 0 }] },
        { ...restrito, nome: 'projetos: lote com item nulo falha ao ler o colaborador', url: `${url}/salvar-lote`, corpo: [null] }
    ];
}

function casosDeRegras() {
    const salvar = { metodo: 'POST', url: '/regras/salvar' };
    const regras = [
        { modulo: 'escala', pode_acessar: true, pode_novo: false, pode_editar: true },
        { modulo: 'perfis', pode_acessar: 1, pode_novo: 0 }
    ];
    return [
        { nome: 'regras: listar do perfil', url: '/regras/Implantador', respostas: [[/FROM tab_regras_acesso WHERE nome_perfil=@p/, [regra('escala'), regra('perfis', { novo: false })]]] },
        { nome: 'regras: perfil com espaço', url: '/regras/Gestor%20Regional', respostas: [[/FROM tab_regras_acesso WHERE nome_perfil=@p/, []]] },
        { nome: 'regras: listar como não administrador', url: '/regras/Implantador', perfil: 'Implantador', id: 7, respostas: [[/FROM tab_regras_acesso WHERE nome_perfil=@p/, [regra('escala')]]] },
        { nome: 'regras: listar anônimo', url: '/regras/Implantador', anonimo: true },
        { nome: 'regras: perfil alheio sem administrar perfis', url: '/regras/Gestor', perfil: 'Restrito', id: 7, respostas: [comRegras()] },
        { nome: 'regras: perfil alheio administrando perfis', url: '/regras/Gestor', perfil: 'Restrito', id: 7, respostas: [comRegras(regra('perfis'))] },
        { ...salvar, nome: 'regras: salvar', corpo: { perfil: 'Implantador', regras } },
        { ...salvar, nome: 'regras: salvar lista vazia', corpo: { perfil: 'Implantador', regras: [] } },
        { ...salvar, nome: 'regras: salvar sem perfil', corpo: { regras } },
        { ...salvar, nome: 'regras: salvar perfil vazio', corpo: { perfil: '', regras } },
        { ...salvar, nome: 'regras: salvar sem lista', corpo: { perfil: 'Implantador' } },
        { ...salvar, nome: 'regras: salvar lista que não é lista', corpo: { perfil: 'Implantador', regras: 'tudo' } },
        { ...salvar, nome: 'regras: salvar sem corpo' },
        { ...salvar, nome: 'regras: salvar corpo em lista', corpo: [] },
        { ...salvar, nome: 'regras: salvar anônimo', corpo: { perfil: 'Implantador', regras }, anonimo: true },
        { ...salvar, nome: 'regras: salvar sem permissão', perfil: 'Restrito', id: 7, corpo: { perfil: 'Implantador', regras }, respostas: [comRegras(regra('perfis', { editar: false }))] },
        { ...salvar, nome: 'regras: salvar dados inválidos sem permissão', perfil: 'Restrito', id: 7, corpo: {}, respostas: [comRegras()] },
        { ...salvar, nome: 'regras: salvar com permissão de perfis', perfil: 'Restrito', id: 7, corpo: { perfil: 'Implantador', regras }, respostas: [comRegras(regra('perfis'))] }
    ];
}

const MODULOS = [
    { p: 'implantacao', url: '/escalas', mod: 'escala', outroMod: 'proj_escala' },
    { p: 'projetos', url: '/projetos/escalas', mod: 'proj_escala', outroMod: 'escala' }
];

caracterizar('escalas', [
    ...MODULOS.flatMap(({ p, url, mod, outroMod }) => [
        ...casosDeLeitura(p, url, mod),
        ...casosDeGravacao(p, url),
        ...casosDeLote(p, url),
        ...casosDePermissao(p, url, mod, outroMod)
    ]),
    ...casosDeEscopoSemCorpoValido('/projetos/escalas', 'proj_escala'),
    ...casosDeRegras()
]);
