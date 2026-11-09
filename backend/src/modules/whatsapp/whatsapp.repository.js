/* SQL das rotas do WhatsApp: gravação da configuração, trilha de envios e reenvio.
 * A leitura da configuração está em evolution.js (lerConfig) e a fila em fila.js. */
const { connectToDb, sql } = require('../../config/database');
const { encryptTagged } = require('../../shared/crypto');

const LIMITE_PADRAO_ENVIOS = 100;
const LIMITE_MAXIMO_ENVIOS = 500;

/** Nome completo de quem está logado (ou o login, ou 'Sistema'), para a trilha de alterações. */
async function nomeDoUsuario(pool, usuario) {
    const r = await pool.request().input('id', sql.Int, usuario.id_usuario).query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return String((r.recordset[0] && r.recordset[0].nome_completo) || usuario.usuario || 'Sistema').slice(0, 150);
}

function pedidoDaConfiguracao(pool, v, usuario) {
    return pool.request()
        .input('atv', sql.Bit, v.ativo ? 1 : 0)
        .input('url', sql.VarChar(300), v.url || null)
        .input('inst', sql.VarChar(100), v.instancia || null)
        .input('tok', sql.VarChar(sql.MAX), v.tokenAcesso ? encryptTagged(String(v.tokenAcesso).trim()) : null)
        .input('ini', sql.Date, v.inicioAquecimento)
        .input('lini', sql.Int, v.limiteInicial).input('cre', sql.Int, v.crescimentoSemanal)
        .input('lmax', sql.Int, v.limiteMaximo).input('pmin', sql.Int, v.maxPorMinuto)
        .input('p1', sql.Int, v.pausaMinima).input('p2', sql.Int, v.pausaMaxima)
        .input('h1', sql.VarChar(5), v.horaInicio).input('h2', sql.VarChar(5), v.horaFim)
        .input('esa', sql.Bit, v.escalaSemanalAtiva ? 1 : 0)
        .input('esd', sql.TinyInt, v.escalaSemanalDia)
        .input('esh', sql.VarChar(5), v.escalaSemanalHora)
        .input('esr', sql.VarChar(10), v.escalaSemanalReferencia)
        .input('eaa', sql.Bit, v.escalaAlteracaoAtiva ? 1 : 0)
        .input('eae', sql.Int, v.escalaAlteracaoEspera)
        .input('fa', sql.Bit, v.feriasAtiva ? 1 : 0)
        .input('csa', sql.Bit, v.codigoSenhaAtiva ? 1 : 0)
        .input('usr', sql.VarChar(150), usuario);
}

/** Grava a configuração (linha única, id = 1). `v` vem de validarConfiguracao; `usuario` é o nome de quem alterou. */
async function gravarConfiguracao(pool, v, usuario) {
    const r = pedidoDaConfiguracao(pool, v, usuario);
    const colunas = {};
    v.textos.forEach(({ coluna, valor }, i) => {
        r.input(`t${i}`, sql.NVarChar(2000), valor);
        colunas[coluna] = `@t${i}`;
    });

    await r.query(`
        IF NOT EXISTS (SELECT 1 FROM tab_whatsapp_config WHERE id = 1) INSERT INTO tab_whatsapp_config (id) VALUES (1);
        UPDATE tab_whatsapp_config SET
            ativo = @atv, url_api = @url, instancia = @inst, token_acesso = COALESCE(@tok, token_acesso),
            inicio_aquecimento = CASE WHEN @atv = 1 AND @ini IS NULL AND inicio_aquecimento IS NULL THEN CAST(SYSDATETIMEOFFSET() AT TIME ZONE 'E. South America Standard Time' AS DATE) ELSE COALESCE(@ini, inicio_aquecimento) END,
            limite_inicial = @lini, crescimento_semanal = @cre, limite_maximo = @lmax, max_por_minuto = @pmin,
            pausa_min_seg = @p1, pausa_max_seg = @p2,
            hora_envio_inicio = CAST(@h1 AS time(0)), hora_envio_fim = CAST(@h2 AS time(0)),
            escala_semanal_ativa = @esa, escala_semanal_dia = @esd, escala_semanal_hora = CAST(@esh AS time(0)), escala_semanal_referencia = @esr,
            escala_alteracao_ativa = @eaa, escala_alteracao_espera = @eae, ferias_ativa = @fa, codigo_senha_ativa = @csa,
            ${Object.entries(colunas).map(([c, p]) => `${c} = ${p}`).join(', ')},
            data_atualizacao = GETDATE(), usuario_alteracao = @usr
        WHERE id = 1;`);
}

/** Trilha de envios (mais recentes primeiro), com filtros opcionais por status, tipo e nome do colaborador. */
async function listarEnvios({ status, tipo, termo, limite }) {
    const pool = await connectToDb();
    const r = pool.request();
    let where = ' WHERE 1=1 ';
    if (status) { where += ' AND e.status = @st'; r.input('st', sql.VarChar(20), String(status).slice(0, 20)); }
    if (tipo) { where += ' AND e.tipo_evento = @tp'; r.input('tp', sql.VarChar(30), String(tipo).slice(0, 30)); }
    if (termo) { where += ' AND u.nome_completo LIKE @t'; r.input('t', sql.VarChar(110), `%${String(termo).slice(0, 100)}%`); }
    const topo = Math.min(LIMITE_MAXIMO_ENVIOS, Math.max(1, parseInt(limite) || LIMITE_PADRAO_ENVIOS));
    const q = await r.query(`
        SELECT TOP (${topo}) e.id_envio, e.id_usuario, u.nome_completo, e.numero, e.tipo_evento, e.modulo, e.status, e.motivo, e.erro,
               e.prioridade, e.usuario_origem,
               CASE WHEN e.tipo_evento = 'CODIGO_SENHA' THEN N'(código de senha oculto)' ELSE e.mensagem END AS mensagem,
               -- gravadas com GETDATE() (UTC): exibidas em Brasília
               FORMAT(e.data_criacao AT TIME ZONE 'UTC' AT TIME ZONE 'E. South America Standard Time', 'dd/MM/yyyy HH:mm') AS data_criacao,
               FORMAT(e.data_envio AT TIME ZONE 'UTC' AT TIME ZONE 'E. South America Standard Time', 'dd/MM/yyyy HH:mm') AS data_envio,
               FORMAT(e.liberar_em AT TIME ZONE 'UTC' AT TIME ZONE 'E. South America Standard Time', 'dd/MM/yyyy HH:mm') AS liberar_em
        FROM tab_whatsapp_envios e LEFT JOIN tab_usuarios u ON u.id_usuario = e.id_usuario
        ${where} ORDER BY e.id_envio DESC`);
    return q.recordset;
}

/** Devolve falha/cancelada (menos código de senha) para a fila. true se alguma mensagem voltou. */
async function reenviar(id) {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, id)
        .query(`UPDATE tab_whatsapp_envios SET status = 'PENDENTE', erro = NULL, motivo = NULL, data_envio = NULL,
                expira_em = CASE WHEN expira_em < GETDATE() THEN DATEADD(DAY, 1, GETDATE()) ELSE expira_em END
                WHERE id_envio = @id AND status IN ('FALHA', 'CANCELADO') AND tipo_evento <> 'CODIGO_SENHA' AND numero IS NOT NULL AND mensagem IS NOT NULL`);
    return !!r.rowsAffected[0];
}

module.exports = { nomeDoUsuario, gravarConfiguracao, listarEnvios, reenviar };
