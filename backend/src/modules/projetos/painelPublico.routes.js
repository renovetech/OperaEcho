/*
 * ------------------------------------------------------------------------
 * PAINEL PÚBLICO DO PROJETO (operaecho.com/<slug>) - sem login, somente leitura.
 * Rate limit por IP; montagem do painel e cache em painelPublico.service.js; SQL em painelPublico.repository.js.
 * ------------------------------------------------------------------------ */
const express = require('express');
const { asyncHandler, httpErro } = require('../../middlewares/errorHandler');
const { limitar } = require('../../shared/rateLimit');
const { FORMATO } = require('./slugPublico');
const servico = require('./painelPublico.service');
const repositorio = require('./painelPublico.repository');

const router = express.Router();

const limite = limitar({ janelaMs: 60 * 1000, max: 90 });

router.get('/publico/painel-projeto/:slug', limite, asyncHandler(async (req, res) => {
    const slug = String(req.params.slug || '').toLowerCase();
    if (!FORMATO.test(slug)) throw httpErro(404, 'Painel não encontrado.');

    const dados = await servico.painelDoSlug(slug);
    if (!dados) throw httpErro(404, 'Painel não encontrado ou não está público.');
    res.set('Cache-Control', 'no-store').json(dados);
}));

// Slugs publicados (o SPA usa para decidir se a rota da raiz é um painel)
router.get('/publico/painel-projeto', limite, asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store').json(await repositorio.listarPublicados());
}));

module.exports = router;
module.exports.limparCachePainel = servico.limparCachePainel;
