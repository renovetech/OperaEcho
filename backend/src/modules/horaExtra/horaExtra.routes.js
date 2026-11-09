/* Lançamento de Hora Extra dos dois módulos, que seguem a mesma regra:
 *   Implantação: /hora-extra/*           tabelas tab_hora_extra_*
 *   Projetos:    /projetos/hora-extra/*  tabelas tab_proj_hora_extra_*, com isolamento por lotação */
const express = require('express');
const { connectToDb } = require('../../config/database');
const { autenticar } = require('../../middlewares/auth');
const { asyncHandler } = require('../../middlewares/errorHandler');
const { validarCorpo } = require('../../middlewares/validar');
const { ehGestaoHE, podeAcessarLancamento, podeLancarPara } = require('./horaExtra.acesso');
const repositorio = require('./horaExtra.repository');
const { salvarLancamento } = require('./horaExtra.schema');

const router = express.Router();

const MODULOS = [
    { prefixo: '/hora-extra', tabelas: { cabecalho: 'tab_hora_extra_cabecalho', detalhes: 'tab_hora_extra_detalhes' }, isolarPorLotacao: false },
    { prefixo: '/projetos/hora-extra', tabelas: { cabecalho: 'tab_proj_hora_extra_cabecalho', detalhes: 'tab_proj_hora_extra_detalhes' }, isolarPorLotacao: true }
];

function registrarRotas({ prefixo, tabelas, isolarPorLotacao }) {
    const podeAbrir = async (req) => podeAcessarLancamento(await connectToDb(), req, tabelas.cabecalho, req.params.id);

    router.post(`${prefixo}/salvar`, autenticar, validarCorpo(salvarLancamento), asyncHandler(async (req, res) => {
        const { id_lancamento: idLancamento, id_usuario: idUsuario } = req.body;
        const permitido = idLancamento
            ? await podeAcessarLancamento(await connectToDb(), req, tabelas.cabecalho, idLancamento)
            : podeLancarPara(req, idUsuario);
        if (!permitido) return res.status(403).json({ erro: 'Sem permissão para lançar/editar hora extra de outro colaborador.' });
        const id = await repositorio.salvar(tabelas, req.body);
        return res.json({ mensagem: 'Salvo com sucesso', id_lancamento: id });
    }));

    router.get(`${prefixo}/buscar`, autenticar, asyncHandler(async (req, res) => {
        res.json(await repositorio.listar(tabelas, {
            mes: req.query.mes,
            idProjeto: req.query.id_projeto,
            // Perfil do TOKEN, não da query: quem não é Administrador/Gestor vê só os próprios.
            idUsuario: ehGestaoHE(req) ? null : req.usuario.id_usuario,
            escopo: isolarPorLotacao ? req.escopo : null
        }));
    }));

    router.get(`${prefixo}/detalhes/:id`, autenticar, asyncHandler(async (req, res) => {
        if (!await podeAbrir(req)) return res.status(403).json({ erro: 'Sem permissão.' });
        return res.json({ detalhes: await repositorio.buscarDetalhes(tabelas, req.params.id) });
    }));

    router.delete(`${prefixo}/:id`, autenticar, asyncHandler(async (req, res) => {
        if (!await podeAbrir(req)) return res.status(403).json({ erro: 'Sem permissão.' });
        await repositorio.excluir(tabelas, req.params.id);
        return res.json({ mensagem: 'Excluído' });
    }));
}

MODULOS.forEach(registrarRotas);

module.exports = router;
