-- Banco utilitário para guardar as rotinas de manutenção
IF DB_ID(N'DBA') IS NULL
    CREATE DATABASE DBA;
GO

USE DBA;
GO

-- Procedure de BACKUP FULL do TRUNK
CREATE OR ALTER PROCEDURE dbo.usp_BackupFull_TRUNK
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @arquivo NVARCHAR(500);

    SET @arquivo = N'D:\Backups\SRV_OPERAECHO_TRUNK_'
        + CONVERT(VARCHAR(8), GETDATE(), 112) + N'_'                      -- AAAAMMDD
        + REPLACE(CONVERT(VARCHAR(8), GETDATE(), 108), ':', '') + N'.bak'; -- HHMMSS

    BACKUP DATABASE SRV_OPERAECHO_TRUNK
    TO DISK = @arquivo
    WITH FORMAT, INIT, COMPRESSION,
         NAME = N'Backup Full SRV_OPERAECHO_TRUNK',
         STATS = 10;
END;
GO

-- Procedure de REFRESH do HML a partir do último backup do TRUNK
CREATE OR ALTER PROCEDURE dbo.usp_Refresh_HML_from_TRUNK
AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @arquivo NVARCHAR(500);
    DECLARE @srcData SYSNAME, @srcLog SYSNAME;
    DECLARE @tgtData NVARCHAR(500), @tgtLog NVARCHAR(500);
    DECLARE @sql NVARCHAR(MAX);

    -- 1) localiza o backup full mais recente do TRUNK (lê o histórico do msdb)
    SELECT TOP 1 @arquivo = mf.physical_device_name
    FROM msdb.dbo.backupset bs
    JOIN msdb.dbo.backupmediafamily mf ON bs.media_set_id = mf.media_set_id
    WHERE bs.database_name = N'SRV_OPERAECHO_TRUNK' AND bs.type = 'D'  -- D = full
    ORDER BY bs.backup_finish_date DESC;

    IF @arquivo IS NULL
    BEGIN
        RAISERROR('Nenhum backup full do SRV_OPERAECHO_TRUNK foi encontrado.', 16, 1);
        RETURN;
    END

    -- 2) nomes lógicos da origem (TRUNK)
    SELECT @srcData = name FROM sys.master_files WHERE database_id = DB_ID(N'SRV_OPERAECHO_TRUNK') AND type = 0;
    SELECT @srcLog  = name FROM sys.master_files WHERE database_id = DB_ID(N'SRV_OPERAECHO_TRUNK') AND type = 1;

    -- 3) caminhos físicos do destino (HML) — mantém os arquivos do próprio HML
    SELECT @tgtData = physical_name FROM sys.master_files WHERE database_id = DB_ID(N'SRV_OPERAECHO_HML') AND type = 0;
    SELECT @tgtLog  = physical_name FROM sys.master_files WHERE database_id = DB_ID(N'SRV_OPERAECHO_HML') AND type = 1;

    -- 4) derruba as conexões do HML para liberar o restore
    ALTER DATABASE SRV_OPERAECHO_HML SET SINGLE_USER WITH ROLLBACK IMMEDIATE;

    -- 5) restaura o backup do TRUNK por cima do HML
    SET @sql = N'RESTORE DATABASE SRV_OPERAECHO_HML FROM DISK = N''' + @arquivo + N''' WITH REPLACE, RECOVERY,
        MOVE N''' + @srcData + N''' TO N''' + @tgtData + N''',
        MOVE N''' + @srcLog  + N''' TO N''' + @tgtLog  + N''',
        STATS = 10;';

    BEGIN TRY
        EXEC sp_executesql @sql;
    END TRY
    BEGIN CATCH
        ALTER DATABASE SRV_OPERAECHO_HML SET MULTI_USER;  -- reabre mesmo se falhar
        THROW;
    END CATCH

    -- 6) reabre o HML
    ALTER DATABASE SRV_OPERAECHO_HML SET MULTI_USER;
END;
GO