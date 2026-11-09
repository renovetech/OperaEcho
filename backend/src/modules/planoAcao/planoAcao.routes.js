/*
 * ------------------------------------------------------------------------
 * PLANO DE AÇÃO v3 - rotas internas: URLs, permissões por módulo e validação da entrada.
 * As regras ficam em planoAcao.service.js (plano), planoAcao.itens.service.js (ações, apontamentos,
 * unidades e etapas) e planoAcao.grade.service.js (grade em lote); o SQL, nos arquivos *.repository.js.
 * A ordem das rotas importa: as de caminho fixo vêm antes das que usam /:id.
 * Pré-requisitos: patch_plano_itens.sql e sql/patch_plano_acao_v3.sql.
 * ------------------------------------------------------------------------ */
const express = require('express');
const router = express.Router();
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const servico = require('./planoAcao.service');
const servicoItens = require('./planoAcao.itens.service');
const servicoGrade = require('./planoAcao.grade.service');
const esquemas = require('./planoAcao.schema');
const { toInt } = require('./planoAcao.entrada');
const { MODULO, MODULO_PAINEL } = require('./planoAcao.acesso');

const podeVer = autorizarModulo(MODULO, 'acessar');
const podeNovo = autorizarModulo(MODULO, 'novo');
const podeVerPainel = autorizarModulo([MODULO, MODULO_PAINEL], 'acessar');
const corpoDe = (req) => req.body || {};
const confirmado = (req) => req.query.forcar === '1';

/* Criar plano, listagem, situações e painel */
router.post('/plano-acao/salvar', autenticar, podeNovo, validarCorpo(esquemas.criarPlano), asyncHandler(async (req, res) => {
    const idPlano = await servico.criarPlano(req, corpoDe(req));
    res.json({ mensagem: 'Plano criado!', id_plano: idPlano });
}));

router.get('/plano-acao/buscar', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servico.listarPlanos(req, req.query));
}));

router.get('/plano-acao/painel', autenticar, podeVerPainel, asyncHandler(async (req, res) => {
    res.json(await servico.montarPainelInterno(req, req.query));
}));

/* Apontamentos (horas trabalhadas / execuções) */
router.get('/plano-acao/itens/:idItem/apontamentos', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servicoItens.listarApontamentos(req, toInt(req.params.idItem)));
}));

router.post('/plano-acao/itens/:idItem/apontamentos', autenticar, podeVer, validarCorpo(esquemas.apontarHoras), asyncHandler(async (req, res) => {
    res.json(await servicoItens.apontarHoras(req, toInt(req.params.idItem), corpoDe(req)));
}));

router.delete('/plano-acao/apontamentos/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    await servicoItens.excluirApontamento(req, toInt(req.params.id));
    res.json({ ok: true });
}));

/* Ações: reordenar, excluir, incluir */
router.post('/plano-acao/itens/:idItem/mover', autenticar, podeVer, validarCorpo(esquemas.moverItem), asyncHandler(async (req, res) => {
    res.json(await servicoItens.moverItem(req, toInt(req.params.idItem), corpoDe(req).direcao));
}));

router.delete('/plano-acao/itens/:idItem', autenticar, podeVer, asyncHandler(async (req, res) => {
    await servicoItens.excluirItem(req, toInt(req.params.idItem), confirmado(req));
    res.json({ ok: true });
}));

router.post('/plano-acao/:id/itens', autenticar, podeVer, validarCorpo(esquemas.incluirItem), asyncHandler(async (req, res) => {
    res.json(await servicoItens.incluirItem(req, toInt(req.params.id), corpoDe(req)));
}));

/* Grade (lote) - com validação e regras de transição */
router.post('/plano-acao/atualizar-lote-etapas', autenticar, podeVer, validarCorpo(esquemas.salvarGrade), asyncHandler(async (req, res) => {
    const resultado = await servicoGrade.salvarGrade(req, corpoDe(req));
    if (resultado.invalido) return res.status(400).json(resultado.invalido);
    return res.json(resultado);
}));

/* Unidades: adicionar (com etapas do modelo) / remover */
router.post('/plano-acao/adicionar-unidade-etapas', autenticar, podeVer, validarCorpo(esquemas.adicionarUnidade), asyncHandler(async (req, res) => {
    res.json(await servicoItens.adicionarUnidade(req, corpoDe(req)));
}));

router.delete('/plano-acao/:id/unidades/:idUnidade', autenticar, podeVer, asyncHandler(async (req, res) => {
    await servicoItens.removerUnidade(req, toInt(req.params.id), toInt(req.params.idUnidade), confirmado(req));
    res.json({ ok: true });
}));

/* Encerrar / reabrir */
router.put('/plano-acao/encerrar/:id', autenticar, podeVer, validarCorpo(esquemas.encerrarPlano), asyncHandler(async (req, res) => {
    res.json(await servico.encerrarPlano(req, toInt(req.params.id), corpoDe(req)));
}));

router.put('/plano-acao/reabrir/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servico.reabrirPlano(req, toInt(req.params.id)));
}));

/* Detalhe do plano: histórico e equipe disponível */
router.get('/plano-acao/:id/historico', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servico.listarHistorico(req, toInt(req.params.id)));
}));

router.get('/plano-acao/:id/equipe-disponivel', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servico.listarEquipeDisponivel(req, toInt(req.params.id)));
}));

/* Etapas (grupos de ações): renomear / excluir */
router.put('/plano-acao/:id/etapas', autenticar, podeVer, validarCorpo(esquemas.renomearEtapa), asyncHandler(async (req, res) => {
    res.json(await servicoItens.renomearEtapa(req, toInt(req.params.id), corpoDe(req)));
}));

router.delete('/plano-acao/:id/etapas', autenticar, podeVer, asyncHandler(async (req, res) => {
    await servicoItens.excluirEtapa(req, toInt(req.params.id), req.query);
    res.json({ ok: true });
}));

/* Dados do plano, publicação (link público somente leitura), detalhe e exclusão */
router.put('/plano-acao/:id', autenticar, podeVer, validarCorpo(esquemas.atualizarPlano), asyncHandler(async (req, res) => {
    await servico.atualizarDados(req, toInt(req.params.id), corpoDe(req));
    res.json({ ok: true });
}));

router.post('/plano-acao/:id/publico', autenticar, podeVer, validarCorpo(esquemas.publicarPlano), asyncHandler(async (req, res) => {
    res.json(await servico.alterarPublicacao(req, toInt(req.params.id), corpoDe(req)));
}));

router.get('/plano-acao/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(await servico.detalharPlano(req, toInt(req.params.id)));
}));

router.delete('/plano-acao/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    await servico.excluirPlano(req, toInt(req.params.id));
    res.json({ mensagem: 'Excluído' });
}));

module.exports = router;
