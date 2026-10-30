/* routes/relatorios.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { filtroPorProjeto } = require('../middlewares/lotacao');
const PA = require('../services/planoAcaoService');

// ------------------------------------------------------------------------------
// Regras comuns de período e escopo - iguais às telas de Registro de Atividades,
// para que relatório e registro mostrem SEMPRE o mesmo conjunto de dados.
// ------------------------------------------------------------------------------
const FUNCOES_LOTACAO = ['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'];
const funcaoDoUsuario = (req) => ((req.escopo && req.escopo.nome_funcao) || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();

// Implantação: isola só as funções vinculadas à lotação. Projetos: sempre isola.
const filtroEscopo = (request, req, coluna, origem) => {
    if (origem === 'projetos') return filtroPorProjeto(request, req.escopo, coluna);
    return FUNCOES_LOTACAO.includes(funcaoDoUsuario(req)) ? filtroPorProjeto(request, req.escopo, coluna) : '';
};

// Atividade de vários dias entra se o intervalo dela toca o período filtrado.
const SQL_INI = 'CAST(ISNULL(a.data_inicio, a.data_atividade) AS DATE)';
const SQL_FIM = 'CAST(ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS DATE)';
const filtroPeriodo = (request, di, df) => {
    request.input('di', sql.Date, di);
    request.input('df', sql.Date, df);
    return ` AND ${SQL_FIM} >= @di AND ${SQL_INI} <= @df `;
};

const valido = (v, ...vazios) => v !== undefined && v !== null && v !== '' && v !== 'undefined' && !vazios.includes(v);

// ==============================================================================
// ESTATÍSTICAS DA IMPLANTAÇÃO
// ==============================================================================
router.get('/relatorios/estatisticas-atividades', autenticar, autorizarModulo('rel_estatisticas'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, motivo, projeto, unidade } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
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
    whereClause += filtroEscopo(request, req, 'a.id_projeto', 'implantacao');

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

    const result = await request.query(query);
    res.json(result.recordset);
}));

// ==============================================================================
// ESTATÍSTICAS DOS PROJETOS
// Mesmo molde do relatório de Estatísticas da Implantação, porém o escopo é o
// consolidado dos registros do submenu OPERAÇÕES > PROJETOS (tab_proj_atividades).
// ==============================================================================
router.get('/relatorios/estatisticas-projetos', autenticar, autorizarModulo('rel_estatisticas_projetos'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, motivo, projeto, unidade } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
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
    whereClause += filtroEscopo(request, req, 'a.id_projeto', 'projetos');

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

    const result = await request.query(query);
    res.json(result.recordset);
}));

// ==============================================================================
// AUDITORIA DE LOCALIZAÇÃO (GPS)
// ==============================================================================
router.get('/relatorios/auditoria-localizacao', autenticar, autorizarModulo('rel_auditoria_loc'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, usuario, tipo_registro } = req.query;
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
    if (tipo_registro && tipo_registro !== 'Todos') {
        query += " AND tipo_registro = @tipo";
        request.input('tipo', sql.VarChar, tipo_registro);
    }
    query += " ORDER BY data_hora DESC";

    const result = await request.query(query);
    res.json(result.recordset);
}));

// ==============================================================================
// PRESENÇA POR IMPLANTADOR - Relatório 3
// Retorna: por projeto > unidade > implantador > lista de datas
// ==============================================================================
router.get('/relatorios/presenca-implantador', autenticar, autorizarModulo('rel_presenca_implantador'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, id_projeto, id_unidade } = req.query;

    if (!dataInicio || !dataFim) {
        return res.status(400).json({ erro: 'Informe o período (dataInicio e dataFim).' });
    }

    const pool = await connectToDb();
    const request = pool.request();

    request.input('di', sql.Date, dataInicio);
    request.input('df', sql.Date, dataFim);

    let where = `WHERE e.tipo = 'TRABALHO' AND e.data_escala BETWEEN @di AND @df`;

    if (id_projeto && id_projeto !== 'Todos') {
        where += ` AND e.id_projeto = @proj`;
        request.input('proj', sql.Int, id_projeto);
    }
    if (id_unidade && id_unidade !== 'Todas') {
        where += ` AND e.id_unidade = @uni`;
        request.input('uni', sql.Int, id_unidade);
    }

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
        ORDER BY p.nome_projeto, u.nome_unidade, us.nome_completo, e.data_escala
    `;

    const result = await request.query(query);

    // Agrupa: { projeto -> { unidade -> { implantador -> [datas] } } }
    const agrupado = {};
    for (const row of result.recordset) {
        const { nome_projeto, nome_unidade, nome_implantador, data_fmt } = row;
        if (!agrupado[nome_projeto]) agrupado[nome_projeto] = {};
        if (!agrupado[nome_projeto][nome_unidade]) agrupado[nome_projeto][nome_unidade] = {};
        if (!agrupado[nome_projeto][nome_unidade][nome_implantador])
            agrupado[nome_projeto][nome_unidade][nome_implantador] = [];
        agrupado[nome_projeto][nome_unidade][nome_implantador].push(data_fmt);
    }

    res.json(agrupado);
}));

// ==============================================================================
// PRESENÇA POR DATA (EQUIPE) - Relatório 4
// Retorna: por projeto > unidade > data > [implantadores]
// ==============================================================================
router.get('/relatorios/presenca-equipe', autenticar, autorizarModulo('rel_presenca_equipe'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, id_projeto, id_unidade } = req.query;

    if (!dataInicio || !dataFim) {
        return res.status(400).json({ erro: 'Informe o período (dataInicio e dataFim).' });
    }

    const pool = await connectToDb();
    const request = pool.request();

    request.input('di', sql.Date, dataInicio);
    request.input('df', sql.Date, dataFim);

    let where = `WHERE e.tipo = 'TRABALHO' AND e.data_escala BETWEEN @di AND @df`;

    if (id_projeto && id_projeto !== 'Todos') {
        where += ` AND e.id_projeto = @proj`;
        request.input('proj', sql.Int, id_projeto);
    }
    if (id_unidade && id_unidade !== 'Todas') {
        where += ` AND e.id_unidade = @uni`;
        request.input('uni', sql.Int, id_unidade);
    }

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
        ORDER BY p.nome_projeto, u.nome_unidade, e.data_escala, us.nome_completo
    `;

    const result = await request.query(query);

    // Agrupa: { projeto -> { unidade -> { data -> [implantadores] } } }
    const agrupado = {};
    for (const row of result.recordset) {
        const { nome_projeto, nome_unidade, nome_implantador, data_fmt } = row;
        if (!agrupado[nome_projeto]) agrupado[nome_projeto] = {};
        if (!agrupado[nome_projeto][nome_unidade]) agrupado[nome_projeto][nome_unidade] = {};
        if (!agrupado[nome_projeto][nome_unidade][data_fmt])
            agrupado[nome_projeto][nome_unidade][data_fmt] = [];
        agrupado[nome_projeto][nome_unidade][data_fmt].push(nome_implantador);
    }

    res.json(agrupado);
}));

// ==============================================================================
// RELATÓRIO DE ATUAÇÃO / PRESENÇA DE IMPLANTADORES E EQUIPE
// ==============================================================================
router.get('/relatorios/presenca-implantadores', autenticar, autorizarModulo(['rel_presenca_implantador', 'rel_presenca_equipe']), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, id_projeto, id_unidade, motivo } = req.query;
    const pool = await connectToDb();
    const request = pool.request();

    let whereClause = " WHERE e.tipo = 'TRABALHO' ";

    if (dataInicio && dataFim) {
        whereClause += " AND e.data_escala BETWEEN @di AND @df ";
        request.input('di', sql.Date, dataInicio);
        request.input('df', sql.Date, dataFim);
    }
    if (id_projeto && id_projeto !== 'Todos' && id_projeto !== '') {
        whereClause += " AND e.id_projeto = @proj ";
        request.input('proj', sql.Int, id_projeto);
    }
    if (id_unidade && id_unidade !== 'Todas' && id_unidade !== '') {
        whereClause += " AND e.id_unidade = @uni ";
        request.input('uni', sql.Int, id_unidade);
    }
    // Filtro por MOTIVO: mantém só as presenças (escalas) que possuem atividade
    // correspondente (mesmo implantador/projeto/unidade/data) com o motivo escolhido.
    if (motivo && motivo !== 'Todos' && motivo !== '') {
        whereClause += `
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
        request.input('motivo', sql.VarChar, `%${motivo}%`);
    }

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

    const result = await request.query(query);
    res.json(result.recordset);
}));

// ==============================================================================
// PROJETOS ATIVOS - resumo por projeto (unidades, municípios, produtos,
// georreferenciamento e movimento de atividades no período).
// ==============================================================================
router.get('/relatorios/projetos-ativos', autenticar, autorizarModulo('rel_projetos_ativos'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, id_projeto, categoria } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let filtroProj = '';
    if (valido(id_projeto, 'Todos')) {
        filtroProj += ' AND p.id_projeto = @proj ';
        request.input('proj', sql.Int, parseInt(id_projeto, 10));
    }
    if (valido(categoria, 'Todas')) {
        filtroProj += ' AND p.categoria = @cat ';
        request.input('cat', sql.Char(1), String(categoria).slice(0, 1).toUpperCase());
    }
    const reData = /^\d{4}-\d{2}-\d{2}$/;
    const comPeriodo = reData.test(String(dataInicio || '')) && reData.test(String(dataFim || ''));
    let periodo = ' AND 1=0 ';
    if (comPeriodo) periodo = filtroPeriodo(request, dataInicio, dataFim);

    const escopo = filtroEscopo(request, req, 'p.id_projeto', 'implantacao');

    const projetos = (await request.query(`
        SELECT p.id_projeto, p.nome_projeto, p.gera_lotacao, p.categoria,
            (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_projeto = p.id_projeto AND u.ativo = 1) AS unidades_ativas,
            (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_projeto = p.id_projeto AND u.ativo = 0) AS unidades_inativas,
            (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_projeto = p.id_projeto AND u.ativo = 1
                AND u.latitude IS NOT NULL AND u.longitude IS NOT NULL) AS unidades_georref,
            (SELECT COUNT(DISTINCT u.id_cidade) FROM tab_unidades u WHERE u.id_projeto = p.id_projeto AND u.ativo = 1) AS municipios,
            (SELECT STRING_AGG(x.sigla, ', ') WITHIN GROUP (ORDER BY x.sigla) FROM (
                SELECT DISTINCT e.sigla FROM tab_unidades u
                JOIN tab_cidades c ON c.id_cidade = u.id_cidade
                JOIN tab_estados e ON e.id_estado = c.id_estado
                WHERE u.id_projeto = p.id_projeto AND u.ativo = 1) x) AS ufs,
            (SELECT COUNT(*) FROM tab_atividades a WHERE a.id_projeto = p.id_projeto ${periodo}) AS atividades_implantacao,
            (SELECT COUNT(*) FROM tab_proj_atividades a WHERE a.id_projeto = p.id_projeto ${periodo}) AS atividades_projetos,
            (SELECT FORMAT(MAX(${SQL_FIM}), 'dd/MM/yyyy') FROM tab_atividades a WHERE a.id_projeto = p.id_projeto) AS ultima_atividade
        FROM tab_projetos p
        WHERE p.ativo = 1 ${filtroProj} ${escopo}
        ORDER BY p.nome_projeto
    `)).recordset;

    const ids = projetos.map(p => p.id_projeto);
    let produtos = [];
    if (ids.length) {
        const r2 = pool.request();
        const marks = ids.map((id, i) => { r2.input(`p${i}`, sql.Int, id); return `@p${i}`; });
        produtos = (await r2.query(`
            SELECT u.id_projeto, pr.id_produto, pr.nome_produto, COUNT(DISTINCT u.id_unidade) AS unidades
            FROM tab_unidade_produtos up
            JOIN tab_unidades u  ON u.id_unidade = up.id_unidade AND u.ativo = 1
            JOIN tab_produtos pr ON pr.id_produto = up.id_produto AND pr.ativo = 1
            WHERE u.id_projeto IN (${marks.join(',')})
            GROUP BY u.id_projeto, pr.id_produto, pr.nome_produto
            ORDER BY pr.nome_produto
        `)).recordset;
    }

    res.json(projetos.map(p => ({
        ...p,
        produtos: produtos.filter(x => x.id_projeto === p.id_projeto)
            .map(({ id_produto, nome_produto, unidades }) => ({ id_produto, nome_produto, unidades }))
    })));
}));

// ==============================================================================
// MAPA DE UNIDADES - unidades do projeto com coordenadas (lat/lng da unidade;
// sem coordenada, usa o centro do município e marca como aproximada).
// ==============================================================================
router.get('/relatorios/mapa-unidades', autenticar, autorizarModulo('rel_mapa_unidades'), asyncHandler(async (req, res) => {
    const { id_projeto, id_produto, status, id_cidade, uf, categoria } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let where = ' WHERE 1=1 ';

    // Sem projeto definido, exige a categoria (evita carregar todas as unidades).
    if (!valido(id_projeto, 'Todos') && !valido(categoria, 'Todas'))
        return res.status(400).json({ erro: 'Informe o projeto ou a categoria.' });
    if (valido(categoria, 'Todas')) {
        where += ' AND p.categoria = @cat AND p.ativo = 1 ';
        request.input('cat', sql.Char(1), String(categoria).slice(0, 1).toUpperCase());
    }

    if (valido(id_projeto, 'Todos')) {
        where += ' AND u.id_projeto = @proj ';
        request.input('proj', sql.Int, parseInt(id_projeto, 10));
    }
    if (valido(id_produto, 'Todos')) {
        where += ' AND EXISTS (SELECT 1 FROM tab_unidade_produtos up WHERE up.id_unidade = u.id_unidade AND up.id_produto = @prod) ';
        request.input('prod', sql.Int, parseInt(id_produto, 10));
    }
    // Padrão: só unidades ativas. 'Todos' = ativas + inativas.
    if (status !== 'Todos') {
        where += ' AND u.ativo = @ativo ';
        request.input('ativo', sql.Bit, status === 'false' ? 0 : 1);
    }
    if (valido(id_cidade, 'Todos')) {
        where += ' AND u.id_cidade = @cid ';
        request.input('cid', sql.Int, parseInt(id_cidade, 10));
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

    res.json(r.recordset.map(({ ids_produtos, nomes_produtos, lat_cidade, lng_cidade, ...u }) => {
        const temPropria = u.latitude !== null && u.longitude !== null;
        const ids = ids_produtos ? ids_produtos.split(',').map(Number) : [];
        const nomes = nomes_produtos ? nomes_produtos.split('||') : [];
        return {
            ...u,
            latitude: temPropria ? Number(u.latitude) : (lat_cidade !== null ? Number(lat_cidade) : null),
            longitude: temPropria ? Number(u.longitude) : (lng_cidade !== null ? Number(lng_cidade) : null),
            aproximada: !temPropria,
            produtos: ids.map((id, i) => ({ id_produto: id, nome_produto: nomes[i] || '' }))
        };
    }));
}));

// ==============================================================================
// TEMPO MÉDIO DE AÇÃO - Relatório 5 (gestão / pivô: TEMPO)
// ==============================================================================
router.get('/relatorios/tempo-medio-acao', autenticar, autorizarModulo('rel_tempo_medio'), asyncHandler(async (req, res) => {
    const { dataInicio, dataFim, id_projeto, responsavel, status } = req.query;

    const TOL = 0.10; 

    const pool = await connectToDb();
    const request = pool.request();

    let where = ' WHERE 1=1 ';
    if (dataInicio && dataFim) {
        where += ' AND CAST(pa.data_criacao AS DATE) BETWEEN @di AND @df ';
        request.input('di', sql.Date, dataInicio);
        request.input('df', sql.Date, dataFim);
    }
    if (id_projeto && id_projeto !== 'Todos' && id_projeto !== '') {
        where += ' AND pa.id_projeto = @proj ';
        request.input('proj', sql.Int, id_projeto);
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

    const linhas = (await request.query(query)).recordset;

    const classificar = (prev, gasto) => {
        if (!prev || prev <= 0 || !gasto || gasto <= 0) return 'SEM DADOS';
        const r = gasto / prev;
        if (r > 1 + TOL) return 'ESTOURADO';
        if (r < 1 - TOL) return 'LEGAL';
        return 'NA MEDIA';
    };

    const itens = linhas.map(l => ({
        ...l,
        desvio_min: (l.gasto_min || 0) - (l.previsto_min || 0),
        classificacao: classificar(l.previsto_min, l.gasto_min)
    }));

    /* ---------------- agregações ---------------- */
    const comDados = itens.filter(i => i.classificacao !== 'SEM DADOS');
    const soma  = (arr, k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
    const media = (arr, k) => (arr.length ? Math.round(soma(arr, k) / arr.length) : 0);

    const agrupar = (arr, chave) => {
        const m = {};
        arr.forEach(i => {
            const k = i[chave] || (chave === 'responsavel' ? '(Sem responsável)' : '(Sem descrição)');
            (m[k] = m[k] || []).push(i);
        });
        return m;
    };

    const porResponsavel = Object.entries(agrupar(comDados, 'responsavel')).map(([responsavel, arr]) => ({
        responsavel,
        qtd: arr.length,
        previsto_total: soma(arr, 'previsto_min'),
        gasto_total: soma(arr, 'gasto_min'),
        media_previsto: media(arr, 'previsto_min'),
        media_gasto: media(arr, 'gasto_min'),
        media_desvio: media(arr, 'desvio_min'),
        estourados: arr.filter(x => x.classificacao === 'ESTOURADO').length
    })).sort((a, b) => b.media_desvio - a.media_desvio);

    const porAcao = Object.entries(agrupar(comDados, 'descricao')).map(([descricao, arr]) => ({
        descricao,
        qtd: arr.length,
        media_previsto: media(arr, 'previsto_min'),
        media_gasto: media(arr, 'gasto_min'),
        media_desvio: media(arr, 'desvio_min'),
        estourados: arr.filter(x => x.classificacao === 'ESTOURADO').length
    })).sort((a, b) => b.media_gasto - a.media_gasto);

    const estourado = comDados.filter(i => i.classificacao === 'ESTOURADO');
    const naMedia   = comDados.filter(i => i.classificacao === 'NA MEDIA');
    const legal     = comDados.filter(i => i.classificacao === 'LEGAL');

    const resumo = {
        total_itens: itens.length,
        com_dados: comDados.length,
        sem_dados: itens.length - comDados.length,
        previsto_total: soma(comDados, 'previsto_min'),
        gasto_total: soma(comDados, 'gasto_min'),
        media_previsto: media(comDados, 'previsto_min'),
        media_gasto: media(comDados, 'gasto_min'),
        media_desvio: media(comDados, 'desvio_min'),
        qtd_estourado: estourado.length,
        qtd_na_media: naMedia.length,
        qtd_legal: legal.length,
        media_tempo_estourado: media(estourado, 'gasto_min'),
        media_tempo_na_media: media(naMedia, 'gasto_min'),
        media_tempo_legal: media(legal, 'gasto_min')
    };

    res.json({ itens, porResponsavel, porAcao, resumo });
}));

// ==============================================================================
// PLANO DE AÇÃO - STATUS, ETAPAS E EXECUÇÃO (Relatório 6)
// Mesmo motor do painel (services/planoAcaoService) + itens detalhados.
// Respeita a lotação do usuário.
// ==============================================================================
router.get('/relatorios/plano-acao', autenticar, autorizarModulo(['rel_plano_acao', 'plano_acao']), asyncHandler(async (req, res) => {
    const q = req.query;
    const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
    const dt = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null);
    const pool = await connectToDb();
    await PA.sincronizarAtrasos(pool);
    const base = await PA.carregarBase(pool, {
        id_plano: toInt(q.id_plano),
        id_projeto: q.id_projeto && q.id_projeto !== 'Todos' ? toInt(q.id_projeto) : null,
        status_plano: q.status_plano && q.status_plano !== 'Todos' ? String(q.status_plano).slice(0, 30) : null,
        cliente: q.cliente ? String(q.cliente).slice(0, 200) : null,
        dataInicio: dt(q.dataInicio), dataFim: dt(q.dataFim)
    }, (request) => (req.escopo && !req.escopo.global) ? filtroPorProjeto(request, req.escopo, 'p.id_projeto') : '');

    let itens = PA.itensDetalhados(base);
    if (q.responsavel && q.responsavel !== 'Todos') itens = itens.filter(i => i.responsavel === q.responsavel);
    if (q.status && q.status !== 'Todos') itens = itens.filter(i => i.status === q.status);
    if (q.situacao_prazo && q.situacao_prazo !== 'Todos') itens = itens.filter(i => i.situacao_prazo === q.situacao_prazo);

    // Indicadores recalculados sobre o recorte de itens filtrado
    const ids = new Set(itens.map(i => i.id_item));
    const recorte = { ...base, itens: base.itens.filter(i => ids.has(i.id_item)) };
    const painel = PA.montarPainel(recorte);
    res.json({ ...painel, itens });
}));

module.exports = router;
