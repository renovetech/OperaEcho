/* ============================================================================
   Submenu OPERAÇÕES > PROJETOS.

   As telas deste submenu (Registro de Atividades, Lançar Hora Extra,
   Gerador de Escalas) operam ISOLADAS por lotação. O usuário escolhe a
   lotação no seletor e o frontend chama os endpoints já existentes
   (/atividades, /hora-extra, /escalas) passando essa lotação como id_projeto.
   O isolamento é garantido pelo middleware carregarEscopo + filtros.

   Aqui ficam:
     - GET /projetos/minhas-lotacoes  -> popular o seletor (já filtrado por escopo)
   SQL em projetos.repository.js. Não há rotas de escrita.
   ============================================================================ */
const express = require('express');
const { autenticar } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const repositorio = require('./projetos.repository');

const router = express.Router();

router.get('/projetos/minhas-lotacoes', autenticar, asyncHandler(async (req, res) => {
    const escopo = req.escopo;
    if (escopo && escopo.global) return res.json({ global: true, lotacoes: await repositorio.listarLotacoesAtivas() });

    // Demais: apenas a(s) lotação(ões) do escopo.
    if (!escopo || escopo.lotacoes.length === 0) return res.json({ global: false, lotacoes: [] });

    return res.json({ global: false, lotacoes: await repositorio.listarLotacoes(escopo.lotacoes) });
}));

module.exports = router;
