/* Agrupamento em memória das linhas de escala: projeto > unidade > (implantador | data). */

/** Percorre as linhas criando os níveis projeto > unidade e entrega o nível da unidade a quem preenche a folha. */
function agruparPorProjetoEUnidade(linhas, preencherUnidade) {
    const agrupado = {};
    for (const linha of linhas) {
        const { nome_projeto: projeto, nome_unidade: unidade } = linha;
        if (!agrupado[projeto]) agrupado[projeto] = {};
        if (!agrupado[projeto][unidade]) agrupado[projeto][unidade] = {};
        preencherUnidade(agrupado[projeto][unidade], linha);
    }
    return agrupado;
}

/** { projeto -> { unidade -> { implantador -> [datas] } } } */
function agruparPorImplantador(linhas) {
    return agruparPorProjetoEUnidade(linhas, (unidade, { nome_implantador: implantador, data_fmt: data }) => {
        if (!unidade[implantador]) unidade[implantador] = [];
        unidade[implantador].push(data);
    });
}

/** { projeto -> { unidade -> { data -> [implantadores] } } } */
function agruparPorData(linhas) {
    return agruparPorProjetoEUnidade(linhas, (unidade, { nome_implantador: implantador, data_fmt: data }) => {
        if (!unidade[data]) unidade[data] = [];
        unidade[data].push(implantador);
    });
}

module.exports = { agruparPorImplantador, agruparPorData };
