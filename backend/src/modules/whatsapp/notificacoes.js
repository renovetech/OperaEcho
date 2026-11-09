/* services/whatsapp/notificacoes.js - eventos do Opera Echo que viram mensagem.
 *  - ESCALA_SEMANAL: no dia/hora configurados, cada colaborador recebe a escala
 *    da semana (atual ou próxima), por módulo (Implantação / Projetos).
 *  - ESCALA_ALTERACAO: mudanças na escala de um colaborador são AGRUPADAS - a
 *    mensagem só sai depois de N minutos sem novas mudanças (o gerador de
 *    escalas grava célula a célula; sem isso seriam dezenas de mensagens).
 *    Só vale para datas de hoje em diante e, com a escala semanal ligada, só
 *    para semanas já publicadas (montar a semana seguinte não gera aviso).
 *  - FERIAS_APROVADA / FERIAS_RECUSADA: ao aprovar/recusar a solicitação.
 *  - CODIGO_SENHA: código de redefinição de senha (prioridade máxima).
 * Quem não tem celular com WhatsApp entra na trilha como NAO_ENVIADO (o gestor vê quem falta). */
const { connectToDb, sql } = require('../../config/database');
const evo = require('./evolution');
const { renderizar, modeloDoEvento } = require('./mensagens');

const MODULOS = {
    IMPLANTACAO: { nome: 'Implantação', tabela: 'tab_escalas', produtos: 'tab_escala_produtos' },
    PROJETOS: { nome: 'Projetos', tabela: 'tab_proj_escalas', produtos: 'tab_proj_escala_produtos' }
};
const TIPOS = {
    TRABALHO: 'Trabalho', FOLGA: 'Folga', APOIO: 'Apoio ao Projeto', SEDE: 'Sede', SEDE_TREINAMENTO: 'Sede - Treinamento',
    FERIAS: 'Férias', FERIADO: 'Feriado', HOME_OFFICE: 'Home Office', ATESTADO: 'Atestado', FALTA: 'Falta'
};
const TURNOS = { DIURNO: 'Diurno', NOTURNO: 'Noturno' };
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

// ---------------------------------------------------------------- datas (hora local)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const deIso = (s) => { const [a, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(a, m - 1, d); };
const isoUTC = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v || '').slice(0, 10)); // colunas DATE vêm em UTC
const br = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
const brAno = (d) => `${br(d)}/${d.getFullYear()}`;
const somar = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const segundaDe = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dia = x.getDay(); return somar(x, dia === 0 ? -6 : 1 - dia); };
const fimDoDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);
const agoraHHMM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const hhmm = (t) => (t instanceof Date ? `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}` : String(t || '').slice(0, 5));

const acordarFila = () => require('./fila').acordar();

// ---------------------------------------------------------------- destinatário
async function destinatario(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query('SELECT id_usuario, nome_completo, celular, celular_whatsapp, ativo FROM tab_usuarios WHERE id_usuario = @id');
    const u = r.recordset[0];
    if (!u) return { numero: null, motivo: 'USUARIO_INEXISTENTE', nome: '', primeiroNome: '' };
    const nome = String(u.nome_completo || '').trim();
    const primeiro = nome.split(/\s+/)[0] || '';
    const primeiroNome = primeiro ? primeiro.charAt(0) + primeiro.slice(1).toLowerCase() : '';
    const base = { nome, primeiroNome };
    if (!u.ativo) return { ...base, numero: null, motivo: 'USUARIO_INATIVO' };
    const numero = evo.formatarNumeroBR(u.celular);
    return numero ? { ...base, numero } : { ...base, numero: null, motivo: 'CELULAR_INVALIDO' };
}

async function nomeDoUsuario(pool, idUsuario) {
    if (!idUsuario) return 'Sistema';
    const r = await pool.request().input('id', sql.Int, idUsuario).query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return (r.recordset[0] && r.recordset[0].nome_completo) || 'Sistema';
}

/** Grava na fila (PENDENTE) ou na trilha (NAO_ENVIADO quando falta WhatsApp). */
async function enfileirar(pool, config, { idUsuario, evento, modulo = null, referencia = null, vars = {}, prioridade = 5, expiraEm = null, usuarioOrigem = null }) {
    const dest = await destinatario(pool, idUsuario);
    const mensagem = renderizar(modeloDoEvento(config, evento), { ...vars, nome: dest.nome, primeiroNome: dest.primeiroNome });
    const pode = dest.numero && !dest.bloqueado;
    await pool.request()
        .input('u', sql.Int, idUsuario)
        .input('n', sql.VarChar(20), dest.numero || null)
        .input('t', sql.VarChar(30), evento)
        .input('m', sql.VarChar(20), modulo)
        .input('ref', sql.VarChar(500), referencia ? String(referencia).slice(0, 500) : null)
        .input('msg', sql.NVarChar(sql.MAX), mensagem)
        .input('st', sql.VarChar(20), pode ? 'PENDENTE' : 'NAO_ENVIADO')
        .input('p', sql.TinyInt, prioridade)
        .input('exp', sql.DateTime, expiraEm)
        .input('mot', sql.VarChar(60), pode ? null : dest.motivo)
        .input('org', sql.VarChar(150), usuarioOrigem ? String(usuarioOrigem).slice(0, 150) : null)
        .query(`INSERT INTO tab_whatsapp_envios (id_usuario, numero, tipo_evento, modulo, referencia, mensagem, status, prioridade, expira_em, motivo, usuario_origem, data_envio)
                VALUES (@u, @n, @t, @m, @ref, @msg, @st, @p, @exp, @mot, @org, CASE WHEN @st = 'NAO_ENVIADO' THEN GETDATE() ELSE NULL END)`);
    if (pode) acordarFila();
    return { enviado: !!pode, motivo: pode ? null : dest.motivo, numero: dest.numero };
}

// ---------------------------------------------------------------- escala
async function escalaDoUsuario(pool, modulo, idUsuario, ini, fim) {
    const M = MODULOS[modulo];
    const r = await pool.request().input('u', sql.Int, idUsuario).input('i', sql.Date, ini).input('f', sql.Date, fim).query(`
        SELECT e.data_escala, e.tipo, e.turno, e.redmine, p.nome_projeto, un.nome_unidade,
               (SELECT STRING_AGG(tp.nome_produto, ', ') FROM ${M.produtos} ep JOIN tab_produtos tp ON tp.id_produto = ep.id_produto WHERE ep.id_escala = e.id_escala) AS produtos
        FROM ${M.tabela} e
        LEFT JOIN tab_projetos p ON p.id_projeto = e.id_projeto
        LEFT JOIN tab_unidades un ON un.id_unidade = e.id_unidade
        WHERE e.id_usuario = @u AND e.data_escala BETWEEN @i AND @f
        ORDER BY e.data_escala`);
    const mapa = new Map();
    r.recordset.forEach(x => mapa.set(isoUTC(x.data_escala), x));
    return mapa;
}

function linhaDia(dataIso, item, semItem = '_a definir_') {
    const d = deIso(dataIso);
    const cab = `• *${DIAS[d.getDay()]} ${br(d)}* - `;
    if (!item) return cab + semItem;
    let t = TIPOS[item.tipo] || String(item.tipo || '').replace(/_/g, ' ');
    if (item.tipo === 'TRABALHO' && TURNOS[item.turno]) t += ` (${TURNOS[item.turno]})`;
    const local = [item.nome_unidade, item.nome_projeto].filter(Boolean);
    if (['TRABALHO', 'APOIO'].includes(item.tipo) && local.length) t += `\n   ${local.join(' · ')}`;
    if (item.produtos) t += `\n   ${item.produtos}`;
    if (item.tipo === 'TRABALHO' && item.redmine) t += `\n   Redmine: ${item.redmine}`;
    return cab + t;
}

/** Enfileira a escala da semana (segunda informada) de todos com escala no período. */
async function enfileirarEscalaSemanal(pool, config, segundaIso, { usuarioOrigem = 'Agendamento automático', modulos = Object.keys(MODULOS), forcar = false } = {}) {
    const ini = deIso(segundaIso);
    const fim = somar(ini, 6);
    const dias = [...Array(7)].map((_, i) => iso(somar(ini, i)));
    const resumo = { enfileiradas: 0, naoEnviadas: 0, ignoradas: 0 };
    for (const modulo of modulos) {
        const M = MODULOS[modulo];
        if (!M) continue;
        const us = await pool.request().input('i', sql.Date, iso(ini)).input('f', sql.Date, iso(fim))
            .query(`SELECT DISTINCT e.id_usuario FROM ${M.tabela} e JOIN tab_usuarios u ON u.id_usuario = e.id_usuario AND u.ativo = 1
                    WHERE e.data_escala BETWEEN @i AND @f`);
        for (const { id_usuario } of us.recordset) {
            if (!forcar) {
                const ja = await pool.request().input('u', sql.Int, id_usuario).input('m', sql.VarChar(20), modulo).input('r', sql.VarChar(500), segundaIso)
                    .query(`SELECT 1 AS x FROM tab_whatsapp_envios WHERE id_usuario = @u AND tipo_evento = 'ESCALA_SEMANAL' AND modulo = @m
                            AND referencia = @r AND status IN ('PENDENTE','ENVIANDO','ENVIADO')`);
                if (ja.recordset.length) { resumo.ignoradas++; continue; }
            }
            const mapa = await escalaDoUsuario(pool, modulo, id_usuario, iso(ini), iso(fim));
            const r = await enfileirar(pool, config, {
                idUsuario: id_usuario, evento: 'ESCALA_SEMANAL', modulo, referencia: segundaIso,
                vars: { modulo: M.nome, periodo: `${br(ini)} a ${brAno(fim)}`, escala: dias.map(d => linhaDia(d, mapa.get(d))).join('\n') },
                expiraEm: fimDoDia(fim), usuarioOrigem
            });
            r.enviado ? resumo.enfileiradas++ : resumo.naoEnviadas++;
        }
    }
    return resumo;
}

/** Chamado a cada ciclo da fila: dispara a escala semanal no dia/hora configurados (uma vez por semana). */
async function verificarEscalaSemanal(pool, c) {
    if (!c || !c.ativo || !c.escala_semanal_ativa) return;
    const agora = new Date();
    if (agora.getDay() !== Number(c.escala_semanal_dia)) return;
    if (agoraHHMM() < hhmm(c.escala_semanal_hora)) return;
    const alvo = iso(c.escala_semanal_referencia === 'ATUAL' ? segundaDe(agora) : somar(segundaDe(agora), 7));
    // Reserva atômica: duas instâncias da API não disparam a mesma semana
    const r = await pool.request().input('a', sql.Date, alvo)
        .query('UPDATE tab_whatsapp_config SET escala_semanal_ultima = @a WHERE id = 1 AND (escala_semanal_ultima IS NULL OR escala_semanal_ultima < @a)');
    if (!r.rowsAffected[0]) return;
    const res = await enfileirarEscalaSemanal(pool, c, alvo);
    console.log(`[WhatsApp] Escala da semana ${alvo}: ${res.enfileiradas} na fila, ${res.naoEnviadas} sem WhatsApp.`);
}

/** Fim da última semana já publicada (só ela gera aviso de alteração). null = sem restrição. */
function fimPublicado(c) {
    if (!c.escala_semanal_ativa) return null;
    let fim = somar(segundaDe(new Date()), 6);
    if (c.escala_semanal_ultima) {
        const f = somar(deIso(isoUTC(c.escala_semanal_ultima)), 6);
        if (f > fim) fim = f;
    }
    return iso(fim);
}

/** Registra mudanças de escala: itens [{ id_usuario, data_escala }]. Nunca lança. */
async function escalaAlterada(itens, modulo, idUsuarioOrigem) {
    try {
        const pool = await connectToDb();
        const c = await evo.lerConfig(pool);
        if (!c || !c.ativo || !c.escala_alteracao_ativa || !MODULOS[modulo]) return;
        const hoje = iso(new Date());
        const limite = fimPublicado(c);
        const porUsuario = new Map();
        for (const it of itens || []) {
            const u = parseInt(it.id_usuario);
            const d = String(it.data_escala || '').slice(0, 10);
            if (!u || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < hoje || (limite && d > limite)) continue;
            if (!porUsuario.has(u)) porUsuario.set(u, new Set());
            porUsuario.get(u).add(d);
        }
        if (!porUsuario.size) return;
        const origem = await nomeDoUsuario(pool, idUsuarioOrigem);
        const espera = Math.max(1, Number(c.escala_alteracao_espera) || 10);
        for (const [idUsuario, datas] of porUsuario) {
            // o próprio colaborador alterando a própria escala não precisa ser avisado
            if (idUsuario === parseInt(idUsuarioOrigem)) continue;
            const atual = await pool.request().input('u', sql.Int, idUsuario).input('m', sql.VarChar(20), modulo)
                .query("SELECT TOP 1 id_envio, referencia FROM tab_whatsapp_envios WHERE status = 'AGUARDANDO' AND tipo_evento = 'ESCALA_ALTERACAO' AND id_usuario = @u AND modulo = @m ORDER BY id_envio DESC");
            const todas = new Set(datas);
            if (atual.recordset[0]) String(atual.recordset[0].referencia || '').split(',').filter(Boolean).forEach(d => todas.add(d));
            const lista = [...todas].sort().slice(-40);
            const req = pool.request().input('ref', sql.VarChar(500), lista.join(','))
                .input('esp', sql.Int, espera).input('exp', sql.DateTime, fimDoDia(deIso(lista[lista.length - 1])))
                .input('org', sql.VarChar(150), String(origem).slice(0, 150));
            if (atual.recordset[0]) {
                await req.input('id', sql.Int, atual.recordset[0].id_envio).query(`UPDATE tab_whatsapp_envios
                    SET referencia = @ref, liberar_em = DATEADD(MINUTE, @esp, GETDATE()), expira_em = @exp, usuario_origem = @org WHERE id_envio = @id AND status = 'AGUARDANDO'`);
            } else {
                await req.input('u', sql.Int, idUsuario).input('m', sql.VarChar(20), modulo).query(`INSERT INTO tab_whatsapp_envios
                    (id_usuario, tipo_evento, modulo, referencia, status, liberar_em, expira_em, usuario_origem)
                    VALUES (@u, 'ESCALA_ALTERACAO', @m, @ref, 'AGUARDANDO', DATEADD(MINUTE, @esp, GETDATE()), @exp, @org)`);
            }
        }
    } catch (e) {
        console.warn('[WhatsApp] Falha ao registrar alteração de escala:', e.message);
    }
}

/** Ciclo da fila: alterações agrupadas cujo tempo de espera acabou viram mensagem (com a escala ATUAL). */
async function promoverAgrupadas(pool, c) {
    const r = await pool.request().query("SELECT id_envio, id_usuario, modulo, referencia, usuario_origem FROM tab_whatsapp_envios WHERE status = 'AGUARDANDO' AND liberar_em <= GETDATE()");
    if (!r.recordset.length) return;
    const hoje = iso(new Date());
    for (const a of r.recordset) {
        const cancelar = (motivo) => pool.request().input('id', sql.Int, a.id_envio).input('mot', sql.VarChar(60), motivo)
            .query("UPDATE tab_whatsapp_envios SET status = 'CANCELADO', motivo = @mot, data_envio = GETDATE() WHERE id_envio = @id");
        if (!c || !c.ativo || !c.escala_alteracao_ativa || !MODULOS[a.modulo]) { await cancelar('EVENTO_DESLIGADO'); continue; }
        const datas = String(a.referencia || '').split(',').filter(d => d >= hoje).sort();
        if (!datas.length) { await cancelar('DATAS_PASSADAS'); continue; }
        const mapa = await escalaDoUsuario(pool, a.modulo, a.id_usuario, datas[0], datas[datas.length - 1]);
        const dest = await destinatario(pool, a.id_usuario);
        const mensagem = renderizar(modeloDoEvento(c, 'ESCALA_ALTERACAO'), {
            nome: dest.nome, primeiroNome: dest.primeiroNome, modulo: MODULOS[a.modulo].nome, responsavel: a.usuario_origem,
            alteracoes: datas.map(d => linhaDia(d, mapa.get(d), '_sem escala (dia removido)_')).join('\n')
        });
        const pode = dest.numero && !dest.bloqueado;
        await pool.request().input('id', sql.Int, a.id_envio).input('n', sql.VarChar(20), dest.numero || null)
            .input('msg', sql.NVarChar(sql.MAX), mensagem).input('st', sql.VarChar(20), pode ? 'PENDENTE' : 'NAO_ENVIADO')
            .input('mot', sql.VarChar(60), pode ? null : dest.motivo)
            .query(`UPDATE tab_whatsapp_envios SET numero = @n, mensagem = @msg, status = @st, motivo = @mot,
                    data_envio = CASE WHEN @st = 'NAO_ENVIADO' THEN GETDATE() ELSE NULL END WHERE id_envio = @id AND status = 'AGUARDANDO'`);
    }
    acordarFila();
}

// ---------------------------------------------------------------- férias
/** Avisa o solicitante da aprovação/recusa. Nunca lança. */
async function feriasStatus(idFerias, status, idUsuarioOrigem) {
    try {
        const evento = status === 'APROVADO' ? 'FERIAS_APROVADA' : status === 'RECUSADO' ? 'FERIAS_RECUSADA' : null;
        if (!evento) return;
        const pool = await connectToDb();
        const c = await evo.lerConfig(pool);
        if (!c || !c.ativo || !c.ferias_ativa) return;
        const r = await pool.request().input('id', sql.Int, idFerias)
            .query('SELECT id_ferias, id_usuario, data_inicio, data_fim, tipo_solicitacao, periodo_aquisitivo FROM tab_ferias WHERE id_ferias = @id');
        const f = r.recordset[0];
        if (!f) return;
        const ini = deIso(isoUTC(f.data_inicio)), fim = deIso(isoUTC(f.data_fim));
        const referencia = `${f.id_ferias}:${status}:${iso(ini)}:${iso(fim)}`;
        const ja = await pool.request().input('r', sql.VarChar(500), referencia)
            .query("SELECT 1 AS x FROM tab_whatsapp_envios WHERE tipo_evento LIKE 'FERIAS_%' AND referencia = @r AND status IN ('PENDENTE','ENVIANDO','ENVIADO')");
        if (ja.recordset.length) return; // mesma decisão, mesmas datas: não repete
        const dias = Math.round((fim - ini) / 86400000) + 1;
        await enfileirar(pool, c, {
            idUsuario: f.id_usuario, evento, referencia,
            vars: {
                inicio: brAno(ini), fim: brAno(fim), retorno: brAno(somar(fim, 1)), dias: String(dias),
                tipo: f.tipo_solicitacao, periodoAquisitivo: f.periodo_aquisitivo, responsavel: await nomeDoUsuario(pool, idUsuarioOrigem)
            },
            expiraEm: somar(new Date(), 7), usuarioOrigem: await nomeDoUsuario(pool, idUsuarioOrigem)
        });
    } catch (e) {
        console.warn('[WhatsApp] Falha ao enfileirar aviso de férias:', e.message);
    }
}

// ---------------------------------------------------------------- senha / teste
/** WhatsApp disponível para o código de senha deste usuário? Retorna o número ou null. */
async function whatsappParaCodigo(pool, idUsuario) {
    const c = await evo.lerConfig(pool);
    if (!c || !c.ativo || !c.codigo_senha_ativa || !evo.conexao(c)) return null;
    const dest = await destinatario(pool, idUsuario);
    return dest.numero && !dest.bloqueado ? dest.numero : null;
}

async function codigoSenha(pool, idUsuario, codigo, validadeMin) {
    const c = await evo.lerConfig(pool);
    if (!c || !c.ativo || !c.codigo_senha_ativa) throw Object.assign(new Error('Envio de código por WhatsApp indisponível.'), { status: 400 });
    // Códigos anteriores ainda na fila não saem mais
    await pool.request().input('u', sql.Int, idUsuario)
        .query("UPDATE tab_whatsapp_envios SET status = 'CANCELADO', motivo = 'NOVO_CODIGO', data_envio = GETDATE() WHERE id_usuario = @u AND tipo_evento = 'CODIGO_SENHA' AND status = 'PENDENTE'");
    return enfileirar(pool, c, {
        idUsuario, evento: 'CODIGO_SENHA', prioridade: 1, vars: { codigo, validade: String(validadeMin) },
        expiraEm: new Date(Date.now() + validadeMin * 60000), usuarioOrigem: 'Redefinição de senha'
    });
}

async function teste(pool, idUsuario) {
    const c = await evo.lerConfig(pool);
    const quem = await nomeDoUsuario(pool, idUsuario);
    return enfileirar(pool, c, { idUsuario, evento: 'TESTE', prioridade: 1, vars: { responsavel: quem }, expiraEm: new Date(Date.now() + 30 * 60000), usuarioOrigem: quem });
}

module.exports = {
    MODULOS, enfileirarEscalaSemanal, verificarEscalaSemanal, escalaAlterada, promoverAgrupadas,
    feriasStatus, whatsappParaCodigo, codigoSenha, teste, segundaDe, iso
};
