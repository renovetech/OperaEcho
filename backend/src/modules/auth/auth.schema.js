/* Entrada das rotas públicas de login e recuperação de senha.
 * Os esquemas só garantem que o corpo é um objeto e mantêm todos os campos como vieram (web e mobile enviam
 * o mesmo formato). Cada handler já responde com mensagem própria a campo ausente ou de tipo errado, e essa
 * mensagem continua sendo a resposta: por isso nenhum campo é recusado aqui. */
const { z } = require('zod');

const livre = z.unknown().optional();

/** Corpo ausente, nulo ou que não é objeto (por exemplo uma lista) vale como objeto vazio, como os handlers já tratavam. */
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const login = comoObjeto(z.object({ usuario: livre, senha: livre }).passthrough());

const identificacao = { matricula: livre, usuario: livre };
const consultarCanais = comoObjeto(z.object(identificacao).passthrough());
const solicitarCodigo = comoObjeto(z.object({ ...identificacao, canal: livre }).passthrough());
const verificarCodigo = comoObjeto(z.object({ ...identificacao, codigo: livre }).passthrough());
const confirmarSenha = comoObjeto(z.object({ nova_senha: livre, token_reset: livre }).passthrough());

module.exports = { login, consultarCanais, solicitarCodigo, verificarCodigo, confirmarSenha };
