/* SQL dos cadastros simples: projetos, produtos, tipos de unidade, cidades e motivos. */
const { connectToDb, sql } = require('../../config/database');
const { parseIntSafe } = require('../../shared/validators');

const TAMANHO_SLUG = 60;

const comoBit = (valor) => (valor === true ? 1 : 0);

/** Roda o trabalho numa transação: confirma no fim e desfaz se falhar. */
async function emTransacao(trabalho) {
    const pool = await connectToDb();
    const transacao = new sql.Transaction(pool);
    await transacao.begin();
    try {
        const resultado = await trabalho(transacao);
        await transacao.commit();
        return resultado;
    } catch (falha) {
        await transacao.rollback().catch(() => undefined);
        throw falha;
    }
}

async function lerTodas(consulta) {
    const pool = await connectToDb();
    const resultado = await pool.request().query(consulta);
    return resultado.recordset;
}

/* ---------------------------------------------------------------- projetos */
const listarProjetos = () => lerTodas('SELECT * FROM tab_projetos ORDER BY nome_projeto');

/** Nome do outro projeto que já usa o endereço público, ou nulo. */
async function projetoComEndereco(slug, idProjeto) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('s', sql.VarChar(TAMANHO_SLUG), slug).input('id', sql.Int, parseIntSafe(idProjeto) || 0)
        .query('SELECT nome_projeto FROM tab_projetos WHERE slug_publico = @s AND id_projeto <> @id');
    return resultado.recordset.length ? resultado.recordset[0].nome_projeto : null;
}

/**
 * Grava o projeto. Desabilitar o painel mantém o slug reservado ao projeto (reabilitar volta ao mesmo endereço).
 * REGRA: o status das unidades acompanha o do projeto. Não remove vínculos: lançamentos (atividades, escalas,
 * relatórios e painéis) referenciam a unidade por id e permanecem intactos.
 */
function gravarProjeto({ id_projeto: idProjeto, nome_projeto: nome, ativo, gera_lotacao: geraLotacao, publico, slug, categoria }) {
    return emTransacao(async (transacao) => {
        const ativoBit = comoBit(ativo);
        const pedido = new sql.Request(transacao)
            .input('n', sql.VarChar, nome)
            .input('a', sql.Bit, ativoBit)
            .input('gl', sql.Bit, comoBit(geraLotacao))
            .input('pp', sql.Bit, publico ? 1 : 0)
            .input('slug', sql.VarChar(TAMANHO_SLUG), slug)
            .input('cat', sql.Char(1), categoria);

        if (!idProjeto) {
            await pedido.query('INSERT INTO tab_projetos (nome_projeto, ativo, gera_lotacao, painel_publico, slug_publico, categoria) VALUES (@n, @a, @gl, @pp, @slug, @cat)');
            return;
        }
        await pedido.input('id', sql.Int, idProjeto)
            .query('UPDATE tab_projetos SET nome_projeto=@n, ativo=@a, gera_lotacao=@gl, painel_publico=@pp, slug_publico=ISNULL(@slug, slug_publico), categoria=@cat WHERE id_projeto=@id');
        await new sql.Request(transacao)
            .input('id', sql.Int, idProjeto)
            .input('a', sql.Bit, ativoBit)
            .query('UPDATE tab_unidades SET ativo=@a WHERE id_projeto=@id');
    });
}

/* ---------------------------------------------------------------- produtos */
const listarProdutos = () => lerTodas('SELECT * FROM tab_produtos ORDER BY nome_produto');
/** Produtos ativos, oferecidos como modelo opcional no Novo Plano de Ação. */
const listarProdutosParaPlanoAcao = () => lerTodas('SELECT * FROM tab_produtos WHERE ativo=1 ORDER BY nome_produto');

async function gravarProduto({ id_produto: idProduto, nome_produto: nome, ativo }) {
    const pool = await connectToDb();
    const pedido = pool.request()
        .input('n', sql.VarChar, nome)
        .input('a', sql.Bit, comoBit(ativo));

    if (idProduto) {
        await pedido.input('id', sql.Int, idProduto).query('UPDATE tab_produtos SET nome_produto=@n, ativo=@a WHERE id_produto=@id');
    } else {
        await pedido.query('INSERT INTO tab_produtos (nome_produto, ativo) VALUES (@n, @a)');
    }
}

/* ---------------------------------------------------------------- tipos, cidades e motivos */
const listarTiposDeUnidade = () => lerTodas('SELECT id_tipo_unidade, nome_tipo, sigla, grupo, descricao, ordem, ativo FROM tab_tipos_unidade ORDER BY ordem, nome_tipo');
const listarMotivos = () => lerTodas('SELECT * FROM tab_motivos');

async function listarCidadesDaUf(uf) {
    const pool = await connectToDb();
    const resultado = await pool.request().input('uf', sql.VarChar, uf)
        .query('SELECT c.* FROM tab_cidades c INNER JOIN tab_estados e ON c.id_estado = e.id_estado WHERE e.sigla = @uf ORDER BY c.nome_cidade');
    return resultado.recordset;
}

module.exports = {
    emTransacao, listarProjetos, projetoComEndereco, gravarProjeto, listarProdutos, listarProdutosParaPlanoAcao, gravarProduto,
    listarTiposDeUnidade, listarMotivos, listarCidadesDaUf
};
