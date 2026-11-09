/* Projetos: seletor de lotações, validação de lotação e painel público (sem login). */
const { caracterizar, SESSAO } = require('../apoio/atividadesEscalas');

// Fixa o relógio: os caches do painel e das regras não expiram no meio do arquivo.
const INSTANTE_FIXO = new Date('2026-11-08T15:00:00Z').getTime();
Date.now = () => INSTANTE_FIXO;

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

// O painel guarda o resultado por endereço: cada caso começa com o cache limpo.
const { beforeEach } = require('node:test');

beforeEach(() => {
    const painel = require('../../src/modules/projetos/painelPublico.routes');
    painel.limparCachePainel();
});

const IMPLANTADOR = { perfil: 'Implantador', id: 7 };
const LOTACOES = [{ id_projeto: 2, nome_projeto: 'Projeto Dois', visao_global: false }, { id_projeto: 3, nome_projeto: 'Projeto Três', visao_global: true }];
const lotacoes = (nome, extras = {}) => ({ nome: `lotações: ${nome}`, url: '/projetos/minhas-lotacoes', respostas: [[/FROM tab_projetos/, LOTACOES]], ...extras });

const casosDeLotacoes = [
    lotacoes('visão global do administrador'),
    lotacoes('anônimo', { anonimo: true }),
    lotacoes('implantador com uma lotação', IMPLANTADOR),
    lotacoes('líder com duas lotações', { perfil: 'Implantador', id: SESSAO.DUAS_LOTACOES }),
    lotacoes('função de visão global', { perfil: 'Implantador', id: SESSAO.FUNCAO_GLOBAL }),
    lotacoes('sem lotação', { perfil: 'Implantador', id: SESSAO.SEM_LOTACAO })
];

/* ------------------------------------------------------------------ painel público */
const PROJETO = [/WHERE slug_publico = @s AND painel_publico = 1 AND ativo = 1/, [{ id_projeto: 2, nome_projeto: 'Projeto Paraíba' }]];
const MACROS = [{ id_macro: 1, nome_macro: 'Leste', sigla: 'LES', cor: '#112233', ordem: 1 }];
const MICROS = [{ id_micro: 7, id_macro: 1, nome_micro: 'Litoral', sigla: 'LIT', cor: null, ordem: 1 }, { id_micro: 8, id_macro: 5, nome_micro: 'Solta', sigla: null, cor: null, ordem: 2 }];
const unidade = (extras) => ({
    id_unidade: 5, nome_unidade: 'UBS Centro', cnes: '2345678', id_cidade: 10, nome_cidade: 'João Pessoa', uf: 'PB', latitude: -7.12, longitude: -34.86,
    lat_cidade: -7.1, lng_cidade: -34.8, id_macro: 1, id_micro: 7, id_tipo_unidade: 3, ids_produtos: '4,17', ...extras
});
const UNIDADES = [
    unidade(), unidade({ id_unidade: 6, nome_unidade: 'UBS Norte', latitude: null, longitude: null, ids_produtos: null }),
    unidade({ id_unidade: 7, nome_unidade: 'UPA', uf: 'PE', lat_cidade: null, lng_cidade: null, latitude: null, longitude: null, id_tipo_unidade: 4, ids_produtos: '4' }),
    unidade({ id_unidade: 8, nome_unidade: 'Sem estado', uf: null })
];
const PRODUTOS = [{ id_produto: 4, nome_produto: 'Prontuário' }, { id_produto: 17, nome_produto: 'Agenda' }];
const TIPOS = [{ id_tipo_unidade: 3, nome_tipo: 'UBS', sigla: 'UBS', grupo: 'APS', ordem: 1 }, { id_tipo_unidade: 9, nome_tipo: 'Hospital', sigla: 'HOSP', grupo: 'Hosp', ordem: 2 }];
const atividade = (extras) => ({
    origem: 'implantacao', id_unidade: 5, di: new Date('2026-10-05T00:00:00Z'), df: '2026-10-06T00:00:00.000Z', motivos: 'Treinamento, Visita ', produtos_trabalhados: 'Prontuário,Agenda', tempo_gasto: '02:30', ...extras
});
const ATIVIDADES = [
    atividade(), atividade({ origem: 'projetos', id_unidade: 6, di: '2026-10-07', df: null, motivos: null, produtos_trabalhados: '', tempo_gasto: 'xx' }),
    atividade({ id_unidade: 99 }), atividade({ id_unidade: 7, di: null, df: new Date('2026-10-09T00:00:00Z'), tempo_gasto: '120:45' })
];
const PAINEL_COMPLETO = [
    PROJETO, [/SELECT id_macro, nome_macro, sigla, cor, ordem FROM tab_macro_regioes/, conjuntos(MACROS, MICROS)],
    [/SELECT u\.id_unidade, u\.nome_unidade/, conjuntos(UNIDADES, PRODUTOS, TIPOS)], [/SELECT 'implantacao' AS origem/, ATIVIDADES]
];
const painel = (nome, slug, respostas, extras = {}) => ({ nome: `painel: ${nome}`, url: `/publico/painel-projeto/${slug}`, anonimo: true, respostas, ...extras });

const casosDoPainel = [
    painel('completo', 'paraiba', PAINEL_COMPLETO),
    painel('autenticado', 'paraiba', PAINEL_COMPLETO, { anonimo: false }),
    painel('endereço em maiúsculas', 'Paraiba', PAINEL_COMPLETO),
    painel('projeto sem dados', 'paraiba', [PROJETO, [/SELECT id_macro, nome_macro/, conjuntos([], [])], [/SELECT u\.id_unidade, u\.nome_unidade/, conjuntos([], [], [])], [/SELECT 'implantacao' AS origem/, []]]),
    painel('não encontrado ou não público', 'paraiba', [[/WHERE slug_publico = @s AND painel_publico = 1 AND ativo = 1/, []]]),
    painel('endereço inválido', 'a_b', []),
    painel('endereço com hífen nas pontas', '-abc', []),
    painel('endereço longo demais', 'a'.repeat(61), []),
    painel('listar endereços publicados', '', [[/slug_publico AS slug/, [{ slug: 'paraiba', nome: 'Projeto Paraíba' }, { slug: 'bahia', nome: 'Projeto Bahia' }]]]),
    painel('listar endereços sem nenhum', '', [[/slug_publico AS slug/, []]]),
    painel('listar endereços autenticado', '', [[/slug_publico AS slug/, [{ slug: 'paraiba', nome: 'Projeto Paraíba' }]]], { anonimo: false })
];

caracterizar('projetos', [...casosDeLotacoes, ...casosDoPainel]);
