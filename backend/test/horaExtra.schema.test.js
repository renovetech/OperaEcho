/* Entrada do lançamento: o formato enviado pela web e pelo mobile continua aceito. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { salvarLancamento } = require('../src/modules/horaExtra/horaExtra.schema');

const dia = {
    dia: 1, dataObj: '2026-10-01T03:00:00.000Z', diaSemanaStr: 'Quinta', isFeriado: false, isFolga: false, isFDS: false,
    entrada: '08:00', saida: '17:00', intervalo: '01:00', id_unidade: 5, id_projeto: null, horasEfetivas: 480, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: '08:00'
};
const valido = { id_lancamento: null, id_usuario: 1, id_projeto: 2, id_unidade: null, mes_referencia: '2026-10', detalhes_dias: [dia], totais: { he50: 0, he100: 0, adNoturno: 0, horasEfetivas: 480 } };

test('aceita o formato enviado pelas telas e mantém campos a mais', () => {
    const resultado = salvarLancamento.parse(valido);
    assert.equal(resultado.detalhes_dias[0].diaSemanaStr, 'Quinta');
    assert.equal(resultado.totais.horasEfetivas, 480);
});

test('aceita dia de folga com horários vazios', () => {
    assert.ok(salvarLancamento.safeParse({ ...valido, detalhes_dias: [{ ...dia, isFolga: true, entrada: '', saida: '', intervalo: '' }] }).success);
});

test('recusa mês fora do formato', () => {
    assert.equal(salvarLancamento.safeParse({ ...valido, mes_referencia: '10/2026' }).success, false);
});

test('recusa corpo sem os dias ou sem os totais', () => {
    const { detalhes_dias: _dias, ...semDias } = valido;
    const { totais: _totais, ...semTotais } = valido;
    assert.equal(salvarLancamento.safeParse(semDias).success, false);
    assert.equal(salvarLancamento.safeParse(semTotais).success, false);
});

test('recusa minutos negativos', () => {
    assert.equal(salvarLancamento.safeParse({ ...valido, detalhes_dias: [{ ...dia, he50: -1 }] }).success, false);
});
