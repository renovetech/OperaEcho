/* Entrada de parâmetros e links externos: o formato da web continua aceito e as mensagens do handler continuam valendo. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { salvarParametros } = require('../src/modules/parametros/parametros.schema');
const { salvarLink } = require('../src/modules/parametros/linksExternos.schema');

const aceita = (esquema, corpo) => assert.ok(esquema.safeParse(corpo).success, JSON.stringify(corpo));
const recusa = (esquema, corpo) => assert.equal(esquema.safeParse(corpo).success, false, JSON.stringify(corpo));

test('parâmetros: aceita a lista enviada pela web', () => {
    aceita(salvarParametros, { parametros: [{ chave: 'anexo_obrigatorio_implantacao', valor: true }, { chave: 'x', valor: '1' }] });
});

test('parâmetros: lista ausente, vazia ou que não é lista passa para o handler responder', () => {
    aceita(salvarParametros, {});
    aceita(salvarParametros, { parametros: [] });
    aceita(salvarParametros, { parametros: 'x' });
    assert.deepEqual(salvarParametros.parse(null), {});
});

test('parâmetros: recusa item que não é objeto', () => {
    recusa(salvarParametros, { parametros: [null] });
    recusa(salvarParametros, { parametros: ['a'] });
});

test('link: aceita produto como número ou texto e mantém campos a mais', () => {
    assert.equal(salvarLink.parse({ id_produto: 4, url: 'https://a.com', extra: 1 }).extra, 1);
    aceita(salvarLink, { id_produto: '4', url: 'a.com' });
});

test('link: produto e endereço ausentes ou com tipo estranho passam, para o handler responder com a mensagem dele', () => {
    aceita(salvarLink, {});
    aceita(salvarLink, { id_produto: 4, url: 12345 });
    aceita(salvarLink, { id_produto: 4, url: ['a'] });
});

test('link: recusa produto que é objeto', () => {
    recusa(salvarLink, { id_produto: { id: 1 }, url: 'a.com' });
});
