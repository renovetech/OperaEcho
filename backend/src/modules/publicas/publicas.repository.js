/* SQL das rotas públicas: rastreio GPS e consulta de CNES. */
const { connectToDb, sql } = require('../../config/database');

const TAMANHO_USUARIO = 150;

/** Nome completo do dono do token, ou nulo se não houver. */
async function nomeDoUsuario(idUsuario) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('id', sql.Int, idUsuario)
        .query('SELECT nome_completo FROM tab_usuarios WHERE id_usuario = @id');
    return resultado.recordset[0]?.nome_completo;
}

async function registrarRastreio({ autor, latitude, longitude, tipo, detalhes }) {
    const pool = await connectToDb();
    await pool.request()
        .input('user', sql.VarChar, autor)
        .input('lat', sql.Float, latitude)
        .input('lng', sql.Float, longitude)
        .input('tipo', sql.VarChar, tipo)
        .input('detalhes', sql.VarChar, detalhes)
        .query(`
            INSERT INTO tab_rastreamento_app (usuario, latitude, longitude, tipo_registro, data_hora, detalhes_registro)
            VALUES (@user, @lat, @lng, @tipo, DATEADD(hour, -3, GETUTCDATE()), @detalhes)
        `);
}

/** Unidade ativa do CNES, com a marca de possuir os produtos de Indicadores APS (ids 4 e 17); nulo se não existir. */
async function unidadeDoCnes(cnes) {
    const pool = await connectToDb();
    const resultado = await pool.request()
        .input('cnes', sql.VarChar, cnes)
        .query(`
            SELECT u.nome_unidade,
                CASE WHEN EXISTS (
                    SELECT 1 FROM tab_unidade_produtos up
                    WHERE up.id_unidade = u.id_unidade AND up.id_produto IN (4, 17)
                ) THEN 1 ELSE 0 END as possui_produto
            FROM tab_unidades u WHERE u.cnes = @cnes AND u.ativo = 1
        `);
    return resultado.recordset[0] || null;
}

module.exports = { nomeDoUsuario, registrarRastreio, unidadeDoCnes, TAMANHO_USUARIO };
