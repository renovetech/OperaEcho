/* backend/sql/patch_sigtap.sql
 * Consulta SIGTAP (Operações) + Importação (Parâmetros > SIGTAP).
 * Idempotente. O backend também cria estas tabelas automaticamente no primeiro uso.
 * Gerado a partir de services/sigtapCatalogo.js. */

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
    );

IF OBJECT_ID('tab_sigtap_tb_grupo', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_grupo (
        competencia CHAR(6) NOT NULL,
        co_grupo VARCHAR(2) NOT NULL,
        no_grupo NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_grupo PRIMARY KEY CLUSTERED (competencia, co_grupo)
    );

IF OBJECT_ID('tab_sigtap_tb_sub_grupo', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_sub_grupo (
        competencia CHAR(6) NOT NULL,
        co_grupo VARCHAR(2) NOT NULL,
        co_sub_grupo VARCHAR(2) NOT NULL,
        no_sub_grupo NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_sub_grupo PRIMARY KEY CLUSTERED (competencia, co_grupo, co_sub_grupo)
    );

IF OBJECT_ID('tab_sigtap_tb_forma_organizacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_forma_organizacao (
        competencia CHAR(6) NOT NULL,
        co_grupo VARCHAR(2) NOT NULL,
        co_sub_grupo VARCHAR(2) NOT NULL,
        co_forma_organizacao VARCHAR(2) NOT NULL,
        no_forma_organizacao NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_forma_organizacao PRIMARY KEY CLUSTERED (competencia, co_grupo, co_sub_grupo, co_forma_organizacao)
    );

IF OBJECT_ID('tab_sigtap_tb_financiamento', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_financiamento (
        competencia CHAR(6) NOT NULL,
        co_financiamento VARCHAR(2) NOT NULL,
        no_financiamento NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_financiamento PRIMARY KEY CLUSTERED (competencia, co_financiamento)
    );

IF OBJECT_ID('tab_sigtap_tb_rubrica', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_rubrica (
        competencia CHAR(6) NOT NULL,
        co_rubrica VARCHAR(6) NOT NULL,
        no_rubrica NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_rubrica PRIMARY KEY CLUSTERED (competencia, co_rubrica)
    );

IF OBJECT_ID('tab_sigtap_tb_modalidade', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_modalidade (
        competencia CHAR(6) NOT NULL,
        co_modalidade VARCHAR(2) NOT NULL,
        no_modalidade NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_modalidade PRIMARY KEY CLUSTERED (competencia, co_modalidade)
    );

IF OBJECT_ID('tab_sigtap_tb_registro', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_registro (
        competencia CHAR(6) NOT NULL,
        co_registro VARCHAR(2) NOT NULL,
        no_registro NVARCHAR(50) NULL,
        CONSTRAINT PK_tab_sigtap_tb_registro PRIMARY KEY CLUSTERED (competencia, co_registro)
    );

IF OBJECT_ID('tab_sigtap_tb_tipo_leito', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_tipo_leito (
        competencia CHAR(6) NOT NULL,
        co_tipo_leito VARCHAR(2) NOT NULL,
        no_tipo_leito NVARCHAR(60) NULL,
        CONSTRAINT PK_tab_sigtap_tb_tipo_leito PRIMARY KEY CLUSTERED (competencia, co_tipo_leito)
    );

IF OBJECT_ID('tab_sigtap_tb_detalhe', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_detalhe (
        competencia CHAR(6) NOT NULL,
        co_detalhe VARCHAR(3) NOT NULL,
        no_detalhe NVARCHAR(100) NULL,
        CONSTRAINT PK_tab_sigtap_tb_detalhe PRIMARY KEY CLUSTERED (competencia, co_detalhe)
    );

IF OBJECT_ID('tab_sigtap_tb_descricao_detalhe', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_descricao_detalhe (
        competencia CHAR(6) NOT NULL,
        co_detalhe VARCHAR(3) NOT NULL,
        ds_detalhe NVARCHAR(4000) NULL,
        CONSTRAINT PK_tab_sigtap_tb_descricao_detalhe PRIMARY KEY CLUSTERED (competencia, co_detalhe)
    );

IF OBJECT_ID('tab_sigtap_tb_servico', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_servico (
        competencia CHAR(6) NOT NULL,
        co_servico VARCHAR(3) NOT NULL,
        no_servico NVARCHAR(120) NULL,
        CONSTRAINT PK_tab_sigtap_tb_servico PRIMARY KEY CLUSTERED (competencia, co_servico)
    );

IF OBJECT_ID('tab_sigtap_tb_servico_classificacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_servico_classificacao (
        competencia CHAR(6) NOT NULL,
        co_servico VARCHAR(3) NOT NULL,
        co_classificacao VARCHAR(3) NOT NULL,
        no_classificacao NVARCHAR(150) NULL,
        CONSTRAINT PK_tab_sigtap_tb_servico_classificacao PRIMARY KEY CLUSTERED (competencia, co_servico, co_classificacao)
    );

IF OBJECT_ID('tab_sigtap_tb_habilitacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_habilitacao (
        competencia CHAR(6) NOT NULL,
        co_habilitacao VARCHAR(4) NOT NULL,
        no_habilitacao NVARCHAR(150) NULL,
        CONSTRAINT PK_tab_sigtap_tb_habilitacao PRIMARY KEY CLUSTERED (competencia, co_habilitacao)
    );

IF OBJECT_ID('tab_sigtap_tb_grupo_habilitacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_grupo_habilitacao (
        competencia CHAR(6) NOT NULL,
        nu_grupo_habilitacao VARCHAR(4) NOT NULL,
        no_grupo_habilitacao NVARCHAR(20) NULL,
        ds_grupo_habilitacao NVARCHAR(250) NULL,
        CONSTRAINT PK_tab_sigtap_tb_grupo_habilitacao PRIMARY KEY CLUSTERED (competencia, nu_grupo_habilitacao)
    );

IF OBJECT_ID('tab_sigtap_tb_ocupacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_ocupacao (
        competencia CHAR(6) NOT NULL,
        co_ocupacao VARCHAR(6) NOT NULL,
        no_ocupacao NVARCHAR(150) NULL,
        CONSTRAINT PK_tab_sigtap_tb_ocupacao PRIMARY KEY CLUSTERED (competencia, co_ocupacao)
    );

IF OBJECT_ID('tab_sigtap_tb_cid', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_cid (
        competencia CHAR(6) NOT NULL,
        co_cid VARCHAR(4) NOT NULL,
        no_cid NVARCHAR(100) NULL,
        tp_agravo VARCHAR(1) NULL,
        tp_sexo VARCHAR(1) NULL,
        tp_estadio VARCHAR(1) NULL,
        vl_campos_irradiados INT NULL,
        CONSTRAINT PK_tab_sigtap_tb_cid PRIMARY KEY CLUSTERED (competencia, co_cid)
    );

IF OBJECT_ID('tab_sigtap_tb_rede_atencao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_rede_atencao (
        competencia CHAR(6) NOT NULL,
        co_rede_atencao VARCHAR(3) NOT NULL,
        no_rede_atencao NVARCHAR(50) NULL,
        CONSTRAINT PK_tab_sigtap_tb_rede_atencao PRIMARY KEY CLUSTERED (competencia, co_rede_atencao)
    );

IF OBJECT_ID('tab_sigtap_tb_componente_rede', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_componente_rede (
        competencia CHAR(6) NOT NULL,
        co_componente_rede VARCHAR(10) NOT NULL,
        no_componente_rede NVARCHAR(150) NULL,
        co_rede_atencao VARCHAR(3) NULL,
        CONSTRAINT PK_tab_sigtap_tb_componente_rede PRIMARY KEY CLUSTERED (competencia, co_componente_rede)
    );

IF OBJECT_ID('tab_sigtap_tb_regra_condicionada', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_regra_condicionada (
        competencia CHAR(6) NOT NULL,
        co_regra_condicionada VARCHAR(4) NOT NULL,
        no_regra_condicionada NVARCHAR(150) NULL,
        ds_regra_condicionada NVARCHAR(4000) NULL,
        CONSTRAINT PK_tab_sigtap_tb_regra_condicionada PRIMARY KEY CLUSTERED (competencia, co_regra_condicionada)
    );

IF OBJECT_ID('tab_sigtap_tb_renases', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_renases (
        competencia CHAR(6) NOT NULL,
        co_renases VARCHAR(10) NOT NULL,
        no_renases NVARCHAR(150) NULL,
        CONSTRAINT PK_tab_sigtap_tb_renases PRIMARY KEY CLUSTERED (competencia, co_renases)
    );

IF OBJECT_ID('tab_sigtap_tb_tuss', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_tuss (
        competencia CHAR(6) NOT NULL,
        co_tuss VARCHAR(10) NOT NULL,
        no_tuss NVARCHAR(450) NULL,
        CONSTRAINT PK_tab_sigtap_tb_tuss PRIMARY KEY CLUSTERED (competencia, co_tuss)
    );

IF OBJECT_ID('tab_sigtap_tb_sia_sih', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_sia_sih (
        competencia CHAR(6) NOT NULL,
        co_procedimento_sia_sih VARCHAR(10) NOT NULL,
        no_procedimento_sia_sih NVARCHAR(100) NULL,
        tp_procedimento VARCHAR(1) NOT NULL,
        CONSTRAINT PK_tab_sigtap_tb_sia_sih PRIMARY KEY CLUSTERED (competencia, co_procedimento_sia_sih, tp_procedimento)
    );

IF OBJECT_ID('tab_sigtap_tb_procedimento', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_procedimento (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        no_procedimento NVARCHAR(250) NULL,
        tp_complexidade VARCHAR(1) NULL,
        tp_sexo VARCHAR(1) NULL,
        qt_maxima_execucao INT NULL,
        qt_dias_permanencia INT NULL,
        qt_pontos INT NULL,
        vl_idade_minima INT NULL,
        vl_idade_maxima INT NULL,
        vl_sh DECIMAL(14,2) NULL,
        vl_sa DECIMAL(14,2) NULL,
        vl_sp DECIMAL(14,2) NULL,
        co_financiamento VARCHAR(2) NULL,
        co_rubrica VARCHAR(6) NULL,
        qt_tempo_permanencia INT NULL,
        CONSTRAINT PK_tab_sigtap_tb_procedimento PRIMARY KEY CLUSTERED (competencia, co_procedimento)
    );

IF OBJECT_ID('tab_sigtap_tb_descricao', 'U') IS NULL
    CREATE TABLE tab_sigtap_tb_descricao (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        ds_procedimento NVARCHAR(4000) NULL,
        CONSTRAINT PK_tab_sigtap_tb_descricao PRIMARY KEY CLUSTERED (competencia, co_procedimento)
    );

IF OBJECT_ID('tab_sigtap_rl_procedimento_cid', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_cid (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_cid VARCHAR(4) NOT NULL,
        st_principal VARCHAR(1) NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_cid PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_cid)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_cid_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_cid_1 ON tab_sigtap_rl_procedimento_cid (competencia, co_cid);

IF OBJECT_ID('tab_sigtap_rl_procedimento_ocupacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_ocupacao (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_ocupacao VARCHAR(6) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_ocupacao PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_ocupacao)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_ocupacao_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_ocupacao_1 ON tab_sigtap_rl_procedimento_ocupacao (competencia, co_ocupacao);

IF OBJECT_ID('tab_sigtap_rl_procedimento_registro', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_registro (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_registro VARCHAR(2) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_registro PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_registro)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_registro_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_registro_1 ON tab_sigtap_rl_procedimento_registro (competencia, co_registro);

IF OBJECT_ID('tab_sigtap_rl_procedimento_modalidade', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_modalidade (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_modalidade VARCHAR(2) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_modalidade PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_modalidade)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_modalidade_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_modalidade_1 ON tab_sigtap_rl_procedimento_modalidade (competencia, co_modalidade);

IF OBJECT_ID('tab_sigtap_rl_procedimento_detalhe', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_detalhe (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_detalhe VARCHAR(3) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_detalhe PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_detalhe)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_detalhe_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_detalhe_1 ON tab_sigtap_rl_procedimento_detalhe (competencia, co_detalhe);

IF OBJECT_ID('tab_sigtap_rl_procedimento_leito', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_leito (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_tipo_leito VARCHAR(2) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_leito PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_tipo_leito)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_leito_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_leito_1 ON tab_sigtap_rl_procedimento_leito (competencia, co_tipo_leito);

IF OBJECT_ID('tab_sigtap_rl_procedimento_servico', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_servico (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_servico VARCHAR(3) NOT NULL,
        co_classificacao VARCHAR(3) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_servico PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_servico, co_classificacao)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_servico_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_servico_1 ON tab_sigtap_rl_procedimento_servico (competencia, co_servico, co_classificacao);

IF OBJECT_ID('tab_sigtap_rl_procedimento_habilitacao', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_habilitacao (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_habilitacao VARCHAR(4) NOT NULL,
        nu_grupo_habilitacao VARCHAR(4) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_habilitacao PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_habilitacao, nu_grupo_habilitacao)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_habilitacao_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_habilitacao_1 ON tab_sigtap_rl_procedimento_habilitacao (competencia, co_habilitacao);

IF OBJECT_ID('tab_sigtap_rl_procedimento_incremento', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_incremento (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_habilitacao VARCHAR(4) NOT NULL,
        vl_percentual_sh DECIMAL(9,2) NULL,
        vl_percentual_sa DECIMAL(9,2) NULL,
        vl_percentual_sp DECIMAL(9,2) NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_incremento PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_habilitacao)
    );

IF OBJECT_ID('tab_sigtap_rl_procedimento_origem', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_origem (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_procedimento_origem VARCHAR(10) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_origem PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_procedimento_origem)
    );

IF OBJECT_ID('tab_sigtap_rl_procedimento_regra_cond', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_regra_cond (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_regra_condicionada VARCHAR(4) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_regra_cond PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_regra_condicionada)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_regra_cond_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_regra_cond_1 ON tab_sigtap_rl_procedimento_regra_cond (competencia, co_regra_condicionada);

IF OBJECT_ID('tab_sigtap_rl_procedimento_renases', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_renases (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_renases VARCHAR(10) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_renases PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_renases)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_renases_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_renases_1 ON tab_sigtap_rl_procedimento_renases (competencia, co_renases);

IF OBJECT_ID('tab_sigtap_rl_procedimento_tuss', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_tuss (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_tuss VARCHAR(10) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_tuss PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_tuss)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_tuss_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_tuss_1 ON tab_sigtap_rl_procedimento_tuss (competencia, co_tuss);

IF OBJECT_ID('tab_sigtap_rl_procedimento_sia_sih', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_sia_sih (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_procedimento_sia_sih VARCHAR(10) NOT NULL,
        tp_procedimento VARCHAR(1) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_sia_sih PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_procedimento_sia_sih, tp_procedimento)
    );

IF OBJECT_ID('tab_sigtap_rl_procedimento_comp_rede', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_comp_rede (
        competencia CHAR(6) NOT NULL,
        co_procedimento VARCHAR(10) NOT NULL,
        co_componente_rede VARCHAR(10) NOT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_comp_rede PRIMARY KEY CLUSTERED (competencia, co_procedimento, co_componente_rede)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_comp_rede_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_comp_rede_1 ON tab_sigtap_rl_procedimento_comp_rede (competencia, co_componente_rede);

IF OBJECT_ID('tab_sigtap_rl_procedimento_compativel', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_procedimento_compativel (
        competencia CHAR(6) NOT NULL,
        co_procedimento_principal VARCHAR(10) NOT NULL,
        co_registro_principal VARCHAR(2) NOT NULL,
        co_procedimento_compativel VARCHAR(10) NOT NULL,
        co_registro_compativel VARCHAR(2) NOT NULL,
        tp_compatibilidade VARCHAR(1) NULL,
        qt_permitida INT NULL,
        CONSTRAINT PK_tab_sigtap_rl_procedimento_compativel PRIMARY KEY CLUSTERED (competencia, co_procedimento_principal, co_registro_principal, co_procedimento_compativel, co_registro_compativel)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_compativel_1')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_compativel_1 ON tab_sigtap_rl_procedimento_compativel (competencia, co_procedimento_compativel);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_procedimento_compativel_2')
    CREATE INDEX IX_tab_sigtap_rl_procedimento_compativel_2 ON tab_sigtap_rl_procedimento_compativel (competencia, co_registro_principal, co_registro_compativel, tp_compatibilidade);

IF OBJECT_ID('tab_sigtap_rl_excecao_compatibilidade', 'U') IS NULL
    CREATE TABLE tab_sigtap_rl_excecao_compatibilidade (
        competencia CHAR(6) NOT NULL,
        co_procedimento_restricao VARCHAR(10) NOT NULL,
        co_procedimento_principal VARCHAR(10) NOT NULL,
        co_registro_principal VARCHAR(2) NOT NULL,
        co_procedimento_compativel VARCHAR(10) NOT NULL,
        co_registro_compativel VARCHAR(2) NOT NULL,
        tp_compatibilidade VARCHAR(1) NULL,
        CONSTRAINT PK_tab_sigtap_rl_excecao_compatibilidade PRIMARY KEY CLUSTERED (competencia, co_procedimento_restricao, co_procedimento_principal, co_registro_principal, co_procedimento_compativel, co_registro_compativel)
    );
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_excecao_compatibilidade_1')
    CREATE INDEX IX_tab_sigtap_rl_excecao_compatibilidade_1 ON tab_sigtap_rl_excecao_compatibilidade (competencia, co_procedimento_principal);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_sigtap_rl_excecao_compatibilidade_2')
    CREATE INDEX IX_tab_sigtap_rl_excecao_compatibilidade_2 ON tab_sigtap_rl_excecao_compatibilidade (competencia, co_procedimento_compativel);
GO

-- Acesso: o Administrador já enxerga a Consulta SIGTAP. Para os demais perfis, libere o módulo
-- 'Consulta SIGTAP' em Cadastro > Perfil de Acesso (tab_regras_acesso.nome_modulo = 'sigtap').
