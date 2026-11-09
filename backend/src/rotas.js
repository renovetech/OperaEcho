/* A API completa: públicas primeiro; depois da barreira, tudo exige sessão por padrão. */
const express = require('express');
const { autenticar, exigirAutenticacao } = require('./middlewares/auth');
const { carregarEscopo } = require('./middlewares/lotacao');
const { limitarPeriodoRelatorios, validarDatasQuery } = require('./middlewares/validarDatas');
const { limitar } = require('./shared/rateLimit');

const LIMITE_USUARIO_POR_MINUTO = parseInt(process.env.RATE_LIMIT_USUARIO_MIN || '600', 10);
const JANELA_LIMITE_MS = 60 * 1000;

/* Exceções à sessão, necessárias à tela de login, ao autocadastro e à consulta pública do SIGTAP. */
const ROTAS_LIVRES = [
    ['GET', /^\/projetos\/?$/],
    ['GET', /^\/setores\/?$/],
    ['GET', /^\/funcoes\/?$/],
    ['GET', /^\/cidades\/[^/]+\/?$/],
    ['POST', /^\/usuarios\/salvar\/?$/],
    ['GET', /^\/sigtap\/(competencias|filtros|procedimentos|compatibilidades|tabelas)(\/[^/]+)?\/?$/]
];

function criarApi() {
    const api = express.Router();

    api.use(require('./modules/publicas/publicas.routes'));
    api.use(require('./modules/auth/auth.routes'));
    api.use(require('./modules/projetos/painelPublico.routes'));
    api.use(require('./modules/planoAcao/planoAcaoPublico.routes'));

    api.use(autenticar, exigirAutenticacao({ livres: ROTAS_LIVRES }), carregarEscopo);
    api.use(limitar({
        janelaMs: JANELA_LIMITE_MS,
        max: LIMITE_USUARIO_POR_MINUTO,
        chave: (req) => `u:${req.usuario ? req.usuario.id_usuario : req.ip}`,
        mensagem: 'Muitas requisições em pouco tempo. Aguarde um instante.'
    }));
    // Respostas da API não ficam em cache de navegador nem de proxy: há dados pessoais.
    api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
    api.use(validarDatasQuery);
    api.use(limitarPeriodoRelatorios);

    api.use(require('./modules/usuarios/usuarios.routes'));
    api.use(require('./modules/cadastros/cadastros.routes'));
    api.use(require('./modules/paineis/paineis.routes'));
    api.use(require('./modules/atividades/atividades.routes'));
    api.use(require('./modules/planoAcao/planoAcao.routes'));
    api.use(require('./modules/escalas/escalas.routes'));
    api.use(require('./modules/ferias/ferias.routes'));
    api.use(require('./modules/horaExtra/horaExtra.routes'));
    api.use(require('./modules/relatorios/relatorios.routes'));
    api.use(require('./modules/projetos/projetos.routes'));
    api.use(require('./modules/atividades/projAtividades.routes'));
    api.use(require('./modules/escalas/projEscalas.routes'));
    api.use(require('./modules/parametros/linksExternos.routes'));
    api.use(require('./modules/parametros/parametros.routes'));
    api.use(require('./modules/cadastros/regioes.routes'));
    api.use(require('./modules/sigtap/sigtap.routes'));
    api.use(require('./modules/faturamento/faturamento.routes'));
    api.use(require('./modules/whatsapp/whatsapp.routes'));

    api.use((req, res) => res.status(404).json({ erro: 'Recurso não encontrado.' }));
    return api;
}

module.exports = { criarApi };
