/* routes/faturamento.js
 * Operações > Lançar Faturamento  +  Painéis > Faturamento Consolidado.
 * Recebe os arquivos de produção (BPA, APAC, AIH) por projeto/unidade/produto/competência,
 * valoriza cada procedimento pela Tabela SIGTAP importada (Parâmetros > SIGTAP) e
 * consolida a evolução mês a mês.
 *  - Lançar / histórico: módulo 'faturamento_lancar' (novo = lançar, editar = excluir/revalorizar).
 *  - Painel: módulo 'painel_faturamento'.
 *  - Isolamento por lotação: usuários sem visão global só veem os próprios projetos. */
const express = require('express');
const multer = require('multer');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const { filtroPorProjeto } = require('../middlewares/lotacao');
const { lerArquivo, TIPOS, compValida } = require('../services/faturamentoLeitor');

const AGORA = `DATEADD(hour, -3, GETUTCDATE())`;
const leitura = [autenticar, autorizarModulo(['faturamento_lancar', 'painel_faturamento'])];
const lancar = [autenticar, autorizarModulo('faturamento_lancar', 'novo')];
const gestao = [autenticar, autorizarModulo('faturamento_lancar', 'editar')];
const painel = [autenticar, autorizarModulo('painel_faturamento')];

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024, files: 1 } });
const receberArquivo = (req, res, next) => upload.single('arquivo')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(httpErro(400, 'Arquivo muito grande (máx. 60 MB).'));
    next(httpErro(400, err.message || 'Falha ao receber o arquivo.'));
});

// ============================================================================ estrutura
let estruturaOk = false;
const DDL = `
IF OBJECT_ID('tab_faturamento_lancamento', 'U') IS NULL
    CREATE TABLE tab_faturamento_lancamento (
        id_lancamento INT IDENTITY(1,1) PRIMARY KEY,
        id_projeto INT NOT NULL,
        id_unidade INT NOT NULL,
        id_produto INT NOT NULL,
        competencia CHAR(6) NOT NULL,
        tipo VARCHAR(4) NOT NULL,               -- BPA | APAC | AIH
        arquivo NVARCHAR(255) NULL,
        competencia_arquivo CHAR(6) NULL,
        cnes_arquivo VARCHAR(7) NULL,
        sigtap_competencia CHAR(6) NULL,        -- tabela usada para valorizar
        qt_registros INT NOT NULL DEFAULT 0,
        qt_pacientes INT NOT NULL DEFAULT 0,
        qt_procedimentos INT NOT NULL DEFAULT 0,
        qt_total INT NOT NULL DEFAULT 0,
        qt_sem_valor INT NOT NULL DEFAULT 0,    -- procedimentos não encontrados na SIGTAP
        vl_total DECIMAL(16,2) NOT NULL DEFAULT 0,
        id_usuario INT NULL,
        usuario NVARCHAR(150) NULL,
        dt_lancamento DATETIME NOT NULL,
        CONSTRAINT UQ_tab_faturamento_lancamento UNIQUE (id_projeto, id_unidade, id_produto, competencia, tipo)
    );
IF OBJECT_ID('tab_faturamento_item', 'U') IS NULL
    CREATE TABLE tab_faturamento_item (
        id_item BIGINT IDENTITY(1,1) PRIMARY KEY,
        id_lancamento INT NOT NULL REFERENCES tab_faturamento_lancamento(id_lancamento) ON DELETE CASCADE,
        origem VARCHAR(6) NOT NULL,             -- BPA-C | BPA-I | APAC | AIH-P (principal) | AIH-S (secundário/especial)
        co_procedimento VARCHAR(10) NOT NULL,
        no_procedimento NVARCHAR(250) NULL,
        co_cbo VARCHAR(6) NOT NULL DEFAULT '',
        quantidade INT NOT NULL,
        vl_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
        vl_total DECIMAL(16,2) NOT NULL DEFAULT 0
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_faturamento_item_lanc')
    CREATE INDEX IX_tab_faturamento_item_lanc ON tab_faturamento_item (id_lancamento) INCLUDE (co_procedimento, co_cbo, quantidade, vl_total);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_faturamento_lancamento_comp')
    CREATE INDEX IX_tab_faturamento_lancamento_comp ON tab_faturamento_lancamento (competencia, id_projeto, id_unidade);
`;
router.use('/faturamento', asyncHandler(async (req, res, next) => {
    if (!estruturaOk) { await (await connectToDb()).request().batch(DDL); estruturaOk = true; }
    next();
}));

// ============================================================================ helpers
/* Produtos que geram produção SUS: tipos de arquivo aceitos e estrutura de atendimento (filtro do painel).
 * BPA (e APAC) para a produção ambulatorial; AIH só para internação (KlinikosNet e SER II Internação).
 * Chave = nome do produto sem acento, minúsculo. Produto fora da lista não lança faturamento. */
const PRODUTOS_FATURAMENTO = {
    'klinikosnet': { tipos: ['BPA', 'APAC', 'AIH'], estrutura: 'hosp' },
    'upa24h': { tipos: ['BPA', 'APAC'], estrutura: 'hosp' },
    'ser ii (internacao)': { tipos: ['AIH'], estrutura: 'hosp' },
    'prime saude': { tipos: ['BPA', 'APAC'], estrutura: 'aps' },
    'prime saude mental': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'prime tea': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (ambulatorio)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (linhas de cuidado)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (tfd)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'trs': { tipos: ['BPA', 'APAC'], estrutura: 'esp' }
};
const chaveProduto = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const regraProduto = (nome) => PRODUTOS_FATURAMENTO[chaveProduto(nome)] || null;
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const idOuNull = (v) => { const n = parseInt(v, 10); return n > 0 ? n : null; };

async function competenciasSigtap(pool) {
    const r = await pool.request().query(`
        SELECT DISTINCT competencia FROM tab_sigtap_importacao
        WHERE situacao = 'CONCLUIDA' AND removida = 0 ORDER BY competencia DESC`).catch(() => ({ recordset: [] }));
    return r.recordset.map(x => x.competencia);
}

/** Tabela SIGTAP usada para valorizar: a da competência; senão a anterior mais próxima; senão a mais antiga. */
async function escolherSigtap(pool, competencia) {
    const lista = await competenciasSigtap(pool);
    if (!lista.length) return null;
    return lista.find(c => c <= competencia) || lista[lista.length - 1];
}

/** Valoriza os itens pela SIGTAP: BPA/APAC = serviço ambulatorial (SA); AIH = hospitalar + profissional (SH + SP).
 *  Na AIH só é pago o procedimento principal; um secundário só vale se a SIGTAP o admite como
 *  "AIH (proc. especial)" ou "AIH (proc. secundário)" - instrumentos 04/05 (ex.: diária de permanência a maior). */
async function valorizar(pool, itens, sigtap) {
    const codigos = [...new Set(itens.map(i => i.co_procedimento))];
    const tabela = new Map();
    if (sigtap && codigos.length) {
        for (let i = 0; i < codigos.length; i += 900) {
            const req = pool.request().input('c', sql.Char(6), sigtap);
            const marcas = codigos.slice(i, i + 900).map((c, j) => { req.input(`p${j}`, sql.VarChar(10), c); return `@p${j}`; });
            const r = await req.query(`SELECT p.co_procedimento, p.no_procedimento, p.vl_sa, p.vl_sh, p.vl_sp,
                    CASE WHEN EXISTS (SELECT 1 FROM tab_sigtap_rl_procedimento_registro g WHERE g.competencia = p.competencia
                        AND g.co_procedimento = p.co_procedimento AND g.co_registro IN ('04', '05')) THEN 1 ELSE 0 END AS aih_secundario
                FROM tab_sigtap_tb_procedimento p WHERE p.competencia = @c AND p.co_procedimento IN (${marcas.join(',')})`);
            r.recordset.forEach(p => tabela.set(p.co_procedimento, p));
        }
    }
    let semValor = 0;
    for (const it of itens) {
        const p = tabela.get(it.co_procedimento);
        if (!p) semValor++;
        const pagoNaAih = it.origem !== 'AIH-S' || (p && p.aih_secundario);
        const unit = !p || !pagoNaAih ? 0 : it.origem.startsWith('AIH') ? Number(p.vl_sh || 0) + Number(p.vl_sp || 0) : Number(p.vl_sa || 0);
        it.no_procedimento = p ? p.no_procedimento : (it.no_procedimento || null);
        it.vl_unitario = Math.round(unit * 100) / 100;
        it.vl_total = Math.round(unit * it.quantidade * 100) / 100;
        it.encontrado = !!p;
    }
    return { semValor, reconhecidos: codigos.filter(c => tabela.has(c)).length, totalCodigos: codigos.length };
}

/** Projeto/unidade/produto do formulário, validando escopo e vínculo da unidade ao projeto. */
async function validarDestino(pool, req) {
    const b = req.body || {};
    const id_projeto = idOuNull(b.id_projeto), id_unidade = idOuNull(b.id_unidade), id_produto = idOuNull(b.id_produto);
    const tipo = String(b.tipo || '').toUpperCase();
    const competencia = soDigitos(b.competencia);
    if (!id_projeto || !id_unidade || !id_produto) throw httpErro(400, 'Selecione projeto, unidade e produto.');
    if (!TIPOS.includes(tipo)) throw httpErro(400, 'Tipo de arquivo inválido (BPA, APAC ou AIH).');
    if (competencia && !compValida(competencia)) throw httpErro(400, 'Competência inválida.');
    const r = pool.request().input('u', sql.Int, id_unidade).input('p', sql.Int, id_projeto).input('d', sql.Int, id_produto);
    const filtro = filtroPorProjeto(r, req.escopo, 'u.id_projeto');
    const q = await r.query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_projeto, pj.nome_projeto,
               (SELECT nome_produto FROM tab_produtos WHERE id_produto = @d) AS nome_produto
        FROM tab_unidades u JOIN tab_projetos pj ON pj.id_projeto = u.id_projeto
        WHERE u.id_unidade = @u AND u.id_projeto = @p ${filtro}`);
    const dest = q.recordset[0];
    if (!dest) throw httpErro(403, 'Unidade não pertence ao projeto ou está fora da sua lotação.');
    if (!dest.nome_produto) throw httpErro(400, 'Produto inválido.');
    // Cada produto aceita só os seus tipos de arquivo (AIH: KlinikosNet e SER II Internação)
    const regra = regraProduto(dest.nome_produto);
    if (!regra) throw httpErro(400, `O produto ${dest.nome_produto} não gera faturamento SUS.`);
    if (!regra.tipos.includes(tipo)) throw httpErro(400, `${tipo} não é lançado no produto ${dest.nome_produto}. Tipos aceitos: ${regra.tipos.join(', ')}.`);
    return { id_projeto, id_unidade, id_produto, tipo, competencia, dest };
}

async function lerUpload(req) {
    if (!req.file) throw httpErro(400, 'Selecione o arquivo de produção.');
    try { return lerArquivo(req.file.buffer, req.file.originalname); }
    catch (e) { throw httpErro(400, e.message); }
}

/** Monta a análise (prévia) do arquivo para o destino escolhido. */
async function analisar(pool, req) {
    const d = await validarDestino(pool, req);
    const arq = await lerUpload(req);
    const avisos = [];
    if (arq.tipo !== d.tipo) throw httpErro(400, `O arquivo enviado é de ${arq.tipo}, mas o tipo selecionado é ${d.tipo}.`);
    const competencia = d.competencia || arq.competencia;
    if (!competencia) throw httpErro(400, 'Informe a competência: o arquivo não traz uma competência válida.');
    if (arq.competencia && d.competencia && arq.competencia !== d.competencia) {
        avisos.push({ nivel: 'alerta', texto: `O arquivo é da competência ${fmtComp(arq.competencia)}, mas foi selecionada ${fmtComp(d.competencia)}.` });
    }
    const cnesUni = soDigitos(d.dest.cnes);
    if (arq.cnes && cnesUni && arq.cnes !== cnesUni.padStart(7, '0')) {
        avisos.push({ nivel: 'alerta', texto: `O CNES do arquivo (${arq.cnes}) é diferente do CNES da unidade ${d.dest.nome_unidade} (${cnesUni}).` });
    }
    const sigtap = await escolherSigtap(pool, competencia);
    if (!sigtap) avisos.push({ nivel: 'erro', texto: 'Nenhuma Tabela SIGTAP importada. Importe em Parâmetros > SIGTAP para valorizar a produção.' });
    else if (sigtap !== competencia) avisos.push({ nivel: 'info', texto: `A SIGTAP ${fmtComp(competencia)} não está importada; valores calculados pela tabela ${fmtComp(sigtap)}.` });
    const val = await valorizar(pool, arq.itens, sigtap);
    if (val.semValor) avisos.push({ nivel: 'info', texto: `${val.semValor} código(s) de procedimento não encontrados na SIGTAP ${fmtComp(sigtap)} (entram com valor zero).` });
    // Layout não reconhecido: a maioria dos códigos não existe na SIGTAP
    if (sigtap && val.totalCodigos >= 3 && val.reconhecidos / val.totalCodigos < 0.6) {
        throw httpErro(400, `Layout do arquivo não reconhecido: só ${val.reconhecidos} de ${val.totalCodigos} códigos existem na SIGTAP. Confira se o arquivo é o exportado do ${d.tipo}.`);
    }
    const ex = await pool.request()
        .input('p', sql.Int, d.id_projeto).input('u', sql.Int, d.id_unidade).input('d', sql.Int, d.id_produto)
        .input('c', sql.Char(6), competencia).input('t', sql.VarChar(4), d.tipo)
        .query(`SELECT id_lancamento, vl_total, usuario, FORMAT(dt_lancamento, 'dd/MM/yyyy HH:mm') AS dt_lancamento
                FROM tab_faturamento_lancamento
                WHERE id_projeto = @p AND id_unidade = @u AND id_produto = @d AND competencia = @c AND tipo = @t`);

    // Agregado por procedimento (para a prévia)
    const porProc = new Map();
    for (const it of arq.itens) {
        const p = porProc.get(it.co_procedimento) || { co_procedimento: it.co_procedimento, no_procedimento: it.no_procedimento, quantidade: 0, vl_unitario: it.vl_unitario, vl_total: 0, encontrado: it.encontrado };
        p.quantidade += it.quantidade; p.vl_total += it.vl_total;
        porProc.set(it.co_procedimento, p);
    }
    const procedimentos = [...porProc.values()].map(p => ({ ...p, vl_total: Math.round(p.vl_total * 100) / 100 }))
        .sort((a, b) => b.vl_total - a.vl_total || b.quantidade - a.quantidade);

    return {
        destino: d, arq, sigtap, avisos, procedimentos,
        resumo: {
            tipo: arq.tipo, arquivo: arq.arquivo, competencia, competencia_arquivo: arq.competencia, cnes_arquivo: arq.cnes,
            origem: arq.origem, sigtap_competencia: sigtap,
            unidade: d.dest.nome_unidade, cnes_unidade: d.dest.cnes, projeto: d.dest.nome_projeto, produto: d.dest.nome_produto,
            qt_registros: arq.registros, qt_pacientes: arq.pacientes, qt_procedimentos: porProc.size,
            qt_total: arq.itens.reduce((s, i) => s + i.quantidade, 0),
            vl_total: Math.round(arq.itens.reduce((s, i) => s + i.vl_total, 0) * 100) / 100,
            qt_sem_valor: val.semValor,
            por_origem: ['BPA-C', 'BPA-I', 'APAC', 'AIH-P', 'AIH-S'].map(o => ({
                origem: o,
                quantidade: arq.itens.filter(i => i.origem === o).reduce((s, i) => s + i.quantidade, 0),
                vl_total: Math.round(arq.itens.filter(i => i.origem === o).reduce((s, i) => s + i.vl_total, 0) * 100) / 100
            })).filter(o => o.quantidade > 0)
        },
        existente: ex.recordset[0] || null
    };
}

function fmtComp(c) { return /^\d{6}$/.test(c || '') ? `${c.slice(4)}/${c.slice(0, 4)}` : '-'; }

async function nomeUsuario(pool, req) {
    const u = await pool.request().input('id', sql.Int, req.usuario?.id_usuario || 0)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return u.recordset[0]?.nome_completo || req.usuario?.usuario || 'Sistema';
}

async function gravarItens(tx, idLanc, itens) {
    const tabela = new sql.Table('tab_faturamento_item');
    tabela.create = false;
    tabela.columns.add('id_lancamento', sql.Int, { nullable: false });
    tabela.columns.add('origem', sql.VarChar(6), { nullable: false });
    tabela.columns.add('co_procedimento', sql.VarChar(10), { nullable: false });
    tabela.columns.add('no_procedimento', sql.NVarChar(250), { nullable: true });
    tabela.columns.add('co_cbo', sql.VarChar(6), { nullable: false });
    tabela.columns.add('quantidade', sql.Int, { nullable: false });
    tabela.columns.add('vl_unitario', sql.Decimal(14, 2), { nullable: false });
    tabela.columns.add('vl_total', sql.Decimal(16, 2), { nullable: false });
    itens.forEach(i => tabela.rows.add(idLanc, i.origem, i.co_procedimento, i.no_procedimento ? String(i.no_procedimento).slice(0, 250) : null,
        i.co_cbo || '', i.quantidade, i.vl_unitario || 0, i.vl_total || 0));
    await new sql.Request(tx).bulk(tabela);
}

// ============================================================================ LANÇAMENTO
/** Cadastros para os filtros: projetos, unidades e produtos (respeitando a lotação). */
router.get('/faturamento/opcoes', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const rp = pool.request();
    const fp = filtroPorProjeto(rp, req.escopo, 'id_projeto');
    const projetos = (await rp.query(`SELECT id_projeto, nome_projeto, ativo FROM tab_projetos WHERE 1=1 ${fp} ORDER BY ativo DESC, nome_projeto`)).recordset;
    const ru = pool.request();
    const fu = filtroPorProjeto(ru, req.escopo, 'u.id_projeto');
    const unidades = (await ru.query(`SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_projeto, u.ativo,
            (SELECT STRING_AGG(CAST(up.id_produto AS VARCHAR(10)), ',') FROM tab_unidade_produtos up WHERE up.id_unidade = u.id_unidade) AS produtos
        FROM tab_unidades u WHERE 1=1 ${fu} ORDER BY u.nome_unidade`)).recordset
        .map(u => ({ ...u, produtos: u.produtos ? u.produtos.split(',').map(Number) : [] }));
    // Só os produtos que geram faturamento, com os tipos de arquivo aceitos e a estrutura
    const produtos = (await pool.request().query('SELECT id_produto, nome_produto FROM tab_produtos WHERE ativo = 1 ORDER BY nome_produto')).recordset
        .map(p => ({ ...p, ...regraProduto(p.nome_produto) })).filter(p => p.tipos);
    res.json({ projetos, unidades, produtos, sigtap: await competenciasSigtap(pool) });
}));

/** Prévia: lê e valoriza o arquivo sem gravar. */
router.post('/faturamento/analisar', ...lancar, receberArquivo, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const a = await analisar(pool, req);
    res.json({ resumo: a.resumo, avisos: a.avisos, existente: a.existente, procedimentos: a.procedimentos.slice(0, 300) });
}));

/** Grava o lançamento. Se já existir para o mesmo destino/competência/tipo, só substitui com substituir=1. */
router.post('/faturamento/lancamentos', ...lancar, receberArquivo, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const a = await analisar(pool, req);
    if (!a.sigtap) throw httpErro(400, 'Importe a Tabela SIGTAP (Parâmetros > SIGTAP) antes de lançar o faturamento.');
    const substituir = String(req.body.substituir || '') === '1';
    if (a.existente && !substituir) {
        return res.status(409).json({ erro: 'Já existe lançamento para esta unidade, produto, competência e tipo.', existente: a.existente });
    }
    const r = a.resumo;
    const usuario = await nomeUsuario(pool, req);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        if (a.existente) {
            await new sql.Request(tx).input('id', sql.Int, a.existente.id_lancamento)
                .query('DELETE FROM tab_faturamento_lancamento WHERE id_lancamento = @id');
        }
        const ins = await new sql.Request(tx)
            .input('p', sql.Int, a.destino.id_projeto).input('u', sql.Int, a.destino.id_unidade).input('d', sql.Int, a.destino.id_produto)
            .input('c', sql.Char(6), r.competencia).input('t', sql.VarChar(4), r.tipo)
            .input('arq', sql.NVarChar(255), String(r.arquivo || '').slice(0, 255))
            .input('ca', sql.Char(6), r.competencia_arquivo || null).input('cn', sql.VarChar(7), r.cnes_arquivo || null)
            .input('sg', sql.Char(6), r.sigtap_competencia)
            .input('qr', sql.Int, r.qt_registros).input('qp', sql.Int, r.qt_pacientes).input('qd', sql.Int, r.qt_procedimentos)
            .input('qt', sql.Int, r.qt_total).input('qs', sql.Int, r.qt_sem_valor).input('vl', sql.Decimal(16, 2), r.vl_total)
            .input('iu', sql.Int, req.usuario?.id_usuario || null).input('us', sql.NVarChar(150), usuario.slice(0, 150))
            .query(`INSERT INTO tab_faturamento_lancamento (id_projeto, id_unidade, id_produto, competencia, tipo, arquivo,
                        competencia_arquivo, cnes_arquivo, sigtap_competencia, qt_registros, qt_pacientes, qt_procedimentos,
                        qt_total, qt_sem_valor, vl_total, id_usuario, usuario, dt_lancamento)
                    OUTPUT INSERTED.id_lancamento
                    VALUES (@p, @u, @d, @c, @t, @arq, @ca, @cn, @sg, @qr, @qp, @qd, @qt, @qs, @vl, @iu, @us, ${AGORA})`);
        const id = ins.recordset[0].id_lancamento;
        await gravarItens(tx, id, a.arq.itens);
        await tx.commit();
        res.status(201).json({ id_lancamento: id, mensagem: a.existente ? 'Lançamento substituído.' : 'Faturamento lançado.', resumo: r });
    } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
    }
}));

/** Histórico de lançamentos. */
router.get('/faturamento/lancamentos', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const q = req.query;
    const r = pool.request();
    let where = filtroPorProjeto(r, req.escopo, 'l.id_projeto');
    if (idOuNull(q.projeto)) { where += ' AND l.id_projeto = @pj'; r.input('pj', sql.Int, idOuNull(q.projeto)); }
    if (idOuNull(q.unidade)) { where += ' AND l.id_unidade = @un'; r.input('un', sql.Int, idOuNull(q.unidade)); }
    if (idOuNull(q.produto)) { where += ' AND l.id_produto = @pd'; r.input('pd', sql.Int, idOuNull(q.produto)); }
    if (TIPOS.includes(String(q.tipo || '').toUpperCase())) { where += ' AND l.tipo = @tp'; r.input('tp', sql.VarChar(4), String(q.tipo).toUpperCase()); }
    if (compValida(soDigitos(q.competencia))) { where += ' AND l.competencia = @cp'; r.input('cp', sql.Char(6), soDigitos(q.competencia)); }
    const pagina = Math.max(1, parseInt(q.pagina, 10) || 1);
    const tamanho = Math.min(100, Math.max(5, parseInt(q.tamanho, 10) || 15));
    r.input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    const dados = await r.query(`
        SELECT l.id_lancamento, l.id_projeto, l.id_unidade, l.id_produto, l.competencia, l.tipo, l.arquivo, l.competencia_arquivo,
               l.cnes_arquivo, l.sigtap_competencia, l.qt_registros, l.qt_pacientes, l.qt_procedimentos, l.qt_total, l.qt_sem_valor,
               l.vl_total, l.usuario, FORMAT(l.dt_lancamento, 'dd/MM/yyyy HH:mm') AS dt_lancamento,
               pj.nome_projeto, u.nome_unidade, u.cnes, pd.nome_produto, COUNT(*) OVER () AS total
        FROM tab_faturamento_lancamento l
        JOIN tab_projetos pj ON pj.id_projeto = l.id_projeto
        JOIN tab_unidades u ON u.id_unidade = l.id_unidade
        JOIN tab_produtos pd ON pd.id_produto = l.id_produto
        WHERE 1=1 ${where}
        ORDER BY l.competencia DESC, u.nome_unidade, l.tipo
        OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY`);
    const itens = dados.recordset;
    res.json({ itens, total: itens[0]?.total || 0, pagina, tamanho });
}));

async function carregarLancamento(pool, req) {
    const id = idOuNull(req.params.id);
    if (!id) throw httpErro(400, 'Lançamento inválido.');
    const r = pool.request().input('id', sql.Int, id);
    const f = filtroPorProjeto(r, req.escopo, 'l.id_projeto');
    const l = (await r.query(`SELECT l.* FROM tab_faturamento_lancamento l WHERE l.id_lancamento = @id ${f}`)).recordset[0];
    if (!l) throw httpErro(404, 'Lançamento não encontrado.');
    return l;
}

router.get('/faturamento/lancamentos/:id', ...leitura, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await carregarLancamento(pool, req);
    const itens = await pool.request().input('id', sql.Int, l.id_lancamento).query(`
        SELECT co_procedimento, MAX(no_procedimento) AS no_procedimento, SUM(quantidade) AS quantidade,
               MAX(vl_unitario) AS vl_unitario, SUM(vl_total) AS vl_total
        FROM tab_faturamento_item WHERE id_lancamento = @id
        GROUP BY co_procedimento ORDER BY SUM(vl_total) DESC, SUM(quantidade) DESC`);
    res.json({ ...l, procedimentos: itens.recordset });
}));

router.delete('/faturamento/lancamentos/:id', ...gestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await carregarLancamento(pool, req);
    await pool.request().input('id', sql.Int, l.id_lancamento).query('DELETE FROM tab_faturamento_lancamento WHERE id_lancamento = @id');
    res.json({ mensagem: 'Lançamento excluído.' });
}));

/** Recalcula os valores com a melhor SIGTAP disponível agora (ex.: a competência foi importada depois). */
router.post('/faturamento/lancamentos/:id/revalorizar', ...gestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const l = await carregarLancamento(pool, req);
    const sigtap = await escolherSigtap(pool, l.competencia);
    if (!sigtap) throw httpErro(400, 'Nenhuma Tabela SIGTAP importada.');
    const itens = (await pool.request().input('id', sql.Int, l.id_lancamento)
        .query('SELECT origem, co_procedimento, no_procedimento, co_cbo, quantidade FROM tab_faturamento_item WHERE id_lancamento = @id')).recordset;
    const val = await valorizar(pool, itens, sigtap);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        await new sql.Request(tx).input('id', sql.Int, l.id_lancamento).query('DELETE FROM tab_faturamento_item WHERE id_lancamento = @id');
        await gravarItens(tx, l.id_lancamento, itens);
        const total = Math.round(itens.reduce((s, i) => s + i.vl_total, 0) * 100) / 100;
        await new sql.Request(tx).input('id', sql.Int, l.id_lancamento).input('sg', sql.Char(6), sigtap)
            .input('vl', sql.Decimal(16, 2), total).input('qs', sql.Int, val.semValor)
            .query('UPDATE tab_faturamento_lancamento SET sigtap_competencia = @sg, vl_total = @vl, qt_sem_valor = @qs WHERE id_lancamento = @id');
        await tx.commit();
        res.json({ mensagem: `Valores recalculados pela SIGTAP ${fmtComp(sigtap)}.`, vl_anterior: Number(l.vl_total), vl_total: total, sigtap_competencia: sigtap });
    } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
    }
}));

// ============================================================================ PAINEL
/** Dados do Faturamento Consolidado: série mensal, procedimento × competência, unidade × competência e CBO. */
router.get('/faturamento/painel', ...painel, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const q = req.query;
    const filtros = (r) => {
        let w = filtroPorProjeto(r, req.escopo, 'l.id_projeto');
        if (idOuNull(q.projeto)) { w += ' AND l.id_projeto = @pj'; r.input('pj', sql.Int, idOuNull(q.projeto)); }
        if (idOuNull(q.unidade)) { w += ' AND l.id_unidade = @un'; r.input('un', sql.Int, idOuNull(q.unidade)); }
        if (idOuNull(q.produto)) { w += ' AND l.id_produto = @pd'; r.input('pd', sql.Int, idOuNull(q.produto)); }
        else if (q.produtos) {
            // Estrutura (ex.: Hospitalar = KlinikosNet + UPA24H): lista de produtos
            const ids = String(q.produtos).split(',').map(idOuNull).filter(Boolean).slice(0, 50);
            w += ids.length ? ` AND l.id_produto IN (${ids.map((id, i) => { r.input(`pl${i}`, sql.Int, id); return `@pl${i}`; }).join(',')})` : ' AND 1=0';
        }
        if (TIPOS.includes(String(q.tipo || '').toUpperCase())) { w += ' AND l.tipo = @tp'; r.input('tp', sql.VarChar(4), String(q.tipo).toUpperCase()); }
        if (compValida(soDigitos(q.de))) { w += ' AND l.competencia >= @de'; r.input('de', sql.Char(6), soDigitos(q.de)); }
        if (compValida(soDigitos(q.ate))) { w += ' AND l.competencia <= @ate'; r.input('ate', sql.Char(6), soDigitos(q.ate)); }
        return w;
    };
    const consulta = async (montar) => { const r = pool.request(); return (await r.query(montar(filtros(r)))).recordset; };

    // Competências disponíveis no recorte (sem o filtro de período) para montar o seletor
    const compsTodas = await (async () => {
        const r = pool.request();
        let w = filtroPorProjeto(r, req.escopo, 'l.id_projeto');
        if (idOuNull(q.projeto)) { w += ' AND l.id_projeto = @pj'; r.input('pj', sql.Int, idOuNull(q.projeto)); }
        if (idOuNull(q.unidade)) { w += ' AND l.id_unidade = @un'; r.input('un', sql.Int, idOuNull(q.unidade)); }
        return (await r.query(`SELECT DISTINCT l.competencia FROM tab_faturamento_lancamento l WHERE 1=1 ${w} ORDER BY l.competencia`)).recordset.map(x => x.competencia);
    })();

    const [mensal, procs, unidades, cbos] = await Promise.all([
        consulta(w => `SELECT l.competencia, SUM(l.vl_total) AS vl_total, SUM(l.qt_total) AS qt_total, SUM(l.qt_pacientes) AS qt_pacientes,
                              SUM(CASE WHEN l.tipo = 'AIH' THEN l.qt_registros ELSE 0 END) AS qt_aih,
                              COUNT(*) AS qt_lancamentos, COUNT(DISTINCT l.id_unidade) AS qt_unidades
                       FROM tab_faturamento_lancamento l WHERE 1=1 ${w} GROUP BY l.competencia ORDER BY l.competencia`),
        consulta(w => `SELECT i.co_procedimento, l.competencia, SUM(i.quantidade) AS qt, SUM(i.vl_total) AS vl, MAX(i.no_procedimento) AS no_procedimento
                       FROM tab_faturamento_item i JOIN tab_faturamento_lancamento l ON l.id_lancamento = i.id_lancamento
                       WHERE 1=1 ${w} GROUP BY i.co_procedimento, l.competencia`),
        consulta(w => `SELECT l.id_unidade, u.nome_unidade, pj.nome_projeto, l.competencia, SUM(l.vl_total) AS vl, SUM(l.qt_total) AS qt
                       FROM tab_faturamento_lancamento l JOIN tab_unidades u ON u.id_unidade = l.id_unidade
                       JOIN tab_projetos pj ON pj.id_projeto = l.id_projeto
                       WHERE 1=1 ${w} GROUP BY l.id_unidade, u.nome_unidade, pj.nome_projeto, l.competencia`),
        consulta(w => `SELECT i.co_cbo, l.competencia, SUM(i.quantidade) AS qt, SUM(i.vl_total) AS vl
                       FROM tab_faturamento_item i JOIN tab_faturamento_lancamento l ON l.id_lancamento = i.id_lancamento
                       WHERE i.co_cbo <> '' ${w} GROUP BY i.co_cbo, l.competencia`)
    ]);

    // Nomes de subgrupos e CBOs pela SIGTAP mais recente
    const sig = (await competenciasSigtap(pool))[0];
    let subgrupos = {}, ocupacoes = {};
    if (sig) {
        const sg = await pool.request().input('c', sql.Char(6), sig)
            .query('SELECT co_grupo + co_sub_grupo AS cod, no_sub_grupo FROM tab_sigtap_tb_sub_grupo WHERE competencia = @c');
        sg.recordset.forEach(x => { subgrupos[x.cod] = x.no_sub_grupo; });
        const codCbo = [...new Set(cbos.map(c => c.co_cbo))];
        if (codCbo.length) {
            const rc = pool.request().input('c', sql.Char(6), sig);
            const marcas = codCbo.slice(0, 900).map((c, j) => { rc.input(`o${j}`, sql.VarChar(6), c); return `@o${j}`; });
            (await rc.query(`SELECT co_ocupacao, no_ocupacao FROM tab_sigtap_tb_ocupacao WHERE competencia = @c AND co_ocupacao IN (${marcas.join(',')})`))
                .recordset.forEach(x => { ocupacoes[x.co_ocupacao] = x.no_ocupacao; });
        }
    }
    const num = (v) => Number(v) || 0;
    res.json({
        competencias_disponiveis: compsTodas,
        mensal: mensal.map(m => ({ ...m, vl_total: num(m.vl_total) })),
        procedimentos: procs.map(p => ({ ...p, vl: num(p.vl) })),
        unidades: unidades.map(u => ({ ...u, vl: num(u.vl) })),
        cbos: cbos.map(c => ({ ...c, vl: num(c.vl) })),
        subgrupos, ocupacoes
    });
}));

module.exports = router;
