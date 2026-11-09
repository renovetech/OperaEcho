/* SQL do Registro de Atividades. Implantação e Projetos têm a mesma estrutura em tabelas separadas (ver atividades.modulos.js). */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');
const { parseIntSafe } = require('../../shared/validators');

const foiInformado = (valor) => valor && valor !== 'undefined' && valor !== '';

/* Cada filtro opcional da busca, na ordem em que entra na consulta. */
function filtrosDaBusca(tabelas) {
    return [
        { campo: 'termo', clausula: ' AND (u.nome_completo LIKE @termo OR un.nome_unidade LIKE @termo OR a.motivos LIKE @termo)', parametro: 'termo', tipo: sql.VarChar, valor: (v) => `%${v}%` },
        // Período por SOBREPOSIÇÃO: atividade de vários dias aparece em qualquer filtro que toque o intervalo (mesma regra dos relatórios).
        { campo: 'dataInicio', clausula: ' AND CAST(ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS DATE) >= @di', parametro: 'di', tipo: sql.Date, valor: (v) => v },
        { campo: 'dataFim', clausula: ' AND CAST(ISNULL(a.data_inicio, a.data_atividade) AS DATE) <= @df', parametro: 'df', tipo: sql.Date, valor: (v) => v },
        { campo: 'id_implantador', clausula: ` AND (a.id_implantador = @imp OR a.id_atividade IN (SELECT id_atividade FROM ${tabelas.implantadores} WHERE id_implantador = @imp))`, parametro: 'imp', tipo: sql.Int, valor: parseIntSafe },
        { campo: 'id_projeto', clausula: ' AND a.id_projeto = @proj', parametro: 'proj', tipo: sql.Int, valor: parseIntSafe },
        { campo: 'id_unidade', clausula: ' AND a.id_unidade = @uni', parametro: 'uni', tipo: sql.Int, valor: parseIntSafe },
        { campo: 'motivo', clausula: ' AND a.motivos LIKE @mot', parametro: 'mot', tipo: sql.VarChar, valor: (v) => `%${v}%` }
    ];
}

function montarCondicoes(pedido, tabelas, filtros) {
    // Reabrir um registro pelo endereço da tela; os filtros de escopo continuam valendo.
    const porId = filtros.id ? ' AND a.id_atividade = @idBusca' : '';
    if (filtros.id) pedido.input('idBusca', sql.Int, parseIntSafe(filtros.id));
    const informados = filtrosDaBusca(tabelas).filter(({ campo }) => foiInformado(filtros[campo]));
    informados.forEach(({ campo, parametro, tipo, valor }) => pedido.input(parametro, tipo, valor(filtros[campo])));
    return ` WHERE 1=1 ${porId}${informados.map(({ clausula }) => clausula).join('')}`;
}

const JUNCOES_DA_BUSCA = `
    LEFT JOIN tab_usuarios u ON a.id_implantador = u.id_usuario
    LEFT JOIN tab_projetos p ON a.id_projeto = p.id_projeto
    LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade`;

/** `lotacao`: { isolar, escopo } decide se a busca fica restrita à lotação. */
async function listar(tabelas, filtros, lotacao, { limite, offset }) {
    const pool = await connectToDb();
    const pedido = pool.request();
    const condicoes = montarCondicoes(pedido, tabelas, filtros);
    const where = lotacao.isolar ? `${condicoes}${filtroPorProjeto(pedido, lotacao.escopo, 'a.id_projeto')}` : condicoes;

    const contagem = await pedido.query(`
        SELECT COUNT(*) as total
        FROM ${tabelas.atividades} a ${JUNCOES_DA_BUSCA}
        ${where}`);
    const linhas = await pedido.query(`
        SELECT a.*, u.nome_completo as nome_implantador, p.nome_projeto, un.nome_unidade,
            (SELECT u2.id_usuario, u2.nome_completo FROM ${tabelas.implantadores} ai INNER JOIN tab_usuarios u2 ON ai.id_implantador = u2.id_usuario WHERE ai.id_atividade = a.id_atividade FOR JSON PATH) as lista_implantadores,
            (SELECT u3.id_usuario, u3.nome_completo FROM ${tabelas.equipe} ep INNER JOIN tab_usuarios u3 ON ep.id_usuario = u3.id_usuario WHERE ep.id_atividade = a.id_atividade FOR JSON PATH) as lista_equipe_projeto
        FROM ${tabelas.atividades} a ${JUNCOES_DA_BUSCA}
        ${where}
        ORDER BY a.data_atividade DESC, a.id_atividade DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limite} ROWS ONLY`);
    return { total: contagem.recordset[0].total, linhas: linhas.recordset };
}

async function buscarAnexos(tabelas, id) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, id)
        .query(`SELECT caminho_arquivo FROM ${tabelas.atividades} WHERE id_atividade = @id`);
    return resultado.recordset;
}

async function buscarProjeto(tabelas, id) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, id)
        .query(`SELECT id_projeto FROM ${tabelas.atividades} WHERE id_atividade = @id`);
    return resultado.recordset;
}

async function emTransacao(trabalho) {
    const pool = await connectToDb();
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        await trabalho(transacao);
        await transacao.commit();
    } catch (falha) {
        // O SQL Server pode já ter abortado a transação: a falha do rollback não pode esconder o erro original.
        await transacao.rollback().catch(() => undefined);
        throw falha;
    }
}

function pedidoDaAtividade(transacao, atividade) {
    return new sql.Request(transacao)
        .input('di', sql.Date, atividade.dataInicio)
        .input('df', sql.Date, atividade.dataFim)
        .input('r', sql.VarChar(500), atividade.redmine)
        .input('pf', sql.Int, atividade.profissionais)
        .input('tg', sql.VarChar(10), atividade.tempo)
        // id_implantador é campo legado: guarda o primeiro da lista. A fonte de verdade da equipe é a tabela de implantadores.
        .input('imp', sql.Int, atividade.implantadores[0])
        .input('m', sql.VarChar(200), atividade.motivos)
        .input('pj', sql.Int, atividade.idProjeto)
        .input('un', sql.Int, atividade.idUnidade)
        .input('pd', sql.VarChar(500), atividade.produtos)
        .input('cam_arq', sql.VarChar(sql.MAX), atividade.caminhos);
}

async function inserirCabecalho(transacao, tabelas, atividade) {
    const inserido = await pedidoDaAtividade(transacao, atividade).query(`
        INSERT INTO ${tabelas.atividades}
        (data_atividade, data_inicio, data_fim, redmine, profissionais_env, tempo_gasto, id_implantador, motivos, id_projeto, id_unidade, produtos_trabalhados, caminho_arquivo)
        OUTPUT INSERTED.id_atividade
        VALUES (@di, @di, @df, @r, @pf, @tg, @imp, @m, @pj, @un, @pd, @cam_arq)`);
    return inserido.recordset[0].id_atividade;
}

async function atualizarCabecalho(transacao, tabelas, atividade) {
    await pedidoDaAtividade(transacao, atividade).input('id', sql.Int, atividade.idAtividade).query(`
        UPDATE ${tabelas.atividades} SET
            data_atividade = @di, data_inicio = @di, data_fim = @df, redmine = @r,
            profissionais_env = @pf, tempo_gasto = @tg, id_implantador = @imp, motivos = @m,
            id_projeto = @pj, id_unidade = @un, produtos_trabalhados = @pd, caminho_arquivo = @cam_arq
        WHERE id_atividade = @id`);
    await new sql.Request(transacao).input('idA', sql.Int, atividade.idAtividade).query(`DELETE FROM ${tabelas.implantadores} WHERE id_atividade = @idA`);
    await new sql.Request(transacao).input('idA', sql.Int, atividade.idAtividade).query(`DELETE FROM ${tabelas.equipe} WHERE id_atividade = @idA`);
    return atividade.idAtividade;
}

async function gravar(tabelas, atividade) {
    await emTransacao(async (transacao) => {
        const id = atividade.idAtividade
            ? await atualizarCabecalho(transacao, tabelas, atividade)
            : await inserirCabecalho(transacao, tabelas, atividade);
        for (const idUsuario of atividade.implantadores) {
            await new sql.Request(transacao).input('idA', sql.Int, id).input('idU', sql.Int, idUsuario)
                .query(`INSERT INTO ${tabelas.implantadores} (id_atividade, id_implantador) VALUES (@idA, @idU)`);
        }
        for (const idUsuario of atividade.equipe) {
            await new sql.Request(transacao).input('idA', sql.Int, id).input('idU', sql.Int, idUsuario)
                .query(`INSERT INTO ${tabelas.equipe} (id_atividade, id_usuario) VALUES (@idA, @idU)`);
        }
    });
}

async function excluir(tabelas, id) {
    await emTransacao(async (transacao) => {
        await new sql.Request(transacao).input('id', sql.Int, id).query(`DELETE FROM ${tabelas.implantadores} WHERE id_atividade = @id`);
        await new sql.Request(transacao).input('id', sql.Int, id).query(`DELETE FROM ${tabelas.equipe} WHERE id_atividade = @id`);
        await new sql.Request(transacao).input('id', sql.Int, id).query(`DELETE FROM ${tabelas.atividades} WHERE id_atividade = @id`);
    });
}

module.exports = { listar, buscarAnexos, buscarProjeto, gravar, excluir };
