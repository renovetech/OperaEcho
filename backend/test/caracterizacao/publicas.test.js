/* Rotas públicas: versão do app, informações do sistema, rastreio GPS e validação de CNES. */
const { caracterizar } = require('../apoio/caracterizacao');

const rastrear = (nome, corpo, extras = {}) => ({ nome: `rastreio: ${nome}`, metodo: 'POST', url: '/rastreio-background', corpo, ...extras });
const NOME_DO_DONO = [/SELECT nome_completo FROM tab_usuarios/, [{ nome_completo: 'Maria da Silva' }]];
const SEM_USUARIO = [/SELECT nome_completo FROM tab_usuarios/, []];
const posicao = (extras = {}) => ({ usuario: 'Outro', latitude: -7.1195, longitude: -34.845, tipo_registro: 'SEGUNDO_PLANO', detalhes_registro: 'Bateria 80%', ...extras });
const validarCnes = (nome, valor, respostas, extras = {}) => ({ nome: `cnes: ${nome}`, url: `/indicadores/validar-cnes/${valor}`, anonimo: true, respostas, ...extras });
const CONSULTA_CNES = /FROM tab_unidades u WHERE u\.cnes = @cnes/;
const UNIDADE = (possuiProduto) => [CONSULTA_CNES, [{ nome_unidade: 'UBS Centro', possui_produto: possuiProduto }]];

caracterizar('publicas', [
    { nome: 'app: versão anônimo', url: '/app-version', anonimo: true },
    { nome: 'app: versão autenticado', url: '/app-version' },
    { nome: 'sistema: informações anônimo', url: '/sistema/info', anonimo: true },
    { nome: 'sistema: informações autenticado', url: '/sistema/info' },
    rastrear('anônimo', posicao(), { anonimo: true }),
    rastrear('com coordenadas', posicao(), { respostas: [NOME_DO_DONO] }),
    rastrear('usuário sem nome cadastrado usa o login', posicao(), { respostas: [SEM_USUARIO] }),
    rastrear('coordenadas em texto', posicao({ latitude: '-7,5', longitude: '-34.8' }), { respostas: [NOME_DO_DONO] }),
    rastrear('coordenadas em texto com ponto', posicao({ latitude: '-7.5', longitude: '-34.8' }), { respostas: [NOME_DO_DONO] }),
    rastrear('sem tipo nem detalhes', { latitude: 1, longitude: 2 }, { respostas: [NOME_DO_DONO] }),
    rastrear('tipo e detalhes muito longos', posicao({ tipo_registro: 'T'.repeat(80), detalhes_registro: 'D'.repeat(2500) }), { respostas: [NOME_DO_DONO] }),
    rastrear('tipo e detalhes nulos', posicao({ tipo_registro: null, detalhes_registro: null }), { respostas: [NOME_DO_DONO] }),
    rastrear('latitude e longitude zero', posicao({ latitude: 0, longitude: 0 }), { respostas: [NOME_DO_DONO] }),
    rastrear('exclusão de atividade sem coordenadas', { usuario: 'Ana', latitude: null, longitude: null, tipo_registro: 'EXCLUSAO_ATIVIDADE', detalhes_registro: 'id 9' }),
    rastrear('sem coordenadas', { tipo_registro: 'X' }),
    rastrear('corpo vazio', {}),
    rastrear('latitude fora da faixa', posicao({ latitude: 91 })),
    rastrear('longitude fora da faixa', posicao({ longitude: -181 })),
    rastrear('latitude não numérica', posicao({ latitude: 'abc' })),
    rastrear('longitude infinita', posicao({ longitude: '1e999' })),
    validarCnes('cadastrado com produto', '2345678', [UNIDADE(1)]),
    validarCnes('cadastrado sem produto', '2345678', [UNIDADE(0)]),
    validarCnes('com pontuação', '234.5678', [UNIDADE(1)]),
    validarCnes('não cadastrado', '2345678', [[CONSULTA_CNES, []]]),
    validarCnes('sem dígitos', 'abc'),
    validarCnes('longo demais', '12345678'),
    validarCnes('autenticado', '2345678', [UNIDADE(1)], { anonimo: false })
]);
