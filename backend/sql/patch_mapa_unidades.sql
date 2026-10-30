/* =============================================================================
   OPERA ECHO - MAPA DE UNIDADES / PROJETOS ATIVOS  (idempotente)
   - Coordenadas por unidade (latitude/longitude). Sem coordenada, o mapa usa o
     centro do município (tab_cidades) e sinaliza "localização aproximada".
   - Índices de apoio aos relatórios (projeto/unidade e período das atividades).
   - Regras de acesso dos novos relatórios para o perfil Administrador.
   ============================================================================= */
SET NOCOUNT ON;

/* ------------------------------ UNIDADES ---------------------------------- */
IF COL_LENGTH('tab_unidades', 'latitude') IS NULL   ALTER TABLE tab_unidades ADD latitude  DECIMAL(9,6) NULL;
IF COL_LENGTH('tab_unidades', 'longitude') IS NULL  ALTER TABLE tab_unidades ADD longitude DECIMAL(9,6) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_unidades_coordenadas')
    ALTER TABLE tab_unidades WITH NOCHECK ADD CONSTRAINT CK_unidades_coordenadas CHECK (
        (latitude IS NULL AND longitude IS NULL)
        OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    );
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_unidades_projeto')
    CREATE INDEX IX_tab_unidades_projeto ON tab_unidades(id_projeto) INCLUDE (ativo, id_cidade);
GO

/* ------------------------- ATIVIDADES (PERÍODO) --------------------------- */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_atividades_periodo')
    CREATE INDEX IX_tab_atividades_periodo ON tab_atividades(data_inicio, data_fim) INCLUDE (id_projeto, id_unidade, id_implantador);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_proj_atividades_periodo')
    CREATE INDEX IX_tab_proj_atividades_periodo ON tab_proj_atividades(data_inicio, data_fim) INCLUDE (id_projeto, id_unidade, id_implantador);
GO

/* Registros legados sem data_inicio/data_fim (gravados só com data_atividade) */
UPDATE tab_atividades      SET data_inicio = data_atividade WHERE data_inicio IS NULL AND data_atividade IS NOT NULL;
UPDATE tab_atividades      SET data_fim    = data_inicio    WHERE data_fim IS NULL AND data_inicio IS NOT NULL;
UPDATE tab_proj_atividades SET data_inicio = data_atividade WHERE data_inicio IS NULL AND data_atividade IS NOT NULL;
UPDATE tab_proj_atividades SET data_fim    = data_inicio    WHERE data_fim IS NULL AND data_inicio IS NOT NULL;
GO

/* --------------------------- REGRAS DE ACESSO ----------------------------- */
IF NOT EXISTS (SELECT 1 FROM tab_regras_acesso WHERE nome_perfil = 'Administrador' AND nome_modulo = 'rel_projetos_ativos')
    INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES ('Administrador', 'rel_projetos_ativos', 1, 1, 1);
IF NOT EXISTS (SELECT 1 FROM tab_regras_acesso WHERE nome_perfil = 'Administrador' AND nome_modulo = 'rel_mapa_unidades')
    INSERT INTO tab_regras_acesso (nome_perfil, nome_modulo, pode_acessar, pode_novo, pode_editar) VALUES ('Administrador', 'rel_mapa_unidades', 1, 1, 1);
GO
