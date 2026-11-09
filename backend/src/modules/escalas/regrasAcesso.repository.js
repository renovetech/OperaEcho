/* SQL das regras de acesso por perfil (tab_regras_acesso). */
const { connectToDb, sql } = require('../../config/database');

async function listar(perfil) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('p', sql.VarChar, perfil)
        .query('SELECT * FROM tab_regras_acesso WHERE nome_perfil=@p');
    return resultado.recordset;
}

/** Troca todas as regras do perfil pelas informadas. */
async function substituir(perfil, regras) {
    const pool = await connectToDb();
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        await new sql.Request(transacao).input('p', sql.VarChar, perfil).query('DELETE FROM tab_regras_acesso WHERE nome_perfil=@p');
        for (const regra of regras) {
            await new sql.Request(transacao)
                .input('p', sql.VarChar, perfil).input('mod', sql.VarChar, regra.modulo)
                .input('a', sql.Bit, !!regra.pode_acessar).input('n', sql.Bit, !!regra.pode_novo).input('e', sql.Bit, !!regra.pode_editar)
                .query('INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES (@p, @mod, @a, @n, @e)');
        }
        await transacao.commit();
    } catch (falha) {
        await transacao.rollback().catch(() => undefined);
        throw falha;
    }
}

module.exports = { listar, substituir };
