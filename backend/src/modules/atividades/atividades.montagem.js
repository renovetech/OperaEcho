/* Monta as rotas do Registro de Atividades para um módulo (Implantação ou Projetos). Cada módulo tem o próprio router,
 * exportado por atividades.routes.js e projAtividades.routes.js, para continuar no mesmo ponto de src/rotas.js. */
const express = require('express');
const upload = require('../../config/upload');
const { autenticar, temPermissao, autorizarModulo } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { descartarUploads } = require('../../shared/arquivos');
const servico = require('./atividades.service');
const { salvarAtividade } = require('./atividades.schema');

const CAMPO_DOS_ANEXOS = 'anexos';
const MAXIMO_DE_ANEXOS = 20;
const SEM_PERMISSAO = 'Sem permissão para esta ação.';

function criarRotasAtividades(modulo) {
    const router = express.Router();
    const { moduloPermissao } = modulo;

    // Antes de receber arquivos: precisa ao menos poder criar OU editar no módulo.
    const podeGravarAlgo = async (req, res, next) => {
        try {
            if (await temPermissao(req, moduloPermissao, 'novo') || await temPermissao(req, moduloPermissao, 'editar')) return next();
            return res.status(403).json({ erro: SEM_PERMISSAO });
        } catch (falha) { return next(falha); }
    };

    // Com o multipart já lido, confere a ação exata. Daqui em diante, recusa não deixa arquivo órfão no disco.
    const podeFazerEstaGravacao = asyncHandler(async (req, res, next) => {
        if (!(await temPermissao(req, moduloPermissao, req.body.id_atividade ? 'editar' : 'novo'))) {
            descartarUploads(req);
            return res.status(403).json({ erro: SEM_PERMISSAO });
        }
        res.on('finish', () => { if (res.statusCode >= 400) descartarUploads(req); });
        return next();
    });

    const conferirRegras = asyncHandler(async (req, res, next) => {
        const { recusa, dados } = await servico.prepararGravacao(modulo, req);
        if (recusa) return res.status(recusa.status).json({ erro: recusa.erro });
        res.locals.gravacao = dados;
        return next();
    });

    router.get(`${modulo.prefixo}/buscar`, autenticar, autorizarModulo(moduloPermissao), asyncHandler(async (req, res) => {
        res.json(await servico.buscar(modulo, req.query, req.escopo));
    }));

    router.post(`${modulo.prefixo}/salvar`, autenticar, podeGravarAlgo, upload.array(CAMPO_DOS_ANEXOS, MAXIMO_DE_ANEXOS), podeFazerEstaGravacao, conferirRegras, validarCorpo(salvarAtividade), asyncHandler(async (req, res) => {
        await servico.gravar(modulo, req.body, res.locals.gravacao);
        res.json({ mensagem: 'Salvo' });
    }));

    router.delete(`${modulo.prefixo}/:id`, autenticar, autorizarModulo(moduloPermissao, 'editar'), asyncHandler(async (req, res) => {
        const { recusa } = await servico.excluir(modulo, req.escopo, parseInt(req.params.id));
        if (recusa) return res.status(recusa.status).json({ erro: recusa.erro });
        return res.json({ mensagem: 'Excluído' });
    }));

    return router;
}

module.exports = { criarRotasAtividades };
