/* Entrada do login e da recuperação de senha: o formato da web e do mobile é aceito e nada é recusado aqui,
 * porque cada handler responde com mensagem própria a campo ausente ou de tipo errado. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const esquemas = require('../src/modules/auth/auth.schema');

test('login aceita o corpo enviado pela web e pelo mobile, com a posição extra', () => {
    const corpo = { usuario: 'ana', senha: 'Senha@123', latitude: -22.9, longitude: -43.2 };
    assert.deepEqual(esquemas.login.parse(corpo), corpo);
});

test('login mantém campos ausentes e de tipo errado para o handler responder', () => {
    assert.deepEqual(esquemas.login.parse({ usuario: 123, senha: null }), { usuario: 123, senha: null });
    assert.deepEqual(esquemas.login.parse({}), {});
});

test('corpo ausente, nulo ou em lista vale como objeto vazio', () => {
    for (const esquema of Object.values(esquemas)) {
        assert.deepEqual(esquema.parse(undefined), {});
        assert.deepEqual(esquema.parse(null), {});
        assert.deepEqual(esquema.parse([1, 2]), {});
    }
});

test('recuperação aceita identificação, canal, código e token como o app envia', () => {
    const identificacao = { matricula: '1234', usuario: 'ana' };
    assert.deepEqual(esquemas.consultarCanais.parse(identificacao), identificacao);
    assert.deepEqual(esquemas.solicitarCodigo.parse({ ...identificacao, canal: 'EMAIL' }), { ...identificacao, canal: 'EMAIL' });
    assert.deepEqual(esquemas.verificarCodigo.parse({ ...identificacao, codigo: '123456' }), { ...identificacao, codigo: '123456' });
    const troca = { token_reset: 'abc.def.ghi', nova_senha: 'Nova@1234' };
    assert.deepEqual(esquemas.confirmarSenha.parse(troca), troca);
});

test('confirmação mantém o id enviado pela web, que o handler ignora', () => {
    const corpo = { id_usuario: 4, nova_senha: 'Nova@1234' };
    assert.deepEqual(esquemas.confirmarSenha.parse(corpo), corpo);
});
