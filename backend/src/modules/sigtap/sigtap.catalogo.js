/*
 * Catálogo das tabelas do pacote da Tabela Unificada SIGTAP (DATASUS).
 * Cada arquivo .txt do pacote vira uma tabela tab_sigtap_<arquivo> com a
 * coluna "competencia" à frente da chave: várias competências convivem e a
 * consulta escolhe qual usar (como na página do DATASUS).
 *
 * Colunas: [nome, tipo, tamanho, início (1-based no layout oficial)]
 *   c = VARCHAR(n) | n = NVARCHAR(n) | i = INT
 *   m = valor em centavos -> DECIMAL(14,2) | p = percentual com 2 casas -> DECIMAL(9,2)
 * As posições valem como padrão; se o pacote trouxer <arquivo>_layout.txt, ele prevalece. */

const T = (arquivo, colunas, chave, indices = []) => ({ arquivo, tabela: `tab_sigtap_${arquivo}`, colunas, chave, indices });
const PROC = ['co_procedimento', 'c', 10, 1];

const TABELAS = [
    // ---------------- Tabelas de referência ----------------
    T('tb_grupo', [['co_grupo', 'c', 2, 1], ['no_grupo', 'n', 100, 3]], ['co_grupo']),
    T('tb_sub_grupo', [['co_grupo', 'c', 2, 1], ['co_sub_grupo', 'c', 2, 3], ['no_sub_grupo', 'n', 100, 5]], ['co_grupo', 'co_sub_grupo']),
    T('tb_forma_organizacao', [['co_grupo', 'c', 2, 1], ['co_sub_grupo', 'c', 2, 3], ['co_forma_organizacao', 'c', 2, 5], ['no_forma_organizacao', 'n', 100, 7]],
        ['co_grupo', 'co_sub_grupo', 'co_forma_organizacao']),
    T('tb_financiamento', [['co_financiamento', 'c', 2, 1], ['no_financiamento', 'n', 100, 3]], ['co_financiamento']),
    T('tb_rubrica', [['co_rubrica', 'c', 6, 1], ['no_rubrica', 'n', 100, 7]], ['co_rubrica']),
    T('tb_modalidade', [['co_modalidade', 'c', 2, 1], ['no_modalidade', 'n', 100, 3]], ['co_modalidade']),
    T('tb_registro', [['co_registro', 'c', 2, 1], ['no_registro', 'n', 50, 3]], ['co_registro']),
    T('tb_tipo_leito', [['co_tipo_leito', 'c', 2, 1], ['no_tipo_leito', 'n', 60, 3]], ['co_tipo_leito']),
    T('tb_detalhe', [['co_detalhe', 'c', 3, 1], ['no_detalhe', 'n', 100, 4]], ['co_detalhe']),
    T('tb_descricao_detalhe', [['co_detalhe', 'c', 3, 1], ['ds_detalhe', 'n', 4000, 4]], ['co_detalhe']),
    T('tb_servico', [['co_servico', 'c', 3, 1], ['no_servico', 'n', 120, 4]], ['co_servico']),
    T('tb_servico_classificacao', [['co_servico', 'c', 3, 1], ['co_classificacao', 'c', 3, 4], ['no_classificacao', 'n', 150, 7]], ['co_servico', 'co_classificacao']),
    T('tb_habilitacao', [['co_habilitacao', 'c', 4, 1], ['no_habilitacao', 'n', 150, 5]], ['co_habilitacao']),
    T('tb_grupo_habilitacao', [['nu_grupo_habilitacao', 'c', 4, 1], ['no_grupo_habilitacao', 'n', 20, 5], ['ds_grupo_habilitacao', 'n', 250, 25]], ['nu_grupo_habilitacao']),
    T('tb_ocupacao', [['co_ocupacao', 'c', 6, 1], ['no_ocupacao', 'n', 150, 7]], ['co_ocupacao']),
    T('tb_cid', [['co_cid', 'c', 4, 1], ['no_cid', 'n', 100, 5], ['tp_agravo', 'c', 1, 105], ['tp_sexo', 'c', 1, 106], ['tp_estadio', 'c', 1, 107], ['vl_campos_irradiados', 'i', 4, 108]], ['co_cid']),
    T('tb_rede_atencao', [['co_rede_atencao', 'c', 3, 1], ['no_rede_atencao', 'n', 50, 4]], ['co_rede_atencao']),
    T('tb_componente_rede', [['co_componente_rede', 'c', 10, 1], ['no_componente_rede', 'n', 150, 11], ['co_rede_atencao', 'c', 3, 161]], ['co_componente_rede']),
    T('tb_regra_condicionada', [['co_regra_condicionada', 'c', 4, 1], ['no_regra_condicionada', 'n', 150, 5], ['ds_regra_condicionada', 'n', 4000, 155]], ['co_regra_condicionada']),
    T('tb_renases', [['co_renases', 'c', 10, 1], ['no_renases', 'n', 150, 11]], ['co_renases']),
    T('tb_tuss', [['co_tuss', 'c', 10, 1], ['no_tuss', 'n', 450, 11]], ['co_tuss']),
    T('tb_sia_sih', [['co_procedimento_sia_sih', 'c', 10, 1], ['no_procedimento_sia_sih', 'n', 100, 11], ['tp_procedimento', 'c', 1, 111]], ['co_procedimento_sia_sih', 'tp_procedimento']),

    // ---------------- Procedimentos ----------------
    T('tb_procedimento', [
        PROC, ['no_procedimento', 'n', 250, 11], ['tp_complexidade', 'c', 1, 261], ['tp_sexo', 'c', 1, 262],
        ['qt_maxima_execucao', 'i', 4, 263], ['qt_dias_permanencia', 'i', 4, 267], ['qt_pontos', 'i', 4, 271],
        ['vl_idade_minima', 'i', 4, 275], ['vl_idade_maxima', 'i', 4, 279],
        ['vl_sh', 'm', 12, 283], ['vl_sa', 'm', 12, 295], ['vl_sp', 'm', 12, 307],
        ['co_financiamento', 'c', 2, 319], ['co_rubrica', 'c', 6, 321], ['qt_tempo_permanencia', 'i', 4, 327]
    ], ['co_procedimento']),
    T('tb_descricao', [PROC, ['ds_procedimento', 'n', 4000, 11]], ['co_procedimento']),

    // ---------------- Relacionamentos do procedimento ----------------
    T('rl_procedimento_cid', [PROC, ['co_cid', 'c', 4, 11], ['st_principal', 'c', 1, 15]], ['co_procedimento', 'co_cid'], [['co_cid']]),
    T('rl_procedimento_ocupacao', [PROC, ['co_ocupacao', 'c', 6, 11]], ['co_procedimento', 'co_ocupacao'], [['co_ocupacao']]),
    T('rl_procedimento_registro', [PROC, ['co_registro', 'c', 2, 11]], ['co_procedimento', 'co_registro'], [['co_registro']]),
    T('rl_procedimento_modalidade', [PROC, ['co_modalidade', 'c', 2, 11]], ['co_procedimento', 'co_modalidade'], [['co_modalidade']]),
    T('rl_procedimento_detalhe', [PROC, ['co_detalhe', 'c', 3, 11]], ['co_procedimento', 'co_detalhe'], [['co_detalhe']]),
    T('rl_procedimento_leito', [PROC, ['co_tipo_leito', 'c', 2, 11]], ['co_procedimento', 'co_tipo_leito'], [['co_tipo_leito']]),
    T('rl_procedimento_servico', [PROC, ['co_servico', 'c', 3, 11], ['co_classificacao', 'c', 3, 14]], ['co_procedimento', 'co_servico', 'co_classificacao'], [['co_servico', 'co_classificacao']]),
    T('rl_procedimento_habilitacao', [PROC, ['co_habilitacao', 'c', 4, 11], ['nu_grupo_habilitacao', 'c', 4, 15]], ['co_procedimento', 'co_habilitacao', 'nu_grupo_habilitacao'], [['co_habilitacao']]),
    T('rl_procedimento_incremento', [PROC, ['co_habilitacao', 'c', 4, 11], ['vl_percentual_sh', 'p', 7, 15], ['vl_percentual_sa', 'p', 7, 22], ['vl_percentual_sp', 'p', 7, 29]], ['co_procedimento', 'co_habilitacao']),
    T('rl_procedimento_origem', [PROC, ['co_procedimento_origem', 'c', 10, 11]], ['co_procedimento', 'co_procedimento_origem']),
    T('rl_procedimento_regra_cond', [PROC, ['co_regra_condicionada', 'c', 4, 11]], ['co_procedimento', 'co_regra_condicionada'], [['co_regra_condicionada']]),
    T('rl_procedimento_renases', [PROC, ['co_renases', 'c', 10, 11]], ['co_procedimento', 'co_renases'], [['co_renases']]),
    T('rl_procedimento_tuss', [PROC, ['co_tuss', 'c', 10, 11]], ['co_procedimento', 'co_tuss'], [['co_tuss']]),
    T('rl_procedimento_sia_sih', [PROC, ['co_procedimento_sia_sih', 'c', 10, 11], ['tp_procedimento', 'c', 1, 21]], ['co_procedimento', 'co_procedimento_sia_sih', 'tp_procedimento']),
    T('rl_procedimento_comp_rede', [PROC, ['co_componente_rede', 'c', 10, 11]], ['co_procedimento', 'co_componente_rede'], [['co_componente_rede']]),

    // ---------------- Compatibilidades ----------------
    T('rl_procedimento_compativel', [
        ['co_procedimento_principal', 'c', 10, 1], ['co_registro_principal', 'c', 2, 11],
        ['co_procedimento_compativel', 'c', 10, 13], ['co_registro_compativel', 'c', 2, 23],
        ['tp_compatibilidade', 'c', 1, 25], ['qt_permitida', 'i', 4, 26]
    ], ['co_procedimento_principal', 'co_registro_principal', 'co_procedimento_compativel', 'co_registro_compativel'],
        [['co_procedimento_compativel'], ['co_registro_principal', 'co_registro_compativel', 'tp_compatibilidade']]),
    T('rl_excecao_compatibilidade', [
        ['co_procedimento_restricao', 'c', 10, 1], ['co_procedimento_principal', 'c', 10, 11], ['co_registro_principal', 'c', 2, 21],
        ['co_procedimento_compativel', 'c', 10, 23], ['co_registro_compativel', 'c', 2, 33], ['tp_compatibilidade', 'c', 1, 35]
    ], ['co_procedimento_restricao', 'co_procedimento_principal', 'co_registro_principal', 'co_procedimento_compativel', 'co_registro_compativel'],
        [['co_procedimento_principal'], ['co_procedimento_compativel']])
];

const TIPO_SQL = { c: (n) => `VARCHAR(${n})`, n: (n) => `NVARCHAR(${n})`, i: () => 'INT', m: () => 'DECIMAL(14,2)', p: () => 'DECIMAL(9,2)' };

/** DDL idempotente de uma tabela do catálogo. */
function ddlTabela(t) {
    const cols = [`competencia CHAR(6) NOT NULL`].concat(
        t.colunas.map(([nome, tipo, tam]) => `${nome} ${TIPO_SQL[tipo](tam)} ${t.chave.includes(nome) ? 'NOT NULL' : 'NULL'}`)
    );
    const pk = `CONSTRAINT PK_${t.tabela} PRIMARY KEY CLUSTERED (competencia, ${t.chave.join(', ')})`;
    const idx = t.indices.map((c, i) => `
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_${t.tabela}_${i + 1}')
    CREATE INDEX IX_${t.tabela}_${i + 1} ON ${t.tabela} (competencia, ${c.join(', ')});`).join('');
    return `
IF OBJECT_ID('${t.tabela}', 'U') IS NULL
    CREATE TABLE ${t.tabela} (
        ${cols.join(',\n        ')},
        ${pk}
    );${idx}`;
}

const DDL_IMPORTACAO = `
IF OBJECT_ID('tab_sigtap_importacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_importacao (
        id_importacao INT IDENTITY(1,1) PRIMARY KEY,
        arquivo VARCHAR(255) NOT NULL,
        competencia CHAR(6) NULL,
        situacao VARCHAR(12) NOT NULL,          -- PROCESSANDO | CONCLUIDA | ERRO
        usuario VARCHAR(150) NULL,
        dt_inicio DATETIME NOT NULL,
        dt_fim DATETIME NULL,
        qt_procedimentos INT NULL,
        qt_novos INT NULL,
        qt_compatibilidades INT NULL,
        qt_registros INT NULL,
        removida BIT NOT NULL CONSTRAINT DF_tab_sigtap_importacao_removida DEFAULT 0,
        mensagem VARCHAR(2000) NULL
    );`;

function ddlCompleto() {
    return [DDL_IMPORTACAO, ...TABELAS.map(ddlTabela)].join('\n');
}

module.exports = { TABELAS, ddlTabela, ddlCompleto, DDL_IMPORTACAO };
