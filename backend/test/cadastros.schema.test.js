/* Entrada dos cadastros e das regiões: o formato enviado pela web continua aceito e o que quebraria o handler é recusado. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { salvarProjeto, salvarProduto, salvarUnidade, importarCoordenadas } = require('../src/modules/cadastros/cadastros.schema');
const { salvarMacro, salvarMicro, vincularUnidades } = require('../src/modules/cadastros/regioes.schema');

const aceita = (esquema, corpo) => assert.ok(esquema.safeParse(corpo).success, JSON.stringify(corpo));
const recusa = (esquema, corpo) => assert.equal(esquema.safeParse(corpo).success, false, JSON.stringify(corpo));

test('projeto: aceita o formulário da web e mantém campos a mais', () => {
    const corpo = { id_projeto: null, nome_projeto: 'Projeto A', categoria: 'A', ativo: true, gera_lotacao: false, painel_publico: true, slug_publico: 'a', extra: 1 };
    assert.equal(salvarProjeto.parse(corpo).extra, 1);
});

test('projeto: campos obrigatórios ausentes passam, para o handler responder com a mensagem dele', () => {
    aceita(salvarProjeto, {});
    aceita(salvarProjeto, { nome_projeto: '', categoria: '' });
});

test('projeto: corpo ausente ou que não é objeto vale como objeto vazio', () => {
    assert.deepEqual(salvarProjeto.parse(undefined), {});
    assert.deepEqual(salvarProjeto.parse([1]), {});
});

test('projeto: recusa nome que é objeto ou lista', () => {
    recusa(salvarProjeto, { nome_projeto: { a: 1 } });
    recusa(salvarProjeto, { id_projeto: [1] });
});

test('produto: aceita o formulário da web com o responsável', () => {
    aceita(salvarProduto, { id_produto: '', nome_produto: 'Agenda', ativo: true, responsavel_acao: 'Maria' });
});

test('unidade: aceita ids em texto, coordenadas em texto e lista de produtos', () => {
    const corpo = { id_unidade: '', nome_unidade: 'UBS', cnes: '123', id_projeto: '2', id_cidade: '10', latitude: '-7,1', longitude: '', id_macro: '', id_micro: '', id_tipo_unidade: '3', ativo: true, produtos: [4, '17'] };
    assert.deepEqual(salvarUnidade.parse(corpo), corpo);
});

test('unidade: recusa produtos que não são lista ou coordenada que é objeto', () => {
    recusa(salvarUnidade, { produtos: 'abc' });
    recusa(salvarUnidade, { latitude: {} });
});

test('importação: aceita linhas como objetos e deixa lista vazia ou ausente para o handler', () => {
    aceita(importarCoordenadas, { id_projeto: null, linhas: [{ cnes: '1', latitude: '1', longitude: '2' }] });
    aceita(importarCoordenadas, { id_projeto: '2', linhas: [] });
    aceita(importarCoordenadas, { linhas: 'x' });
    aceita(importarCoordenadas, {});
});

test('importação: recusa linha que não é objeto', () => {
    recusa(importarCoordenadas, { linhas: [null] });
    recusa(importarCoordenadas, { linhas: ['1;2;3'] });
});

test('macro e micro: aceitam o formulário da web', () => {
    aceita(salvarMacro, { id_macro: '', id_projeto: '2', nome_macro: 'Leste', sigla: '', cor: '#aabbcc', ordem: 1, ativo: true });
    aceita(salvarMicro, { id_micro: 7, id_macro: '1', nome_micro: 'Litoral', sigla: 'L', cor: null, ordem: 2, ativo: false });
    aceita(salvarMacro, {});
    aceita(salvarMicro, undefined);
});

test('macro e micro: recusam campos que são objetos', () => {
    recusa(salvarMacro, { nome_macro: { x: 1 } });
    recusa(salvarMicro, { cor: ['#fff'] });
});

test('vínculo das unidades: aceita itens com macro e micro nulos', () => {
    aceita(vincularUnidades, { id_projeto: '2', itens: [{ id_unidade: 5, id_macro: null, id_micro: null }] });
    aceita(vincularUnidades, { id_projeto: 2 });
    aceita(vincularUnidades, { id_projeto: 2, itens: 'x' });
});

test('vínculo das unidades: recusa item que não é objeto', () => {
    recusa(vincularUnidades, { id_projeto: 2, itens: [5] });
});
