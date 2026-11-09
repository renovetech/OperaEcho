/* SQL dos painéis do dashboard: escopo do usuário, totais, férias, planos, atividades do dia e notificações. */
const { sql } = require('../../config/database');

const lotacaoPrincipalDoUsuario = (pool, idUsuario) => pool.request()
    .input('id', sql.Int, idUsuario)
    .query(`SELECT id_lotacao FROM tab_usuarios WHERE id_usuario = @id`);

const lotacoesExtrasDoUsuario = (pool, idUsuario) => pool.request()
    .input('id', sql.Int, idUsuario)
    .query("SELECT id_projeto FROM tab_usuario_lotacoes WHERE id_usuario = @id");

/* ---------------------------------- Totais ---------------------------------- */
const contarImplantadores = (pool, filtroUsuarios) => pool.request().query(`
        SELECT COUNT(u.id_usuario) as t
        FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE u.ativo=1 AND f.nome_funcao LIKE '%IMPLANTADOR%' ${filtroUsuarios}
    `);

const contarOperadores = (pool, filtroUsuarios) => pool.request().query(`
        SELECT COUNT(u.id_usuario) as t
        FROM tab_usuarios u
        INNER JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE u.ativo=1 AND f.nome_funcao LIKE '%OPERADOR%' ${filtroUsuarios}
    `);

const contarProjetosAtivos = (pool, filtroProjetos) => pool.request().query(`SELECT COUNT(*) as t FROM tab_projetos WHERE ativo=1 ${filtroProjetos}`);

const contarUnidadesAtivas = (pool, filtroUnidades) => pool.request().query(`SELECT COUNT(*) as t FROM tab_unidades WHERE ativo=1 ${filtroUnidades}`);

/** Produtos: todos os ativos (visão global) ou só os das unidades das lotações informadas. */
function contarProdutos(pool, escopo) {
    let queryProdutos = "SELECT COUNT(*) as t FROM tab_produtos WHERE ativo=1";
    if (!escopo.isGlobal) {
        queryProdutos = `
            SELECT COUNT(DISTINCT up.id_produto) as t
            FROM tab_unidade_produtos up
            INNER JOIN tab_unidades u ON up.id_unidade = u.id_unidade
            INNER JOIN tab_produtos p ON up.id_produto = p.id_produto
            WHERE u.ativo=1 AND p.ativo=1 AND u.id_projeto IN (${escopo.lotacoes.join(',')})
        `;
    }
    return pool.request().query(queryProdutos);
}

/* ------------------------------ Férias e planos ------------------------------ */
const proximasFerias = (pool, filtroUsuarios) => pool.request().query(`
        SELECT u.nome_completo, f.data_inicio, f.data_fim
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        WHERE f.status = 'APROVADO' AND f.data_fim >= CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS DATE)
        ${filtroUsuarios}
        ORDER BY f.data_inicio ASC
    `);

const progressoDosPlanos = (pool, filtroProjetos) => pool.request().query(`
        SELECT
            p.id_plano, p.titulo, ISNULL(proj.nome_projeto, 'Projeto Geral') as nome_projeto,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano) as total_tarefas,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status IN ('Concluido','Concluído','Fechado')) as tarefas_concluidas,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status IN ('Em Andamento','Em andamento')) as tarefas_andamento,
            (SELECT COUNT(*) FROM tab_plano_itens i WHERE i.id_plano = p.id_plano AND i.status = 'Atrasado') as tarefas_atrasadas
        FROM tab_plano_acao p
        LEFT JOIN tab_projetos proj ON p.id_projeto = proj.id_projeto
        WHERE p.status = 'EM ANDAMENTO'
        ${filtroProjetos}
    `);

/* ----------------------------- Atividades do dia ----------------------------- */
/**
 * Atividades do dia com os implantadores vinculados.
 * tabela/juncao: origem (Implantação = tab_atividades; Projetos = tab_proj_atividades).
 * funcoes: nomes de função considerados (constantes internas, não entrada do usuário).
 */
async function atividadesDoDia(pool, data, { tabela, juncao, funcoes, id_lotacao: idLotacao }) {
    const request = pool.request();
    request.input('hoje', sql.Date, data || null);

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

    if (idLotacao && idLotacao !== 0) {
        query += " AND u.id_lotacao = @lotacao";
        request.input('lotacao', sql.Int, idLotacao);
    }

    return (await request.query(query)).recordset;
}

/* ------------------------------- Notificações -------------------------------- */
const dadosDoUsuario = (pool, idUsuario) => pool.request()
    .input('id', sql.Int, idUsuario)
    .query(`
            SELECT u.id_usuario, u.id_lotacao, f.nome_funcao
            FROM tab_usuarios u
            LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
            WHERE u.id_usuario = @id
        `);

/** Cadastros e férias aguardando aprovação, filtrados pela lotação do aprovador. */
const pendenciasDeAprovacao = (pool, filtroAcesso, filtroFerias) => pool.request().query(`
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

module.exports = {
    lotacaoPrincipalDoUsuario, lotacoesExtrasDoUsuario,
    contarImplantadores, contarOperadores, contarProjetosAtivos, contarUnidadesAtivas, contarProdutos,
    proximasFerias, progressoDosPlanos, atividadesDoDia, dadosDoUsuario, pendenciasDeAprovacao
};
