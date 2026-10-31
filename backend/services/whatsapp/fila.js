/* services/whatsapp/fila.js - fila de envio do WhatsApp (proteção do número).
 * Mesmas regras do Renove Saúde, com UM número para o sistema:
 *  - Aquecimento: limite diário começa baixo (80) e cresce por semana (30%) até o teto (1.000).
 *  - Ritmo: no máximo N por minuto (12) e pausa aleatória entre envios (2 a 5 s).
 *  - Janela de horário (08:00 às 20:00): fora dela as mensagens esperam.
 *  - Só envia com o número conectado; 3 falhas seguidas pausam até o próximo ciclo.
 *  - Mensagem vencida (expira_em) é cancelada em vez de chegar atrasada.
 * Prioridade 1 (código de senha e teste) fura a fila, a janela de horário e o
 * limite diário - mas respeita o limite por minuto e a conexão.
 * Cada mensagem é reservada (ENVIANDO) antes de sair: duas instâncias não enviam a mesma.
 * Em mais de um servidor, deixe WHATSAPP_FILA_ATIVA=true em um só. */
const { connectToDb, sql } = require('../../config/database');
const evo = require('./evolution');

const CICLO_MS = 15000;
const FALHAS_SEGUIDAS = 3;
const CONTADOS = "status IN ('ENVIADO','FALHA')";

const PADRAO = {
    limiteInicial: 80, crescimentoSemanal: 30, limiteMaximo: 1000, maxPorMinuto: 12,
    pausaMinima: 2, pausaMaxima: 5, horaInicio: '08:00', horaFim: '20:00'
};

const ativa = String(process.env.WHATSAPP_FILA_ATIVA || 'true').toLowerCase() !== 'false';
let rodando = false;
let encerrada = false;
let timer = null;
let ultimoAviso = null;

const nvl = (v, p) => (v === null || v === undefined ? p : Number(v));
const hhmm = (t, p) => {
    if (!t) return p;
    if (t instanceof Date) return `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
    return String(t).slice(0, 5);
};
const minutos = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };
const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const dormir = (ms) => new Promise(r => setTimeout(r, ms));

function avisar(msg) {
    if (ultimoAviso !== msg) console.log(`[Fila WhatsApp] ${msg}`);
    ultimoAviso = msg;
}

/** Limites da configuração com os padrões aplicados. */
function parametros(c) {
    let inicio = null;
    if (c && c.inicio_aquecimento) {
        const d = c.inicio_aquecimento instanceof Date ? c.inicio_aquecimento : new Date(c.inicio_aquecimento);
        inicio = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }
    return {
        inicioAquecimento: inicio,
        limiteInicial: nvl(c && c.limite_inicial, PADRAO.limiteInicial),
        crescimentoSemanal: nvl(c && c.crescimento_semanal, PADRAO.crescimentoSemanal),
        limiteMaximo: nvl(c && c.limite_maximo, PADRAO.limiteMaximo),
        maxPorMinuto: nvl(c && c.max_por_minuto, PADRAO.maxPorMinuto),
        pausaMinima: nvl(c && c.pausa_min_seg, PADRAO.pausaMinima),
        pausaMaxima: nvl(c && c.pausa_max_seg, PADRAO.pausaMaxima),
        horaInicio: hhmm(c && c.hora_envio_inicio, PADRAO.horaInicio),
        horaFim: hhmm(c && c.hora_envio_fim, PADRAO.horaFim)
    };
}

/** Semana do aquecimento (1 = primeira). */
function semana(p, hoje) {
    if (!p.inicioAquecimento || hoje <= p.inicioAquecimento) return 1;
    const dias = Math.round((new Date(`${hoje}T00:00:00Z`) - new Date(`${p.inicioAquecimento}T00:00:00Z`)) / 86400000);
    return Math.floor(dias / 7) + 1;
}

/** Limite do dia: limiteInicial × (1 + crescimento)^(semana − 1), até o teto. */
function limiteDoDia(p, hoje) {
    const v = p.limiteInicial * Math.pow(1 + p.crescimentoSemanal / 100, semana(p, hoje) - 1);
    return Math.min(p.limiteMaximo, Math.floor(v));
}

/** Janela [início, fim). Fim antes do início = atravessa a meia-noite. */
function dentroDoHorario(p, agora) {
    const a = minutos(agora), i = minutos(p.horaInicio), f = minutos(p.horaFim);
    if (i === f) return true;
    return i < f ? a >= i && a < f : a >= i || a < f;
}

const contar = (pool, where) => pool.request().query(`SELECT COUNT(*) AS n FROM tab_whatsapp_envios WHERE ${where}`).then(r => r.recordset[0].n);
// data_envio é GETDATE() (UTC); "hoje" começa à meia-noite de Brasília.
const MEIA_NOITE_BR_EM_UTC = `CONVERT(datetime, (CAST(CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS date) AS datetime) AT TIME ZONE 'E. South America Standard Time') AT TIME ZONE 'UTC')`;
const enviadosHoje = (pool) => contar(pool, `data_envio >= ${MEIA_NOITE_BR_EM_UTC} AND ${CONTADOS}`);
const ultimoMinuto = (pool) => contar(pool, `data_envio >= DATEADD(SECOND, -60, GETDATE()) AND ${CONTADOS}`);
const pendentes = (pool) => contar(pool, "status = 'PENDENTE'");

/** Vencidas saem da fila; reserva interrompida (queda do servidor) vira falha. */
async function limpar(pool) {
    await pool.request().query(`
        UPDATE tab_whatsapp_envios SET status = 'CANCELADO', motivo = 'EXPIRADO', data_envio = GETDATE()
        WHERE status IN ('PENDENTE', 'AGUARDANDO') AND expira_em < GETDATE();
        UPDATE tab_whatsapp_envios SET status = 'FALHA', erro = 'Envio interrompido (servidor reiniciado durante o envio).', data_envio = GETDATE()
        WHERE status = 'ENVIANDO' AND data_envio < DATEADD(MINUTE, -10, GETDATE());`);
}

/** Reserva a próxima pendente (READPAST: outra instância não pega a mesma). */
async function reservar(pool, somenteUrgentes) {
    const r = await pool.request().input('urg', sql.Bit, somenteUrgentes ? 1 : 0).query(`
        WITH prox AS (
            SELECT TOP (1) * FROM tab_whatsapp_envios WITH (UPDLOCK, READPAST, ROWLOCK)
            WHERE status = 'PENDENTE' AND (@urg = 0 OR prioridade = 1)
            ORDER BY prioridade, id_envio)
        UPDATE prox SET status = 'ENVIANDO', data_envio = GETDATE()
        OUTPUT inserted.id_envio, inserted.numero, inserted.mensagem, inserted.expira_em;`);
    return r.recordset[0] || null;
}

async function rodar(pool, c) {
    if (!c || !c.ativo) return;
    const p = parametros(c);
    const cx = evo.conexao(c);
    if (!cx) return avisar('fila parada: integração incompleta (URL, instância ou apikey).');
    const st = await evo.estado(cx);
    if (st !== 'open') return avisar(`fila parada: número não conectado (${st}). Leia o QR Code em Parâmetros > WhatsApp.`);
    ultimoAviso = null;

    let falhas = 0;
    while (!encerrada) {
        const horario = dentroDoHorario(p, agoraHHMM());
        const limite = limiteDoDia(p, isoLocal(new Date()));
        const estourou = (await enviadosHoje(pool)) >= limite;
        if (estourou) avisar(`limite do dia atingido (${limite}). O restante sai amanhã (códigos de senha continuam saindo).`);
        if ((await ultimoMinuto(pool)) >= p.maxPorMinuto) return; // próximo ciclo
        const e = await reservar(pool, !horario || estourou);
        if (!e) return;

        if (e.expira_em && new Date(e.expira_em) < new Date()) {
            await pool.request().input('id', sql.Int, e.id_envio)
                .query("UPDATE tab_whatsapp_envios SET status = 'CANCELADO', motivo = 'EXPIRADO', data_envio = GETDATE() WHERE id_envio = @id");
            continue;
        }
        const r = await evo.enviarTexto(cx, e.numero, e.mensagem);
        await pool.request().input('id', sql.Int, e.id_envio)
            .input('st', sql.VarChar(20), r.enviado ? 'ENVIADO' : 'FALHA')
            .input('mid', sql.VarChar(100), r.messageId ? String(r.messageId).slice(0, 100) : null)
            .input('err', sql.VarChar(500), r.erro)
            .query('UPDATE tab_whatsapp_envios SET status = @st, message_id = @mid, erro = @err, data_envio = GETDATE() WHERE id_envio = @id');
        if (r.enviado) falhas = 0;
        else {
            console.warn(`[Fila WhatsApp] A Evolution recusou o envio ${e.id_envio}: ${r.erro}`);
            if (++falhas >= FALHAS_SEGUIDAS) return; // provável desconexão: espera o próximo ciclo
        }
        const min = p.pausaMinima * 1000, max = Math.max(min, p.pausaMaxima * 1000);
        await dormir(min + Math.floor(Math.random() * (max - min + 1)));
    }
}

async function ciclo() {
    if (encerrada || rodando) return;
    rodando = true;
    try {
        const pool = await connectToDb();
        await limpar(pool);
        const c = await evo.lerConfig(pool);
        const notif = require('./notificacoes'); // tarde: evita dependência circular
        await notif.promoverAgrupadas(pool, c);
        await notif.verificarEscalaSemanal(pool, c);
        await rodar(pool, c);
    } catch (e) {
        console.warn(`[Fila WhatsApp] Erro no ciclo: ${e.message}`);
    } finally {
        rodando = false;
    }
}

function agendarProximo() {
    if (encerrada) return;
    timer = setTimeout(async () => { await ciclo(); agendarProximo(); }, CICLO_MS);
    if (timer.unref) timer.unref();
}

/** Liga a fila (index.js). */
function iniciar() {
    if (!ativa) { console.log('[Fila WhatsApp] Desligada neste servidor (WHATSAPP_FILA_ATIVA=false).'); return; }
    const t = setTimeout(() => { ciclo(); agendarProximo(); }, 10000);
    if (t.unref) t.unref();
}

function encerrar() { encerrada = true; if (timer) clearTimeout(timer); }

/** Mensagem nova na fila: tenta enviar já (se os limites deixarem). */
function acordar() { if (ativa && !encerrada) setImmediate(ciclo); }

/** Situação para a tela Parâmetros > WhatsApp. */
async function situacao() {
    const pool = await connectToDb();
    const c = await evo.lerConfig(pool);
    const p = parametros(c);
    const hoje = isoLocal(new Date());
    const limite = limiteDoDia(p, hoje);
    const horario = dentroDoHorario(p, agoraHHMM());
    const estadoConexao = c && c.ativo ? await evo.estado(evo.conexao(c)) : 'INATIVO';
    const conectado = estadoConexao === 'open';
    const [enviados, pend, minuto, aguardando] = await Promise.all([
        enviadosHoje(pool), pendentes(pool), ultimoMinuto(pool), contar(pool, "status = 'AGUARDANDO'")
    ]);
    const proximaAcao = !c || !c.ativo ? 'Integração inativa: nada é enviado.'
        : !conectado ? 'Número desconectado: as mensagens aguardam na fila.'
        : !ativa ? 'Fila desligada neste servidor (WHATSAPP_FILA_ATIVA).'
        : enviados >= limite ? 'Limite do dia atingido: o restante sai amanhã.'
        : !horario ? 'Fora da janela de envio: as mensagens aguardam o horário.'
        : pend > 0 ? 'Enviando.' : 'Fila vazia.';
    return {
        limiteHoje: limite, enviadosHoje: enviados, pendentes: pend, aguardandoAgrupamento: aguardando,
        ultimoMinuto: minuto, semana: semana(p, hoje), dentroDoHorario: horario, conectado, estado: estadoConexao,
        filaNesteServidor: ativa, proximaAcao
    };
}

module.exports = { iniciar, encerrar, acordar, situacao, parametros, limiteDoDia, semana, dentroDoHorario, PADRAO };
