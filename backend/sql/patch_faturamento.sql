/* backend/sql/patch_faturamento.sql
 * Operações > Lançar Faturamento + Painéis > Faturamento Consolidado.
 * Idempotente. O backend também cria estas tabelas automaticamente no primeiro uso
 * (routes/faturamento.js). */

IF OBJECT_ID('tab_faturamento_lancamento', 'U') IS NULL
    CREATE TABLE tab_faturamento_lancamento (
        id_lancamento INT IDENTITY(1,1) PRIMARY KEY,
        id_projeto INT NOT NULL,
        id_unidade INT NOT NULL,
        id_produto INT NOT NULL,
        competencia CHAR(6) NOT NULL,
        tipo VARCHAR(4) NOT NULL,               -- BPA | APAC | AIH
        arquivo NVARCHAR(255) NULL,
        competencia_arquivo CHAR(6) NULL,
        cnes_arquivo VARCHAR(7) NULL,
        sigtap_competencia CHAR(6) NULL,        -- tabela usada para valorizar
        qt_registros INT NOT NULL DEFAULT 0,
        qt_pacientes INT NOT NULL DEFAULT 0,
        qt_procedimentos INT NOT NULL DEFAULT 0,
        qt_total INT NOT NULL DEFAULT 0,
        qt_sem_valor INT NOT NULL DEFAULT 0,    -- procedimentos não encontrados na SIGTAP
        vl_total DECIMAL(16,2) NOT NULL DEFAULT 0,
        id_usuario INT NULL,
        usuario NVARCHAR(150) NULL,
        dt_lancamento DATETIME NOT NULL,
        CONSTRAINT UQ_tab_faturamento_lancamento UNIQUE (id_projeto, id_unidade, id_produto, competencia, tipo)
    );

IF OBJECT_ID('tab_faturamento_item', 'U') IS NULL
    CREATE TABLE tab_faturamento_item (
        id_item BIGINT IDENTITY(1,1) PRIMARY KEY,
        id_lancamento INT NOT NULL REFERENCES tab_faturamento_lancamento(id_lancamento) ON DELETE CASCADE,
        origem VARCHAR(6) NOT NULL,             -- BPA-C | BPA-I | APAC | AIH-P (principal) | AIH-S (secundário/especial)
        co_procedimento VARCHAR(10) NOT NULL,
        no_procedimento NVARCHAR(250) NULL,
        co_cbo VARCHAR(6) NOT NULL DEFAULT '',
        quantidade INT NOT NULL,
        vl_unitario DECIMAL(14,2) NOT NULL DEFAULT 0,
        vl_total DECIMAL(16,2) NOT NULL DEFAULT 0
    );

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_faturamento_item_lanc')
    CREATE INDEX IX_tab_faturamento_item_lanc ON tab_faturamento_item (id_lancamento) INCLUDE (co_procedimento, co_cbo, quantidade, vl_total);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_faturamento_lancamento_comp')
    CREATE INDEX IX_tab_faturamento_lancamento_comp ON tab_faturamento_lancamento (competencia, id_projeto, id_unidade);
GO

-- Acesso: o Administrador já enxerga as telas. Para os demais perfis, libere em
-- Cadastro > Perfil de Acesso: 'Lançar Faturamento' (faturamento_lancar: novo = lançar,
-- editar = excluir/recalcular) e 'Painel: Faturamento Consolidado' (painel_faturamento).
