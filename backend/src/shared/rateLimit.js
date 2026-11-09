/*
 * Limitador simples em memória (janela fixa), sem dependências externas.
 * Uso: router.post('/login', limitar({ janelaMs: 15*60e3, max: 10 }), ...)
 * `maxChaves` limita o tamanho do mapa: um atacante que gira IPs/logins não
 * consegue esgotar a memória do servidor (as chaves mais antigas são descartadas).
 */
const limiteBanco = require('./limiteBanco');

function limitar({ compartilhado = null, janelaMs = 60 * 1000, max = 60, chave = (req) => req.ip, mensagem = 'Muitas requisições. Tente novamente em instantes.', maxChaves = 50000, pular = null } = {}) {
    const hits = new Map();

    // Faxina periódica para não crescer indefinidamente
    const t = setInterval(() => {
        const agora = Date.now();
        for (const [k, v] of hits) if (agora - v.inicio > janelaMs) hits.delete(k);
    }, janelaMs);
    if (t.unref) t.unref();

    const mw = (req, res, next) => {
        if (pular && pular(req)) return next();
        const k = chave(req);
        const agora = Date.now();
        let h = hits.get(k);
        if (!h || agora - h.inicio > janelaMs) {
            if (!h && hits.size >= maxChaves) hits.delete(hits.keys().next().value);
            h = { inicio: agora, n: 0 };
            hits.set(k, h);
        }
        h.n++;
        if (h.n > max) {
            res.set('Retry-After', String(Math.ceil((h.inicio + janelaMs - agora) / 1000)));
            return res.status(429).json({ erro: mensagem });
        }
        if (!compartilhado) return next();
        // Além do limite local, soma as tentativas de todas as instâncias da API.
        return limiteBanco.registrar(compartilhado, k, janelaMs).then((tentativas) => {
            if (tentativas === null || tentativas <= max) return next();
            res.set('Retry-After', String(Math.ceil(janelaMs / 1000)));
            return res.status(429).json({ erro: mensagem });
        });
    };
    mw.zerar = (req) => {
        hits.delete(chave(req));
        if (compartilhado) limiteBanco.zerar(compartilhado, chave(req));
    };
    return mw;
}

module.exports = { limitar };
