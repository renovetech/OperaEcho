/* Cadastros (projetos, produtos, tipos de unidade, unidades, cidades, motivos) e Macro/Micro Regiões:
 * cada rota continua com as mesmas consultas, permissões e mensagens. */
const { caracterizar, SESSAO, regra, comRegras } = require('../apoio/atividadesEscalas');

// O apoio só devolve um conjunto de linhas por consulta; as consultas com vários conjuntos usam `conjuntos(...)`.
const banco = require('../../src/config/database');

const conectarAnterior = banco.connectToDb;
const conjuntos = (...lista) => Object.assign([...lista[0]], { conjuntos: lista });
function comConjuntos(pedido) {
    const consultar = pedido.query.bind(pedido);
    pedido.query = async (texto) => {
        const resultado = await consultar(texto);
        const lista = resultado.recordset.conjuntos;
        return lista ? { ...resultado, recordsets: lista } : resultado;
    };
    return pedido;
}
banco.connectToDb = async () => {
    const pool = await conectarAnterior();
    return { ...pool, request: () => comConjuntos(pool.request()) };
};

const RESTRITO = { perfil: 'Restrito', id: 7 };
const sem = (...regras) => ({ ...RESTRITO, respostas: [comRegras(...regras)] });

/* ------------------------------------------------------------------ projetos */
const PROJETOS = [
    { id_projeto: 2, nome_projeto: 'Projeto Paraíba', categoria: 'A', ativo: true, gera_lotacao: true, painel_publico: true, slug_publico: 'paraiba' },
    { id_projeto: 3, nome_projeto: 'Projeto Bahia', categoria: 'B', ativo: false, gera_lotacao: false, painel_publico: false, slug_publico: null }
];
const SLUG_LIVRE = [/WHERE slug_publico = @s AND id_projeto <> @id/, []];
const SLUG_EM_USO = [/WHERE slug_publico = @s AND id_projeto <> @id/, [{ nome_projeto: 'Projeto Bahia' }]];
const projeto = (extras = {}) => ({ id_projeto: null, nome_projeto: 'Projeto Pernambuco', categoria: 'B', ativo: true, gera_lotacao: true, painel_publico: false, slug_publico: '', ...extras });
const salvarProjeto = (nome, corpo, extras = {}) => ({ nome: `projetos: ${nome}`, metodo: 'POST', url: '/projetos/salvar', corpo, ...extras });

const casosDeProjetos = [
    { nome: 'projetos: listar anônimo', url: '/projetos', anonimo: true, respostas: [[/FROM tab_projetos ORDER BY nome_projeto/, PROJETOS]] },
    { nome: 'projetos: listar autenticado', url: '/projetos', respostas: [[/FROM tab_projetos ORDER BY nome_projeto/, PROJETOS]] },
    salvarProjeto('salvar anônimo', projeto(), { anonimo: true }),
    salvarProjeto('criar sem regra de acesso', projeto(), sem()),
    salvarProjeto('criar com permissão de novo', projeto(), sem(regra('projetos', { editar: false }))),
    salvarProjeto('criar só com permissão de editar', projeto(), sem(regra('projetos', { novo: false }))),
    salvarProjeto('editar só com permissão de novo', projeto({ id_projeto: 2 }), sem(regra('projetos', { editar: false }))),
    salvarProjeto('editar com permissão de editar', projeto({ id_projeto: 2 }), sem(regra('projetos', { novo: false }))),
    salvarProjeto('criar com regra de outro módulo', projeto(), sem(regra('produtos'))),
    salvarProjeto('sem nome', projeto({ nome_projeto: '' })),
    salvarProjeto('sem categoria', projeto({ categoria: '' })),
    salvarProjeto('categoria inválida', projeto({ categoria: 'D' })),
    salvarProjeto('categoria em minúscula', projeto({ categoria: ' c ' })),
    salvarProjeto('criar inativo sem lotação', projeto({ ativo: false, gera_lotacao: false })),
    salvarProjeto('ativo e lotação só valem com true', projeto({ ativo: 'true', gera_lotacao: 1 })),
    salvarProjeto('criar com painel público e endereço gerado', projeto({ nome_projeto: 'Projeto Paraíba Norte', painel_publico: true }), { respostas: [SLUG_LIVRE] }),
    salvarProjeto('criar com painel público e endereço informado', projeto({ painel_publico: true, slug_publico: ' Pernambuco-2 ' }), { respostas: [SLUG_LIVRE] }),
    salvarProjeto('painel público com endereço em uso', projeto({ painel_publico: true, slug_publico: 'bahia' }), { respostas: [SLUG_EM_USO] }),
    salvarProjeto('painel público com endereço reservado', projeto({ painel_publico: true, slug_publico: 'login' })),
    salvarProjeto('painel público com endereço inválido', projeto({ painel_publico: true, slug_publico: 'a_b' })),
    salvarProjeto('painel público com endereço curto', projeto({ painel_publico: true, slug_publico: 'a' })),
    salvarProjeto('painel público sem endereço possível', projeto({ nome_projeto: '###', painel_publico: true })),
    salvarProjeto('painel público só vale com true', projeto({ painel_publico: 'true', slug_publico: 'login' })),
    salvarProjeto('editar', projeto({ id_projeto: 2, nome_projeto: 'Projeto Paraíba' })),
    salvarProjeto('editar inativando', projeto({ id_projeto: 2, ativo: false })),
    salvarProjeto('editar com painel público', projeto({ id_projeto: 2, painel_publico: true, slug_publico: 'paraiba' }), { respostas: [SLUG_LIVRE] }),
    salvarProjeto('editar com id em texto', projeto({ id_projeto: '2', painel_publico: true, slug_publico: 'paraiba' }), { respostas: [SLUG_LIVRE] })
];

/* ------------------------------------------------------------------ produtos e tipos de unidade */
const PRODUTOS = [{ id_produto: 4, nome_produto: 'Prontuário', ativo: true }, { id_produto: 17, nome_produto: 'Agenda', ativo: false }];
const salvarProduto = (nome, corpo, extras = {}) => ({ nome: `produtos: ${nome}`, metodo: 'POST', url: '/produtos/salvar', corpo, ...extras });
const produto = (extras = {}) => ({ id_produto: '', nome_produto: 'Regulação', ativo: true, responsavel_acao: 'Maria', ...extras });

const casosDeProdutos = [
    { nome: 'produtos: listar', url: '/produtos', respostas: [[/FROM tab_produtos ORDER BY nome_produto/, PRODUTOS]] },
    { nome: 'produtos: listar anônimo', url: '/produtos', anonimo: true },
    { nome: 'produtos: listar para o plano de ação', url: '/produtos/plano-acao', respostas: [[/FROM tab_produtos WHERE ativo=1/, [PRODUTOS[0]]]] },
    { nome: 'tipos de unidade: listar', url: '/tipos-unidade', respostas: [[/FROM tab_tipos_unidade/, [{ id_tipo_unidade: 1, nome_tipo: 'Hospital', sigla: 'HOSP', grupo: 'Hospitalar', descricao: 'Hospital geral', ordem: 1, ativo: true }]]] },
    salvarProduto('salvar anônimo', produto(), { anonimo: true }),
    salvarProduto('criar sem regra de acesso', produto(), sem()),
    salvarProduto('criar com permissão de novo', produto(), sem(regra('produtos', { editar: false }))),
    salvarProduto('editar só com permissão de novo', produto({ id_produto: 4 }), sem(regra('produtos', { editar: false }))),
    salvarProduto('editar com permissão de editar', produto({ id_produto: 4 }), sem(regra('produtos', { novo: false }))),
    salvarProduto('sem nome', produto({ nome_produto: '' })),
    salvarProduto('criar', produto()),
    salvarProduto('criar inativo', produto({ ativo: false })),
    salvarProduto('ativo só vale com true', produto({ ativo: 'true' })),
    salvarProduto('editar', produto({ id_produto: 4, nome_produto: 'Prontuário Eletrônico' }))
];

/* ------------------------------------------------------------------ unidades */
const LINHA_UNIDADE = {
    id_unidade: 5, nome_unidade: 'UBS Centro', cnes: '2345678', ativo: true, id_cidade: 10, id_projeto: 2, latitude: -7.12, longitude: -34.86, id_macro: 1,
    id_micro: 2, id_tipo_unidade: 3, sigla_tipo: 'UBS', nome_tipo: 'Unidade Básica', nome_cidade: 'João Pessoa', uf: 'PB', nome_projeto: 'Projeto Paraíba'
};
const listagem = (linhas, total = linhas.length) => [[/SELECT COUNT\(\*\) as total/, [{ total }]], [/SELECT u\.id_unidade/, linhas]];
const LISTAGEM = listagem([LINHA_UNIDADE, { ...LINHA_UNIDADE, id_unidade: 6, nome_unidade: 'UBS Norte', latitude: null, longitude: null }], 23);
const buscar = (nome, consulta, extras = {}) => ({ nome: `unidades: buscar ${nome}`, url: `/unidades/buscar${consulta}`, respostas: LISTAGEM, ...extras });
const IMPLANTADOR = { perfil: 'Implantador', id: 7 };

const casosDeBusca = [
    buscar('sem filtros', ''),
    buscar('sem resultado', '', { respostas: listagem([], 0) }),
    buscar('com todos os filtros', '?id=5&termo=Centro&projeto=2&status=true&uf=PB&id_cidade=10&pagina=2&limite=5'),
    buscar('inativas', '?status=false'),
    buscar('com status Todos', '?status=Todos'),
    buscar('com filtros undefined', '?termo=undefined&projeto=undefined&status=undefined&uf=undefined&id_cidade=undefined'),
    buscar('com filtros vazios', '?termo=&projeto=&status=&uf=&id_cidade='),
    buscar('com id não numérico', '?id=abc'),
    buscar('com paginação inválida', '?pagina=abc&limite=xyz'),
    buscar('com página zero', '?pagina=0&limite=10'),
    buscar('anônimo', '', { anonimo: true }),
    buscar('como implantador', '', IMPLANTADOR),
    buscar('como analista', '', { perfil: 'Implantador', id: SESSAO.ANALISTA }),
    buscar('como líder de projeto', '?termo=UBS', { perfil: 'Implantador', id: SESSAO.LIDER }),
    buscar('como operador', '', { perfil: 'Implantador', id: SESSAO.OPERADOR }),
    buscar('como analista com visão global', '', { perfil: 'Implantador', id: SESSAO.FUNCAO_GLOBAL }),
    buscar('como analista sem lotação', '', { perfil: 'Implantador', id: SESSAO.SEM_LOTACAO }),
    buscar('como líder com duas lotações', '', { perfil: 'Implantador', id: SESSAO.DUAS_LOTACOES })
];

const unidade = (extras = {}) => ({
    id_unidade: '', nome_unidade: 'UBS Sul', cnes: '1234567', id_projeto: '2', uf: 'PB', id_cidade: 10, latitude: '-7,1195', longitude: '-34.845', id_macro: '', id_micro: '',
    id_tipo_unidade: '3', ativo: true, produtos: [4, 17], ...extras
});
const salvarUnidade = (nome, corpo, extras = {}) => ({ nome: `unidades: ${nome}`, metodo: 'POST', url: '/unidades/salvar', corpo, ...extras });
const REGIAO = (macroOk, macroDaMicro) => [/macro_ok/, [{ macro_ok: macroOk, macro_da_micro: macroDaMicro }]];
const UNIDADE_CRIADA = [/OUTPUT INSERTED\.id_unidade/, [{ id_unidade: 31 }]];

const casosDeSalvarUnidade = [
    salvarUnidade('salvar anônimo', unidade(), { anonimo: true }),
    salvarUnidade('criar sem regra de acesso', unidade(), sem()),
    salvarUnidade('criar com permissão de novo', unidade(), { ...sem(regra('unidades', { editar: false })), respostas: [comRegras(regra('unidades', { editar: false })), UNIDADE_CRIADA] }),
    salvarUnidade('editar só com permissão de novo', unidade({ id_unidade: 5 }), sem(regra('unidades', { editar: false }))),
    salvarUnidade('editar com permissão de editar', unidade({ id_unidade: 5 }), sem(regra('unidades', { novo: false }))),
    salvarUnidade('sem nome', unidade({ nome_unidade: '' })),
    salvarUnidade('sem projeto', unidade({ id_projeto: '' })),
    salvarUnidade('latitude fora da faixa', unidade({ latitude: '91', longitude: '10' })),
    salvarUnidade('longitude fora da faixa', unidade({ latitude: '10', longitude: '-181' })),
    salvarUnidade('latitude não numérica', unidade({ latitude: 'abc', longitude: '10' })),
    salvarUnidade('só latitude', unidade({ latitude: '-7.1', longitude: '' })),
    salvarUnidade('só longitude', unidade({ latitude: null, longitude: -34.8 })),
    salvarUnidade('criar sem coordenadas', unidade({ latitude: '', longitude: undefined }), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar com coordenadas numéricas', unidade({ latitude: -7.123456789, longitude: -34.8 }), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar com produtos', unidade(), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar sem produtos', unidade({ produtos: [] }), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar sem lista de produtos', unidade({ produtos: undefined }), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar inativa', unidade({ ativo: false }), { respostas: [UNIDADE_CRIADA] }),
    salvarUnidade('criar com macro e micro da mesma região', unidade({ id_macro: '1', id_micro: '2' }), { respostas: [REGIAO(1, 1), UNIDADE_CRIADA] }),
    salvarUnidade('criar com micro de outra macro', unidade({ id_macro: '1', id_micro: '2' }), { respostas: [REGIAO(1, 4), UNIDADE_CRIADA] }),
    salvarUnidade('criar com micro fora do projeto', unidade({ id_macro: '1', id_micro: '2' }), { respostas: [REGIAO(1, null), UNIDADE_CRIADA] }),
    salvarUnidade('criar com macro fora do projeto', unidade({ id_macro: '9', id_micro: '' }), { respostas: [REGIAO(null, null), UNIDADE_CRIADA] }),
    salvarUnidade('criar só com macro', unidade({ id_macro: 1, id_micro: null }), { respostas: [REGIAO(1, null), UNIDADE_CRIADA] }),
    salvarUnidade('editar', unidade({ id_unidade: 5 })),
    salvarUnidade('editar sem produtos', unidade({ id_unidade: 5, produtos: [] })),
    salvarUnidade('editar com região', unidade({ id_unidade: 5, id_macro: 1, id_micro: 2 }), { respostas: [REGIAO(1, 1)] })
];

const importar = (nome, corpo, extras = {}) => ({ nome: `unidades: importar coordenadas ${nome}`, metodo: 'POST', url: '/unidades/coordenadas/importar', corpo, ...extras });
const ATUALIZADAS = (qtd) => [/SELECT @@ROWCOUNT AS qtd/, [{ qtd }]];
const linhaDaPlanilha = (cnes, latitude, longitude) => ({ cnes, latitude, longitude });
const LINHAS_MISTAS = [
    linhaDaPlanilha('2345678', '-7,12', '-34,86'), linhaDaPlanilha('', '-7', '-34'), linhaDaPlanilha('234.5678', '95', '-34'),
    linhaDaPlanilha(1234, -8.5, -35.1), linhaDaPlanilha('9999999', '', '-34'), linhaDaPlanilha('0000012', 'abc', '10')
];

const casosDeImportacao = [
    importar('anônimo', { id_projeto: 2, linhas: LINHAS_MISTAS }, { anonimo: true }),
    importar('sem regra de acesso', { id_projeto: 2, linhas: LINHAS_MISTAS }, sem()),
    importar('só com permissão de novo', { id_projeto: 2, linhas: LINHAS_MISTAS }, sem(regra('unidades', { editar: false }))),
    importar('planilha vazia', { id_projeto: 2, linhas: [] }),
    importar('sem linhas', { id_projeto: 2 }),
    importar('linhas que não são lista', { id_projeto: 2, linhas: 'x' }),
    importar('acima do limite', { id_projeto: 2, linhas: Array.from({ length: 5001 }, () => linhaDaPlanilha('1', '1', '1')) }),
    importar('misturando linhas boas e ruins', { id_projeto: 2, linhas: LINHAS_MISTAS }, { respostas: [ATUALIZADAS(1)] }),
    importar('sem projeto', { id_projeto: null, linhas: [linhaDaPlanilha('2345678', '-7.1', '-34.8')] }, { respostas: [ATUALIZADAS(1)] }),
    importar('unidade não encontrada', { id_projeto: '2', linhas: [linhaDaPlanilha('2345678', '-7.1', '-34.8')] }, { respostas: [ATUALIZADAS(0)] }),
    importar('várias unidades com o mesmo CNES', { id_projeto: 2, linhas: [linhaDaPlanilha('2345678', '-7.1', '-34.8')] }, { respostas: [ATUALIZADAS(3)] }),
    importar('como implantador com permissão', { id_projeto: 2, linhas: [linhaDaPlanilha('2345678', '-7.1', '-34.8')] }, { ...RESTRITO, respostas: [comRegras(regra('unidades', { novo: false })), ATUALIZADAS(1)] })
];

const casosDeUnidadesAuxiliares = [
    { nome: 'unidades: produtos da unidade', url: '/unidades/5/produtos', respostas: [[/FROM tab_unidade_produtos up JOIN/, PRODUTOS.slice(0, 1)]] },
    { nome: 'unidades: produtos de id inválido', url: '/unidades/abc/produtos' },
    { nome: 'unidades: produtos de id zero', url: '/unidades/0/produtos' },
    { nome: 'unidades: produtos anônimo', url: '/unidades/5/produtos', anonimo: true },
    { nome: 'cidades: listar por UF anônimo', url: '/cidades/PB', anonimo: true, respostas: [[/FROM tab_cidades c/, [{ id_cidade: 10, id_estado: 1, nome_cidade: 'João Pessoa', latitude: -7.11, longitude: -34.86 }]]] },
    { nome: 'cidades: listar por UF autenticado', url: '/cidades/PE' },
    { nome: 'motivos: listar', url: '/motivos', respostas: [[/FROM tab_motivos/, [{ id_motivo: 1, nome_motivo: 'Treinamento' }]]] },
    { nome: 'motivos: listar anônimo', url: '/motivos', anonimo: true }
];

/* ------------------------------------------------------------------ regiões */
const MACROS = [{ id_macro: 1, nome_macro: 'Leste', sigla: 'LES', cor: '#112233', ordem: 1, ativo: true, unidades: 4 }, { id_macro: 2, nome_macro: 'Oeste', sigla: null, cor: null, ordem: 2, ativo: false, unidades: 0 }];
const MICROS = [{ id_micro: 7, id_macro: 1, nome_micro: 'Litoral', sigla: 'LIT', cor: null, ordem: 1, ativo: true, unidades: 2 }];
const ARVORE = [/FROM tab_macro_regioes m WHERE m\.id_projeto = @p/, conjuntos(MACROS, MICROS)];
const REGIOES_DO_PROJETO = [/FROM tab_macro_regioes m\s*LEFT JOIN|SELECT m\.id_macro, mi\.id_micro FROM tab_macro_regioes m/, [
    { id_macro: 1, id_micro: 7 }, { id_macro: 1, id_micro: 8 }, { id_macro: 2, id_micro: null }
]];
const NOME_REPETIDO = (tabela) => [new RegExp(`SELECT 1 FROM ${tabela}`), [{ '': 1 }]];
const NOME_LIVRE = (tabela) => [new RegExp(`SELECT 1 FROM ${tabela}`), []];
const macro = (extras = {}) => ({ id_macro: '', id_projeto: '2', nome_macro: ' Agreste ', sigla: 'AGR', cor: '#aabbcc', ordem: 3, ativo: true, ...extras });
const micro = (extras = {}) => ({ id_micro: '', id_macro: 1, nome_micro: 'Sertão', sigla: 'SER', cor: '#aabbcc', ordem: 3, ativo: true, ...extras });
const USO_DA_MACRO = (unidades, micros) => [/SELECT \(SELECT COUNT\(\*\) FROM tab_unidades WHERE id_macro=@id\)/, [{ unidades, micros }]];
const USO_DA_MICRO = (unidades) => [/SELECT COUNT\(\*\) AS unidades FROM tab_unidades WHERE id_micro=@id/, [{ unidades }]];
const vinculo = (extras = {}) => ({ id_unidade: 5, id_macro: 1, id_micro: 7, ...extras });
const vincular = (nome, corpo, extras = {}) => ({ nome: `regiões: vincular ${nome}`, metodo: 'POST', url: '/regioes/unidades/vincular', corpo, ...extras });
const LEITURA = ['regioes', 'unidades'];

const casosDeRegioes = [
    { nome: 'regiões: árvore do projeto', url: '/regioes/projeto/2', respostas: [ARVORE] },
    { nome: 'regiões: árvore de projeto sem regiões', url: '/regioes/projeto/2', respostas: [[/FROM tab_macro_regioes m WHERE m\.id_projeto = @p/, conjuntos([], [])]] },
    { nome: 'regiões: árvore com id inválido', url: '/regioes/projeto/abc' },
    { nome: 'regiões: árvore anônimo', url: '/regioes/projeto/2', anonimo: true },
    { nome: 'regiões: árvore sem regra de acesso', url: '/regioes/projeto/2', ...sem() },
    { nome: 'regiões: árvore com acesso a unidades', url: '/regioes/projeto/2', ...RESTRITO, respostas: [comRegras(regra('unidades')), ARVORE] },
    { nome: 'regiões: árvore com acesso a regiões', url: '/regioes/projeto/2', ...RESTRITO, respostas: [comRegras(regra('regioes')), ARVORE] },
    { nome: 'regiões: árvore com regra de outro módulo', url: '/regioes/projeto/2', ...sem(regra('produtos')) },
    { nome: 'regiões: unidades do projeto', url: '/regioes/unidades/2', respostas: [[/WHERE u\.id_projeto = @p/, [{ ...LINHA_UNIDADE }]]] },
    { nome: 'regiões: unidades de id inválido', url: '/regioes/unidades/abc' },
    { nome: 'regiões: unidades sem regra de acesso', url: '/regioes/unidades/2', ...sem() },
    { nome: 'regiões: unidades com acesso a unidades', url: '/regioes/unidades/2', ...RESTRITO, respostas: [comRegras(regra(LEITURA[1]))] },

    { nome: 'macro: salvar anônimo', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro(), anonimo: true },
    { nome: 'macro: criar sem regra de acesso', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro(), ...sem() },
    { nome: 'macro: criar com permissão de novo', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro(), ...RESTRITO, respostas: [comRegras(regra('regioes', { editar: false })), NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: editar só com permissão de novo', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ id_macro: 1 }), ...sem(regra('regioes', { editar: false })) },
    { nome: 'macro: editar com permissão de editar', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ id_macro: 1 }), ...RESTRITO, respostas: [comRegras(regra('regioes', { novo: false })), NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: sem projeto', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ id_projeto: '' }) },
    { nome: 'macro: sem nome', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ nome_macro: '   ' }) },
    { nome: 'macro: corpo vazio', metodo: 'POST', url: '/regioes/macro/salvar', corpo: {} },
    { nome: 'macro: nome repetido', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro(), respostas: [NOME_REPETIDO('tab_macro_regioes')] },
    { nome: 'macro: criar', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro(), respostas: [NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: criar sem sigla, cor e ordem', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ sigla: '', cor: 'vermelho', ordem: 'x', ativo: false }), respostas: [NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: criar com nome e sigla longos', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ nome_macro: 'N'.repeat(150), sigla: 'S'.repeat(40) }), respostas: [NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: editar', metodo: 'POST', url: '/regioes/macro/salvar', corpo: macro({ id_macro: 1 }), respostas: [NOME_LIVRE('tab_macro_regioes')] },
    { nome: 'macro: excluir anônimo', metodo: 'DELETE', url: '/regioes/macro/1', anonimo: true },
    { nome: 'macro: excluir sem regra de acesso', metodo: 'DELETE', url: '/regioes/macro/1', ...sem() },
    { nome: 'macro: excluir só com permissão de novo', metodo: 'DELETE', url: '/regioes/macro/1', ...sem(regra('regioes', { editar: false })) },
    { nome: 'macro: excluir em uso', metodo: 'DELETE', url: '/regioes/macro/1', respostas: [USO_DA_MACRO(4, 2)] },
    { nome: 'macro: excluir só com unidades', metodo: 'DELETE', url: '/regioes/macro/1', respostas: [USO_DA_MACRO(1, 0)] },
    { nome: 'macro: excluir sem uso', metodo: 'DELETE', url: '/regioes/macro/1', respostas: [USO_DA_MACRO(0, 0)] },
    { nome: 'macro: excluir com permissão de editar', metodo: 'DELETE', url: '/regioes/macro/1', ...RESTRITO, respostas: [comRegras(regra('regioes', { novo: false })), USO_DA_MACRO(0, 0)] },

    { nome: 'micro: salvar anônimo', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro(), anonimo: true },
    { nome: 'micro: criar sem regra de acesso', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro(), ...sem() },
    { nome: 'micro: criar com permissão de novo', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro(), ...RESTRITO, respostas: [comRegras(regra('regioes', { editar: false })), NOME_LIVRE('tab_micro_regioes')] },
    { nome: 'micro: editar só com permissão de novo', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro({ id_micro: 7 }), ...sem(regra('regioes', { editar: false })) },
    { nome: 'micro: sem macro', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro({ id_macro: '' }) },
    { nome: 'micro: sem nome', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro({ nome_micro: '' }) },
    { nome: 'micro: corpo vazio', metodo: 'POST', url: '/regioes/micro/salvar', corpo: {} },
    { nome: 'micro: nome repetido', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro(), respostas: [NOME_REPETIDO('tab_micro_regioes')] },
    { nome: 'micro: criar', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro(), respostas: [NOME_LIVRE('tab_micro_regioes')] },
    { nome: 'micro: criar sem sigla, cor e ordem', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro({ sigla: null, cor: '#12', ordem: null, ativo: false }), respostas: [NOME_LIVRE('tab_micro_regioes')] },
    { nome: 'micro: editar', metodo: 'POST', url: '/regioes/micro/salvar', corpo: micro({ id_micro: 7, id_macro: '2' }), respostas: [NOME_LIVRE('tab_micro_regioes')] },
    { nome: 'micro: excluir anônimo', metodo: 'DELETE', url: '/regioes/micro/7', anonimo: true },
    { nome: 'micro: excluir sem regra de acesso', metodo: 'DELETE', url: '/regioes/micro/7', ...sem() },
    { nome: 'micro: excluir em uso', metodo: 'DELETE', url: '/regioes/micro/7', respostas: [USO_DA_MICRO(2)] },
    { nome: 'micro: excluir sem uso', metodo: 'DELETE', url: '/regioes/micro/7', respostas: [USO_DA_MICRO(0)] },
    { nome: 'micro: excluir com id inválido', metodo: 'DELETE', url: '/regioes/micro/abc', respostas: [USO_DA_MICRO(0)] },

    vincular('anônimo', { id_projeto: 2, itens: [vinculo()] }, { anonimo: true }),
    vincular('sem regra de acesso', { id_projeto: 2, itens: [vinculo()] }, sem()),
    vincular('só com permissão de novo', { id_projeto: 2, itens: [vinculo()] }, sem(regra('regioes', { editar: false }))),
    vincular('sem projeto', { itens: [vinculo()] }),
    vincular('sem itens', { id_projeto: 2 }),
    vincular('com lista vazia', { id_projeto: 2, itens: [] }),
    vincular('acima do limite', { id_projeto: 2, itens: Array.from({ length: 5001 }, () => vinculo()) }),
    vincular('corpo vazio', {}),
    vincular('unidades com macro e micro', { id_projeto: '2', itens: [vinculo(), vinculo({ id_unidade: 6, id_macro: 2, id_micro: null }), vinculo({ id_unidade: 7, id_macro: null, id_micro: null })] }, { respostas: [REGIOES_DO_PROJETO, [/SELECT @@ROWCOUNT AS q/, [{ q: 1 }]]] }),
    vincular('micro de outra macro prevalece', { id_projeto: 2, itens: [vinculo({ id_macro: 2, id_micro: 7 })] }, { respostas: [REGIOES_DO_PROJETO, [/SELECT @@ROWCOUNT AS q/, [{ q: 1 }]]] }),
    vincular('micro desconhecida é ignorada', { id_projeto: 2, itens: [vinculo({ id_macro: 1, id_micro: 99 })] }, { respostas: [REGIOES_DO_PROJETO, [/SELECT @@ROWCOUNT AS q/, [{ q: 1 }]]] }),
    vincular('macro de outro projeto é ignorada', { id_projeto: 2, itens: [vinculo({ id_macro: 99, id_micro: null })] }, { respostas: [REGIOES_DO_PROJETO, [/SELECT @@ROWCOUNT AS q/, [{ q: 1 }]]] }),
    vincular('item sem unidade é pulado', { id_projeto: 2, itens: [{ id_macro: 1 }, vinculo({ id_unidade: 'x' })] }, { respostas: [REGIOES_DO_PROJETO] }),
    vincular('unidade de outro projeto não conta', { id_projeto: 2, itens: [vinculo()] }, { respostas: [REGIOES_DO_PROJETO, [/SELECT @@ROWCOUNT AS q/, [{ q: 0 }]]] })
];

caracterizar('cadastros', [
    ...casosDeProjetos, ...casosDeProdutos, ...casosDeBusca, ...casosDeSalvarUnidade, ...casosDeImportacao, ...casosDeUnidadesAuxiliares, ...casosDeRegioes
]);
