/* utils/arquivos.js
 * Acesso protegido aos anexos (/uploads).
 * Cada caminho devolvido pela API leva um token curto e específico daquele arquivo (?t=...), para os links <a href>
 * do web e o Linking.openURL do app continuarem funcionando sem header.
 */
const jwt = require('jsonwebtoken');

const FINALIDADE = 'arquivo';
const VALIDADE = process.env.ARQUIVO_TOKEN_EXPIRES_IN || '12h';
// Caminho aceito para anexos gravados no banco
const CAMINHO_VALIDO = /^uploads\/atividades\/[^/\\?#]+$/;

const semQuery = (c) => String(c || '').split('?')[0].trim();

/** Assina um caminho "uploads/atividades/x.pdf" -> "uploads/atividades/x.pdf?t=..." */
function assinarCaminho(caminho) {
    const limpo = semQuery(caminho);
    if (!CAMINHO_VALIDO.test(limpo)) return limpo;
    const t = jwt.sign({ arq: limpo, finalidade: FINALIDADE }, process.env.JWT_SECRET, { expiresIn: VALIDADE });
    return `${limpo}?t=${t}`;
}

/** "a.pdf,b.pdf" (texto do banco) -> mesma lista com cada caminho assinado */
function assinarLista(valor) {
    if (!valor || typeof valor !== 'string') return valor;
    return valor.split(',').map(c => c.trim()).filter(Boolean).map(assinarCaminho).join(',');
}

/** Lista "arquivos_antigos_mantidos" vinda do cliente: remove token e descarta
 *  qualquer coisa que não seja um anexo local (links externos, ../, etc.).
 *  `atuais` = caminhos já gravados no registro (edição): esses são mantidos
 *  mesmo em formato antigo, para não perder anexos legados. */
function caminhosMantidos(valor, atuais = '') {
    if (!valor) return [];
    const jaGravados = new Set(String(atuais || '').split(',').map(c => c.trim()).filter(Boolean));
    return String(valor).split(',').map(semQuery).filter(c => c && (CAMINHO_VALIDO.test(c) || jaGravados.has(c)));
}

/** Nome seguro para compor nome de arquivo (sem barras, pontos, acentos). */
function trechoSeguro(s, padrao = 'Usuario') {
    const v = String(s || '').split(' ')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
    return v || padrao;
}

/** Middleware para /uploads: exige JWT de sessão (header) ou token do arquivo (?t=). */
function protegerUploads(req, res, next) {
    let caminho;
    try { caminho = 'uploads' + decodeURIComponent(req.path); } catch (e) { return res.status(400).end(); }

    const auth = req.headers.authorization || '';
    try {
        if (auth.startsWith('Bearer ')) {
            const d = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
            if (!d.finalidade) return next();
        }
        if (req.query && typeof req.query.t === 'string') {
            const d = jwt.verify(req.query.t, process.env.JWT_SECRET);
            if (d.finalidade === FINALIDADE && d.arq === caminho) return next();
        }
    } catch (e) { /* cai no 401 */ }
    return res.status(401).json({ erro: 'Link do anexo expirado ou inválido. Recarregue a página.' });
}

/** Apaga arquivos recebidos pelo multer quando a requisição é recusada. */
function descartarUploads(req) {
    const fs = require('fs');
    (req.files || []).forEach(f => { try { fs.unlinkSync(f.path); } catch (e) { /* já removido */ } });
}

module.exports = { assinarCaminho, assinarLista, caminhosMantidos, trechoSeguro, protegerUploads, descartarUploads };
