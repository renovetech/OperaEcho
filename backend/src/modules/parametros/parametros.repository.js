/* SQL dos parâmetros do sistema (tab_parametros). */
const { connectToDb, sql } = require('../../config/database');

const TAMANHO_CHAVE = 100;
const TAMANHO_VALOR = 500;
const TAMANHO_USUARIO = 150;

/** Pares chave/valor gravados. */
async function listarValores() {
    const pool = await connectToDb();
    const resultado = await pool.request().query('SELECT chave, valor FROM tab_parametros');
    return resultado.recordset;
}

/** Linhas com descrição e auditoria, para a tela do menu Parâmetros. */
async function listarDetalhes() {
    const pool = await connectToDb();
    const resultado = await pool.request().query(`
        SELECT chave, valor, modulo, descricao, usuario_alteracao,
               FORMAT(data_alteracao, 'dd/MM/yyyy HH:mm') AS data_alteracao
        FROM tab_parametros`);
    return resultado.recordset;
}

/** Grava todos os parâmetros numa transação: atualiza e, se a chave não existia, insere. */
async function gravar(parametros, usuario) {
    const pool = await connectToDb();
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        for (const { chave, valor } of parametros) {
            await new sql.Request(transacao)
                .input('c', sql.VarChar(TAMANHO_CHAVE), chave)
                .input('v', sql.VarChar(TAMANHO_VALOR), valor)
                .input('u', sql.VarChar(TAMANHO_USUARIO), usuario)
                .query(`
                    UPDATE tab_parametros SET valor = @v, data_alteracao = DATEADD(hour, -3, GETUTCDATE()), usuario_alteracao = @u WHERE chave = @c;
                    IF @@ROWCOUNT = 0
                        INSERT INTO tab_parametros (chave, valor, data_alteracao, usuario_alteracao)
                        VALUES (@c, @v, DATEADD(hour, -3, GETUTCDATE()), @u);`);
        }
        await transacao.commit();
    } catch (falha) {
        await transacao.rollback().catch(() => undefined);
        throw falha;
    }
}

module.exports = { listarValores, listarDetalhes, gravar, TAMANHO_VALOR, TAMANHO_USUARIO };
