/* scripts/migrarSenhasLegadas.js
 * Converte para bcrypt as senhas que ainda estão em TEXTO PURO em tab_usuarios.
 * Hoje elas só são convertidas quando o usuário faz login; quem não entra há
 * tempo continua com a senha legível no banco (e em qualquer backup dele).
 *
 * Compatível com o login: a senha padrão ("Eco123"/"123") continua forçando a
 * troca no primeiro acesso, porque o login compara a senha DIGITADA.
 *
 * Uso (na pasta backend):
 *   node scripts/migrarSenhasLegadas.js            -> só conta (simulação)
 *   node scripts/migrarSenhasLegadas.js --aplicar  -> converte
 * Faça backup do banco antes de aplicar. A conversão não tem volta (é o objetivo).
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcrypt');
const { connectToDb, sql } = require('../config/database');

const SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
const aplicar = process.argv.includes('--aplicar');

(async () => {
    const pool = await connectToDb();
    const r = await pool.request().query(`
        SELECT id_usuario, senha_hash FROM tab_usuarios
        WHERE senha_hash IS NOT NULL AND senha_hash NOT LIKE '$2a$%' AND senha_hash NOT LIKE '$2b$%' AND senha_hash NOT LIKE '$2y$%'`);

    console.log(`Senhas em texto puro encontradas: ${r.recordset.length}`);
    if (!aplicar) {
        console.log('Simulação. Rode com --aplicar para converter.');
        process.exit(0);
    }

    let n = 0;
    for (const u of r.recordset) {
        const hash = await bcrypt.hash(String(u.senha_hash), SALT_ROUNDS);
        await pool.request().input('id', sql.Int, u.id_usuario).input('h', sql.VarChar, hash)
            .query('UPDATE tab_usuarios SET senha_hash = @h WHERE id_usuario = @id');
        n++;
    }
    console.log(`Convertidas: ${n}`);
    process.exit(0);
})().catch((e) => { console.error('Falha:', e.message); process.exit(1); });
