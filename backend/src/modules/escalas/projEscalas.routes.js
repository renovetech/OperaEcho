/* Escalas do módulo Projetos: /projetos/escalas/*, tabelas tab_proj_escala*. */
const { criarRotasEscalas } = require('./escalas.montagem');
const { PROJETOS } = require('./escalas.modulos');

module.exports = criarRotasEscalas(PROJETOS);
