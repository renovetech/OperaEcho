/* Entrada da gravação de atividade: o multipart enviado pela web e pelo app continua aceito, sem conversão. */
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');
const { anexosNoDisco } = require('./apoio/atividadesEscalas');
const { salvarAtividade } = require('../src/modules/atividades/atividades.schema');
const { criarApp } = require('../src/app');

const DA_WEB = {
    id_atividade: '9', data_inicio: '2026-10-05', data_fim: '2026-10-06', redmine: '', profissionais_env: '', tempo_gasto: '02:30',
    implantadores_ids: '[3,4]', equipe_projeto_ids: '[]', motivos: 'Treinamento, Visita', id_projeto: '2', id_unidade: '5',
    produtos_trabalhados: 'Agenda, Prontuário', arquivos_antigos_mantidos: 'uploads/atividades/a.pdf?t=abc', nome_usuario_upload: 'Maria Silva'
};
const DO_APP = {
    data_inicio: '2026-10-05', data_fim: '2026-10-05', implantadores_ids: '[3]', equipe_projeto_ids: '[8]', motivos: 'Apoio ao Projeto',
    produtos_trabalhados: '', redmine: '', profissionais_env: '3', tempo_gasto: '', id_projeto: '2', id_unidade: '5', arquivos_antigos_mantidos: '', nome_usuario_upload: 'Maria'
};

test('aceita o formulário da web sem converter valores', () => {
    assert.deepEqual(salvarAtividade.parse(DA_WEB), DA_WEB);
});

test('aceita o formulário do app sem converter valores', () => {
    assert.deepEqual(salvarAtividade.parse(DO_APP), DO_APP);
});

test('aceita o corpo do multer, que não tem protótipo', () => {
    const corpo = Object.assign(Object.create(null), DA_WEB);
    assert.equal(salvarAtividade.parse(corpo).id_projeto, '2');
});

test('mantém campos a mais', () => {
    assert.equal(salvarAtividade.parse({ ...DO_APP, extra: 'x' }).extra, 'x');
});

test('não cobra o que a rota já responde com mensagem própria', () => {
    assert.ok(salvarAtividade.safeParse({}).success, 'corpo vazio');
    assert.ok(salvarAtividade.safeParse({ ...DA_WEB, data_inicio: '', id_unidade: '', motivos: '', id_projeto: '' }).success, 'obrigatórios vazios');
    assert.ok(salvarAtividade.safeParse({ ...DA_WEB, tempo_gasto: 'abc' }).success, 'tempo inválido');
    assert.ok(salvarAtividade.safeParse({ ...DA_WEB, implantadores_ids: 'abc', equipe_projeto_ids: [1, 'x'] }).success, 'listas soltas');
});

test('aceita ids numéricos e lista de implantadores em json', () => {
    assert.ok(salvarAtividade.safeParse({ ...DA_WEB, id_projeto: 2, id_unidade: 5, id_atividade: 9, implantadores_ids: [3, 4] }).success);
});

for (const [nome, campos] of [
    ['data fora do formato', { data_inicio: '05/10/2026' }],
    ['data fim fora do formato', { data_fim: 'ontem' }],
    ['projeto não numérico', { id_projeto: 'abc' }],
    ['unidade não numérica', { id_unidade: '5x' }],
    ['id de atividade não numérico', { id_atividade: 'abc' }],
    ['campo repetido no multipart', { motivos: ['a', 'b'] }]
]) {
    test(`recusa ${nome}`, () => {
        assert.equal(salvarAtividade.safeParse({ ...DA_WEB, ...campos }).success, false);
    });
}

/* Pela rota: a recusa do esquema não deixa arquivo no disco e usa o formato de erro da API. */
let servidor;
let endereco;

before(async () => {
    await new Promise((pronto) => { servidor = criarApp().listen(0, '127.0.0.1', pronto); });
    endereco = `http://127.0.0.1:${servidor.address().port}/api/v1`;
});

after(() => servidor.close());

for (const [modulo, url] of [['implantação', '/atividades/salvar'], ['projetos', '/projetos/atividades/salvar']]) {
    test(`${modulo}: data inválida responde 400 e apaga o anexo recebido`, async () => {
        const dados = new FormData();
        Object.entries({ ...DA_WEB, id_atividade: '', data_inicio: 'amanha', anexos: 'recusado-pelo-esquema.pdf' }).forEach(([chave, valor]) => dados.append(chave, valor));
        const token = jwt.sign({ id_usuario: 1, perfil_acesso: 'Administrador' }, process.env.JWT_SECRET);
        const resposta = await fetch(`${endereco}${url}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: dados });
        assert.equal(resposta.status, 400);
        assert.match((await resposta.json()).erro, /^Campo inválido: data_inicio\./);
        await new Promise((pronto) => { setTimeout(pronto, 30); });
        assert.deepEqual(anexosNoDisco(), []);
    });
}
