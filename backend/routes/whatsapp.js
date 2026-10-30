/* routes/whatsapp.js - Parâmetros > WhatsApp (Evolution API).
 * Leitura: módulo 'parametros'; gravação/ações: 'parametros' com edição.
 * A apikey é cifrada em repouso e NUNCA volta ao navegador (só "tem_token"). */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const { encryptTagged } = require('../utils/crypto');
const evo = require('../services/whatsapp/evolution');
const fila = require('../services/whatsapp/fila');
const notificacoes = require('../services/whatsapp/notificacoes');
const { TEXTOS, renderizar, modeloDoEvento } = require('../services/whatsapp/mensagens');

const ver = [autenticar, autorizarModulo('parametros')];
const editar = [autenticar, autorizarModulo('parametros', 'editar')];

const hhmm = (t) => (t instanceof Date ? `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}` : (t ? String(t).slice(0, 5) : null));
const isoData = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null));
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

async function nomeUsuario(pool, req) {
    const r = await pool.request().input('id', sql.Int, req.usuario.id_usuario).query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return String((r.recordset[0] && r.recordset[0].nome_completo) || req.usuario.usuario || 'Sistema').slice(0, 150);
}

// ------------------------------------------------------------------ configuração
router.get('/integracoes/whatsapp', ...ver, asyncHandler(async (req, res) => {
    const c = (await evo.lerConfig()) || {};
    const textos = {};
    Object.entries(TEXTOS).forEach(([ev, t]) => {
        textos[ev] = { personalizado: c[t.coluna] || '', padrao: t.padrao, variaveis: t.variaveis };
    });
    res.json({
        ativo: !!c.ativo, url_api: c.url_api || '', instancia: c.instancia || '', tem_token: !!c.token_acesso,
        fila: fila.parametros(c),
        eventos: {
            escala_semanal_ativa: !!c.escala_semanal_ativa, escala_semanal_dia: c.escala_semanal_dia ?? 0,
            escala_semanal_hora: hhmm(c.escala_semanal_hora) || '18:00', escala_semanal_referencia: c.escala_semanal_referencia || 'PROXIMA',
            escala_semanal_ultima: isoData(c.escala_semanal_ultima),
            escala_alteracao_ativa: !!c.escala_alteracao_ativa, escala_alteracao_espera: c.escala_alteracao_espera ?? 10,
            ferias_ativa: !!c.ferias_ativa, codigo_senha_ativa: c.codigo_senha_ativa !== false
        },
        textos,
        data_atualizacao: c.data_atualizacao || null, usuario_alteracao: c.usuario_alteracao || null
    });
}));

router.post('/integracoes/whatsapp', ...editar, asyncHandler(async (req, res) => {
    const b = req.body || {};
    const ev = b.eventos || {};
    const f = b.fila || {};

    const url = String(b.url_api || '').trim();
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw httpErro(400, 'URL da Evolution inválida (use http:// ou https://).');
    const inst = String(b.instancia || '').trim();
    if (inst && !/^[\w.@-]{1,100}$/.test(inst)) throw httpErro(400, 'Nome da instância inválido.');
    if (b.ativo && (!url || !inst || (!b.token_acesso && !(await evo.lerConfig())?.token_acesso))) {
        throw httpErro(400, 'Para ativar, informe URL, instância e apikey da Evolution.');
    }

    const int = (v, min, max, nome) => {
        if (v === undefined || v === null || v === '') return null;
        const n = parseInt(v, 10);
        if (isNaN(n) || n < min || n > max) throw httpErro(400, `${nome}: valor entre ${min} e ${max}.`);
        return n;
    };
    const limiteInicial = int(f.limiteInicial, 1, 5000, 'Limite inicial');
    const limiteMaximo = int(f.limiteMaximo, 1, 20000, 'Limite máximo');
    const pausaMin = int(f.pausaMinima, 1, 120, 'Pausa mínima');
    const pausaMax = int(f.pausaMaxima, 1, 300, 'Pausa máxima');
    if (pausaMin && pausaMax && pausaMin > pausaMax) throw httpErro(400, 'A pausa mínima não pode ser maior que a máxima.');
    if (limiteInicial && limiteMaximo && limiteInicial > limiteMaximo) throw httpErro(400, 'O limite inicial não pode passar do teto diário.');
    for (const [h, nome] of [[f.horaInicio, 'Início da janela'], [f.horaFim, 'Fim da janela'], [ev.escala_semanal_hora, 'Hora da escala semanal']]) {
        if (h && !HORA.test(h)) throw httpErro(400, `${nome}: use HH:MM.`);
    }
    const hoje = new Date().toISOString().slice(0, 10);
    if (f.inicioAquecimento && (!/^\d{4}-\d{2}-\d{2}$/.test(f.inicioAquecimento) || f.inicioAquecimento > hoje)) throw httpErro(400, 'O início do aquecimento não pode ser futuro.');
    const referencia = ev.escala_semanal_referencia === 'ATUAL' ? 'ATUAL' : 'PROXIMA';

    const textos = b.textos || {};
    const pool = await connectToDb();
    const r = pool.request()
        .input('atv', sql.Bit, b.ativo ? 1 : 0)
        .input('url', sql.VarChar(300), url || null)
        .input('inst', sql.VarChar(100), inst || null)
        .input('tok', sql.VarChar(sql.MAX), b.token_acesso ? encryptTagged(String(b.token_acesso).trim()) : null)
        .input('ini', sql.Date, f.inicioAquecimento || null)
        .input('lini', sql.Int, limiteInicial).input('cre', sql.Int, int(f.crescimentoSemanal, 0, 300, 'Crescimento semanal'))
        .input('lmax', sql.Int, limiteMaximo).input('pmin', sql.Int, int(f.maxPorMinuto, 1, 60, 'Máximo por minuto'))
        .input('p1', sql.Int, pausaMin).input('p2', sql.Int, pausaMax)
        .input('h1', sql.VarChar(5), f.horaInicio || null).input('h2', sql.VarChar(5), f.horaFim || null)
        .input('esa', sql.Bit, ev.escala_semanal_ativa ? 1 : 0)
        .input('esd', sql.TinyInt, int(ev.escala_semanal_dia, 0, 6, 'Dia da escala semanal') ?? 0)
        .input('esh', sql.VarChar(5), ev.escala_semanal_hora || '18:00')
        .input('esr', sql.VarChar(10), referencia)
        .input('eaa', sql.Bit, ev.escala_alteracao_ativa ? 1 : 0)
        .input('eae', sql.Int, int(ev.escala_alteracao_espera, 1, 240, 'Espera da alteração') ?? 10)
        .input('fa', sql.Bit, ev.ferias_ativa ? 1 : 0)
        .input('csa', sql.Bit, ev.codigo_senha_ativa === false ? 0 : 1)
        .input('usr', sql.VarChar(150), await nomeUsuario(pool, req));
    const colunas = {};
    Object.entries(TEXTOS).forEach(([evento, t], i) => {
        const v = textos[evento];
        const limpo = typeof v === 'string' && v.trim() && v.trim() !== t.padrao.trim() ? v.slice(0, 2000) : null;
        r.input(`t${i}`, sql.NVarChar(2000), limpo);
        colunas[t.coluna] = `@t${i}`;
    });

    await r.query(`
        IF NOT EXISTS (SELECT 1 FROM tab_whatsapp_config WHERE id = 1) INSERT INTO tab_whatsapp_config (id) VALUES (1);
        UPDATE tab_whatsapp_config SET
            ativo = @atv, url_api = @url, instancia = @inst, token_acesso = COALESCE(@tok, token_acesso),
            inicio_aquecimento = CASE WHEN @atv = 1 AND @ini IS NULL AND inicio_aquecimento IS NULL THEN CAST(GETDATE() AS date) ELSE COALESCE(@ini, inicio_aquecimento) END,
            limite_inicial = @lini, crescimento_semanal = @cre, limite_maximo = @lmax, max_por_minuto = @pmin,
            pausa_min_seg = @p1, pausa_max_seg = @p2,
            hora_envio_inicio = CAST(@h1 AS time(0)), hora_envio_fim = CAST(@h2 AS time(0)),
            escala_semanal_ativa = @esa, escala_semanal_dia = @esd, escala_semanal_hora = CAST(@esh AS time(0)), escala_semanal_referencia = @esr,
            escala_alteracao_ativa = @eaa, escala_alteracao_espera = @eae, ferias_ativa = @fa, codigo_senha_ativa = @csa,
            ${Object.entries(colunas).map(([c, p]) => `${c} = ${p}`).join(', ')},
            data_atualizacao = GETDATE(), usuario_alteracao = @usr
        WHERE id = 1;`);
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
    catch (e) { throw httpErro(502, `A Evolution recusou ou não respondeu: ${e.message}`); }
}));

router.post('/integracoes/whatsapp/desconectar', ...editar, asyncHandler(async (req, res) => {
    const cx = await conexaoOuErro();
    try { await evo.desconectar(cx); res.json({ mensagem: 'Número desconectado.' }); }
    catch (e) { throw httpErro(502, `A Evolution recusou ou não respondeu: ${e.message}`); }
}));

// ------------------------------------------------------------------ fila e trilha
router.get('/integracoes/whatsapp/fila', ...ver, asyncHandler(async (req, res) => {
    res.json(await fila.situacao());
}));

router.get('/integracoes/whatsapp/envios', ...ver, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = pool.request();
    let where = ' WHERE 1=1 ';
    if (req.query.status) { where += ' AND e.status = @st'; r.input('st', sql.VarChar(20), String(req.query.status).slice(0, 20)); }
    if (req.query.tipo) { where += ' AND e.tipo_evento = @tp'; r.input('tp', sql.VarChar(30), String(req.query.tipo).slice(0, 30)); }
    if (req.query.termo) { where += ' AND u.nome_completo LIKE @t'; r.input('t', sql.VarChar(110), `%${String(req.query.termo).slice(0, 100)}%`); }
    const limite = Math.min(500, Math.max(1, parseInt(req.query.limite) || 100));
    const q = await r.query(`
        SELECT TOP (${limite}) e.id_envio, e.id_usuario, u.nome_completo, e.numero, e.tipo_evento, e.modulo, e.status, e.motivo, e.erro,
               e.prioridade, e.usuario_origem,
               CASE WHEN e.tipo_evento = 'CODIGO_SENHA' THEN N'(código de senha oculto)' ELSE e.mensagem END AS mensagem,
               FORMAT(e.data_criacao, 'dd/MM/yyyy HH:mm') AS data_criacao, FORMAT(e.data_envio, 'dd/MM/yyyy HH:mm') AS data_envio,
               FORMAT(e.liberar_em, 'dd/MM/yyyy HH:mm') AS liberar_em
        FROM tab_whatsapp_envios e LEFT JOIN tab_usuarios u ON u.id_usuario = e.id_usuario
        ${where} ORDER BY e.id_envio DESC`);
    res.json(q.recordset.map(x => ({ ...x, numero: x.numero ? evo.mascararCelular(x.numero) : null })));
}));

router.post('/integracoes/whatsapp/envios/:id/reenviar', ...editar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
        .query(`UPDATE tab_whatsapp_envios SET status = 'PENDENTE', erro = NULL, motivo = NULL, data_envio = NULL,
                expira_em = CASE WHEN expira_em < GETDATE() THEN DATEADD(DAY, 1, GETDATE()) ELSE expira_em END
                WHERE id_envio = @id AND status IN ('FALHA', 'CANCELADO') AND tipo_evento <> 'CODIGO_SENHA' AND numero IS NOT NULL AND mensagem IS NOT NULL`);
    if (!r.rowsAffected[0]) throw httpErro(400, 'Só é possível reenviar mensagens com falha ou canceladas (exceto códigos de senha).');
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

router.post('/integracoes/whatsapp/escala-semanal/enviar', ...editar, asyncHandler(async (req, res) => {
    const semana = String((req.body && req.body.semana) || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(semana)) throw httpErro(400, 'Informe a semana (data da segunda-feira).');
    const segunda = notificacoes.iso(notificacoes.segundaDe(new Date(`${semana}T12:00:00`)));
    const pool = await connectToDb();
    const c = await evo.lerConfig(pool);
    if (!c || !c.ativo) throw httpErro(400, 'Ative a integração antes de enviar.');
    const modulos = Array.isArray(req.body.modulos) && req.body.modulos.length ? req.body.modulos.filter(m => notificacoes.MODULOS[m]) : undefined;
    const r = await notificacoes.enfileirarEscalaSemanal(pool, c, segunda, { usuarioOrigem: await nomeUsuario(pool, req), modulos, forcar: !!req.body.forcar });
    res.json({ mensagem: `Semana de ${segunda.split('-').reverse().join('/')}: ${r.enfileiradas} mensagem(ns) na fila, ${r.naoEnviadas} sem WhatsApp, ${r.ignoradas} já enviada(s).`, ...r });
}));

// Prévia de um texto com dados de exemplo (tela de edição dos modelos)
router.post('/integracoes/whatsapp/previa', ...ver, asyncHandler(async (req, res) => {
    const evento = String((req.body && req.body.evento) || '');
    if (!TEXTOS[evento]) throw httpErro(400, 'Evento inválido.');
    const exemplo = {
        nome: 'MARIA DA SILVA', primeiroNome: 'Maria', modulo: 'Implantação', periodo: '27/10 a 02/11/2026',
        escala: '• *Seg 27/10* - Trabalho (Diurno)\n   UPA Centro · Projeto Exemplo\n• *Ter 28/10* - Folga',
        alteracoes: '• *Qua 29/10* - Home Office', responsavel: 'João Gestor',
        inicio: '03/11/2026', fim: '17/11/2026', retorno: '18/11/2026', dias: '15', tipo: '1º Período (15 Dias)', periodoAquisitivo: '2025',
        codigo: '123456', validade: '10'
    };
    const modelo = typeof req.body.texto === 'string' && req.body.texto.trim() ? req.body.texto : modeloDoEvento(await evo.lerConfig(), evento);
    res.json({ previa: renderizar(modelo, exemplo) });
}));

module.exports = router;
