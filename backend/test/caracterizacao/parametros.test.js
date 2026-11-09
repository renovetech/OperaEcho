/* Parâmetros do sistema e Links Externos: cada rota continua com as mesmas consultas, permissões e mensagens. */
const { caracterizar, regra, comRegras, comParametros } = require('../apoio/atividadesEscalas');

const RESTRITO = { perfil: 'Restrito', id: 7 };
const sem = (...regras) => ({ ...RESTRITO, respostas: [comRegras(...regras)] });
const com = (regras, ...outras) => ({ ...RESTRITO, respostas: [comRegras(...regras), ...outras] });

/* ------------------------------------------------------------------ parâmetros */
const DETALHES = [/FORMAT\(data_alteracao/, [
    { chave: 'anexo_obrigatorio_implantacao', valor: '1', modulo: 'implantacao', descricao: 'Exige anexo', usuario_alteracao: 'Maria', data_alteracao: '05/10/2026 10:30' },
    { chave: 'horas_obrigatorias_projetos', valor: '0', modulo: 'projetos', descricao: 'Exige horas', usuario_alteracao: null, data_alteracao: null }
]];
const salvarParametros = (nome, corpo, extras = {}) => ({ nome: `parâmetros: ${nome}`, metodo: 'POST', url: '/parametros/salvar', corpo, ...extras });
const parametrosGravados = comParametros({ anexo_obrigatorio_implantacao: '0', equipe_apoio_obrigatoria_projetos: 'true' });
const UM_PARAMETRO = { parametros: [{ chave: 'anexo_obrigatorio_implantacao', valor: true }] };

const casosDeParametros = [
    { nome: 'parâmetros: ler com a tabela preenchida', url: '/parametros', respostas: [parametrosGravados] },
    { nome: 'parâmetros: ler com a tabela vazia', url: '/parametros', respostas: [comParametros({})] },
    { nome: 'parâmetros: ler anônimo', url: '/parametros', anonimo: true },
    { nome: 'parâmetros: ler como restrito', url: '/parametros', ...RESTRITO, respostas: [parametrosGravados] },
    { nome: 'parâmetros: detalhes', url: '/parametros/detalhes', respostas: [DETALHES] },
    { nome: 'parâmetros: detalhes anônimo', url: '/parametros/detalhes', anonimo: true },
    { nome: 'parâmetros: detalhes sem regra de acesso', url: '/parametros/detalhes', ...sem() },
    { nome: 'parâmetros: detalhes com acesso', url: '/parametros/detalhes', ...com([regra('parametros', { novo: false, editar: false })], DETALHES) },
    salvarParametros('salvar anônimo', UM_PARAMETRO, { anonimo: true }),
    salvarParametros('salvar sem regra de acesso', UM_PARAMETRO, sem()),
    salvarParametros('salvar só com acesso', UM_PARAMETRO, sem(regra('parametros', { editar: false }))),
    salvarParametros('salvar com permissão de editar', { parametros: [{ chave: 'anexo_obrigatorio_implantacao', valor: false }] }, com([regra('parametros', { novo: false })], parametrosGravados)),
    salvarParametros('corpo vazio', {}),
    salvarParametros('parâmetros que não são lista', { parametros: 'x' }),
    salvarParametros('lista vazia', { parametros: [] }),
    salvarParametros('só chaves desconhecidas', { parametros: [{ chave: 'qualquer_coisa', valor: '1' }] }),
    salvarParametros('todos os formatos de valor', {
        parametros: [
            { chave: 'anexo_obrigatorio_implantacao', valor: true }, { chave: 'anexo_obrigatorio_projetos', valor: false },
            { chave: 'horas_obrigatorias_implantacao', valor: '1' }, { chave: 'horas_obrigatorias_projetos', valor: 0 },
            { chave: 'equipe_apoio_obrigatoria_implantacao', valor: '0' }, { chave: 'equipe_apoio_obrigatoria_projetos', valor: 1 }
        ]
    }, { respostas: [parametrosGravados] }),
    salvarParametros('valor em texto, nulo e longo', {
        parametros: [
            { chave: 'anexo_obrigatorio_implantacao', valor: 'talvez' }, { chave: 'anexo_obrigatorio_projetos', valor: null },
            { chave: 'horas_obrigatorias_implantacao', valor: 'x'.repeat(600) }
        ]
    }, { respostas: [parametrosGravados] }),
    salvarParametros('mistura de chaves válidas e inválidas', {
        parametros: [{ chave: 'outra', valor: true }, { chave: 'anexo_obrigatorio_projetos', valor: true }]
    }, { respostas: [parametrosGravados] })
];

/* ------------------------------------------------------------------ links externos */
const LINKS = [{ id_link: 1, id_produto: 4, nome_produto: 'Prontuário', url: 'https://exemplo.com/manual' }, { id_link: 2, id_produto: 17, nome_produto: 'Agenda', url: 'agenda.exemplo.com' }];
const VALIDO = { id_produto: 4, url: 'https://exemplo.com' };
const criarLink = (nome, corpo, extras = {}) => ({ nome: `links: criar ${nome}`, metodo: 'POST', url: '/links-externos', corpo, ...extras });
const editarLink = (nome, corpo, extras = {}) => ({ nome: `links: editar ${nome}`, metodo: 'PUT', url: '/links-externos/2', corpo, ...extras });
const CRIADO = [/OUTPUT INSERTED\.id_link/, [{ id_link: 9 }]];
const URLS_RECUSADAS = [
    ['javascript', 'javascript:alert(1)'], ['ftp', 'ftp://exemplo.com'], ['com espaço', 'exemplo .com'], ['com aspas', 'exemplo.com"x'],
    ['longa demais', `https://exemplo.com/${'a'.repeat(1000)}`], ['só espaços', '   ']
];

const casosDeLinks = [
    { nome: 'links: listar', url: '/links-externos', respostas: [[/FROM tab_links_externos l/, LINKS]] },
    { nome: 'links: listar anônimo', url: '/links-externos', anonimo: true },
    criarLink('anônimo', VALIDO, { anonimo: true }),
    criarLink('sem regra de acesso', VALIDO, sem()),
    criarLink('só com permissão de editar', VALIDO, sem(regra('links_externos', { novo: false }))),
    criarLink('com permissão de novo', VALIDO, com([regra('links_externos', { editar: false })], CRIADO)),
    criarLink('sem produto', { url: 'https://exemplo.com' }),
    criarLink('sem endereço', { id_produto: 4 }),
    criarLink('endereço que não é texto', { id_produto: 4, url: 12345 }),
    criarLink('endereço vazio', { id_produto: 4, url: '' }),
    criarLink('http', { id_produto: 4, url: 'http://exemplo.com/a?b=1' }, { respostas: [CRIADO] }),
    criarLink('domínio simples', { id_produto: 4, url: 'exemplo.com' }, { respostas: [CRIADO] }),
    criarLink('endereço com espaços nas pontas', { id_produto: '4', url: '  HTTPS://Exemplo.com  ' }, { respostas: [CRIADO] }),
    ...URLS_RECUSADAS.map(([rotulo, url]) => criarLink(`endereço ${rotulo}`, { id_produto: 4, url })),
    editarLink('anônimo', VALIDO, { anonimo: true }),
    editarLink('sem regra de acesso', VALIDO, sem()),
    editarLink('só com permissão de novo', VALIDO, sem(regra('links_externos', { editar: false }))),
    editarLink('com permissão de editar', VALIDO, sem(regra('links_externos', { novo: false }))),
    editarLink('sem produto', { url: 'https://exemplo.com' }),
    editarLink('sem endereço', { id_produto: 4 }),
    editarLink('endereço que não é texto', { id_produto: 4, url: ['a'] }),
    editarLink('endereço inválido', { id_produto: 4, url: 'javascript:alert(1)' }),
    editarLink('endereço válido', { id_produto: '17', url: ' https://novo.exemplo.com ' }),
    { nome: 'links: excluir anônimo', metodo: 'DELETE', url: '/links-externos/2', anonimo: true },
    { nome: 'links: excluir sem regra de acesso', metodo: 'DELETE', url: '/links-externos/2', ...sem() },
    { nome: 'links: excluir só com permissão de novo', metodo: 'DELETE', url: '/links-externos/2', ...sem(regra('links_externos', { editar: false })) },
    { nome: 'links: excluir com permissão de editar', metodo: 'DELETE', url: '/links-externos/2', ...sem(regra('links_externos', { novo: false })) },
    { nome: 'links: excluir', metodo: 'DELETE', url: '/links-externos/2' },
    { nome: 'links: excluir com id inválido', metodo: 'DELETE', url: '/links-externos/abc' }
];

caracterizar('parametros', [...casosDeParametros, ...casosDeLinks]);
