/* services/email.js - envio de e-mail transacional (SMTP do .env).
 * Hoje usado só no código de redefinição de senha. */
// Carregado sob demanda: se o nodemailer não estiver instalado ou não rodar nesta
// versão do Node (a 10.x exige Node 20+), a API sobe e só o e-mail fica indisponível.
let nodemailer = null;
let erroCarga = null;
function carregar() {
    if (nodemailer || erroCarga) return nodemailer;
    try { nodemailer = require('nodemailer'); }
    catch (e) { erroCarga = e; console.error('[E-mail] nodemailer indisponível:', e.message); }
    return nodemailer;
}

let transporte = null;

function configurado() {
    return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) && !!carregar();
}

function obterTransporte() {
    if (!transporte) {
        transporte = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '465', 10),
            secure: String(process.env.SMTP_SECURE || 'true') === 'true',
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 20000
        });
    }
    return transporte;
}

const escapar = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function enviar({ para, assunto, texto, html }) {
    if (!configurado()) throw Object.assign(new Error('E-mail não configurado no servidor.'), { status: 503 });
    return obterTransporte().sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: assunto, text: texto, html });
}

async function enviarCodigoSenha({ para, nome, codigo, validadeMin }) {
    const primeiro = escapar(String(nome || '').split(/\s+/)[0] || '');
    const texto = `Olá ${primeiro},\n\nSeu código para redefinir a senha do Opera Echo é: ${codigo}\n\nEle vale por ${validadeMin} minutos. Não compartilhe este código com ninguém.\nSe você não pediu a redefinição, ignore este e-mail.\n\n- Opera Echo`;
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:auto;color:#1f2a24">
        <h2 style="color:#2e7d32;margin-bottom:4px">Opera Echo</h2>
        <p>Olá ${primeiro},</p>
        <p>Seu código para redefinir a senha é:</p>
        <p style="font-size:30px;font-weight:bold;letter-spacing:6px;background:#eef6ef;padding:14px;text-align:center;border-radius:8px">${escapar(codigo)}</p>
        <p>Ele vale por <b>${validadeMin} minutos</b>. Não compartilhe este código com ninguém - nossa equipe nunca pede seu código.</p>
        <p style="color:#777;font-size:12px">Se você não pediu a redefinição, ignore este e-mail. Sua senha continua a mesma.</p></div>`;
    return enviar({ para, assunto: `Opera Echo - código de redefinição de senha: ${codigo}`, texto, html });
}

module.exports = { configurado, enviar, enviarCodigoSenha };
