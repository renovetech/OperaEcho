/* ARQUIVO: routes/linksExternos.js
   Operações > Links Externos - persistência em banco (compartilhado entre todos
   os usuários). Tabela: tab_links_externos (id_link, id_produto, url).
   Endpoints: GET / POST / PUT / DELETE em /links-externos */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');

// Só http(s) ou domínio simples - bloqueia javascript:, data:, vbscript: etc.
const urlValida = (u) => {
    const s = String(u || '').trim();
    if (!s || s.length > 1000) return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return /^https?:\/\//i.test(s);
    return /^[^\s<>"']+$/.test(s);
};

// ==============================================================================
// LISTAR (com nome do produto)
// ==============================================================================
router.get('/links-externos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query(`
        SELECT l.id_link, l.id_produto, p.nome_produto, l.url
        FROM tab_links_externos l
        INNER JOIN tab_produtos p ON l.id_produto = p.id_produto
        ORDER BY p.nome_produto, l.id_link
    `);
    res.json(r.recordset);
}));

// ==============================================================================
// CRIAR
// ==============================================================================
router.post('/links-externos', autenticar, autorizarModulo('links_externos', 'novo'), asyncHandler(async (req, res) => {
    const { id_produto, url } = req.body;
    if (!id_produto || !url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ erro: 'Produto e link são obrigatórios.' });
    }
    if (!urlValida(url)) return res.status(400).json({ erro: 'Link inválido: use um endereço http:// ou https://.' });
    const pool = await connectToDb();
    const r = await pool.request()
        .input('p', sql.Int, parseInt(id_produto))
        .input('u', sql.VarChar(1000), url.trim())
        .query(`INSERT INTO tab_links_externos (id_produto, url) OUTPUT INSERTED.id_link VALUES (@p, @u)`);
    res.json({ id_link: r.recordset[0].id_link, mensagem: 'Criado' });
}));

// ==============================================================================
// EDITAR
// ==============================================================================
router.put('/links-externos/:id', autenticar, autorizarModulo('links_externos', 'editar'), asyncHandler(async (req, res) => {
    const { id_produto, url } = req.body;
    if (!id_produto || !url || typeof url !== 'string' || !url.trim()) {
        return res.status(400).json({ erro: 'Produto e link são obrigatórios.' });
    }
    if (!urlValida(url)) return res.status(400).json({ erro: 'Link inválido: use um endereço http:// ou https://.' });
    const pool = await connectToDb();
    await pool.request()
        .input('id', sql.Int, parseInt(req.params.id))
        .input('p', sql.Int, parseInt(id_produto))
        .input('u', sql.VarChar(1000), url.trim())
        .query(`UPDATE tab_links_externos SET id_produto = @p, url = @u WHERE id_link = @id`);
    res.json({ mensagem: 'Atualizado' });
}));

// ==============================================================================
// EXCLUIR
// ==============================================================================
router.delete('/links-externos/:id', autenticar, autorizarModulo('links_externos', 'editar'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await pool.request()
        .input('id', sql.Int, parseInt(req.params.id))
        .query(`DELETE FROM tab_links_externos WHERE id_link = @id`);
    res.json({ mensagem: 'Excluído' });
}));

module.exports = router;
