/* Entrada das rotas de escrita de usuários. A web (cadastro e autocadastro na tela de entrada) envia ids como número ou nulo;
 * campos a mais são mantidos. Os campos de texto (nome, cpf, login, celular, e-mail...) não são recusados aqui: os
 * handlers já respondem a eles com mensagem própria, e essa mensagem continua sendo a resposta.
 * O app mobile não usa estas rotas. */
const { z } = require('zod');

const SO_DIGITOS = /^\d*$/;

/** Id como número inteiro ou texto só de dígitos (vazio vale como ausente); nulo e ausente passam. */
const identificador = z.union([z.number().int(), z.string().regex(SO_DIGITOS, 'Use apenas números.')]).nullable().optional();
const listaDeIdentificadores = z.array(identificador).nullable().optional();

/** Corpo ausente, nulo ou que não é objeto (por exemplo uma lista) vale como objeto vazio, como os handlers já tratavam. */
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const salvarUsuario = comoObjeto(z.object({
    id_usuario: identificador,
    id_setor: identificador,
    id_funcao: identificador,
    id_lotacao: identificador,
    produtos: listaDeIdentificadores,
    lotacoes: listaDeIdentificadores,
    senha_hash: z.string().nullable().optional()
}).passthrough());

const ativarUsuario = comoObjeto(z.object({
    id_usuario: identificador,
    id: identificador,
    perfil: z.unknown().optional()
}).passthrough());

/** O contato é conferido pelo handler (celular e e-mail, com mensagens próprias). */
const atualizarContato = comoObjeto(z.object({ celular: z.unknown().optional(), email: z.unknown().optional() }).passthrough());

module.exports = { salvarUsuario, ativarUsuario, atualizarContato };
