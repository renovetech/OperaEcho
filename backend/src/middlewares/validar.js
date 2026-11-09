/* Valida o corpo da requisição com um esquema zod; erro no formato único da API. */

/** Em caso de sucesso, req.body passa a ser o valor validado. */
function validarCorpo(esquema) {
    return (req, res, next) => {
        const resultado = esquema.safeParse(req.body);
        if (resultado.success) {
            req.body = resultado.data;
            return next();
        }
        const primeiro = resultado.error.issues[0];
        const campo = primeiro?.path.join('.');
        return res.status(400).json({ erro: campo ? `Campo inválido: ${campo}. ${primeiro.message}` : 'Dados inválidos.' });
    };
}

module.exports = { validarCorpo };
