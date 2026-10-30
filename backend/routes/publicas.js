/* routes/publicas.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { asyncHandler } = require('../middlewares/errorHandler');
const { autenticar } = require('../middlewares/auth');
const { limitar } = require('../utils/rateLimit');

// ==============================================================================
// VERSÃO DO APP MOBILE (APK) E DO PWA
// Lida pelo app e pelo PWA ao abrir: versão diferente => atualização automática.
// ==============================================================================
const VERSAO_APP = '2026.12.01';
const VERSAO_PWA = '2026.12.01';
router.get('/app-version', (req, res) => {
    res.set('Cache-Control', 'no-store').json({
        versao_atual: VERSAO_APP,
        versao_pwa: VERSAO_PWA,
        link_download: 'https://operaecho.com/download/opera-echo-mobile.apk',
        obrigatorio: true,
        mensagem: "Uma nova versão obrigatória do Opera Echo está disponível. Por favor, atualize para continuar."
    });
});

// ==============================================================================
// INFO DO SISTEMA (barra de rodapé): IP da máquina do usuário como o servidor a vê
// ==============================================================================
const VERSAO_API = require('../package.json').version;
router.get('/sistema/info', (req, res) => {
    let ip = String(req.ip || '').replace(/^::ffff:/, '');
    if (ip === '::1') ip = '127.0.0.1';
    res.set('Cache-Control', 'no-store').json({ ip, versao_api: VERSAO_API });
});

// ==============================================================================
// RASTREAMENTO GPS (MOBILE / WEB)
// Exige JWT; o "usuario" vem do token, não do corpo.
// ==============================================================================
router.post('/rastreio-background', autenticar, asyncHandler(async (req, res) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' });
    const { latitude, longitude, tipo_registro, detalhes_registro } = req.body || {};

    const lat = Number(latitude), lng = Number(longitude);
    if (latitude == null || longitude == null || !Number.isFinite(lat) || !Number.isFinite(lng)
        || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return res.status(400).json({ erro: 'Coordenadas inválidas' });
    }

    // Nome gravado = nome completo do dono do token (o relatório de auditoria
    // filtra por esse nome exato). O "usuario" do corpo é ignorado.
    const pool = await connectToDb();
    const rNome = await pool.request().input('id', sql.Int, req.usuario.id_usuario)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    const autor = rNome.recordset[0]?.nome_completo || req.usuario.usuario;

    await pool.request()
        .input('user', sql.VarChar, String(autor).slice(0, 150))
        .input('lat', sql.Float, lat)
        .input('lng', sql.Float, lng)
        .input('tipo', sql.VarChar, String(tipo_registro || 'SEGUNDO_PLANO').slice(0, 50))
        .input('detalhes', sql.VarChar, String(detalhes_registro || '').slice(0, 2000))
        .query(`
            INSERT INTO tab_rastreamento_app (usuario, latitude, longitude, tipo_registro, data_hora, detalhes_registro)
            VALUES (@user, @lat, @lng, @tipo, DATEADD(hour, -3, GETUTCDATE()), @detalhes)
        `);

    res.json({ ok: true });
}));

// ==============================================================================
// VALIDAÇÃO PÚBLICA DE CNES (INDICADORES APS)
// ==============================================================================
// Pública: limitada por IP para não servir de enumeração da base de unidades
const limiteCnes = limitar({ janelaMs: 60 * 1000, max: 30 });
router.get('/indicadores/validar-cnes/:cnes', limiteCnes, asyncHandler(async (req, res) => {
    const cnes = String(req.params.cnes || '').replace(/\D/g, '');
    if (!cnes || cnes.length > 7) return res.json({ cadastrado: false, produtoValido: false });
    const pool = await connectToDb();
    const result = await pool.request()
        .input('cnes', sql.VarChar, cnes)
        .query(`
            SELECT u.nome_unidade,
                CASE WHEN EXISTS (
                    SELECT 1 FROM tab_unidade_produtos up
                    WHERE up.id_unidade = u.id_unidade AND up.id_produto IN (4, 17)
                ) THEN 1 ELSE 0 END as possui_produto
            FROM tab_unidades u WHERE u.cnes = @cnes AND u.ativo = 1
        `);

    if (result.recordset.length === 0) {
        return res.json({ cadastrado: false, produtoValido: false });
    }

    const uni = result.recordset[0];
    res.json({
        cadastrado: true,
        produtoValido: uni.possui_produto === 1,
        nomeUnidade: uni.nome_unidade
    });
}));

module.exports = router;
