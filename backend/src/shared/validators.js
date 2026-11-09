
/**
 * Valida requisitos de senha forte.
 * Mín 7 chars, 1 maiúscula, 1 minúscula, 1 número, 1 especial.
 */
function validarForcaSenha(senha) {
    if (!senha || senha.length < 7) return false;
    if (!/[A-Z]/.test(senha)) return false;
    if (!/[a-z]/.test(senha)) return false;
    if (!/[0-9]/.test(senha)) return false;
    if (!/[^A-Za-z0-9]/.test(senha)) return false;
    return true;
}

/**
 * Sanitiza inteiro vindo de body/query.
 * Retorna null se inválido.
 */
function parseIntSafe(valor) {
    if (valor === null || valor === undefined || valor === '' || valor === 'null' || valor === 'undefined') {
        return null;
    }
    const parsed = parseInt(valor, 10);
    return isNaN(parsed) ? null : parsed;
}

module.exports = { validarForcaSenha, parseIntSafe };
