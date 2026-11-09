const sql = require('mssql');

const CONEXOES_PADRAO = 20;
const LIMITE_CONSULTA_MS = 30000;

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: parseInt(process.env.DB_PORT) || 1433,
    // O padrão do driver é 15 s, curto para os relatórios em rajadas de requisições.
    requestTimeout: parseInt(process.env.DB_REQUEST_TIMEOUT, 10) || LIMITE_CONSULTA_MS,
    options: {
        // Ligue (DB_ENCRYPT=true) quando o SQL Server não estiver na mesma máquina/rede
        // privada: sem isso, usuário, senha e dados trafegam em texto puro.
        encrypt: process.env.DB_ENCRYPT === 'true',
        trustServerCertificate: process.env.DB_TRUST_CERT !== 'false',
        enableArithAbort: true
    },
    pool: {
        max: parseInt(process.env.DB_POOL_MAX, 10) || CONEXOES_PADRAO,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let conexao = null;

/** Chamadas simultâneas na subida compartilham a mesma conexão; se falhar, a próxima tenta de novo. */
function connectToDb() {
    if (!conexao) {
        conexao = sql.connect(config)
            .then((pool) => {
                console.log('Banco conectado');
                return pool;
            })
            .catch((falha) => {
                console.error('Erro ao conectar no banco:', falha.message);
                conexao = null;
                throw falha;
            });
    }
    return conexao;
}

module.exports = { connectToDb, sql };
