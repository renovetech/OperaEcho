/*
 * Menu PARÂMETROS - configurações gerais do sistema, divididas por módulo
 * (Implantação / Projetos). Leitura liberada a qualquer usuário autenticado
 * (as telas de registro precisam conhecer as regras); gravação exige o módulo
 * 'parametros' com permissão de edição. SQL em parametros.repository.js; regras em parametros.service.js. */
const express = require('express');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const servico = require('./parametros.service');
const repositorio = require('./parametros.repository');
const { salvarParametros } = require('./parametros.schema');

const router = express.Router();

router.get('/parametros', autenticar, asyncHandler(async (req, res) => {
    res.json(await servico.carregarParametros());
}));

// Detalhe (com descrição e auditoria) - tela do menu Parâmetros
router.get('/parametros/detalhes', autenticar, autorizarModulo('parametros'), asyncHandler(async (req, res) => {
    res.json(await repositorio.listarDetalhes());
}));

router.post('/parametros/salvar', autenticar, autorizarModulo('parametros', 'editar'), validarCorpo(salvarParametros), asyncHandler(async (req, res) => {
    const validos = servico.parametrosValidos(req.body.parametros);
    if (!validos.length) return res.status(400).json({ erro: 'Nenhum parâmetro válido informado.' });

    const parametros = await servico.salvarParametros(validos, req.usuario);
    return res.json({ mensagem: 'Parâmetros salvos.', parametros });
}));

module.exports = router;
