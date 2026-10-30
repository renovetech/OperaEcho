/* routes/escalas.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo, limparCacheRegras } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { filtroPorUsuarioLotacao } = require('../middlewares/lotacao');
const notificacoes = require('../services/whatsapp/notificacoes');

// Nº do Redmine (opcional, só para TRABALHO): não aparece na escala nem em relatórios;
// vai apenas nas mensagens de escala do WhatsApp.
const redmineDe = (d) => (d && d.tipo === 'TRABALHO' ? (String(d.redmine || '').trim().replace(/[^\w#./-]/g, '').slice(0, 30) || null) : null);

// ==============================================================================
// ESCALAS
// ==============================================================================
router.get('/escalas', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const request = pool.request()
        .input('i', sql.Date, req.query.inicio)
        .input('f', sql.Date, req.query.fim);
    // MÓDULO IMPLANTAÇÃO: escala completa - todos os usuários (o isolamento por
    // lotação vale apenas no submenu Projetos, via rotas /projetos/escalas).
    let filtroLot = "";
    // Filtro opcional por colaborador (app "Minha Escala"): evita trafegar a escala da empresa toda.
    if (parseInt(req.query.id_usuario)) {
        filtroLot += " AND e.id_usuario = @id_usr ";
        request.input('id_usr', sql.Int, parseInt(req.query.id_usuario));
    }
    const r = await request
        .query(`SELECT e.*, p.nome_projeto, u.nome_unidade, 
            (SELECT STRING_AGG(tp.nome_produto, ', ') WITHIN GROUP (ORDER BY tp.nome_produto) FROM tab_escala_produtos tep JOIN tab_produtos tp ON tep.id_produto = tp.id_produto WHERE tep.id_escala = e.id_escala) as nomes_produtos, 
            (SELECT STRING_AGG(CAST(tep.id_produto AS VARCHAR), ',') FROM tab_escala_produtos tep WHERE tep.id_escala = e.id_escala) as ids_produtos_str 
            FROM tab_escalas e LEFT JOIN tab_projetos p ON e.id_projeto=p.id_projeto LEFT JOIN tab_unidades u ON e.id_unidade=u.id_unidade WHERE e.data_escala BETWEEN @i AND @f ${filtroLot}`);
    res.json(r.recordset.map(item => ({ ...item, ids_produtos: item.ids_produtos_str ? item.ids_produtos_str.split(',').map(Number) : [] })));
}));

// Gravação de escala exige o módulo
const podeEditarEscala = autorizarModulo('escala', 'editar');
const MAX_LOTE = 5000;

router.post('/escalas/salvar', autenticar, podeEditarEscala, asyncHandler(async (req, res) => {
    const d = req.body;
    const pool = await connectToDb();
    const idUser = parseInt(d.id_usuario);
    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin();
    try {
        await new sql.Request(transaction).input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
            .query("DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u AND data_escala=@dt)");
        await new sql.Request(transaction).input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
            .query("DELETE FROM tab_escalas WHERE id_usuario=@u AND data_escala=@dt");
        if (d.tipo) {
            const rInsert = await new sql.Request(transaction)
                .input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
                .input('t', sql.VarChar, d.tipo).input('p', sql.Int, d.id_projeto || null)
                .input('un', sql.Int, d.id_unidade || null).input('turno', sql.VarChar, d.turno || 'NORMAL').input('rm', sql.VarChar(30), redmineDe(d))
                .query("INSERT INTO tab_escalas (id_usuario, data_escala, tipo, id_projeto, id_unidade, turno, redmine) OUTPUT INSERTED.id_escala VALUES (@u, @dt, @t, @p, @un, @turno, @rm)");
            const newId = rInsert.recordset[0].id_escala;
            if (d.produtos && d.produtos.length > 0) {
                for (const idProd of d.produtos) {
                    await new sql.Request(transaction).input('ide', sql.Int, newId).input('idp', sql.Int, idProd)
                        .query("INSERT INTO tab_escala_produtos (id_escala, id_produto) VALUES (@ide, @idp)");
                }
            }
        }
        await transaction.commit();
        committed = true;

        // Responde imediatamente após persistir.
        res.json({ mensagem: 'Salvo' });
        // Aviso de alteração pelo WhatsApp (agrupado; não bloqueia a resposta)
        notificacoes.escalaAlterada([{ id_usuario: idUser, data_escala: d.data_escala }], 'IMPLANTACAO', req.usuario.id_usuario);
    } catch (err) {
        // Só faz rollback se a transação ainda estiver ativa (não commitada).
        if (!committed) {
            try { await transaction.rollback(); } catch (_) { /* já finalizada */ }
        }
        throw err;
    }
}));

router.post('/escalas/salvar-lote', autenticar, podeEditarEscala, asyncHandler(async (req, res) => {
    const listaEscalas = req.body;
    if (!Array.isArray(listaEscalas) || listaEscalas.length === 0) return res.status(400).json({ erro: "Vazio." });
    if (listaEscalas.length > MAX_LOTE) return res.status(413).json({ erro: `Lote muito grande (máx. ${MAX_LOTE}).` });
    const pool = await connectToDb();
    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin();
    try {
        for (const item of listaEscalas) {
            const idU = parseInt(item.id_usuario);
            await new sql.Request(transaction).input('u_del', sql.Int, idU).input('dt_del', sql.Date, item.data_escala)
                .query("DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u_del AND data_escala=@dt_del)");
            await new sql.Request(transaction).input('u_del', sql.Int, idU).input('dt_del', sql.Date, item.data_escala)
                .query("DELETE FROM tab_escalas WHERE id_usuario=@u_del AND data_escala=@dt_del");
            if (item.tipo) {
                const rIns = await new sql.Request(transaction).input('u', sql.Int, idU).input('dt', sql.Date, item.data_escala)
                    .input('t', sql.VarChar, item.tipo).input('p', sql.Int, item.id_projeto || null)
                    .input('un', sql.Int, item.id_unidade || null).input('turno', sql.VarChar, item.turno || 'NORMAL').input('rm', sql.VarChar(30), redmineDe(item))
                    .query("INSERT INTO tab_escalas (id_usuario, data_escala, tipo, id_projeto, id_unidade, turno, redmine) OUTPUT INSERTED.id_escala VALUES (@u, @dt, @t, @p, @un, @turno, @rm)");
                const newId = rIns.recordset[0].id_escala;
                if (item.produtos && item.produtos.length > 0) {
                    for (const idProd of item.produtos) {
                        await new sql.Request(transaction).input('ide', sql.Int, newId).input('idp', sql.Int, idProd)
                            .query("INSERT INTO tab_escala_produtos (id_escala, id_produto) VALUES (@ide, @idp)");
                    }
                }
            }
        }
        await transaction.commit();
        committed = true;

        res.json({ mensagem: 'Replicação OK' });
        notificacoes.escalaAlterada(listaEscalas, 'IMPLANTACAO', req.usuario.id_usuario);
    } catch (err) {
        if (!committed) {
            try { await transaction.rollback(); } catch (_) { /* já finalizada */ }
        }
        throw err;
    }
}));

// ==============================================================================
// REGRAS DE ACESSO (PERFIS)
// ==============================================================================
router.get('/regras/:perfil', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('p', sql.VarChar, req.params.perfil)
        .query('SELECT * FROM tab_regras_acesso WHERE nome_perfil=@p');
    res.json(r.recordset);
}));

// Regras de acesso: gravação exige o módulo "perfis" com edição.
router.post('/regras/salvar', autenticar, autorizarModulo('perfis', 'editar'), asyncHandler(async (req, res) => {
    const { perfil, regras } = req.body || {};
    if (!perfil || !Array.isArray(regras)) return res.status(400).json({ erro: 'Dados inválidos.' });
    const pool = await connectToDb();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t).input('p', sql.VarChar, perfil).query('DELETE FROM tab_regras_acesso WHERE nome_perfil=@p');
        for (const r of regras) {
            await new sql.Request(t)
                .input('p', sql.VarChar, perfil).input('mod', sql.VarChar, r.modulo)
                .input('a', sql.Bit, !!r.pode_acessar).input('n', sql.Bit, !!r.pode_novo).input('e', sql.Bit, !!r.pode_editar)
                .query('INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES (@p, @mod, @a, @n, @e)');
        }
        await t.commit();
    } catch (err) { await t.rollback(); throw err; }
    limparCacheRegras();
    res.json({ mensagem: 'Regras salvas.' });
}));

module.exports = router;