/* Entrada do lançamento de hora extra. O app mobile envia o mesmo formato: campos a mais são mantidos. */
const { z } = require('zod');

const inteiro = z.coerce.number().int();
const inteiroOuNulo = inteiro.nullable().optional();
const minutos = z.coerce.number().int().min(0);
const horario = z.string().nullable().optional();

const dia = z.object({
    dia: z.coerce.number().int().min(1).max(31),
    dataObj: z.string().min(1),
    entrada: horario,
    saida: horario,
    intervalo: horario,
    isFeriado: z.boolean().optional(),
    isFDS: z.boolean().optional(),
    isFolga: z.boolean().optional(),
    he50: minutos,
    he100: minutos,
    adNoturno: minutos,
    id_unidade: inteiroOuNulo,
    id_projeto: inteiroOuNulo
}).passthrough();

const salvarLancamento = z.object({
    id_lancamento: inteiroOuNulo,
    id_usuario: inteiro,
    id_projeto: inteiroOuNulo,
    id_unidade: inteiroOuNulo,
    mes_referencia: z.string().regex(/^\d{4}-\d{2}$/, 'Use o formato AAAA-MM.'),
    detalhes_dias: z.array(dia).max(31),
    totais: z.object({ he50: minutos, he100: minutos, adNoturno: minutos }).passthrough()
}).passthrough();

module.exports = { salvarLancamento };
