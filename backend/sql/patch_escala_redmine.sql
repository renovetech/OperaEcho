-- patch_escala_redmine.sql
-- Nº do Redmine (opcional) nas escalas de Implantação e de Projetos.
-- Não aparece na escala nem em relatórios; é usado só nas mensagens de escala do WhatsApp.
IF COL_LENGTH('dbo.tab_escalas', 'redmine') IS NULL
    ALTER TABLE dbo.tab_escalas ADD redmine VARCHAR(30) NULL;
GO
IF COL_LENGTH('dbo.tab_proj_escalas', 'redmine') IS NULL
    ALTER TABLE dbo.tab_proj_escalas ADD redmine VARCHAR(30) NULL;
GO
