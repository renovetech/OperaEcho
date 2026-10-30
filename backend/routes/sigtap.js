/* routes/sigtap.js
 * Operações > Consulta SIGTAP  +  Parâmetros > SIGTAP (importação).
 * Base própria da Tabela Unificada, alimentada pelo pacote .zip do DATASUS,
 * para consultar procedimentos, atributos e compatibilidades mesmo quando o
 * site do governo está fora do ar.
 *  - Leitura: módulo 'sigtap' (Consulta) ou 'parametros' (tela de importação).
 *  - Importar / remover competência: 'parametros' com permissão de edição. */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const imp = require('../services/sigtapImportacao');

const { limitar } = require('../utils/rateLimit');

// Consulta é PÚBLICA (operaecho.com/sigtap, sem login): só leitura do catálogo, com limite por IP.
// Liberada também em ROTAS_LIVRES (index.js). Importação/histórico continuam exigindo login.
const consulta = [limitar({ janelaMs: 60 * 1000, max: 300 })];
const leitura = [autenticar, autorizarModulo(['sigtap', 'parametros'])];
const gestao = [autenticar, autorizarModulo('parametros', 'editar')];

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 150 * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => /\.zip$/i.test(file.originalname || '')
        ? cb(null, true)
        : cb(httpErro(400, 'O arquivo precisa ser o .zip original baixado do SIGTAP.'))
});
const receberArquivo = (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(httpErro(400, 'Arquivo muito grande (máx. 150 MB).'));
    next(err.status ? err : httpErro(400, err.message || 'Falha ao receber o arquivo.'));
});

// Garante as tabelas antes de qualquer rota do módulo (idempotente, 1x por processo).
router.use('/sigtap', asyncHandler(async (req, res, next) => {
    await imp.garantirEstrutura(await connectToDb());
    next();
}));

// ============================================================================ helpers
const P = 'tab_sigtap_';
const limpar = (v, max = 12) => String(v || '').replace(/[^0-9A-Za-z.]/g, '').slice(0, max);
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const inteiro = (v, padrao, min, max) => { const n = parseInt(v, 10); return isNaN(n) ? padrao : Math.min(max, Math.max(min, n)); };

async function competenciasDisponiveis(pool) {
    const r = await pool.request().query(`
        SELECT i.competencia, i.dt_fim, i.usuario, i.arquivo, i.qt_procedimentos
        FROM tab_sigtap_importacao i
        WHERE i.situacao = 'CONCLUIDA' AND i.removida = 0
          AND i.id_importacao = (SELECT MAX(x.id_importacao) FROM tab_sigtap_importacao x
                                 WHERE x.competencia = i.competencia AND x.situacao = 'CONCLUIDA' AND x.removida = 0)
        ORDER BY i.competencia DESC`);
    return r.recordset;
}

/** Competência pedida (se disponível) ou a mais recente. null = nenhuma importada. */
async function resolverCompetencia(pool, pedida) {
    const lista = await competenciasDisponiveis(pool);
    if (!lista.length) return null;
    const c = soDigitos(pedida);
    return lista.some(x => x.competencia === c) ? c : lista[0].competencia;
}

/** Filtro de texto: código (com ou sem pontuação) ou palavras do nome, em qualquer ordem, sem acento. */
function filtroTexto(req, termo, colCodigo, colNome, prefixo) {
    const t = String(termo || '').trim().slice(0, 120);
    if (!t) return '';
    const dig = soDigitos(t);
    if (dig.length >= 2 && /^[\d.\s-]+$/.test(t)) {
        req.input(`${prefixo}c`, sql.VarChar(12), `${dig}%`);
        return ` AND ${colCodigo} LIKE @${prefixo}c`;
    }
    const palavras = t.split(/\s+/).filter(Boolean).slice(0, 6);
    return palavras.map((w, i) => {
        req.input(`${prefixo}${i}`, sql.NVarChar(130), `%${w}%`);
        return ` AND ((${colNome}) COLLATE Latin1_General_CI_AI LIKE @${prefixo}${i} OR ${colCodigo} LIKE @${prefixo}${i})`;
    }).join('');
}

/* Vínculos usados para filtrar procedimentos (p = tab_sigtap_tb_procedimento). `x` é a expressão do código. */
const EXISTE = (tabela, cond) => `EXISTS (SELECT 1 FROM ${P}${tabela} v WHERE v.competencia = p.competencia AND v.co_procedimento = p.co_procedimento AND ${cond})`;
const VINCULOS = {
    grupo: (x) => `LEFT(p.co_procedimento, 2) = ${x}`,
    subgrupo: (x) => `LEFT(p.co_procedimento, 4) = ${x}`,
    forma: (x) => `LEFT(p.co_procedimento, 6) = ${x}`,
    financiamento: (x) => `p.co_financiamento = ${x}`,
    rubrica: (x) => `p.co_rubrica = ${x}`,
    modalidade: (x) => EXISTE('rl_procedimento_modalidade', `v.co_modalidade = ${x}`),
    registro: (x) => EXISTE('rl_procedimento_registro', `v.co_registro = ${x}`),
    leito: (x) => EXISTE('rl_procedimento_leito', `v.co_tipo_leito = ${x}`),
    detalhe: (x) => EXISTE('rl_procedimento_detalhe', `v.co_detalhe = ${x}`),
    servico: (x) => EXISTE('rl_procedimento_servico', `v.co_servico + '.' + v.co_classificacao = ${x}`),
    habilitacao: (x) => EXISTE('rl_procedimento_habilitacao', `v.co_habilitacao = ${x}`),
    grupo_habilitacao: (x) => EXISTE('rl_procedimento_habilitacao', `v.nu_grupo_habilitacao = ${x}`),
    ocupacao: (x) => EXISTE('rl_procedimento_ocupacao', `v.co_ocupacao = ${x}`),
    cid: (x) => EXISTE('rl_procedimento_cid', `v.co_cid = ${x}`),
    regra: (x) => EXISTE('rl_procedimento_regra_cond', `v.co_regra_condicionada = ${x}`),
    renases: (x) => EXISTE('rl_procedimento_renases', `v.co_renases = ${x}`),
    tuss: (x) => EXISTE('rl_procedimento_tuss', `v.co_tuss = ${x}`),
    rede: (x) => EXISTE('rl_procedimento_comp_rede', `v.co_componente_rede = ${x}`),
    sia_sih: (x) => EXISTE('rl_procedimento_sia_sih', `v.co_procedimento_sia_sih = ${x}`)
};

/* Tabelas auxiliares navegáveis (menu "Tabelas" do DATASUS). t = tabela principal. */
const J = (tabela, alias, on) => `LEFT JOIN ${P}${tabela} ${alias} ON ${alias}.competencia = t.competencia AND ${on}`;
const REFERENCIAS = {
    grupo: { titulo: 'Grupos', from: `${P}tb_grupo t`, cod: 't.co_grupo', nome: 't.no_grupo', vinculo: 'grupo' },
    sub_grupo: { titulo: 'Subgrupos', from: `${P}tb_sub_grupo t ${J('tb_grupo', 'g', 'g.co_grupo = t.co_grupo')}`, cod: 't.co_grupo + t.co_sub_grupo', nome: 't.no_sub_grupo', extra: { grupo: 'g.no_grupo' }, vinculo: 'subgrupo' },
    forma_organizacao: { titulo: 'Formas de Organização', from: `${P}tb_forma_organizacao t ${J('tb_sub_grupo', 's', 's.co_grupo = t.co_grupo AND s.co_sub_grupo = t.co_sub_grupo')}`, cod: 't.co_grupo + t.co_sub_grupo + t.co_forma_organizacao', nome: 't.no_forma_organizacao', extra: { sub_grupo: 's.no_sub_grupo' }, vinculo: 'forma' },
    financiamento: { titulo: 'Financiamentos', from: `${P}tb_financiamento t`, cod: 't.co_financiamento', nome: 't.no_financiamento', vinculo: 'financiamento' },
    rubrica: { titulo: 'Rubricas', from: `${P}tb_rubrica t`, cod: 't.co_rubrica', nome: 't.no_rubrica', vinculo: 'rubrica' },
    modalidade: { titulo: 'Modalidades de Atendimento', from: `${P}tb_modalidade t`, cod: 't.co_modalidade', nome: 't.no_modalidade', vinculo: 'modalidade' },
    registro: { titulo: 'Instrumentos de Registro', from: `${P}tb_registro t`, cod: 't.co_registro', nome: 't.no_registro', vinculo: 'registro' },
    ocupacao: { titulo: 'CBO - Ocupações', from: `${P}tb_ocupacao t`, cod: 't.co_ocupacao', nome: 't.no_ocupacao', vinculo: 'ocupacao' },
    cid: { titulo: 'CID-10', from: `${P}tb_cid t`, cod: 't.co_cid', nome: 't.no_cid', extra: { agravo: 't.tp_agravo', sexo: 't.tp_sexo', estadio: 't.tp_estadio', campos_irradiados: 't.vl_campos_irradiados' }, vinculo: 'cid' },
    habilitacao: { titulo: 'Habilitações', from: `${P}tb_habilitacao t`, cod: 't.co_habilitacao', nome: 't.no_habilitacao', vinculo: 'habilitacao' },
    grupo_habilitacao: { titulo: 'Grupos de Habilitação', from: `${P}tb_grupo_habilitacao t`, cod: 't.nu_grupo_habilitacao', nome: "t.no_grupo_habilitacao + ISNULL(' - ' + t.ds_grupo_habilitacao, '')", vinculo: 'grupo_habilitacao' },
    servico: { titulo: 'Serviços / Classificações', from: `${P}tb_servico_classificacao t ${J('tb_servico', 's', 's.co_servico = t.co_servico')}`, cod: "t.co_servico + '.' + t.co_classificacao", nome: 't.no_classificacao', extra: { servico: 's.no_servico' }, vinculo: 'servico' },
    tipo_leito: { titulo: 'Tipos de Leito', from: `${P}tb_tipo_leito t`, cod: 't.co_tipo_leito', nome: 't.no_tipo_leito', vinculo: 'leito' },
    detalhe: { titulo: 'Atributos Complementares (Detalhes)', from: `${P}tb_detalhe t ${J('tb_descricao_detalhe', 'd', 'd.co_detalhe = t.co_detalhe')}`, cod: 't.co_detalhe', nome: 't.no_detalhe', extra: { descricao: 'd.ds_detalhe' }, vinculo: 'detalhe' },
    rede: { titulo: 'Redes de Atenção', from: `${P}tb_componente_rede t ${J('tb_rede_atencao', 'r', 'r.co_rede_atencao = t.co_rede_atencao')}`, cod: 't.co_componente_rede', nome: 't.no_componente_rede', extra: { rede: 'r.no_rede_atencao' }, vinculo: 'rede' },
    regra: { titulo: 'Regras Condicionadas', from: `${P}tb_regra_condicionada t`, cod: 't.co_regra_condicionada', nome: 't.no_regra_condicionada', extra: { descricao: 't.ds_regra_condicionada' }, vinculo: 'regra' },
    renases: { titulo: 'RENASES', from: `${P}tb_renases t`, cod: 't.co_renases', nome: 't.no_renases', vinculo: 'renases' },
    tuss: { titulo: 'TUSS', from: `${P}tb_tuss t`, cod: 't.co_tuss', nome: 't.no_tuss', vinculo: 'tuss' },
    sia_sih: { titulo: 'Procedimentos SIA/SIH (tabela antiga)', from: `${P}tb_sia_sih t`, cod: 't.co_procedimento_sia_sih', nome: 't.no_procedimento_sia_sih', extra: { tipo: 't.tp_procedimento' }, vinculo: 'sia_sih' }
};

const IMPORTACAO_COLS = `id_importacao, arquivo, competencia, situacao, usuario, removida, mensagem,
    qt_procedimentos, qt_novos, qt_compatibilidades, qt_registros,
    FORMAT(dt_inicio, 'dd/MM/yyyy HH:mm:ss') AS inicio, FORMAT(dt_fim, 'dd/MM/yyyy HH:mm:ss') AS fim,
    DATEDIFF(second, dt_inicio, ISNULL(dt_fim, DATEADD(hour, -3, GETUTCDATE()))) AS duracao_seg`;
const comProgresso = (i) => i && ({ ...i, ...(i.situacao === 'PROCESSANDO' ? (imp.progressoDe(i.id_importacao) || {}) : {}) });

// ============================================================================ IMPORTAÇÃO (Parâmetros > SIGTAP)
router.get('/sigtap/resumo', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await imp.encerrarOrfas(pool);
    const [comps, ult, and] = await Promise.all([
        competenciasDisponiveis(pool),
        pool.request().query(`SELECT TOP 1 ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE situacao = 'CONCLUIDA' ORDER BY dt_fim DESC, id_importacao DESC`),
        pool.request().query(`SELECT TOP 1 ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE situacao = 'PROCESSANDO' ORDER BY id_importacao DESC`)
    ]);
    res.json({
        competenciaVigente: comps[0]?.competencia || null,
        competencias: comps.map(c => ({ ...c, dt_fim: undefined })),
        ultimaConcluida: ult.recordset[0] || null,
        emAndamento: comProgresso(and.recordset[0]) || null
    });
}));

router.get('/sigtap/importacoes', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 10, 5, 100);
    const r = pool.request().input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    let where = 'WHERE 1 = 1';
    const comp = soDigitos(req.query.competencia).slice(0, 6);
    if (comp) { r.input('c', sql.VarChar(7), `${comp}%`); where += ' AND competencia LIKE @c'; }
    if (['PROCESSANDO', 'CONCLUIDA', 'ERRO'].includes(req.query.situacao)) { r.input('s', sql.VarChar(12), req.query.situacao); where += ' AND situacao = @s'; }
    const q = await r.query(`
        SELECT ${IMPORTACAO_COLS}, COUNT(*) OVER() AS total_geral
        FROM tab_sigtap_importacao ${where}
        ORDER BY id_importacao DESC
        OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY`);
    res.json({ total: q.recordset[0]?.total_geral || 0, pagina, tamanho, itens: q.recordset.map(({ total_geral, ...i }) => comProgresso(i)) });
}));

router.get('/sigtap/importacoes/:id', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, inteiro(req.params.id, 0, 0, 2e9))
        .query(`SELECT ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE id_importacao = @id`);
    if (!r.recordset.length) throw httpErro(404, 'Importação não encontrada.');
    res.json(comProgresso(r.recordset[0]));
}));

router.post('/sigtap/importacoes', ...gestao, receberArquivo, asyncHandler(async (req, res) => {
    if (!req.file) throw httpErro(400, 'Selecione o arquivo .zip da Tabela Unificada.');
    const pool = await connectToDb();
    // O token traz só o login: grava o nome completo do usuário como responsável.
    const u = await pool.request().input('id', sql.Int, req.usuario?.id_usuario || 0)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    const usuario = u.recordset[0]?.nome_completo || req.usuario?.usuario || 'Sistema';
    const id = await imp.iniciar({ buffer: req.file.buffer, nomeArquivo: req.file.originalname, usuario });
    const r = await pool.request().input('id', sql.Int, id).query(`SELECT ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE id_importacao = @id`);
    res.status(202).json(comProgresso(r.recordset[0]));
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
    const lista = await competenciasDisponiveis(await connectToDb());
    res.json(lista.map(c => ({
        competencia: c.competencia, qt_procedimentos: c.qt_procedimentos,
        data_importacao: c.dt_fim ? new Date(c.dt_fim).toISOString().slice(0, 10).split('-').reverse().join('/') : null
    })));
}));

/** Listas dos filtros da tela (pequenas): grupos, subgrupos, formas, financiamentos, instrumentos, modalidades. */
router.get('/sigtap/filtros', ...consulta, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    if (!c) return res.json({ competencia: null });
    const q = (s) => pool.request().input('c', sql.Char(6), c).query(s);
    const [g, sg, fo, fi, rg, mo] = await Promise.all([
        q(`SELECT co_grupo AS codigo, no_grupo AS nome FROM ${P}tb_grupo WHERE competencia = @c ORDER BY co_grupo`),
        q(`SELECT co_grupo + co_sub_grupo AS codigo, no_sub_grupo AS nome FROM ${P}tb_sub_grupo WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_grupo + co_sub_grupo + co_forma_organizacao AS codigo, no_forma_organizacao AS nome FROM ${P}tb_forma_organizacao WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_financiamento AS codigo, no_financiamento AS nome FROM ${P}tb_financiamento WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_registro AS codigo, no_registro AS nome FROM ${P}tb_registro WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_modalidade AS codigo, no_modalidade AS nome FROM ${P}tb_modalidade WHERE competencia = @c ORDER BY 1`)
    ]);
    res.json({ competencia: c, grupos: g.recordset, subgrupos: sg.recordset, formas: fo.recordset, financiamentos: fi.recordset, registros: rg.recordset, modalidades: mo.recordset });
}));

/** Busca de procedimentos com filtros combinados e paginação. */
router.get('/sigtap/procedimentos', ...consulta, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });

    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 20, 5, 100);
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    let where = filtroTexto(r, req.query.q, 'p.co_procedimento', 'p.no_procedimento', 't');

    const prefixo = soDigitos(req.query.forma || req.query.subgrupo || req.query.grupo).slice(0, 6);
    if (prefixo) { r.input('pre', sql.VarChar(7), `${prefixo}%`); where += ' AND p.co_procedimento LIKE @pre'; }
    const simples = { financiamento: 'p.co_financiamento', complexidade: 'p.tp_complexidade', sexo: 'p.tp_sexo' };
    Object.entries(simples).forEach(([k, col]) => {
        const v = limpar(req.query[k], 2);
        if (v) { r.input(k, sql.VarChar(2), v); where += ` AND ${col} = @${k}`; }
    });
    ['registro', 'modalidade'].forEach(k => {
        const v = limpar(req.query[k], 2);
        if (v) { r.input(k, sql.VarChar(2), v); where += ` AND ${VINCULOS[k](`@${k}`)}`; }
    });
    const vinc = req.query.vinculo;
    const vcod = limpar(req.query.codigo);
    if (VINCULOS[vinc] && vcod) { r.input('vc', sql.VarChar(12), vcod); where += ` AND ${VINCULOS[vinc]('@vc')}`; }
    const valorMin = parseFloat(req.query.valor_min);
    if (!isNaN(valorMin)) { r.input('vmin', sql.Decimal(14, 2), valorMin); where += ' AND (p.vl_sa >= @vmin OR p.vl_sh + p.vl_sp >= @vmin)'; }

    const ORDENS = {
        codigo: 'p.co_procedimento', nome: 'p.no_procedimento, p.co_procedimento',
        valor_amb: 'p.vl_sa DESC, p.co_procedimento', valor_hosp: '(p.vl_sh + p.vl_sp) DESC, p.co_procedimento'
    };
    const ordem = ORDENS[req.query.ordem] || ORDENS.codigo;

    // Página primeiro (só chaves + total); instrumentos e financiamento apenas das linhas exibidas.
    const q = await r.query(`
        WITH pagina AS (
            SELECT p.co_procedimento, COUNT(*) OVER() AS total_geral, ROW_NUMBER() OVER (ORDER BY ${ordem}) AS ordem
            FROM ${P}tb_procedimento p
            WHERE p.competencia = @c ${where}
            ORDER BY ${ordem}
            OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY
        )
        SELECT p.co_procedimento, p.no_procedimento, p.tp_complexidade, p.tp_sexo, p.co_financiamento,
               f.no_financiamento, p.vl_sa, p.vl_sh, p.vl_sp, pg.total_geral,
               STUFF((SELECT ',' + rr.co_registro FROM ${P}rl_procedimento_registro rr
                      WHERE rr.competencia = p.competencia AND rr.co_procedimento = p.co_procedimento
                      ORDER BY rr.co_registro FOR XML PATH('')), 1, 1, '') AS registros
        FROM pagina pg
        JOIN ${P}tb_procedimento p ON p.competencia = @c AND p.co_procedimento = pg.co_procedimento
        LEFT JOIN ${P}tb_financiamento f ON f.competencia = p.competencia AND f.co_financiamento = p.co_financiamento
        ORDER BY pg.ordem`);
    res.json({
        competencia: c, pagina, tamanho,
        total: q.recordset[0]?.total_geral || 0,
        itens: q.recordset.map(({ total_geral, ...i }) => i)
    });
}));

/** Ficha completa do procedimento (todas as abas do DATASUS + compatibilidades + histórico). */
router.get('/sigtap/procedimentos/:codigo', ...consulta, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    const cod = soDigitos(req.params.codigo).slice(0, 10);
    if (!c || cod.length !== 10) throw httpErro(404, 'Procedimento não encontrado.');
    const q = (s) => pool.request().input('c', sql.Char(6), c).input('p', sql.VarChar(10), cod).query(s).then(r => r.recordset);
    const PJ = (alias, col) => `LEFT JOIN ${P}tb_procedimento ${alias} ON ${alias}.competencia = x.competencia AND ${alias}.co_procedimento = x.${col}`;

    const base = await q(`
        SELECT p.*, g.no_grupo, sg.no_sub_grupo, fo.no_forma_organizacao, f.no_financiamento, rb.no_rubrica, d.ds_procedimento
        FROM ${P}tb_procedimento p
        LEFT JOIN ${P}tb_grupo g ON g.competencia = p.competencia AND g.co_grupo = LEFT(p.co_procedimento, 2)
        LEFT JOIN ${P}tb_sub_grupo sg ON sg.competencia = p.competencia AND sg.co_grupo + sg.co_sub_grupo = LEFT(p.co_procedimento, 4)
        LEFT JOIN ${P}tb_forma_organizacao fo ON fo.competencia = p.competencia AND fo.co_grupo + fo.co_sub_grupo + fo.co_forma_organizacao = LEFT(p.co_procedimento, 6)
        LEFT JOIN ${P}tb_financiamento f ON f.competencia = p.competencia AND f.co_financiamento = p.co_financiamento
        LEFT JOIN ${P}tb_rubrica rb ON rb.competencia = p.competencia AND rb.co_rubrica = p.co_rubrica
        LEFT JOIN ${P}tb_descricao d ON d.competencia = p.competencia AND d.co_procedimento = p.co_procedimento
        WHERE p.competencia = @c AND p.co_procedimento = @p`);
    if (!base.length) throw httpErro(404, `Procedimento não encontrado na competência ${c.slice(4)}/${c.slice(0, 4)}.`);

    const [modalidades, registros, detalhes, cids, cbos, leitos, servicos, habilitacoes, incrementos, redes,
        origens, regras, renases, tuss, siaSih, compPrincipal, compSecundario, excecoes, historico] = await Promise.all([
        q(`SELECT x.co_modalidade AS codigo, m.no_modalidade AS nome FROM ${P}rl_procedimento_modalidade x
           LEFT JOIN ${P}tb_modalidade m ON m.competencia = x.competencia AND m.co_modalidade = x.co_modalidade
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_registro AS codigo, r.no_registro AS nome FROM ${P}rl_procedimento_registro x
           LEFT JOIN ${P}tb_registro r ON r.competencia = x.competencia AND r.co_registro = x.co_registro
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_detalhe AS codigo, d.no_detalhe AS nome, dd.ds_detalhe AS descricao FROM ${P}rl_procedimento_detalhe x
           LEFT JOIN ${P}tb_detalhe d ON d.competencia = x.competencia AND d.co_detalhe = x.co_detalhe
           LEFT JOIN ${P}tb_descricao_detalhe dd ON dd.competencia = x.competencia AND dd.co_detalhe = x.co_detalhe
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_cid AS codigo, t.no_cid AS nome, x.st_principal AS principal, t.tp_sexo AS sexo, t.tp_agravo AS agravo FROM ${P}rl_procedimento_cid x
           LEFT JOIN ${P}tb_cid t ON t.competencia = x.competencia AND t.co_cid = x.co_cid
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_ocupacao AS codigo, o.no_ocupacao AS nome FROM ${P}rl_procedimento_ocupacao x
           LEFT JOIN ${P}tb_ocupacao o ON o.competencia = x.competencia AND o.co_ocupacao = x.co_ocupacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_tipo_leito AS codigo, l.no_tipo_leito AS nome FROM ${P}rl_procedimento_leito x
           LEFT JOIN ${P}tb_tipo_leito l ON l.competencia = x.competencia AND l.co_tipo_leito = x.co_tipo_leito
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_servico AS servico, s.no_servico AS nome_servico, x.co_classificacao AS classificacao, sc.no_classificacao AS nome_classificacao
           FROM ${P}rl_procedimento_servico x
           LEFT JOIN ${P}tb_servico s ON s.competencia = x.competencia AND s.co_servico = x.co_servico
           LEFT JOIN ${P}tb_servico_classificacao sc ON sc.competencia = x.competencia AND sc.co_servico = x.co_servico AND sc.co_classificacao = x.co_classificacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1, 3`),
        q(`SELECT x.co_habilitacao AS codigo, h.no_habilitacao AS nome, NULLIF(x.nu_grupo_habilitacao, '') AS grupo,
                  gh.no_grupo_habilitacao AS nome_grupo, gh.ds_grupo_habilitacao AS descricao_grupo
           FROM ${P}rl_procedimento_habilitacao x
           LEFT JOIN ${P}tb_habilitacao h ON h.competencia = x.competencia AND h.co_habilitacao = x.co_habilitacao
           LEFT JOIN ${P}tb_grupo_habilitacao gh ON gh.competencia = x.competencia AND gh.nu_grupo_habilitacao = x.nu_grupo_habilitacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 3, 1`),
        q(`SELECT x.co_habilitacao AS codigo, h.no_habilitacao AS nome, x.vl_percentual_sh AS sh, x.vl_percentual_sa AS sa, x.vl_percentual_sp AS sp
           FROM ${P}rl_procedimento_incremento x
           LEFT JOIN ${P}tb_habilitacao h ON h.competencia = x.competencia AND h.co_habilitacao = x.co_habilitacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_componente_rede AS codigo, cr.no_componente_rede AS nome, ra.no_rede_atencao AS rede FROM ${P}rl_procedimento_comp_rede x
           LEFT JOIN ${P}tb_componente_rede cr ON cr.competencia = x.competencia AND cr.co_componente_rede = x.co_componente_rede
           LEFT JOIN ${P}tb_rede_atencao ra ON ra.competencia = x.competencia AND ra.co_rede_atencao = cr.co_rede_atencao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_procedimento_origem AS codigo, o.no_procedimento AS nome FROM ${P}rl_procedimento_origem x ${PJ('o', 'co_procedimento_origem')}
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_regra_condicionada AS codigo, r.no_regra_condicionada AS nome, r.ds_regra_condicionada AS descricao FROM ${P}rl_procedimento_regra_cond x
           LEFT JOIN ${P}tb_regra_condicionada r ON r.competencia = x.competencia AND r.co_regra_condicionada = x.co_regra_condicionada
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_renases AS codigo, r.no_renases AS nome FROM ${P}rl_procedimento_renases x
           LEFT JOIN ${P}tb_renases r ON r.competencia = x.competencia AND r.co_renases = x.co_renases
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_tuss AS codigo, t.no_tuss AS nome FROM ${P}rl_procedimento_tuss x
           LEFT JOIN ${P}tb_tuss t ON t.competencia = x.competencia AND t.co_tuss = x.co_tuss
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT x.co_procedimento_sia_sih AS codigo, s.no_procedimento_sia_sih AS nome, x.tp_procedimento AS tipo FROM ${P}rl_procedimento_sia_sih x
           LEFT JOIN ${P}tb_sia_sih s ON s.competencia = x.competencia AND s.co_procedimento_sia_sih = x.co_procedimento_sia_sih AND s.tp_procedimento = x.tp_procedimento
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`),
        q(`SELECT TOP 3000 x.co_registro_principal AS reg_principal, x.co_procedimento_compativel AS codigo, o.no_procedimento AS nome,
                  x.co_registro_compativel AS reg_compativel, x.tp_compatibilidade AS tipo, x.qt_permitida AS quantidade
           FROM ${P}rl_procedimento_compativel x ${PJ('o', 'co_procedimento_compativel')}
           WHERE x.competencia = @c AND x.co_procedimento_principal = @p ORDER BY x.tp_compatibilidade, x.co_procedimento_compativel`),
        q(`SELECT TOP 3000 x.co_registro_principal AS reg_principal, x.co_procedimento_principal AS codigo, o.no_procedimento AS nome,
                  x.co_registro_compativel AS reg_compativel, x.tp_compatibilidade AS tipo, x.qt_permitida AS quantidade
           FROM ${P}rl_procedimento_compativel x ${PJ('o', 'co_procedimento_principal')}
           WHERE x.competencia = @c AND x.co_procedimento_compativel = @p ORDER BY x.tp_compatibilidade, x.co_procedimento_principal`),
        q(`SELECT x.co_procedimento_restricao AS restricao, r.no_procedimento AS nome_restricao,
                  x.co_procedimento_principal AS principal, pp.no_procedimento AS nome_principal, x.co_registro_principal AS reg_principal,
                  x.co_procedimento_compativel AS compativel, pc.no_procedimento AS nome_compativel, x.co_registro_compativel AS reg_compativel,
                  x.tp_compatibilidade AS tipo
           FROM ${P}rl_excecao_compatibilidade x ${PJ('r', 'co_procedimento_restricao')} ${PJ('pp', 'co_procedimento_principal')} ${PJ('pc', 'co_procedimento_compativel')}
           WHERE x.competencia = @c AND (x.co_procedimento_restricao = @p OR x.co_procedimento_principal = @p OR x.co_procedimento_compativel = @p)`),
        q(`SELECT h.competencia, h.no_procedimento, h.vl_sa, h.vl_sh, h.vl_sp, h.tp_complexidade, h.co_financiamento, h.qt_maxima_execucao,
                  h.vl_idade_minima, h.vl_idade_maxima
           FROM ${P}tb_procedimento h
           WHERE h.co_procedimento = @p
             AND h.competencia IN (SELECT competencia FROM tab_sigtap_importacao WHERE situacao = 'CONCLUIDA' AND removida = 0)
           ORDER BY h.competencia DESC`)
    ]);

    const nomesRegistro = await q(`SELECT co_registro AS codigo, no_registro AS nome FROM ${P}tb_registro WHERE competencia = @c`);
    res.json({
        competencia: c, procedimento: base[0], modalidades, registros, detalhes, cids, cbos, leitos, servicos, habilitacoes,
        incrementos, redes, origens, regras, renases, tuss, siaSih,
        compatibilidades: { comoPrincipal: compPrincipal, comoSecundario: compSecundario, excecoes },
        historico,
        nomesRegistro: Object.fromEntries(nomesRegistro.map(r => [r.codigo, r.nome]))
    });
}));

/** Tipos de compatibilidade presentes na competência (instrumento principal x secundário x tipo). */
router.get('/sigtap/compatibilidades/tipos', ...consulta, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    if (!c) return res.json({ competencia: null, tipos: [] });
    const r = await pool.request().input('c', sql.Char(6), c).query(`
        SELECT x.co_registro_principal AS reg_principal, rp.no_registro AS nome_principal,
               x.co_registro_compativel AS reg_compativel, rc.no_registro AS nome_compativel,
               x.tp_compatibilidade AS tipo, COUNT(*) AS quantidade
        FROM ${P}rl_procedimento_compativel x
        LEFT JOIN ${P}tb_registro rp ON rp.competencia = x.competencia AND rp.co_registro = x.co_registro_principal
        LEFT JOIN ${P}tb_registro rc ON rc.competencia = x.competencia AND rc.co_registro = x.co_registro_compativel
        WHERE x.competencia = @c
        GROUP BY x.co_registro_principal, rp.no_registro, x.co_registro_compativel, rc.no_registro, x.tp_compatibilidade
        ORDER BY x.co_registro_principal, x.co_registro_compativel, x.tp_compatibilidade`);
    res.json({ competencia: c, tipos: r.recordset });
}));

/** Pares de compatibilidade com filtros por tipo e por procedimento principal/secundário. */
router.get('/sigtap/compatibilidades', ...consulta, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 25, 5, 100);
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    let where = '';
    const [rp, rc, tp] = String(req.query.tipo || '').split('-');
    if (/^\d{2}$/.test(rp || '')) { r.input('rp', sql.VarChar(2), rp); where += ' AND x.co_registro_principal = @rp'; }
    if (/^\d{2}$/.test(rc || '')) { r.input('rc', sql.VarChar(2), rc); where += ' AND x.co_registro_compativel = @rc'; }
    if (/^\d$/.test(tp || '')) { r.input('tp', sql.VarChar(1), tp); where += ' AND x.tp_compatibilidade = @tp'; }
    where += filtroTexto(r, req.query.principal, 'x.co_procedimento_principal', 'pp.no_procedimento', 'a');
    where += filtroTexto(r, req.query.secundario, 'x.co_procedimento_compativel', 'pc.no_procedimento', 'b');

    // Página só com as chaves, na ordem da chave clusterizada (sem ordenação/memória extra); nomes depois.
    const q = await r.query(`
        WITH pagina AS (
            SELECT x.co_procedimento_principal, x.co_registro_principal, x.co_procedimento_compativel, x.co_registro_compativel,
                   x.tp_compatibilidade, x.qt_permitida, COUNT(*) OVER() AS total_geral
            FROM ${P}rl_procedimento_compativel x
            LEFT JOIN ${P}tb_procedimento pp ON pp.competencia = x.competencia AND pp.co_procedimento = x.co_procedimento_principal
            LEFT JOIN ${P}tb_procedimento pc ON pc.competencia = x.competencia AND pc.co_procedimento = x.co_procedimento_compativel
            WHERE x.competencia = @c ${where}
            ORDER BY x.co_procedimento_principal, x.co_registro_principal, x.co_procedimento_compativel, x.co_registro_compativel
            OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY
        )
        SELECT g.co_procedimento_principal AS principal, pp.no_procedimento AS nome_principal, g.co_registro_principal AS reg_principal,
               g.co_procedimento_compativel AS secundario, pc.no_procedimento AS nome_secundario, g.co_registro_compativel AS reg_compativel,
               g.tp_compatibilidade AS tipo, g.qt_permitida AS quantidade, g.total_geral
        FROM pagina g
        LEFT JOIN ${P}tb_procedimento pp ON pp.competencia = @c AND pp.co_procedimento = g.co_procedimento_principal
        LEFT JOIN ${P}tb_procedimento pc ON pc.competencia = @c AND pc.co_procedimento = g.co_procedimento_compativel
        ORDER BY g.co_procedimento_principal, g.co_registro_principal, g.co_procedimento_compativel, g.co_registro_compativel`);
    res.json({ competencia: c, pagina, tamanho, total: q.recordset[0]?.total_geral || 0, itens: q.recordset.map(({ total_geral, ...i }) => i) });
}));

/** Lista das tabelas auxiliares disponíveis. */
router.get('/sigtap/tabelas', ...consulta, (req, res) => {
    res.json(Object.entries(REFERENCIAS).map(([chave, t]) => ({ chave, titulo: t.titulo })));
});

/** Itens de uma tabela auxiliar, com a quantidade de procedimentos vinculados. */
router.get('/sigtap/tabelas/:nome', ...consulta, asyncHandler(async (req, res) => {
    const t = REFERENCIAS[req.params.nome];
    if (!t) throw httpErro(404, 'Tabela não encontrada.');
    const pool = await connectToDb();
    const c = await resolverCompetencia(pool, req.query.competencia);
    if (!c) return res.json({ competencia: null, total: 0, itens: [] });
    const pagina = inteiro(req.query.pagina, 1, 1, 100000);
    const tamanho = inteiro(req.query.tamanho, 25, 5, 100);
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    const where = filtroTexto(r, req.query.q, t.cod, t.nome, 't');
    const extras = Object.entries(t.extra || {}).map(([k, e]) => `, ${e} AS ${k}`).join('');
    const q = await r.query(`
        WITH base AS (
            SELECT ${t.cod} AS codigo, ${t.nome} AS nome ${extras}, COUNT(*) OVER() AS total_geral
            FROM ${t.from}
            WHERE t.competencia = @c ${where}
            ORDER BY 1
            OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY
        )
        SELECT b.*, (SELECT COUNT(*) FROM ${P}tb_procedimento p WHERE p.competencia = @c AND ${VINCULOS[t.vinculo]('b.codigo')}) AS qt_procedimentos
        FROM base b ORDER BY b.codigo`);
    res.json({
        competencia: c, titulo: t.titulo, vinculo: t.vinculo, pagina, tamanho,
        total: q.recordset[0]?.total_geral || 0,
        itens: q.recordset.map(({ total_geral, ...i }) => i)
    });
}));

module.exports = router;
