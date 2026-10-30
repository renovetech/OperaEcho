/* =============================================================================
   OPERA ECHO - PARÂMETROS / MACRO E MICRO REGIÕES / PAINEL PÚBLICO DO PROJETO
   (idempotente - pode rodar mais de uma vez)
   - tab_parametros: chave/valor do sistema (menu Parâmetros)
   - tab_macro_regioes / tab_micro_regioes: nomenclatura própria por projeto
   - tab_unidades.id_macro / id_micro: unidade vinculada à região do seu projeto
   - tab_projetos.painel_publico / slug_publico: página pública (operaecho.com/<slug>)
   ============================================================================= */
SET NOCOUNT ON;

/* ------------------------------ PARÂMETROS -------------------------------- */
IF OBJECT_ID('tab_parametros') IS NULL
    CREATE TABLE tab_parametros (
        chave           VARCHAR(100) NOT NULL PRIMARY KEY,
        valor           VARCHAR(500) NULL,
        modulo          VARCHAR(50)  NULL,
        descricao       VARCHAR(300) NULL,
        data_alteracao  DATETIME     NULL,
        usuario_alteracao VARCHAR(150) NULL
    );
GO

IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'anexo_obrigatorio_implantacao')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('anexo_obrigatorio_implantacao', '1', 'implantacao', 'Anexo obrigatório no Registro de Atividades (Implantação)');
IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'anexo_obrigatorio_projetos')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('anexo_obrigatorio_projetos', '1', 'projetos', 'Anexo obrigatório no Registro de Atividades (Projetos)');
IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'horas_obrigatorias_implantacao')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('horas_obrigatorias_implantacao', '1', 'implantacao', 'Horas trabalhadas (Tempo Gasto) obrigatórias (Implantação)');
IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'horas_obrigatorias_projetos')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('horas_obrigatorias_projetos', '1', 'projetos', 'Horas trabalhadas (Tempo Gasto) obrigatórias (Projetos)');
IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'equipe_apoio_obrigatoria_implantacao')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('equipe_apoio_obrigatoria_implantacao', '1', 'implantacao', 'Equipe do Projeto obrigatória no Apoio ao Projeto (Implantação)');
IF NOT EXISTS (SELECT 1 FROM tab_parametros WHERE chave = 'equipe_apoio_obrigatoria_projetos')
    INSERT INTO tab_parametros (chave, valor, modulo, descricao)
    VALUES ('equipe_apoio_obrigatoria_projetos', '1', 'projetos', 'Equipe do Projeto obrigatória no Apoio ao Projeto (Projetos)');
GO

/* Equipe do Projeto (motivo "Apoio ao Projeto") no módulo PROJETOS - espelho de tab_atividade_equipe_projeto */
IF OBJECT_ID('tab_proj_atividade_equipe_projeto') IS NULL
    CREATE TABLE tab_proj_atividade_equipe_projeto (
        id_relacionamento INT IDENTITY(1,1) CONSTRAINT PK_tab_proj_atividade_equipe_projeto PRIMARY KEY,
        id_atividade      INT NOT NULL,
        id_usuario        INT NOT NULL,
        data_vinculo      DATETIME NULL DEFAULT (GETDATE())
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_proj_atividade_equipe_projeto_atividade')
    CREATE INDEX IX_proj_atividade_equipe_projeto_atividade ON tab_proj_atividade_equipe_projeto(id_atividade);
GO

/* ------------------------- MACRO / MICRO REGIÕES -------------------------- */
IF OBJECT_ID('tab_macro_regioes') IS NULL
    CREATE TABLE tab_macro_regioes (
        id_macro    INT IDENTITY(1,1) PRIMARY KEY,
        id_projeto  INT          NOT NULL REFERENCES tab_projetos(id_projeto),
        nome_macro  VARCHAR(120) NOT NULL,
        sigla       VARCHAR(20)  NULL,
        cor         VARCHAR(9)   NULL,
        ordem       INT          NOT NULL DEFAULT 0,
        ativo       BIT          NOT NULL DEFAULT 1
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_macro_regioes_projeto')
    CREATE INDEX IX_macro_regioes_projeto ON tab_macro_regioes(id_projeto);
GO

IF OBJECT_ID('tab_micro_regioes') IS NULL
    CREATE TABLE tab_micro_regioes (
        id_micro    INT IDENTITY(1,1) PRIMARY KEY,
        id_macro    INT          NOT NULL REFERENCES tab_macro_regioes(id_macro),
        nome_micro  VARCHAR(120) NOT NULL,
        sigla       VARCHAR(20)  NULL,
        cor         VARCHAR(9)   NULL,
        ordem       INT          NOT NULL DEFAULT 0,
        ativo       BIT          NOT NULL DEFAULT 1
    );
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_micro_regioes_macro')
    CREATE INDEX IX_micro_regioes_macro ON tab_micro_regioes(id_macro);
GO

IF COL_LENGTH('tab_unidades', 'id_macro') IS NULL ALTER TABLE tab_unidades ADD id_macro INT NULL;
IF COL_LENGTH('tab_unidades', 'id_micro') IS NULL ALTER TABLE tab_unidades ADD id_micro INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_macro')
    ALTER TABLE tab_unidades WITH NOCHECK ADD CONSTRAINT FK_unidades_macro FOREIGN KEY (id_macro) REFERENCES tab_macro_regioes(id_macro);
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_micro')
    ALTER TABLE tab_unidades WITH NOCHECK ADD CONSTRAINT FK_unidades_micro FOREIGN KEY (id_micro) REFERENCES tab_micro_regioes(id_micro);
GO

/* --------------------------- TIPOS DE UNIDADE ----------------------------- */
/* Identifica a unidade no mapa pela sigla do tipo (H = Hospital, R = Regulação...). */
IF OBJECT_ID('tab_tipos_unidade') IS NULL
    CREATE TABLE tab_tipos_unidade (
        id_tipo_unidade INT IDENTITY(1,1) PRIMARY KEY,
        nome_tipo       VARCHAR(80)  NOT NULL,
        sigla           VARCHAR(4)   NOT NULL,
        grupo           VARCHAR(60)  NULL,
        descricao       VARCHAR(200) NULL,
        ordem           INT          NOT NULL DEFAULT 0,
        ativo           BIT          NOT NULL DEFAULT 1
    );
GO
IF NOT EXISTS (SELECT 1 FROM tab_tipos_unidade)
    INSERT INTO tab_tipos_unidade (nome_tipo, sigla, grupo, descricao, ordem) VALUES
    ('Hospital',                     'H',   'Atenção Hospitalar',     'Hospitais, maternidades e complexos hospitalares', 1),
    ('Central de Regulação',         'R',   'Regulação',              'Complexos e centrais de regulação', 2),
    ('UBS',                          'UBS', 'Atenção Básica',         'Unidade Básica de Saúde, posto e centro de saúde', 3),
    ('ESF / PSF',                    'ESF', 'Atenção Básica',         'Estratégia/Programa Saúde da Família, USF, Clínica da Família', 4),
    ('Atenção Especializada',        'AE',  'Atenção Especializada',  'Policlínica, ambulatório, CAPS, CEO, reabilitação, centros especializados', 5),
    ('Urgência e Emergência',        'UPA', 'Urgência e Emergência',  'UPA, pronto-socorro, pronto atendimento, SAMU', 6),
    ('Gestão / Vigilância',          'G',   'Gestão',                 'Secretarias, vigilância, coordenações, farmácia, logística', 7);
GO
IF COL_LENGTH('tab_unidades', 'id_tipo_unidade') IS NULL ALTER TABLE tab_unidades ADD id_tipo_unidade INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_unidades_tipo')
    ALTER TABLE tab_unidades WITH NOCHECK ADD CONSTRAINT FK_unidades_tipo FOREIGN KEY (id_tipo_unidade) REFERENCES tab_tipos_unidade(id_tipo_unidade);
GO

/* Classificação inicial pelo nome - SOMENTE unidades ainda sem tipo (ajustável no Cadastro de Unidades). */
;WITH u AS (
    SELECT id_unidade, id_tipo_unidade,
           ' ' + UPPER(LTRIM(RTRIM(nome_unidade))) COLLATE Latin1_General_CI_AI + ' ' AS n
    FROM tab_unidades WHERE id_tipo_unidade IS NULL
)
UPDATE u SET id_tipo_unidade = (SELECT id_tipo_unidade FROM tab_tipos_unidade WHERE sigla = CASE
        WHEN n LIKE '%REGULA%' THEN 'R'
        WHEN n LIKE '% HOSP%' OR n LIKE '%MATERN%' OR n LIKE '% COMPLEXO %' OR n LIKE '% UPH %' THEN 'H'
        WHEN n LIKE '% UPA %' OR n LIKE '%PRONTO SOCORRO%' OR n LIKE '%PRONTO ATEND%' OR n LIKE '% SAMU %' OR n LIKE '%URGENCIA%' THEN 'UPA'
        WHEN n LIKE '% USF %' OR n LIKE '% ESF %' OR n LIKE '% PSF %' OR n LIKE '%FAMILIA%' OR n LIKE '% CF %' OR n LIKE '% EMULTI %' THEN 'ESF'
        WHEN n LIKE '% UBS %' OR n LIKE '% USB %' OR n LIKE '%BASICA%' OR n LIKE '%POSTO DE SAUDE%' OR n LIKE '%CENTRO DE SAUDE%' OR n LIKE '%CENTRO MUNICIPAL DE SA%' OR n LIKE '%CENTRO SAUDE%' THEN 'UBS'
        WHEN n LIKE '%POLICL%' OR n LIKE '% CAPS %' OR n LIKE '% CEO %' OR n LIKE '%ESPECIAL%' OR n LIKE '%AMBULATORIO%' OR n LIKE '%REABILIT%'
          OR n LIKE '%ODONTO%' OR n LIKE '%PSIQUI%' OR n LIKE '%CENTRO DE ATENCAO%' OR n LIKE '% AME %' OR n LIKE '% PAM %' OR n LIKE '%CEREST%'
          OR n LIKE '%IMUNIZA%' OR n LIKE '%MELHOR EM CASA%' OR n LIKE '%MATERNO%' THEN 'AE'
        WHEN n LIKE '%SECRETARIA%' OR n LIKE '%VIGILANCIA%' OR n LIKE '%COORDENA%' OR n LIKE '%ABASTECIMENTO%' OR n LIKE '%FARMA%'
          OR n LIKE '%CONSORCIO%' OR n LIKE '%CENTRAL DA ASSIST%' OR n LIKE '%LOGISTICA%' THEN 'G'
    END);
GO

/* ---------------------- PAINEL PÚBLICO DO PROJETO ------------------------- */
IF COL_LENGTH('tab_projetos', 'painel_publico') IS NULL ALTER TABLE tab_projetos ADD painel_publico BIT NOT NULL CONSTRAINT DF_projetos_painel_publico DEFAULT 0;
IF COL_LENGTH('tab_projetos', 'slug_publico') IS NULL   ALTER TABLE tab_projetos ADD slug_publico VARCHAR(60) NULL;
GO
/* Unicidade do slug validada na API (índice filtrado exigiria QUOTED_IDENTIFIER ON em todo cliente). */

/* Primeiro painel: Projeto Paraíba -> operaecho.com/paraiba */
UPDATE tab_projetos SET painel_publico = 1, slug_publico = 'paraiba'
 WHERE nome_projeto = 'Projeto Paraíba' AND slug_publico IS NULL
   AND NOT EXISTS (SELECT 1 FROM tab_projetos WHERE slug_publico = 'paraiba');
GO

/* --------------------------- REGRAS DE ACESSO ----------------------------- */
IF NOT EXISTS (SELECT 1 FROM tab_regras_acesso WHERE nome_perfil = 'Administrador' AND nome_modulo = 'parametros')
    INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES ('Administrador', 'parametros', 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM tab_regras_acesso WHERE nome_perfil = 'Administrador' AND nome_modulo = 'regioes')
    INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES ('Administrador', 'regioes', 1, 1, 1);
GO
