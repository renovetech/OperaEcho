/* Regras dos cadastros: categoria e painel público do projeto, coordenadas e região das unidades. */
const { parseIntSafe } = require('../../shared/validators');
const { gerarSlug, validarSlug } = require('../projetos/slugPublico');
const repositorio = require('./unidades.repository');
const cadastros = require('./cadastros.repository');

const CATEGORIAS = ['A', 'B', 'C'];
const LIMITE_LATITUDE = 90;
const LIMITE_LONGITUDE = 180;
const CASAS_DA_COORDENADA = 1e6;
const FUNCOES_ISOLADAS_POR_LOTACAO = ['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'];
const MAXIMO_LINHAS_COORDENADAS = 5000;
const LINHA_DO_CABECALHO = 2; // linha 1 = cabeçalho da planilha

/** Categorias fixas (sem cadastro): A, B ou C. Devolve a categoria em maiúsculas, ou nulo se inválida. */
function categoriaDoProjeto(valor) {
    const categoria = String(valor || '').trim().toUpperCase();
    return CATEGORIAS.includes(categoria) ? categoria : null;
}

/**
 * PAINEL PÚBLICO: ao habilitar, o endereço operaecho.com/<slug> é criado automaticamente a partir do nome (ou do
 * endereço informado). Devolve { publico, slug, erro }.
 */
function painelPublicoDoProjeto(corpo) {
    const publico = corpo.painel_publico === true;
    const slug = publico ? (String(corpo.slug_publico || '').trim().toLowerCase() || gerarSlug(corpo.nome_projeto)) : null;
    return { publico, slug, erro: publico ? validarSlug(slug) : null };
}

/** Coordenada opcional: vazio => null; fora da faixa ou não numérica => NaN. */
function lerCoordenada(valor, limite) {
    if (valor === undefined || valor === null || String(valor).trim() === '') return null;
    const n = Number(String(valor).replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) > limite) return NaN;
    return Math.round(n * CASAS_DA_COORDENADA) / CASAS_DA_COORDENADA;
}

/** Latitude e longitude da unidade; devolve { latitude, longitude } ou { erro } com a mensagem para o usuário. */
function coordenadasDaUnidade(corpo) {
    const latitude = lerCoordenada(corpo.latitude, LIMITE_LATITUDE);
    const longitude = lerCoordenada(corpo.longitude, LIMITE_LONGITUDE);
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return { erro: 'Coordenadas inválidas. Latitude entre -90 e 90 e longitude entre -180 e 180.' };
    }
    if ((latitude === null) !== (longitude === null)) {
        return { erro: 'Informe latitude e longitude juntas (ou deixe as duas em branco).' };
    }
    return { latitude, longitude };
}

/** Macro/Micro região precisam pertencer ao projeto da unidade (a micro define a macro). */
async function regiaoDaUnidade(corpo) {
    let idMacro = parseIntSafe(corpo.id_macro);
    let idMicro = parseIntSafe(corpo.id_micro);
    if (idMacro || idMicro) {
        const { macro_ok: macroOk, macro_da_micro: macroDaMicro } = await repositorio.regiaoDoProjeto(corpo.id_projeto, idMacro, idMicro);
        if (!macroDaMicro) idMicro = null;
        idMacro = macroDaMicro || macroOk || null;
    }
    return { idMacro, idMicro };
}

/**
 * ISOLAMENTO POR LOTAÇÃO: vale APENAS para as funções vinculadas à lotação (Analista, Líder de Projeto, Operador),
 * idêntico ao módulo de atividades. Implantador / Coordenador de Implantação / Administrador veem todas as unidades.
 */
function isolaPorLotacao(escopo) {
    const funcao = ((escopo && escopo.nome_funcao) || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
    return FUNCOES_ISOLADAS_POR_LOTACAO.includes(funcao);
}

/** Página de unidades no formato da resposta da busca. */
async function buscarUnidades(query, escopo) {
    const { pagina = 1, limite = 10 } = query;
    const tamanho = parseInt(limite);
    const { dados, total } = await repositorio.buscar(
        { ...query, escopo, isolarPorLotacao: isolaPorLotacao(escopo) },
        { offset: (parseInt(pagina) - 1) * tamanho, limite: tamanho }
    );
    return { dados, total, paginaAtual: parseInt(pagina), totalPaginas: Math.ceil(total / tamanho) };
}

function resultadoDaLinha(linha, indice, idProjeto) {
    const cnes = String(linha.cnes ?? '').replace(/\D/g, '');
    const latitude = lerCoordenada(linha.latitude, LIMITE_LATITUDE);
    const longitude = lerCoordenada(linha.longitude, LIMITE_LONGITUDE);
    const numero = indice + LINHA_DO_CABECALHO;
    if (!cnes) return { erro: { linha: numero, cnes, status: 'ERRO', motivo: 'CNES vazio' } };
    if (latitude === null || longitude === null || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return { erro: { linha: numero, cnes, status: 'ERRO', motivo: 'Coordenada inválida' } };
    }
    return { numero, atualizacao: { cnes, latitude, longitude, idProjeto } };
}

/**
 * Importação em massa de coordenadas (planilha: CNES + latitude + longitude). Atualiza só as coordenadas; a unidade
 * é localizada pelo CNES (e projeto, se informado). Devolve o resultado linha a linha para conferência.
 */
async function importarCoordenadas(idProjetoInformado, linhas) {
    const idProjeto = parseIntSafe(idProjetoInformado);
    const resultado = [];
    await cadastros.emTransacao(async (transacao) => {
        for (const [indice, linha] of linhas.entries()) {
            const lida = resultadoDaLinha(linha, indice, idProjeto);
            if (lida.erro) { resultado.push(lida.erro); continue; }
            const { cnes } = lida.atualizacao;
            const quantidade = await repositorio.atualizarCoordenadas(transacao, lida.atualizacao);
            resultado.push(quantidade > 0
                ? { linha: lida.numero, cnes, status: 'OK', motivo: quantidade > 1 ? `${quantidade} unidades atualizadas` : '' }
                : { linha: lida.numero, cnes, status: 'ERRO', motivo: 'Unidade não encontrada' });
        }
    });
    return {
        atualizadas: resultado.filter(r => r.status === 'OK').length,
        erros: resultado.filter(r => r.status === 'ERRO').length,
        resultado
    };
}

module.exports = {
    categoriaDoProjeto, painelPublicoDoProjeto, coordenadasDaUnidade, regiaoDaUnidade, buscarUnidades, importarCoordenadas, MAXIMO_LINHAS_COORDENADAS
};
