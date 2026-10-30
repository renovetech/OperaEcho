/* ARQUIVO: src/config/planoTemplates.js
 * --------------------------------------------------------------------------
 * CENTRAL DE TEMPLATES DO PLANO DE AÇÃO  (Opção 1-A)
 *
 * Para adicionar um produto/módulo novo, basta acrescentar um objeto na lista
 * TEMPLATES abaixo. Nenhuma alteração de componente é necessária.
 *
 * Estrutura de cada template:
 *   id            -> chave única
 *   match         -> termos (lowercase) p/ casar com o nome do produto cadastrado
 *   modulo        -> rótulo do bloco no plano/PDF (null = sem módulo)
 *   tituloSugerido-> título pré-preenchido no wizard
 *   precisaSubTipo-> se exige escolher Atenção Primária/Secundária
 *   etapasGerais  -> [{ grupo, acao, responsavel }]
 *   etapasUnidade -> [{ acao, responsavel }] (repetido p/ cada unidade incluída)
 * -------------------------------------------------------------------------- */

export const OPCOES_RESPONSAVEL = [
    "Cliente Final",
    "Distribuição/DBA",
    "Equipe Implantação",
    "Equipe Negócios Eco",
    "Equipe Local",
    "Infraestrutura",
    "Operações"
];

export const OPCOES_PRIORIDADE = ["Alta", "Média", "Baixa"];

/* Conjuntos de situação por "família" de produto */
export const STATUS_SERII = ["A Iniciar", "Em andamento", "Atrasado", "Fechado"];
/* Prime e E-SUS passam a usar as MESMAS situações do SER II */
export const STATUS_PADRAO = STATUS_SERII;

/* Cores das situações (badge/pill) */
export const COR_STATUS = {
    "A Iniciar":    { bg: "#eceff1", fg: "#546e7a", bd: "#cfd8dc" },
    "Em andamento": { bg: "#fff8e1", fg: "#ef6c00", bd: "#ffe082" },
    "Atrasado":     { bg: "#ffebee", fg: "#c62828", bd: "#ef9a9a" },
    "Fechado":      { bg: "#e8f5e9", fg: "#2e7d32", bd: "#a5d6a7" }
};

/* ============================ PRIME / E-SUS ============================== */
/* (migrado do código antigo, agora como dado e não como if/else)           */

const PRIME_ESUS_PRIMARIA_GERAL = [
    { grupo: "GERAL", acao: "REUNIÃO DE KICKOFF COM O CLIENTE PARA A APRESENTAÇÃO DO SISTEMA", responsavel: "" },
    { grupo: "GERAL", acao: "REUNIÃO DE KICKOFF COM A COORDENAÇÃO DA ATENÇÃO BÁSICA", responsavel: "" },
    { grupo: "GERAL", acao: "RECEBER LISTA DE UNIDADE DA AB PARA INICIAR IMPLANTAÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR AMBIENTE PRIME TREINAMENTO E PRODUÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "SOLICITAR INFORMAÇÕES REFERENTES A PROFISSIONAIS E EQUIPES DA UNIDADE", responsavel: "" },
    { grupo: "GERAL", acao: "SOLICITAR INFORMAÇÕES REFERENTES A AGENDA, PROFISSIONAIS E ESPECIALIDADES", responsavel: "" },
    { grupo: "GERAL", acao: "TESTAR O SISTEMA DE MENSAGERIA", responsavel: "" },
    { grupo: "GERAL", acao: "ENTREGA DO SERVIÇO DE MENSAGERIA", responsavel: "" },
    { grupo: "GERAL", acao: "DISPONIBILIZAR NÚMEROS DA MENSAGERIA PARA DIVULGAÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "SOLICITAR BANCO DE CADASTROS E-SUS", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR O LINK EXTERNO DO PRIME", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR INTEGRAÇÃO COM SER2", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR TABELA DE INSUMOS", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR LEVANTAMENTO DE UNIDADES", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR CADASTRO DE UNIDADES", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR LEVANTAMENTO DE PROFISSIONAIS", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR CADASTRO DE PROFISSIONAIS", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR LEVANTAMENTO DOS PROTOCOLOS DE ACESSO", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "REALIZAR CONFIGURAÇÃO DE PROTOCOLOS", responsavel: "" },
    { grupo: "REGULAÇÃO", acao: "INICIAR IMPLANTAÇÃO", responsavel: "" }
];

const PRIME_ESUS_PRIMARIA_UNIDADE = [
    { acao: "REALIZAR LEVANTAMENTO PRÉVIO NO CNES SOBRE A UNIDADE E EQUIPES", responsavel: "" },
    { acao: "REALIZAR VISITA TÉCNICA PARA AVALIAR INFRAESTRUTURA E NECESSIDADE DE EQUIPAMENTOS", responsavel: "" },
    { acao: "VALIDAR A ENTREGA DA UNIDADE PRONTA PARA A IMPLANTAÇÃO", responsavel: "" },
    { acao: "VALIDAR COM O CLIENTE O INÍCIO DAS ATIVIDADES NA UNIDADE", responsavel: "" },
    { acao: "INICIAR IMPLANTAÇÃO", responsavel: "" },
    { acao: "ACOMPANHAMENTO DA IMPLANTAÇÃO", responsavel: "" },
    { acao: "FINALIZAR ATIVIDADES COM REUNIÃO INTERNA E APRESENTAÇÃO DE DN DE IMPLANTAÇÃO", responsavel: "" }
];

const PRIME_ESUS_SECUNDARIA_GERAL = [
    { grupo: "GERAL", acao: "REUNIÃO DE KICKOFF COM O CLIENTE PARA A APRESENTAÇÃO DO SISTEMA", responsavel: "" },
    { grupo: "GERAL", acao: "REUNIÃO DE KICKOFF COM A COORDENAÇÃO DA ATENÇÃO ESPECIALIZADA", responsavel: "" },
    { grupo: "GERAL", acao: "RECEBER LISTA DE UNIDADES PARA INICIAR IMPLANTAÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR AMBIENTE DE TREINAMENTO E PRODUÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "SOLICITAR LISTA DE PROFISSIONAIS E ESPECIALIDADES", responsavel: "" },
    { grupo: "GERAL", acao: "REALIZAR LEVANTAMENTO DE PROCEDIMENTOS E TABELAS", responsavel: "" },
    { grupo: "GERAL", acao: "REALIZAR REUNIÃO COM A EQUIPE DE GESTÃO PARA A IMPLANTAÇÃO", responsavel: "" },
    { grupo: "GERAL", acao: "INTEGRAÇÃO DO SER II (SM-REG)", responsavel: "" },
    { grupo: "GERAL", acao: "INTEGRAÇÃO DO STOK", responsavel: "" },
    { grupo: "GERAL", acao: "CRIAÇÃO DA GRADE DE MEDICAMENTOS", responsavel: "" },
    { grupo: "GERAL", acao: "VERIFICAR INTEGRAÇÃO COM O STOK E CESTA DE MEDICAMENTOS", responsavel: "" },
    { grupo: "GERAL", acao: "REALIZAR ALINHAMENTO COM A GESTÃO PARA PRIORIZAÇÃO DAS UNIDADES", responsavel: "" }
];

const PRIME_ESUS_SECUNDARIA_UNIDADE = [
    { acao: "REALIZAR LEVANTAMENTO PRÉVIO NO CNES SOBRE A UNIDADE", responsavel: "" },
    { acao: "ABRIR TAREFA PARA CONFIGURAÇÕES DA INTEGRAÇÃO (PRIME X SER II)", responsavel: "" },
    { acao: "RECEBER DADOS PARA INTEGRAÇÃO (PRIME X SER II)", responsavel: "" },
    { acao: "REALIZAR CONFIGURAÇÃO DA INTEGRAÇÃO (PRIME X SER II)", responsavel: "" },
    { acao: "REALIZAR VISITA TÉCNICA PARA AVALIAR INFRAESTRUTURA E NECESSIDADE DE EQUIPAMENTOS", responsavel: "" },
    { acao: "SOLICITAR INFORMAÇÕES REFERENTES A PROFISSIONAIS DA UNIDADE", responsavel: "" },
    { acao: "RECEBER INFORMAÇÕES REFERENTES A PROFISSIONAIS DA UNIDADE", responsavel: "" },
    { acao: "VALIDAR EM CONJUNTO COM O CLIENTE INFORMAÇÕES ENTREGUES X CNES", responsavel: "" },
    { acao: "VALIDAR A ENTREGA DA UNIDADE PRONTA PARA A IMPLANTAÇÃO", responsavel: "" },
    { acao: "VALIDAR COM O CLIENTE O INÍCIO DAS ATIVIDADES NA UNIDADE", responsavel: "" },
    { acao: "INICIAR IMPLANTAÇÃO", responsavel: "" },
    { acao: "ACOMPANHAMENTO DA IMPLANTAÇÃO", responsavel: "" },
    { acao: "FINALIZAR ATIVIDADES COM REUNIÃO INTERNA E APRESENTAÇÃO DE DN DE IMPLANTAÇÃO", responsavel: "" }
];

/* =============================== SER II ================================= */
/* Base extraída da planilha PLANO_AÇÃO_Paraíba (DN-102).                   */
/* Compartilhada pelos módulos Ambulatório e Internação.                    */

const SER2_BASE_GERAL = [
    { grupo: "GERAL", acao: "REALIZAR REUNIÃO DE KICK OFF", responsavel: "Equipe ECO" },

    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "PREPARAR O SERVIDOR DE APLICAÇÃO / BANCO", responsavel: "" },
    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "INSTALAR OS AMBIENTES (APLICAÇÃO / BANCO DE DADOS)", responsavel: "" },
    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "DISPONIBILIZAR ACESSO AOS SISTEMAS PARA VALIDAÇÃO", responsavel: "" },
    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "VALIDAR AMBIENTES INSTALADOS", responsavel: "" },
    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "SOLICITAR LINK EXTERNO", responsavel: "" },
    { grupo: "PREPARAÇÃO DE SERVIDORES/AMBIENTE", acao: "DISPONIBILIZAR LINK EXTERNO", responsavel: "" },

    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE PROFISSIONAIS", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE UNIDADES", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE LEITOS", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER CONTRATOS DE PRESTADORES", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DAS ESPECIALIDADES", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE EXAMES DE IMAGEM", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE EXAMES LABORATORIAIS", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DE EXAMES DE DIAGNOSE", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER LISTA DOS PROTOCOLOS", responsavel: "" },
    { grupo: "SOLICITAÇÃO DE INFORMAÇÕES", acao: "FORNECER FLUXO REGULATÓRIO", responsavel: "" },

    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR A CENTRAL DE REGULAÇÃO ESTADUAL", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR AS CENTRAIS DE REGULAÇÃO REGIONAL", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE PROFISSIONAIS", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE UNIDADES", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE LEITOS", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR CONTRATOS DE PRESTADORES", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DAS ESPECIALIDADES", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE EXAMES DE IMAGEM", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE EXAMES LABORATORIAIS", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DE EXAMES DE DIAGNOSE", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CADASTRAR LISTA DOS PROTOCOLOS", responsavel: "" },
    { grupo: "CADASTRAMENTO DE INFORMAÇÕES", acao: "CRIAR FLUXO REGULATÓRIO", responsavel: "" }
];

/* Bloco por unidade do SER II (encerramento/implantação assistida).        */
/* A linha de implantação assistida nomeia o módulo.                        */
const ser2UnidadeComModulo = (modulo) => ([
    { acao: "VERIFICAR INFRAESTRUTURA DA UNIDADE (PONTOS LÓGICOS E ELÉTRICOS) DE TODOS OS SETORES CONTEMPLADOS", responsavel: "" },
    { acao: "PARAMETRIZAR O AMBIENTE DE PRODUÇÃO", responsavel: "" },
    { acao: "REALIZAR REUNIÃO COM A DIREÇÃO PARA APRESENTAÇÃO DO SISTEMA E ETAPAS DA IMPLANTAÇÃO", responsavel: "" },
    { acao: `REALIZAR IMPLANTAÇÃO ASSISTIDA - SER II: MÓDULO ${modulo.toUpperCase()}`, responsavel: "" },
    { acao: "VALIDAR ASSINATURAS DO TERMO DE ACEITE DA IMPLANTAÇÃO", responsavel: "" },
    { acao: "REALIZAR REUNIÃO FINAL DE AVALIAÇÃO DA IMPLANTAÇÃO", responsavel: "" }
]);

/* ============================ LISTA FINAL =============================== */

export const TEMPLATES = [
    {
        id: "prime",
        match: ["prime"],
        modulo: null,
        precisaSubTipo: true,
        tituloSugerido: "IMPLANTAÇÃO DO PRONTUÁRIO ELETRÔNICO PRIME SAÚDE",
        statusOptions: STATUS_SERII,
        subtipos: {
            "Atenção Primária":   { gerais: PRIME_ESUS_PRIMARIA_GERAL,   unidade: PRIME_ESUS_PRIMARIA_UNIDADE },
            "Atenção Secundária": { gerais: PRIME_ESUS_SECUNDARIA_GERAL, unidade: PRIME_ESUS_SECUNDARIA_UNIDADE }
        }
    },
    {
        id: "e-sus",
        match: ["e-sus", "esus"],
        modulo: null,
        precisaSubTipo: true,
        tituloSugerido: "IMPLANTAÇÃO DO PRONTUÁRIO ELETRÔNICO E-SUS",
        statusOptions: STATUS_SERII,
        subtipos: {
            "Atenção Primária":   { gerais: PRIME_ESUS_PRIMARIA_GERAL,   unidade: PRIME_ESUS_PRIMARIA_UNIDADE },
            "Atenção Secundária": { gerais: PRIME_ESUS_SECUNDARIA_GERAL, unidade: PRIME_ESUS_SECUNDARIA_UNIDADE }
        }
    },
    {
        id: "ser2-ambulatorio",
        match: ["ambulat"],            // ex.: produto "SER II - Ambulatório"
        modulo: "Ambulatório",
        precisaSubTipo: false,
        tituloSugerido: "IMPLANTAÇÃO SER II - MÓDULO AMBULATÓRIO",
        statusOptions: STATUS_SERII,
        etapasGerais: SER2_BASE_GERAL,
        etapasUnidade: ser2UnidadeComModulo("Ambulatório")
    },
    {
        id: "ser2-internacao",
        match: ["interna"],            // ex.: produto "SER II - Internação"
        modulo: "Internação",
        precisaSubTipo: false,
        tituloSugerido: "IMPLANTAÇÃO SER II - MÓDULO INTERNAÇÃO",
        statusOptions: STATUS_SERII,
        etapasGerais: SER2_BASE_GERAL,
        etapasUnidade: ser2UnidadeComModulo("Internação")
    }
];

/* Resolve o template a partir do nome do produto cadastrado. */
export function resolverTemplate(nomeProduto) {
    if (!nomeProduto) return null;
    const n = nomeProduto.toLowerCase();
    return TEMPLATES.find(t => t.match.some(m => n.includes(m))) || null;
}

/* Monta as etapas (gerais + por unidade) já com o módulo carimbado. */
export function montarEtapas(template, subTipo, idsUnidades = []) {
    let gerais = template.etapasGerais || [];
    let unidade = template.etapasUnidade || [];
    if (template.precisaSubTipo && template.subtipos && template.subtipos[subTipo]) {
        gerais = template.subtipos[subTipo].gerais;
        unidade = template.subtipos[subTipo].unidade;
    }
    const carimbar = (e) => ({ ...e, modulo: template.modulo || null });
    return {
        etapas_padrao: gerais.map(carimbar),
        etapas_unidade: unidade.map(carimbar)
    };
}

/* Acha o template pelo nome do módulo (ex.: "Ambulatório"). */
export function templatePorModulo(modulo) {
    return TEMPLATES.find(t => t.modulo === modulo) || null;
}

/* Etapas de unidade já carimbadas, para CADA módulo do plano.
 * Usado ao incluir uma nova unidade num plano existente.
 * modulosDoPlano: array de strings (pode conter null p/ planos sem módulo). */
export function etapasUnidadePorModulos(modulosDoPlano, subTipo) {
    const out = [];
    modulosDoPlano.forEach(mod => {
        const tpl = templatePorModulo(mod);
        if (tpl) {
            let unidade = tpl.etapasUnidade || [];
            if (tpl.precisaSubTipo && tpl.subtipos?.[subTipo]) unidade = tpl.subtipos[subTipo].unidade;
            unidade.forEach(e => out.push({ ...e, modulo: tpl.modulo || null }));
        }
    });
    return out;
}