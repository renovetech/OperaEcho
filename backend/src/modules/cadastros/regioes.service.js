/* Regras das Macro e Micro Regiões: cada projeto tem a sua nomenclatura; a macro pertence ao projeto e a micro
 * pertence à macro. A unidade (do mesmo projeto) é vinculada à macro/micro. */
const { httpErro } = require('../../middlewares/errorHandler');
const { parseIntSafe } = require('../../shared/validators');
const repositorio = require('./regioes.repository');

const COR = /^#[0-9a-f]{6}$/i;
const MAXIMO_NOME = 120;
const MAXIMO_SIGLA = 20;
const MAXIMO_UNIDADES_POR_ENVIO = 5000;

const corValida = (cor) => (COR.test(String(cor || '')) ? cor : null);
const texto = (valor, tamanho) => String(valor ?? '').trim().slice(0, tamanho);

/** Campos comuns da macro e da micro, já saneados. */
const camposDaRegiao = (corpo) => ({
    sigla: texto(corpo.sigla, MAXIMO_SIGLA) || null,
    cor: corValida(corpo.cor),
    ordem: parseIntSafe(corpo.ordem) || 0,
    ativo: corpo.ativo === false ? 0 : 1
});

/** Monta a árvore: cada macro com as suas micros. */
async function arvoreDoProjeto(idProjeto) {
    const { macros, micros } = await repositorio.arvoreDoProjeto(idProjeto);
    return macros.map(m => ({ ...m, micros: micros.filter(x => x.id_macro === m.id_macro) }));
}

async function salvarMacro(corpo) {
    const idProjeto = parseIntSafe(corpo.id_projeto);
    const nome = texto(corpo.nome_macro, MAXIMO_NOME);
    if (!idProjeto || !nome) throw httpErro(400, 'Projeto e nome da macro região são obrigatórios.');

    const idMacro = parseIntSafe(corpo.id_macro);
    if (await repositorio.existeMacroComNome(idProjeto, nome, idMacro)) throw httpErro(400, 'Já existe uma macro região com esse nome neste projeto.');

    await repositorio.gravarMacro({ emEdicao: Boolean(corpo.id_macro), idMacro, idProjeto, nome, ...camposDaRegiao(corpo) });
}

async function excluirMacro(idMacro) {
    const { unidades, micros } = await repositorio.usoDaMacro(idMacro);
    if (unidades || micros) {
        throw httpErro(400, `Não é possível excluir: a macro possui ${micros} micro região(ões) e ${unidades} unidade(s) vinculada(s). Inative-a ou remova os vínculos.`);
    }
    await repositorio.excluirMacro(idMacro);
}

async function salvarMicro(corpo) {
    const idMacro = parseIntSafe(corpo.id_macro);
    const nome = texto(corpo.nome_micro, MAXIMO_NOME);
    if (!idMacro || !nome) throw httpErro(400, 'Macro região e nome da micro região são obrigatórios.');

    const idMicro = parseIntSafe(corpo.id_micro);
    if (await repositorio.existeMicroComNome(idMacro, nome, idMicro)) throw httpErro(400, 'Já existe uma micro região com esse nome nesta macro.');

    await repositorio.gravarMicro({ emEdicao: Boolean(corpo.id_micro), idMicro, idMacro, nome, ...camposDaRegiao(corpo) });
}

async function excluirMicro(idMicro) {
    const unidades = await repositorio.unidadesDaMicro(idMicro);
    if (unidades) throw httpErro(400, `Não é possível excluir: ${unidades} unidade(s) vinculada(s). Inative-a ou remova os vínculos.`);
    await repositorio.excluirMicro(idMicro);
}

/** Vínculo da unidade: a micro define a macro; macro que não é do projeto zera os dois. */
function vinculoValido(item, macros, macroDaMicro) {
    let idMicro = parseIntSafe(item.id_micro) || null;
    let idMacro = parseIntSafe(item.id_macro) || null;
    if (idMicro && macroDaMicro.has(idMicro)) idMacro = macroDaMicro.get(idMicro);
    else idMicro = null;
    if (idMacro && !macros.has(idMacro)) { idMacro = null; idMicro = null; }
    return { idUnidade: parseIntSafe(item.id_unidade), idMacro, idMicro };
}

/** Vincula as unidades do projeto às regiões. Devolve a quantidade atualizada. */
async function vincularUnidades(corpo) {
    const idProjeto = parseIntSafe(corpo.id_projeto);
    const itens = corpo.itens;
    if (!idProjeto || !Array.isArray(itens) || !itens.length) throw httpErro(400, 'Nada para salvar.');
    if (itens.length > MAXIMO_UNIDADES_POR_ENVIO) throw httpErro(400, `Limite de ${MAXIMO_UNIDADES_POR_ENVIO} unidades por envio.`);

    const validas = await repositorio.regioesValidas(idProjeto);
    const macros = new Set(validas.map(x => x.id_macro));
    const macroDaMicro = new Map(validas.filter(x => x.id_micro).map(x => [x.id_micro, x.id_macro]));

    const vinculos = itens.map(item => vinculoValido(item, macros, macroDaMicro)).filter(v => v.idUnidade);
    return repositorio.vincularUnidades(idProjeto, vinculos);
}

module.exports = { arvoreDoProjeto, salvarMacro, excluirMacro, salvarMicro, excluirMicro, vincularUnidades };
