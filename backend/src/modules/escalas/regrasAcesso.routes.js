/* Regras de acesso por perfil: /regras/*. Montadas por escalas.routes.js, no mesmo ponto de src/rotas.js de sempre. */
const express = require('express');
const { autenticar, autorizarModulo, limparCacheRegras, temPermissao } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const repositorio = require('./regrasAcesso.repository');
const { regrasDoPerfil } = require('./escalas.schema');

const router = express.Router();

/* A mensagem própria dos dados faltando vem antes do esquema. */
function exigirPerfilERegras(req, res, next) {
    const { perfil, regras } = req.body || {};
    if (!perfil || !Array.isArray(regras)) return res.status(400).json({ erro: 'Dados inválidos.' });
    return next();
}

// Cada um lê as regras do próprio perfil; as de outro perfil, só quem administra perfis.
router.get('/regras/:perfil', autenticar, asyncHandler(async (req, res) => {
    const proprio = req.params.perfil === (req.escopo && req.escopo.perfil_acesso);
    if (!proprio && !(await temPermissao(req, 'perfis'))) return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    res.json(await repositorio.listar(req.params.perfil));
}));

// Gravação exige o módulo "perfis" com edição.
router.post('/regras/salvar', autenticar, autorizarModulo('perfis', 'editar'), exigirPerfilERegras, validarCorpo(regrasDoPerfil), asyncHandler(async (req, res) => {
    await repositorio.substituir(req.body.perfil, req.body.regras);
    limparCacheRegras();
    res.json({ mensagem: 'Regras salvas.' });
}));

module.exports = router;
