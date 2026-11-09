/* Entrada do lançamento de faturamento (multipart: todos os campos chegam como texto, depois do multer).
 * Projeto, unidade, produto, tipo e competência ausentes ou inválidos já têm resposta própria no serviço
 * ("Selecione projeto, unidade e produto.", "Competência inválida." ...), então o esquema só confere o tipo
 * dos campos e mantém os demais. O corpo ausente (requisição sem formulário) vale como corpo vazio. */
const { z } = require('zod');

const texto = z.union([z.string(), z.number()]).optional();

const destinoDoLancamento = z.preprocess((corpo) => corpo ?? {}, z.object({
    id_projeto: texto,
    id_unidade: texto,
    id_produto: texto,
    tipo: texto,
    competencia: texto,
    substituir: texto
}).passthrough());

module.exports = { destinoDoLancamento };
