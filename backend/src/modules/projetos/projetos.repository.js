/* SQL do submenu Operações > Projetos: lotações que o usuário pode operar. */
const { connectToDb, sql } = require('../../config/database');

/** Visão global (SEDE - GD): todas as lotações ativas. */
async function listarLotacoesAtivas() {
    const pool = await connectToDb();
    const resultado = await pool.request().query(`
        SELECT id_projeto, nome_projeto, visao_global
        FROM tab_projetos
        WHERE gera_lotacao = 1 AND ativo = 1
        ORDER BY nome_projeto
    `);
    return resultado.recordset;
}

/** Apenas as lotações informadas (as do escopo do usuário). */
async function listarLotacoes(idsProjeto) {
    const pool = await connectToDb();
    const pedido = pool.request();
    const marcas = idsProjeto.map((id, i) => {
        pedido.input(`l${i}`, sql.Int, id);
        return `@l${i}`;
    });
    const resultado = await pedido.query(`
        SELECT id_projeto, nome_projeto, visao_global
        FROM tab_projetos
        WHERE id_projeto IN (${marcas.join(',')})
        ORDER BY nome_projeto
    `);
    return resultado.recordset;
}

module.exports = { listarLotacoesAtivas, listarLotacoes };
