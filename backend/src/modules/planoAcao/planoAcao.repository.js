/* SQL do cabeçalho do plano, das unidades, do histórico e da equipe disponível.
 * Funções com `pool` leem fora de transação; as com `R` (fábrica de pedidos) rodam dentro da transação. */
const { sql } = require('../../config/database');
const { iso } = require('./planoAcao.dominio');

const LIMITE_CARACTERES_HISTORICO = 500;
const LIMITE_LINHAS_HISTORICO = 500;

/** Executa o trabalho em transação; `R()` cria pedidos dentro dela. Desfaz tudo se falhar. */
async function emTransacao(pool, trabalho) {
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const resultado = await trabalho(() => new sql.Request(t));
        await t.commit();
        return resultado;
    } catch (err) { await t.rollback().catch(() => undefined); throw err; }
}

/** Cabeçalho mínimo usado para autorizar (escopo, edição e exclusão). */
async function buscarResumo(pool, idPlano) {
    const r = await pool.request().input('id', sql.Int, idPlano)
        .query('SELECT id_plano, id_projeto, status, titulo, cliente, publico, token_publico, criado_por FROM tab_plano_acao WHERE id_plano = @id');
    return r.recordset[0];
}

async function registrar(reqF, { id_plano, id_item = null, acao, campo = null, de = null, para = null, id_usuario = null }) {
    const s = (v) => (v == null ? null : String(v instanceof Date ? iso(v) : v).slice(0, LIMITE_CARACTERES_HISTORICO));
    await reqF()
        .input('p', sql.Int, id_plano).input('i', sql.Int, id_item).input('a', sql.VarChar, acao)
        .input('c', sql.VarChar, campo).input('de', sql.VarChar, s(de)).input('para', sql.VarChar, s(para))
        .input('u', sql.Int, id_usuario)
        .query(`INSERT INTO tab_plano_historico (id_plano, id_item, acao, campo, valor_anterior, valor_novo, id_usuario, data_hora)
                VALUES (@p, @i, @a, @c, @de, @para, @u, GETDATE())`);
}

async function inserirPlano(R, d) {
    const r = await R()
        .input('tit', sql.VarChar, d.titulo)
        .input('proj', sql.Int, d.idProjeto)
        .input('prod', sql.Int, d.idProduto)
        .input('sub', sql.VarChar, d.subTipo)
        .input('cli', sql.VarChar, d.cliente)
        .input('desc', sql.VarChar, d.descricao)
        .input('di', sql.Date, d.dataInicio).input('df', sql.Date, d.dataFim)
        .input('pub', sql.Bit, d.publico)
        .input('tok', sql.UniqueIdentifier, d.token)
        .input('cp', sql.Int, d.criadoPor)
        .query(`INSERT INTO tab_plano_acao (titulo, id_projeto, id_produto, sub_tipo, cliente, descricao,
                        data_inicio_prevista, data_fim_prevista, publico, token_publico, criado_por, data_criacao, data_atualizacao, status)
                    OUTPUT INSERTED.id_plano
                    VALUES (@tit, @proj, @prod, @sub, @cli, @desc, @di, @df, @pub, @tok, @cp, GETDATE(), GETDATE(), 'EM ANDAMENTO')`);
    return r.recordset[0].id_plano;
}

async function inserirUnidade(R, idPlano, idUnidade) {
    await R().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade)
        .query(`INSERT INTO tab_plano_acao_detalhes (id_plano, id_unidade, status_unidade) VALUES (@p, @u, 'A INICIAR')`);
}

/** Variante usada ao incluir uma ação: a unidade precisa já estar no plano. */
async function unidadePertenceAoPlano(pool, idPlano, idUnidade) {
    const r = await pool.request().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade)
        .query('SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u');
    return r.recordset.length > 0;
}

/** Variante usada ao adicionar uma unidade: evita duplicar. */
async function unidadeJaNoPlano(pool, idPlano, idUnidade) {
    const v = await pool.request().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade)
        .query('SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano=@p AND id_unidade=@u');
    return v.recordset.length > 0;
}

async function buscarNomeUnidade(R, idUnidade) {
    const rn = await R().input('u', sql.Int, idUnidade).query('SELECT nome_unidade FROM tab_unidades WHERE id_unidade = @u');
    return rn.recordset[0] ? rn.recordset[0].nome_unidade : idUnidade;
}

async function resumirUnidade(pool, idPlano, idUnidade) {
    const r = await pool.request().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade).query(`
        SELECT COUNT(*) AS itens,
               SUM(CASE WHEN status <> 'A Iniciar' THEN 1 ELSE 0 END) AS iniciados,
               (SELECT COUNT(*) FROM tab_plano_apontamentos a JOIN tab_plano_itens i2 ON i2.id_item = a.id_item
                 WHERE i2.id_plano = @p AND i2.id_unidade = @u) AS apontamentos
        FROM tab_plano_itens WHERE id_plano = @p AND id_unidade = @u`);
    return r.recordset[0];
}

async function excluirUnidade(R, idPlano, idUnidade) {
    await R().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade).query(`
            DELETE a FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE i.id_plano = @p AND i.id_unidade = @u;
            DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano = @p AND i.id_unidade = @u;
            DELETE FROM tab_plano_itens WHERE id_plano = @p AND id_unidade = @u;
            DELETE FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u;`);
}

async function contarItensAbertos(pool, idPlano) {
    const r = await pool.request().input('p', sql.Int, idPlano)
        .query(`SELECT COUNT(*) AS n FROM tab_plano_itens WHERE id_plano = @p AND status NOT IN ('Fechado','Concluído','Concluido')`);
    return r.recordset[0].n;
}

async function marcarEncerrado(R, idPlano, justificativa) {
    await R().input('id', sql.Int, idPlano).input('j', sql.VarChar, justificativa)
        .query(`UPDATE tab_plano_acao SET status='ENCERRADO', data_encerramento = GETDATE(), justificativa_encerramento = @j, data_atualizacao = GETDATE() WHERE id_plano=@id`);
}

async function marcarReaberto(R, idPlano) {
    await R().input('id', sql.Int, idPlano)
        .query(`UPDATE tab_plano_acao SET status='EM ANDAMENTO', data_encerramento = NULL, data_atualizacao = GETDATE() WHERE id_plano=@id`);
}

async function buscarCompleto(pool, idPlano) {
    const r = await pool.request().input('id', sql.Int, idPlano).query('SELECT * FROM tab_plano_acao WHERE id_plano = @id');
    return r.recordset[0];
}

async function atualizarDados(R, idPlano, novo) {
    await R().input('id', sql.Int, idPlano).input('tit', sql.VarChar, novo.titulo).input('cli', sql.VarChar, novo.cliente)
        .input('desc', sql.VarChar, novo.descricao).input('di', sql.Date, novo.data_inicio_prevista).input('df', sql.Date, novo.data_fim_prevista)
        .query(`UPDATE tab_plano_acao SET titulo=@tit, cliente=@cli, descricao=@desc, data_inicio_prevista=@di,
                    data_fim_prevista=@df, data_atualizacao=GETDATE() WHERE id_plano=@id`);
}

async function atualizarPublicacao(pool, idPlano, publicar, token) {
    await pool.request().input('id', sql.Int, idPlano).input('pub', sql.Bit, publicar).input('tok', sql.UniqueIdentifier, token || null)
        .query('UPDATE tab_plano_acao SET publico = @pub, token_publico = @tok, data_atualizacao = GETDATE() WHERE id_plano = @id');
}

async function tocarPlano(R, idPlano) {
    await R().input('p', sql.Int, idPlano).query('UPDATE tab_plano_acao SET data_atualizacao = GETDATE() WHERE id_plano = @p');
}

async function excluirPlano(R, idPlano) {
    await R().input('id', sql.Int, idPlano)
        .query(`DELETE FROM tab_plano_apontamentos WHERE id_plano=@id;
                    DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano=@id;
                    DELETE FROM tab_plano_historico WHERE id_plano=@id;
                    DELETE FROM tab_plano_itens WHERE id_plano=@id;
                    DELETE FROM tab_plano_acao_detalhes WHERE id_plano=@id;
                    DELETE FROM tab_plano_acao WHERE id_plano=@id`);
}

async function listarHistorico(pool, idPlano) {
    const r = await pool.request().input('p', sql.Int, idPlano).query(`
        SELECT TOP ${LIMITE_LINHAS_HISTORICO} h.id_historico, h.id_item, i.descricao AS item, h.acao, h.campo, h.valor_anterior, h.valor_novo,
               h.data_hora, us.nome_completo AS usuario
        FROM tab_plano_historico h
        LEFT JOIN tab_plano_itens i ON i.id_item = h.id_item
        LEFT JOIN tab_usuarios us ON us.id_usuario = h.id_usuario
        WHERE h.id_plano = @p
        ORDER BY h.data_hora DESC, h.id_historico DESC`);
    return r.recordset;
}

async function listarEquipeDisponivel(pool, idPlano) {
    // Todos os usuários cadastrados (ativos primeiro).
    const r = await pool.request().input('p', sql.Int, idPlano).query(`
        SELECT u.id_usuario, u.nome_completo, f.nome_funcao, u.ativo,
               CASE WHEN u.id_lotacao = pl.id_projeto THEN 1 ELSE 0 END AS da_lotacao
        FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON f.id_funcao = u.id_funcao
        CROSS JOIN (SELECT id_projeto FROM tab_plano_acao WHERE id_plano = @p) pl
        WHERE u.nome_completo IS NOT NULL AND LTRIM(RTRIM(u.nome_completo)) <> ''
        ORDER BY u.ativo DESC, u.nome_completo`);
    return r.recordset;
}

/** As quatro leituras do detalhe, disparadas juntas. Devolve { cabecalho, unidades, itens, equipe } (linhas). */
async function lerDetalhe(pool, idPlano) {
    const [h, d, e, eq] = await Promise.all([
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT p.*, pj.nome_projeto, pr.nome_produto, uc.nome_completo AS criado_por_nome
            FROM tab_plano_acao p
            LEFT JOIN tab_projetos pj ON p.id_projeto = pj.id_projeto
            LEFT JOIN tab_produtos pr ON p.id_produto = pr.id_produto
            LEFT JOIN tab_usuarios uc ON uc.id_usuario = p.criado_por
            WHERE p.id_plano = @id`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT d.*, u.nome_unidade
            FROM tab_plano_acao_detalhes d
            JOIN tab_unidades u ON d.id_unidade = u.id_unidade
            WHERE id_plano = @id
            ORDER BY u.nome_unidade`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT * FROM tab_plano_itens
            WHERE id_plano = @id
            ORDER BY CASE WHEN modulo IS NULL THEN 0 ELSE 1 END, modulo, ISNULL(ordem, 0), id_item`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT e.id_item, e.id_usuario, us.nome_completo
            FROM tab_plano_item_equipe e
            JOIN tab_plano_itens i ON i.id_item = e.id_item
            JOIN tab_usuarios us ON us.id_usuario = e.id_usuario
            WHERE i.id_plano = @id`)
    ]);
    return { cabecalho: h.recordset[0], unidades: d.recordset, itens: e.recordset, equipe: eq.recordset };
}

module.exports = {
    emTransacao, buscarResumo, registrar, inserirPlano, inserirUnidade, unidadePertenceAoPlano, unidadeJaNoPlano, buscarNomeUnidade,
    resumirUnidade, excluirUnidade, contarItensAbertos, marcarEncerrado, marcarReaberto, buscarCompleto, atualizarDados, atualizarPublicacao,
    tocarPlano, excluirPlano, listarHistorico, listarEquipeDisponivel, lerDetalhe
};
