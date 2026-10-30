/* utils/validators.js */

/**
 * Valida CPF brasileiro (11 dígitos com verificação de dígitos).
 */
function validarCPF(cpf) {
    cpf = (cpf || '').replace(/\D/g, '');
    if (cpf.length !== 11) return false;
    if (/^(\d)\1{10}$/.test(cpf)) return false; // Todos iguais

    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(cpf.charAt(i)) * (10 - i);
    let resto = 11 - (soma % 11);
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.charAt(9))) return false;

    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(cpf.charAt(i)) * (11 - i);
    resto = 11 - (soma % 11);
    if (resto >= 10) resto = 0;
    if (resto !== parseInt(cpf.charAt(10))) return false;

    return true;
}

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

module.exports = { validarCPF, validarForcaSenha, parseIntSafe };
