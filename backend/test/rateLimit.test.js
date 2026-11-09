/* Limite compartilhado: soma as instâncias, e sem banco vale só o limite em memória. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

let contagem = null;
const zerados = [];
const arquivoBanco = require.resolve(path.join(__dirname, '..', 'src', 'shared', 'limiteBanco.js'));
require.cache[arquivoBanco] = {
    id: arquivoBanco,
    filename: arquivoBanco,
    loaded: true,
    exports: { registrar: () => Promise.resolve(contagem), zerar: (nome) => { zerados.push(nome); return Promise.resolve(); } }
};
const { limitar } = require('../src/shared/rateLimit');

function chamar(limite) {
    return new Promise((pronto) => {
        const res = { set() {}, status(codigo) { pronto(codigo); return this; }, json() {} };
        limite({ ip: '10.0.0.1' }, res, () => pronto('passou'));
    });
}

test('bloqueia quando as outras instâncias já somaram o máximo', async () => {
    const limite = limitar({ compartilhado: 'teste', max: 5 });
    contagem = 6;
    assert.equal(await chamar(limite), 429);
});

test('passa quando o total está dentro do máximo', async () => {
    const limite = limitar({ compartilhado: 'teste', max: 5 });
    contagem = 5;
    assert.equal(await chamar(limite), 'passou');
});

test('sem resposta do banco, vale o limite em memória', async () => {
    const limite = limitar({ compartilhado: 'teste', max: 1 });
    contagem = null;
    assert.equal(await chamar(limite), 'passou');
    assert.equal(await chamar(limite), 429);
});

test('zerar limpa também o contador compartilhado', () => {
    const limite = limitar({ compartilhado: 'login', max: 1 });
    limite.zerar({ ip: '10.0.0.1' });
    assert.deepEqual(zerados, ['login']);
});
