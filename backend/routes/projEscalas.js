/* ARQUIVO: routes/projEscalas.js
   Submenu OPERAÇÕES > PROJETOS - Gerador de Escalas ISOLADO.
   Mesma lógica de routes/escalas.js (somente a parte de escalas; as regras de
   perfil continuam em routes/escalas.js), persistindo nas tabelas próprias:
   tab_proj_escalas / tab_proj_escala_produtos.
   Prefixo de rota: /projetos/escalas/* */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const podeEditarEscala = autorizarModulo('proj_escala', 'editar');
const MAX_LOTE = 5000;
const { asyncHandler } = require('../middlewares/errorHandler');
const { filtroPorUsuarioLotacao } = require('../middlewares/lotacao');
const notificacoes = require('../services/whatsapp/notificacoes');

// Nº do Redmine (opcional, só para TRABALHO): não aparece na escala nem em relatórios;
// vai apenas nas mensagens de escala do WhatsApp.
const redmineDe = (d) => (d && d.tipo === 'TRABALHO' ? (String(d.redmine || '').trim().replace(/[^\w#./-]/g, '').slice(0, 30) || null) : null);

// ==============================================================================
// ESCOPO NA ESCRITA
// A leitura já é isolada por filtroPorUsuarioLotacao. Estas funções fecham o
// lado da escrita: só é possível escalar usuários da(s) lotação(ões) do escopo.
// Escopo conforme middlewares/lotacao.js:
//   { global, lotacoes: [id_projeto], id_lotacao_home, nome_funcao, perfil_acesso }
// ==============================================================================
async function usuariosNoEscopo(pool, escopo, ids) {
    if (!escopo) return false;
    if (escopo.global) return true;
    if (!Array.isArray(escopo.lotacoes) || escopo.lotacoes.length === 0) return false;

    const lista = [...new Set((ids || []).map(i => parseInt(i)).filter(i => !isNaN(i) && i > 0))];
    if (lista.length === 0) return false;

    const request = pool.request();
    const marksU = lista.map((id, i) => { request.input(`esc_u${i}`, sql.Int, id); return `@esc_u${i}`; });
    const marksL = escopo.lotacoes.map((id, i) => { request.input(`esc_l${i}`, sql.Int, id); return `@esc_l${i}`; });

    const r = await request.query(`
        SELECT COUNT(*) AS fora
        FROM tab_usuarios
        WHERE id_usuario IN (${marksU.join(',')})
          AND (id_lotacao IS NULL OR id_lotacao NOT IN (${marksL.join(',')}))
          AND id_usuario NOT IN (
                SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto IN (${marksL.join(',')})
          )
    `);
    return r.recordset[0].fora === 0;
}

router.get('/projetos/escalas', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const request = pool.request()
        .input('i', sql.Date, req.query.inicio)
        .input('f', sql.Date, req.query.fim);
    let filtroLot = filtroPorUsuarioLotacao(request, req.escopo, 'e.id_usuario');
    // Filtro opcional por colaborador (app "Minha Escala").
    if (parseInt(req.query.id_usuario)) {
        filtroLot += " AND e.id_usuario = @id_usr ";
        request.input('id_usr', sql.Int, parseInt(req.query.id_usuario));
    }
    const r = await request
        .query(`SELECT e.*, p.nome_projeto, u.nome_unidade,
            (SELECT STRING_AGG(tp.nome_produto, ', ') WITHIN GROUP (ORDER BY tp.nome_produto) FROM tab_proj_escala_produtos tep JOIN tab_produtos tp ON tep.id_produto = tp.id_produto WHERE tep.id_escala = e.id_escala) as nomes_produtos, 
            (SELECT STRING_AGG(CAST(tep.id_produto AS VARCHAR), ',') FROM tab_proj_escala_produtos tep WHERE tep.id_escala = e.id_escala) as ids_produtos_str 
            FROM tab_proj_escalas e LEFT JOIN tab_projetos p ON e.id_projeto=p.id_projeto LEFT JOIN tab_unidades u ON e.id_unidade=u.id_unidade WHERE e.data_escala BETWEEN @i AND @f ${filtroLot}`);
    res.json(r.recordset.map(item => ({ ...item, ids_produtos: item.ids_produtos_str ? item.ids_produtos_str.split(',').map(Number) : [] })));
}));

router.post('/projetos/escalas/salvar', autenticar, podeEditarEscala, asyncHandler(async (req, res) => {
    const d = req.body;
    const pool = await connectToDb();
    const idUser = parseInt(d.id_usuario);

    if (!(await usuariosNoEscopo(pool, req.escopo, [idUser]))) {
        return res.status(403).json({ erro: 'Colaborador fora da sua lotação.' });
    }

    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin();
    try {
        await new sql.Request(transaction).input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
            .query("DELETE FROM tab_proj_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_proj_escalas WHERE id_usuario=@u AND data_escala=@dt)");
        await new sql.Request(transaction).input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
            .query("DELETE FROM tab_proj_escalas WHERE id_usuario=@u AND data_escala=@dt");
        if (d.tipo) {
            const rInsert = await new sql.Request(transaction)
                .input('u', sql.Int, idUser).input('dt', sql.Date, d.data_escala)
                .input('t', sql.VarChar, d.tipo).input('p', sql.Int, d.id_projeto || null)
                .input('un', sql.Int, d.id_unidade || null).input('turno', sql.VarChar, d.turno || 'NORMAL').input('rm', sql.VarChar(30), redmineDe(d))
                .query("INSERT INTO tab_proj_escalas (id_usuario, data_escala, tipo, id_projeto, id_unidade, turno, redmine) OUTPUT INSERTED.id_escala VALUES (@u, @dt, @t, @p, @un, @turno, @rm)");
            const newId = rInsert.recordset[0].id_escala;
            if (d.produtos && d.produtos.length > 0) {
                for (const idProd of d.produtos) {
                    await new sql.Request(transaction).input('ide', sql.Int, newId).input('idp', sql.Int, idProd)
                        .query("INSERT INTO tab_proj_escala_produtos (id_escala, id_produto) VALUES (@ide, @idp)");
                }
            }
        }
        await transaction.commit();
        committed = true;

        res.json({ mensagem: 'Salvo' });
        notificacoes.escalaAlterada([{ id_usuario: idUser, data_escala: d.data_escala }], 'PROJETOS', req.usuario.id_usuario);
    } catch (err) {
        if (!committed) {
            try { await transaction.rollback(); } catch (_) { /* já finalizada */ }
        }
        throw err;
    }
}));

router.post('/projetos/escalas/salvar-lote', autenticar, podeEditarEscala, asyncHandler(async (req, res) => {
    const listaEscalas = req.body;
    if (!Array.isArray(listaEscalas) || listaEscalas.length === 0) return res.status(400).json({ erro: "Vazio." });
    if (listaEscalas.length > MAX_LOTE) return res.status(413).json({ erro: `Lote muito grande (máx. ${MAX_LOTE}).` });
    const pool = await connectToDb();

    if (!(await usuariosNoEscopo(pool, req.escopo, listaEscalas.map(i => i.id_usuario)))) {
        return res.status(403).json({ erro: 'A replicação inclui colaborador fora da sua lotação.' });
    }

    const transaction = new sql.Transaction(pool);
    let committed = false;
    await transaction.begin();
    try {
        for (const item of listaEscalas) {
            const idU = parseInt(item.id_usuario);
            await new sql.Request(transaction).input('u_del', sql.Int, idU).input('dt_del', sql.Date, item.data_escala)
                .query("DELETE FROM tab_proj_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_proj_escalas WHERE id_usuario=@u_del AND data_escala=@dt_del)");
            await new sql.Request(transaction).input('u_del', sql.Int, idU).input('dt_del', sql.Date, item.data_escala)
                .query("DELETE FROM tab_proj_escalas WHERE id_usuario=@u_del AND data_escala=@dt_del");
            if (item.tipo) {
                const rIns = await new sql.Request(transaction).input('u', sql.Int, idU).input('dt', sql.Date, item.data_escala)
                    .input('t', sql.VarChar, item.tipo).input('p', sql.Int, item.id_projeto || null)
                    .input('un', sql.Int, item.id_unidade || null).input('turno', sql.VarChar, item.turno || 'NORMAL').input('rm', sql.VarChar(30), redmineDe(item))
                    .query("INSERT INTO tab_proj_escalas (id_usuario, data_escala, tipo, id_projeto, id_unidade, turno, redmine) OUTPUT INSERTED.id_escala VALUES (@u, @dt, @t, @p, @un, @turno, @rm)");
                const newId = rIns.recordset[0].id_escala;
                if (item.produtos && item.produtos.length > 0) {
                    for (const idProd of item.produtos) {
                        await new sql.Request(transaction).input('ide', sql.Int, newId).input('idp', sql.Int, idProd)
                            .query("INSERT INTO tab_proj_escala_produtos (id_escala, id_produto) VALUES (@ide, @idp)");
                    }
                }
            }
        }
        await transaction.commit();
        committed = true;

        res.json({ mensagem: 'Replicação OK' });
        notificacoes.escalaAlterada(listaEscalas, 'PROJETOS', req.usuario.id_usuario);
    } catch (err) {
        if (!committed) {
            try { await transaction.rollback(); } catch (_) { /* já finalizada */ }
        }
        throw err;
    }
}));

module.exports = router;