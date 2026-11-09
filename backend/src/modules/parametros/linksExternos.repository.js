/* SQL dos Links Externos (tab_links_externos: id_link, id_produto, url), compartilhados entre todos os usuários. */
const { connectToDb, sql } = require('../../config/database');

const TAMANHO_URL = 1000;

/** Links com o nome do produto. */
async function listar() {
    const pool = await connectToDb();
    const resultado = await pool.request().query(`
        SELECT l.id_link, l.id_produto, p.nome_produto, l.url
        FROM tab_links_externos l
        INNER JOIN tab_produtos p ON l.id_produto = p.id_produto
        ORDER BY p.nome_produto, l.id_link
    `);
    return resultado.recordset;
}

/** Devolve o id do link criado. */
async function criar(idProduto, url) {
    const pool = await connectToDb();
    const resultado = await pool.request()
        .input('p', sql.Int, parseInt(idProduto))
        .input('u', sql.VarChar(TAMANHO_URL), url)
        .query('INSERT INTO tab_links_externos (id_produto, url) OUTPUT INSERTED.id_link VALUES (@p, @u)');
    return resultado.recordset[0].id_link;
}

async function atualizar(idLink, idProduto, url) {
    const pool = await connectToDb();
    await pool.request()
        .input('id', sql.Int, parseInt(idLink))
        .input('p', sql.Int, parseInt(idProduto))
        .input('u', sql.VarChar(TAMANHO_URL), url)
        .query('UPDATE tab_links_externos SET id_produto = @p, url = @u WHERE id_link = @id');
}

async function excluir(idLink) {
    const pool = await connectToDb();
    await pool.request()
        .input('id', sql.Int, parseInt(idLink))
        .query('DELETE FROM tab_links_externos WHERE id_link = @id');
}

module.exports = { listar, criar, atualizar, excluir, TAMANHO_URL };
