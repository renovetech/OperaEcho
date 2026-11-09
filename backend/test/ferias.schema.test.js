/* Entrada das rotas de escrita de férias: formatos da web e do app mobile continuam aceitos. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const esquemas = require('../src/modules/ferias/ferias.schema');

const solicitacaoWeb = { id_usuario: 5, periodo_aquisitivo: '2025', tipo_solicitacao: '1º Período (15 Dias)', data_inicio: '2026-02-02', data_fim: '2026-02-16', dias_restantes: 30 };
const solicitacaoMobile = { ...solicitacaoWeb, id_usuario: 7, periodo_aquisitivo: 2025 };

test('solicitar: aceita o formato da web (ano em texto) sem transformar os valores', () => {
    const resultado = esquemas.solicitarFerias.parse(solicitacaoWeb);
    assert.equal(resultado.periodo_aquisitivo, '2025');
    assert.equal(resultado.dias_restantes, 30);
});

test('solicitar: aceita o formato do app mobile e mantém campos a mais', () => {
    const resultado = esquemas.solicitarFerias.parse({ ...solicitacaoMobile, observacao: 'x' });
    assert.equal(resultado.periodo_aquisitivo, 2025);
    assert.equal(resultado.observacao, 'x');
});

test('solicitar: datas ausentes ficam para o handler responder "Período inválido"', () => {
    const { data_inicio: _inicio, data_fim: _fim, ...semDatas } = solicitacaoWeb;
    assert.ok(esquemas.solicitarFerias.safeParse(semDatas).success);
});

test('solicitar: recusa ano que não é número e tipo ausente', () => {
    assert.equal(esquemas.solicitarFerias.safeParse({ ...solicitacaoWeb, periodo_aquisitivo: 'abc' }).success, false);
    assert.equal(esquemas.solicitarFerias.safeParse({ ...solicitacaoWeb, periodo_aquisitivo: undefined }).success, false);
    const { tipo_solicitacao: _tipo, ...semTipo } = solicitacaoWeb;
    assert.equal(esquemas.solicitarFerias.safeParse(semTipo).success, false);
});

test('editar: aceita o corpo enviado pela tela de aprovação', () => {
    const edicao = { periodo_aquisitivo: '2025', tipo_solicitacao: '2º Período (15 Dias)', data_inicio: '2026-03-02', data_fim: '2026-03-04' };
    assert.ok(esquemas.editarFerias.safeParse(edicao).success);
    assert.equal(esquemas.editarFerias.safeParse({ ...edicao, tipo_solicitacao: 15 }).success, false);
});

test('conflitos: aceita solicitação nova (sem id) e datas em texto', () => {
    assert.ok(esquemas.verificarConflitos.safeParse({ data_inicio: '2026-01-10', data_fim: '2026-01-20' }).success);
    assert.ok(esquemas.verificarConflitos.safeParse({ id_ferias: 3, data_inicio: '2026-01-10', data_fim: '2026-01-20' }).success);
    assert.equal(esquemas.verificarConflitos.safeParse({ id_ferias: { a: 1 } }).success, false);
});

test('status: o valor é conferido pelo handler, que mantém a mensagem "Status inválido."', () => {
    assert.ok(esquemas.alterarStatus.safeParse({ status: 'APROVADO' }).success);
    assert.ok(esquemas.alterarStatus.safeParse({ status: 'TALVEZ' }).success);
    assert.ok(esquemas.alterarStatus.safeParse({}).success);
});
