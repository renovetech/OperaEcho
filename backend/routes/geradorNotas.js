/* routes/geradorNotas.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizar } = require('../middlewares/auth');
// Liberação de acesso ao Gerador: só Administrador/Gestor
const soGestao = autorizar('Administrador', 'Gestor');
const { asyncHandler } = require('../middlewares/errorHandler');

// ==============================================================================
// LOGIN ESPECÍFICO DO GERADOR (valida se o usuário tem acesso liberado)
// ==============================================================================
router.post('/gerador/validar-acesso', autenticar, asyncHandler(async (req, res) => {
    // O id vem do token
    const id_usuario = req.usuario && req.usuario.id_usuario;
    if (!id_usuario) return res.status(401).json({ autorizado: false });
    const pool = await connectToDb();
    const r = await pool.request()
        .input('id', sql.Int, id_usuario)
        .query("SELECT g.*, u.nome_completo, u.perfil_acesso FROM tab_gerador_usuarios g JOIN tab_usuarios u ON g.id_usuario = u.id_usuario WHERE g.id_usuario = @id AND g.ativo = 1");
    if (r.recordset.length === 0) return res.json({ autorizado: false });
    res.json({ autorizado: true, usuario: r.recordset[0] });
}));

// ==============================================================================
// TEMPLATES
// ==============================================================================
router.get('/gerador/templates', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_gerador_templates WHERE ativo = 1 ORDER BY nome");
    res.json(r.recordset);
}));

router.get('/gerador/templates/todos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_gerador_templates ORDER BY nome");
    res.json(r.recordset);
}));

router.post('/gerador/templates/salvar', autenticar, soGestao, asyncHandler(async (req, res) => {
    const d = req.body;
    const pool = await connectToDb();
    const request = pool.request()
        .input('nome', sql.VarChar, d.nome)
        .input('fc', sql.VarChar, d.fonte_cabecalho || 'Courier New')
        .input('fb', sql.VarChar, d.fonte_corpo || 'Courier New')
        .input('tf', sql.Int, d.tamanho_fonte || 12)
        .input('sep', sql.VarChar, d.separador || '-')
        .input('ali', sql.VarChar, d.alinhamento_cabecalho || 'center')
        .input('logo', sql.Bit, d.mostrar_logo ? 1 : 0)
        .input('rod', sql.VarChar, d.mensagem_rodape || '')
        .input('css', sql.Text, d.css_customizado || null)
        .input('ativo', sql.Bit, d.ativo !== false ? 1 : 0);

    if (d.id_template) {
        await request.input('id', sql.Int, d.id_template)
            .query(`UPDATE tab_gerador_templates SET nome=@nome, fonte_cabecalho=@fc, fonte_corpo=@fb, 
                     tamanho_fonte=@tf, separador=@sep, alinhamento_cabecalho=@ali, mostrar_logo=@logo, 
                     mensagem_rodape=@rod, css_customizado=@css, ativo=@ativo WHERE id_template=@id`);
    } else {
        await request.input('cp', sql.Int, req.usuario?.id_usuario || null)
            .query(`INSERT INTO tab_gerador_templates (nome, fonte_cabecalho, fonte_corpo, tamanho_fonte, separador, 
                     alinhamento_cabecalho, mostrar_logo, mensagem_rodape, css_customizado, ativo, criado_por) 
                     VALUES (@nome, @fc, @fb, @tf, @sep, @ali, @logo, @rod, @css, @ativo, @cp)`);
    }
    res.json({ mensagem: 'Template salvo!' });
}));

router.delete('/gerador/templates/:id', autenticar, soGestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, req.params.id)
        .query("DELETE FROM tab_gerador_templates WHERE id_template=@id");
    res.json({ mensagem: 'Template excluído.' });
}));

// ==============================================================================
// ITENS (CATÁLOGO)
// ==============================================================================
router.get('/gerador/itens', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_gerador_itens WHERE ativo = 1 ORDER BY descricao");
    res.json(r.recordset);
}));

router.get('/gerador/itens/todos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_gerador_itens ORDER BY descricao");
    res.json(r.recordset);
}));

router.post('/gerador/itens/salvar', autenticar, soGestao, asyncHandler(async (req, res) => {
    const d = req.body;
    const pool = await connectToDb();
    const request = pool.request()
        .input('cod', sql.VarChar, d.codigo)
        .input('desc', sql.VarChar, d.descricao)
        .input('val', sql.Decimal(10, 2), d.valor_unitario)
        .input('ativo', sql.Bit, d.ativo !== false ? 1 : 0);

    if (d.id_item) {
        await request.input('id', sql.Int, d.id_item)
            .query("UPDATE tab_gerador_itens SET codigo=@cod, descricao=@desc, valor_unitario=@val, ativo=@ativo WHERE id_item=@id");
    } else {
        await request.query("INSERT INTO tab_gerador_itens (codigo, descricao, valor_unitario, ativo) VALUES (@cod, @desc, @val, @ativo)");
    }
    res.json({ mensagem: 'Item salvo!' });
}));

router.delete('/gerador/itens/:id', autenticar, soGestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, req.params.id)
        .query("DELETE FROM tab_gerador_itens WHERE id_item=@id");
    res.json({ mensagem: 'Item excluído.' });
}));

// ==============================================================================
// USUÁRIOS COM ACESSO
// ==============================================================================
router.get('/gerador/usuarios', autenticar, soGestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query(`
        SELECT g.id, g.id_usuario, g.ativo, g.data_liberacao, 
               u.nome_completo, u.usuario, u.perfil_acesso
        FROM tab_gerador_usuarios g 
        JOIN tab_usuarios u ON g.id_usuario = u.id_usuario 
        ORDER BY u.nome_completo`);
    res.json(r.recordset);
}));

router.post('/gerador/usuarios/salvar', autenticar, soGestao, asyncHandler(async (req, res) => {
    const { id_usuario, ativo } = req.body;
    const pool = await connectToDb();
    
    const existe = await pool.request().input('id', sql.Int, id_usuario)
        .query("SELECT id FROM tab_gerador_usuarios WHERE id_usuario = @id");
    
    if (existe.recordset.length > 0) {
        await pool.request().input('id', sql.Int, id_usuario).input('a', sql.Bit, ativo ? 1 : 0)
            .query("UPDATE tab_gerador_usuarios SET ativo=@a WHERE id_usuario=@id");
    } else {
        await pool.request()
            .input('id', sql.Int, id_usuario)
            .input('lib', sql.Int, req.usuario?.id_usuario || null)
            .query("INSERT INTO tab_gerador_usuarios (id_usuario, ativo, liberado_por) VALUES (@id, 1, @lib)");
    }
    res.json({ mensagem: 'Acesso atualizado!' });
}));

router.delete('/gerador/usuarios/:id', autenticar, soGestao, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, req.params.id)
        .query("DELETE FROM tab_gerador_usuarios WHERE id_usuario=@id");
    res.json({ mensagem: 'Acesso revogado.' });
}));

module.exports = router;
