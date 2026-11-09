/* Entrada do rastreio GPS: aceita o que o app mobile e a web enviam, inclusive coordenadas nulas. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { rastreio } = require('../src/modules/publicas/publicas.schema');

const aceita = (corpo) => assert.ok(rastreio.safeParse(corpo).success, JSON.stringify(corpo));

test('aceita o formato do app mobile (src/geo.js) e mantém campos a mais', () => {
    const corpo = { usuario: 'Maria', latitude: -7.11, longitude: -34.86, tipo_registro: 'SEGUNDO_PLANO', detalhes_registro: 'Bateria 80%', extra: true };
    assert.equal(rastreio.parse(corpo).extra, true);
});

test('aceita a exclusão de atividade da web, com latitude e longitude nulas', () => {
    aceita({ usuario: 'Ana', latitude: null, longitude: null, tipo_registro: 'EXCLUSAO_ATIVIDADE', detalhes_registro: 'id 9' });
});

test('coordenadas ausentes ou inválidas passam, para o handler responder "Coordenadas inválidas"', () => {
    aceita({});
    aceita({ latitude: 'abc', longitude: {} });
    aceita({ latitude: '1e999', longitude: 999 });
});

test('tipo e detalhes ausentes ou nulos passam', () => {
    aceita({ latitude: 1, longitude: 2 });
    aceita({ latitude: 1, longitude: 2, tipo_registro: null, detalhes_registro: null });
});

test('corpo ausente ou que não é objeto vale como objeto vazio', () => {
    assert.deepEqual(rastreio.parse(undefined), {});
    assert.deepEqual(rastreio.parse([1]), {});
});

test('recusa tipo ou detalhes que são objetos', () => {
    assert.equal(rastreio.safeParse({ tipo_registro: { a: 1 } }).success, false);
    assert.equal(rastreio.safeParse({ detalhes_registro: ['x'] }).success, false);
});
