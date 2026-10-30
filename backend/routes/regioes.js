/* routes/regioes.js
 * CADASTRO > MACRO E MICRO REGIÕES
 * Cada projeto tem a sua nomenclatura: a macro pertence ao projeto e a micro
 * pertence à macro. A unidade (do mesmo projeto) é vinculada à macro/micro.
 * Leitura: módulos 'regioes' ou 'unidades'. Gravação: 'regioes' (novo/editar).
 */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../middlewares/auth');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const { parseIntSafe } = require('../utils/validators');

const COR = /^#[0-9a-f]{6}$/i;
const corValida = (c) => (COR.test(String(c || '')) ? c : null);
const txt = (v, n) => String(v ?? '').trim().slice(0, n);

// Registro com id => 'editar'; sem id => 'novo' (mesma regra de cadastros.js).
const autorizarGravacao = (campoId) => async (req, res, next) => {
    try {
        const acao = req.body && req.body[campoId] ? 'editar' : 'novo';
        if (await temPermissao(req, 'regioes', acao)) return next();
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    } catch (e) { next(e); }
};

// ==============================================================================
// ÁRVORE DE REGIÕES DO PROJETO (macros com suas micros)
// ==============================================================================
router.get('/regioes/projeto/:id', autenticar, autorizarModulo(['regioes', 'unidades']), asyncHandler(async (req, res) => {
    const idProjeto = parseIntSafe(req.params.id);
    if (!idProjeto) return res.json([]);
    const pool = await connectToDb();
    const r = await pool.request().input('p', sql.Int, idProjeto).query(`
        SELECT m.id_macro, m.nome_macro, m.sigla, m.cor, m.ordem, m.ativo,
               (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_macro = m.id_macro) AS unidades
        FROM tab_macro_regioes m WHERE m.id_projeto = @p
        ORDER BY m.ordem, m.nome_macro;

        SELECT mi.id_micro, mi.id_macro, mi.nome_micro, mi.sigla, mi.cor, mi.ordem, mi.ativo,
               (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_micro = mi.id_micro) AS unidades
        FROM tab_micro_regioes mi
        JOIN tab_macro_regioes m ON m.id_macro = mi.id_macro
        WHERE m.id_projeto = @p
        ORDER BY mi.ordem, mi.nome_micro;`);
    const [macros, micros] = r.recordsets;
    res.json(macros.map(m => ({ ...m, micros: micros.filter(x => x.id_macro === m.id_macro) })));
}));

// ==============================================================================
// MACRO REGIÃO
// ==============================================================================
router.post('/regioes/macro/salvar', autenticar, autorizarGravacao('id_macro'), asyncHandler(async (req, res) => {
    const d = req.body || {};
    const idProjeto = parseIntSafe(d.id_projeto);
    const nome = txt(d.nome_macro, 120);
    if (!idProjeto || !nome) throw httpErro(400, 'Projeto e nome da macro região são obrigatórios.');

    const pool = await connectToDb();
    const request = pool.request()
        .input('p', sql.Int, idProjeto)
        .input('n', sql.VarChar(120), nome)
        .input('s', sql.VarChar(20), txt(d.sigla, 20) || null)
        .input('c', sql.VarChar(9), corValida(d.cor))
        .input('o', sql.Int, parseIntSafe(d.ordem) || 0)
        .input('a', sql.Bit, d.ativo === false ? 0 : 1);

    const dup = await pool.request().input('p', sql.Int, idProjeto).input('n', sql.VarChar(120), nome)
        .input('id', sql.Int, parseIntSafe(d.id_macro) || 0)
        .query('SELECT 1 FROM tab_macro_regioes WHERE id_projeto=@p AND nome_macro=@n AND id_macro<>@id');
    if (dup.recordset.length) throw httpErro(400, 'Já existe uma macro região com esse nome neste projeto.');

    if (d.id_macro) {
        await request.input('id', sql.Int, parseIntSafe(d.id_macro)).query(`
            UPDATE tab_macro_regioes SET nome_macro=@n, sigla=@s, cor=@c, ordem=@o, ativo=@a
            WHERE id_macro=@id AND id_projeto=@p`);
    } else {
        await request.query(`
            INSERT INTO tab_macro_regioes (id_projeto, nome_macro, sigla, cor, ordem, ativo)
            VALUES (@p, @n, @s, @c, @o, @a)`);
    }
    res.json({ mensagem: 'Macro região salva.' });
}));

router.delete('/regioes/macro/:id', autenticar, autorizarModulo('regioes', 'editar'), asyncHandler(async (req, res) => {
    const id = parseIntSafe(req.params.id);
    const pool = await connectToDb();
    const uso = await pool.request().input('id', sql.Int, id).query(`
        SELECT (SELECT COUNT(*) FROM tab_unidades WHERE id_macro=@id) AS unidades,
               (SELECT COUNT(*) FROM tab_micro_regioes WHERE id_macro=@id) AS micros`);
    const { unidades, micros } = uso.recordset[0];
    if (unidades || micros) {
        throw httpErro(400, `Não é possível excluir: a macro possui ${micros} micro região(ões) e ${unidades} unidade(s) vinculada(s). Inative-a ou remova os vínculos.`);
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM tab_macro_regioes WHERE id_macro=@id');
    res.json({ mensagem: 'Macro região excluída.' });
}));

// ==============================================================================
// MICRO REGIÃO
// ==============================================================================
router.post('/regioes/micro/salvar', autenticar, autorizarGravacao('id_micro'), asyncHandler(async (req, res) => {
    const d = req.body || {};
    const idMacro = parseIntSafe(d.id_macro);
    const nome = txt(d.nome_micro, 120);
    if (!idMacro || !nome) throw httpErro(400, 'Macro região e nome da micro região são obrigatórios.');

    const pool = await connectToDb();
    const dup = await pool.request().input('m', sql.Int, idMacro).input('n', sql.VarChar(120), nome)
        .input('id', sql.Int, parseIntSafe(d.id_micro) || 0)
        .query('SELECT 1 FROM tab_micro_regioes WHERE id_macro=@m AND nome_micro=@n AND id_micro<>@id');
    if (dup.recordset.length) throw httpErro(400, 'Já existe uma micro região com esse nome nesta macro.');

    const request = pool.request()
        .input('m', sql.Int, idMacro)
        .input('n', sql.VarChar(120), nome)
        .input('s', sql.VarChar(20), txt(d.sigla, 20) || null)
        .input('c', sql.VarChar(9), corValida(d.cor))
        .input('o', sql.Int, parseIntSafe(d.ordem) || 0)
        .input('a', sql.Bit, d.ativo === false ? 0 : 1);

    if (d.id_micro) {
        const idMicro = parseIntSafe(d.id_micro);
        await request.input('id', sql.Int, idMicro).query(`
            UPDATE tab_micro_regioes SET id_macro=@m, nome_micro=@n, sigla=@s, cor=@c, ordem=@o, ativo=@a WHERE id_micro=@id;
            -- micro mudou de macro: unidades vinculadas acompanham
            UPDATE tab_unidades SET id_macro=@m WHERE id_micro=@id;`);
    } else {
        await request.query(`
            INSERT INTO tab_micro_regioes (id_macro, nome_micro, sigla, cor, ordem, ativo)
            VALUES (@m, @n, @s, @c, @o, @a)`);
    }
    res.json({ mensagem: 'Micro região salva.' });
}));

router.delete('/regioes/micro/:id', autenticar, autorizarModulo('regioes', 'editar'), asyncHandler(async (req, res) => {
    const id = parseIntSafe(req.params.id);
    const pool = await connectToDb();
    const uso = await pool.request().input('id', sql.Int, id).query('SELECT COUNT(*) AS unidades FROM tab_unidades WHERE id_micro=@id');
    if (uso.recordset[0].unidades) {
        throw httpErro(400, `Não é possível excluir: ${uso.recordset[0].unidades} unidade(s) vinculada(s). Inative-a ou remova os vínculos.`);
    }
    await pool.request().input('id', sql.Int, id).query('DELETE FROM tab_micro_regioes WHERE id_micro=@id');
    res.json({ mensagem: 'Micro região excluída.' });
}));

// ==============================================================================
// VÍNCULO DAS UNIDADES (em massa) - unidades do projeto x macro/micro
// ==============================================================================
router.get('/regioes/unidades/:idProjeto', autenticar, autorizarModulo(['regioes', 'unidades']), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('p', sql.Int, parseIntSafe(req.params.idProjeto)).query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.ativo, u.id_macro, u.id_micro, c.nome_cidade, e.sigla AS uf,
               tu.sigla AS sigla_tipo, tu.nome_tipo
        FROM tab_unidades u
        LEFT JOIN tab_tipos_unidade tu ON tu.id_tipo_unidade = u.id_tipo_unidade
        LEFT JOIN tab_cidades c ON c.id_cidade = u.id_cidade
        LEFT JOIN tab_estados e ON e.id_estado = c.id_estado
        WHERE u.id_projeto = @p
        ORDER BY c.nome_cidade, u.nome_unidade`);
    res.json(r.recordset);
}));

router.post('/regioes/unidades/vincular', autenticar, autorizarModulo('regioes', 'editar'), asyncHandler(async (req, res) => {
    const { id_projeto, itens } = req.body || {};
    const idProjeto = parseIntSafe(id_projeto);
    if (!idProjeto || !Array.isArray(itens) || !itens.length) throw httpErro(400, 'Nada para salvar.');
    if (itens.length > 5000) throw httpErro(400, 'Limite de 5000 unidades por envio.');

    const pool = await connectToDb();
    // Regiões válidas do projeto (micro só vale com a macro correspondente).
    const reg = await pool.request().input('p', sql.Int, idProjeto).query(`
        SELECT m.id_macro, mi.id_micro FROM tab_macro_regioes m
        LEFT JOIN tab_micro_regioes mi ON mi.id_macro = m.id_macro
        WHERE m.id_projeto = @p`);
    const macros = new Set(reg.recordset.map(x => x.id_macro));
    const macroDaMicro = new Map(reg.recordset.filter(x => x.id_micro).map(x => [x.id_micro, x.id_macro]));

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    let atualizadas = 0;
    try {
        for (const it of itens) {
            const idU = parseIntSafe(it.id_unidade);
            let idMicro = parseIntSafe(it.id_micro) || null;
            let idMacro = parseIntSafe(it.id_macro) || null;
            if (idMicro && macroDaMicro.has(idMicro)) idMacro = macroDaMicro.get(idMicro);
            else idMicro = null;
            if (idMacro && !macros.has(idMacro)) { idMacro = null; idMicro = null; }
            if (!idU) continue;
            const r = await new sql.Request(transaction)
                .input('u', sql.Int, idU).input('p', sql.Int, idProjeto)
                .input('ma', sql.Int, idMacro).input('mi', sql.Int, idMicro)
                .query('UPDATE tab_unidades SET id_macro=@ma, id_micro=@mi WHERE id_unidade=@u AND id_projeto=@p; SELECT @@ROWCOUNT AS q;');
            atualizadas += r.recordset[0].q;
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
    res.json({ mensagem: `${atualizadas} unidade(s) atualizada(s).`, atualizadas });
}));

module.exports = router;
