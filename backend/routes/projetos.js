/* ============================================================================
   routes/projetos.js
   Submenu OPERAÇÕES > PROJETOS.

   As telas deste submenu (Registro de Atividades, Lançar Hora Extra,
   Gerador de Escalas) operam ISOLADAS por lotação. O usuário escolhe a
   lotação no seletor e o frontend chama os endpoints já existentes
   (/atividades, /hora-extra, /escalas) passando essa lotação como id_projeto.
   O isolamento é garantido pelo middleware carregarEscopo + filtros.

   Aqui ficam:
     - GET /projetos/minhas-lotacoes  -> popular o seletor (já filtrado por escopo)
     - GET /projetos/validar/:id      -> conferir se a lotação está no escopo
   ============================================================================ */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { lotacaoNoEscopo } = require('../middlewares/lotacao');

// ==============================================================================
// LOTAÇÕES QUE O USUÁRIO PODE OPERAR (seletor do submenu Projetos)
// ==============================================================================
router.get('/projetos/minhas-lotacoes', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();

    // Visão global (SEDE - GD): todas as lotações ativas.
    if (req.escopo && req.escopo.global) {
        const r = await pool.request().query(`
            SELECT id_projeto, nome_projeto, visao_global
            FROM tab_projetos
            WHERE gera_lotacao = 1 AND ativo = 1
            ORDER BY nome_projeto
        `);
        return res.json({ global: true, lotacoes: r.recordset });
    }

    // Demais: apenas a(s) lotação(ões) do escopo.
    if (!req.escopo || req.escopo.lotacoes.length === 0) {
        return res.json({ global: false, lotacoes: [] });
    }

    const request = pool.request();
    const marks = req.escopo.lotacoes.map((id, i) => {
        request.input(`l${i}`, sql.Int, id);
        return `@l${i}`;
    });

    const r = await request.query(`
        SELECT id_projeto, nome_projeto, visao_global
        FROM tab_projetos
        WHERE id_projeto IN (${marks.join(',')})
        ORDER BY nome_projeto
    `);

    res.json({ global: false, lotacoes: r.recordset });
}));

// ==============================================================================
// VALIDAR SE UMA LOTAÇÃO ESTÁ NO ESCOPO DO USUÁRIO
// (guarda para ações de escrita do submenu Projetos)
// ==============================================================================
router.get('/projetos/validar/:id', autenticar, asyncHandler(async (req, res) => {
    const permitido = lotacaoNoEscopo(req.escopo, req.params.id);
    if (!permitido) {
        return res.status(403).json({ permitido: false, erro: 'Lotação fora do seu escopo.' });
    }
    res.json({ permitido: true });
}));

module.exports = router;
