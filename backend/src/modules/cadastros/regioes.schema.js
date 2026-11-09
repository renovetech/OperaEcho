/* Entrada das rotas de escrita das Macro e Micro Regiões (frontend/src/features/cadastros/regioes). A web envia ids como
 * número ou texto, vazio como '' e a cor como texto ou nulo; campos a mais são mantidos. O app mobile não usa estas rotas.
 * Os campos obrigatórios não são recusados aqui: o serviço já responde a eles com mensagem própria. */
const { z } = require('zod');

const escalar = z.union([z.string(), z.number(), z.boolean()]).nullable().optional();
const comoObjeto = (esquema) => z.preprocess((corpo) => (corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : {}), esquema);

const ehObjeto = (item) => item !== null && typeof item === 'object' && !Array.isArray(item);

/** Qualquer coisa que não seja lista é recusada pelo serviço ('Nada para salvar.'); itens que não são objetos quebrariam o serviço. */
const itensDoVinculo = z.unknown().superRefine((valor, contexto) => {
    if (Array.isArray(valor) && !valor.every(ehObjeto)) {
        contexto.addIssue({ code: z.ZodIssueCode.custom, message: 'Cada item deve ser um objeto { id_unidade, id_macro, id_micro }.' });
    }
});

const camposDaRegiao = { sigla: escalar, cor: escalar, ordem: escalar, ativo: escalar };

const salvarMacro = comoObjeto(z.object({
    id_macro: escalar, id_projeto: escalar, nome_macro: escalar, ...camposDaRegiao
}).passthrough());

const salvarMicro = comoObjeto(z.object({
    id_micro: escalar, id_macro: escalar, nome_micro: escalar, ...camposDaRegiao
}).passthrough());

const vincularUnidades = comoObjeto(z.object({
    id_projeto: escalar,
    itens: itensDoVinculo.optional()
}).passthrough());

module.exports = { salvarMacro, salvarMicro, vincularUnidades };
