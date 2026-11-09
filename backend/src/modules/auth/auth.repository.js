/* SQL do login e da recuperação de senha. */
const { sql } = require('../../config/database');

async function buscarAtivoPorLogin(pool, usuario) {
    const r = await pool.request()
        .input('u', sql.VarChar, usuario)
        .query("SELECT * FROM tab_usuarios WHERE usuario=@u AND ativo=1");
    return r.recordset[0];
}

/** Troca a senha legada (texto puro) pelo hash bcrypt, no login. */
async function gravarHashDoLogin(pool, idUsuario, hash) {
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .input('h', sql.VarChar, hash)
        .query("UPDATE tab_usuarios SET senha_hash = @h WHERE id_usuario = @id");
}

async function buscarParaRecuperacao(pool, matricula, usuario) {
    const r = await pool.request()
        .input('m', sql.VarChar, matricula)
        .input('u', sql.VarChar, usuario)
        .query("SELECT id_usuario, nome_completo, email, senha_hash FROM tab_usuarios WHERE matricula = @m AND usuario = @u AND ativo = 1");
    return r.recordset[0] || null;
}

async function existePedidoRecente(pool, idUsuario, segundos) {
    const r = await pool.request().input('u', sql.Int, idUsuario).input('s', sql.Int, segundos)
        .query('SELECT TOP 1 1 AS x FROM tab_codigos_senha WHERE id_usuario = @u AND data_criacao > DATEADD(SECOND, -@s, GETDATE())');
    return r.recordset.length > 0;
}

/** Só o código mais recente vale: encerra os que ainda estavam abertos. */
async function encerrarCodigosAbertos(pool, idUsuario) {
    await pool.request().input('u', sql.Int, idUsuario)
        .query('UPDATE tab_codigos_senha SET usado_em = GETDATE() WHERE id_usuario = @u AND usado_em IS NULL');
}

async function gravarCodigo(pool, { idUsuario, canal, hash, destino, validadeMin, ip }) {
    await pool.request()
        .input('u', sql.Int, idUsuario).input('c', sql.VarChar(10), canal)
        .input('h', sql.Char(64), hash)
        .input('d', sql.VarChar(150), destino)
        .input('min', sql.Int, validadeMin)
        .input('ip', sql.VarChar(50), ip)
        .query(`INSERT INTO tab_codigos_senha (id_usuario, canal, codigo_hash, destino, expira_em, ip)
                VALUES (@u, @c, @h, @d, DATEADD(MINUTE, @min, GETDATE()), @ip)`);
}

async function buscarCodigoAberto(pool, idUsuario) {
    const r = await pool.request().input('u', sql.Int, idUsuario).query(`
        SELECT TOP 1 id_codigo, codigo_hash, tentativas FROM tab_codigos_senha
        WHERE id_usuario = @u AND usado_em IS NULL AND expira_em > GETDATE() ORDER BY id_codigo DESC`);
    return r.recordset[0];
}

/** Grava a tentativa errada e, ao chegar no máximo, encerra o código. */
async function registrarTentativaErrada(pool, idCodigo, tentativas, maximo) {
    await pool.request().input('id', sql.Int, idCodigo).input('t', sql.Int, tentativas)
        .query(`UPDATE tab_codigos_senha SET tentativas = @t, usado_em = CASE WHEN @t >= ${maximo} THEN GETDATE() ELSE NULL END WHERE id_codigo = @id`);
}

async function encerrarCodigo(pool, idCodigo) {
    await pool.request().input('id', sql.Int, idCodigo).query('UPDATE tab_codigos_senha SET usado_em = GETDATE() WHERE id_codigo = @id');
}

async function buscarSenhaEAtivo(pool, idUsuario) {
    const r = await pool.request().input('id', sql.Int, idUsuario)
        .query("SELECT senha_hash, ativo FROM tab_usuarios WHERE id_usuario = @id");
    return r.recordset[0];
}

async function gravarNovaSenha(pool, idUsuario, hash) {
    await pool.request()
        .input('id', sql.Int, idUsuario)
        .input('s', sql.VarChar, hash)
        .query("UPDATE tab_usuarios SET senha_hash = @s WHERE id_usuario = @id");
}

module.exports = {
    buscarAtivoPorLogin, gravarHashDoLogin, buscarParaRecuperacao, existePedidoRecente, encerrarCodigosAbertos, gravarCodigo,
    buscarCodigoAberto, registrarTentativaErrada, encerrarCodigo, buscarSenhaEAtivo, gravarNovaSenha
};
