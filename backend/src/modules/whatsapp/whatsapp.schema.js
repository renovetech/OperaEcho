/* Entrada das rotas de escrita do WhatsApp. A tela (frontend/src/features/parametros) é a única cliente.
 * Os valores dos campos (URL, faixas numéricas, horários, semana, evento) seguem sendo conferidos pelos handlers,
 * com as mensagens de sempre; aqui só se garante a forma do corpo, mantendo campos a mais. */
const { z } = require('zod');

const objetoLivre = z.object({}).passthrough().nullable().optional();
const textoOuNulo = z.string().nullable().optional();

/** POST /integracoes/whatsapp: eventos e fila são blocos livres (números podem vir como texto da tela). */
const salvarConfiguracao = z.object({
    ativo: z.boolean().nullable().optional(),
    url_api: textoOuNulo,
    instancia: textoOuNulo,
    token_acesso: textoOuNulo,
    eventos: objetoLivre,
    fila: objetoLivre,
    textos: z.record(z.any()).nullable().optional()
}).passthrough();

/** POST /integracoes/whatsapp/escala-semanal/enviar: `semana` é conferida pelo handler. */
const enviarEscalaSemanal = z.object({
    semana: z.unknown(),
    modulos: z.array(z.any()).nullable().optional(),
    forcar: z.unknown()
}).passthrough();

/** POST /integracoes/whatsapp/previa: `evento` é conferido pelo handler; sem `texto`, vale o modelo salvo. */
const previaDeMensagem = z.object({
    evento: z.unknown(),
    texto: textoOuNulo
}).passthrough();

module.exports = { salvarConfiguracao, enviarEscalaSemanal, previaDeMensagem };
