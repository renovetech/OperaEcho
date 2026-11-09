/* Configuração dos dois módulos do Gerador de Escalas. Toda diferença entre eles é uma opção nomeada aqui. */

const IMPLANTACAO = Object.freeze({
    prefixo: '/escalas',
    moduloPermissao: 'escala',
    moduloNotificacao: 'IMPLANTACAO',
    tabelas: Object.freeze({ escalas: 'tab_escalas', produtos: 'tab_escala_produtos' }),
    // Leitura: escala completa, de todos os usuários.
    isolarNaLeitura: false,
    // Escrita: escala qualquer colaborador.
    escopoNaEscrita: false
});

const PROJETOS = Object.freeze({
    prefixo: '/projetos/escalas',
    moduloPermissao: 'proj_escala',
    moduloNotificacao: 'PROJETOS',
    tabelas: Object.freeze({ escalas: 'tab_proj_escalas', produtos: 'tab_proj_escala_produtos' }),
    // Leitura: só colaboradores da lotação do usuário.
    isolarNaLeitura: true,
    // Escrita: só colaboradores da lotação do usuário.
    escopoNaEscrita: true
});

module.exports = { IMPLANTACAO, PROJETOS };
