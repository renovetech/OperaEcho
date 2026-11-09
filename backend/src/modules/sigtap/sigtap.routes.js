/*
 * Operações > Consulta SIGTAP  +  Parâmetros > SIGTAP (importação).
 * Base própria da Tabela Unificada, alimentada pelo pacote .zip do DATASUS,
 * para consultar procedimentos, atributos e compatibilidades mesmo quando o
 * site do governo está fora do ar.
 *  - Leitura: módulo 'sigtap' (Consulta) ou 'parametros' (tela de importação).
 *  - Importar / remover competência: 'parametros' com permissão de edição.
 * Aqui ficam URLs, permissões e validação; o SQL está em sigtap.repository.js e sigtap.ficha.repository.js. */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { connectToDb } = require('../../config/database');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler, httpErro } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { limitar } = require('../../shared/rateLimit');
const imp = require('./sigtap.importacao');
const repositorio = require('./sigtap.repository');
const { fichaDoProcedimento } = require('./sigtap.ficha.repository');
const { soDigitos, inteiro, REFERENCIAS } = require('./sigtap.filtros');
const { importarCompetencia } = require('./sigtap.schema');

const TAMANHO_MAXIMO_ZIP = 150 * 1024 * 1024;

// Consulta é PÚBLICA (operaecho.com/sigtap, sem login): só leitura do catálogo, com limite por IP.
// Liberada também em ROTAS_LIVRES (index.js). Importação/histórico continuam exigindo login.
const consulta = [limitar({ janelaMs: 60 * 1000, max: 300 })];
const leitura = [autenticar, autorizarModulo(['sigtap', 'parametros'])];
const gestao = [autenticar, autorizarModulo('parametros', 'editar')];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TAMANHO_MAXIMO_ZIP, files: 1 },
    fileFilter: (req, file, cb) => /\.zip$/i.test(file.originalname || '')
        ? cb(null, true)
        : cb(httpErro(400, 'O arquivo precisa ser o .zip original baixado do SIGTAP.'))
});
const receberArquivo = (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(httpErro(400, 'Arquivo muito grande (máx. 150 MB).'));
    next(err.status ? err : httpErro(400, err.message || 'Falha ao receber o arquivo.'));
});

const comProgresso = (i) => i && ({ ...i, ...(i.situacao === 'PROCESSANDO' ? (imp.progressoDe(i.id_importacao) || {}) : {}) });
const semTotal = ({ total_geral, ...i }) => i;

// ============================================================================ IMPORTAÇÃO (Parâmetros > SIGTAP)
router.get('/sigtap/resumo', ...leitura, asyncHandler(async (req, res) => {
    await imp.encerrarOrfas(await connectToDb());
    const { competencias, ultima, andamento } = await repositorio.dadosDoResumo();
    res.json({
        competenciaVigente: competencias[0]?.competencia || null,
        competencias: competencias.map(c => ({ ...c, dt_fim: undefined })),
        ultimaConcluida: ultima || null,
        emAndamento: comProgresso(andamento) || null
    });
}));

router.get('/sigtap/importacoes', ...leitura, asyncHandler(async (req, res) => {
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 10, 5, 100);
    const linhas = await repositorio.listarImportacoes({ pagina, tamanho, competencia: req.query.competencia, situacao: req.query.situacao });
    res.json({ total: linhas[0]?.total_geral || 0, pagina, tamanho, itens: linhas.map(({ total_geral, ...i }) => comProgresso(i)) });
}));

router.get('/sigtap/importacoes/:id', ...leitura, asyncHandler(async (req, res) => {
    const importacao = await repositorio.buscarImportacao(inteiro(req.params.id, 0, 0, 2e9));
    if (!importacao) throw httpErro(404, 'Importação não encontrada.');
    res.json(comProgresso(importacao));
}));

router.post('/sigtap/importacoes', ...gestao, receberArquivo, validarCorpo(importarCompetencia), asyncHandler(async (req, res) => {
    if (!req.file) throw httpErro(400, 'Selecione o arquivo .zip da Tabela Unificada.');
    // O token traz só o login: grava o nome completo do usuário como responsável.
    const nome = await repositorio.nomeCompletoDoUsuario(req.usuario?.id_usuario || 0);
    const usuario = nome || req.usuario?.usuario || 'Sistema';
    const id = await imp.iniciar({ buffer: req.file.buffer, nomeArquivo: req.file.originalname, usuario });
    res.status(202).json(comProgresso(await repositorio.buscarImportacao(id)));
}));

router.delete('/sigtap/competencias/:competencia', ...gestao, asyncHandler(async (req, res) => {
    const c = soDigitos(req.params.competencia);
    if (!/^\d{6}$/.test(c)) throw httpErro(400, 'Competência inválida.');
    await imp.removerCompetencia(c);
    res.json({ mensagem: 'Competência removida.' });
}));

// ============================================================================ CONSULTA
router.get('/sigtap/competencias', ...consulta, asyncHandler(async (req, res) => {
    // Público: sem nome de quem importou nem arquivo; só competência, total e data.
    const lista = await repositorio.listarCompetencias();
    res.json(lista.map(c => ({
        competencia: c.competencia, qt_procedimentos: c.qt_procedimentos,
        data_importacao: c.dt_fim ? new Date(c.dt_fim).toISOString().slice(0, 10).split('-').reverse().join('/') : null
    })));
}));

/** Listas dos filtros da tela (pequenas): grupos, subgrupos, formas, financiamentos, instrumentos, modalidades. */
router.get('/sigtap/filtros', ...consulta, asyncHandler(async (req, res) => {
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    if (!c) return res.json({ competencia: null });
    res.json({ competencia: c, ...await repositorio.listasDosFiltros(c) });
}));

/** Busca de procedimentos com filtros combinados e paginação. */
router.get('/sigtap/procedimentos', ...consulta, asyncHandler(async (req, res) => {
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 20, 5, 100);
    const linhas = await repositorio.buscarProcedimentos(c, { pagina, tamanho, consulta: req.query });
    res.json({ competencia: c, pagina, tamanho, total: linhas[0]?.total_geral || 0, itens: linhas.map(semTotal) });
}));

/** Ficha completa do procedimento (todas as abas do DATASUS + compatibilidades + histórico). */
router.get('/sigtap/procedimentos/:codigo', ...consulta, asyncHandler(async (req, res) => {
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    const cod = soDigitos(req.params.codigo).slice(0, 10);
    if (!c || cod.length !== 10) throw httpErro(404, 'Procedimento não encontrado.');
    const ficha = await fichaDoProcedimento(c, cod);
    if (!ficha) throw httpErro(404, `Procedimento não encontrado na competência ${c.slice(4)}/${c.slice(0, 4)}.`);
    res.json(ficha);
}));

/** Tipos de compatibilidade presentes na competência (instrumento principal x secundário x tipo). */
router.get('/sigtap/compatibilidades/tipos', ...consulta, asyncHandler(async (req, res) => {
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    if (!c) return res.json({ competencia: null, tipos: [] });
    res.json({ competencia: c, tipos: await repositorio.tiposDeCompatibilidade(c) });
}));

/** Pares de compatibilidade com filtros por tipo e por procedimento principal/secundário. */
router.get('/sigtap/compatibilidades', ...consulta, asyncHandler(async (req, res) => {
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 25, 5, 100);
    const { tipo, principal, secundario } = req.query;
    const linhas = await repositorio.buscarCompatibilidades(c, { pagina, tamanho, tipo, principal, secundario });
    res.json({ competencia: c, pagina, tamanho, total: linhas[0]?.total_geral || 0, itens: linhas.map(semTotal) });
}));

/** Lista das tabelas auxiliares disponíveis. */
router.get('/sigtap/tabelas', ...consulta, (req, res) => {
    res.json(repositorio.listarTabelasAuxiliares());
});

/** Itens de uma tabela auxiliar, com a quantidade de procedimentos vinculados. */
router.get('/sigtap/tabelas/:nome', ...consulta, asyncHandler(async (req, res) => {
    const t = REFERENCIAS[req.params.nome];
    if (!t) throw httpErro(404, 'Tabela não encontrada.');
    const c = await repositorio.resolverCompetencia(req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 25, 5, 100);
    const linhas = await repositorio.buscarTabelaAuxiliar(c, t, { pagina, tamanho, termo: req.query.q });
    res.json({
        competencia: c, titulo: t.titulo, vinculo: t.vinculo, pagina, tamanho,
        total: linhas[0]?.total_geral || 0,
        itens: linhas.map(semTotal)
    });
}));

module.exports = router;
