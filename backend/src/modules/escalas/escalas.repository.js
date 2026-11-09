/* SQL das escalas. Implantação e Projetos têm a mesma estrutura em tabelas separadas (ver escalas.modulos.js). */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorUsuarioLotacao } = require('../../middlewares/lotacao');

/* Nomes dos parâmetros do DELETE do dia: a gravação avulsa e a em lote sempre usaram nomes próprios. */
const PARAMETROS_DO_DIA = Object.freeze({
    AVULSO: Object.freeze({ usuario: 'u', data: 'dt' }),
    LOTE: Object.freeze({ usuario: 'u_del', data: 'dt_del' })
});

/** `lotacao`: { isolar, escopo } decide se a leitura fica restrita aos colaboradores da lotação. */
async function listar(tabelas, { inicio, fim, idUsuario }, lotacao) {
    const pool = await connectToDb();
    const pedido = pool.request().input('i', sql.Date, inicio).input('f', sql.Date, fim);
    const filtroDeLotacao = lotacao.isolar ? filtroPorUsuarioLotacao(pedido, lotacao.escopo, 'e.id_usuario') : '';
    if (idUsuario) pedido.input('id_usr', sql.Int, idUsuario);
    const filtroDeColaborador = idUsuario ? ' AND e.id_usuario = @id_usr ' : '';
    const resultado = await pedido.query(`SELECT e.*, p.nome_projeto, u.nome_unidade,
        (SELECT STRING_AGG(tp.nome_produto, ', ') WITHIN GROUP (ORDER BY tp.nome_produto) FROM ${tabelas.produtos} tep JOIN tab_produtos tp ON tep.id_produto = tp.id_produto WHERE tep.id_escala = e.id_escala) as nomes_produtos,
        (SELECT STRING_AGG(CAST(tep.id_produto AS VARCHAR), ',') FROM ${tabelas.produtos} tep WHERE tep.id_escala = e.id_escala) as ids_produtos_str
        FROM ${tabelas.escalas} e LEFT JOIN tab_projetos p ON e.id_projeto=p.id_projeto LEFT JOIN tab_unidades u ON e.id_unidade=u.id_unidade WHERE e.data_escala BETWEEN @i AND @f ${filtroDeLotacao}${filtroDeColaborador}`);
    return resultado.recordset;
}

/** Quantos dos usuários não pertencem a nenhuma das lotações (home ou extra). */
async function contarForaDasLotacoes(idsUsuarios, lotacoes) {
    const pool = await connectToDb();
    const pedido = pool.request();
    const marcasUsuarios = idsUsuarios.map((id, i) => { pedido.input(`esc_u${i}`, sql.Int, id); return `@esc_u${i}`; });
    const marcasLotacoes = lotacoes.map((id, i) => { pedido.input(`esc_l${i}`, sql.Int, id); return `@esc_l${i}`; });
    const resultado = await pedido.query(`
        SELECT COUNT(*) AS fora
        FROM tab_usuarios
        WHERE id_usuario IN (${marcasUsuarios.join(',')})
          AND (id_lotacao IS NULL OR id_lotacao NOT IN (${marcasLotacoes.join(',')}))
          AND id_usuario NOT IN (
                SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto IN (${marcasLotacoes.join(',')})
          )`);
    return resultado.recordset[0].fora;
}

async function apagarDia(transacao, tabelas, registro, nomes) {
    const pedidoDoDia = () => new sql.Request(transacao).input(nomes.usuario, sql.Int, registro.idUsuario).input(nomes.data, sql.Date, registro.data);
    await pedidoDoDia().query(`DELETE FROM ${tabelas.produtos} WHERE id_escala IN (SELECT id_escala FROM ${tabelas.escalas} WHERE id_usuario=@${nomes.usuario} AND data_escala=@${nomes.data})`);
    await pedidoDoDia().query(`DELETE FROM ${tabelas.escalas} WHERE id_usuario=@${nomes.usuario} AND data_escala=@${nomes.data}`);
}

async function inserirDia(transacao, tabelas, registro) {
    const inserido = await new sql.Request(transacao)
        .input('u', sql.Int, registro.idUsuario).input('dt', sql.Date, registro.data)
        .input('t', sql.VarChar, registro.tipo).input('p', sql.Int, registro.idProjeto)
        .input('un', sql.Int, registro.idUnidade).input('turno', sql.VarChar, registro.turno).input('rm', sql.VarChar(30), registro.redmine)
        .query(`INSERT INTO ${tabelas.escalas} (id_usuario, data_escala, tipo, id_projeto, id_unidade, turno, redmine) OUTPUT INSERTED.id_escala VALUES (@u, @dt, @t, @p, @un, @turno, @rm)`);
    const idEscala = inserido.recordset[0].id_escala;
    for (const idProduto of registro.produtos) {
        await new sql.Request(transacao).input('ide', sql.Int, idEscala).input('idp', sql.Int, idProduto)
            .query(`INSERT INTO ${tabelas.produtos} (id_escala, id_produto) VALUES (@ide, @idp)`);
    }
}

/** Substitui o dia de cada registro; registro sem tipo só limpa o dia. */
async function regravarDias(tabelas, registros, nomes) {
    const pool = await connectToDb();
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        for (const registro of registros) {
            await apagarDia(transacao, tabelas, registro, nomes);
            if (registro.tipo) await inserirDia(transacao, tabelas, registro);
        }
        await transacao.commit();
    } catch (falha) {
        // Falha no rollback não pode esconder a falha original.
        try { await transacao.rollback(); } catch (_) { /* já finalizada */ }
        throw falha;
    }
}

module.exports = { PARAMETROS_DO_DIA, listar, contarForaDasLotacoes, regravarDias };
