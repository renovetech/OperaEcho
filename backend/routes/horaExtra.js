/* routes/horaExtra.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { filtroPorProjeto } = require('../middlewares/lotacao');
const { ehGestaoHE, podeAcessarLancamento, podeLancarPara } = require('../utils/horaExtraAcesso');

const TAB_CAB = 'tab_hora_extra_cabecalho';

router.post('/hora-extra/salvar', autenticar, asyncHandler(async (req, res) => {
    const { id_lancamento, id_usuario, id_projeto, id_unidade, mes_referencia, detalhes_dias, totais } = req.body;
    const pool = await connectToDb();
    if (id_lancamento ? !(await podeAcessarLancamento(pool, req, TAB_CAB, id_lancamento)) : !podeLancarPara(req, id_usuario)) {
        return res.status(403).json({ erro: 'Sem permissão para lançar/editar hora extra de outro colaborador.' });
    }
    if (!Array.isArray(detalhes_dias) || !totais) return res.status(400).json({ erro: 'Dados do lançamento incompletos.' });
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        let finalId = id_lancamento;
        if (id_lancamento) {
            await new sql.Request(t).input('id', sql.Int, id_lancamento).input('id_p', sql.Int, id_projeto)
                .input('id_uni', sql.Int, id_unidade).input('mes', sql.VarChar, mes_referencia)
                .input('he50', sql.Int, totais.he50).input('he100', sql.Int, totais.he100).input('ad_not', sql.Int, totais.adNoturno)
                .query("UPDATE tab_hora_extra_cabecalho SET id_projeto=@id_p, id_unidade=@id_uni, mes_referencia=@mes, total_he_50=@he50, total_he_100=@he100, total_ad_noturno=@ad_not WHERE id_lancamento=@id");
            await new sql.Request(t).input('id', sql.Int, id_lancamento)
                .query("DELETE FROM tab_hora_extra_detalhes WHERE id_lancamento=@id");
        } else {
            const rCab = await new sql.Request(t)
                .input('id_u', sql.Int, id_usuario).input('id_p', sql.Int, id_projeto).input('id_uni', sql.Int, id_unidade)
                .input('mes', sql.VarChar, mes_referencia).input('he50', sql.Int, totais.he50).input('he100', sql.Int, totais.he100).input('ad_not', sql.Int, totais.adNoturno)
                .query("INSERT INTO tab_hora_extra_cabecalho (id_usuario, id_projeto, id_unidade, mes_referencia, total_he_50, total_he_100, total_ad_noturno, status, data_lancamento) OUTPUT INSERTED.id_lancamento VALUES (@id_u, @id_p, @id_uni, @mes, @he50, @he100, @ad_not, 'PENDENTE', GETDATE())");
            finalId = rCab.recordset[0].id_lancamento;
        }
        for (const dia of detalhes_dias) {
            await new sql.Request(t)
                .input('id_l', sql.Int, finalId).input('dia_n', sql.Int, dia.dia).input('dt_comp', sql.Date, dia.dataObj)
                .input('ent', sql.VarChar, dia.entrada).input('sai', sql.VarChar, dia.saida).input('intv', sql.VarChar, dia.intervalo)
                .input('fer', sql.Bit, dia.isFeriado ? 1 : 0).input('fds', sql.Bit, dia.isFDS ? 1 : 0).input('folga', sql.Bit, dia.isFolga ? 1 : 0)
                .input('he50', sql.Int, dia.he50).input('he100', sql.Int, dia.he100).input('adn', sql.Int, dia.adNoturno)
                .input('id_uni_dia', sql.Int, dia.id_unidade || null)
                .input('id_proj_dia', sql.Int, dia.id_projeto || id_projeto || null)
                .query("INSERT INTO tab_hora_extra_detalhes (id_lancamento, dia_numero, data_completa, entrada, saida, intervalo, is_feriado, is_fds, is_folga, minutos_he_50, minutos_he_100, minutos_ad_noturno, id_unidade, id_projeto) VALUES (@id_l, @dia_n, @dt_comp, @ent, @sai, @intv, @fer, @fds, @folga, @he50, @he100, @adn, @id_uni_dia, @id_proj_dia)");
        }
        await t.commit();
        res.json({ mensagem: 'Salvo com sucesso', id_lancamento: finalId });
    } catch (err) { await t.rollback(); throw err; }
}));

router.get('/hora-extra/buscar', autenticar, asyncHandler(async (req, res) => {
    const { mes, id_projeto } = req.query;
    const pool = await connectToDb();
    const request = pool.request();
    let query = `SELECT h.id_lancamento, h.mes_referencia, h.data_lancamento, h.status, h.id_usuario, h.id_projeto, h.id_unidade, 
        u.nome_completo as colaborador, ISNULL(p.nome_projeto, 'N/A') as nome_projeto, ISNULL(un.nome_unidade, 'N/A') as nome_unidade,
        (SELECT COUNT(DISTINCT d.id_unidade) FROM tab_hora_extra_detalhes d WHERE d.id_lancamento = h.id_lancamento AND d.id_unidade IS NOT NULL) as qtd_unidades,
        (SELECT COUNT(DISTINCT d.id_projeto) FROM tab_hora_extra_detalhes d WHERE d.id_lancamento = h.id_lancamento AND d.id_projeto IS NOT NULL) as qtd_projetos
        FROM tab_hora_extra_cabecalho h LEFT JOIN tab_usuarios u ON h.id_usuario = u.id_usuario 
        LEFT JOIN tab_projetos p ON h.id_projeto = p.id_projeto LEFT JOIN tab_unidades un ON h.id_unidade = un.id_unidade WHERE 1=1`;
    // Perfil do TOKEN (não da query): quem não é Administrador/Gestor vê só os próprios.
    if (!ehGestaoHE(req)) {
        query += " AND h.id_usuario = @id_u"; request.input('id_u', sql.Int, req.usuario.id_usuario);
    }
    if (mes) { query += " AND h.mes_referencia = @mes"; request.input('mes', sql.VarChar, mes); }
    if (id_projeto) { query += " AND h.id_projeto = @id_p"; request.input('id_p', sql.Int, id_projeto); }
    // MÓDULO IMPLANTAÇÃO: cada usuário vê os próprios lançamentos (filtro acima);
    // Admin/Gestor veem todos. Sem isolamento por lotação aqui - esse isolamento
    // vale apenas no submenu Projetos (rotas /projetos/hora-extra/*).
    query += " ORDER BY h.data_lancamento DESC";
    const result = await request.query(query);
    res.json(result.recordset);
}));

router.get('/hora-extra/detalhes/:id', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    if (!(await podeAcessarLancamento(pool, req, TAB_CAB, req.params.id))) return res.status(403).json({ erro: 'Sem permissão.' });
    const r = await pool.request().input('id', sql.Int, req.params.id)
        .query("SELECT * FROM tab_hora_extra_detalhes WHERE id_lancamento = @id ORDER BY dia_numero");
    res.json({ detalhes: r.recordset });
}));

router.delete('/hora-extra/:id', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    if (!(await podeAcessarLancamento(pool, req, TAB_CAB, req.params.id))) return res.status(403).json({ erro: 'Sem permissão.' });
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t).input('id', sql.Int, req.params.id).query("DELETE FROM tab_hora_extra_detalhes WHERE id_lancamento=@id");
        await new sql.Request(t).input('id', sql.Int, req.params.id).query("DELETE FROM tab_hora_extra_cabecalho WHERE id_lancamento=@id");
        await t.commit();
        res.json({ mensagem: 'Excluído' });
    } catch (err) { await t.rollback(); throw err; }
}));

module.exports = router;