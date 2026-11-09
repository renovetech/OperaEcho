/* SQL do relatório de tempo médio de ação (itens dos planos de ação). */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');

/** Itens dos planos com tempo previsto e gasto, respeitando a lotação do usuário. */
async function itensComTempo(req, { dataInicio, dataFim, id_projeto: idProjeto, responsavel, status }) {
    const pool = await connectToDb();
    const request = pool.request();

    let where = ' WHERE 1=1 ';
    if (dataInicio && dataFim) {
        where += ' AND CAST(pa.data_criacao AS DATE) BETWEEN @di AND @df ';
        request.input('di', sql.Date, dataInicio);
        request.input('df', sql.Date, dataFim);
    }
    if (idProjeto && idProjeto !== 'Todos' && idProjeto !== '') {
        where += ' AND pa.id_projeto = @proj ';
        request.input('proj', sql.Int, idProjeto);
    }
    if (responsavel && responsavel !== 'Todos' && responsavel !== '') {
        where += ' AND i.responsavel = @resp ';
        request.input('resp', sql.VarChar, responsavel);
    }
    if (status && status !== 'Todos' && status !== '') {
        where += ' AND i.status = @st ';
        request.input('st', sql.VarChar, status);
    }
    // Isolamento por lotação
    if (req.escopo && !req.escopo.global) where += filtroPorProjeto(request, req.escopo, 'pa.id_projeto');

    const query = `
        SELECT
            i.id_item, i.descricao, i.responsavel, i.status, i.prioridade, i.modulo,
            pa.titulo AS titulo_plano, pj.nome_projeto,
            ISNULL(i.tempo_previsto, 0) AS previsto_min,
            ISNULL(i.tempo_gasto, 0)    AS gasto_min,
            FORMAT(i.data_inicio_real, 'dd/MM/yyyy') AS inicio_real,
            FORMAT(i.data_fim_real,    'dd/MM/yyyy') AS fim_real
        FROM tab_plano_itens i
        JOIN tab_plano_acao pa ON i.id_plano = pa.id_plano
        LEFT JOIN tab_projetos pj ON pa.id_projeto = pj.id_projeto
        ${where}
        ORDER BY pj.nome_projeto, i.responsavel, i.descricao
    `;

    return (await request.query(query)).recordset;
}

module.exports = { itensComTempo };
