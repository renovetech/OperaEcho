/* Monta as rotas de escala para um módulo (Implantação ou Projetos). Cada módulo tem o próprio router, exportado por
 * escalas.routes.js e projEscalas.routes.js, para continuar no mesmo ponto de src/rotas.js. */
const express = require('express');
const { autenticar, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const servico = require('./escalas.service');
const { diaDeEscala, loteDeEscala } = require('./escalas.schema');

const MAX_LOTE = 5000;

/* A mensagem própria do lote vazio ou grande vem antes do esquema. */
function conferirTamanhoDoLote(req, res, next) {
    if (!Array.isArray(req.body) || req.body.length === 0) return res.status(400).json({ erro: 'Vazio.' });
    if (req.body.length > MAX_LOTE) return res.status(413).json({ erro: `Lote muito grande (máx. ${MAX_LOTE}).` });
    return next();
}

/* A resposta do escopo também vem antes do esquema; sem escopo na escrita, o passo não faz nada. */
const conferirEscopo = (modulo, idsDoCorpo, mensagem) => asyncHandler(async (req, res, next) => {
    if (!modulo.escopoNaEscrita || await servico.usuariosNoEscopo(req.escopo, idsDoCorpo(req.body))) return next();
    return res.status(403).json({ erro: mensagem });
});

function criarRotasEscalas(modulo) {
    const router = express.Router();
    const podeEditarEscala = autorizarModulo(modulo.moduloPermissao, 'editar');
    const exigeModulo = autorizarModulo(modulo.moduloPermissao);
    // O "Minha Escala" do app aparece nas duas abas para todos: a própria escala não depende do módulo.
    const podeVerEscala = (req, res, next) => {
        const propria = req.usuario && parseInt(req.query.id_usuario) === req.usuario.id_usuario;
        return propria ? next() : exigeModulo(req, res, next);
    };

    router.get(modulo.prefixo, autenticar, podeVerEscala, asyncHandler(async (req, res) => {
        res.json(await servico.listar(modulo, req.query, req.escopo));
    }));

    const escopoDoDia = conferirEscopo(modulo, (corpo) => [parseInt(corpo.id_usuario)], 'Colaborador fora da sua lotação.');
    router.post(`${modulo.prefixo}/salvar`, autenticar, podeEditarEscala, escopoDoDia, validarCorpo(diaDeEscala), asyncHandler(async (req, res) => {
        const dia = req.body;
        await servico.salvarDia(modulo, dia);
        // Responde logo após persistir; o aviso pelo WhatsApp é agrupado e não bloqueia a resposta.
        res.json({ mensagem: 'Salvo' });
        servico.avisarAlteracao(modulo, [{ id_usuario: parseInt(dia.id_usuario), data_escala: dia.data_escala }], req.usuario.id_usuario);
    }));

    const escopoDoLote = conferirEscopo(modulo, (corpo) => corpo.map((item) => item.id_usuario), 'A replicação inclui colaborador fora da sua lotação.');
    router.post(`${modulo.prefixo}/salvar-lote`, autenticar, podeEditarEscala, conferirTamanhoDoLote, escopoDoLote, validarCorpo(loteDeEscala), asyncHandler(async (req, res) => {
        await servico.salvarLote(modulo, req.body);
        res.json({ mensagem: 'Replicação OK' });
        servico.avisarAlteracao(modulo, req.body, req.usuario.id_usuario);
    }));

    return router;
}

module.exports = { criarRotasEscalas };
