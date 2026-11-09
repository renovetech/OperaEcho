/* Quem pode ver, editar ou excluir um plano: permissão do módulo, isolamento por lotação e autoria. */
const { temPermissao } = require('../../middlewares/auth');
const { httpErro } = require('../../middlewares/errorHandler');
const { filtroPorProjeto, lotacaoNoEscopo } = require('../../middlewares/lotacao');
const { PLANO } = require('./planoAcao.dominio');
const repositorio = require('./planoAcao.repository');
const repositorioItens = require('./planoAcao.itens.repository');

const MODULO = 'plano_acao';
const MODULO_PAINEL = 'painel_plano_acao';

const idUser = (req) => (req.usuario && req.usuario.id_usuario) || null;

/** Filtro de lotação aplicado às listagens de planos. */
const escopoPlanos = (req) => (request) =>
    (req.escopo && !req.escopo.global) ? filtroPorProjeto(request, req.escopo, 'p.id_projeto') : '';

/* Quem pode editar um plano:
 *  - perfil com "Editar" no módulo Plano de Ação; ou
 *  - quem criou o plano; ou
 *  - quem tem a lotação (projeto) do plano e acesso ao módulo. */
async function podeEditarPlano(req, p) {
    if (!p) return false;
    if (await temPermissao(req, MODULO, 'editar')) return true;
    const eu = idUser(req);
    if (eu && p.criado_por === eu) return true;
    const lotacoes = (req.escopo && req.escopo.lotacoes) || [];
    return lotacoes.map(Number).includes(Number(p.id_projeto)) && (await temPermissao(req, MODULO, 'acessar'));
}

async function planoNoEscopo(pool, req, idPlano, { editar = false, excluir = false } = {}) {
    if (!idPlano) throw httpErro(400, 'Plano inválido.');
    const p = await repositorio.buscarResumo(pool, idPlano);
    if (!p) throw httpErro(404, 'Plano não encontrado.');
    if (p.token_publico) p.token_publico = String(p.token_publico).toLowerCase();
    if (req.escopo && !req.escopo.global && !lotacaoNoEscopo(req.escopo, p.id_projeto)) {
        throw httpErro(403, 'Este plano pertence a outra lotação.');
    }
    if (editar && !(await podeEditarPlano(req, p))) {
        throw httpErro(403, 'Você não tem permissão para editar este plano (exige permissão de edição, ser o criador ou ter lotação no projeto).');
    }
    if (excluir && !(await temPermissao(req, MODULO, 'editar')) && p.criado_por !== idUser(req)) {
        throw httpErro(403, 'Somente gestores do Plano de Ação ou o criador podem excluir o plano.');
    }
    return p;
}

const garantirEditavel = (p) => {
    if (p.status === PLANO.ENCERRADO) throw httpErro(409, 'Plano encerrado: reabra-o para editar.');
};

async function itemComPlano(pool, req, idItem, opcoes = {}) {
    const item = await repositorioItens.buscarItem(pool, idItem);
    if (!item) throw httpErro(404, 'Item não encontrado.');
    const plano = await planoNoEscopo(pool, req, item.id_plano, opcoes);
    return { item, plano };
}

module.exports = { MODULO, MODULO_PAINEL, idUser, escopoPlanos, podeEditarPlano, planoNoEscopo, garantirEditavel, itemComPlano };
