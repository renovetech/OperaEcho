/* config/database.js */
const sql = require('mssql');

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT) || 1433,
    options: {
        // Ligue (DB_ENCRYPT=true) quando o SQL Server não estiver na mesma máquina/rede
        // privada: sem isso, usuário, senha e dados trafegam em texto puro.
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
        enableArithAbort: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool = null;

async function connectToDb() {
    if (pool) return pool;
    try {
        pool = await sql.connect(config);
        console.log('Banco conectado');
        return pool;
    } catch (err) {
        console.error('Erro ao conectar no banco:', err.message);
        throw err;
    }
}

module.exports = { connectToDb, sql };
