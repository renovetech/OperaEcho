/* SQL dos itens (ações) do plano: inclusão, ordem, exclusão, etapas, equipe e a gravação em lote da grade.
 * Funções com `pool` leem fora de transação; as com `R` (fábrica de pedidos) rodam dentro da transação. */
const { sql } = require('../../config/database');
const { PRIORIDADES } = require('./planoAcao.dominio');

const PRIORIDADE_PADRAO = 'Alta';
const TAMANHO_LOTE_ITENS = 1000;

async function buscarItem(pool, idItem) {
    const r = await pool.request().input('id', sql.Int, idItem).query('SELECT * FROM tab_plano_itens WHERE id_item = @id');
    return r.recordset[0];
}

async function inserirItem(R, d) {
    const r = await R()
        .input('p', sql.Int, d.id_plano)
        .input('u', sql.Int, d.id_unidade || null)
        .input('grupo', sql.VarChar, d.id_unidade ? null : (d.grupo || 'GERAL'))
        .input('mod', sql.VarChar, d.modulo || null)
        .input('desc', sql.VarChar, d.descricao)
        .input('resp', sql.VarChar, d.responsavel || null)
        .input('cli', sql.VarChar, d.cliente || null)
        .input('prio', sql.VarChar, PRIORIDADES.includes(d.prioridade) ? d.prioridade : PRIORIDADE_PADRAO)
        .input('di', sql.Date, d.data_inicio || null)
        .input('df', sql.Date, d.data_fim || null)
        .input('ord', sql.Int, d.ordem)
        .input('cp', sql.Int, d.criado_por || null)
        .query(`INSERT INTO tab_plano_itens
                    (id_plano, id_unidade, titulo, modulo, descricao, responsavel, cliente, status, prioridade,
                     data_inicio, data_fim, ordem, criado_por, data_atualizacao)
                OUTPUT INSERTED.id_item
                VALUES (@p, @u, @grupo, @mod, @desc, @resp, @cli, 'A Iniciar', @prio, @di, @df, @ord, @cp, GETDATE())`);
    return r.recordset[0].id_item;
}

/* ------------------------------ apontamentos ------------------------------ */
async function listarApontamentos(pool, idItem) {
    const r = await pool.request().input('id', sql.Int, idItem).query(`
        SELECT a.id_apontamento, a.id_usuario, us.nome_completo, a.data_execucao, a.minutos, a.descricao, a.data_registro, a.registrado_por
        FROM tab_plano_apontamentos a
        JOIN tab_usuarios us ON us.id_usuario = a.id_usuario
        WHERE a.id_item = @id
        ORDER BY a.data_execucao DESC, a.id_apontamento DESC`);
    return r.recordset;
}

async function pessoaNaEquipe(pool, idItem, idUsuario) {
    const r = await pool.request().input('i', sql.Int, idItem).input('u', sql.Int, idUsuario)
        .query('SELECT 1 AS ok FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u');
    return r.recordset.length > 0;
}

async function minutosApontadosNoDia(pool, idUsuario, dataExecucao) {
    const r = await pool.request().input('u', sql.Int, idUsuario).input('d', sql.Date, dataExecucao)
        .query('SELECT ISNULL(SUM(minutos), 0) AS total FROM tab_plano_apontamentos WHERE id_usuario = @u AND data_execucao = @d');
    return r.recordset[0].total;
}

async function inserirApontamento(R, a) {
    await R().input('i', sql.Int, a.idItem).input('p', sql.Int, a.idPlano).input('u', sql.Int, a.idUsuario)
        .input('d', sql.Date, a.dataExecucao).input('m', sql.Int, a.minutos).input('desc', sql.VarChar, a.descricao)
        .input('rp', sql.Int, a.registradoPor)
        .query(`INSERT INTO tab_plano_apontamentos (id_item, id_plano, id_usuario, data_execucao, minutos, descricao, registrado_por)
                    VALUES (@i, @p, @u, @d, @m, @desc, @rp)`);
}

async function garantirNaEquipe(R, idItem, idUsuario) {
    await R().input('i', sql.Int, idItem).input('u', sql.Int, idUsuario).query(`
            IF NOT EXISTS (SELECT 1 FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u)
                INSERT INTO tab_plano_item_equipe (id_item, id_usuario) VALUES (@i, @u)`);
}

async function iniciarAndamento(R, idItem, inicio, inicioReal) {
    await R().input('i', sql.Int, idItem).input('ini', sql.DateTime, inicio).input('dir', sql.Date, inicioReal)
        .query(`UPDATE tab_plano_itens SET status = 'Em andamento', dt_inicio_andamento = @ini, data_inicio_real = @dir WHERE id_item = @i`);
}

async function ajustarInicioReal(R, idItem, inicioReal) {
    await R().input('i', sql.Int, idItem).input('dir', sql.Date, inicioReal)
        .query('UPDATE tab_plano_itens SET data_inicio_real = @dir WHERE id_item = @i');
}

async function recalcularHoras(R, idItem) {
    await R().input('id', sql.Int, idItem).query(`
        UPDATE tab_plano_itens
        SET horas_trabalhadas = (SELECT NULLIF(SUM(minutos), 0) FROM tab_plano_apontamentos WHERE id_item = @id),
            data_atualizacao = GETDATE()
        WHERE id_item = @id`);
}

async function buscarApontamento(pool, idApontamento) {
    const r = await pool.request().input('id', sql.Int, idApontamento).query('SELECT * FROM tab_plano_apontamentos WHERE id_apontamento = @id');
    return r.recordset[0];
}

async function excluirApontamento(R, idApontamento) {
    await R().input('id', sql.Int, idApontamento).query('DELETE FROM tab_plano_apontamentos WHERE id_apontamento = @id');
}

async function contarApontamentosDoItem(pool, idItem) {
    const r = await pool.request().input('i', sql.Int, idItem).query('SELECT COUNT(*) AS n FROM tab_plano_apontamentos WHERE id_item = @i');
    return r.recordset[0].n;
}

/* ------------------------------ ordem e exclusão -------------------------- */
/** Vizinho do item (acima ou abaixo) dentro do mesmo grupo/módulo/unidade. */
async function buscarVizinho(pool, item, sobe) {
    const r = await pool.request()
        .input('p', sql.Int, item.id_plano).input('u', sql.Int, item.id_unidade)
        .input('m', sql.VarChar, item.modulo).input('g', sql.VarChar, item.id_unidade ? null : item.titulo)
        .input('o', sql.Int, item.ordem || 0).input('id', sql.Int, item.id_item)
        .query(`SELECT TOP 1 id_item, ordem FROM tab_plano_itens
                WHERE id_plano = @p AND id_item <> @id
                  AND ISNULL(id_unidade, -1) = ISNULL(@u, -1)
                  AND ISNULL(modulo, '') = ISNULL(@m, '')
                  AND (@u IS NOT NULL OR ISNULL(titulo, 'GERAL') = ISNULL(@g, 'GERAL'))
                  AND ${sobe ? '(ISNULL(ordem,0) < @o OR (ISNULL(ordem,0) = @o AND id_item < @id))' : '(ISNULL(ordem,0) > @o OR (ISNULL(ordem,0) = @o AND id_item > @id))'}
                ORDER BY ISNULL(ordem,0) ${sobe ? 'DESC' : 'ASC'}, id_item ${sobe ? 'DESC' : 'ASC'}`);
    return r.recordset[0];
}

async function trocarOrdem(R, idA, ordemA, idB, ordemB) {
    await R().input('a', sql.Int, idA).input('oa', sql.Int, ordemA).input('b', sql.Int, idB).input('ob', sql.Int, ordemB)
        .query('UPDATE tab_plano_itens SET ordem = @oa WHERE id_item = @a; UPDATE tab_plano_itens SET ordem = @ob WHERE id_item = @b;');
}

async function excluirItem(R, idItem) {
    await R().input('i', sql.Int, idItem).query(`
            DELETE FROM tab_plano_apontamentos WHERE id_item = @i;
            DELETE FROM tab_plano_item_equipe WHERE id_item = @i;
            DELETE FROM tab_plano_itens WHERE id_item = @i;`);
}

/** Contexto (plano, unidade, módulo, grupo) em que a ordem das ações é calculada. */
const FILTRO_CONTEXTO = `id_plano = @p AND ISNULL(id_unidade,-1) = ISNULL(@u,-1) AND ISNULL(modulo,'') = ISNULL(@m,'')
                           AND (@u IS NOT NULL OR ISNULL(titulo,'GERAL') = ISNULL(@g,'GERAL'))`;
const comContexto = (r, c) => r.input('p', sql.Int, c.idPlano).input('u', sql.Int, c.idUnidade).input('m', sql.VarChar, c.modulo).input('g', sql.VarChar, c.grupo);

async function ordemDoItemNoContexto(R, contexto, idItem) {
    const ra = await comContexto(R(), contexto).input('a', sql.Int, idItem).query(`SELECT ordem FROM tab_plano_itens WHERE id_item = @a AND ${FILTRO_CONTEXTO}`);
    return ra.recordset.length ? (ra.recordset[0].ordem || 0) : null;
}

async function abrirEspacoNaOrdem(R, contexto, ordem) {
    await comContexto(R(), contexto).input('o', sql.Int, ordem).query(`UPDATE tab_plano_itens SET ordem = ordem + 1 WHERE ${FILTRO_CONTEXTO} AND ISNULL(ordem,0) >= @o`);
}

async function proximaOrdem(R, contexto) {
    const rm = await comContexto(R(), contexto).query(`SELECT ISNULL(MAX(ordem), 0) + 1 AS o FROM tab_plano_itens WHERE ${FILTRO_CONTEXTO}`);
    return rm.recordset[0].o;
}

/* --------------------------------- etapas --------------------------------- */
async function renomearEtapa(pool, { idPlano, modulo, de, para }) {
    const r = await pool.request().input('p', sql.Int, idPlano).input('m', sql.VarChar, modulo)
        .input('de', sql.VarChar, de).input('para', sql.VarChar, para)
        .query(`UPDATE tab_plano_itens SET titulo = @para, data_atualizacao = GETDATE()
                WHERE id_plano = @p AND id_unidade IS NULL AND ISNULL(modulo,'') = ISNULL(@m,'') AND ISNULL(titulo,'GERAL') = @de`);
    return r.rowsAffected[0];
}

const FILTRO_ETAPA = `i.id_plano = @p AND i.id_unidade IS NULL AND ISNULL(i.modulo,'') = ISNULL(@m,'') AND ISNULL(i.titulo,'GERAL') = @n`;
const comEtapa = (r, e) => r.input('p', sql.Int, e.idPlano).input('m', sql.VarChar, e.modulo).input('n', sql.VarChar, e.nome);

async function resumirEtapa(pool, etapa) {
    const r = await comEtapa(pool.request(), etapa).query(`
        SELECT COUNT(*) AS itens,
               (SELECT COUNT(*) FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE ${FILTRO_ETAPA}) AS apontamentos
        FROM tab_plano_itens i WHERE ${FILTRO_ETAPA}`);
    return r.recordset[0];
}

async function excluirEtapa(R, etapa) {
    await comEtapa(R(), etapa).query(`
            DELETE a FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE ${FILTRO_ETAPA};
            DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE ${FILTRO_ETAPA};
            DELETE i FROM tab_plano_itens i WHERE ${FILTRO_ETAPA};`);
}

/* ------------------------------ grade em lote ----------------------------- */
/** Estado atual dos itens do lote (mapa id_item -> linha), em blocos de 1000. */
async function buscarItensPorIds(pool, ids) {
    const atuais = new Map();
    for (let i = 0; i < ids.length; i += TAMANHO_LOTE_ITENS) {
        const r = pool.request();
        const m = ids.slice(i, i + TAMANHO_LOTE_ITENS).map((id, k) => { r.input(`i${k}`, sql.Int, id); return `@i${k}`; }).join(',');
        (await r.query(`SELECT * FROM tab_plano_itens WHERE id_item IN (${m})`)).recordset.forEach(x => atuais.set(x.id_item, x));
    }
    return atuais;
}

/** Equipe atual do plano: mapa id_item -> Set de id_usuario. */
async function buscarEquipeDoPlano(pool, idPlano) {
    const equipe = new Map();
    const r = pool.request().input('p', sql.Int, idPlano);
    (await r.query(`SELECT e.id_item, e.id_usuario FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano = @p`))
        .recordset.forEach(x => { if (!equipe.has(x.id_item)) equipe.set(x.id_item, new Set()); equipe.get(x.id_item).add(x.id_usuario); });
    return equipe;
}

async function atualizarItemDaGrade(R, p) {
    await R()
        .input('id', sql.Int, p.id)
        .input('acao', sql.VarChar, p.descricao)
        .input('resp', sql.VarChar, p.responsavel)
        .input('cli', sql.VarChar, p.cliente)
        .input('obs', sql.VarChar, p.observacao)
        .input('di', sql.Date, p.data_inicio)
        .input('df', sql.Date, p.data_fim)
        .input('dir', sql.Date, p.data_inicio_real)
        .input('dfr', sql.Date, p.data_fim_real)
        .input('tp', sql.Int, p.tempoPrevisto)
        .input('perc', sql.Int, p.percentual)
        .input('prio', sql.VarChar, p.prioridade)
        .input('st', sql.VarChar, p.status)
        .input('ini', sql.DateTime, p.inicioAndamento)
        .input('fech', sql.DateTime, p.fechamento)
        .input('tg', sql.Int, p.tempoGasto)
        .query(`
                    UPDATE tab_plano_itens SET
                        descricao = @acao, responsavel = @resp, cliente = @cli, observacao = @obs,
                        data_inicio = @di, data_fim = @df, data_inicio_real = @dir, data_fim_real = @dfr,
                        percentual = @perc, prioridade = @prio, status = @st,
                        dt_inicio_andamento = @ini, dt_fechamento = @fech, tempo_gasto = @tg,
                        tempo_previsto = CASE WHEN ISNULL(tempo_previsto_bloqueado, 0) = 0 AND @tp IS NOT NULL THEN @tp ELSE tempo_previsto END,
                        tempo_previsto_bloqueado = CASE WHEN ISNULL(tempo_previsto_bloqueado, 0) = 0 AND @tp IS NOT NULL THEN 1 ELSE tempo_previsto_bloqueado END,
                        data_atualizacao = GETDATE()
                    WHERE id_item = @id`);
}

async function removerDaEquipe(R, idItem, idUsuario) {
    await R().input('i', sql.Int, idItem).input('u', sql.Int, idUsuario).query('DELETE FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u');
}

async function incluirNaEquipe(R, idItem, idUsuario) {
    await R().input('i', sql.Int, idItem).input('u', sql.Int, idUsuario).query(`
                    IF EXISTS (SELECT 1 FROM tab_usuarios WHERE id_usuario = @u)
                    AND NOT EXISTS (SELECT 1 FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u)
                        INSERT INTO tab_plano_item_equipe (id_item, id_usuario) VALUES (@i, @u)`);
}

module.exports = {
    buscarItem, inserirItem, listarApontamentos, pessoaNaEquipe, minutosApontadosNoDia, inserirApontamento, garantirNaEquipe, iniciarAndamento,
    ajustarInicioReal, recalcularHoras, buscarApontamento, excluirApontamento, contarApontamentosDoItem, buscarVizinho, trocarOrdem, excluirItem,
    ordemDoItemNoContexto, abrirEspacoNaOrdem, proximaOrdem, renomearEtapa, resumirEtapa, excluirEtapa, buscarItensPorIds, buscarEquipeDoPlano,
    atualizarItemDaGrade, removerDaEquipe, incluirNaEquipe
};
