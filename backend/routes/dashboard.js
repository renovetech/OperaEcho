/* routes/dashboard.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');

// ==============================================================================
// FUNÇÃO AUXILIAR: DETERMINAR ESCOPO/LOTAÇÃO DO USUÁRIO
// ==============================================================================
async function getUserScope(pool, rawId) {
    const id_usuario = parseInt(rawId);
    if (!id_usuario || isNaN(id_usuario)) return { isGlobal: false, lotacoes: [] };

    const rUser = await pool.request()
        .input('id', sql.Int, id_usuario)
        .query(`SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id`);

    if (rUser.recordset.length === 0) return { isGlobal: false, lotacoes: [] };
    
    const mainLotacao = rUser.recordset[0].id_lotacao;
    if (mainLotacao === 0 || mainLotacao === null) {
        return { isGlobal: true, lotacoes: [] }; // SEDE - GD enxerga tudo
    }
    
    const rExtras = await pool.request()
        .input('id', sql.Int, id_usuario)
        .query("SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id");
        
    const lotacoes = [mainLotacao, ...rExtras.recordset.map(x => x.id_projeto)];
    return { isGlobal: false, lotacoes: [...new Set(lotacoes)] }; // Array sem duplicatas
}

// ==============================================================================
// TOTAIS
// ==============================================================================
router.get('/dashboard/totais', autenticar, asyncHandler(async (req, res) => {
    const id_usuario = req.usuario.id_usuario; // sempre do token
    const pool = await connectToDb();
    const scope = await getUserScope(pool, id_usuario);
    
    let filterProjetos = "";
    let filterUsuarios = "";
    let filterUnidades = "";
    
    if (!scope.isGlobal && scope.lotacoes.length > 0) {
        const inClause = scope.lotacoes.join(',');
        filterProjetos = ` AND id_projeto IN (${inClause}) `;
        filterUsuarios = ` AND u.id_lotacao IN (${inClause}) `; // Usando alias 'u' para os joins abaixo
        filterUnidades = ` AND id_projeto IN (${inClause}) `;
    } else if (!scope.isGlobal && scope.lotacoes.length === 0) {
        return res.json({ implantadores: 0, operadores: 0, projetos: 0, unidades: 0, produtos: 0 });
    }

    // Contagem de Implantadores da Lotação (ou Geral se GD)
    const rImp = await pool.request().query(`
        SELECT COUNT(u.id_usuario) as t 
        FROM tab_usuarios u 
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao 
        WHERE u.ativo=1 AND f.nome_funcao LIKE '%IMPLANTADOR%' ${filterUsuarios}
    `);

    // Contagem de Operadores da Lotação (apenas funções de operador)
    const rOp = await pool.request().query(`
        SELECT COUNT(u.id_usuario) as t 
        FROM tab_usuarios u 
        INNER JOIN tab_funcoes f ON u.id_funcao = f.id_funcao 
        WHERE u.ativo=1 AND f.nome_funcao LIKE '%OPERADOR%' ${filterUsuarios}
    `);
    
    // Contagem de Projetos Ativos associados
    const r2 = await pool.request().query(`SELECT COUNT(*) as t FROM tab_projetos WHERE ativo=1 ${filterProjetos}`);
    
    // Contagem de Unidades Ativas na(s) lotação(ões)
    const r3 = await pool.request().query(`SELECT COUNT(*) as t FROM tab_unidades WHERE ativo=1 ${filterUnidades}`);
    
    // Contagem de Produtos que pertencem exclusivamente àquelas unidades
    let queryProdutos = "SELECT COUNT(*) as t FROM tab_produtos WHERE ativo=1";
    if (!scope.isGlobal) {
        queryProdutos = `
            SELECT COUNT(DISTINCT up.id_produto) as t 
            FROM tab_unidade_produtos up 
            INNER JOIN tab_unidades u ON up.id_unidade = u.id_unidade 
            INNER JOIN tab_produtos p ON up.id_produto = p.id_produto
            WHERE u.ativo=1 AND p.ativo=1 AND u.id_projeto IN (${scope.lotacoes.join(',')})
        `;
    }
    const r4 = await pool.request().query(queryProdutos);
    
    res.json({ 
        implantadores: rImp.recordset[0].t, 
        operadores: rOp.recordset[0].t,
        projetos: r2.recordset[0].t, 
        unidades: r3.recordset[0].t, 
        produtos: r4.recordset[0].t 
    });
}));

// ==============================================================================
// PRÓXIMAS FÉRIAS
// ==============================================================================
router.get('/dashboard/proximas-ferias', autenticar, asyncHandler(async (req, res) => {
    const id_usuario = req.usuario.id_usuario; // sempre do token
    const pool = await connectToDb();
    const scope = await getUserScope(pool, id_usuario);
    
    let filterUsuarios = "";
    if (!scope.isGlobal && scope.lotacoes.length > 0) {
        filterUsuarios = ` AND u.id_lotacao IN (${scope.lotacoes.join(',')}) `;
    } else if (!scope.isGlobal && scope.lotacoes.length === 0) {
        return res.json([]);
    }

    const r = await pool.request().query(`
        SELECT u.nome_completo, f.data_inicio, f.data_fim
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        WHERE f.status = 'APROVADO' AND f.data_fim >= CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS DATE)
        ${filterUsuarios}
        ORDER BY f.data_inicio ASC
    `);
    res.json(r.recordset);
}));

// ==============================================================================
// PROGRESSO PLANOS DE AÇÃO
// ==============================================================================
router.get('/dashboard/progresso-planos', autenticar, asyncHandler(async (req, res) => {
    const id_usuario = req.usuario.id_usuario; // sempre do token
    const pool = await connectToDb();
    const scope = await getUserScope(pool, id_usuario);
    
    let filterProjetos = "";
    if (!scope.isGlobal && scope.lotacoes.length > 0) {
        filterProjetos = ` AND p.id_projeto IN (${scope.lotacoes.join(',')}) `;
    } else if (!scope.isGlobal && scope.lotacoes.length === 0) {
        return res.json([]);
    }

    const r = await pool.request().query(`
        SELECT 
            p.id_plano, p.titulo, ISNULL(proj.nome_projeto, 'Projeto Geral') as nome_projeto,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano) as total_tarefas,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status IN ('Concluido','Concluído','Fechado')) as tarefas_concluidas,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status IN ('Em Andamento','Em andamento')) as tarefas_andamento,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status = 'Atrasado') as tarefas_atrasadas
        FROM tab_plano_acao p
        LEFT JOIN tab_projetos proj ON p.id_projeto = proj.id_projeto
        WHERE p.status = 'EM ANDAMENTO'
        ${filterProjetos}
    `);

    const planosProcessados = r.recordset.map(p => {
        const total = p.total_tarefas || 1;
        const percConcluido = Math.round((p.tarefas_concluidas / total) * 100);
        const percAndamento = Math.round((p.tarefas_andamento / total) * 100);
        const percAtrasado = Math.round((p.tarefas_atrasadas / total) * 100);
        return {
            id_plano: p.id_plano, titulo: p.titulo, nome_projeto: p.nome_projeto,
            total_unidades: p.total_tarefas,
            unidades_concluidas: p.tarefas_concluidas,
            unidades_andamento: p.tarefas_andamento,
            unidades_atrasadas: p.tarefas_atrasadas,
            perc_concluido: percConcluido,
            perc_andamento: percAndamento,
            perc_atrasado: percAtrasado,
            perc_restante: Math.max(0, 100 - percConcluido - percAndamento - percAtrasado)
        };
    });
    res.json(planosProcessados);
}));

// ==============================================================================
// ATIVIDADES REGISTRADAS HOJE (RESUMO DO DIA)
// ==============================================================================
// ------------------------------------------------------------------------------
// HELPER: atividades do dia agrupadas por projeto.
// opts:
//   - tabela / juncao: origem (Implantação = tab_atividades; Projetos = tab_proj_atividades)
//   - funcoes: lista de funções consideradas no quantitativo (ex.: ['IMPLANTADOR'])
//   - id_lotacao: quando inteiro positivo, restringe pela lotação (visão "sua equipe")
// ------------------------------------------------------------------------------
async function buscarAtividadesHoje(pool, data, opts = {}) {
    const {
        tabela = 'tab_atividades',
        juncao = 'tab_atividade_implantadores',
        funcoes = null,
        id_lotacao = null
    } = opts;

    const request = pool.request();
    request.input('hoje', sql.Date, data || null);

    // Filtro por FUNÇÃO (valores são constantes internas, não entrada do usuário).
    let filtroFuncao = '';
    if (Array.isArray(funcoes) && funcoes.length > 0) {
        const inFuncoes = funcoes.map(f => `'${String(f).toUpperCase()}'`).join(', ');
        filtroFuncao = ` AND UPPER(LTRIM(RTRIM(f.nome_funcao))) IN (${inFuncoes}) `;
    }

    let query = `
        WITH TodosVinculos AS (
            SELECT id_atividade, id_implantador FROM ${juncao}
            UNION 
            SELECT id_atividade, id_implantador FROM ${tabela} WHERE id_implantador IS NOT NULL
        )
        SELECT 
            a.id_atividade,
            ISNULL(proj.nome_projeto, 'Equipe Geral') as nome_projeto, 
            u.nome_completo as implantador,
            un.nome_unidade as unidade,
            a.motivos as motivo
        FROM TodosVinculos tv
        INNER JOIN ${tabela} a ON tv.id_atividade = a.id_atividade
        INNER JOIN tab_usuarios u ON tv.id_implantador = u.id_usuario
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        LEFT JOIN tab_projetos proj ON a.id_projeto = proj.id_projeto
        LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade
        WHERE CAST(a.data_atividade AS DATE) =
              COALESCE(@hoje, CAST(GETDATE() AT TIME ZONE 'UTC'
                       AT TIME ZONE 'E. South America Standard Time' AS DATE))
        ${filtroFuncao}
    `;

    if (id_lotacao && id_lotacao !== 0) {
        query += " AND u.id_lotacao = @lotacao";
        request.input('lotacao', sql.Int, id_lotacao);
    }

    const result = await request.query(query);

    const agrupado = result.recordset.reduce((acc, curr) => {
        const projNome = curr.nome_projeto;

        if (!acc[projNome]) {
            acc[projNome] = {
                nome: projNome,
                atividadesUnicas: new Set(),
                implantadores: new Set(),
                unidades: new Set(),
                motivos: new Set()
            };
        }

        acc[projNome].atividadesUnicas.add(curr.id_atividade);
        if (curr.implantador) acc[projNome].implantadores.add(curr.implantador);
        if (curr.unidade) acc[projNome].unidades.add(curr.unidade);
        if (curr.motivo) acc[projNome].motivos.add(curr.motivo);

        return acc;
    }, {});

    const por_equipe = Object.values(agrupado).map(item => ({
        nome: item.nome,
        total: item.atividadesUnicas.size,
        implantador: Array.from(item.implantadores).join(', '),
        unidade: Array.from(item.unidades).join(', '),
        motivo: Array.from(item.motivos).join(' | ')
    })).sort((a, b) => b.total - a.total);

    const total = por_equipe.reduce((acc, curr) => acc + curr.total, 0);
    return { total, por_equipe };
}

// Barra IMPLANTAÇÃO: SOMENTE função IMPLANTADOR, em tab_atividades, consolidado
// (sem isolamento por lotação). Visível para todas as funções.
router.get('/dashboard/atividades-hoje', autenticar, asyncHandler(async (req, res) => {
    const { data } = req.query;
    const pool = await connectToDb();
    res.json(await buscarAtividadesHoje(pool, data, {
        tabela: 'tab_atividades',
        juncao: 'tab_atividade_implantadores',
        funcoes: ['IMPLANTADOR'],
        id_lotacao: null
    }));
}));

// Barra PROJETOS ("todos os projetos"): SOMENTE funções OPERADOR e ANALISTA, em
// tab_proj_atividades, sem isolamento por lotação. Visível para todas as funções.
router.get('/dashboard/atividades-hoje-projetos', autenticar, asyncHandler(async (req, res) => {
    const { data } = req.query;
    const pool = await connectToDb();
    res.json(await buscarAtividadesHoje(pool, data, {
        tabela: 'tab_proj_atividades',
        juncao: 'tab_proj_atividade_implantadores',
        funcoes: ['OPERADOR', 'ANALISTA'],
        id_lotacao: null
    }));
}));

// ==============================================================================
// NOTIFICAÇÕES (APROVAÇÃO DE ACESSO FILTRADA POR LOTAÇÃO)
// ==============================================================================
router.get('/dashboard/notificacoes', autenticar, asyncHandler(async (req, res) => {
    const id_usuario = req.usuario.id_usuario; // sempre do token
    if (!id_usuario) return res.json([]);

    const pool = await connectToDb();
    const rUser = await pool.request()
        .input('id', sql.Int, id_usuario)
        .query(`
            SELECT u.id_usuario, u.id_lotacao, f.nome_funcao 
            FROM tab_usuarios u
            LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
            WHERE u.id_usuario = @id
        `);

    if (rUser.recordset.length === 0) return res.json([]);

    const usuarioLogado = rUser.recordset[0];
    const nomeFuncao = (usuarioLogado.nome_funcao || '').toUpperCase();

    const cargosAprovadores = ['LÍDER DE PROJETO', 'COORDENADOR DE IMPLANTAÇÃO', 'GERENTE', 'ADMINISTRADOR'];
    if (!cargosAprovadores.some(cargo => nomeFuncao.includes(cargo)) && nomeFuncao !== 'ADMINISTRADOR') {
        return res.json([]);
    }

    // Escopo COMPLETO do aprovador: lotação principal + lotações extras
    // (tab_usuario_lotacoes). Sem isto, um Líder de Projeto vinculado à lotação
    // apenas como extra (ex.: IBDPA Carapebus) não recebia a notificação.
    const scope = await getUserScope(pool, id_usuario);

    let filtroAcesso;   // filtro sobre tab_usuarios (coluna id_lotacao)
    let filtroFerias;   // filtro sobre o dono da férias (u.id_lotacao)

    if (scope.isGlobal) {
        filtroAcesso = " AND (id_lotacao IS NULL OR id_lotacao = 0) ";
        filtroFerias = " AND (u.id_lotacao IS NULL OR u.id_lotacao = 0) ";
    } else if (scope.lotacoes.length === 0) {
        return res.json([]);
    } else {
        const inClause = scope.lotacoes.join(',');
        filtroAcesso = ` AND id_lotacao IN (${inClause}) `;
        filtroFerias = ` AND u.id_lotacao IN (${inClause}) `;
    }

    const result = await pool.request().query(`
        SELECT 'acesso' AS tipo, id_usuario, nome_completo, data_criacao,
               'Aprovação de Cadastro' AS titulo,
               'Novo usuário aguardando liberação na sua lotação.' AS mensagem
        FROM tab_usuarios
        WHERE ativo = 0 AND perfil_acesso = 'Solicitante'
        ${filtroAcesso}

        UNION ALL

        SELECT 'ferias' AS tipo, u.id_usuario, u.nome_completo, fe.data_inicio AS data_criacao,
               'Solicitação de Férias' AS titulo,
               'Nova solicitação de férias aguardando aprovação na sua lotação.' AS mensagem
        FROM tab_ferias fe
        INNER JOIN tab_usuarios u ON fe.id_usuario = u.id_usuario
        WHERE UPPER(fe.status) IN ('PENDENTE', 'AGUARDANDO', 'SOLICITADO')
        ${filtroFerias}

        ORDER BY data_criacao DESC
    `);
    res.json(result.recordset);
}));

// ==============================================================================
// DADOS DOS PAINÉIS (MAPA, PRODUTIVIDADE, MÉTRICAS)
// ==============================================================================
router.get('/dashboard/mapa-implantacao', autenticar, asyncHandler(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let query = `SELECT a.id_atividade, a.profissionais_env, a.motivos, a.data_inicio, a.data_fim, p.nome_projeto, u.nome_unidade, c.nome_cidade as cidade, e.sigla as uf, c.latitude, c.longitude FROM tab_atividades a JOIN tab_projetos p ON a.id_projeto = p.id_projeto JOIN tab_unidades u ON a.id_unidade = u.id_unidade JOIN tab_cidades c ON u.id_cidade = c.id_cidade JOIN tab_estados e ON c.id_estado = e.id_estado WHERE 1=1`;
    if (dataInicio && dataFim) {
        query += ` AND a.data_atividade <= @DataFim AND (a.data_fim IS NULL OR a.data_fim >= @DataInicio)`;
        request.input('DataInicio', sql.Date, new Date(dataInicio));
        request.input('DataFim', sql.Date, new Date(dataFim));
    }
    const result = await request.query(query);
    res.json(result.recordset);
}));

router.get('/dashboard/produtividade-produtos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const resGeral = await pool.request().query(`SELECT p.nome_produto, COUNT(up.id_unidade) as qtd_unidades FROM tab_produtos p LEFT JOIN tab_unidade_produtos up ON p.id_produto = up.id_produto WHERE p.ativo = 1 GROUP BY p.nome_produto ORDER BY qtd_unidades DESC`);
    const resImplantadores = await pool.request().query(`SELECT u.nome_completo as implantador, p.nome_produto, COUNT(DISTINCT a.id_atividade) as qtd_atividades FROM tab_usuarios u INNER JOIN tab_atividade_implantadores ai ON u.id_usuario = ai.id_implantador INNER JOIN tab_atividades a ON ai.id_atividade = a.id_atividade CROSS APPLY STRING_SPLIT(a.produtos_trabalhados, ',') s INNER JOIN tab_produtos p ON TRIM(s.value) = p.nome_produto GROUP BY u.nome_completo, p.nome_produto ORDER BY u.nome_completo, qtd_atividades DESC`);
    res.json({ geral: resGeral.recordset, detalheImplantadores: resImplantadores.recordset });
}));

router.get('/dashboard/detalhes-produto', autenticar, asyncHandler(async (req, res) => {
    const { nome_produto, dataInicio, dataFim } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let query = `WITH TodosVinculos AS (SELECT id_atividade, id_implantador FROM tab_atividade_implantadores UNION SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL) SELECT ISNULL(u.nome_completo, 'Não Informado') as implantador, p.nome_projeto as projeto, un.nome_unidade as unidade, FORMAT(a.data_atividade, 'yyyy-MM-dd') + 'T12:00:00' as data_atividade, a.motivos FROM TodosVinculos tv INNER JOIN tab_atividades a ON tv.id_atividade = a.id_atividade LEFT JOIN tab_usuarios u ON tv.id_implantador = u.id_usuario LEFT JOIN tab_projetos p ON a.id_projeto = p.id_projeto LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade CROSS APPLY STRING_SPLIT(a.produtos_trabalhados, ',') s WHERE TRIM(s.value) = @prod`;
    request.input('prod', sql.VarChar, nome_produto);
    if (dataInicio && dataFim) {
        query += " AND a.data_atividade BETWEEN @di AND @df";
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    query += " ORDER BY a.data_atividade DESC, un.nome_unidade";
    const result = await request.query(query);
    res.json(result.recordset);
}));

router.get('/dashboard/estatisticas-produtividade', autenticar, asyncHandler(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    const pool = await connectToDb();
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
    const result = await request.query(query);
    res.json(result.recordset);
}));

router.get('/dashboard/detalhe-produtividade', autenticar, asyncHandler(async (req, res) => {
    const { implantador, motivo, dataInicio, dataFim } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let query = `WITH TodosImplantadores AS (SELECT id_atividade, id_implantador FROM tab_atividade_implantadores UNION SELECT id_atividade, id_implantador FROM tab_atividades WHERE id_implantador IS NOT NULL) SELECT FORMAT(a.data_atividade, 'yyyy-MM-dd') + 'T12:00:00' as data, p.nome_projeto as projeto, un.nome_unidade as unidade, a.profissionais_env FROM TodosImplantadores ti INNER JOIN tab_atividades a ON ti.id_atividade = a.id_atividade INNER JOIN tab_usuarios u ON ti.id_implantador = u.id_usuario INNER JOIN tab_unidades un ON a.id_unidade = un.id_unidade INNER JOIN tab_projetos p ON a.id_projeto = p.id_projeto WHERE u.nome_completo = @imp`;
    request.input('imp', sql.VarChar, implantador);
    if (motivo) { query += " AND a.motivos LIKE @mot"; request.input('mot', sql.VarChar, `%${motivo}%`); }
    if (dataInicio && dataFim) {
        query += " AND (a.data_atividade >= @di AND a.data_atividade <= @df)";
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    query += " ORDER BY a.data_atividade DESC";
    const result = await request.query(query);
    res.json(result.recordset);
}));

router.get('/dashboard/metricas-implantacao', autenticar, asyncHandler(async (req, res) => {
    const { dataInicio, dataFim } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    
    let query = `
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
            WHERE 1=1 ${dataInicio && dataFim ? " AND a.data_atividade BETWEEN @di AND @df" : ""}
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
        ${dataInicio && dataFim ? " AND a.data_atividade BETWEEN @di AND @df" : ""}
        GROUP BY u.nome_completo, TRIM(s.value) 
        HAVING COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Implantação%' THEN a.id_atividade END) > 0 
            OR COUNT(DISTINCT CASE WHEN a.motivos LIKE '%Treinamento%' THEN a.id_atividade END) > 0 
        ORDER BY u.nome_completo, produto
    `;

    if (dataInicio && dataFim) {
        request.input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim);
    }
    const result = await request.query(query);
    res.json(result.recordset);
}));

// ==============================================================================
// PRODUTOS DETALHES (DASHBOARD)
// ==============================================================================
router.get('/dashboard/produtos-detalhes', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT p.nome_produto, COUNT(t.id_produto) as total FROM tab_produtos p LEFT JOIN tab_unidade_produtos t ON p.id_produto=t.id_produto WHERE p.ativo=1 GROUP BY p.nome_produto ORDER BY total DESC");
    res.json(r.recordset);
}));

module.exports = router;