/* Registro de Atividades do módulo Projetos: /projetos/atividades/*, tabelas tab_proj_atividade*. */
const { criarRotasAtividades } = require('./atividades.montagem');
const { PROJETOS } = require('./atividades.modulos');

module.exports = criarRotasAtividades(PROJETOS);
