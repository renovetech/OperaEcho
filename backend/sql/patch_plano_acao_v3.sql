/* =============================================================================
   OPERA ECHO - PLANO DE AÇÃO v3  (idempotente: pode rodar mais de uma vez)
   Pré-requisito: patch_plano_itens.sql (colunas modulo, observacao, datas reais,
   tempo_previsto, tempo_gasto, dt_inicio_andamento, dt_fechamento, prioridade).
   ============================================================================= */
SET NOCOUNT ON;

/* ---------------------------- CABEÇALHO DO PLANO --------------------------- */
IF COL_LENGTH('tab_plano_acao', 'cliente') IS NULL                    ALTER TABLE tab_plano_acao ADD cliente VARCHAR(200) NULL;
IF COL_LENGTH('tab_plano_acao', 'descricao') IS NULL                  ALTER TABLE tab_plano_acao ADD descricao VARCHAR(1000) NULL;
IF COL_LENGTH('tab_plano_acao', 'data_inicio_prevista') IS NULL       ALTER TABLE tab_plano_acao ADD data_inicio_prevista DATE NULL;
IF COL_LENGTH('tab_plano_acao', 'data_fim_prevista') IS NULL          ALTER TABLE tab_plano_acao ADD data_fim_prevista DATE NULL;
IF COL_LENGTH('tab_plano_acao', 'publico') IS NULL                    ALTER TABLE tab_plano_acao ADD publico BIT NOT NULL CONSTRAINT DF_plano_publico DEFAULT 0;
IF COL_LENGTH('tab_plano_acao', 'token_publico') IS NULL              ALTER TABLE tab_plano_acao ADD token_publico UNIQUEIDENTIFIER NULL;
IF COL_LENGTH('tab_plano_acao', 'data_encerramento') IS NULL          ALTER TABLE tab_plano_acao ADD data_encerramento DATETIME NULL;
IF COL_LENGTH('tab_plano_acao', 'justificativa_encerramento') IS NULL ALTER TABLE tab_plano_acao ADD justificativa_encerramento VARCHAR(1000) NULL;
IF COL_LENGTH('tab_plano_acao', 'criado_por') IS NULL                 ALTER TABLE tab_plano_acao ADD criado_por INT NULL;
IF COL_LENGTH('tab_plano_acao', 'data_atualizacao') IS NULL           ALTER TABLE tab_plano_acao ADD data_atualizacao DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_plano_token_publico')
    CREATE UNIQUE INDEX UX_plano_token_publico ON tab_plano_acao(token_publico) WHERE token_publico IS NOT NULL;
GO

/* Plano pode ser montado do zero, sem produto/modelo vinculado */
IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('tab_plano_acao') AND name = 'id_produto' AND is_nullable = 0)
    ALTER TABLE tab_plano_acao ALTER COLUMN id_produto INT NULL;
GO

/* --------------------------------- ITENS ---------------------------------- */
IF COL_LENGTH('tab_plano_itens', 'cliente') IS NULL           ALTER TABLE tab_plano_itens ADD cliente VARCHAR(200) NULL;
IF COL_LENGTH('tab_plano_itens', 'percentual') IS NULL        ALTER TABLE tab_plano_itens ADD percentual INT NULL;
IF COL_LENGTH('tab_plano_itens', 'horas_trabalhadas') IS NULL ALTER TABLE tab_plano_itens ADD horas_trabalhadas INT NULL;   -- minutos (soma dos apontamentos)
IF COL_LENGTH('tab_plano_itens', 'criado_por') IS NULL        ALTER TABLE tab_plano_itens ADD criado_por INT NULL;
IF COL_LENGTH('tab_plano_itens', 'data_atualizacao') IS NULL  ALTER TABLE tab_plano_itens ADD data_atualizacao DATETIME NULL;
GO

/* Ação e observação passam a aceitar textos maiores (sem truncar) */
IF COL_LENGTH('tab_plano_itens', 'descricao') BETWEEN 1 AND 999  ALTER TABLE tab_plano_itens ALTER COLUMN descricao VARCHAR(1000) NULL;
IF COL_LENGTH('tab_plano_itens', 'observacao') BETWEEN 1 AND 999 ALTER TABLE tab_plano_itens ALTER COLUMN observacao VARCHAR(1000) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_plano_itens_plano')
    CREATE INDEX IX_plano_itens_plano ON tab_plano_itens(id_plano) INCLUDE (status, data_fim, id_unidade, modulo);
GO

/* ------------------------- EQUIPE ALOCADA POR ITEM ------------------------- */
IF OBJECT_ID('tab_plano_item_equipe') IS NULL
CREATE TABLE tab_plano_item_equipe (
    id_item    INT NOT NULL,
    id_usuario INT NOT NULL,
    CONSTRAINT PK_plano_item_equipe PRIMARY KEY (id_item, id_usuario)
);
GO

/* --------------------- APONTAMENTOS (HORAS TRABALHADAS) -------------------- */
IF OBJECT_ID('tab_plano_apontamentos') IS NULL
CREATE TABLE tab_plano_apontamentos (
    id_apontamento INT IDENTITY(1,1) PRIMARY KEY,
    id_item        INT NOT NULL,
    id_plano       INT NOT NULL,
    id_usuario     INT NOT NULL,
    data_execucao  DATE NOT NULL,
    minutos        INT NOT NULL CHECK (minutos > 0 AND minutos <= 1440),
    descricao      VARCHAR(500) NULL,
    registrado_por INT NULL,
    data_registro  DATETIME NOT NULL DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_plano_apont_item')
    CREATE INDEX IX_plano_apont_item ON tab_plano_apontamentos(id_item);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_plano_apont_plano')
    CREATE INDEX IX_plano_apont_plano ON tab_plano_apontamentos(id_plano, data_execucao);
GO

/* ------------------------- HISTÓRICO / AUDITORIA --------------------------- */
IF OBJECT_ID('tab_plano_historico') IS NULL
CREATE TABLE tab_plano_historico (
    id_historico   INT IDENTITY(1,1) PRIMARY KEY,
    id_plano       INT NOT NULL,
    id_item        INT NULL,
    acao           VARCHAR(40)  NOT NULL,   -- CRIACAO, ALTERACAO, INCLUSAO_ITEM, EXCLUSAO_ITEM, APONTAMENTO, ENCERRAMENTO...
    campo          VARCHAR(60)  NULL,
    valor_anterior VARCHAR(500) NULL,
    valor_novo     VARCHAR(500) NULL,
    id_usuario     INT NULL,
    data_hora      DATETIME NOT NULL DEFAULT GETDATE()
);
GO
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_plano_hist_plano')
    CREATE INDEX IX_plano_hist_plano ON tab_plano_historico(id_plano, data_hora DESC);
GO

/* ------------------- NOVOS MÓDULOS DE PERMISSÃO (perfis) ------------------- */
/* Concede por padrão aos perfis que já acessam o Plano de Ação. Ajuste depois
   em Cadastro > Perfil de Acesso. */
INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar)
SELECT r.nome_perfil, m.modulo, 1, 0, 0
FROM tab_regras_acesso r
CROSS JOIN (VALUES ('painel_plano_acao'), ('rel_plano_acao')) m(modulo)
WHERE r.nome_modulo = 'plano_acao' AND r.pode_acessar = 1
  AND NOT EXISTS (SELECT 1 FROM tab_regras_acesso x WHERE x.nome_perfil = r.nome_perfil AND x.nome_modulo = m.modulo);
GO

PRINT 'Plano de Ação v3 aplicado.';
