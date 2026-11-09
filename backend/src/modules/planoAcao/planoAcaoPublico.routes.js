/*
 * ------------------------------------------------------------------------
 * PAINEL PÚBLICO DO PLANO DE AÇÃO (sem login, somente leitura).
 * Regras:
 *  - Só aparecem planos com publico = 1 (publicação explícita pelo gestor).
 *  - Plano individual: acesso pelo token_publico (UUID não adivinhável);
 *    despublicar ou gerar novo link revoga o link anterior.
 *  - Carteira (/publico/plano-acao/painel sem token): todos os planos públicos.
 *  - Dados sanitizados: sem observações, nomes de pessoas, horas por pessoa
 *    ou tokens de outros planos.
 *  - Rate limit por IP.
 * ------------------------------------------------------------------------ */
const express = require('express');
const router = express.Router();
const { connectToDb } = require('../../config/database');
const { asyncHandler, httpErro } = require('../../middlewares/errorHandler');
const { limitar } = require('../../shared/rateLimit');
const S = require('./planoAcao.service');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const limite = limitar({ janelaMs: 60 * 1000, max: 60 });

const semCache = (res) => res.set('Cache-Control', 'no-store');

// Carteira de planos públicos
router.get('/publico/plano-acao/painel', limite, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    await S.sincronizarAtrasos(pool);
    const projeto = parseInt(req.query.projeto, 10);
    const base = await S.carregarBase(pool, { somentePublicos: true, id_projeto: isNaN(projeto) ? null : projeto });
    const painel = S.montarPainel(base, { publico: true });
    // Planos da carteira já são públicos: expõe o link de cada um para navegação
    const tokens = new Map(base.planos.map(p => [p.id_plano, p.token_publico]));
    painel.planos = painel.planos.map(({ id_plano, ...p }) => ({ ...p, token_publico: tokens.get(id_plano) || null }));
    semCache(res).json({ ...painel, escopo: 'carteira' });
}));

// Painel de um plano específico (link compartilhável)
router.get('/publico/plano-acao/painel/:token', limite, asyncHandler(async (req, res) => {
    const token = String(req.params.token || '');
    if (!UUID.test(token)) throw httpErro(404, 'Painel não encontrado.');
    const pool = await connectToDb();
    const base = await S.carregarBase(pool, { token });
    if (!base.planos.length) throw httpErro(404, 'Painel não encontrado ou não está mais público.');
    await S.sincronizarAtrasos(pool, base.planos[0].id_plano);
    const base2 = await S.carregarBase(pool, { token });
    const painel = S.montarPainel(base2, { publico: true });
    painel.planos = painel.planos.map(({ id_plano, ...p }) => p);

    // Cronograma resumido do plano (sem observações / pessoas)
    const p = base2.planos[0];
    const etapas = base2.itens
        .sort((a, b) => String(a.modulo || '').localeCompare(String(b.modulo || '')) || (a.id_unidade || 0) - (b.id_unidade || 0) || (a.ordem || 0) - (b.ordem || 0))
        .map(i => ({
            descricao: i.descricao, cliente: S.clienteEfetivo(i, p), modulo: i.modulo, grupo: i.id_unidade ? null : (i.grupo || 'GERAL'), unidade: i.nome_unidade,
            responsavel: i.responsavel, status: S.normStatus(i.status), prioridade: i.prioridade || 'Alta',
            data_inicio: S.iso(i.data_inicio), data_fim: S.iso(i.data_fim),
            data_inicio_real: S.iso(i.data_inicio_real), data_fim_real: S.iso(i.data_fim_real)
        }));
    semCache(res).json({
        ...painel,
        escopo: 'plano',
        plano: {
            titulo: p.titulo, cliente: S.clienteDoPlano(p), descricao: p.descricao, nome_projeto: p.nome_projeto, status: p.status,
            data_criacao: S.iso(p.data_criacao), data_inicio_prevista: S.iso(p.data_inicio_prevista), data_fim_prevista: S.iso(p.data_fim_prevista)
        },
        etapas
    });
}));

module.exports = router;
