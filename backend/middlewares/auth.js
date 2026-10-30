/* middlewares/auth.js */
const jwt = require('jsonwebtoken');
const { connectToDb, sql } = require('../config/database');

/**
 * Decodifica o JWT (se houver) e popula req.usuario.
 * NÃO bloqueia requisições sem token - o bloqueio é feito por
 * exigirAutenticacao (global em index.js). Token inválido/expirado => 401.
 */
function autenticar(req, res, next) {
    if (req.usuario) return next();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Tokens de finalidade específica (ex.: reset de senha) não dão acesso à API.
        if (decoded.finalidade) {
            return res.status(401).json({ erro: 'Token inválido.' });
        }
        req.usuario = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
        }
        return res.status(401).json({ erro: 'Token inválido.' });
    }
}

/**
 * Bloqueio global: toda rota montada depois deste middleware exige JWT,
 * exceto as listadas em `livres` ([método, regex]).
 * Navegação de browser (Accept: text/html) recebe o index.html do SPA.
 * Robôs de prévia de link (WhatsApp, Teams, Telegram...) também: eles não pedem
 * text/html e recebiam 401, então o link aparecia sem título nem imagem.
 */
const ROBO_PREVIA = /WhatsApp|facebookexternalhit|Facebot|TelegramBot|Twitterbot|LinkedInBot|Slackbot|Discordbot|SkypeUriPreview|Teams|Googlebot|bingbot|Pinterest|redditbot|Embedly|vkShare|Applebot/i;

function exigirAutenticacao({ livres = [], spaIndex = null } = {}) {
    return (req, res, next) => {
        if (req.usuario) return next();
        if (req.method === 'OPTIONS') return next();
        if (livres.some(([m, rx]) => (m === '*' || m === req.method) && rx.test(req.path))) return next();
        const navegacao = req.accepts(['json', 'html']) === 'html' || ROBO_PREVIA.test(req.headers['user-agent'] || '');
        if (spaIndex && req.method === 'GET' && !req.headers.authorization && navegacao) {
            return res.sendFile(spaIndex, (err) => { if (err) res.status(404).end(); });
        }
        return res.status(401).json({ erro: 'Não autenticado.' });
    };
}

function autorizar(...perfisPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({ erro: 'Não autenticado.' });
        }
        if (!perfisPermitidos.includes(req.usuario.perfil_acesso)) {
            return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
        }
        next();
    };
}

/* ---------------------------------------------------------------------------
 * Autorização por MÓDULO (tab_regras_acesso), espelhando o que o front já
 * usa para esconder menus - agora validado também no servidor.
 * acao: 'acessar' | 'novo' | 'editar'. `modulos` pode ser string ou array
 * (basta um deles conceder). Administrador sempre passa.
 * ------------------------------------------------------------------------- */
const CACHE_TTL = 60 * 1000;
const cacheRegras = new Map(); // perfil -> { em, regras }

async function regrasDoPerfil(perfil) {
    const c = cacheRegras.get(perfil);
    if (c && Date.now() - c.em < CACHE_TTL) return c.regras;
    const pool = await connectToDb();
    const r = await pool.request().input('p', sql.VarChar, perfil)
        .query('SELECT nome_modulo, pode_acessar, pode_novo, pode_editar FROM tab_regras_acesso WHERE nome_perfil = @p');
    cacheRegras.set(perfil, { em: Date.now(), regras: r.recordset });
    return r.recordset;
}

function limparCacheRegras() { cacheRegras.clear(); }

async function temPermissao(req, modulos, acao = 'acessar') {
    if (!req.usuario) return false;
    const perfil = (req.escopo && req.escopo.perfil_acesso) || req.usuario.perfil_acesso;
    if (perfil === 'Administrador') return true;
    if (!perfil) return false;
    const lista = Array.isArray(modulos) ? modulos : [modulos];
    const campo = acao === 'novo' ? 'pode_novo' : acao === 'editar' ? 'pode_editar' : 'pode_acessar';
    const regras = await regrasDoPerfil(perfil);
    return regras.some(r => lista.includes(r.nome_modulo) && r[campo] && (acao === 'acessar' || r.pode_acessar));
}

function autorizarModulo(modulos, acao = 'acessar') {
    return async (req, res, next) => {
        try {
            if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
            if (await temPermissao(req, modulos, acao)) return next();
            return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
        } catch (e) { next(e); }
    };
}

module.exports = { autenticar, autorizar, exigirAutenticacao, autorizarModulo, temPermissao, limparCacheRegras };
