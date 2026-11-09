/* Regras de férias que não passam pelas rotas no banco falso: aprovação por função e relatório de prazos. */
const assert = require('node:assert/strict');
const { test } = require('node:test');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
const servico = require('../src/modules/ferias/ferias.service');

const HOJE = new Date(2026, 10, 8, 15, 30);
const usuario = { id_usuario: 5, matricula: 'M1', nome_completo: 'Maria', setor: 'TI', funcao: 'Implantador', data_admissao: new Date('2024-03-15T00:00:00.000Z') };
const ferias = (extra) => ({ id_usuario: 5, periodo_aquisitivo: 2024, tipo_solicitacao: '1º Período (15 Dias)', data_inicio: '2026-01-10', data_fim: '2026-01-24', status: 'APROVADO', ...extra });

test('aprovação por função: administrador e gerente aprovam qualquer um', () => {
    assert.equal(servico.podeAprovarFuncao({ perfil_acesso: 'Administrador' }, 'Analista'), true);
    assert.equal(servico.podeAprovarFuncao({ nome_funcao: 'Gerente' }, 'Analista'), true);
});

test('aprovação por função: coordenador só aprova implantador, líder só analista e operador', () => {
    const coordenador = { nome_funcao: 'Coordenador de Implantação' };
    const lider = { nome_funcao: 'Líder de Projeto' };
    assert.equal(servico.podeAprovarFuncao(coordenador, 'Implantador'), true);
    assert.equal(servico.podeAprovarFuncao(coordenador, 'Analista'), false);
    assert.equal(servico.podeAprovarFuncao(lider, 'Operador'), true);
    assert.equal(servico.podeAprovarFuncao(lider, 'Implantador'), false);
    assert.equal(servico.podeAprovarFuncao(null, 'Implantador'), false);
});

test('período válido: ordem das datas e máximo de 60 dias', () => {
    assert.equal(servico.periodoValido('2026-02-01', '2026-02-15'), true);
    assert.equal(servico.periodoValido('2026-02-15', '2026-02-01'), false);
    assert.equal(servico.periodoValido('2026-02-01', '2026-04-01'), true);
    assert.equal(servico.periodoValido('2026-02-01', '2026-04-02'), false);
    assert.equal(servico.periodoValido(undefined, '2026-04-02'), false);
});

test('relatório: períodos adquiridos com férias, saldo, prazo e ordenação pelo vencimento', () => {
    const linhas = servico.montarRelatorioPrazos([usuario], [
        ferias({ periodo_aquisitivo: 2024 }),
        ferias({ periodo_aquisitivo: 2024, data_inicio: '2026-06-01', data_fim: '2026-06-05', status: 'PENDENTE' }),
        ferias({ periodo_aquisitivo: 2025, status: 'RECUSADO' }),
        ferias({ id_usuario: 99, periodo_aquisitivo: 2024 })
    ], HOJE);
    const pa2024 = linhas.find(l => l.periodo_aquisitivo === 2024);
    assert.equal(pa2024.dias_gozados, 15);
    assert.equal(pa2024.dias_em_analise, 5);
    assert.equal(pa2024.saldo_restante, 15);
    assert.equal(pa2024.inicio_pa, '2024-03-15');
    assert.equal(pa2024.data_limite, '2026-02-14');
    assert.equal(pa2024.status_prazo, 'VENCIDO');
    assert.equal(linhas.find(l => l.periodo_aquisitivo === 2025).saldo_restante, 30);
    assert.deepEqual(linhas.map(l => l.periodo_aquisitivo), [2024, 2025]);
});

test('relatório: ignora período sem solicitação e período ainda não adquirido; férias vendidas valem 30 dias', () => {
    assert.deepEqual(servico.montarRelatorioPrazos([usuario], [], HOJE), []);
    assert.deepEqual(servico.montarRelatorioPrazos([usuario], [ferias({ periodo_aquisitivo: 2026 })], HOJE), []);
    const vendidas = servico.montarRelatorioPrazos([usuario], [ferias({ tipo_solicitacao: '20 Dias (c/ 10 Vendidos)' })], HOJE);
    assert.equal(vendidas[0].dias_gozados, 30);
    assert.equal(vendidas[0].saldo_restante, 0);
});

test('relatório: usuário sem data de admissão válida não gera linhas', () => {
    assert.deepEqual(servico.montarRelatorioPrazos([{ ...usuario, data_admissao: undefined }], [ferias()], HOJE), []);
});
