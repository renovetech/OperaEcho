/* SQL da ficha completa de um procedimento SIGTAP (todas as abas do DATASUS + compatibilidades + histórico). */
const { connectToDb, sql } = require('../../config/database');
const { P } = require('./sigtap.filtros');

const PJ = (alias, col) => `LEFT JOIN ${P}tb_procedimento ${alias} ON ${alias}.competencia = x.competencia AND ${alias}.co_procedimento = x.${col}`;

const SQL_BASE = `
        SELECT p.*, g.no_grupo, sg.no_sub_grupo, fo.no_forma_organizacao, f.no_financiamento, rb.no_rubrica, d.ds_procedimento
        FROM ${P}tb_procedimento p
        LEFT JOIN ${P}tb_grupo g ON g.competencia = p.competencia AND g.co_grupo = LEFT(p.co_procedimento, 2)
        LEFT JOIN ${P}tb_sub_grupo sg ON sg.competencia = p.competencia AND sg.co_grupo + sg.co_sub_grupo = LEFT(p.co_procedimento, 4)
        LEFT JOIN ${P}tb_forma_organizacao fo ON fo.competencia = p.competencia AND fo.co_grupo + fo.co_sub_grupo + fo.co_forma_organizacao = LEFT(p.co_procedimento, 6)
        LEFT JOIN ${P}tb_financiamento f ON f.competencia = p.competencia AND f.co_financiamento = p.co_financiamento
        LEFT JOIN ${P}tb_rubrica rb ON rb.competencia = p.competencia AND rb.co_rubrica = p.co_rubrica
        LEFT JOIN ${P}tb_descricao d ON d.competencia = p.competencia AND d.co_procedimento = p.co_procedimento
        WHERE p.competencia = @c AND p.co_procedimento = @p`;

/* Abas e vínculos, na ordem em que o resultado é entregue. */
const SQL_VINCULOS = [
    `SELECT x.co_modalidade AS codigo, m.no_modalidade AS nome FROM ${P}rl_procedimento_modalidade x
           LEFT JOIN ${P}tb_modalidade m ON m.competencia = x.competencia AND m.co_modalidade = x.co_modalidade
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_registro AS codigo, r.no_registro AS nome FROM ${P}rl_procedimento_registro x
           LEFT JOIN ${P}tb_registro r ON r.competencia = x.competencia AND r.co_registro = x.co_registro
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_detalhe AS codigo, d.no_detalhe AS nome, dd.ds_detalhe AS descricao FROM ${P}rl_procedimento_detalhe x
           LEFT JOIN ${P}tb_detalhe d ON d.competencia = x.competencia AND d.co_detalhe = x.co_detalhe
           LEFT JOIN ${P}tb_descricao_detalhe dd ON dd.competencia = x.competencia AND dd.co_detalhe = x.co_detalhe
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_cid AS codigo, t.no_cid AS nome, x.st_principal AS principal, t.tp_sexo AS sexo, t.tp_agravo AS agravo FROM ${P}rl_procedimento_cid x
           LEFT JOIN ${P}tb_cid t ON t.competencia = x.competencia AND t.co_cid = x.co_cid
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_ocupacao AS codigo, o.no_ocupacao AS nome FROM ${P}rl_procedimento_ocupacao x
           LEFT JOIN ${P}tb_ocupacao o ON o.competencia = x.competencia AND o.co_ocupacao = x.co_ocupacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_tipo_leito AS codigo, l.no_tipo_leito AS nome FROM ${P}rl_procedimento_leito x
           LEFT JOIN ${P}tb_tipo_leito l ON l.competencia = x.competencia AND l.co_tipo_leito = x.co_tipo_leito
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_servico AS servico, s.no_servico AS nome_servico, x.co_classificacao AS classificacao, sc.no_classificacao AS nome_classificacao
           FROM ${P}rl_procedimento_servico x
           LEFT JOIN ${P}tb_servico s ON s.competencia = x.competencia AND s.co_servico = x.co_servico
           LEFT JOIN ${P}tb_servico_classificacao sc ON sc.competencia = x.competencia AND sc.co_servico = x.co_servico AND sc.co_classificacao = x.co_classificacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1, 3`,
    `SELECT x.co_habilitacao AS codigo, h.no_habilitacao AS nome, NULLIF(x.nu_grupo_habilitacao, '') AS grupo,
                  gh.no_grupo_habilitacao AS nome_grupo, gh.ds_grupo_habilitacao AS descricao_grupo
           FROM ${P}rl_procedimento_habilitacao x
           LEFT JOIN ${P}tb_habilitacao h ON h.competencia = x.competencia AND h.co_habilitacao = x.co_habilitacao
           LEFT JOIN ${P}tb_grupo_habilitacao gh ON gh.competencia = x.competencia AND gh.nu_grupo_habilitacao = x.nu_grupo_habilitacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 3, 1`,
    `SELECT x.co_habilitacao AS codigo, h.no_habilitacao AS nome, x.vl_percentual_sh AS sh, x.vl_percentual_sa AS sa, x.vl_percentual_sp AS sp
           FROM ${P}rl_procedimento_incremento x
           LEFT JOIN ${P}tb_habilitacao h ON h.competencia = x.competencia AND h.co_habilitacao = x.co_habilitacao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_componente_rede AS codigo, cr.no_componente_rede AS nome, ra.no_rede_atencao AS rede FROM ${P}rl_procedimento_comp_rede x
           LEFT JOIN ${P}tb_componente_rede cr ON cr.competencia = x.competencia AND cr.co_componente_rede = x.co_componente_rede
           LEFT JOIN ${P}tb_rede_atencao ra ON ra.competencia = x.competencia AND ra.co_rede_atencao = cr.co_rede_atencao
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_procedimento_origem AS codigo, o.no_procedimento AS nome FROM ${P}rl_procedimento_origem x ${PJ('o', 'co_procedimento_origem')}
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_regra_condicionada AS codigo, r.no_regra_condicionada AS nome, r.ds_regra_condicionada AS descricao FROM ${P}rl_procedimento_regra_cond x
           LEFT JOIN ${P}tb_regra_condicionada r ON r.competencia = x.competencia AND r.co_regra_condicionada = x.co_regra_condicionada
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_renases AS codigo, r.no_renases AS nome FROM ${P}rl_procedimento_renases x
           LEFT JOIN ${P}tb_renases r ON r.competencia = x.competencia AND r.co_renases = x.co_renases
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_tuss AS codigo, t.no_tuss AS nome FROM ${P}rl_procedimento_tuss x
           LEFT JOIN ${P}tb_tuss t ON t.competencia = x.competencia AND t.co_tuss = x.co_tuss
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT x.co_procedimento_sia_sih AS codigo, s.no_procedimento_sia_sih AS nome, x.tp_procedimento AS tipo FROM ${P}rl_procedimento_sia_sih x
           LEFT JOIN ${P}tb_sia_sih s ON s.competencia = x.competencia AND s.co_procedimento_sia_sih = x.co_procedimento_sia_sih AND s.tp_procedimento = x.tp_procedimento
           WHERE x.competencia = @c AND x.co_procedimento = @p ORDER BY 1`,
    `SELECT TOP 3000 x.co_registro_principal AS reg_principal, x.co_procedimento_compativel AS codigo, o.no_procedimento AS nome,
                  x.co_registro_compativel AS reg_compativel, x.tp_compatibilidade AS tipo, x.qt_permitida AS quantidade
           FROM ${P}rl_procedimento_compativel x ${PJ('o', 'co_procedimento_compativel')}
           WHERE x.competencia = @c AND x.co_procedimento_principal = @p ORDER BY x.tp_compatibilidade, x.co_procedimento_compativel`,
    `SELECT TOP 3000 x.co_registro_principal AS reg_principal, x.co_procedimento_principal AS codigo, o.no_procedimento AS nome,
                  x.co_registro_compativel AS reg_compativel, x.tp_compatibilidade AS tipo, x.qt_permitida AS quantidade
           FROM ${P}rl_procedimento_compativel x ${PJ('o', 'co_procedimento_principal')}
           WHERE x.competencia = @c AND x.co_procedimento_compativel = @p ORDER BY x.tp_compatibilidade, x.co_procedimento_principal`,
    `SELECT x.co_procedimento_restricao AS restricao, r.no_procedimento AS nome_restricao,
                  x.co_procedimento_principal AS principal, pp.no_procedimento AS nome_principal, x.co_registro_principal AS reg_principal,
                  x.co_procedimento_compativel AS compativel, pc.no_procedimento AS nome_compativel, x.co_registro_compativel AS reg_compativel,
                  x.tp_compatibilidade AS tipo
           FROM ${P}rl_excecao_compatibilidade x ${PJ('r', 'co_procedimento_restricao')} ${PJ('pp', 'co_procedimento_principal')} ${PJ('pc', 'co_procedimento_compativel')}
           WHERE x.competencia = @c AND (x.co_procedimento_restricao = @p OR x.co_procedimento_principal = @p OR x.co_procedimento_compativel = @p)`,
    `SELECT h.competencia, h.no_procedimento, h.vl_sa, h.vl_sh, h.vl_sp, h.tp_complexidade, h.co_financiamento, h.qt_maxima_execucao,
                  h.vl_idade_minima, h.vl_idade_maxima
           FROM ${P}tb_procedimento h
           WHERE h.co_procedimento = @p
             AND h.competencia IN (SELECT competencia FROM tab_sigtap_importacao WHERE situacao = 'CONCLUIDA' AND removida = 0)
           ORDER BY h.competencia DESC`
];

const SQL_NOMES_REGISTRO = `SELECT co_registro AS codigo, no_registro AS nome FROM ${P}tb_registro WHERE competencia = @c`;

/** Ficha completa do procedimento na competência; null se o procedimento não existir nela. */
async function fichaDoProcedimento(competencia, codigo) {
    const pool = await connectToDb();
    const consultar = (texto) => pool.request().input('c', sql.Char(6), competencia).input('p', sql.VarChar(10), codigo).query(texto).then(r => r.recordset);

    const base = await consultar(SQL_BASE);
    if (!base.length) return null;

    const [modalidades, registros, detalhes, cids, cbos, leitos, servicos, habilitacoes, incrementos, redes,
        origens, regras, renases, tuss, siaSih, compPrincipal, compSecundario, excecoes, historico] = await Promise.all(SQL_VINCULOS.map(consultar));

    const nomesRegistro = await consultar(SQL_NOMES_REGISTRO);
    return {
        competencia, procedimento: base[0], modalidades, registros, detalhes, cids, cbos, leitos, servicos, habilitacoes,
        incrementos, redes, origens, regras, renases, tuss, siaSih,
        compatibilidades: { comoPrincipal: compPrincipal, comoSecundario: compSecundario, excecoes },
        historico,
        nomesRegistro: Object.fromEntries(nomesRegistro.map(r => [r.codigo, r.nome]))
    };
}

module.exports = { fichaDoProcedimento };
