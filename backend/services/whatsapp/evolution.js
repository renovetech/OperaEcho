/* services/whatsapp/evolution.js
 * Cliente da Evolution API v2 (mesmas chamadas do Renove Saúde).
 * A apikey nunca vai ao navegador: status, QR Code e desconexão passam pelo backend.
 * Nenhuma função lança erro de rede para a fila: o resultado volta no objeto. */
const { connectToDb } = require('../../config/database');
const { decryptTagged } = require('../../utils/crypto');

/** Celular BR -> "55" + DDD + 9 dígitos (só celular: WhatsApp exige 9º dígito). */
function formatarNumeroBR(celular) {
    let n = String(celular || '').replace(/\D/g, '');
    if (n.length === 13 && n.startsWith('55')) n = n.slice(2);
    if (n.length !== 11 || n[2] !== '9') return null;
    if (/^(\d)\1+$/.test(n)) return null;
    return '55' + n;
}

/** "21987654321" -> "(21) 98765-4321" */
function formatarCelularExibicao(celular) {
    const n = String(celular || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    return n.length === 11 ? `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}` : String(celular || '');
}

/** "(21) *****-4321" */
function mascararCelular(celular) {
    const n = String(celular || '').replace(/\D/g, '').replace(/^55(?=\d{11}$)/, '');
    return n.length === 11 ? `(${n.slice(0, 2)}) *****-${n.slice(7)}` : '***';
}

async function lerConfig(pool) {
    const p = pool || await connectToDb();
    const r = await p.request().query('SELECT * FROM tab_whatsapp_config WHERE id = 1');
    return r.recordset[0] || null;
}

/** Conexão pronta (url, instância, apikey) ou null se incompleta. */
function conexao(c) {
    if (!c || !c.url_api || !c.instancia || !c.token_acesso) return null;
    let apikey;
    try { apikey = decryptTagged(c.token_acesso); } catch (e) { return null; }
    return { base: String(c.url_api).replace(/\/+$/, ''), inst: c.instancia, apikey };
}

async function chamar(cx, metodo, caminho, corpo, timeoutMs = 15000) {
    const r = await fetch(`${cx.base}${caminho}`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', apikey: cx.apikey },
        body: corpo ? JSON.stringify(corpo) : undefined,
        signal: AbortSignal.timeout(timeoutMs)
    });
    const texto = await r.text();
    let dados = null;
    try { dados = texto ? JSON.parse(texto) : null; } catch (e) { dados = texto; }
    if (!r.ok) {
        const err = new Error(`${r.status} ${typeof dados === 'string' ? dados : JSON.stringify(dados)}`.slice(0, 500));
        err.status = r.status;
        throw err;
    }
    return dados;
}

/** 'open' | 'close' | 'connecting' | 'NAO_CONFIGURADO' | 'ERRO' */
async function estado(cx) {
    if (!cx) return 'NAO_CONFIGURADO';
    try {
        const d = await chamar(cx, 'GET', `/instance/connectionState/${encodeURIComponent(cx.inst)}`, null, 8000);
        return (d && d.instance && d.instance.state) || 'DESCONHECIDO';
    } catch (e) { return 'ERRO'; }
}

async function qrcode(cx) {
    const d = await chamar(cx, 'GET', `/instance/connect/${encodeURIComponent(cx.inst)}`, null, 15000);
    return { base64: (d && d.base64) || null, code: (d && d.code) || null, pairingCode: (d && d.pairingCode) || null };
}

async function desconectar(cx) {
    await chamar(cx, 'DELETE', `/instance/logout/${encodeURIComponent(cx.inst)}`, null, 10000);
}

/** Envia texto. Nunca lança: { enviado, messageId, erro }. */
async function enviarTexto(cx, numero, texto) {
    try {
        const d = await chamar(cx, 'POST', `/message/sendText/${encodeURIComponent(cx.inst)}`, { number: numero, text: texto }, 30000);
        return { enviado: true, messageId: (d && d.key && d.key.id) || null, erro: null };
    } catch (e) {
        return { enviado: false, messageId: null, erro: String(e.message || 'erro desconhecido').slice(0, 500) };
    }
}

module.exports = { formatarNumeroBR, formatarCelularExibicao, mascararCelular, lerConfig, conexao, estado, qrcode, desconectar, enviarTexto };
