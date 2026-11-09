/* Regras da configuração do WhatsApp (Parâmetros > WhatsApp): o que a tela mostra e o que pode ser gravado.
 * Os erros saem com a mensagem de sempre (400); o SQL fica em whatsapp.repository.js. */
const { httpErro } = require('../../middlewares/errorHandler');
const evo = require('./evolution');
const fila = require('./fila');
const { TEXTOS } = require('./mensagens');

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const URL_EVOLUTION = /^https?:\/\/[^\s]+$/i;
const NOME_INSTANCIA = /^[\w.@-]{1,100}$/;
const TAMANHO_MAXIMO_TEXTO = 2000;
const HORA_PADRAO_ESCALA = '18:00';
const ESPERA_PADRAO_ALTERACAO = 10;

const hhmm = (t) => (t instanceof Date ? `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}` : (t ? String(t).slice(0, 5) : null));
const isoData = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : (v ? String(v).slice(0, 10) : null));

/** Configuração como a tela recebe: a apikey nunca sai, só `tem_token`. */
function configParaTela(c) {
    const textos = {};
    Object.entries(TEXTOS).forEach(([ev, t]) => {
        textos[ev] = { personalizado: c[t.coluna] || '', padrao: t.padrao, variaveis: t.variaveis };
    });
    return {
        ativo: !!c.ativo, url_api: c.url_api || '', instancia: c.instancia || '', tem_token: !!c.token_acesso,
        fila: fila.parametros(c),
        eventos: {
            escala_semanal_ativa: !!c.escala_semanal_ativa, escala_semanal_dia: c.escala_semanal_dia ?? 0,
            escala_semanal_hora: hhmm(c.escala_semanal_hora) || HORA_PADRAO_ESCALA, escala_semanal_referencia: c.escala_semanal_referencia || 'PROXIMA',
            escala_semanal_ultima: isoData(c.escala_semanal_ultima),
            escala_alteracao_ativa: !!c.escala_alteracao_ativa, escala_alteracao_espera: c.escala_alteracao_espera ?? ESPERA_PADRAO_ALTERACAO,
            ferias_ativa: !!c.ferias_ativa, codigo_senha_ativa: c.codigo_senha_ativa !== false
        },
        textos,
        data_atualizacao: c.data_atualizacao || null, usuario_alteracao: c.usuario_alteracao || null
    };
}

/** Número inteiro opcional dentro da faixa; vazio vira null. */
function inteiroEntre(v, min, max, nome) {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    if (isNaN(n) || n < min || n > max) throw httpErro(400, `${nome}: valor entre ${min} e ${max}.`);
    return n;
}

async function validarConexao(b) {
    const url = String(b.url_api || '').trim();
    if (url && !URL_EVOLUTION.test(url)) throw httpErro(400, 'URL da Evolution inválida (use http:// ou https://).');
    const instancia = String(b.instancia || '').trim();
    if (instancia && !NOME_INSTANCIA.test(instancia)) throw httpErro(400, 'Nome da instância inválido.');
    if (b.ativo && (!url || !instancia || (!b.token_acesso && !(await evo.lerConfig())?.token_acesso))) {
        throw httpErro(400, 'Para ativar, informe URL, instância e apikey da Evolution.');
    }
    return { url, instancia };
}

function validarLimites(f) {
    const limiteInicial = inteiroEntre(f.limiteInicial, 1, 5000, 'Limite inicial');
    const limiteMaximo = inteiroEntre(f.limiteMaximo, 1, 20000, 'Limite máximo');
    const pausaMinima = inteiroEntre(f.pausaMinima, 1, 120, 'Pausa mínima');
    const pausaMaxima = inteiroEntre(f.pausaMaxima, 1, 300, 'Pausa máxima');
    if (pausaMinima && pausaMaxima && pausaMinima > pausaMaxima) throw httpErro(400, 'A pausa mínima não pode ser maior que a máxima.');
    if (limiteInicial && limiteMaximo && limiteInicial > limiteMaximo) throw httpErro(400, 'O limite inicial não pode passar do teto diário.');
    return { limiteInicial, limiteMaximo, pausaMinima, pausaMaxima };
}

function validarHorarios(f, ev) {
    for (const [h, nome] of [[f.horaInicio, 'Início da janela'], [f.horaFim, 'Fim da janela'], [ev.escala_semanal_hora, 'Hora da escala semanal']]) {
        if (h && !HORA.test(h)) throw httpErro(400, `${nome}: use HH:MM.`);
    }
    const d = new Date();   // hoje em Brasília (TZ do processo)
    const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (f.inicioAquecimento && (!DATA.test(f.inicioAquecimento) || f.inicioAquecimento > hoje)) throw httpErro(400, 'O início do aquecimento não pode ser futuro.');
}

/** Texto igual ao padrão (ou vazio) volta ao padrão no banco (null); os demais são gravados (até 2000 caracteres). */
function textosParaGravar(textos) {
    return Object.entries(TEXTOS).map(([evento, t]) => {
        const v = textos[evento];
        const personalizado = typeof v === 'string' && v.trim() && v.trim() !== t.padrao.trim();
        return { coluna: t.coluna, valor: personalizado ? v.slice(0, TAMANHO_MAXIMO_TEXTO) : null };
    });
}

/** Valida o corpo da gravação, na ordem de sempre, e devolve os valores prontos para o repositório. */
async function validarConfiguracao(b) {
    const ev = b.eventos || {};
    const f = b.fila || {};
    const { url, instancia } = await validarConexao(b);
    const limites = validarLimites(f);
    validarHorarios(f, ev);
    return {
        ativo: !!b.ativo, url, instancia, tokenAcesso: b.token_acesso,
        inicioAquecimento: f.inicioAquecimento || null,
        ...limites,
        crescimentoSemanal: inteiroEntre(f.crescimentoSemanal, 0, 300, 'Crescimento semanal'),
        maxPorMinuto: inteiroEntre(f.maxPorMinuto, 1, 60, 'Máximo por minuto'),
        horaInicio: f.horaInicio || null, horaFim: f.horaFim || null,
        escalaSemanalAtiva: !!ev.escala_semanal_ativa,
        escalaSemanalDia: inteiroEntre(ev.escala_semanal_dia, 0, 6, 'Dia da escala semanal') ?? 0,
        escalaSemanalHora: ev.escala_semanal_hora || HORA_PADRAO_ESCALA,
        escalaSemanalReferencia: ev.escala_semanal_referencia === 'ATUAL' ? 'ATUAL' : 'PROXIMA',
        escalaAlteracaoAtiva: !!ev.escala_alteracao_ativa,
        escalaAlteracaoEspera: inteiroEntre(ev.escala_alteracao_espera, 1, 240, 'Espera da alteração') ?? ESPERA_PADRAO_ALTERACAO,
        feriasAtiva: !!ev.ferias_ativa,
        codigoSenhaAtiva: ev.codigo_senha_ativa !== false,
        textos: textosParaGravar(b.textos || {})
    };
}

module.exports = { configParaTela, validarConfiguracao };
