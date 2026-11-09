/* Leitura tolerante dos campos que chegam do navegador (texto, número e data). */

const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
const txt = (v, max) => { if (v == null) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
// null = vazio; undefined = formato inválido
const dataOk = (v) => {
    if (v == null || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : undefined;
};

module.exports = { toInt, txt, dataOk };
