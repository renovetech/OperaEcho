USE msdb;
GO
EXEC dbo.sp_add_job
    @job_name = N'REFRESH - HML a partir do TRUNK (diario 03h)',
    @enabled = 1,
    @description = N'Restaura o último backup do TRUNK por cima do HML';

EXEC dbo.sp_add_jobstep
    @job_name = N'REFRESH - HML a partir do TRUNK (diario 03h)',
    @step_name = N'Restore no HML',
    @subsystem = N'TSQL',
    @database_name = N'DBA',
    @command = N'EXEC dbo.usp_Refresh_HML_from_TRUNK;',
    @retry_attempts = 1,
    @retry_interval = 5;

EXEC dbo.sp_add_schedule
    @schedule_name = N'Diario_0300',
    @freq_type = 4,
    @freq_interval = 1,
    @active_start_time = 030000;  -- 03:00:00

EXEC dbo.sp_attach_schedule
    @job_name = N'REFRESH - HML a partir do TRUNK (diario 03h)',
    @schedule_name = N'Diario_0300';

EXEC dbo.sp_add_jobserver
    @job_name = N'REFRESH - HML a partir do TRUNK (diario 03h)';
GO