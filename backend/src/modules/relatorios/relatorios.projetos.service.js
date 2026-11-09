/* Combinação em memória dos dados de projetos ativos e do mapa de unidades. */
const { connectToDb } = require('../../config/database');
const repositorio = require('./relatorios.projetos.repository');

const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEPARADOR_IDS = ',';
const SEPARADOR_NOMES = '||';

const mapaPorProjeto = (linhas, campo) => new Map(linhas.map((l) => [l.id_projeto, l[campo]]));

async function contarAtividades(pool, tabela, comPeriodo, dataInicio, dataFim) {
    if (!comPeriodo) return new Map();
    return mapaPorProjeto(await repositorio.atividadesPorProjeto(pool, tabela, dataInicio, dataFim), 'qtd');
}

function resumirProjeto(projeto, dados) {
    const { unidadesPorProjeto, rSiglas, ultimaPorProjeto, implantacao, doProjetos } = dados;
    const unidades = unidadesPorProjeto.get(projeto.id_projeto);
    const siglas = rSiglas.recordset.filter((l) => l.id_projeto === projeto.id_projeto).map((l) => l.sigla);
    return {
        ...projeto,
        unidades_ativas: unidades?.ativas ?? 0,
        unidades_inativas: unidades?.inativas ?? 0,
        unidades_georref: unidades?.georref ?? 0,
        municipios: unidades?.municipios ?? 0,
        ufs: siglas.length ? siglas.join(', ') : null,
        atividades_implantacao: implantacao.get(projeto.id_projeto) ?? 0,
        atividades_projetos: doProjetos.get(projeto.id_projeto) ?? 0,
        ultima_atividade: ultimaPorProjeto.get(projeto.id_projeto) ?? null
    };
}

/** Resumo por projeto: unidades, municípios, UFs, produtos e movimento de atividades no período. */
async function projetosAtivos(req, query) {
    const { dataInicio, dataFim } = query;
    const pool = await connectToDb();
    const comPeriodo = FORMATO_DATA.test(String(dataInicio || '')) && FORMATO_DATA.test(String(dataFim || ''));
    const lista = await repositorio.listarProjetosAtivos(pool, req, query);

    const [rUnidades, rSiglas, rUltima, implantacao, doProjetos] = await Promise.all([
        repositorio.totaisDeUnidades(pool),
        repositorio.siglasDosEstados(pool),
        repositorio.ultimaAtividadePorProjeto(pool),
        contarAtividades(pool, 'tab_atividades', comPeriodo, dataInicio, dataFim),
        contarAtividades(pool, 'tab_proj_atividades', comPeriodo, dataInicio, dataFim)
    ]);
    const dados = {
        unidadesPorProjeto: new Map(rUnidades.recordset.map((l) => [l.id_projeto, l])),
        rSiglas,
        ultimaPorProjeto: mapaPorProjeto(rUltima.recordset, 'data'),
        implantacao,
        doProjetos
    };
    const projetos = lista.map((p) => resumirProjeto(p, dados));

    const ids = projetos.map((p) => p.id_projeto);
    const produtos = ids.length ? await repositorio.produtosDosProjetos(pool, ids) : [];

    return projetos.map((p) => ({
        ...p,
        produtos: produtos.filter((x) => x.id_projeto === p.id_projeto)
            .map(({ id_produto: idProduto, nome_produto: nomeProduto, unidades }) => ({ id_produto: idProduto, nome_produto: nomeProduto, unidades }))
    }));
}

/** Sem coordenada própria, a unidade usa o centro do município e é marcada como aproximada. */
function montarUnidadeDoMapa({ ids_produtos: idsProdutos, nomes_produtos: nomesProdutos, lat_cidade: latCidade, lng_cidade: lngCidade, ...u }) {
    const temPropria = u.latitude !== null && u.longitude !== null;
    const ids = idsProdutos ? idsProdutos.split(SEPARADOR_IDS).map(Number) : [];
    const nomes = nomesProdutos ? nomesProdutos.split(SEPARADOR_NOMES) : [];
    return {
        ...u,
        latitude: temPropria ? Number(u.latitude) : (latCidade !== null ? Number(latCidade) : null),
        longitude: temPropria ? Number(u.longitude) : (lngCidade !== null ? Number(lngCidade) : null),
        aproximada: !temPropria,
        produtos: ids.map((id, i) => ({ id_produto: id, nome_produto: nomes[i] || '' }))
    };
}

async function mapaUnidades(req, filtros) {
    const linhas = await repositorio.listarUnidadesDoMapa(req, filtros);
    return linhas.map(montarUnidadeDoMapa);
}

module.exports = { projetosAtivos, mapaUnidades };
