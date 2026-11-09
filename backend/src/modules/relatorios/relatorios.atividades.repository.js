/* SQL dos relatórios de estatísticas de atividades e da auditoria de localização. */
const { connectToDb, sql } = require('../../config/database');
const { filtroEscopo, filtroPeriodo } = require('./relatorios.filtros');

// Estatísticas da implantação e dos projetos têm os mesmos filtros, em tabelas diferentes.
function aplicarFiltrosEstatistica(request, req, filtros, origem) {
    const { dataInicio, dataFim, motivo, projeto, unidade } = filtros;
    let whereClause = " WHERE 1=1 ";

    if (dataInicio && dataFim) whereClause += filtroPeriodo(request, dataInicio, dataFim);
    if (motivo && motivo !== 'Todos') {
        whereClause += " AND a.motivos LIKE @motivo ";
        request.input('motivo', sql.VarChar, `%${motivo}%`);
    }
    if (projeto && projeto !== 'Todos') {
        whereClause += " AND a.id_projeto = @proj ";
        request.input('proj', sql.Int, projeto);
    }
    if (unidade && unidade !== 'Todas') {
        whereClause += " AND a.id_unidade = @uni ";
        request.input('uni', sql.Int, unidade);
    }
    whereClause += filtroEscopo(request, req, 'a.id_projeto', origem);
    return whereClause;
}

async function estatisticasAtividades(req, filtros) {
    const pool = await connectToDb();
    const request = pool.request();
    const whereClause = aplicarFiltrosEstatistica(request, req, filtros, 'implantacao');

    const query = `
        WITH ImpAtiv AS (
            SELECT a.id_atividade,
                STUFF((
                    SELECT DISTINCT ', ' + us.nome_completo
                    FROM (
                        SELECT ai.id_implantador FROM tab_atividade_implantadores ai WHERE ai.id_atividade = a.id_atividade
                        UNION
                        SELECT a.id_implantador WHERE a.id_implantador IS NOT NULL
                    ) v
                    JOIN tab_usuarios us ON us.id_usuario = v.id_implantador
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS implantadores
            FROM tab_atividades a
        ),
        EqpProj AS (
            SELECT a.id_atividade,
                STUFF((
                    SELECT DISTINCT ', ' + ue.nome_completo
                    FROM tab_atividade_equipe_projeto ep
                    JOIN tab_usuarios ue ON ue.id_usuario = ep.id_usuario
                    WHERE ep.id_atividade = a.id_atividade
                    FOR XML PATH(''), TYPE
                ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS equipe_projeto
            FROM tab_atividades a
        )
        SELECT a.motivos, p.nome_projeto, u.nome_unidade, a.produtos_trabalhados,
            a.profissionais_env, FORMAT(a.data_inicio, 'dd/MM/yyyy') as data_inicial,
            ISNULL(CONVERT(varchar(10), a.tempo_gasto, 108), '00:00') as tempo_gasto,
            COUNT(*) as qtd,
            ISNULL(MAX(ia.implantadores), '') as implantadores,
            ISNULL(MAX(ep.equipe_projeto), '') as equipe_projeto
        FROM tab_atividades a
        JOIN tab_projetos p ON a.id_projeto = p.id_projeto
        JOIN tab_unidades u ON a.id_unidade = u.id_unidade
        LEFT JOIN ImpAtiv ia ON ia.id_atividade = a.id_atividade
        LEFT JOIN EqpProj ep ON ep.id_atividade = a.id_atividade
        ${whereClause}
        GROUP BY a.motivos, p.nome_projeto, u.nome_unidade, a.produtos_trabalhados, a.profissionais_env, a.data_inicio, CONVERT(varchar(10), a.tempo_gasto, 108)
        ORDER BY a.motivos, p.nome_projeto, u.nome_unidade
    `;

    return (await request.query(query)).recordset;
}

// Consolidado dos registros de OPERAÇÕES > PROJETOS (tab_proj_atividades).
async function estatisticasProjetos(req, filtros) {
    const pool = await connectToDb();
    const request = pool.request();
    const whereClause = aplicarFiltrosEstatistica(request, req, filtros, 'projetos');

    const query = `
        SELECT a.motivos, p.nome_projeto, u.nome_unidade, a.produtos_trabalhados,
            a.profissionais_env, FORMAT(a.data_inicio, 'dd/MM/yyyy') as data_inicial,
            ISNULL(CONVERT(varchar(10), a.tempo_gasto, 108), '00:00') as tempo_gasto,
            COUNT(*) as qtd
        FROM tab_proj_atividades a
        JOIN tab_projetos p ON a.id_projeto = p.id_projeto
        JOIN tab_unidades u ON a.id_unidade = u.id_unidade
        ${whereClause}
        GROUP BY a.motivos, p.nome_projeto, u.nome_unidade, a.produtos_trabalhados, a.profissionais_env, a.data_inicio, CONVERT(varchar(10), a.tempo_gasto, 108)
        ORDER BY a.motivos, p.nome_projeto, u.nome_unidade
    `;

    return (await request.query(query)).recordset;
}

async function auditoriaLocalizacao({ dataInicio, dataFim, usuario, tipo_registro: tipoRegistro }) {
    const pool = await connectToDb();
    const request = pool.request();

    let query = `
        SELECT id_rastreio, usuario, latitude, longitude, tipo_registro, data_hora, detalhes_registro
        FROM tab_rastreamento_app WHERE 1=1
    `;

    if (dataInicio && dataFim) {
        query += " AND data_hora >= @inicio AND data_hora <= @fim";
        request.input('inicio', sql.VarChar, `${dataInicio.replace(/-/g, '')} 00:00:00`);
        request.input('fim', sql.VarChar, `${dataFim.replace(/-/g, '')} 23:59:59`);
    }
    if (usuario && usuario !== 'Todos') {
        query += " AND usuario = @user";
        request.input('user', sql.VarChar, usuario);
    }
    if (tipoRegistro && tipoRegistro !== 'Todos') {
        query += " AND tipo_registro = @tipo";
        request.input('tipo', sql.VarChar, tipoRegistro);
    }
    query += " ORDER BY data_hora DESC";

    return (await request.query(query)).recordset;
}

module.exports = { estatisticasAtividades, estatisticasProjetos, auditoriaLocalizacao };
