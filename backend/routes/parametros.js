/* routes/parametros.js
 * Menu PARÂMETROS - configurações gerais do sistema, divididas por módulo
 * (Implantação / Projetos). Leitura liberada a qualquer usuário autenticado
 * (as telas de registro precisam conhecer as regras); gravação exige o módulo
 * 'parametros' com permissão de edição. */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { PADROES, carregarParametros, limparCacheParametros } = require('../utils/parametros');

// Somente chaves conhecidas podem ser gravadas.
const CHAVES = Object.keys(PADROES);

router.get('/parametros', autenticar, asyncHandler(async (req, res) => {
    res.json(await carregarParametros());
}));

// Detalhe (com descrição e auditoria) - tela do menu Parâmetros
router.get('/parametros/detalhes', autenticar, autorizarModulo('parametros'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query(`
        SELECT chave, valor, modulo, descricao, usuario_alteracao,
               FORMAT(data_alteracao, 'dd/MM/yyyy HH:mm') AS data_alteracao
        FROM tab_parametros`);
    res.json(r.recordset);
}));

router.post('/parametros/salvar', autenticar, autorizarModulo('parametros', 'editar'), asyncHandler(async (req, res) => {
    const itens = Array.isArray(req.body?.parametros) ? req.body.parametros : [];
    const validos = itens.filter(p => CHAVES.includes(p.chave));
    if (!validos.length) return res.status(400).json({ erro: 'Nenhum parâmetro válido informado.' });

    const usuario = String(req.usuario?.nome_completo || req.usuario?.nome || req.usuario?.usuario || 'Sistema').slice(0, 150);
    const pool = await connectToDb();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        for (const p of validos) {
            const valor = p.valor === true || p.valor === '1' || p.valor === 1 ? '1'
                : p.valor === false || p.valor === '0' || p.valor === 0 ? '0' : String(p.valor ?? '').slice(0, 500);
            await new sql.Request(transaction)
                .input('c', sql.VarChar(100), p.chave)
                .input('v', sql.VarChar(500), valor)
                .input('u', sql.VarChar(150), usuario)
                .query(`
                    UPDATE tab_parametros SET valor = @v, data_alteracao = DATEADD(hour, -3, GETUTCDATE()), usuario_alteracao = @u WHERE chave = @c;
                    IF @@ROWCOUNT = 0
                        INSERT INTO tab_parametros (chave, valor, data_alteracao, usuario_alteracao)
                        VALUES (@c, @v, DATEADD(hour, -3, GETUTCDATE()), @u);`);
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
    limparCacheParametros();
    res.json({ mensagem: 'Parâmetros salvos.', parametros: await carregarParametros() });
}));

module.exports = router;
