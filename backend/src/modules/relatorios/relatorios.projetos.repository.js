/* SQL dos relatórios de projetos ativos e do mapa de unidades. */
const { connectToDb, sql } = require('../../config/database');
const { filtroEscopo, filtroPeriodo, valido, SQL_FIM } = require('./relatorios.filtros');

const primeiraLetraMaiuscula = (categoria) => String(categoria).slice(0, 1).toUpperCase();

/** Projetos ativos que o usuário enxerga, filtrados por projeto e categoria. */
async function listarProjetosAtivos(pool, req, { id_projeto: idProjeto, categoria }) {
    const request = pool.request();
    let filtroProj = '';
    if (valido(idProjeto, 'Todos')) {
        filtroProj += ' AND p.id_projeto = @proj ';
        request.input('proj', sql.Int, parseInt(idProjeto, 10));
    }
    if (valido(categoria, 'Todas')) {
        filtroProj += ' AND p.categoria = @cat ';
        request.input('cat', sql.Char(1), primeiraLetraMaiuscula(categoria));
    }
    const escopo = filtroEscopo(request, req, 'p.id_projeto', 'implantacao');
    return (await request.query(`
        SELECT p.id_projeto, p.nome_projeto, p.gera_lotacao, p.categoria
        FROM tab_projetos p
        WHERE p.ativo = 1 ${filtroProj} ${escopo}
        ORDER BY p.nome_projeto
    `)).recordset;
}

const totaisDeUnidades = (pool) => pool.request().query(`
            SELECT u.id_projeto,
                SUM(CASE WHEN u.ativo = 1 THEN 1 ELSE 0 END) AS ativas,
                SUM(CASE WHEN u.ativo = 0 THEN 1 ELSE 0 END) AS inativas,
                SUM(CASE WHEN u.ativo = 1 AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL THEN 1 ELSE 0 END) AS georref,
                COUNT(DISTINCT CASE WHEN u.ativo = 1 THEN u.id_cidade END) AS municipios
            FROM tab_unidades u GROUP BY u.id_projeto`);

const siglasDosEstados = (pool) => pool.request().query(`
            SELECT DISTINCT u.id_projeto, e.sigla FROM tab_unidades u
            JOIN tab_cidades c ON c.id_cidade = u.id_cidade
            JOIN tab_estados e ON e.id_estado = c.id_estado
            WHERE u.ativo = 1 ORDER BY e.sigla`);

const ultimaAtividadePorProjeto = (pool) => pool.request().query(`SELECT a.id_projeto, CONVERT(varchar(10), MAX(${SQL_FIM}), 103) AS data FROM tab_atividades a GROUP BY a.id_projeto`);

/** Total de atividades por projeto no período, em consulta própria: juntas numa só, o plano do banco passava do tempo limite. */
async function atividadesPorProjeto(pool, tabela, dataInicio, dataFim) {
    const r = pool.request();
    const periodo = filtroPeriodo(r, dataInicio, dataFim);
    return (await r.query(`SELECT a.id_projeto, COUNT(*) AS qtd FROM ${tabela} a WHERE 1=1 ${periodo} GROUP BY a.id_projeto`)).recordset;
}

/** Produtos das unidades ativas dos projetos informados. */
async function produtosDosProjetos(pool, idsProjetos) {
    const r2 = pool.request();
    const marks = idsProjetos.map((id, i) => { r2.input(`p${i}`, sql.Int, id); return `@p${i}`; });
    return (await r2.query(`
            SELECT u.id_projeto, pr.id_produto, pr.nome_produto, COUNT(DISTINCT u.id_unidade) AS unidades
            FROM tab_unidade_produtos up
            JOIN tab_unidades u  ON u.id_unidade = up.id_unidade AND u.ativo = 1
            JOIN tab_produtos pr ON pr.id_produto = up.id_produto AND pr.ativo = 1
            WHERE u.id_projeto IN (${marks.join(',')})
            GROUP BY u.id_projeto, pr.id_produto, pr.nome_produto
            ORDER BY pr.nome_produto
        `)).recordset;
}

/** Unidades com coordenadas e produtos (listas já agregadas pelo banco). */
async function listarUnidadesDoMapa(req, filtros) {
    const { id_projeto: idProjeto, id_produto: idProduto, status, id_cidade: idCidade, uf, categoria } = filtros;
    const pool = await connectToDb();
    const request = pool.request();
    let where = ' WHERE 1=1 ';

    if (valido(categoria, 'Todas')) {
        where += ' AND p.categoria = @cat AND p.ativo = 1 ';
        request.input('cat', sql.Char(1), primeiraLetraMaiuscula(categoria));
    }
    if (valido(idProjeto, 'Todos')) {
        where += ' AND u.id_projeto = @proj ';
        request.input('proj', sql.Int, parseInt(idProjeto, 10));
    }
    if (valido(idProduto, 'Todos')) {
        where += ' AND EXISTS (SELECT 1 FROM tab_unidade_produtos up WHERE up.id_unidade = u.id_unidade AND up.id_produto = @prod) ';
        request.input('prod', sql.Int, parseInt(idProduto, 10));
    }
    // Padrão: só unidades ativas. 'Todos' = ativas + inativas.
    if (status !== 'Todos') {
        where += ' AND u.ativo = @ativo ';
        request.input('ativo', sql.Bit, status === 'false' ? 0 : 1);
    }
    if (valido(idCidade, 'Todos')) {
        where += ' AND u.id_cidade = @cid ';
        request.input('cid', sql.Int, parseInt(idCidade, 10));
    }
    if (valido(uf, 'Todos')) {
        where += ' AND e.sigla = @uf ';
        request.input('uf', sql.VarChar(2), String(uf).slice(0, 2));
    }
    where += filtroEscopo(request, req, 'u.id_projeto', 'implantacao');

    const r = await request.query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.ativo, u.id_projeto, p.nome_projeto, p.categoria,
               u.id_cidade, c.nome_cidade, e.sigla AS uf,
               u.latitude, u.longitude, c.latitude AS lat_cidade, c.longitude AS lng_cidade,
               (SELECT STRING_AGG(CAST(pr.id_produto AS VARCHAR(10)), ',') WITHIN GROUP (ORDER BY pr.nome_produto)
                  FROM tab_unidade_produtos up JOIN tab_produtos pr ON pr.id_produto = up.id_produto
                 WHERE up.id_unidade = u.id_unidade AND pr.ativo = 1) AS ids_produtos,
               (SELECT STRING_AGG(pr.nome_produto, '||') WITHIN GROUP (ORDER BY pr.nome_produto)
                  FROM tab_unidade_produtos up JOIN tab_produtos pr ON pr.id_produto = up.id_produto
                 WHERE up.id_unidade = u.id_unidade AND pr.ativo = 1) AS nomes_produtos
        FROM tab_unidades u
        LEFT JOIN tab_cidades c  ON c.id_cidade = u.id_cidade
        LEFT JOIN tab_estados e  ON e.id_estado = c.id_estado
        LEFT JOIN tab_projetos p ON p.id_projeto = u.id_projeto
        ${where}
        ORDER BY c.nome_cidade, u.nome_unidade
    `);
    return r.recordset;
}

module.exports = {
    listarProjetosAtivos, totaisDeUnidades, siglasDosEstados, ultimaAtividadePorProjeto,
    atividadesPorProjeto, produtosDosProjetos, listarUnidadesDoMapa
};
