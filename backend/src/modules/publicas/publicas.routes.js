/* Rotas públicas (versão do app, informações do sistema, indicadores) e o rastreio GPS, que exige JWT.
 * SQL em publicas.repository.js; regras em publicas.service.js. */
const express = require('express');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { autenticar } = require('../../middlewares/auth');
const { validarCorpo } = require('../../middlewares/validar');
const { limitar } = require('../../shared/rateLimit');
const servico = require('./publicas.service');
const { rastreio } = require('./publicas.schema');

const router = express.Router();

// Pública: limitada por IP para não servir de enumeração da base de unidades
const limiteCnes = limitar({ janelaMs: 60 * 1000, max: 30 });

/** O usuário vem do token, não do corpo. */
const exigirUsuario = (req, res, next) => (req.usuario ? next() : res.status(401).json({ erro: 'Não autenticado.' }));

router.get('/app-version', (req, res) => {
    res.set('Cache-Control', 'no-store').json(servico.versaoDoApp());
});

router.get('/sistema/info', (req, res) => {
    res.set('Cache-Control', 'no-store').json(servico.infoDoSistema(req.ip));
});

router.post('/rastreio-background', autenticar, exigirUsuario, validarCorpo(rastreio), asyncHandler(async (req, res) => {
    const gravado = await servico.registrarRastreio(req.usuario, req.body);
    if (!gravado) return res.status(400).json({ erro: 'Coordenadas inválidas' });
    return res.json({ ok: true });
}));

router.get('/indicadores/validar-cnes/:cnes', limiteCnes, asyncHandler(async (req, res) => {
    res.json(await servico.validarCnes(req.params.cnes));
}));

module.exports = router;
