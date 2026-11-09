/* Cadastros: projetos, produtos, tipos de unidade, unidades, cidades e motivos.
 * URLs, permissões e validação aqui; SQL em cadastros.repository.js e unidades.repository.js; regras em cadastros.service.js. */
const express = require('express');
const { autenticar, autorizarModulo, temPermissao } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { parseIntSafe } = require('../../shared/validators');
const painelPublico = require('../projetos/painelPublico.routes');
const repositorio = require('./cadastros.repository');
const unidades = require('./unidades.repository');
const servico = require('./cadastros.service');
const { salvarProjeto, salvarProduto, salvarUnidade, importarCoordenadas } = require('./cadastros.schema');

const router = express.Router();

// Permissão de escrita validada no servidor.
// Registro com id => 'editar'; sem id => 'novo'.
const autorizarGravacao = (modulo, campoId) => async (req, res, next) => {
    try {
        const acao = req.body && req.body[campoId] ? 'editar' : 'novo';
        if (await temPermissao(req, modulo, acao)) return next();
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    } catch (e) { return next(e); }
};

const erro400 = (res, mensagem) => res.status(400).json({ erro: mensagem });

// ==============================================================================
// PROJETOS
// ==============================================================================
router.get('/projetos', asyncHandler(async (req, res) => {
    res.json(await repositorio.listarProjetos());
}));

router.post('/projetos/salvar', autenticar, autorizarGravacao('projetos', 'id_projeto'), validarCorpo(salvarProjeto), asyncHandler(async (req, res) => {
    const corpo = req.body;
    if (!corpo.nome_projeto) return erro400(res, 'Nome do projeto é obrigatório.');
    const categoria = servico.categoriaDoProjeto(corpo.categoria);
    if (!categoria) return erro400(res, 'Informe a categoria do projeto (A, B ou C).');

    const { publico, slug, erro } = servico.painelPublicoDoProjeto(corpo);
    if (erro) return erro400(res, erro);
    if (publico) {
        const outroProjeto = await repositorio.projetoComEndereco(slug, corpo.id_projeto);
        if (outroProjeto) return erro400(res, `O endereço "/${slug}" já é usado pelo projeto "${outroProjeto}".`);
    }

    await repositorio.gravarProjeto({ ...corpo, categoria, publico, slug });
    painelPublico.limparCachePainel();
    return res.json({ mensagem: 'Salvo com sucesso', slug_publico: slug });
}));

// ==============================================================================
// PRODUTOS
// ==============================================================================
router.get('/produtos', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarProdutos());
}));

// Produtos ativos disponíveis como MODELO opcional no Novo Plano de Ação
// (o plano não depende mais do produto; o antigo flag gera_plano_acao foi removido).
router.get('/produtos/plano-acao', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarProdutosParaPlanoAcao());
}));

router.post('/produtos/salvar', autenticar, autorizarGravacao('produtos', 'id_produto'), validarCorpo(salvarProduto), asyncHandler(async (req, res) => {
    if (!req.body.nome_produto) return erro400(res, 'Nome do produto é obrigatório.');
    await repositorio.gravarProduto(req.body);
    return res.json({ mensagem: 'Salvo' });
}));

// ==============================================================================
// TIPOS DE UNIDADE (Hospital, Central de Regulação, UBS, ESF/PSF, Especializada...)
// ==============================================================================
router.get('/tipos-unidade', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarTiposDeUnidade());
}));

// ==============================================================================
// UNIDADES
// ==============================================================================
router.get('/unidades/buscar', autenticar, asyncHandler(async (req, res) => {
    res.json(await servico.buscarUnidades(req.query, req.escopo));
}));

router.post('/unidades/salvar', autenticar, autorizarGravacao('unidades', 'id_unidade'), validarCorpo(salvarUnidade), asyncHandler(async (req, res) => {
    const corpo = req.body;
    if (!corpo.nome_unidade || !corpo.id_projeto) return erro400(res, 'Nome e projeto são obrigatórios.');

    const coordenadas = servico.coordenadasDaUnidade(corpo);
    if (coordenadas.erro) return erro400(res, coordenadas.erro);

    const regiao = await servico.regiaoDaUnidade(corpo);
    await unidades.gravar(corpo, { ...coordenadas, ...regiao });
    return res.json({ mensagem: 'Salvo com sucesso' });
}));

// IMPORTAÇÃO EM MASSA DE COORDENADAS (planilha: CNES + latitude + longitude)
router.post('/unidades/coordenadas/importar', autenticar, autorizarModulo('unidades', 'editar'), validarCorpo(importarCoordenadas), asyncHandler(async (req, res) => {
    const { id_projeto: idProjeto, linhas } = req.body;
    if (!Array.isArray(linhas) || linhas.length === 0) return erro400(res, 'Planilha vazia.');
    if (linhas.length > servico.MAXIMO_LINHAS_COORDENADAS) return erro400(res, `Limite de ${servico.MAXIMO_LINHAS_COORDENADAS} linhas por importação.`);

    return res.json(await servico.importarCoordenadas(idProjeto, linhas));
}));

router.get('/unidades/:id/produtos', autenticar, asyncHandler(async (req, res) => {
    const idUnidade = parseIntSafe(req.params.id);
    if (!idUnidade) return res.json([]);
    return res.json(await unidades.produtosAtivosDaUnidade(idUnidade));
}));

// ==============================================================================
// CIDADES / MOTIVOS
// ==============================================================================
router.get('/cidades/:uf', asyncHandler(async (req, res) => {
    res.json(await repositorio.listarCidadesDaUf(req.params.uf));
}));

router.get('/motivos', autenticar, asyncHandler(async (req, res) => {
    res.json(await repositorio.listarMotivos());
}));

module.exports = router;
