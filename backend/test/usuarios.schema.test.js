/* Entrada de salvar, ativar e contato: o formato da web (cadastro e autocadastro) continua aceito. */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { salvarUsuario, ativarUsuario, atualizarContato } = require('../src/modules/usuarios/usuarios.schema');

const cadastro = {
    id_usuario: null, nome_completo: 'Maria Souza', cpf: '12345678901', data_nascimento: null, data_admissao: '2026-01-02', sexo: 'F',
    celular: '21987654321', celular_whatsapp: true, email: 'maria@exemplo.com', matricula: 'M100', usuario: 'maria.souza',
    id_setor: 3, id_funcao: 4, id_lotacao: null, ativo: true, perfil_acesso: 'Analista', produtos: [1, 2], lotacoes: [5],
    responsavel_acao: 'Admin', senha_hash: 'Eco123'
};
const autocadastro = {
    nome_completo: 'João Lima', cpf: '98765432100', data_nascimento: '', data_admissao: '2026-02-01', sexo: '', celular: '21987654321',
    celular_whatsapp: false, email: '', matricula: 'M200', usuario: 'joao.lima', id_setor: 3, id_funcao: 4, id_lotacao: 2,
    senha_hash: 'Eco123', ativo: false, perfil_acesso: 'Solicitante'
};

test('aceita o cadastro enviado pela tela e mantém os campos a mais', () => {
    assert.deepEqual(salvarUsuario.parse(cadastro), cadastro);
});

test('aceita o autocadastro anônimo da tela de login', () => {
    assert.deepEqual(salvarUsuario.parse(autocadastro), autocadastro);
});

test('aceita ids nulos, vazios, em texto de dígitos e listas com nulos', () => {
    const corpo = { ...cadastro, id_usuario: '9', id_setor: null, id_funcao: '', id_lotacao: '0', produtos: [], lotacoes: [null, '3', 4] };
    assert.deepEqual(salvarUsuario.parse(corpo), corpo);
});

test('aceita corpo sem nenhum dos ids, listas ou senha', () => {
    assert.ok(salvarUsuario.safeParse({ nome_completo: 'X' }).success);
});

test('não recusa campos de texto: o handler responde com a mensagem própria', () => {
    assert.ok(salvarUsuario.safeParse({ ...cadastro, nome_completo: { a: 1 }, celular: '', email: 'abc', usuario: 'a b' }).success);
});

test('recusa id que não é número', () => {
    for (const campo of ['id_usuario', 'id_setor', 'id_funcao', 'id_lotacao']) {
        assert.equal(salvarUsuario.safeParse({ ...cadastro, [campo]: 'abc' }).success, false, campo);
        assert.equal(salvarUsuario.safeParse({ ...cadastro, [campo]: { a: 1 } }).success, false, campo);
        assert.equal(salvarUsuario.safeParse({ ...cadastro, [campo]: 1.5 }).success, false, campo);
    }
});

test('recusa produtos ou lotações que não são lista de ids', () => {
    assert.equal(salvarUsuario.safeParse({ ...cadastro, produtos: 'todos' }).success, false);
    assert.equal(salvarUsuario.safeParse({ ...cadastro, lotacoes: ['x'] }).success, false);
});

test('recusa senha que não é texto', () => {
    assert.equal(salvarUsuario.safeParse({ ...cadastro, senha_hash: 123456 }).success, false);
});

test('corpo ausente ou em lista vale como objeto vazio', () => {
    for (const esquema of [salvarUsuario, ativarUsuario, atualizarContato]) {
        assert.deepEqual(esquema.parse(undefined), {});
        assert.deepEqual(esquema.parse([]), {});
    }
});

test('ativar aceita id_usuario ou id e deixa o perfil para o handler conferir', () => {
    assert.deepEqual(ativarUsuario.parse({ id_usuario: 9, perfil: 'Analista' }), { id_usuario: 9, perfil: 'Analista' });
    assert.deepEqual(ativarUsuario.parse({ id: '9', perfil: 3 }), { id: '9', perfil: 3 });
    assert.deepEqual(ativarUsuario.parse({}), {});
});

test('ativar recusa id que não é número', () => {
    assert.equal(ativarUsuario.safeParse({ id_usuario: 'abc', perfil: 'Analista' }).success, false);
    assert.equal(ativarUsuario.safeParse({ id: [1], perfil: 'Analista' }).success, false);
});

test('contato aceita o corpo da tela e não recusa celular ou e-mail', () => {
    const corpo = { celular: '21987654321', celular_whatsapp: true, email: 'maria@exemplo.com' };
    assert.deepEqual(atualizarContato.parse(corpo), corpo);
    assert.ok(atualizarContato.safeParse({ celular: 21987654321, email: 5 }).success);
});
