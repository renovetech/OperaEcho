/* SQL dos painéis de mapa, produtividade e métricas da implantação. */
const { sql } = require('../../config/database');

async function mapaImplantacao(pool, { dataInicio, dataFim }) {
    const request = pool.request();
    let query = `SELECT a.id_atividade, a.profissionais_env, a.motivos, a.data_inicio, a.data_fim, p.nome_projeto, u.nome_unidade, c.nome_cidade as cidade, e.sigla as uf, c.latitude, c.longitude FROM tab_atividades a JOIN tab_projetos p ON a.id_projeto = p.id_projeto JOIN tab_unidades u ON a.id_unidade = u.id_unidade JOIN tab_cidades c ON u.id_cidade = c.id_cidade JOIN tab_estados e ON c.id_estado = e.id_estado WHERE 1=1`;
    if (dataInicio && dataFim) {
        query += ` AND a.data_atividade <= @DataFim AND (a.data_fim IS NULL OR a.data_fim >= @DataInicio)`;
        request.input('DataInicio', sql.Date, new Date(dataInicio));
        request.input('DataFim', sql.Date, new Date(dataFim));
    }
    return (await request.query(query)).recordset;
}

async function produtosPorUnidade(pool) {
    return (await pool.request().query(`SELECT p.nome_produto, COUNT(up.id_unidade) as qtd_unidades FROM tab_produtos p LEFT JOIN tab_unidade_produtos up ON p.id_produto = up.id_produto WHERE p.ativo = 1 GROUP BY p.nome_produto ORDER BY qtd_unidades DESC`)).recordset;
}

async function produtosPorImplantador(pool) {
    return (await pool.request().query(`SELECT u.nome_completo as implantador, p.nome_produto, COUNT(DISTINCT a.id_atividade) as qtd_atividades FROM tab_usuarios u INNER JOIN tab_atividade_implantadores ai ON u.id_usuario = ai.id_implantador INNER JOIN tab_atividades a ON ai.id_atividade = a.id_atividade CROSS APPLY STRING_SPLIT(a.produtos_trabalhados, ',') s INNER JOIN tab_produtos p ON TRIM(s.value) = p.nome_produto GROUP BY u.nome_completo, p.nome_produto ORDER BY u.nome_completo, qtd_atividades DESC`)).recordset;
}

async function detalhesDoProduto(pool, { nome_produto: nomeProduto, dataInicio, dataFim }) {
    const request = pool.request();
    let query = `WITH TodosVinculos AS (SELECT id_atividade, id_implantador FROM tab_atividade_implantadores UNION SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL) SELECT ISNULL(u.nome_completo, 'Não Informado') as implantador, p.nome_projeto as projeto, un.nome_unidade as unidade, FORMAT(a.data_atividade, 'yyyy-MM-dd') + 'T12:00:00' as data_atividade, a.motivos FROM TodosVinculos tv INNER JOIN tab_atividades a ON tv.id_atividade = a.id_atividade LEFT JOIN tab_usuarios u ON tv.id_implantador = u.id_usuario LEFT JOIN tab_projetos p ON a.id_projeto = p.id_projeto LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade CROSS APPLY STRING_SPLIT(a.produtos_trabalhados, ',') s WHERE TRIM(s.value) = @prod`;
    request.input('prod', sql.VarChar, nomeProduto);
    if (dataInicio && dataFim) {
        query += " AND a.data_atividade BETWEEN @di AND @df";
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    query += " ORDER BY a.data_atividade DESC, un.nome_unidade";
    return (await request.query(query)).recordset;
}

async function estatisticasProdutividade(pool, { dataInicio, dataFim }) {
    const request = pool.request();
    let query = `
        WITH TodosImplantadores AS (
            SELECT id_atividade, id_implantador FROM tab_atividade_implantadores
            UNION
            SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL
        )
        SELECT
            u.nome_completo as implantador,
            COUNT(DISTINCT a.id_atividade) as total_atividades_real,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Implantação%' THEN a.id_atividade END) as qtd_implantacao,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Treinamento%' THEN a.id_atividade END) as qtd_treinamento,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Visita Técnica%' THEN a.id_atividade END) as qtd_visita,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Apoio ao Projeto%' THEN a.id_atividade END) as qtd_apoio
        FROM TodosImplantadores ti
        INNER JOIN tab_atividades a ON ti.id_atividade = a.id_atividade
        INNER JOIN tab_usuarios u ON ti.id_implantador = u.id_usuario
        WHERE 1=1
    `;
    if (dataInicio && dataFim) {
        query += " AND (a.data_atividade >= @di AND a.data_atividade <= @df)";
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    query += " GROUP BY u.nome_completo ORDER BY u.nome_completo";
    return (await request.query(query)).recordset;
}

async function detalheProdutividade(pool, { implantador, motivo, dataInicio, dataFim }) {
    const request = pool.request();
    let query = `WITH TodosImplantadores AS (SELECT id_atividade, id_implantador FROM tab_atividade_implantadores UNION SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL) SELECT FORMAT(a.data_atividade, 'yyyy-MM-dd') + 'T12:00:00' as data, p.nome_projeto as projeto, un.nome_unidade as unidade, a.profissionais_env FROM TodosImplantadores ti INNER JOIN tab_atividades a ON ti.id_atividade = a.id_atividade INNER JOIN tab_usuarios u ON ti.id_implantador = u.id_usuario INNER JOIN tab_unidades un ON a.id_unidade = un.id_unidade INNER JOIN tab_projetos p ON a.id_projeto = p.id_projeto WHERE u.nome_completo = @imp`;
    request.input('imp', sql.VarChar, implantador);
    if (motivo) { query += " AND a.motivos LIKE @mot"; request.input('mot', sql.VarChar, `%${motivo}%`); }
    if (dataInicio && dataFim) {
        query += " AND (a.data_atividade >= @di AND a.data_atividade <= @df)";
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    query += " ORDER BY a.data_atividade DESC";
    return (await request.query(query)).recordset;
}

async function metricasImplantacao(pool, { dataInicio, dataFim }) {
    const request = pool.request();
    const comPeriodo = dataInicio && dataFim;

    const query = `
        WITH TodosVinculos AS (
            SELECT id_atividade, id_implantador FROM tab_atividade_implantadores
            UNION
            SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL
        ),
        BaseReal AS (
            SELECT u.id_usuario, COUNT(DISTINCT a.id_atividade) as total_real
            FROM TodosVinculos tv
            INNER JOIN tab_atividades a ON tv.id_atividade = a.id_atividade
            INNER JOIN tab_usuarios u ON tv.id_implantador = u.id_usuario
            WHERE 1=1 ${comPeriodo ? " AND a.data_atividade BETWEEN @di AND @df" : ""}
            GROUP BY u.id_usuario
        )
        SELECT
            u.nome_completo as implantador, TRIM(s.value) as produto,
            MAX(b.total_real) as total_real_implantador,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Implantação%' THEN a.id_atividade END) as qtd_implantacao,
            COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Treinamento%' THEN a.id_atividade END) as qtd_treinamento
        FROM TodosVinculos tv
        INNER JOIN tab_atividades a ON tv.id_atividade = a.id_atividade
        INNER JOIN tab_usuarios u ON tv.id_implantador = u.id_usuario
        INNER JOIN BaseReal b ON u.id_usuario = b.id_usuario
        CROSS APPLY STRING_SPLIT(a.produtos_trabalhados, ',') s
        INNER JOIN tab_produtos p ON TRIM(s.value) = p.nome_produto
        INNER JOIN tab_usuario_produtos expertise ON expertise.id_usuario = u.id_usuario AND expertise.id_produto = p.id_produto
        WHERE TRIM(s.value) <> ''
        ${comPeriodo ? " AND a.data_atividade BETWEEN @di AND @df" : ""}
        GROUP BY u.nome_completo, TRIM(s.value)
        HAVING COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Implantação%' THEN a.id_atividade END) > 0
            OR COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Treinamento%' THEN a.id_atividade END) > 0
        ORDER BY u.nome_completo, produto
    `;

    if (comPeriodo) {
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    return (await request.query(query)).recordset;
}

module.exports = {
    mapaImplantacao, produtosPorUnidade, produtosPorImplantador, detalhesDoProduto,
    estatisticasProdutividade, detalheProdutividade, metricasImplantacao
};
