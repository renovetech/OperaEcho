/* Entrada das rotas de escrita do WhatsApp: o que a tela de Parâmetros envia continua aceito. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { salvarConfiguracao, enviarEscalaSemanal, previaDeMensagem } = require('../src/modules/whatsapp/whatsapp.schema');

const configuracao = {
    ativo: true, url_api: 'https://evolution.exemplo.com', instancia: 'minha-instancia', token_acesso: undefined,
    eventos: { escala_semanal_ativa: true, escala_semanal_dia: 1, escala_semanal_hora: '18:00', escala_semanal_referencia: 'ATUAL', escala_alteracao_ativa: true, escala_alteracao_espera: '15', ferias_ativa: true, codigo_senha_ativa: false, escala_semanal_ultima: '2026-10-12' },
    fila: { inicioAquecimento: undefined, limiteInicial: '80', crescimentoSemanal: 30, limiteMaximo: 1000, maxPorMinuto: 12, pausaMinima: 2, pausaMaxima: 5, horaInicio: '08:00', horaFim: '20:00' },
    textos: { ESCALA_SEMANAL: 'Olá {primeiroNome}', CODIGO_SENHA: '' }
};

test('configuração: aceita o corpo da tela e mantém campos a mais', () => {
    const resultado = salvarConfiguracao.parse({ ...configuracao, extra: 1 });
    assert.equal(resultado.extra, 1);
    assert.equal(resultado.fila.limiteInicial, '80');
    assert.equal(resultado.eventos.escala_alteracao_espera, '15');
});

test('configuração: aceita corpo vazio, blocos nulos e valores que o handler ainda recusa', () => {
    assert.ok(salvarConfiguracao.safeParse({}).success);
    assert.ok(salvarConfiguracao.safeParse({ ativo: false, eventos: null, fila: null, textos: null, token_acesso: null }).success);
    assert.ok(salvarConfiguracao.safeParse({ ...configuracao, url_api: 'ftp://x', fila: { horaInicio: '25:00', limiteInicial: 'abc' } }).success);
});

test('configuração: recusa blocos com forma errada', () => {
    assert.equal(salvarConfiguracao.safeParse({ ...configuracao, eventos: 'sim' }).success, false);
    assert.equal(salvarConfiguracao.safeParse({ ...configuracao, fila: [1] }).success, false);
    assert.equal(salvarConfiguracao.safeParse({ ...configuracao, url_api: 123 }).success, false);
    assert.equal(salvarConfiguracao.safeParse({ ...configuracao, textos: 'x' }).success, false);
});

test('escala semanal: aceita só a semana e deixa o handler conferir o formato', () => {
    assert.ok(enviarEscalaSemanal.safeParse({ semana: '2026-10-26' }).success);
    assert.ok(enviarEscalaSemanal.safeParse({ semana: '26/10/2026', modulos: ['IMPLANTACAO'], forcar: true }).success);
    assert.ok(enviarEscalaSemanal.safeParse({}).success);
});

test('escala semanal: recusa lista de módulos que não é lista', () => {
    assert.equal(enviarEscalaSemanal.safeParse({ semana: '2026-10-26', modulos: 'IMPLANTACAO' }).success, false);
});

test('prévia: aceita evento com ou sem texto em edição', () => {
    assert.ok(previaDeMensagem.safeParse({ evento: 'ESCALA_SEMANAL', texto: '' }).success);
    assert.ok(previaDeMensagem.safeParse({ evento: 'NADA' }).success);
    assert.equal(previaDeMensagem.safeParse({ evento: 'ESCALA_SEMANAL', texto: 5 }).success, false);
});
