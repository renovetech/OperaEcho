/* Contador de tentativas no banco, para o limite valer entre todas as instâncias da API (login e recuperação de senha).
 * Se o banco falhar ou a tabela ainda não existir, devolve null e vale só o limite em memória: nunca derruba o login. */
const crypto = require('crypto');
const { connectToDb, sql } = require('../config/database');

const INTERVALO_FAXINA_MS = 10 * 60 * 1000;
const VALIDADE_REGISTRO_HORAS = 2;

// A chave leva IP ou login: no banco fica só o hash.
const hashDaChave = (nome, chave) => crypto.createHash('sha256').update(`${nome}:${chave}`).digest('hex');

let avisado = false;
function avisarFalha(falha) {
    if (avisado) return;
    avisado = true;
    console.warn('Limite compartilhado indisponível; valendo só o limite em memória:', falha.message);
}

let faxina = null;
function iniciarFaxina() {
    if (faxina) return;
    faxina = setInterval(async () => {
        try {
            const pool = await connectToDb();
            await pool.request().input('h', sql.Int, VALIDADE_REGISTRO_HORAS)
                .query('DELETE FROM tab_limites_acesso WHERE inicio < DATEADD(hour, -@h, SYSUTCDATETIME())');
        } catch (falha) {
            avisarFalha(falha);
        }
    }, INTERVALO_FAXINA_MS);
    if (faxina.unref) faxina.unref();
}

/** Soma uma tentativa e devolve quantas houve na janela; null se o banco não respondeu. */
async function registrar(nome, chave, janelaMs) {
    iniciarFaxina();
    try {
        const pool = await connectToDb();
        const resultado = await pool.request()
            .input('c', sql.Char(64), hashDaChave(nome, chave))
            .input('j', sql.Int, janelaMs)
            .query(`
                MERGE tab_limites_acesso WITH (HOLDLOCK) AS a
                USING (SELECT @c AS chave) AS s ON a.chave = s.chave
                WHEN MATCHED THEN UPDATE SET
                    tentativas = CASE WHEN a.inicio < DATEADD(ms, -@j, SYSUTCDATETIME()) THEN 1 ELSE a.tentativas + 1 END,
                    inicio = CASE WHEN a.inicio < DATEADD(ms, -@j, SYSUTCDATETIME()) THEN SYSUTCDATETIME() ELSE a.inicio END
                WHEN NOT MATCHED THEN INSERT (chave, inicio, tentativas) VALUES (@c, SYSUTCDATETIME(), 1)
                OUTPUT inserted.tentativas;`);
        return resultado.recordset[0].tentativas;
    } catch (falha) {
        avisarFalha(falha);
        return null;
    }
}

async function zerar(nome, chave) {
    try {
        const pool = await connectToDb();
        await pool.request().input('c', sql.Char(64), hashDaChave(nome, chave)).query('DELETE FROM tab_limites_acesso WHERE chave = @c');
    } catch (falha) {
        avisarFalha(falha);
    }
}

module.exports = { registrar, zerar };
