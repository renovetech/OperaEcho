/* Rotas que o app mobile chama na raiz, sem o prefixo /api/v1 (seção 6 do PLANO): contrato congelado.
 * O app não muda neste trabalho, então estas URLs seguem respondendo como sempre.
 * O restante da API só existe em /api/v1. */

const COM_PREFIXO_DE_MODULO = '(?:/projetos)?';

const CONTRATO_MOBILE = [
    ['POST', /^\/login\/?$/],
    ['POST', /^\/recuperar-senha\/(canais|solicitar|verificar|confirmar)\/?$/],
    ['POST', /^\/rastreio-background\/?$/],
    ['POST', /^\/ferias\/salvar\/?$/],
    ['GET', /^\/app-version\/?$/],
    ['GET', /^\/regras\/[^/]+\/?$/],
    ['GET', /^\/parametros\/?$/],
    ['GET', /^\/motivos\/?$/],
    ['GET', /^\/projetos\/?$/],
    ['GET', /^\/projetos\/minhas-lotacoes\/?$/],
    ['GET', /^\/implantadores\/?$/],
    ['GET', /^\/unidades\/buscar\/?$/],
    ['GET', /^\/unidades\/[^/]+\/produtos\/?$/],
    ['GET', /^\/ferias\/historico\/[^/]+\/?$/],
    ['GET', /^\/sigtap\/competencias\/?$/],
    ['GET', /^\/sigtap\/procedimentos(\/[^/]+)?\/?$/],
    ['GET', new RegExp(`^${COM_PREFIXO_DE_MODULO}/atividades/buscar/?$`)],
    ['POST', new RegExp(`^${COM_PREFIXO_DE_MODULO}/atividades/salvar/?$`)],
    ['DELETE', new RegExp(`^${COM_PREFIXO_DE_MODULO}/atividades/[^/]+/?$`)],
    ['GET', new RegExp(`^${COM_PREFIXO_DE_MODULO}/escalas/?$`)],
    ['GET', new RegExp(`^${COM_PREFIXO_DE_MODULO}/hora-extra/buscar/?$`)],
    ['GET', new RegExp(`^${COM_PREFIXO_DE_MODULO}/hora-extra/detalhes/[^/]+/?$`)],
    ['POST', new RegExp(`^${COM_PREFIXO_DE_MODULO}/hora-extra/salvar/?$`)],
    ['DELETE', new RegExp(`^${COM_PREFIXO_DE_MODULO}/hora-extra/[^/]+/?$`)]
];

const estaNoContrato = (metodo, caminho) => CONTRATO_MOBILE.some(([m, rota]) => m === metodo && rota.test(caminho));

/** Abrir a URL no navegador é navegação para o React, não chamada de API. */
const ehNavegacao = (req) => req.method === 'GET' && !req.headers.authorization && req.accepts(['json', 'html']) === 'html';

/** Deixa passar à API só o contrato; o resto segue para os arquivos do site. */
function apenasContratoMobile(api) {
    return (req, res, next) => {
        if (req.method === 'OPTIONS' || !estaNoContrato(req.method, req.path) || ehNavegacao(req)) return next();
        return api(req, res, next);
    };
}

module.exports = { apenasContratoMobile, estaNoContrato, CONTRATO_MOBILE };
