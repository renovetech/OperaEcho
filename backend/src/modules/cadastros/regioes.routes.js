/*
 * CADASTRO > MACRO E MICRO REGIÕES
 * Cada projeto tem a sua nomenclatura: a macro pertence ao projeto e a micro
 * pertence à macro. A unidade (do mesmo projeto) é vinculada à macro/micro.
 * Leitura: módulos 'regioes' ou 'unidades'. Gravação: 'regioes' (novo/editar).
 * SQL em regioes.repository.js; regras em regioes.service.js.
 */
const express = require('express');
const { autenticar, autorizarModulo, temPermissao } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { parseIntSafe } = require('../../shared/validators');
const repositorio = require('./regioes.repository');
const servico = require('./regioes.service');
const { salvarMacro, salvarMicro, vincularUnidades } = require('./regioes.schema');

const router = express.Router();

const leitura = [autenticar, autorizarModulo(['regioes', 'unidades'])];
const edicao = [autenticar, autorizarModulo('regioes', 'editar')];

// Registro com id => 'editar'; sem id => 'novo' (mesma regra de cadastros.routes.js).
const autorizarGravacao = (campoId) => async (req, res, next) => {
    try {
        const acao = req.body && req.body[campoId] ? 'editar' : 'novo';
        if (await temPermissao(req, 'regioes', acao)) return next();
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    } catch (e) { return next(e); }
};

// ==============================================================================
// ÁRVORE DE REGIÕES DO PROJETO (macros com suas micros)
// ==============================================================================
router.get('/regioes/projeto/:id', ...leitura, asyncHandler(async (req, res) => {
    const idProjeto = parseIntSafe(req.params.id);
    if (!idProjeto) return res.json([]);
    return res.json(await servico.arvoreDoProjeto(idProjeto));
}));

// ==============================================================================
// MACRO REGIÃO
// ==============================================================================
router.post('/regioes/macro/salvar', autenticar, autorizarGravacao('id_macro'), validarCorpo(salvarMacro), asyncHandler(async (req, res) => {
    await servico.salvarMacro(req.body);
    res.json({ mensagem: 'Macro região salva.' });
}));

router.delete('/regioes/macro/:id', ...edicao, asyncHandler(async (req, res) => {
    await servico.excluirMacro(parseIntSafe(req.params.id));
    res.json({ mensagem: 'Macro região excluída.' });
}));

// ==============================================================================
// MICRO REGIÃO
// ==============================================================================
router.post('/regioes/micro/salvar', autenticar, autorizarGravacao('id_micro'), validarCorpo(salvarMicro), asyncHandler(async (req, res) => {
    await servico.salvarMicro(req.body);
    res.json({ mensagem: 'Micro região salva.' });
}));

router.delete('/regioes/micro/:id', ...edicao, asyncHandler(async (req, res) => {
    await servico.excluirMicro(parseIntSafe(req.params.id));
    res.json({ mensagem: 'Micro região excluída.' });
}));

// ==============================================================================
// VÍNCULO DAS UNIDADES (em massa) - unidades do projeto x macro/micro
// ==============================================================================
router.get('/regioes/unidades/:idProjeto', ...leitura, asyncHandler(async (req, res) => {
    res.json(await repositorio.unidadesDoProjeto(parseIntSafe(req.params.idProjeto)));
}));

router.post('/regioes/unidades/vincular', ...edicao, validarCorpo(vincularUnidades), asyncHandler(async (req, res) => {
    const atualizadas = await servico.vincularUnidades(req.body);
    res.json({ mensagem: `${atualizadas} unidade(s) atualizada(s).`, atualizadas });
}));

module.exports = router;
