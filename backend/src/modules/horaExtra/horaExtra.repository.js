/* SQL da hora extra. Implantação e Projetos têm a mesma estrutura em tabelas separadas. */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');

async function gravarCabecalho(transacao, tabelas, lancamento) {
    const { id_lancamento, id_usuario, id_projeto, id_unidade, mes_referencia, totais } = lancamento;
    const pedido = new sql.Request(transacao)
        .input('id_p', sql.Int, id_projeto).input('id_uni', sql.Int, id_unidade).input('mes', sql.VarChar, mes_referencia)
        .input('he50', sql.Int, totais.he50).input('he100', sql.Int, totais.he100).input('ad_not', sql.Int, totais.adNoturno);
    if (id_lancamento) {
        await pedido.input('id', sql.Int, id_lancamento)
            .query(`UPDATE ${tabelas.cabecalho} SET id_projeto=@id_p, id_unidade=@id_uni, mes_referencia=@mes, total_he_50=@he50, total_he_100=@he100, total_ad_noturno=@ad_not WHERE id_lancamento=@id`);
        await new sql.Request(transacao).input('id', sql.Int, id_lancamento).query(`DELETE FROM ${tabelas.detalhes} WHERE id_lancamento=@id`);
        return id_lancamento;
    }
    const inserido = await pedido.input('id_u', sql.Int, id_usuario)
        .query(`INSERT INTO ${tabelas.cabecalho} (id_usuario, id_projeto, id_unidade, mes_referencia, total_he_50, total_he_100, total_ad_noturno, status, data_lancamento) OUTPUT INSERTED.id_lancamento VALUES (@id_u, @id_p, @id_uni, @mes, @he50, @he100, @ad_not, 'PENDENTE', GETDATE())`);
    return inserido.recordset[0].id_lancamento;
}

function gravarDia(transacao, tabelas, idLancamento, idProjetoCabecalho, dia) {
    return new sql.Request(transacao)
        .input('id_l', sql.Int, idLancamento).input('dia_n', sql.Int, dia.dia).input('dt_comp', sql.Date, dia.dataObj)
        .input('ent', sql.VarChar, dia.entrada).input('sai', sql.VarChar, dia.saida).input('intv', sql.VarChar, dia.intervalo)
        .input('fer', sql.Bit, dia.isFeriado ? 1 : 0).input('fds', sql.Bit, dia.isFDS ? 1 : 0).input('folga', sql.Bit, dia.isFolga ? 1 : 0)
        .input('he50', sql.Int, dia.he50).input('he100', sql.Int, dia.he100).input('adn', sql.Int, dia.adNoturno)
        .input('id_uni_dia', sql.Int, dia.id_unidade || null)
        .input('id_proj_dia', sql.Int, dia.id_projeto || idProjetoCabecalho || null)
        .query(`INSERT INTO ${tabelas.detalhes} (id_lancamento, dia_numero, data_completa, entrada, saida, intervalo, is_feriado, is_fds, is_folga, minutos_he_50, minutos_he_100, minutos_ad_noturno, id_unidade, id_projeto) VALUES (@id_l, @dia_n, @dt_comp, @ent, @sai, @intv, @fer, @fds, @folga, @he50, @he100, @adn, @id_uni_dia, @id_proj_dia)`);
}

async function emTransacao(pool, trabalho) {
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        const resultado = await trabalho(transacao);
        await transacao.commit();
        return resultado;
    } catch (falha) {
        await transacao.rollback().catch(() => undefined);
        throw falha;
    }
}

async function salvar(tabelas, lancamento) {
    const pool = await connectToDb();
    return emTransacao(pool, async (transacao) => {
        const id = await gravarCabecalho(transacao, tabelas, lancamento);
        for (const dia of lancamento.detalhes_dias) {
            await gravarDia(transacao, tabelas, id, lancamento.id_projeto, dia);
        }
        return id;
    });
}

/** idUsuario limita aos lançamentos da pessoa; escopo isola por lotação no módulo Projetos. */
async function listar(tabelas, { mes, idProjeto, idUsuario, escopo }) {
    const pool = await connectToDb();
    const pedido = pool.request();
    let consulta = `SELECT h.id_lancamento, h.mes_referencia, h.data_lancamento, h.status, h.id_usuario, h.id_projeto, h.id_unidade,
        u.nome_completo as colaborador, ISNULL(p.nome_projeto, 'N/A') as nome_projeto, ISNULL(un.nome_unidade, 'N/A') as nome_unidade,
        (SELECT COUNT(DISTINCT d.id_unidade) FROM ${tabelas.detalhes} d WHERE d.id_lancamento = h.id_lancamento AND d.id_unidade IS NOT NULL) as qtd_unidades,
        (SELECT COUNT(DISTINCT d.id_projeto) FROM ${tabelas.detalhes} d WHERE d.id_lancamento = h.id_lancamento AND d.id_projeto IS NOT NULL) as qtd_projetos
        FROM ${tabelas.cabecalho} h LEFT JOIN tab_usuarios u ON h.id_usuario = u.id_usuario
        LEFT JOIN tab_projetos p ON h.id_projeto = p.id_projeto LEFT JOIN tab_unidades un ON h.id_unidade = un.id_unidade WHERE 1=1`;
    if (idUsuario) {
        consulta += ' AND h.id_usuario = @id_u';
        pedido.input('id_u', sql.Int, idUsuario);
    }
    if (mes) {
        consulta += ' AND h.mes_referencia = @mes';
        pedido.input('mes', sql.VarChar, mes);
    }
    if (idProjeto) {
        consulta += ' AND h.id_projeto = @id_p';
        pedido.input('id_p', sql.Int, idProjeto);
    }
    if (escopo) consulta += filtroPorProjeto(pedido, escopo, 'h.id_projeto');
    const resultado = await pedido.query(`${consulta} ORDER BY h.data_lancamento DESC`);
    return resultado.recordset;
}

async function buscarDetalhes(tabelas, id) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, id).query(`SELECT * FROM ${tabelas.detalhes} WHERE id_lancamento = @id ORDER BY dia_numero`);
    return resultado.recordset;
}

async function excluir(tabelas, id) {
    const pool = await connectToDb();
    await emTransacao(pool, async (transacao) => {
        await new sql.Request(transacao).input('id', sql.Int, id).query(`DELETE FROM ${tabelas.detalhes} WHERE id_lancamento=@id`);
        await new sql.Request(transacao).input('id', sql.Int, id).query(`DELETE FROM ${tabelas.cabecalho} WHERE id_lancamento=@id`);
    });
}

module.exports = { salvar, listar, buscarDetalhes, excluir };
