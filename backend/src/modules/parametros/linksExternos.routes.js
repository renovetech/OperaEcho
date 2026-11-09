/*
   Operações > Links Externos - persistência em banco (compartilhado entre todos
   os usuários). Endpoints: GET / POST / PUT / DELETE em /links-externos.
   SQL em linksExternos.repository.js; regra do endereço em linksExternos.service.js. */
const express = require('express');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const repositorio = require('./linksExternos.repository');
const { urlValida, temProdutoEEndereco } = require('./linksExternos.service');
const { salvarLink } = require('./linksExternos.schema');

const router = express.Router();

const ERRO_OBRIGATORIOS = 'Produto e link são obrigatórios.';
const ERRO_LINK_INVALIDO = 'Link inválido: use um endereço http:// ou https://.';

/** Devolve a mensagem de erro do corpo, ou nulo se produto e endereço servem. */
function erroDoLink(corpo) {
    if (!temProdutoEEndereco(corpo)) return ERRO_OBRIGATORIOS;
    return urlValida(corpo.url) ? null : ERRO_LINK_INVALIDO;
}

router.get('/links-externos', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listar());
}));

router.post('/links-externos', autenticar, autorizarModulo('links_externos', 'novo'), validarCorpo(salvarLink), asyncHandler(async (req, res) => {
    const erro = erroDoLink(req.body);
    if (erro) return res.status(400).json({ erro });
    const idLink = await repositorio.criar(req.body.id_produto, req.body.url.trim());
    return res.json({ id_link: idLink, mensagem: 'Criado' });
}));

router.put('/links-externos/:id', autenticar, autorizarModulo('links_externos', 'editar'), validarCorpo(salvarLink), asyncHandler(async (req, res) => {
    const erro = erroDoLink(req.body);
    if (erro) return res.status(400).json({ erro });
    await repositorio.atualizar(req.params.id, req.body.id_produto, req.body.url.trim());
    return res.json({ mensagem: 'Atualizado' });
}));

router.delete('/links-externos/:id', autenticar, autorizarModulo('links_externos', 'editar'), asyncHandler(async (req, res) => {
    await repositorio.excluir(req.params.id);
    res.json({ mensagem: 'Excluído' });
}));

module.exports = router;
