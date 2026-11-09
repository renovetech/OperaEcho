/* Entrada das rotas de escrita de férias. A web e o app mobile enviam formatos um pouco diferentes
 * (o ano do período aquisitivo vai como texto na web e como número no app), e as datas ruins já têm resposta
 * própria no handler: por isso os esquemas só conferem o tipo e não transformam nenhum valor. */
const { z } = require('zod');

const numeroOuTexto = z.union([z.number(), z.string()]);
const anoAquisitivo = z.union([z.number().int(), z.string().regex(/^\d+$/, 'Informe o ano com dígitos.')]);
// Data ausente ou inválida: quem responde é o handler ("Período inválido ...").
const data = numeroOuTexto.nullable().optional();

const solicitarFerias = z.object({
    id_usuario: numeroOuTexto.nullable().optional(),
    periodo_aquisitivo: anoAquisitivo,
    tipo_solicitacao: z.string(),
    data_inicio: data,
    data_fim: data,
    dias_restantes: numeroOuTexto.nullable().optional()
}).passthrough();

const editarFerias = z.object({
    periodo_aquisitivo: anoAquisitivo,
    tipo_solicitacao: z.string(),
    data_inicio: data,
    data_fim: data
}).passthrough();

const verificarConflitos = z.object({
    id_ferias: numeroOuTexto.nullable().optional(),
    data_inicio: data,
    data_fim: data
}).passthrough();

// O valor do status é conferido pelo handler, que responde "Status inválido.".
const alterarStatus = z.object({ status: z.unknown() }).passthrough();

module.exports = { solicitarFerias, editarFerias, verificarConflitos, alterarStatus };
