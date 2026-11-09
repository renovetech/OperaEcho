/* Entrada das rotas de escrita do SIGTAP.
 * A importação é multipart com um único campo, o arquivo .zip (`arquivo`), que o multer e o handler validam
 * (extensão, tamanho, presença) com mensagens próprias. O esquema só garante que o restante do corpo é um objeto
 * e mantém campos a mais, como a web e qualquer cliente antigo enviam. */
const { z } = require('zod');

const importarCompetencia = z.object({}).passthrough();

module.exports = { importarCompetencia };
