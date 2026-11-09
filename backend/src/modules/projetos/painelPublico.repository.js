/* SQL do painel público do projeto (sem login, somente leitura). */
const { connectToDb, sql } = require('../../config/database');

const TAMANHO_SLUG = 60;

/** Projeto ativo com o painel público habilitado para o endereço; nulo se não houver. */
async function projetoPublico(pool, slug) {
    const resultado = await pool.request().input('s', sql.VarChar(TAMANHO_SLUG), slug).query(`
        SELECT id_projeto, nome_projeto FROM tab_projetos
        WHERE slug_publico = @s AND painel_publico = 1 AND ativo = 1`);
    return resultado.recordset[0] || null;
}

/** Dados brutos do painel: regiões, unidades (com produtos e tipos) e atividades das duas origens. */
async function dadosDoPainel(pool, idProjeto) {
    const pedido = () => pool.request().input('p', sql.Int, idProjeto);

    const [regioes, unidades, atividades] = await Promise.all([
        pedido().query(`
            SELECT id_macro, nome_macro, sigla, cor, ordem FROM tab_macro_regioes
            WHERE id_projeto = @p AND ativo = 1 ORDER BY ordem, nome_macro;
            SELECT mi.id_micro, mi.id_macro, mi.nome_micro, mi.sigla, mi.cor, mi.ordem
            FROM tab_micro_regioes mi JOIN tab_macro_regioes m ON m.id_macro = mi.id_macro
            WHERE m.id_projeto = @p AND m.ativo = 1 AND mi.ativo = 1 ORDER BY mi.ordem, mi.nome_micro;`),
        pedido().query(`
            SELECT u.id_unidade, u.nome_unidade, u.cnes, u.id_cidade, c.nome_cidade, e.sigla AS uf,
                   u.latitude, u.longitude, c.latitude AS lat_cidade, c.longitude AS lng_cidade,
                   u.id_macro, u.id_micro, u.id_tipo_unidade,
                   (SELECT STRING_AGG(CAST(pr.id_produto AS VARCHAR(10)), ',')
                      FROM tab_unidade_produtos up JOIN tab_produtos pr ON pr.id_produto = up.id_produto
                     WHERE up.id_unidade = u.id_unidade AND pr.ativo = 1) AS ids_produtos
            FROM tab_unidades u
            LEFT JOIN tab_cidades c ON c.id_cidade = u.id_cidade
            LEFT JOIN tab_estados e ON e.id_estado = c.id_estado
            WHERE u.id_projeto = @p AND u.ativo = 1
            ORDER BY c.nome_cidade, u.nome_unidade;
            SELECT DISTINCT pr.id_produto, pr.nome_produto
            FROM tab_unidade_produtos up
            JOIN tab_unidades u ON u.id_unidade = up.id_unidade AND u.ativo = 1 AND u.id_projeto = @p
            JOIN tab_produtos pr ON pr.id_produto = up.id_produto AND pr.ativo = 1
            ORDER BY pr.nome_produto;
            SELECT id_tipo_unidade, nome_tipo, sigla, grupo, ordem FROM tab_tipos_unidade WHERE ativo = 1 ORDER BY ordem, nome_tipo;`),
        pedido().query(`
            SELECT 'implantacao' AS origem, a.id_unidade,
                   ISNULL(a.data_inicio, a.data_atividade) AS di, ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS df,
                   a.motivos, a.produtos_trabalhados, a.tempo_gasto
            FROM tab_atividades a WHERE a.id_projeto = @p
            UNION ALL
            SELECT 'projetos', a.id_unidade,
                   ISNULL(a.data_inicio, a.data_atividade), ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)),
                   a.motivos, a.produtos_trabalhados, a.tempo_gasto
            FROM tab_proj_atividades a WHERE a.id_projeto = @p`)
    ]);

    const [macros, micros] = regioes.recordsets;
    const [listaUnidades, produtos, tipos] = unidades.recordsets;
    return { macros, micros, unidades: listaUnidades, produtos, tipos, atividades: atividades.recordset };
}

/** Endereços e nomes dos projetos com painel público ativo. */
async function listarPublicados() {
    const pool = await connectToDb();
    const resultado = await pool.request().query(`
        SELECT slug_publico AS slug, nome_projeto AS nome FROM tab_projetos
        WHERE painel_publico = 1 AND ativo = 1 AND slug_publico IS NOT NULL ORDER BY nome_projeto`);
    return resultado.recordset;
}

module.exports = { projetoPublico, dadosDoPainel, listarPublicados };
