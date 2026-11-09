/* Registro de Atividades do módulo Implantação: /atividades/*, tabelas tab_atividade*. */
const { criarRotasAtividades } = require('./atividades.montagem');
const { IMPLANTACAO } = require('./atividades.modulos');

module.exports = criarRotasAtividades(IMPLANTACAO);
