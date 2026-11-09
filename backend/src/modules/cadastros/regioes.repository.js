/* SQL das Macro e Micro Regiões e do vínculo em massa das unidades. */
const { connectToDb, sql } = require('../../config/database');
const { emTransacao } = require('./cadastros.repository');

const TAMANHO_NOME = 120;
const TAMANHO_SIGLA = 20;
const TAMANHO_COR = 9;

/** Macros e micros do projeto, nesta ordem. */
async function arvoreDoProjeto(idProjeto) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.Int, idProjeto).query(`
        SELECT m.id_macro, m.nome_macro, m.sigla, m.cor, m.ordem, m.ativo,
               (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_macro = m.id_macro) AS unidades
        FROM tab_macro_regioes m WHERE m.id_projeto = @p
        ORDER BY m.ordem, m.nome_macro;

        SELECT mi.id_micro, mi.id_macro, mi.nome_micro, mi.sigla, mi.cor, mi.ordem, mi.ativo,
               (SELECT COUNT(*) FROM tab_unidades u WHERE u.id_micro = mi.id_micro) AS unidades
        FROM tab_micro_regioes mi
        JOIN tab_macro_regioes m ON m.id_macro = mi.id_macro
        WHERE m.id_projeto = @p
        ORDER BY mi.ordem, mi.nome_micro;`);
    const [macros, micros] = resultado.recordsets;
    return { macros, micros };
}

async function unidadesDoProjeto(idProjeto) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.Int, idProjeto).query(`
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.ativo, u.id_macro, u.id_micro, c.nome_cidade, e.sigla AS uf,
               tu.sigla AS sigla_tipo, tu.nome_tipo
        FROM tab_unidades u
        LEFT JOIN tab_tipos_unidade tu ON tu.id_tipo_unidade = u.id_tipo_unidade
        LEFT JOIN tab_cidades c ON c.id_cidade = u.id_cidade
        LEFT JOIN tab_estados e ON e.id_estado = c.id_estado
        WHERE u.id_projeto = @p
        ORDER BY c.nome_cidade, u.nome_unidade`);
    return resultado.recordset;
}

/* ---------------------------------------------------------------- macro */
async function existeMacroComNome(idProjeto, nome, idMacro) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.Int, idProjeto).input('n', sql.VarChar(TAMANHO_NOME), nome)
        .input('id', sql.Int, idMacro || 0)
        .query('SELECT 1 FROM tab_macro_regioes WHERE id_projeto=@p AND nome_macro=@n AND id_macro<>@id');
    return resultado.recordset.length > 0;
}

async function gravarMacro({ emEdicao, idMacro, idProjeto, nome, sigla, cor, ordem, ativo }) {
    const pool = await connectToDb();
    const pedido = pool.request()
        .input('p', sql.Int, idProjeto)
        .input('n', sql.VarChar(TAMANHO_NOME), nome)
        .input('s', sql.VarChar(TAMANHO_SIGLA), sigla)
        .input('c', sql.VarChar(TAMANHO_COR), cor)
        .input('o', sql.Int, ordem)
        .input('a', sql.Bit, ativo);

    if (emEdicao) {
        await pedido.input('id', sql.Int, idMacro).query(`
            UPDATE tab_macro_regioes SET nome_macro=@n, sigla=@s, cor=@c, ordem=@o, ativo=@a
            WHERE id_macro=@id AND id_projeto=@p`);
    } else {
        await pedido.query(`
            INSERT INTO tab_macro_regioes (id_projeto, nome_macro, sigla, cor, ordem, ativo)
            VALUES (@p, @n, @s, @c, @o, @a)`);
    }
}

async function usoDaMacro(idMacro) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, idMacro).query(`
        SELECT (SELECT COUNT(*) FROM tab_unidades WHERE id_macro=@id) AS unidades,
               (SELECT COUNT(*) FROM tab_micro_regioes WHERE id_macro=@id) AS micros`);
    return resultado.recordset[0];
}

async function excluirMacro(idMacro) {
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, idMacro).query('DELETE FROM tab_macro_regioes WHERE id_macro=@id');
}

/* ---------------------------------------------------------------- micro */
async function existeMicroComNome(idMacro, nome, idMicro) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('m', sql.Int, idMacro).input('n', sql.VarChar(TAMANHO_NOME), nome)
        .input('id', sql.Int, idMicro || 0)
        .query('SELECT 1 FROM tab_micro_regioes WHERE id_macro=@m AND nome_micro=@n AND id_micro<>@id');
    return resultado.recordset.length > 0;
}

async function gravarMicro({ emEdicao, idMicro, idMacro, nome, sigla, cor, ordem, ativo }) {
    const pool = await connectToDb();
    const pedido = pool.request()
        .input('m', sql.Int, idMacro)
        .input('n', sql.VarChar(TAMANHO_NOME), nome)
        .input('s', sql.VarChar(TAMANHO_SIGLA), sigla)
        .input('c', sql.VarChar(TAMANHO_COR), cor)
        .input('o', sql.Int, ordem)
        .input('a', sql.Bit, ativo);

    if (emEdicao) {
        await pedido.input('id', sql.Int, idMicro).query(`
            UPDATE tab_micro_regioes SET id_macro=@m, nome_micro=@n, sigla=@s, cor=@c, ordem=@o, ativo=@a WHERE id_micro=@id;
            -- micro mudou de macro: unidades vinculadas acompanham
            UPDATE tab_unidades SET id_macro=@m WHERE id_micro=@id;`);
    } else {
        await pedido.query(`
            INSERT INTO tab_micro_regioes (id_macro, nome_micro, sigla, cor, ordem, ativo)
            VALUES (@m, @n, @s, @c, @o, @a)`);
    }
}

async function unidadesDaMicro(idMicro) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, idMicro).query('SELECT COUNT(*) AS unidades FROM tab_unidades WHERE id_micro=@id');
    return resultado.recordset[0].unidades;
}

async function excluirMicro(idMicro) {
    const pool = await connectToDb();
    await pool.request().input('id', sql.Int, idMicro).query('DELETE FROM tab_micro_regioes WHERE id_micro=@id');
}

/* ---------------------------------------------------------------- vínculo em massa */
/** Pares macro/micro válidos do projeto (a micro só vale com a macro correspondente). */
async function regioesValidas(idProjeto) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.Int, idProjeto).query(`
        SELECT m.id_macro, mi.id_micro FROM tab_macro_regioes m
        LEFT JOIN tab_micro_regioes mi ON mi.id_macro = m.id_macro
        WHERE m.id_projeto = @p`);
    return resultado.recordset;
}

/** Aplica os vínculos numa transação; devolve quantas unidades foram atualizadas. */
function vincularUnidades(idProjeto, vinculos) {
    return emTransacao(async (transacao) => {
        let atualizadas = 0;
        for (const { idUnidade, idMacro, idMicro } of vinculos) {
            const resultado = await new sql.Request(transacao)
                .input('u', sql.Int, idUnidade).input('p', sql.Int, idProjeto)
                .input('ma', sql.Int, idMacro).input('mi', sql.Int, idMicro)
                .query('UPDATE tab_unidades SET id_macro=@ma, id_micro=@mi WHERE id_unidade=@u AND id_projeto=@p; SELECT @@ROWCOUNT AS q;');
            atualizadas += resultado.recordset[0].q;
        }
        return atualizadas;
    });
}

module.exports = {
    arvoreDoProjeto, unidadesDoProjeto, existeMacroComNome, gravarMacro, usoDaMacro, excluirMacro,
    existeMicroComNome, gravarMicro, unidadesDaMicro, excluirMicro, regioesValidas, vincularUnidades
};
