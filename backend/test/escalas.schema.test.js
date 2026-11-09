/* Entrada das escalas e das regras de acesso: o formato enviado pela web continua aceito, sem conversão. */
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const jwt = require('jsonwebtoken');
require('./apoio/atividadesEscalas');
const { diaDeEscala, loteDeEscala, regrasDoPerfil } = require('../src/modules/escalas/escalas.schema');
const { criarApp } = require('../src/app');

const TRABALHO = { tipo: 'TRABALHO', id_usuario: 3, data_escala: '2026-10-05', id_projeto: '2', id_unidade: '5', produtos: [4, 12], turno: 'DIURNO', redmine: 'RM-12' };
const FOLGA = { tipo: 'FOLGA', id_usuario: 3, data_escala: '2026-10-05', id_projeto: null, id_unidade: null, produtos: [], turno: 'NORMAL', redmine: '' };
const LIMPEZA = { id_usuario: 3, data_escala: '2026-10-05', tipo: null };

test('aceita os registros da web sem converter valores', () => {
    for (const dia of [TRABALHO, FOLGA, LIMPEZA]) assert.deepEqual(diaDeEscala.parse(dia), dia);
});

test('aceita formulário com projeto e unidade ainda vazios', () => {
    assert.ok(diaDeEscala.safeParse({ ...TRABALHO, id_projeto: '', id_unidade: '' }).success);
});

test('aceita id de colaborador em texto e mantém campos a mais', () => {
    const lido = diaDeEscala.parse({ ...LIMPEZA, id_usuario: '3', extra: 'x' });
    assert.equal(lido.id_usuario, '3');
    assert.equal(lido.extra, 'x');
});

for (const [nome, campos] of [
    ['colaborador não numérico', { id_usuario: 'abc' }],
    ['colaborador ausente', { id_usuario: undefined }],
    ['data ausente', { data_escala: undefined }],
    ['data fora do formato', { data_escala: '05/10/2026' }],
    ['projeto não numérico', { id_projeto: 'abc' }],
    ['produtos que não são lista', { produtos: 'abc' }],
    ['produto não numérico', { produtos: ['x'] }]
]) {
    test(`recusa ${nome}`, () => {
        assert.equal(diaDeEscala.safeParse({ ...TRABALHO, ...campos }).success, false);
    });
}

test('lote aceita a lista da web e recusa item inválido', () => {
    assert.deepEqual(loteDeEscala.parse([TRABALHO, FOLGA]), [TRABALHO, FOLGA]);
    assert.equal(loteDeEscala.safeParse([TRABALHO, null]).success, false);
    assert.equal(loteDeEscala.safeParse([TRABALHO, { id_usuario: 'x' }]).success, false);
});

test('regras aceitam o formato da tela de perfis e mantêm os valores', () => {
    const corpo = { perfil: 'Implantador', regras: [{ modulo: 'escala', pode_acessar: true, pode_novo: false, pode_editar: true }, { modulo: 'perfis', pode_acessar: 1 }] };
    assert.deepEqual(regrasDoPerfil.parse(corpo), corpo);
    assert.ok(regrasDoPerfil.safeParse({ perfil: 'Implantador', regras: [] }).success);
});

test('regras recusam item sem módulo ou que não é objeto', () => {
    assert.equal(regrasDoPerfil.safeParse({ perfil: 'Implantador', regras: [{ pode_acessar: true }] }).success, false);
    assert.equal(regrasDoPerfil.safeParse({ perfil: 'Implantador', regras: [null] }).success, false);
});

/* Pela rota: a mensagem própria vem antes do esquema; só depois dela o esquema responde. */
let servidor;
let endereco;
const token = () => jwt.sign({ id_usuario: 1, perfil_acesso: 'Administrador' }, process.env.JWT_SECRET);
const enviar = (url, corpo) => fetch(`${endereco}${url}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo)
});

before(async () => {
    await new Promise((pronto) => { servidor = criarApp().listen(0, '127.0.0.1', pronto); });
    endereco = `http://127.0.0.1:${servidor.address().port}/api/v1`;
});

after(() => servidor.close());

for (const url of ['/escalas', '/projetos/escalas']) {
    test(`${url}: dia inválido responde pelo esquema`, async () => {
        const resposta = await enviar(`${url}/salvar`, { ...TRABALHO, data_escala: 'amanha' });
        assert.equal(resposta.status, 400);
        assert.match((await resposta.json()).erro, /^Campo inválido: data_escala\./);
    });

    test(`${url}: lote vazio mantém a mensagem própria`, async () => {
        const resposta = await enviar(`${url}/salvar-lote`, []);
        assert.equal(resposta.status, 400);
        assert.deepEqual(await resposta.json(), { erro: 'Vazio.' });
    });

    test(`${url}: item de lote inválido responde pelo esquema`, async () => {
        const resposta = await enviar(`${url}/salvar-lote`, [TRABALHO, { ...TRABALHO, id_usuario: 'x' }]);
        assert.equal(resposta.status, 400);
        assert.match((await resposta.json()).erro, /^Campo inválido: 1\.id_usuario\./);
    });
}

test('regras: item inválido responde pelo esquema e dados faltando mantêm a mensagem própria', async () => {
    const invalido = await enviar('/regras/salvar', { perfil: 'Implantador', regras: [{}] });
    assert.equal(invalido.status, 400);
    assert.match((await invalido.json()).erro, /^Campo inválido: regras\.0\.modulo\./);
    const faltando = await enviar('/regras/salvar', { perfil: 'Implantador' });
    assert.deepEqual(await faltando.json(), { erro: 'Dados inválidos.' });
});
