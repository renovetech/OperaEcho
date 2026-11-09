/* SQL das unidades: busca paginada, gravação, vínculo com produtos e coordenadas. */
const { connectToDb, sql } = require('../../config/database');
const { filtroPorProjeto } = require('../../middlewares/lotacao');
const { parseIntSafe } = require('../../shared/validators');
const { emTransacao } = require('./cadastros.repository');

const FILTRO_AUSENTE = 'undefined';
const STATUS_TODOS = 'Todos';
const PRECISAO_COORDENADA = [9, 6];

const informado = (valor) => Boolean(valor) && valor !== FILTRO_AUSENTE;

/** Monta o WHERE da busca e registra os parâmetros no pedido. */
function filtrosDaBusca(pedido, { id, termo, projeto, status, uf, id_cidade: idCidade, escopo, isolarPorLotacao }) {
    let where = ' WHERE 1=1 ';

    // Abre uma unidade direto pela URL do cadastro; o isolamento abaixo continua valendo.
    if (id) {
        where += ' AND u.id_unidade = @id';
        pedido.input('id', sql.Int, parseInt(id));
    }
    if (informado(termo)) {
        where += ' AND (u.nome_unidade LIKE @termo OR u.cnes LIKE @termo)';
        pedido.input('termo', sql.VarChar, `%${termo}%`);
    }
    if (informado(projeto)) {
        where += ' AND u.id_projeto = @projeto';
        pedido.input('projeto', sql.Int, projeto);
    }
    if (status && status !== FILTRO_AUSENTE && status !== STATUS_TODOS) {
        where += ' AND u.ativo = @status';
        pedido.input('status', sql.Bit, status === 'true' ? 1 : 0);
    }
    if (informado(uf)) {
        where += ' AND e.sigla = @uf';
        pedido.input('uf', sql.VarChar, uf);
    }
    if (informado(idCidade)) {
        where += ' AND u.id_cidade = @id_cidade';
        pedido.input('id_cidade', sql.Int, idCidade);
    }
    if (isolarPorLotacao) where += filtroPorProjeto(pedido, escopo, 'u.id_projeto');
    return where;
}

/** Página de unidades e o total para a paginação. */
async function buscar(filtros, { offset, limite }) {
    const pool = await connectToDb();
    const pedido = pool.request();
    const where = filtrosDaBusca(pedido, filtros);

    pedido.input('offset', sql.Int, offset);
    pedido.input('limite', sql.Int, limite);

    const dados = await pedido.query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.ativo, u.id_cidade, u.id_projeto,
               u.latitude, u.longitude, u.id_macro, u.id_micro, u.id_tipo_unidade, tu.sigla AS sigla_tipo, tu.nome_tipo,
               c.nome_cidade, e.sigla as uf, p.nome_projeto
        FROM tab_unidades u
        LEFT JOIN tab_cidades c ON u.id_cidade = c.id_cidade
        LEFT JOIN tab_estados e ON c.id_estado = e.id_estado
        LEFT JOIN tab_projetos p ON u.id_projeto = p.id_projeto
        LEFT JOIN tab_tipos_unidade tu ON tu.id_tipo_unidade = u.id_tipo_unidade
        ${where}
        ORDER BY u.nome_unidade
        OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `);
    const total = await pedido.query(`
        SELECT COUNT(*) as total
        FROM tab_unidades u
        LEFT JOIN tab_cidades c ON u.id_cidade = c.id_cidade
        LEFT JOIN tab_estados e ON c.id_estado = e.id_estado
        LEFT JOIN tab_projetos p ON u.id_projeto = p.id_projeto
        ${where}
    `);
    return { dados: dados.recordset, total: total.recordset[0].total };
}

/** Macro e micro informadas que pertencem ao projeto: macro_ok (a macro) e macro_da_micro (a macro que a micro define). */
async function regiaoDoProjeto(idProjeto, idMacro, idMicro) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.Int, idProjeto).input('ma', sql.Int, idMacro).input('mi', sql.Int, idMicro).query(`
        SELECT (SELECT id_macro FROM tab_macro_regioes WHERE id_macro=@ma AND id_projeto=@p) AS macro_ok,
               (SELECT mi.id_macro FROM tab_micro_regioes mi JOIN tab_macro_regioes m ON m.id_macro=mi.id_macro
                 WHERE mi.id_micro=@mi AND m.id_projeto=@p) AS macro_da_micro`);
    return resultado.recordset[0];
}

/** Insere ou atualiza a unidade e refaz o vínculo com os produtos. */
function gravar(d, { latitude, longitude, idMacro, idMicro }) {
    return emTransacao(async (transacao) => {
        const pedido = new sql.Request(transacao);
        pedido.input('n', sql.VarChar, d.nome_unidade)
            .input('c', sql.VarChar, d.cnes)
            .input('a', sql.Bit, d.ativo ? 1 : 0)
            .input('idC', sql.Int, d.id_cidade)
            .input('idP', sql.Int, d.id_projeto)
            .input('lat', sql.Decimal(...PRECISAO_COORDENADA), latitude)
            .input('lng', sql.Decimal(...PRECISAO_COORDENADA), longitude)
            .input('ma', sql.Int, idMacro)
            .input('mi', sql.Int, idMicro)
            .input('tp', sql.Int, parseIntSafe(d.id_tipo_unidade));

        let idUnidade = d.id_unidade;
        if (idUnidade) {
            await pedido.input('idU', sql.Int, idUnidade)
                .query('UPDATE tab_unidades SET nome_unidade=@n, cnes=@c, ativo=@a, id_cidade=@idC, id_projeto=@idP, latitude=@lat, longitude=@lng, id_macro=@ma, id_micro=@mi, id_tipo_unidade=@tp WHERE id_unidade=@idU');
            await new sql.Request(transacao).input('idU', sql.Int, idUnidade)
                .query('DELETE FROM tab_unidade_produtos WHERE id_unidade=@idU');
        } else {
            const inserida = await pedido.query('INSERT INTO tab_unidades (nome_unidade, cnes, ativo, id_cidade, id_projeto, latitude, longitude, id_macro, id_micro, id_tipo_unidade) OUTPUT INSERTED.id_unidade VALUES (@n, @c, @a, @idC, @idP, @lat, @lng, @ma, @mi, @tp)');
            idUnidade = inserida.recordset[0].id_unidade;
        }

        if (d.produtos && d.produtos.length > 0) {
            for (const idProduto of d.produtos) {
                await new sql.Request(transacao).input('idU', sql.Int, idUnidade).input('idP', sql.Int, idProduto)
                    .query('INSERT INTO tab_unidade_produtos (id_unidade, id_produto) VALUES (@idU, @idP)');
            }
        }
    });
}

/** Atualiza as coordenadas das unidades do CNES (e do projeto, se informado); devolve quantas foram atualizadas. */
async function atualizarCoordenadas(transacao, { cnes, latitude, longitude, idProjeto }) {
    const resultado = await new sql.Request(transacao)
        .input('c', sql.VarChar, cnes).input('lat', sql.Decimal(...PRECISAO_COORDENADA), latitude).input('lng', sql.Decimal(...PRECISAO_COORDENADA), longitude)
        .input('p', sql.Int, idProjeto)
        .query(`UPDATE tab_unidades SET latitude=@lat, longitude=@lng
                WHERE (cnes=@c OR cnes=RIGHT('0000000' + @c, 7)) AND (@p IS NULL OR id_projeto=@p);
                SELECT @@ROWCOUNT AS qtd;`);
    return resultado.recordset[0].qtd;
}

async function produtosAtivosDaUnidade(idUnidade) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, idUnidade)
        .query('SELECT p.id_produto, p.nome_produto, p.ativo FROM tab_unidade_produtos up JOIN tab_produtos p ON up.id_produto = p.id_produto WHERE up.id_unidade = @id AND p.ativo = 1');
    return resultado.recordset;
}

module.exports = { buscar, regiaoDoProjeto, gravar, atualizarCoordenadas, produtosAtivosDaUnidade };
