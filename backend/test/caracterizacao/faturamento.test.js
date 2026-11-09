/* Faturamento SUS: cada rota continua gerando as mesmas consultas, status e respostas.
 * O banco falso não conhece a carga em lote (`bulk`), então ela é aceita sem registro, e o apoio não envia arquivos:
 * o campo especial `__arquivo` do formulário vira o arquivo `arquivo` (BPA, APAC, AIH, vazio) montado aqui. */
const { caracterizar } = require('../apoio/caracterizacao');
const { sql } = require('../../src/config/database');

sql.Request.prototype.bulk = function bulk() { return Promise.resolve({ rowsAffected: 0 }); };

/* ---------------------------------------------------------------- arquivos de produção */
const colocar = (linha, posicao, texto) => linha.slice(0, posicao - 1) + texto + linha.slice(posicao - 1 + texto.length);
const campos = (tamanho, partes) => partes.reduce((linha, [posicao, texto]) => colocar(linha, posicao, texto), ' '.repeat(tamanho));
const preencher = (valor, tamanho) => String(valor).padStart(tamanho, '0');

const bpa = (competencia = '202610') => [
    campos(60, [[1, '01#BPA#'], [8, competencia], [30, 'SISTEMA TESTE']]),
    campos(120, [[1, '03'], [3, '1234567'], [31, '225125'], [50, '0301010072'], [60, '123456789012345'], [89, preencher(10, 6)]]),
    campos(120, [[1, '03'], [3, '1234567'], [31, '225125'], [50, '0301010080'], [60, '123456789012346'], [89, preencher(4, 6)]])
].join('\n');

const bpaTresCodigos = () => [
    campos(60, [[1, '01#BPA#'], [8, '202610']]),
    ...['0301010072', '0301010080', '0301010099'].map((proc) => campos(120, [[1, '03'], [3, '1234567'], [31, '225125'], [50, proc], [60, '123456789012345'], [89, preencher(2, 6)]]))
].join('\n');

const apac = () => [
    campos(60, [[1, '01#APAC'], [8, '202610'], [30, 'SISTEMA TESTE']]),
    campos(60, [[1, '14'], [9, '1234567890123'], [24, '1234567']]),
    campos(60, [[1, '13'], [22, '0301010072'], [32, '225125'], [38, preencher(3, 7)]])
].join('\n');

const aih = () => campos(900, [[12, '202610'], [31, '1234567'], [44, '3512345678901'], [57, '01'], [680, '225125'], [718, '0303010010'], [728, '001'], [797, '0303010028'], [807, '002']]);

const ARQUIVOS = { bpa, apac, aih, bpa_tres_codigos: bpaTresCodigos, vazio: () => '', lixo: () => 'isto nao e um arquivo de producao' };

const buscarOriginal = global.fetch;
global.fetch = (url, opcoes = {}) => {
    const dados = opcoes.body;
    if (!(dados instanceof FormData) || !dados.has('__arquivo')) return buscarOriginal(url, opcoes);
    const nome = dados.get('__arquivo');
    dados.delete('__arquivo');
    dados.append('arquivo', new Blob([ARQUIVOS[nome]()]), `${nome}.txt`);
    return buscarOriginal(url, opcoes);
};

/* ---------------------------------------------------------------- perfis e dados */
const regras = (...modulos) => [/FROM tab_regras_acesso/, modulos.map(([nome_modulo, pode_acessar, pode_novo, pode_editar]) => ({ nome_modulo, pode_acessar, pode_novo, pode_editar }))];
const PERFIL_TOTAL = { perfil: 'Operador Total', id: 7, respostas: [regras(['faturamento_lancar', true, true, true], ['painel_faturamento', true, false, false])] };
const PERFIL_LEITURA = { perfil: 'Operador Leitura', id: 8, respostas: [regras(['faturamento_lancar', true, false, false])] };
const PERFIL_PAINEL = { perfil: 'Operador Painel', id: 9, respostas: [regras(['painel_faturamento', true, false, false])] };
const PERFIL_SEM_ACESSO = { perfil: 'Sem Acesso', id: 10, respostas: [regras()] };
const comRespostas = (perfil, ...extras) => ({ ...perfil, respostas: [...(perfil.respostas || []), ...extras] });

const SIGTAP_ATUAL = [/FROM tab_sigtap_importacao/, [{ competencia: '202610' }, { competencia: '202509' }]];
const SIGTAP_ANTIGA = [/FROM tab_sigtap_importacao/, [{ competencia: '202509' }]];
const SIGTAP_VAZIA = [/FROM tab_sigtap_importacao/, []];
const DESTINO = (extra = {}) => [/FROM tab_unidades u JOIN tab_projetos pj/, [{ id_unidade: 5, nome_unidade: 'UBS Central', cnes: '1234567', id_projeto: 2, nome_projeto: 'Projeto Alfa', nome_produto: 'Prime Saúde', ...extra }]];
const PROCEDIMENTOS = [/FROM tab_sigtap_tb_procedimento p/, [
    { co_procedimento: '0301010072', no_procedimento: 'CONSULTA', vl_sa: 10, vl_sh: 0, vl_sp: 0, aih_secundario: 0 },
    { co_procedimento: '0301010080', no_procedimento: 'VISITA', vl_sa: 2.5, vl_sh: 0, vl_sp: 0, aih_secundario: 0 },
    { co_procedimento: '0303010010', no_procedimento: 'INTERNACAO', vl_sa: 0, vl_sh: 100, vl_sp: 50, aih_secundario: 0 },
    { co_procedimento: '0303010028', no_procedimento: 'DIARIA', vl_sa: 0, vl_sh: 30, vl_sp: 0, aih_secundario: 1 }
]];
const SEM_LANCAMENTO = [/FROM tab_faturamento_lancamento WHERE id_projeto = @p/, []];
const LANCAMENTO_EXISTENTE = [/FROM tab_faturamento_lancamento WHERE id_projeto = @p/, [{ id_lancamento: 40, vl_total: 99.9, usuario: 'Ana', dt_lancamento: '01/10/2026 10:00' }]];
const INSERIDO = [/INSERT INTO tab_faturamento_lancamento/, [{ id_lancamento: 77 }]];
const NOME_USUARIO = [/SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id/, [{ nome_completo: 'Fulano de Tal' }]];
const LANCAMENTO = (extra = {}) => [/SELECT l\.\* FROM tab_faturamento_lancamento l WHERE l\.id_lancamento = @id/, [{ id_lancamento: 9, id_projeto: 2, competencia: '202610', tipo: 'BPA', vl_total: '100.50', ...extra }]];
const ITENS_SALVOS = [/FROM tab_faturamento_item WHERE id_lancamento = @id$/, [
    { origem: 'BPA-I', co_procedimento: '0301010072', no_procedimento: 'CONSULTA', co_cbo: '225125', quantidade: 10 },
    { origem: 'AIH-S', co_procedimento: '0303010028', no_procedimento: null, co_cbo: '', quantidade: 2 }
]];

const formulario = (extra = {}) => ({ id_projeto: 2, id_unidade: 5, id_produto: 3, tipo: 'BPA', competencia: '202610', __arquivo: 'bpa', ...extra });
const semCampo = (campo, extra = {}) => { const { [campo]: _removido, ...resto } = formulario(extra); return resto; };

const base = [SIGTAP_ATUAL, PROCEDIMENTOS, SEM_LANCAMENTO];
const analisar = (nome, perfil, form, ...respostas) => ({ nome, metodo: 'POST', url: '/faturamento/analisar', formulario: form, ...comRespostas(perfil, ...respostas) });
const lancar = (nome, perfil, form, ...respostas) => ({ nome, metodo: 'POST', url: '/faturamento/lancamentos', formulario: form, ...comRespostas(perfil, ...respostas) });

/* ---------------------------------------------------------------- casos */
const opcoes = [
    { nome: 'opcoes: administrador', url: '/faturamento/opcoes', respostas: [
        [/FROM tab_projetos WHERE 1=1/, [{ id_projeto: 2, nome_projeto: 'Projeto Alfa', ativo: true }]],
        [/FROM tab_unidades u WHERE 1=1/, [{ id_unidade: 5, nome_unidade: 'UBS Central', cnes: '1234567', id_projeto: 2, ativo: true, produtos: '3,4' }, { id_unidade: 6, nome_unidade: 'UBS Norte', cnes: '7654321', id_projeto: 2, ativo: true, produtos: null }]],
        [/FROM tab_produtos WHERE ativo = 1/, [{ id_produto: 3, nome_produto: 'Prime Saúde' }, { id_produto: 4, nome_produto: 'Outro Produto' }, { id_produto: 5, nome_produto: 'KlinikosNet' }]],
        SIGTAP_ATUAL
    ] },
    { nome: 'opcoes: perfil com lançamento isola pela lotação', url: '/faturamento/opcoes', ...comRespostas(PERFIL_TOTAL, [/FROM tab_projetos WHERE 1=1/, [{ id_projeto: 2, nome_projeto: 'Projeto Alfa', ativo: true }]], [/FROM tab_produtos WHERE ativo = 1/, [{ id_produto: 3, nome_produto: 'TRS' }]], [/FROM tab_unidades u WHERE 1=1/, [{ id_unidade: 5, nome_unidade: 'UBS', cnes: '1', id_projeto: 2, ativo: true, produtos: '3' }]], SIGTAP_ATUAL) },
    { nome: 'opcoes: perfil só com painel', url: '/faturamento/opcoes', ...comRespostas(PERFIL_PAINEL, [/FROM tab_projetos WHERE 1=1/, []], [/FROM tab_unidades u WHERE 1=1/, []], [/FROM tab_produtos WHERE ativo = 1/, []], SIGTAP_VAZIA) },
    { nome: 'opcoes: sem acesso', url: '/faturamento/opcoes', ...PERFIL_SEM_ACESSO }
];

const previa = [
    analisar('analisar: BPA como administrador', {}, formulario(), ...base, DESTINO()),
    analisar('analisar: perfil com permissão de novo', PERFIL_TOTAL, formulario(), ...base, DESTINO()),
    analisar('analisar: perfil só leitura não analisa', PERFIL_LEITURA, formulario()),
    analisar('analisar: sem acesso', PERFIL_SEM_ACESSO, formulario()),
    analisar('analisar: APAC', {}, formulario({ __arquivo: 'apac', tipo: 'APAC' }), ...base, DESTINO()),
    analisar('analisar: AIH', {}, formulario({ __arquivo: 'aih', tipo: 'AIH' }), ...base, DESTINO({ nome_produto: 'KlinikosNet' })),
    analisar('analisar: sem projeto', {}, semCampo('id_projeto')),
    analisar('analisar: sem produto', {}, semCampo('id_produto')),
    analisar('analisar: tipo inválido', {}, formulario({ tipo: 'XYZ' })),
    analisar('analisar: competência inválida', {}, formulario({ competencia: '202613' })),
    analisar('analisar: unidade fora da lotação', {}, formulario(), [/FROM tab_unidades u JOIN tab_projetos pj/, []]),
    analisar('analisar: produto inexistente', {}, formulario(), DESTINO({ nome_produto: null })),
    analisar('analisar: produto que não gera faturamento', {}, formulario(), DESTINO({ nome_produto: 'Outro Produto' })),
    analisar('analisar: tipo não aceito pelo produto', {}, formulario({ tipo: 'AIH' }), DESTINO()),
    analisar('analisar: sem arquivo', {}, semCampo('__arquivo'), DESTINO()),
    analisar('analisar: arquivo de outro tipo', {}, formulario({ tipo: 'APAC' }), DESTINO()),
    analisar('analisar: arquivo vazio', {}, formulario({ __arquivo: 'vazio' }), DESTINO()),
    analisar('analisar: arquivo sem procedimentos', {}, formulario({ __arquivo: 'lixo' }), DESTINO()),
    analisar('analisar: competência vem do arquivo', {}, semCampo('competencia'), ...base, DESTINO()),
    analisar('analisar: avisa competência e CNES diferentes', {}, formulario({ competencia: '202609' }), SIGTAP_ANTIGA, PROCEDIMENTOS, SEM_LANCAMENTO, DESTINO({ cnes: '7654321' })),
    analisar('analisar: sem SIGTAP importada', {}, formulario(), SIGTAP_VAZIA, SEM_LANCAMENTO, DESTINO()),
    analisar('analisar: layout não reconhecido', {}, formulario({ __arquivo: 'bpa_tres_codigos' }), SIGTAP_ATUAL, [/FROM tab_sigtap_tb_procedimento p/, [PROCEDIMENTOS[1][0]]], DESTINO()),
    analisar('analisar: avisa lançamento existente', {}, formulario(), SIGTAP_ATUAL, PROCEDIMENTOS, LANCAMENTO_EXISTENTE, DESTINO())
];

const gravacao = [
    lancar('lancamentos/gravar: novo lançamento', {}, formulario(), ...base, DESTINO(), INSERIDO, NOME_USUARIO),
    lancar('lancamentos/gravar: perfil com permissão de novo', PERFIL_TOTAL, formulario(), ...base, DESTINO(), INSERIDO, NOME_USUARIO),
    lancar('lancamentos/gravar: usuário sem nome cadastrado', {}, formulario(), ...base, DESTINO(), INSERIDO, [/SELECT nome_completo FROM tab_usuarios/, []]),
    lancar('lancamentos/gravar: perfil só leitura', PERFIL_LEITURA, formulario()),
    lancar('lancamentos/gravar: AIH', {}, formulario({ __arquivo: 'aih', tipo: 'AIH' }), ...base, DESTINO({ nome_produto: 'KlinikosNet' }), INSERIDO, NOME_USUARIO),
    lancar('lancamentos/gravar: já existe sem substituir', {}, formulario(), SIGTAP_ATUAL, PROCEDIMENTOS, LANCAMENTO_EXISTENTE, DESTINO()),
    lancar('lancamentos/gravar: já existe com substituir', {}, formulario({ substituir: '1' }), SIGTAP_ATUAL, PROCEDIMENTOS, LANCAMENTO_EXISTENTE, DESTINO(), INSERIDO, NOME_USUARIO),
    lancar('lancamentos/gravar: já existe com substituir 0', {}, formulario({ substituir: '0' }), SIGTAP_ATUAL, PROCEDIMENTOS, LANCAMENTO_EXISTENTE, DESTINO()),
    lancar('lancamentos/gravar: sem SIGTAP', {}, formulario(), SIGTAP_VAZIA, SEM_LANCAMENTO, DESTINO()),
    lancar('lancamentos/gravar: sem arquivo', {}, semCampo('__arquivo'), DESTINO()),
    lancar('lancamentos/gravar: destino incompleto', {}, semCampo('id_unidade'))
];

const consultas = [
    { nome: 'lancamentos/listar: administrador sem filtros', url: '/faturamento/lancamentos', respostas: [[/FROM tab_faturamento_lancamento l JOIN tab_projetos pj/, [{ id_lancamento: 9, competencia: '202610', tipo: 'BPA', total: 1 }]]] },
    { nome: 'lancamentos/listar: com todos os filtros', url: '/faturamento/lancamentos?projeto=2&unidade=5&produto=3&tipo=bpa&competencia=2026-10&pagina=2&tamanho=50', respostas: [[/FROM tab_faturamento_lancamento l JOIN tab_projetos pj/, [{ id_lancamento: 9, total: 51 }]]] },
    { nome: 'lancamentos/listar: filtros inválidos e página limitada', url: '/faturamento/lancamentos?projeto=abc&tipo=XYZ&competencia=202613&pagina=-4&tamanho=1000', respostas: [[/FROM tab_faturamento_lancamento l JOIN tab_projetos pj/, []]] },
    { nome: 'lancamentos/listar: perfil só leitura isola pela lotação', url: '/faturamento/lancamentos', ...comRespostas(PERFIL_LEITURA, [/FROM tab_faturamento_lancamento l JOIN tab_projetos pj/, []]) },
    { nome: 'lancamentos/listar: perfil só painel', url: '/faturamento/lancamentos', ...comRespostas(PERFIL_PAINEL, [/FROM tab_faturamento_lancamento l JOIN tab_projetos pj/, []]) },
    { nome: 'lancamentos/listar: sem acesso', url: '/faturamento/lancamentos', ...PERFIL_SEM_ACESSO },
    { nome: 'lancamentos/detalhe: encontrado', url: '/faturamento/lancamentos/9', respostas: [LANCAMENTO(), [/GROUP BY co_procedimento/, [{ co_procedimento: '0301010072', no_procedimento: 'CONSULTA', quantidade: 10, vl_unitario: 10, vl_total: 100 }]]] },
    { nome: 'lancamentos/detalhe: identificador inválido', url: '/faturamento/lancamentos/abc' },
    { nome: 'lancamentos/detalhe: não encontrado', url: '/faturamento/lancamentos/9', ...comRespostas(PERFIL_LEITURA, [/SELECT l\.\* FROM tab_faturamento_lancamento l/, []]) }
];

const gestao = [
    { nome: 'lancamentos/excluir: administrador', metodo: 'DELETE', url: '/faturamento/lancamentos/9', respostas: [LANCAMENTO()] },
    { nome: 'lancamentos/excluir: perfil com edição', metodo: 'DELETE', url: '/faturamento/lancamentos/9', ...comRespostas(PERFIL_TOTAL, LANCAMENTO()) },
    { nome: 'lancamentos/excluir: perfil sem edição', metodo: 'DELETE', url: '/faturamento/lancamentos/9', ...PERFIL_LEITURA },
    { nome: 'lancamentos/excluir: não encontrado', metodo: 'DELETE', url: '/faturamento/lancamentos/9', respostas: [[/SELECT l\.\* FROM tab_faturamento_lancamento l/, []]] },
    { nome: 'lancamentos/excluir: identificador inválido', metodo: 'DELETE', url: '/faturamento/lancamentos/0' },
    { nome: 'lancamentos/revalorizar: administrador', metodo: 'POST', url: '/faturamento/lancamentos/9/revalorizar', respostas: [LANCAMENTO(), SIGTAP_ATUAL, ITENS_SALVOS, PROCEDIMENTOS] },
    { nome: 'lancamentos/revalorizar: perfil com edição', metodo: 'POST', url: '/faturamento/lancamentos/9/revalorizar', ...comRespostas(PERFIL_TOTAL, LANCAMENTO(), SIGTAP_ANTIGA, ITENS_SALVOS, PROCEDIMENTOS) },
    { nome: 'lancamentos/revalorizar: perfil sem edição', metodo: 'POST', url: '/faturamento/lancamentos/9/revalorizar', ...PERFIL_LEITURA },
    { nome: 'lancamentos/revalorizar: sem SIGTAP', metodo: 'POST', url: '/faturamento/lancamentos/9/revalorizar', respostas: [LANCAMENTO(), SIGTAP_VAZIA] },
    { nome: 'lancamentos/revalorizar: não encontrado', metodo: 'POST', url: '/faturamento/lancamentos/9/revalorizar', respostas: [[/SELECT l\.\* FROM tab_faturamento_lancamento l/, []]] }
];

const COMPETENCIAS = [/SELECT DISTINCT l\.competencia/, [{ competencia: '202609' }, { competencia: '202610' }]];
const PAINEL = [
    COMPETENCIAS,
    [/SUM\(l\.qt_pacientes\)/, [{ competencia: '202610', vl_total: '150.5', qt_total: 14, qt_pacientes: 2, qt_aih: 0, qt_lancamentos: 1, qt_unidades: 1 }]],
    [/SELECT i\.co_procedimento, l\.competencia/, [{ co_procedimento: '0301010072', competencia: '202610', qt: 10, vl: '100', no_procedimento: 'CONSULTA' }]],
    [/SELECT l\.id_unidade, u\.nome_unidade/, [{ id_unidade: 5, nome_unidade: 'UBS Central', nome_projeto: 'Projeto Alfa', competencia: '202610', vl: '150.5', qt: 14 }]],
    [/SELECT i\.co_cbo, l\.competencia/, [{ co_cbo: '225125', competencia: '202610', qt: 14, vl: '150.5' }]],
    SIGTAP_ATUAL,
    [/FROM tab_sigtap_tb_sub_grupo/, [{ cod: '0301', no_sub_grupo: 'CONSULTAS' }]],
    [/FROM tab_sigtap_tb_ocupacao/, [{ co_ocupacao: '225125', no_ocupacao: 'MEDICO' }]]
];

const PAINEL_VAZIO = [[/SELECT DISTINCT l\.competencia/, []], [/SUM\(l\.qt_pacientes\)/, []], [/SELECT i\.co_procedimento, l\.competencia/, []], [/SELECT l\.id_unidade, u\.nome_unidade/, []], [/SELECT i\.co_cbo, l\.competencia/, []]];

const painel = [
    { nome: 'painel: administrador sem filtros', url: '/faturamento/painel', respostas: PAINEL },
    { nome: 'painel: todos os filtros', url: '/faturamento/painel?projeto=2&unidade=5&produto=3&tipo=bpa&de=2026-01&ate=202612', respostas: PAINEL },
    { nome: 'painel: filtros de período e lista de produtos', url: '/faturamento/painel?produtos=3,4,abc&de=202601&ate=202612', respostas: PAINEL },
    { nome: 'painel: lista de produtos sem ids válidos', url: '/faturamento/painel?produtos=x,y', respostas: PAINEL },
    { nome: 'painel: produto tem precedência sobre a lista', url: '/faturamento/painel?produto=3&produtos=4,5', respostas: PAINEL },
    { nome: 'painel: sem SIGTAP importada', url: '/faturamento/painel', respostas: [...PAINEL_VAZIO, SIGTAP_VAZIA] },
    { nome: 'painel: sem CBO nos itens', url: '/faturamento/painel', respostas: [...PAINEL_VAZIO, SIGTAP_ATUAL, [/FROM tab_sigtap_tb_sub_grupo/, []]] },
    { nome: 'painel: perfil do painel isola pela lotação', url: '/faturamento/painel', ...comRespostas(PERFIL_PAINEL, ...PAINEL) },
    { nome: 'painel: perfil só com lançamento', url: '/faturamento/painel', ...PERFIL_LEITURA },
    { nome: 'painel: sem acesso', url: '/faturamento/painel', ...PERFIL_SEM_ACESSO }
];

caracterizar('faturamento', [...opcoes, ...previa, ...gravacao, ...consultas, ...gestao, ...painel]);
