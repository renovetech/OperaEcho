/* Regras das escalas, comuns aos dois módulos; o que difere vem das opções de escalas.modulos.js. */
const notificacoes = require('../whatsapp/notificacoes');
const repositorio = require('./escalas.repository');

const TURNO_PADRAO = 'NORMAL';
const TAMANHO_MAXIMO_DO_REDMINE = 30;
const TIPO_COM_REDMINE = 'TRABALHO';

// Nº do Redmine (opcional, só para TRABALHO): não aparece na escala nem em relatórios; vai apenas nas mensagens do WhatsApp.
const redmineDe = (dia) => (dia.tipo === TIPO_COM_REDMINE
    ? (String(dia.redmine || '').trim().replace(/[^\w#./-]/g, '').slice(0, TAMANHO_MAXIMO_DO_REDMINE) || null)
    : null);

const paraRegistro = (dia) => ({
    idUsuario: parseInt(dia.id_usuario),
    data: dia.data_escala,
    tipo: dia.tipo,
    idProjeto: dia.id_projeto || null,
    idUnidade: dia.id_unidade || null,
    turno: dia.turno || TURNO_PADRAO,
    redmine: redmineDe(dia),
    produtos: dia.produtos && dia.produtos.length > 0 ? dia.produtos : []
});

async function listar(modulo, consulta, escopo) {
    const idUsuario = parseInt(consulta.id_usuario) || null;
    const lotacao = { isolar: modulo.isolarNaLeitura, escopo };
    const linhas = await repositorio.listar(modulo.tabelas, { inicio: consulta.inicio, fim: consulta.fim, idUsuario }, lotacao);
    return linhas.map((item) => ({ ...item, ids_produtos: item.ids_produtos_str ? item.ids_produtos_str.split(',').map(Number) : [] }));
}

/** Só é possível escalar usuários da(s) lotação(ões) do escopo. */
async function usuariosNoEscopo(escopo, ids) {
    if (!escopo) return false;
    if (escopo.global) return true;
    if (!Array.isArray(escopo.lotacoes) || escopo.lotacoes.length === 0) return false;
    const lista = [...new Set((ids || []).map((id) => parseInt(id)).filter((id) => !isNaN(id) && id > 0))];
    if (lista.length === 0) return false;
    return await repositorio.contarForaDasLotacoes(lista, escopo.lotacoes) === 0;
}

const avisarAlteracao = (modulo, itens, idOrigem) => notificacoes.escalaAlterada(itens, modulo.moduloNotificacao, idOrigem);

async function salvarDia(modulo, dia) {
    await repositorio.regravarDias(modulo.tabelas, [paraRegistro(dia)], repositorio.PARAMETROS_DO_DIA.AVULSO);
}

async function salvarLote(modulo, dias) {
    await repositorio.regravarDias(modulo.tabelas, dias.map(paraRegistro), repositorio.PARAMETROS_DO_DIA.LOTE);
}

module.exports = { listar, usuariosNoEscopo, avisarAlteracao, salvarDia, salvarLote };
