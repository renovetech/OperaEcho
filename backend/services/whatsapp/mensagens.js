/* services/whatsapp/mensagens.js - modelos padrão das mensagens ao colaborador.
 * Editáveis em Parâmetros > WhatsApp (NULL no banco = padrão abaixo).
 * Mesma estrutura do Renove Saúde: variáveis {assim}; linha cujas variáveis
 * ficam todas vazias é omitida. *texto* = negrito, _texto_ = itálico. */

const RODAPE = '_Mensagem automática - Opera Echo._';

const ESCALA_SEMANAL = [
    'Olá, *{primeiroNome}*!',
    '',
    'Segue a sua *escala da semana*',
    '*Módulo:* {modulo}',
    '*Período:* {periodo}',
    '',
    '{escala}',
    '',
    'A escala pode sofrer ajustes durante a semana. Se houver mudança, você será avisado por aqui.',
    '',
    RODAPE
].join('\n');

const ESCALA_ALTERACAO = [
    'Olá, *{primeiroNome}*!',
    '',
    'A sua *escala foi alterada*. Vale o que está abaixo:',
    '*Módulo:* {modulo}',
    '',
    '{alteracoes}',
    '',
    '*Alterado por:* {responsavel}',
    '',
    RODAPE
].join('\n');

const FERIAS_APROVADA = [
    'Olá, *{primeiroNome}*!',
    '',
    'Suas *férias foram aprovadas*',
    '',
    '*Início:* {inicio}',
    '*Retorno previsto:* {retorno}',
    '*Dias:* {dias}',
    '*Tipo:* {tipo}',
    '*Período aquisitivo:* {periodoAquisitivo}',
    '*Aprovado por:* {responsavel}',
    '',
    'Bom descanso!',
    '',
    RODAPE
].join('\n');

const FERIAS_RECUSADA = [
    'Olá, *{primeiroNome}*.',
    '',
    'Sua solicitação de *férias não foi aprovada*',
    '',
    '*Período solicitado:* {inicio} a {fim}',
    '*Tipo:* {tipo}',
    '*Analisado por:* {responsavel}',
    '',
    'Procure sua liderança para combinar um novo período.',
    '',
    RODAPE
].join('\n');

const CODIGO_SENHA = [
    '*Opera Echo* - redefinição de senha',
    '',
    'Seu código é: *{codigo}*',
    '',
    'Ele vale por {validade} minutos. Não compartilhe este código com ninguém - a equipe do Opera Echo nunca pede seu código.',
    'Se você não pediu a redefinição, ignore esta mensagem.'
].join('\n');

const TESTE = [
    '*Opera Echo* - teste de integração',
    '',
    'Se você recebeu esta mensagem, o WhatsApp do sistema está funcionando.',
    '*Disparado por:* {responsavel}'
].join('\n');

/** Evento -> coluna em tab_whatsapp_config, texto padrão e variáveis disponíveis. */
const TEXTOS = {
    ESCALA_SEMANAL: { coluna: 'msg_escala_semanal', padrao: ESCALA_SEMANAL, variaveis: ['nome', 'primeiroNome', 'modulo', 'periodo', 'escala'] },
    ESCALA_ALTERACAO: { coluna: 'msg_escala_alteracao', padrao: ESCALA_ALTERACAO, variaveis: ['nome', 'primeiroNome', 'modulo', 'alteracoes', 'responsavel'] },
    FERIAS_APROVADA: { coluna: 'msg_ferias_aprovada', padrao: FERIAS_APROVADA, variaveis: ['nome', 'primeiroNome', 'inicio', 'fim', 'retorno', 'dias', 'tipo', 'periodoAquisitivo', 'responsavel'] },
    FERIAS_RECUSADA: { coluna: 'msg_ferias_recusada', padrao: FERIAS_RECUSADA, variaveis: ['nome', 'primeiroNome', 'inicio', 'fim', 'dias', 'tipo', 'periodoAquisitivo', 'responsavel'] },
    CODIGO_SENHA: { coluna: 'msg_codigo_senha', padrao: CODIGO_SENHA, variaveis: ['primeiroNome', 'codigo', 'validade'] }
};

/** Substitui {variavel}; omite a linha cujas variáveis estão todas vazias. */
function renderizar(modelo, vars) {
    return String(modelo || '').split('\n').map(linha => {
        const nomes = [...linha.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
        if (nomes.length && nomes.every(n => vars[n] === undefined || vars[n] === null || String(vars[n]).trim() === '')) return null;
        return linha.replace(/\{(\w+)\}/g, (_, n) => (vars[n] === undefined || vars[n] === null ? '' : String(vars[n])));
    }).filter(l => l !== null).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Texto configurado (ou padrão) do evento. */
function modeloDoEvento(config, evento) {
    const t = TEXTOS[evento];
    if (!t) return TESTE;
    const v = config && config[t.coluna];
    return v && String(v).trim() ? v : t.padrao;
}

module.exports = { TEXTOS, TESTE, renderizar, modeloDoEvento };
