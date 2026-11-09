/* Entrada do Plano de Ação: o formato enviado pela web continua aceito e nada é convertido ou removido. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const esquemas = require('../src/modules/planoAcao/planoAcao.schema');

const etapa = { acao: 'Treinar equipe', modulo: 'Cadastro', grupo: 'Preparação', responsavel: 'Ana', prioridade: 'Média', data_inicio: '2026-10-01', data_fim: null, _extra: 1 };
const novoPlano = {
    titulo: 'Plano', id_projeto: 2, id_produto: null, sub_tipo: 'Implantação', cliente: '', descricao: 'x', data_inicio_prevista: '2026-10-01', data_fim_prevista: '',
    publico: true, unidades_ids: [4, 5], etapas_padrao: [etapa], etapas_unidade: [etapa]
};
const linha = { id_item: 10, descricao: 'Ação', status: 'Em andamento', percentual: '', tempo_previsto: 60, data_fim: '2026-10-30', equipe: [1, 2], _tempo_str: '01:00' };

test('aceita o corpo enviado ao criar um plano e mantém campos a mais', () => {
    const r = esquemas.criarPlano.parse(novoPlano);
    assert.deepEqual(r, novoPlano);
});

test('aceita a grade com percentual vazio, equipe e campos da tela', () => {
    const r = esquemas.salvarGrade.parse({ id_plano: 3, etapas: [linha] });
    assert.deepEqual(r.etapas[0], linha);
});

test('não acrescenta chaves ausentes (a grade distingue campo ausente de campo vazio)', () => {
    const r = esquemas.salvarGrade.parse({ id_plano: 3, etapas: [{ id_item: 10 }] });
    assert.deepEqual(Object.keys(r.etapas[0]), ['id_item']);
});

test('campos obrigatórios continuam com a regra, que responde com mensagem própria', () => {
    assert.ok(esquemas.criarPlano.safeParse({}).success);
    assert.ok(esquemas.incluirItem.safeParse({}).success);
    assert.ok(esquemas.renomearEtapa.safeParse({}).success);
    assert.ok(esquemas.apontarHoras.safeParse({ minutos: 0, data_execucao: 'ontem' }).success);
});

test('corpo que não é objeto vira vazio', () => {
    assert.deepEqual(esquemas.encerrarPlano.parse(undefined), {});
    assert.deepEqual(esquemas.publicarPlano.parse(null), {});
    assert.deepEqual(esquemas.moverItem.parse([1]), {});
});

test('aceita os corpos das demais rotas de escrita', () => {
    assert.ok(esquemas.atualizarPlano.safeParse({ titulo: 'a', cliente: null, descricao: null, data_inicio_prevista: null, data_fim_prevista: null }).success);
    assert.ok(esquemas.publicarPlano.safeParse({ publico: false, regenerar: true }).success);
    assert.ok(esquemas.encerrarPlano.safeParse({ justificativa: null }).success);
    assert.ok(esquemas.apontarHoras.safeParse({ data_execucao: '2026-10-14', minutos: 90, descricao: 'x', id_usuario: 2 }).success);
    assert.ok(esquemas.moverItem.safeParse({ direcao: 'cima' }).success);
    assert.ok(esquemas.incluirItem.safeParse({ descricao: 'a', id_unidade: null, apos_id_item: 3, grupo: null, modulo: 'x' }).success);
    assert.ok(esquemas.adicionarUnidade.safeParse({ id_plano: 3, id_unidade: 6, etapas_template: [etapa] }).success);
    assert.ok(esquemas.renomearEtapa.safeParse({ modulo: null, de: 'A', para: 'B' }).success);
});

test('recusa objeto ou lista onde se espera texto ou número', () => {
    assert.equal(esquemas.criarPlano.safeParse({ ...novoPlano, titulo: { a: 1 } }).success, false);
    assert.equal(esquemas.atualizarPlano.safeParse({ titulo: ['a'] }).success, false);
    assert.equal(esquemas.apontarHoras.safeParse({ minutos: { v: 1 } }).success, false);
});

test('recusa listas com elementos que não são objetos ou valores simples', () => {
    assert.equal(esquemas.criarPlano.safeParse({ ...novoPlano, etapas_padrao: [null] }).success, false);
    assert.equal(esquemas.criarPlano.safeParse({ ...novoPlano, unidades_ids: [{ id: 1 }] }).success, false);
    assert.equal(esquemas.salvarGrade.safeParse({ etapas: ['x'] }).success, false);
    assert.equal(esquemas.salvarGrade.safeParse({ etapas: [{ id_item: 1, equipe: [[1]] }] }).success, false);
    assert.equal(esquemas.adicionarUnidade.safeParse({ etapas_template: 'texto' }).success, false);
});
