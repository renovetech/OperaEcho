/* Configuração dos dois módulos do Registro de Atividades. Toda diferença entre eles é uma opção nomeada aqui:
 * o código de rotas, regras e SQL é um só. */

const IMPLANTACAO = Object.freeze({
    prefixo: '/atividades',
    moduloPermissao: 'registro_atividades',
    moduloParametros: 'implantacao',
    tabelas: Object.freeze({ atividades: 'tab_atividades', implantadores: 'tab_atividade_implantadores', equipe: 'tab_atividade_equipe_projeto' }),
    // Leitura: visão consolidada, exceto para estas funções, que veem só a própria lotação (nome sem acento, em maiúsculas).
    funcoesIsoladasNaLeitura: Object.freeze(['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR']),
    // Equipe do Projeto: grava o que vier, mesmo sem o motivo "Apoio ao Projeto".
    equipeSomenteNoApoio: false,
    // Escrita: sem exigir projeto e sem conferir lotação ao gravar, editar ou excluir.
    escopoNaEscrita: false,
    // Edição: responde 404 já ao procurar os anexos do registro.
    registroObrigatorioNosAnexos: true,
    // Ordem: parâmetros, equipe e tempo são conferidos antes de ler e renomear os anexos.
    regrasAntesDosAnexos: true
});

const PROJETOS = Object.freeze({
    prefixo: '/projetos/atividades',
    moduloPermissao: 'proj_registro_atividades',
    moduloParametros: 'projetos',
    tabelas: Object.freeze({ atividades: 'tab_proj_atividades', implantadores: 'tab_proj_atividade_implantadores', equipe: 'tab_proj_atividade_equipe_projeto' }),
    // Leitura: sempre isolada pela lotação.
    funcoesIsoladasNaLeitura: null,
    // Equipe do Projeto: só é gravada no motivo "Apoio ao Projeto".
    equipeSomenteNoApoio: true,
    // Escrita: projeto obrigatório e dentro da lotação; o registro editado ou excluído também.
    escopoNaEscrita: true,
    // Edição: anexos ausentes não recusam; o 404 sai depois, na conferência de escopo do registro.
    registroObrigatorioNosAnexos: false,
    // Ordem: lê e renomeia os anexos antes de conferir parâmetros, equipe e tempo.
    regrasAntesDosAnexos: false
});

module.exports = { IMPLANTACAO, PROJETOS };
