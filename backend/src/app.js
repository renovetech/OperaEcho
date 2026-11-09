/* Monta a aplicação sem abrir a porta: o servidor e os testes usam o mesmo app. */
const express = require('express');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const { apenasContratoMobile } = require('./legacy-mobile/contrato');
const { errorHandler } = require('./middlewares/errorHandler');
const { criarApi } = require('./rotas');
const { protegerUploads } = require('./shared/arquivos');
const { limitar } = require('./shared/rateLimit');

const PREFIXO_API = '/api/v1';
const JANELA_LIMITE_MS = 60 * 1000;
const LIMITE_IP_POR_MINUTO = parseInt(process.env.RATE_LIMIT_IP_MIN || '1500', 10);
const PASTA_UPLOADS = path.join(__dirname, '..', 'uploads');
const PASTA_SITE = process.env.FRONT_BUILD_PATH || path.join(__dirname, '..', '..', 'frontend', 'build');
const INDICE_SITE = path.join(PASTA_SITE, 'index.html');

function cabecalhosDeSeguranca(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), payment=(), usb=(), geolocation=(self)');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
}

/** Anônimo (login, autocadastro, rotas públicas) envia até 200 KB; com sessão válida, até JSON_LIMIT. */
function limiteDoCorpo() {
    const anonimo = express.json({ limit: '200kb' });
    const comSessao = express.json({ limit: process.env.JSON_LIMIT || '25mb' });
    return (req, res, next) => {
        const cabecalho = req.headers.authorization || '';
        let valido = false;
        if (cabecalho.startsWith('Bearer ')) {
            try {
                valido = !jwt.verify(cabecalho.slice(7), process.env.JWT_SECRET).finalidade;
            } catch {
                valido = false;
            }
        }
        return (valido ? comSessao : anonimo)(req, res, next);
    };
}

function criarApp() {
    const app = express();
    app.disable('x-powered-by');
    // Nº de proxies à frente da API. Com valor errado, o IP pode ser forjado por X-Forwarded-For e burlar os limites.
    app.set('trust proxy', parseInt(process.env.TRUST_PROXY || '1', 10));

    // Valor alto de propósito: vários usuários de uma mesma unidade saem pelo mesmo IP.
    app.use(limitar({ janelaMs: JANELA_LIMITE_MS, max: LIMITE_IP_POR_MINUTO, mensagem: 'Muitas requisições a partir do seu endereço. Aguarde um instante.' }));

    // Em produção, restrinja: CORS_ORIGINS="https://operaecho.com,https://www.operaecho.com". O app mobile não usa CORS.
    const origens = (process.env.CORS_ORIGINS || '').split(',').map((origem) => origem.trim()).filter(Boolean);
    if (!origens.length) console.warn('CORS_ORIGINS não definido: qualquer site pode chamar esta API pelo navegador.');
    app.use(cors(origens.length ? { origin: origens } : undefined));

    app.use(cabecalhosDeSeguranca);
    app.use(limiteDoCorpo());

    app.use('/uploads', protegerUploads, express.static(PASTA_UPLOADS, {
        dotfiles: 'deny',
        index: false,
        setHeaders: (res) => { res.setHeader('Cache-Control', 'private, no-store'); }
    }));

    const api = criarApi();
    app.use(PREFIXO_API, api);
    app.use(apenasContratoMobile(api));

    app.use(express.static(PASTA_SITE, { index: false }));
    app.get(/.*/, (req, res) => {
        res.sendFile(INDICE_SITE, (falha) => { if (falha) res.status(404).json({ erro: 'Recurso não encontrado.' }); });
    });

    app.use(errorHandler);
    return app;
}

module.exports = { criarApp, PREFIXO_API };
