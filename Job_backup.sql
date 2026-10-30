USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'BKP - SRV_OPERAECHO_TRUNK (diario 02h)',
    @enabled = 1,
    @description = N'Backup full diário do SRV_OPERAECHO_TRUNK';

EXEC dbo.sp_add_jobstep
    @job_name = N'BKP - SRV_OPERAECHO_TRUNK (diario 02h)',
    @step_name = N'Backup Full',
    @subsystem = N'TSQL',
    @database_name = N'DBA',
    @command = N'EXEC dbo.usp_BackupFull_TRUNK;',
    @retry_attempts = 2,
    @retry_interval = 5;

EXEC dbo.sp_add_schedule
    @schedule_name = N'Diario_0200',
    @freq_type = 4,            -- diário
    @freq_interval = 1,        -- a cada 1 dia
    @active_start_time = 020000;  -- 02:00:00

EXEC dbo.sp_attach_schedule
    @job_name = N'BKP - SRV_OPERAECHO_TRUNK (diario 02h)',
    @schedule_name = N'Diario_0200';

EXEC dbo.sp_add_jobserver
    @job_name = N'BKP - SRV_OPERAECHO_TRUNK (diario 02h)';
GO