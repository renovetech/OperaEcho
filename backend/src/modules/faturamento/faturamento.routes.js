/*
 * Operações > Lançar Faturamento  +  Painéis > Faturamento Consolidado.
 * Recebe os arquivos de produção (BPA, APAC, AIH) por projeto/unidade/produto/competência,
 * valoriza cada procedimento pela Tabela SIGTAP importada (Parâmetros > SIGTAP) e
 * consolida a evolução mês a mês.
 *  - Lançar / histórico: módulo 'faturamento_lancar' (novo = lançar, editar = excluir/revalorizar).
 *  - Painel: módulo 'painel_faturamento'.
 *  - Isolamento por lotação: usuários sem visão global só veem os próprios projetos.
 * Rotas: URLs, permissões e validação aqui; SQL em faturamento.repository.js; regras em faturamento.service.js. */
const express = require('express');
const multer = require('multer');
const { connectToDb } = require('../../config/database');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler, httpErro } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const servico = require('./faturamento.service');
const { destinoDoLancamento } = require('./faturamento.schema');

const router = express.Router();

const TAMANHO_MAXIMO_ARQUIVO = 60 * 1024 * 1024;
const leitura = [autenticar, autorizarModulo(['faturamento_lancar', 'painel_faturamento'])];
const lancar = [autenticar, autorizarModulo('faturamento_lancar', 'novo')];
const gestao = [autenticar, autorizarModulo('faturamento_lancar', 'editar')];
const painel = [autenticar, autorizarModulo('painel_faturamento')];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAMANHO_MAXIMO_ARQUIVO, files: 1 } });
const receberArquivo = (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(httpErro(400, 'Arquivo muito grande (máx. 60 MB).'));
    next(httpErro(400, err.message || 'Falha ao receber o arquivo.'));
});
// O formulário só pode ser validado depois que o multer leu os campos em texto.
const receberFormulario = [receberArquivo, validarCorpo(destinoDoLancamento)];

const dadosDoEnvio = (req) => ({ body: req.body, file: req.file, escopo: req.escopo, usuario: req.usuario });

router.use('/faturamento', asyncHandler(async (req, res, next) => {
    await servico.garantirEstrutura();
    next();
}));

// ============================================================================ LANÇAMENTO
router.get('/faturamento/opcoes', ...leitura, asyncHandler(async (req, res) => {
    res.json(await servico.montarOpcoes(await connectToDb(), req.escopo));
}));

/** Prévia: lê e valoriza o arquivo sem gravar. */
router.post('/faturamento/analisar', ...lancar, ...receberFormulario, asyncHandler(async (req, res) => {
    res.json(await servico.previaDoArquivo(await connectToDb(), dadosDoEnvio(req)));
}));

/** Grava o lançamento. Se já existir para o mesmo destino/competência/tipo, só substitui com substituir=1. */
router.post('/faturamento/lancamentos', ...lancar, ...receberFormulario, asyncHandler(async (req, res) => {
    const resultado = await servico.lancarFaturamento(await connectToDb(), dadosDoEnvio(req));
    if (resultado.conflito) {
        return res.status(409).json({ erro: 'Já existe lançamento para esta unidade, produto, competência e tipo.', existente: resultado.conflito });
    }
    return res.status(201).json({ id_lancamento: resultado.id, mensagem: resultado.substituido ? 'Lançamento substituído.' : 'Faturamento lançado.', resumo: resultado.resumo });
}));

/** Histórico de lançamentos. */
router.get('/faturamento/lancamentos', ...leitura, asyncHandler(async (req, res) => {
    res.json(await servico.listarLancamentos(await connectToDb(), req.escopo, req.query));
}));

router.get('/faturamento/lancamentos/:id', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await servico.carregarLancamento(pool, req.escopo, req.params.id);
    const procedimentos = await servico.buscarProcedimentosDoLancamento(pool, l.id_lancamento);
    res.json({ ...l, procedimentos });
}));

router.delete('/faturamento/lancamentos/:id', ...gestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await servico.carregarLancamento(pool, req.escopo, req.params.id);
    await servico.excluirLancamento(pool, l.id_lancamento);
    res.json({ mensagem: 'Lançamento excluído.' });
}));

router.post('/faturamento/lancamentos/:id/revalorizar', ...gestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await servico.carregarLancamento(pool, req.escopo, req.params.id);
    res.json(await servico.revalorizarLancamento(pool, l));
}));

// ============================================================================ PAINEL
router.get('/faturamento/painel', ...painel, asyncHandler(async (req, res) => {
    res.json(await servico.montarPainel(await connectToDb(), req.escopo, req.query));
}));

module.exports = router;
