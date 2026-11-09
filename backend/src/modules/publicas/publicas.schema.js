/* Entrada de POST /rastreio-background. O app mobile e a web enviam { usuario, latitude, longitude, tipo_registro,
 * detalhes_registro }; a web chega a enviar latitude e longitude nulas (exclusão de atividade). O handler responde
 * a coordenadas ausentes ou inválidas com mensagem própria, então elas não são conferidas aqui. Campos a mais são mantidos. */
const { z } = require('zod');

const texto = z.union([z.string(), z.number()]).nullable().optional();
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const rastreio = comoObjeto(z.object({
    usuario: z.unknown().optional(),
    latitude: z.unknown().optional(),
    longitude: z.unknown().optional(),
    tipo_registro: texto,
    detalhes_registro: texto
}).passthrough());

module.exports = { rastreio };
