/* Entrada do lançamento de faturamento: campos do formulário multipart (sempre texto) continuam aceitos. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { destinoDoLancamento } = require('../src/modules/faturamento/faturamento.schema');

const formulario = { id_projeto: '2', id_unidade: '5', id_produto: '3', tipo: 'BPA', competencia: '202610', substituir: '0' };

test('aceita o formulário enviado pela tela e mantém os valores em texto', () => {
    const resultado = destinoDoLancamento.parse({ ...formulario, outro: 'x' });
    assert.equal(resultado.id_projeto, '2');
    assert.equal(resultado.substituir, '0');
    assert.equal(resultado.outro, 'x');
});

test('aceita corpo de objeto sem protótipo, como o multer entrega', () => {
    const corpo = Object.assign(Object.create(null), formulario);
    assert.ok(destinoDoLancamento.safeParse(corpo).success);
});

test('campos ausentes ou inválidos ficam para o serviço responder com a mensagem própria', () => {
    assert.ok(destinoDoLancamento.safeParse({}).success);
    assert.ok(destinoDoLancamento.safeParse({ ...formulario, tipo: 'XYZ', competencia: '202613' }).success);
});

test('requisição sem formulário vale como corpo vazio', () => {
    assert.deepEqual(destinoDoLancamento.parse(undefined), {});
    assert.deepEqual(destinoDoLancamento.parse(null), {});
});

test('recusa campo com tipo impossível no formulário', () => {
    assert.equal(destinoDoLancamento.safeParse({ ...formulario, id_projeto: ['2'] }).success, false);
    assert.equal(destinoDoLancamento.safeParse('texto solto').success, false);
});
