/* Entrada de POST e PUT /links-externos: a web envia { id_produto, url }. O handler responde com mensagem própria
 * à falta do produto ou do endereço e a endereço inválido; por isso o endereço não é conferido aqui. */
const { z } = require('zod');

const escalar = z.union([z.string(), z.number(), z.boolean()]).nullable().optional();
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const salvarLink = comoObjeto(z.object({ id_produto: escalar, url: z.unknown().optional() }).passthrough());

module.exports = { salvarLink };
