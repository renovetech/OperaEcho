/*
 * Leitor mínimo de .zip em memória (sem dependências): diretório central +
 * entradas "stored" (0) e "deflate" (8), que é o que o pacote do DATASUS usa. */
const zlib = require('zlib');

// Maior arquivo do pacote SIGTAP descompactado fica bem abaixo disso
const MAX_DESCOMPACTADO = parseInt(process.env.ZIP_MAX_ENTRADA_MB || '512', 10) * 1024 * 1024;
const MAX_ENTRADAS = 5000;

function abrirZip(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 22) throw new Error('Arquivo .zip inválido.');

    // Fim do diretório central (EOCD): até 64 KB de comentário no final.
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo .zip inválido.');

    const total = buf.readUInt16LE(eocd + 10);
    if (total > MAX_ENTRADAS) throw new Error('Arquivo .zip com entradas demais.');
    let p = buf.readUInt32LE(eocd + 16);
    const entradas = new Map(); // nome do arquivo (minúsculo, sem pasta) -> metadados

    for (let n = 0; n < total; n++) {
        if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretório do .zip corrompido.');
        const metodo = buf.readUInt16LE(p + 10);
        const tamComp = buf.readUInt32LE(p + 20);
        const lenNome = buf.readUInt16LE(p + 28);
        const lenExtra = buf.readUInt16LE(p + 30);
        const lenCom = buf.readUInt16LE(p + 32);
        const offLocal = buf.readUInt32LE(p + 42);
        const nome = buf.toString('latin1', p + 46, p + 46 + lenNome);
        const chave = nome.replace(/\\/g, '/').split('/').pop().toLowerCase();
        if (chave && !entradas.has(chave)) entradas.set(chave, { nome, metodo, tamComp, offLocal });
        p += 46 + lenNome + lenExtra + lenCom;
    }

    return {
        nomes: () => [...entradas.keys()],
        tem: (arquivo) => entradas.has(String(arquivo).toLowerCase()),
        /** Conteúdo descompactado (Buffer) ou null se a entrada não existir. */
        ler(arquivo) {
            const e = entradas.get(String(arquivo).toLowerCase());
            if (!e) return null;
            const o = e.offLocal;
            if (o + 30 > buf.length || buf.readUInt32LE(o) !== 0x04034b50) throw new Error(`Entrada ${e.nome} corrompida no .zip.`);
            const ini = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
            const dados = buf.subarray(ini, ini + e.tamComp);
            if (e.metodo === 0) return dados;
            // Teto de descompactação: um "zip bomb" (KB que viram GB) derrubaria o servidor por falta de memória
            if (e.metodo === 8) {
                try { return zlib.inflateRawSync(dados, { maxOutputLength: MAX_DESCOMPACTADO }); }
                catch (err) { throw new Error(`Entrada ${e.nome} excede o tamanho permitido ou está corrompida.`); }
            }
            throw new Error(`Compactação não suportada em ${e.nome}.`);
        }
    };
}

module.exports = { abrirZip };
