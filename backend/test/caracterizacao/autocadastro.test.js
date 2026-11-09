/* Autocadastro anônimo com dado já existente responde igual ao sucesso e não grava: a tela não revela quem tem cadastro.
 * Arquivo próprio porque o limite de 5 pedidos por hora vale por processo. */
const { caracterizar } = require('../apoio/caracterizacao');

const pedido = {
    nome_completo: 'João Lima', cpf: '98765432100', data_nascimento: '', data_admissao: '2026-02-01', sexo: '', celular: '21987654321',
    celular_whatsapp: false, email: '', matricula: 'M200', usuario: 'joao.lima', id_setor: 3, id_funcao: 4, id_lotacao: 2,
    senha_hash: 'Eco123', ativo: false, perfil_acesso: 'Solicitante'
};
const LOGIN_LIVRE = [/FROM tab_usuarios WHERE usuario = @u/, []];
const CPF_LIVRE = [/FROM tab_usuarios WHERE cpf = @cpf/, []];
const anonimo = (nome, respostas) => ({ nome, metodo: 'POST', url: '/usuarios/salvar', corpo: pedido, anonimo: true, respostas });

caracterizar('autocadastro', [
    anonimo('dados novos', [LOGIN_LIVRE, CPF_LIVRE, [/OUTPUT INSERTED/, [{ id_usuario: 50 }]]]),
    anonimo('login já existente não se revela', [[/FROM tab_usuarios WHERE usuario = @u/, [{ x: 1 }]]]),
    anonimo('CPF já existente não se revela', [LOGIN_LIVRE, [/FROM tab_usuarios WHERE cpf = @cpf/, [{ id_usuario: 3 }]]])
]);
