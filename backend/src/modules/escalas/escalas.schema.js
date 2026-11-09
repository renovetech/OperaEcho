/* Entrada das escalas e das regras de acesso. O formato é o que a web envia; nada é convertido, para o valor gravado
 * continuar o mesmo, e campos a mais são mantidos. As mensagens próprias das rotas (lote vazio ou grande, escopo,
 * "Dados inválidos.") são respondidas antes destes esquemas. */
const { z } = require('zod');

const id = z.union([z.number().int(), z.string().regex(/^\d+$/, 'Use apenas números.')]);
const idOuVazio = z.union([id, z.literal('')]).nullable().optional();
const textoOpcional = z.string().nullable().optional();

const diaDeEscala = z.object({
    id_usuario: id,
    data_escala: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Use o formato AAAA-MM-DD.'),
    tipo: textoOpcional,
    id_projeto: idOuVazio,
    id_unidade: idOuVazio,
    produtos: z.array(id).nullable().optional(),
    turno: textoOpcional,
    redmine: z.union([z.string(), z.number()]).nullable().optional()
}).passthrough();

const loteDeEscala = z.array(diaDeEscala);

const regraDeAcesso = z.object({ modulo: z.string().min(1) }).passthrough();

const regrasDoPerfil = z.object({
    perfil: z.string().min(1),
    regras: z.array(regraDeAcesso)
}).passthrough();

module.exports = { diaDeEscala, loteDeEscala, regrasDoPerfil };
