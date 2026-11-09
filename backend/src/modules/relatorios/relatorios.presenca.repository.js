/* SQL dos relatórios de presença (escalas de trabalho). */
const { connectToDb, sql } = require('../../config/database');
const { filtroEscopo } = require('./relatorios.filtros');

/** Linhas de escala do período, já ordenadas para o agrupamento de cada relatório. */
async function escalasDoPeriodo({ dataInicio, dataFim, id_projeto: idProjeto, id_unidade: idUnidade }, req, ordenacao) {
    const pool = await connectToDb();
    const request = pool.request();

    request.input('di', sql.Date, dataInicio);
    request.input('df', sql.Date, dataFim);

    let where = `WHERE e.tipo = 'TRABALHO' AND e.data_escala BETWEEN @di AND @df`;

    if (idProjeto && idProjeto !== 'Todos') {
        where += ` AND e.id_projeto = @proj`;
        request.input('proj', sql.Int, idProjeto);
    }
    if (idUnidade && idUnidade !== 'Todas') {
        where += ` AND e.id_unidade = @uni`;
        request.input('uni', sql.Int, idUnidade);
    }
    where += filtroEscopo(request, req, 'e.id_projeto', 'implantacao');

    const query = `
        SELECT
            p.nome_projeto,
            u.nome_unidade,
            us.nome_completo AS nome_implantador,
            FORMAT(e.data_escala, 'dd/MM/yyyy') AS data_fmt,
            e.data_escala
        FROM tab_escalas e
        JOIN tab_projetos   p  ON e.id_projeto  = p.id_projeto
        JOIN tab_unidades   u  ON e.id_unidade  = u.id_unidade
        JOIN tab_usuarios   us ON e.id_usuario  = us.id_usuario
        ${where}
        ORDER BY ${ordenacao}
    `;

    return (await request.query(query)).recordset;
}

const escalasPorImplantador = (filtros, req) => escalasDoPeriodo(filtros, req, 'p.nome_projeto, u.nome_unidade, us.nome_completo, e.data_escala');
const escalasPorData = (filtros, req) => escalasDoPeriodo(filtros, req, 'p.nome_projeto, u.nome_unidade, e.data_escala, us.nome_completo');

// Filtro por MOTIVO: mantém só as presenças (escalas) que possuem atividade
// correspondente (mesmo implantador/projeto/unidade/data) com o motivo escolhido.
const SQL_EXISTE_ATIVIDADE_DO_MOTIVO = `
            AND EXISTS (
                SELECT 1
                FROM tab_atividades a
                WHERE a.id_projeto = e.id_projeto
                  AND a.id_unidade = e.id_unidade
                  AND CAST(a.data_atividade AS DATE) = e.data_escala
                  AND a.motivos LIKE @motivo
                  AND (
                        a.id_implantador = e.id_usuario
                     OR EXISTS (
                            SELECT 1 FROM tab_atividade_implantadores ai
                            WHERE ai.id_atividade = a.id_atividade
                              AND ai.id_implantador = e.id_usuario
                        )
                  )
            )
        `;

async function presencaImplantadores({ dataInicio, dataFim, id_projeto: idProjeto, id_unidade: idUnidade, motivo }, req) {
    const pool = await connectToDb();
    const request = pool.request();

    let whereClause = " WHERE e.tipo = 'TRABALHO' ";

    if (dataInicio && dataFim) {
        whereClause += " AND e.data_escala BETWEEN @di AND @df ";
        request.input('di', sql.Date, dataInicio);
        request.input('df', sql.Date, dataFim);
    }
    if (idProjeto && idProjeto !== 'Todos' && idProjeto !== '') {
        whereClause += " AND e.id_projeto = @proj ";
        request.input('proj', sql.Int, idProjeto);
    }
    if (idUnidade && idUnidade !== 'Todas' && idUnidade !== '') {
        whereClause += " AND e.id_unidade = @uni ";
        request.input('uni', sql.Int, idUnidade);
    }
    if (motivo && motivo !== 'Todos' && motivo !== '') {
        whereClause += SQL_EXISTE_ATIVIDADE_DO_MOTIVO;
        request.input('motivo', sql.VarChar, `%${motivo}%`);
    }
    whereClause += filtroEscopo(request, req, 'e.id_projeto', 'implantacao');

    const query = `
        SELECT
            e.id_escala as id_atividade,
            FORMAT(e.data_escala, 'yyyy-MM-dd') as data_inicio,
            FORMAT(e.data_escala, 'yyyy-MM-dd') as data_fim,
            p.nome_projeto,
            un.nome_unidade,
            u.nome_completo AS nome_implantador
        FROM tab_escalas e
        INNER JOIN tab_projetos p ON e.id_projeto = p.id_projeto
        INNER JOIN tab_unidades un ON e.id_unidade = un.id_unidade
        INNER JOIN tab_usuarios u ON e.id_usuario = u.id_usuario
        ${whereClause}
        ORDER BY e.data_escala ASC
    `;

    return (await request.query(query)).recordset;
}

module.exports = { escalasPorImplantador, escalasPorData, presencaImplantadores };
