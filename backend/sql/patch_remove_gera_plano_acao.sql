-- ================================================================
-- Opera Echo - remove tab_produtos.gera_plano_acao
-- O Plano de Ação não é mais vinculado ao produto: qualquer produto ativo pode
-- servir de modelo opcional. Idempotente. Aborta se alguma view/procedure usar a coluna.
-- Rodar: node scripts/aplicarPatch.js sql/patch_remove_gera_plano_acao.sql
-- ================================================================
IF COL_LENGTH('dbo.tab_produtos', 'gera_plano_acao') IS NOT NULL
BEGIN
    IF EXISTS (SELECT 1 FROM sys.sql_modules WHERE definition LIKE '%gera_plano_acao%')
        THROW 50001, 'Há view/procedure/trigger usando gera_plano_acao. Ajuste-a antes de remover a coluna.', 1;

    DECLARE @sql nvarchar(max) = N'';
    -- defaults e checks presos à coluna
    SELECT @sql += N'ALTER TABLE dbo.tab_produtos DROP CONSTRAINT ' + QUOTENAME(dc.name) + N';'
    FROM sys.default_constraints dc
    JOIN sys.columns c ON c.object_id = dc.parent_object_id AND c.column_id = dc.parent_column_id
    WHERE dc.parent_object_id = OBJECT_ID('dbo.tab_produtos') AND c.name = 'gera_plano_acao';
    SELECT @sql += N'ALTER TABLE dbo.tab_produtos DROP CONSTRAINT ' + QUOTENAME(cc.name) + N';'
    FROM sys.check_constraints cc
    JOIN sys.columns c ON c.object_id = cc.parent_object_id AND c.column_id = cc.parent_column_id
    WHERE cc.parent_object_id = OBJECT_ID('dbo.tab_produtos') AND c.name = 'gera_plano_acao';
    -- índices que usam a coluna
    SELECT @sql += N'DROP INDEX ' + QUOTENAME(i.name) + N' ON dbo.tab_produtos;'
    FROM sys.indexes i
    JOIN sys.index_columns ic ON ic.object_id = i.object_id AND ic.index_id = i.index_id
    JOIN sys.columns c ON c.object_id = ic.object_id AND c.column_id = ic.column_id
    WHERE i.object_id = OBJECT_ID('dbo.tab_produtos') AND c.name = 'gera_plano_acao' AND i.is_primary_key = 0;
    EXEC sp_executesql @sql;

    ALTER TABLE dbo.tab_produtos DROP COLUMN gera_plano_acao;
END
GO
