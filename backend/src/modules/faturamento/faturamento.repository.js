/* Faturamento SUS: todo o SQL do módulo (estrutura, lançamentos, itens, SIGTAP e painel consolidado). */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');

const AGORA = `DATEADD(hour, -3, GETUTCDATE())`;
const TAMANHO_LOTE_CODIGOS = 900;
const MAX_CBOS_NOMEADOS = 900;

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

/** Cria as tabelas na primeira chamada do processo. */
async function garantirEstrutura() {
    if (estruturaOk) return;
    await (await connectToDb()).request().batch(DDL);
    estruturaOk = true;
}

// ============================================================================ SIGTAP
async function listarCompetenciasSigtap(pool) {
    const r = await pool.request().query(`
        SELECT DISTINCT competencia FROM tab_sigtap_importacao
        WHERE situacao = 'CONCLUIDA' AND removida = 0 ORDER BY competencia DESC`).catch(() => ({ recordset: [] }));
    return r.recordset.map(x => x.competencia);
}

/** Procedimentos da SIGTAP indexados por código, lidos em lotes. */
async function buscarProcedimentosSigtap(pool, sigtap, codigos) {
    const tabela = new Map();
    for (let i = 0; i < codigos.length; i += TAMANHO_LOTE_CODIGOS) {
        const req = pool.request().input('c', sql.Char(6), sigtap);
        const marcas = codigos.slice(i, i + TAMANHO_LOTE_CODIGOS).map((c, j) => { req.input(`p${j}`, sql.VarChar(10), c); return `@p${j}`; });
        const r = await req.query(`SELECT p.co_procedimento, p.no_procedimento, p.vl_sa, p.vl_sh, p.vl_sp,
                    CASE WHEN EXISTS (SELECT 1 FROM tab_sigtap_rl_procedimento_registro g WHERE g.competencia = p.competencia
                        AND g.co_procedimento = p.co_procedimento AND g.co_registro IN ('04', '05')) THEN 1 ELSE 0 END AS aih_secundario
                FROM tab_sigtap_tb_procedimento p WHERE p.competencia = @c AND p.co_procedimento IN (${marcas.join(',')})`);
        r.recordset.forEach(p => tabela.set(p.co_procedimento, p));
    }
    return tabela;
}

async function buscarSubgruposSigtap(pool, sigtap) {
    const sg = await pool.request().input('c', sql.Char(6), sigtap)
        .query('SELECT co_grupo + co_sub_grupo AS cod, no_sub_grupo FROM tab_sigtap_tb_sub_grupo WHERE competencia = @c');
    return sg.recordset;
}

async function buscarOcupacoesSigtap(pool, sigtap, codigosCbo) {
    const rc = pool.request().input('c', sql.Char(6), sigtap);
    const marcas = codigosCbo.slice(0, MAX_CBOS_NOMEADOS).map((c, j) => { rc.input(`o${j}`, sql.VarChar(6), c); return `@o${j}`; });
    return (await rc.query(`SELECT co_ocupacao, no_ocupacao FROM tab_sigtap_tb_ocupacao WHERE competencia = @c AND co_ocupacao IN (${marcas.join(',')})`)).recordset;
}

// ============================================================================ cadastros
async function listarProjetos(pool, escopo) {
    const rp = pool.request();
    const fp = filtroPorProjeto(rp, escopo, 'id_projeto');
    return (await rp.query(`SELECT id_projeto, nome_projeto, ativo FROM tab_projetos WHERE 1=1 ${fp} ORDER BY ativo DESC, nome_projeto`)).recordset;
}

async function listarUnidades(pool, escopo) {
    const ru = pool.request();
    const fu = filtroPorProjeto(ru, escopo, 'u.id_projeto');
    return (await ru.query(`SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_projeto, u.ativo,
            (SELECT STRING_AGG(CAST(up.id_produto AS VARCHAR(10)), ',') FROM tab_unidade_produtos up WHERE up.id_unidade = u.id_unidade) AS produtos
        FROM tab_unidades u WHERE 1=1 ${fu} ORDER BY u.nome_unidade`)).recordset;
}

async function listarProdutosAtivos(pool) {
    return (await pool.request().query('SELECT id_produto, nome_produto FROM tab_produtos WHERE ativo = 1 ORDER BY nome_produto')).recordset;
}

/** Unidade do projeto dentro da lotação do usuário, com o nome do produto escolhido. */
async function buscarDestino(pool, escopo, { idProjeto, idUnidade, idProduto }) {
    const r = pool.request().input('u', sql.Int, idUnidade).input('p', sql.Int, idProjeto).input('d', sql.Int, idProduto);
    const filtro = filtroPorProjeto(r, escopo, 'u.id_projeto');
    const q = await r.query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_projeto, pj.nome_projeto,
               (SELECT nome_produto FROM tab_produtos WHERE id_produto = @d) AS nome_produto
        FROM tab_unidades u JOIN tab_projetos pj ON pj.id_projeto = u.id_projeto
        WHERE u.id_unidade = @u AND u.id_projeto = @p ${filtro}`);
    return q.recordset[0];
}

async function buscarNomeDoUsuario(pool, idUsuario) {
    const u = await pool.request().input('id', sql.Int, idUsuario)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return u.recordset[0]?.nome_completo;
}

// ============================================================================ lançamentos
async function buscarLancamentoExistente(pool, d, competencia) {
    const ex = await pool.request()
        .input('p', sql.Int, d.id_projeto).input('u', sql.Int, d.id_unidade).input('d', sql.Int, d.id_produto)
        .input('c', sql.Char(6), competencia).input('t', sql.VarChar(4), d.tipo)
        .query(`SELECT id_lancamento, vl_total, usuario, FORMAT(dt_lancamento, 'dd/MM/yyyy HH:mm') AS dt_lancamento
                FROM tab_faturamento_lancamento
                WHERE id_projeto = @p AND id_unidade = @u AND id_produto = @d AND competencia = @c AND tipo = @t`);
    return ex.recordset[0] || null;
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

/** Executa `corpo(tx)` numa transação: confirma no fim e desfaz se qualquer passo falhar. */
async function emTransacao(pool, corpo) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const resultado = await corpo(tx);
        await tx.commit();
        return resultado;
    } catch (e) {
        await tx.rollback().catch(() => {});
        throw e;
    }
}

async function inserirLancamento(tx, { destino, resumo, idUsuario, usuario }) {
    const r = resumo;
    const ins = await new sql.Request(tx)
        .input('p', sql.Int, destino.id_projeto).input('u', sql.Int, destino.id_unidade).input('d', sql.Int, destino.id_produto)
        .input('c', sql.Char(6), r.competencia).input('t', sql.VarChar(4), r.tipo)
        .input('arq', sql.NVarChar(255), String(r.arquivo || '').slice(0, 255))
        .input('ca', sql.Char(6), r.competencia_arquivo || null).input('cn', sql.VarChar(7), r.cnes_arquivo || null)
        .input('sg', sql.Char(6), r.sigtap_competencia)
        .input('qr', sql.Int, r.qt_registros).input('qp', sql.Int, r.qt_pacientes).input('qd', sql.Int, r.qt_procedimentos)
        .input('qt', sql.Int, r.qt_total).input('qs', sql.Int, r.qt_sem_valor).input('vl', sql.Decimal(16, 2), r.vl_total)
        .input('iu', sql.Int, idUsuario).input('us', sql.NVarChar(150), usuario.slice(0, 150))
        .query(`INSERT INTO tab_faturamento_lancamento (id_projeto, id_unidade, id_produto, competencia, tipo, arquivo,
                        competencia_arquivo, cnes_arquivo, sigtap_competencia, qt_registros, qt_pacientes, qt_procedimentos,
                        qt_total, qt_sem_valor, vl_total, id_usuario, usuario, dt_lancamento)
                    OUTPUT INSERTED.id_lancamento
                    VALUES (@p, @u, @d, @c, @t, @arq, @ca, @cn, @sg, @qr, @qp, @qd, @qt, @qs, @vl, @iu, @us, ${AGORA})`);
    return ins.recordset[0].id_lancamento;
}

/** Grava o lançamento com os itens; se `existente`, apaga o anterior antes. Devolve o id novo. */
function gravarLancamento(pool, { existente, destino, resumo, itens, idUsuario, usuario }) {
    return emTransacao(pool, async (tx) => {
        if (existente) {
            await new sql.Request(tx).input('id', sql.Int, existente.id_lancamento)
                .query('DELETE FROM tab_faturamento_lancamento WHERE id_lancamento = @id');
        }
        const id = await inserirLancamento(tx, { destino, resumo, idUsuario, usuario });
        await gravarItens(tx, id, itens);
        return id;
    });
}

/** `filtros`: ids/tipo/competência já normalizados (ou null) e a paginação. */
async function listarLancamentos(pool, escopo, filtros) {
    const r = pool.request();
    let where = filtroPorProjeto(r, escopo, 'l.id_projeto');
    if (filtros.projeto) { where += ' AND l.id_projeto = @pj'; r.input('pj', sql.Int, filtros.projeto); }
    if (filtros.unidade) { where += ' AND l.id_unidade = @un'; r.input('un', sql.Int, filtros.unidade); }
    if (filtros.produto) { where += ' AND l.id_produto = @pd'; r.input('pd', sql.Int, filtros.produto); }
    if (filtros.tipo) { where += ' AND l.tipo = @tp'; r.input('tp', sql.VarChar(4), filtros.tipo); }
    if (filtros.competencia) { where += ' AND l.competencia = @cp'; r.input('cp', sql.Char(6), filtros.competencia); }
    r.input('off', sql.Int, (filtros.pagina - 1) * filtros.tamanho).input('tam', sql.Int, filtros.tamanho);
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
    return dados.recordset;
}

async function buscarLancamento(pool, escopo, id) {
    const r = pool.request().input('id', sql.Int, id);
    const f = filtroPorProjeto(r, escopo, 'l.id_projeto');
    return (await r.query(`SELECT l.* FROM tab_faturamento_lancamento l WHERE l.id_lancamento = @id ${f}`)).recordset[0];
}

async function agruparProcedimentosDoLancamento(pool, idLancamento) {
    const itens = await pool.request().input('id', sql.Int, idLancamento).query(`
        SELECT co_procedimento, MAX(no_procedimento) AS no_procedimento, SUM(quantidade) AS quantidade,
               MAX(vl_unitario) AS vl_unitario, SUM(vl_total) AS vl_total
        FROM tab_faturamento_item WHERE id_lancamento = @id
        GROUP BY co_procedimento ORDER BY SUM(vl_total) DESC, SUM(quantidade) DESC`);
    return itens.recordset;
}

async function excluirLancamento(pool, idLancamento) {
    await pool.request().input('id', sql.Int, idLancamento).query('DELETE FROM tab_faturamento_lancamento WHERE id_lancamento = @id');
}

async function listarItensDoLancamento(pool, idLancamento) {
    return (await pool.request().input('id', sql.Int, idLancamento)
        .query('SELECT origem, co_procedimento, no_procedimento, co_cbo, quantidade FROM tab_faturamento_item WHERE id_lancamento = @id')).recordset;
}

/** Troca os itens do lançamento pelos revalorizados e atualiza os totais. */
function regravarItens(pool, idLancamento, itens, { sigtap, total, semValor }) {
    return emTransacao(pool, async (tx) => {
        await new sql.Request(tx).input('id', sql.Int, idLancamento).query('DELETE FROM tab_faturamento_item WHERE id_lancamento = @id');
        await gravarItens(tx, idLancamento, itens);
        await new sql.Request(tx).input('id', sql.Int, idLancamento).input('sg', sql.Char(6), sigtap)
            .input('vl', sql.Decimal(16, 2), total).input('qs', sql.Int, semValor)
            .query('UPDATE tab_faturamento_lancamento SET sigtap_competencia = @sg, vl_total = @vl, qt_sem_valor = @qs WHERE id_lancamento = @id');
    });
}

// ============================================================================ painel
/** Filtros de recorte (projeto/unidade) comuns à lista de competências e às consultas do painel. */
function filtrarRecorte(r, escopo, f) {
    let w = filtroPorProjeto(r, escopo, 'l.id_projeto');
    if (f.projeto) { w += ' AND l.id_projeto = @pj'; r.input('pj', sql.Int, f.projeto); }
    if (f.unidade) { w += ' AND l.id_unidade = @un'; r.input('un', sql.Int, f.unidade); }
    return w;
}

function filtrarProdutos(r, f) {
    if (f.produto) { r.input('pd', sql.Int, f.produto); return ' AND l.id_produto = @pd'; }
    if (!f.produtos) return '';
    // Estrutura (ex.: Hospitalar = KlinikosNet + UPA24H): lista de produtos
    return f.produtos.length ? ` AND l.id_produto IN (${f.produtos.map((id, i) => { r.input(`pl${i}`, sql.Int, id); return `@pl${i}`; }).join(',')})` : ' AND 1=0';
}

/** Recorte completo do painel: lotação, projeto, unidade, produtos, tipo e período. */
function filtrarPainel(r, escopo, f) {
    let w = filtrarRecorte(r, escopo, f);
    w += filtrarProdutos(r, f);
    if (f.tipo) { w += ' AND l.tipo = @tp'; r.input('tp', sql.VarChar(4), f.tipo); }
    if (f.de) { w += ' AND l.competencia >= @de'; r.input('de', sql.Char(6), f.de); }
    if (f.ate) { w += ' AND l.competencia <= @ate'; r.input('ate', sql.Char(6), f.ate); }
    return w;
}

/** Competências disponíveis no recorte (sem o filtro de período) para montar o seletor. */
async function listarCompetenciasDisponiveis(pool, escopo, f) {
    const r = pool.request();
    const w = filtrarRecorte(r, escopo, f);
    return (await r.query(`SELECT DISTINCT l.competencia FROM tab_faturamento_lancamento l WHERE 1=1 ${w} ORDER BY l.competencia`)).recordset.map(x => x.competencia);
}

/** Série mensal, procedimento × competência, unidade × competência e CBO (as quatro consultas saem em paralelo). */
async function consultarPainel(pool, escopo, f) {
    const consulta = async (montar) => { const r = pool.request(); return (await r.query(montar(filtrarPainel(r, escopo, f)))).recordset; };
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
    return { mensal, procs, unidades, cbos };
}

module.exports = {
    garantirEstrutura, listarCompetenciasSigtap, buscarProcedimentosSigtap, buscarSubgruposSigtap, buscarOcupacoesSigtap,
    listarProjetos, listarUnidades, listarProdutosAtivos, buscarDestino, buscarNomeDoUsuario,
    buscarLancamentoExistente, gravarLancamento, listarLancamentos, buscarLancamento, agruparProcedimentosDoLancamento,
    excluirLancamento, listarItensDoLancamento, regravarItens, listarCompetenciasDisponiveis, consultarPainel
};
