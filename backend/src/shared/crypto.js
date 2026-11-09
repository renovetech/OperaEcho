/* utils/crypto.js - AES-256-GCM para segredos em repouso (ex.: apikey da Evolution).
 * Mesmo formato do Renove Saúde ("enc:v1:" + base64(iv|tag|dados)).
 * NÃO use para senha de usuário (essas usam bcrypt).
 * Chave: CRYPTO_KEY (64 hex). Sem ela, deriva do JWT_SECRET - funciona, mas
 * trocar o JWT_SECRET depois invalida os segredos gravados. */
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const PREFIX = 'enc:v1:';

let KEY;
if (/^[0-9a-f]{64}$/i.test(process.env.CRYPTO_KEY || '')) {
    KEY = Buffer.from(process.env.CRYPTO_KEY, 'hex');
} else {
    console.warn('CRYPTO_KEY ausente/inválida: usando chave derivada do JWT_SECRET.');
    KEY = crypto.createHash('sha256').update('opera-echo:' + (process.env.JWT_SECRET || '')).digest();
}

function encryptTagged(plain) {
    if (plain == null || plain === '') return null;
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv(ALGO, KEY, iv);
    const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

function decryptTagged(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value; // legado em texto
    const buf = Buffer.from(value.slice(PREFIX.length), 'base64');
    if (buf.length < IV_LEN + TAG_LEN) throw new Error('Segredo cifrado inválido.');
    const decipher = crypto.createDecipheriv(ALGO, KEY, buf.subarray(0, IV_LEN));
    decipher.setAuthTag(buf.subarray(IV_LEN, IV_LEN + TAG_LEN));
    return Buffer.concat([decipher.update(buf.subarray(IV_LEN + TAG_LEN)), decipher.final()]).toString('utf8');
}

module.exports = { encryptTagged, decryptTagged };
