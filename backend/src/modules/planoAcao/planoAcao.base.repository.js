/* SQL de carga analítica do Plano de Ação (planos, itens, equipe e apontamentos) e das regras automáticas de situação. */
const { sql } = require('../../config/database');
const { PLANO, nomeCurto, hojeISO } = require('./planoAcao.dominio');

const TAMANHO_LOTE = 500;

/**
 * Marca como "Atrasado" os itens com prazo previsto vencido e não fechados,
 * em planos ativos. idPlano opcional (null = todos).
 */
async function sincronizarAtrasos(pool, idPlano = null) {
    const r = pool.request().input('hoje', sql.Date, hojeISO());
    let filtro = '';
    if (idPlano) { filtro = ' AND i.id_plano = @id '; r.input('id', sql.Int, idPlano); }
    await r.query(`
        UPDATE i SET i.status = 'Atrasado'
        FROM tab_plano_itens i
        JOIN tab_plano_acao p ON p.id_plano = i.id_plano
        WHERE p.status = 'EM ANDAMENTO'
          AND i.data_fim IS NOT NULL AND i.data_fim < @hoje
          AND i.status IN ('A Iniciar', 'Em andamento', 'Em Andamento', 'Pendente') ${filtro}`);
}

/**
 * Status do plano derivado dos itens: 100% fechado => CONCLUÍDO;
 * havendo item reaberto num plano CONCLUÍDO => volta a EM ANDAMENTO.
 * ENCERRADO é decisão manual e não é alterado aqui.
 */
async function recalcularStatusPlano(reqFactory, idPlano) {
    const r = await reqFactory().input('id', sql.Int, idPlano).query(`
        SELECT p.status,
               (SELECT COUNT(*) FROM tab_plano_itens WHERE id_plano = @id) AS total,
               (SELECT COUNT(*) FROM tab_plano_itens WHERE id_plano = @id AND status IN ('Fechado','Concluído','Concluido')) AS fechados
        FROM tab_plano_acao p WHERE p.id_plano = @id`);
    const p = r.recordset[0];
    if (!p || p.status === PLANO.ENCERRADO) return p ? p.status : null;
    const novo = p.total > 0 && p.total === p.fechados ? PLANO.CONCLUIDO : PLANO.ANDAMENTO;
    if (novo !== p.status) {
        await reqFactory().input('id', sql.Int, idPlano).input('st', sql.VarChar, novo)
            .query('UPDATE tab_plano_acao SET status = @st, data_atualizacao = GETDATE() WHERE id_plano = @id');
    }
    return novo;
}

/** Monta o WHERE dos planos e registra os parâmetros no pedido. */
function filtrarPlanos(rp, filtros, extraWhere) {
    let where = ' WHERE 1=1 ';
    if (filtros.token) { where += ' AND p.token_publico = @tok AND p.publico = 1 '; rp.input('tok', sql.UniqueIdentifier, filtros.token); }
    if (filtros.somentePublicos) where += ' AND p.publico = 1 ';
    if (filtros.id_plano) { where += ' AND p.id_plano = @idp '; rp.input('idp', sql.Int, filtros.id_plano); }
    if (filtros.id_projeto) { where += ' AND p.id_projeto = @proj '; rp.input('proj', sql.Int, filtros.id_projeto); }
    if (filtros.status_plano) { where += ' AND p.status = @stp '; rp.input('stp', sql.VarChar, filtros.status_plano); }
    if (filtros.cliente) {
        where += ` AND (p.cliente LIKE @cli OR (p.cliente IS NULL AND pj.nome_projeto LIKE @cli)
                    OR EXISTS (SELECT 1 FROM tab_plano_itens ic WHERE ic.id_plano = p.id_plano AND ic.cliente LIKE @cli)) `;
        rp.input('cli', sql.VarChar, `%${filtros.cliente}%`);
    }
    if (filtros.busca) { where += ' AND (p.titulo LIKE @bus OR p.cliente LIKE @bus OR pj.nome_projeto LIKE @bus) '; rp.input('bus', sql.VarChar, `%${filtros.busca}%`); }
    if (filtros.data) { where += ' AND CAST(p.data_criacao AS DATE) = @dtc '; rp.input('dtc', sql.Date, filtros.data); }
    if (filtros.dataInicio && filtros.dataFim) {
        where += ' AND CAST(p.data_criacao AS DATE) BETWEEN @di AND @df ';
        rp.input('di', sql.Date, filtros.dataInicio); rp.input('df', sql.Date, filtros.dataFim);
    }
    if (extraWhere) where += extraWhere(rp);
    return where;
}

async function listarPlanos(pool, filtros, extraWhere) {
    const rp = pool.request();
    const where = filtrarPlanos(rp, filtros, extraWhere);
    const resultado = await rp.query(`
        SELECT p.id_plano, p.titulo, p.status, p.sub_tipo, p.cliente, p.descricao, p.data_criacao,
               p.data_inicio_prevista, p.data_fim_prevista, p.data_encerramento, p.publico, p.token_publico, p.criado_por,
               p.id_projeto, pj.nome_projeto, pr.nome_produto
        FROM tab_plano_acao p
        LEFT JOIN tab_projetos pj ON pj.id_projeto = p.id_projeto
        LEFT JOIN tab_produtos pr ON pr.id_produto = p.id_produto
        ${where}
        ORDER BY p.data_criacao DESC`);
    return resultado.recordset.map(p => ({ ...p, token_publico: p.token_publico ? String(p.token_publico).toLowerCase() : null }));
}

/** Pedido com um parâmetro por plano do lote; devolve o pedido e a lista de marcadores. */
function pedidoDoLote(pool, lote) {
    const r = pool.request();
    const marcas = lote.map((id, k) => { r.input(`p${k}`, sql.Int, id); return `@p${k}`; }).join(',');
    return { r, marcas };
}

function consultarItens(pool, lote) {
    const { r, marcas } = pedidoDoLote(pool, lote);
    return r.query(`
                SELECT i.id_item, i.id_plano, i.id_unidade, u.nome_unidade, i.modulo, i.titulo AS grupo,
                       i.descricao, i.responsavel, i.cliente, i.observacao, i.status, i.prioridade, i.ordem,
                       i.percentual, i.data_inicio, i.data_fim, i.data_inicio_real, i.data_fim_real,
                       i.tempo_previsto, i.tempo_gasto, i.horas_trabalhadas
                FROM tab_plano_itens i
                LEFT JOIN tab_unidades u ON u.id_unidade = i.id_unidade
                WHERE i.id_plano IN (${marcas})`);
}

function consultarEquipe(pool, lote) {
    const { r, marcas } = pedidoDoLote(pool, lote);
    return r.query(`
                    SELECT e.id_item, i.id_plano, e.id_usuario, us.nome_completo
                    FROM tab_plano_item_equipe e
                    JOIN tab_plano_itens i ON i.id_item = e.id_item
                    JOIN tab_usuarios us ON us.id_usuario = e.id_usuario
                    WHERE i.id_plano IN (${marcas})`);
}

function consultarApontamentos(pool, lote) {
    const { r, marcas } = pedidoDoLote(pool, lote);
    return r.query(`
                    SELECT a.id_item, a.id_plano, a.id_usuario, us.nome_completo, a.data_execucao, a.minutos
                    FROM tab_plano_apontamentos a
                    JOIN tab_usuarios us ON us.id_usuario = a.id_usuario
                    WHERE a.id_plano IN (${marcas})`);
}

/**
 * Carrega planos + itens para indicadores.
 * filtros: { id_plano?, id_projeto?, status_plano?, cliente?, busca?, data?, dataInicio?, dataFim?, somentePublicos?, token? }
 * extraWhere: função (request) => trecho SQL adicional sobre "p" (ex.: lotação).
 */
async function carregarBase(pool, filtros = {}, extraWhere = null) {
    const planos = await listarPlanos(pool, filtros, extraWhere);
    if (!planos.length) return { planos: [], itens: [], equipe: [], apontamentos: [] };

    // Itens dos planos (IN parametrizado em lotes)
    const ids = planos.map(p => p.id_plano);
    const itens = [], equipe = [], apontamentos = [];
    for (let i = 0; i < ids.length; i += TAMANHO_LOTE) {
        const lote = ids.slice(i, i + TAMANHO_LOTE);
        const [rI, rE, rA] = await Promise.all([consultarItens(pool, lote), consultarEquipe(pool, lote), consultarApontamentos(pool, lote)]);
        itens.push(...rI.recordset);
        equipe.push(...rE.recordset.map(x => ({ ...x, nome_completo: nomeCurto(x.nome_completo) })));
        apontamentos.push(...rA.recordset.map(x => ({ ...x, nome_completo: nomeCurto(x.nome_completo) })));
    }
    return { planos, itens, equipe, apontamentos };
}

module.exports = { sincronizarAtrasos, recalcularStatusPlano, carregarBase };
