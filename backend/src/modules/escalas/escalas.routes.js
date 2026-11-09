/* Escalas do módulo Implantação (/escalas/*, tabelas tab_escala*) e, logo depois, as regras de acesso por perfil. */
const { criarRotasEscalas } = require('./escalas.montagem');
const { IMPLANTACAO } = require('./escalas.modulos');
const rotasDeRegrasDeAcesso = require('./regrasAcesso.routes');

const router = criarRotasEscalas(IMPLANTACAO);
router.use(rotasDeRegrasDeAcesso);

module.exports = router;
