const jwt = require('jsonwebtoken');

/**
 * Gera um JWT com os dados essenciais do usuário.
 * Payload mínimo para não inflar o token.
 */
function gerarToken(usuario) {
    const payload = {
        id_usuario: usuario.id_usuario,
        usuario: usuario.usuario,
        perfil_acesso: usuario.perfil_acesso,
        id_lotacao: usuario.id_lotacao || null
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    });
}

module.exports = { gerarToken };
