/* Entrada de POST /parametros/salvar. A web envia { parametros: [{ chave, valor }] }. O handler já responde com
 * mensagem própria à lista ausente ou sem chave conhecida; aqui só se recusa item que não é objeto (quebraria o handler). */
const { z } = require('zod');

/** Corpo ausente, nulo ou que não é objeto vale como objeto vazio, como o handler já tratava. */
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const ehObjeto = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);

const parametros = z.unknown().superRefine((valor, contexto) => {
    if (Array.isArray(valor) && !valor.every(ehObjeto)) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada parâmetro deve ser um objeto { chave, valor }.' });
    }
});

const salvarParametros = comoObjeto(z.object({ parametros: parametros.optional() }).passthrough());

module.exports = { salvarParametros };
