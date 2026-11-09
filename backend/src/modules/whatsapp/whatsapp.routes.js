/* Parâmetros > WhatsApp (Evolution API).
 * Leitura: módulo 'parametros'; gravação/ações: 'parametros' com edição.
 * A apikey é cifrada em repouso e NUNCA volta ao navegador (só "tem_token").
 * Aqui ficam URLs, permissões e validação; o SQL está em whatsapp.repository.js e as regras da
 * configuração em whatsapp.configuracao.js. */
const express = require('express');
const router = express.Router();
const { connectToDb } = require('../../config/database');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler, httpErro } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const evo = require('./evolution');
const fila = require('./fila');
const notificacoes = require('./notificacoes');
const { TEXTOS, renderizar, modeloDoEvento } = require('./mensagens');
const repositorio = require('./whatsapp.repository');
const { configParaTela, validarConfiguracao } = require('./whatsapp.configuracao');
const { salvarConfiguracao, enviarEscalaSemanal, previaDeMensagem } = require('./whatsapp.schema');

const ver = [autenticar, autorizarModulo('parametros')];
const editar = [autenticar, autorizarModulo('parametros', 'editar')];

const FORMATO_SEMANA = /^\d{4}-\d{2}-\d{2}$/;
const ERRO_EVOLUTION = 502;

/* Dados de exemplo da prévia dos modelos de mensagem. */
const EXEMPLO_DA_PREVIA = {
    nome: 'MARIA DA SILVA', primeiroNome: 'Maria', modulo: 'Implantação', periodo: '27/10 a 02/11/2026',
    escala: '• *Seg 27/10* - Trabalho (Diurno)\n   UPA Centro · Projeto Exemplo\n• *Ter 28/10* - Folga',
    alteracoes: '• *Qua 29/10* - Home Office', responsavel: 'João Gestor',
    inicio: '03/11/2026', fim: '17/11/2026', retorno: '18/11/2026', dias: '15', tipo: '1º Período (15 Dias)', periodoAquisitivo: '2025',
    codigo: '123456', validade: '10'
};

const falhaDaEvolution = (e) => Object.assign(httpErro(ERRO_EVOLUTION, `A Evolution recusou ou não respondeu: ${e.message}`), { expor: true });

// ------------------------------------------------------------------ configuração
router.get('/integracoes/whatsapp', ...ver, asyncHandler(async (req, res) => {
    res.json(configParaTela((await evo.lerConfig()) || {}));
}));

router.post('/integracoes/whatsapp', ...editar, validarCorpo(salvarConfiguracao), asyncHandler(async (req, res) => {
    const valores = await validarConfiguracao(req.body || {});
    const pool = await connectToDb();
    await repositorio.gravarConfiguracao(pool, valores, await repositorio.nomeDoUsuario(pool, req.usuario));
    fila.acordar();
    res.json({ mensagem: 'Configuração do WhatsApp salva.' });
}));

// ------------------------------------------------------------------ conexão (proxy seguro)
async function conexaoOuErro() {
    const cx = evo.conexao(await evo.lerConfig());
    if (!cx) throw httpErro(400, 'Integração WhatsApp não configurada (URL, instância e apikey).');
    return cx;
}

router.get('/integracoes/whatsapp/status', ...ver, asyncHandler(async (req, res) => {
    const cx = evo.conexao(await evo.lerConfig());
    res.json({ status: await evo.estado(cx) });
}));

router.get('/integracoes/whatsapp/qrcode', ...editar, asyncHandler(async (req, res) => {
    const cx = await conexaoOuErro();
    try { res.json(await evo.qrcode(cx)); }
    catch (e) { throw falhaDaEvolution(e); }
}));

router.post('/integracoes/whatsapp/desconectar', ...editar, asyncHandler(async (req, res) => {
    const cx = await conexaoOuErro();
    try { await evo.desconectar(cx); res.json({ mensagem: 'Número desconectado.' }); }
    catch (e) { throw falhaDaEvolution(e); }
}));

// ------------------------------------------------------------------ fila e trilha
router.get('/integracoes/whatsapp/fila', ...ver, asyncHandler(async (req, res) => {
    res.json(await fila.situacao());
}));

router.get('/integracoes/whatsapp/envios', ...ver, asyncHandler(async (req, res) => {
    const envios = await repositorio.listarEnvios(req.query);
    res.json(envios.map(x => ({ ...x, numero: x.numero ? evo.mascararCelular(x.numero) : null })));
}));

router.post('/integracoes/whatsapp/envios/:id/reenviar', ...editar, asyncHandler(async (req, res) => {
    if (!await repositorio.reenviar(parseInt(req.params.id))) throw httpErro(400, 'Só é possível reenviar mensagens com falha ou canceladas (exceto códigos de senha).');
    fila.acordar();
    res.json({ mensagem: 'Mensagem voltou para a fila.' });
}));

// ------------------------------------------------------------------ ações
router.post('/integracoes/whatsapp/teste', ...editar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await notificacoes.teste(pool, req.usuario.id_usuario);
    if (!r.enviado) throw httpErro(400, r.motivo === 'SEM_WHATSAPP_CONFIRMADO' || r.motivo === 'CELULAR_INVALIDO'
        ? 'Seu cadastro não tem celular com WhatsApp confirmado. Atualize seu contato e tente de novo.'
        : `Não foi possível enfileirar o teste (${r.motivo}).`);
    res.json({ mensagem: `Teste na fila para ${evo.mascararCelular(r.numero)}. Chega em instantes se o número estiver conectado.` });
}));

router.post('/integracoes/whatsapp/escala-semanal/enviar', ...editar, validarCorpo(enviarEscalaSemanal), asyncHandler(async (req, res) => {
    const semana = String((req.body && req.body.semana) || '');
    if (!FORMATO_SEMANA.test(semana)) throw httpErro(400, 'Informe a semana (data da segunda-feira).');
    const segunda = notificacoes.iso(notificacoes.segundaDe(new Date(`${semana}T12:00:00`)));
    const pool = await connectToDb();
    const c = await evo.lerConfig(pool);
    if (!c || !c.ativo) throw httpErro(400, 'Ative a integração antes de enviar.');
    const modulos = Array.isArray(req.body.modulos) && req.body.modulos.length ? req.body.modulos.filter(m => notificacoes.MODULOS[m]) : undefined;
    const r = await notificacoes.enfileirarEscalaSemanal(pool, c, segunda, { usuarioOrigem: await repositorio.nomeDoUsuario(pool, req.usuario), modulos, forcar: !!req.body.forcar });
    res.json({ mensagem: `Semana de ${segunda.split('-').reverse().join('/')}: ${r.enfileiradas} mensagem(ns) na fila, ${r.naoEnviadas} sem WhatsApp, ${r.ignoradas} já enviada(s).`, ...r });
}));

// Prévia de um texto com dados de exemplo (tela de edição dos modelos)
router.post('/integracoes/whatsapp/previa', ...ver, validarCorpo(previaDeMensagem), asyncHandler(async (req, res) => {
    const evento = String((req.body && req.body.evento) || '');
    if (!TEXTOS[evento]) throw httpErro(400, 'Evento inválido.');
    const modelo = typeof req.body.texto === 'string' && req.body.texto.trim() ? req.body.texto : modeloDoEvento(await evo.lerConfig(), evento);
    res.json({ previa: renderizar(modelo, EXEMPLO_DA_PREVIA) });
}));

module.exports = router;
