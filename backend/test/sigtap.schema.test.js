/* Entrada da importação SIGTAP: o upload multipart não tem campos de texto obrigatórios. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { importarCompetencia } = require('../src/modules/sigtap/sigtap.schema');

test('aceita o corpo vazio que o multer entrega e mantém campos a mais', () => {
    assert.ok(importarCompetencia.safeParse({}).success);
    assert.equal(importarCompetencia.parse({ observacao: 'x' }).observacao, 'x');
});

test('aceita corpo de protótipo nulo, como o do multer', () => {
    assert.ok(importarCompetencia.safeParse(Object.create(null)).success);
});

test('recusa corpo que não é objeto', () => {
    assert.equal(importarCompetencia.safeParse([]).success, false);
    assert.equal(importarCompetencia.safeParse('texto').success, false);
});
