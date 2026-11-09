/* Férias: todo o SQL do módulo. Quem decide o que fazer com o resultado é ferias.service.js / ferias.routes.js. */
const { sql } = require('../../config/database');
const { lotacaoNoEscopo } = require('../../middlewares/lotacao');
const { filtroPorUsuarioLotacao } = require('../../middlewares/lotacao');

const SEM_RESULTADO = '1=0';

/* ---------------------------------------------------------------- colaboradores */
async function buscarUsuario(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query(`SELECT * FROM tab_usuarios WHERE id_usuario = @id`);
    return r.recordset;
}

async function listarUsuariosDaLotacao(pool, idLotacao) {
    const request = pool.request();
    const r = await request.input('lot', sql.Int, idLotacao).query(`
                SELECT * FROM tab_usuarios
                WHERE ativo = 1
                  AND ( id_lotacao = @lot
                        OR id_usuario IN (SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto = @lot) )
                ORDER BY nome_completo
            `);
    return r.recordset;
}

async function listarImplantadores(pool) {
    const request = pool.request();
    const r = await request.query(`
                SELECT u.* FROM tab_usuarios u
                LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
                WHERE u.ativo = 1
                  AND (UPPER(f.nome_funcao) LIKE '%IMPLANTADOR%' OR UPPER(u.funcao) LIKE '%IMPLANTADOR%')
                ORDER BY u.nome_completo
            `);
    return r.recordset;
}

/** O colaborador está em alguma das lotações (lotação-home ou lotações extras)? */
async function colaboradorNasLotacoes(pool, alvo, lotacoes) {
    const request = pool.request().input('alvo', sql.Int, alvo);
    const marks = lotacoes.map((id, i) => { request.input(`pv${i}`, sql.Int, id); return `@pv${i}`; });
    const r = await request.query(`
        SELECT 1 AS ok FROM tab_usuarios
        WHERE id_usuario = @alvo
          AND ( id_lotacao IN (${marks.join(',')})
                OR id_usuario IN (SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto IN (${marks.join(',')})) )`);
    return r.recordset.length > 0;
}

async function buscarDataAdmissao(pool, idUsuario) {
    const r = await pool.request()
        .input('u', sql.Int, idUsuario)
        .query("SELECT data_admissao FROM tab_usuarios WHERE id_usuario = @u");
    return r.recordset[0]?.data_admissao;
}

/* ---------------------------------------------------------------- histórico e conflitos */
async function listarHistorico(pool, idUsuario) {
    const r = await pool.request()
        .input('id', sql.Int, idUsuario)
        .query(`
            SELECT f.*, u.nome_completo, u.cpf, u.matricula, u.setor, u.funcao,
                   u.data_nascimento, u.data_admissao
            FROM tab_ferias f
            INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
            WHERE f.id_usuario = @id
            ORDER BY f.data_solicitacao DESC
        `);
    return r.recordset;
}

/** Lotação/função do dono da solicitação analisada. */
async function buscarDonoDosConflitos(pool, idFerias) {
    const dono = await pool.request().input('id', sql.Int, idFerias || 0).query(`
        SELECT u.id_lotacao, u.funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        WHERE f.id_ferias = @id
    `);
    return dono.recordset;
}

async function listarConflitos(pool, { idFerias, dataInicio, dataFim, dono }) {
    const request = pool.request()
        .input('id', sql.Int, idFerias || 0)
        .input('di', sql.Date, dataInicio)
        .input('df', sql.Date, dataFim);

    // Escopo do conflito: mesma lotação; ou, se SEDE - GD (sem lotação), só entre implantadores
    let escopoSql = ' AND 1=0 ';
    if (dono.length > 0) {
        const idLot = dono[0].id_lotacao;
        if (idLot) {
            escopoSql = ' AND u.id_lotacao = @lot ';
            request.input('lot', sql.Int, idLot);
        } else {
            escopoSql = " AND u.id_lotacao IS NULL AND UPPER(u.funcao) LIKE '%IMPLANTADOR%' ";
        }
    }

    const result = await request.query(`
        SELECT u.nome_completo, f.data_inicio, f.data_fim, f.status FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        WHERE f.id_ferias <> @id AND f.status IN ('APROVADO', 'PENDENTE')
        AND f.data_inicio <= @df AND f.data_fim >= @di
        ${escopoSql}
    `);
    return result.recordset;
}

/* ---------------------------------------------------------------- escrita */
async function inserirFerias(transacao, d) {
    await new sql.Request(transacao)
        .input('id_u', sql.Int, d.idUsuario).input('pa', sql.Int, d.periodoAquisitivo)
        .input('tipo', sql.VarChar, d.tipoSolicitacao).input('di', sql.Date, d.dataInicio)
        .input('df', sql.Date, d.dataFim).input('dr', sql.Int, d.diasRestantes)
        .query(`INSERT INTO tab_ferias (id_usuario, periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim, dias_restantes, status, data_solicitacao)
                    VALUES (@id_u, @pa, @tipo, @di, @df, @dr, 'PENDENTE', GETDATE())`);
}

async function buscarDonoParaEdicao(pool, idFerias) {
    const r = await pool.request().input('id', sql.Int, idFerias).query(`
        SELECT f.id_usuario, f.status, u.funcao AS funcao_txt, fn.nome_funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE f.id_ferias = @id`);
    return r.recordset;
}

/** Linha de férias lida dentro da transação. O id pode chegar como veio da URL. */
async function buscarFerias(transacao, idFerias) {
    const r = await new sql.Request(transacao).input('id', sql.Int, idFerias)
        .query("SELECT * FROM tab_ferias WHERE id_ferias = @id");
    return r.recordset[0];
}

async function atualizarFerias(transacao, idFerias, d) {
    await new sql.Request(transacao)
        .input('id', sql.Int, idFerias).input('pa', sql.Int, d.periodoAquisitivo)
        .input('tipo', sql.VarChar, d.tipoSolicitacao).input('di', sql.Date, d.dataInicio).input('df', sql.Date, d.dataFim)
        .query("UPDATE tab_ferias SET periodo_aquisitivo=@pa, tipo_solicitacao=@tipo, data_inicio=@di, data_fim=@df WHERE id_ferias=@id");
}

async function buscarAlvoDoStatus(pool, idFerias) {
    const rAlvo = await pool.request().input('id', sql.Int, idFerias).query(`
        SELECT u.funcao AS funcao_txt, fn.nome_funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE f.id_ferias = @id
    `);
    return rAlvo.recordset;
}

async function atualizarStatus(transacao, idFerias, status) {
    await new sql.Request(transacao).input('id', sql.Int, idFerias).input('st', sql.VarChar, status)
        .query("UPDATE tab_ferias SET status = @st WHERE id_ferias = @id");
}

/* ---------------------------------------------------------------- períodos e escala */
async function listarPeriodosAtivos(pool, idUsuario, periodoAquisitivo) {
    const res = await pool.request()
        .input('u', sql.Int, idUsuario).input('pa', sql.Int, periodoAquisitivo)
        .query(`
                SELECT id_ferias, tipo_solicitacao FROM tab_ferias
                WHERE id_usuario = @u AND periodo_aquisitivo = @pa AND status <> 'RECUSADO'
                AND (tipo_solicitacao LIKE '%1º Período%' OR tipo_solicitacao LIKE '%2º Período%')
                ORDER BY data_inicio ASC
            `);
    return res.recordset;
}

async function definirTipoDoPeriodo(pool, idFerias, tipo) {
    await pool.request().input('id', sql.Int, idFerias)
        .query(`UPDATE tab_ferias SET tipo_solicitacao = '${tipo}' WHERE id_ferias = @id`);
}

async function marcarFeriasNaEscala(transacao, idUsuario, dia) {
    await new sql.Request(transacao)
        .input('u', sql.Int, idUsuario).input('d', sql.Date, dia).input('tp', sql.VarChar, 'FERIAS')
        .query(`
                    DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u AND data_escala=@d);
                    DELETE FROM tab_escalas WHERE id_usuario=@u AND data_escala=@d;
                    INSERT INTO tab_escalas (id_usuario, data_escala, tipo) VALUES (@u, @d, @tp);
                `);
}

async function removerFeriasDaEscala(transacao, idUsuario, dataInicio, dataFim) {
    await new sql.Request(transacao)
        .input('u', sql.Int, idUsuario).input('di', sql.Date, dataInicio).input('df', sql.Date, dataFim)
        .query(`
                DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u AND data_escala BETWEEN @di AND @df AND tipo='FERIAS');
                DELETE FROM tab_escalas WHERE id_usuario=@u AND data_escala BETWEEN @di AND @df AND tipo='FERIAS';
            `);
}

/* ---------------------------------------------------------------- listagem gerencial / pessoal */
async function removerPendentesDeInativos(pool) {
    await pool.request().query(`
                DELETE FROM tab_ferias
                WHERE status = 'PENDENTE'
                  AND id_usuario IN (SELECT id_usuario FROM tab_usuarios WHERE ativo = 0)
            `);
}

const SELECT_LISTAGEM = `SELECT f.*, u.nome_completo, u.cpf, u.matricula, u.setor, u.funcao, u.data_nascimento, u.data_admissao,
        ISNULL(pl.nome_projeto, 'SEDE - GD') AS nome_lotacao
        FROM tab_ferias f INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_projetos pl ON u.id_lotacao = pl.id_projeto WHERE 1=1 `;

/** Filtro da visão gerencial pela lotação escolhida na tela de aprovação ou, sem escolha, pelo escopo do aprovador. */
function filtrarVisaoGerencial(request, { lotacao, escopo }) {
    let filtro = " AND u.ativo = 1";
    if (lotacao === 'SEDE') {
        // SEDE - GD -> implantadores (somente visão global/coordenação alcança)
        filtro += " AND (UPPER(u.funcao) LIKE '%IMPLANTADOR%') ";
        if (!escopo.global) filtro += ` AND ${SEM_RESULTADO} `;
    } else if (lotacao && lotacao !== 'Todos' && lotacao !== '') {
        filtro += " AND u.id_lotacao = @lot ";
        request.input('lot', sql.Int, parseInt(lotacao));
        if (!escopo.global && !lotacaoNoEscopo(escopo, lotacao)) filtro += ` AND ${SEM_RESULTADO} `;
    } else if (!escopo.global) {
        // Sem filtro explícito: isola pela(s) lotação(ões) do escopo do aprovador
        if (!escopo.lotacoes || escopo.lotacoes.length === 0) {
            filtro += ` AND ${SEM_RESULTADO} `;
        } else {
            const marks = escopo.lotacoes.map((id, i) => {
                request.input(`esc${i}`, sql.Int, id);
                return `@esc${i}`;
            });
            filtro += ` AND u.id_lotacao IN (${marks.join(',')}) `;
        }
    }
    return filtro;
}

/** `pessoal`: férias de um único colaborador (idUsuario); senão visão gerencial. */
async function listarSolicitacoes(pool, { pessoal, idUsuario, lotacao, escopo }) {
    const request = pool.request();
    let query = SELECT_LISTAGEM;
    if (pessoal) {
        query += " AND f.id_usuario = @idUsuario";
        request.input('idUsuario', sql.Int, parseInt(idUsuario));
    } else {
        // Visão gerencial: oculta registros de colaboradores inativos
        query += filtrarVisaoGerencial(request, { lotacao, escopo });
    }
    query += " ORDER BY f.data_solicitacao DESC";
    const r = await request.query(query);
    return r.recordset;
}

/* ---------------------------------------------------------------- relatório de prazos */
async function listarImplantadoresAdmitidos(pool, escopo) {
    const pedido = pool.request();
    const lotacao = filtroPorUsuarioLotacao(pedido, escopo, 'u.id_usuario');
    const rUsers = await pedido.query(`
        SELECT u.id_usuario, u.nome_completo, u.matricula, u.cpf, u.setor, u.funcao, u.data_admissao
        FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE u.ativo = 1
          AND u.data_admissao IS NOT NULL
          AND (f.nome_funcao LIKE '%IMPLANTADOR%' OR u.funcao LIKE '%IMPLANTADOR%')
          ${lotacao}
        ORDER BY u.nome_completo
    `);
    return rUsers.recordset;
}

async function listarFeriasDosImplantadores(pool, escopo) {
    const pedido = pool.request();
    const lotacao = filtroPorUsuarioLotacao(pedido, escopo, 'u.id_usuario');
    const rFerias = await pedido.query(`
        SELECT f.id_usuario, f.periodo_aquisitivo, f.tipo_solicitacao, f.data_inicio, f.data_fim, f.status
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE u.ativo = 1
          AND f.status <> 'RECUSADO'
          AND (fn.nome_funcao LIKE '%IMPLANTADOR%' OR u.funcao LIKE '%IMPLANTADOR%')
          ${lotacao}
    `);
    return rFerias.recordset;
}

/** Solicitações que ainda contam para o saldo e para a sobreposição. */
async function listarFeriasAtivas(pool, idUsuario) {
    const resultado = await pool.request().input('id', sql.Int, idUsuario).query(`
        SELECT id_ferias, periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim
        FROM tab_ferias WHERE id_usuario = @id AND status <> 'RECUSADO'
    `);
    return resultado.recordset;
}

module.exports = {
    buscarUsuario, listarUsuariosDaLotacao, listarImplantadores, colaboradorNasLotacoes, buscarDataAdmissao,
    listarHistorico, buscarDonoDosConflitos, listarConflitos,
    inserirFerias, buscarDonoParaEdicao, buscarFerias, atualizarFerias, buscarAlvoDoStatus, atualizarStatus,
    listarPeriodosAtivos, definirTipoDoPeriodo, marcarFeriasNaEscala, removerFeriasDaEscala,
    removerPendentesDeInativos, listarSolicitacoes, listarImplantadoresAdmitidos, listarFeriasDosImplantadores, listarFeriasAtivas
};
