/* SQL do SIGTAP: competências, histórico de importações e consultas ao catálogo. A ficha completa fica em
 * sigtap.ficha.repository.js. */
const { connectToDb, sql } = require('../../config/database');
const { P, limpar, soDigitos, filtroTexto, VINCULOS, REFERENCIAS } = require('./sigtap.filtros');

const IMPORTACAO_COLS = `id_importacao, arquivo, competencia, situacao, usuario, removida, mensagem,
    qt_procedimentos, qt_novos, qt_compatibilidades, qt_registros,
    FORMAT(dt_inicio, 'dd/MM/yyyy HH:mm:ss') AS inicio, FORMAT(dt_fim, 'dd/MM/yyyy HH:mm:ss') AS fim,
    DATEDIFF(second, dt_inicio, ISNULL(dt_fim, DATEADD(hour, -3, GETUTCDATE()))) AS duracao_seg`;

const SITUACOES = ['PROCESSANDO', 'CONCLUIDA', 'ERRO'];

const ORDENS = {
    codigo: 'p.co_procedimento', nome: 'p.no_procedimento, p.co_procedimento',
    valor_amb: 'p.vl_sa DESC, p.co_procedimento', valor_hosp: '(p.vl_sh + p.vl_sp) DESC, p.co_procedimento'
};

// ============================================================================ competências
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

async function listarCompetencias() {
    return competenciasDisponiveis(await connectToDb());
}

/** Competência pedida (se disponível) ou a mais recente. null = nenhuma importada. */
async function resolverCompetencia(pedida) {
    const lista = await competenciasDisponiveis(await connectToDb());
    if (!lista.length) return null;
    const c = soDigitos(pedida);
    return lista.some(x => x.competencia === c) ? c : lista[0].competencia;
}

// ============================================================================ importações
async function dadosDoResumo() {
    const pool = await connectToDb();
    const [competencias, ultima, andamento] = await Promise.all([
        competenciasDisponiveis(pool),
        pool.request().query(`SELECT TOP 1 ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE situacao = 'CONCLUIDA' ORDER BY dt_fim DESC, id_importacao DESC`),
        pool.request().query(`SELECT TOP 1 ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE situacao = 'PROCESSANDO' ORDER BY id_importacao DESC`)
    ]);
    return { competencias, ultima: ultima.recordset[0], andamento: andamento.recordset[0] };
}

/** Página do histórico; filtros opcionais por competência (prefixo) e situação. */
async function listarImportacoes({ pagina, tamanho, competencia, situacao }) {
    const pool = await connectToDb();
    const r = pool.request().input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    let where = 'WHERE 1 = 1';
    const comp = soDigitos(competencia).slice(0, 6);
    if (comp) { r.input('c', sql.VarChar(7), `${comp}%`); where += ' AND competencia LIKE @c'; }
    if (SITUACOES.includes(situacao)) { r.input('s', sql.VarChar(12), situacao); where += ' AND situacao = @s'; }
    const q = await r.query(`
        SELECT ${IMPORTACAO_COLS}, COUNT(*) OVER() AS total_geral
        FROM tab_sigtap_importacao ${where}
        ORDER BY id_importacao DESC
        OFFSET @off ROWS FETCH NEXT @tam ROWS ONLY`);
    return q.recordset;
}

async function buscarImportacao(id) {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, id)
        .query(`SELECT ${IMPORTACAO_COLS} FROM tab_sigtap_importacao WHERE id_importacao = @id`);
    return r.recordset[0];
}

async function nomeCompletoDoUsuario(idUsuario) {
    const pool = await connectToDb();
    const u = await pool.request().input('id', sql.Int, idUsuario)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return u.recordset[0]?.nome_completo;
}

// ============================================================================ consulta
async function listasDosFiltros(c) {
    const pool = await connectToDb();
    const q = (s) => pool.request().input('c', sql.Char(6), c).query(s);
    const [g, sg, fo, fi, rg, mo] = await Promise.all([
        q(`SELECT co_grupo AS codigo, no_grupo AS nome FROM ${P}tb_grupo WHERE competencia = @c ORDER BY co_grupo`),
        q(`SELECT co_grupo + co_sub_grupo AS codigo, no_sub_grupo AS nome FROM ${P}tb_sub_grupo WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_grupo + co_sub_grupo + co_forma_organizacao AS codigo, no_forma_organizacao AS nome FROM ${P}tb_forma_organizacao WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_financiamento AS codigo, no_financiamento AS nome FROM ${P}tb_financiamento WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_registro AS codigo, no_registro AS nome FROM ${P}tb_registro WHERE competencia = @c ORDER BY 1`),
        q(`SELECT co_modalidade AS codigo, no_modalidade AS nome FROM ${P}tb_modalidade WHERE competencia = @c ORDER BY 1`)
    ]);
    return { grupos: g.recordset, subgrupos: sg.recordset, formas: fo.recordset, financiamentos: fi.recordset, registros: rg.recordset, modalidades: mo.recordset };
}

/** Acrescenta ao WHERE os filtros de procedimentos que vêm da query string (mesma ordem de parâmetros de sempre). */
function filtrosDeProcedimentos(r, consulta) {
    let where = filtroTexto(r, consulta.q, 'p.co_procedimento', 'p.no_procedimento', 't');

    const prefixo = soDigitos(consulta.forma || consulta.subgrupo || consulta.grupo).slice(0, 6);
    if (prefixo) { r.input('pre', sql.VarChar(7), `${prefixo}%`); where += ' AND p.co_procedimento LIKE @pre'; }
    const simples = { financiamento: 'p.co_financiamento', complexidade: 'p.tp_complexidade', sexo: 'p.tp_sexo' };
    Object.entries(simples).forEach(([k, col]) => {
        const v = limpar(consulta[k], 2);
        if (v) { r.input(k, sql.VarChar(2), v); where += ` AND ${col} = @${k}`; }
    });
    ['registro', 'modalidade'].forEach(k => {
        const v = limpar(consulta[k], 2);
        if (v) { r.input(k, sql.VarChar(2), v); where += ` AND ${VINCULOS[k](`@${k}`)}`; }
    });
    const vinc = consulta.vinculo;
    const vcod = limpar(consulta.codigo);
    if (VINCULOS[vinc] && vcod) { r.input('vc', sql.VarChar(12), vcod); where += ` AND ${VINCULOS[vinc]('@vc')}`; }
    const valorMin = parseFloat(consulta.valor_min);
    if (!isNaN(valorMin)) { r.input('vmin', sql.Decimal(14, 2), valorMin); where += ' AND (p.vl_sa >= @vmin OR p.vl_sh + p.vl_sp >= @vmin)'; }
    return where;
}

/** Busca de procedimentos com filtros combinados e paginação. `consulta` é a query string da requisição. */
async function buscarProcedimentos(c, { pagina, tamanho, consulta }) {
    const pool = await connectToDb();
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    const where = filtrosDeProcedimentos(r, consulta);
    const ordem = ORDENS[consulta.ordem] || ORDENS.codigo;

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
    return q.recordset;
}

/** Tipos de compatibilidade presentes na competência (instrumento principal x secundário x tipo). */
async function tiposDeCompatibilidade(c) {
    const pool = await connectToDb();
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
    return r.recordset;
}

/** Pares de compatibilidade com filtros por tipo ("principal-compatível-tipo") e por procedimento principal/secundário. */
async function buscarCompatibilidades(c, { pagina, tamanho, tipo, principal, secundario }) {
    const pool = await connectToDb();
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    let where = '';
    const [rp, rc, tp] = String(tipo || '').split('-');
    if (/^\d{2}$/.test(rp || '')) { r.input('rp', sql.VarChar(2), rp); where += ' AND x.co_registro_principal = @rp'; }
    if (/^\d{2}$/.test(rc || '')) { r.input('rc', sql.VarChar(2), rc); where += ' AND x.co_registro_compativel = @rc'; }
    if (/^\d$/.test(tp || '')) { r.input('tp', sql.VarChar(1), tp); where += ' AND x.tp_compatibilidade = @tp'; }
    where += filtroTexto(r, principal, 'x.co_procedimento_principal', 'pp.no_procedimento', 'a');
    where += filtroTexto(r, secundario, 'x.co_procedimento_compativel', 'pc.no_procedimento', 'b');

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
    return q.recordset;
}

/** Itens de uma tabela auxiliar (`t` vem de REFERENCIAS), com a quantidade de procedimentos vinculados. */
async function buscarTabelaAuxiliar(c, t, { pagina, tamanho, termo }) {
    const pool = await connectToDb();
    const r = pool.request().input('c', sql.Char(6), c).input('off', sql.Int, (pagina - 1) * tamanho).input('tam', sql.Int, tamanho);
    const where = filtroTexto(r, termo, t.cod, t.nome, 't');
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
    return q.recordset;
}

/** Chaves e títulos das tabelas auxiliares. */
const listarTabelasAuxiliares = () => Object.entries(REFERENCIAS).map(([chave, t]) => ({ chave, titulo: t.titulo }));

module.exports = {
    listarCompetencias, resolverCompetencia, dadosDoResumo, listarImportacoes, buscarImportacao, nomeCompletoDoUsuario,
    listasDosFiltros, buscarProcedimentos, tiposDeCompatibilidade, buscarCompatibilidades, buscarTabelaAuxiliar, listarTabelasAuxiliares
};
