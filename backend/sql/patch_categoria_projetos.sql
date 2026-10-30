/* =============================================================================
   OPERA ECHO - CATEGORIA DE PROJETOS (A, B, C)  (idempotente) - v2026.11.1.2
   - Categorias fixas (sem cadastro): A, B ou C, garantidas por CHECK.
   - Projetos existentes ficam sem categoria até serem editados no cadastro
     (o formulário exige a escolha ao salvar).
   Uso (na pasta backend): node scripts/aplicarPatch.js sql/patch_categoria_projetos.sql
   ============================================================================= */
SET NOCOUNT ON;

IF COL_LENGTH('tab_projetos', 'categoria') IS NULL ALTER TABLE tab_projetos ADD categoria CHAR(1) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_projetos_categoria')
    ALTER TABLE tab_projetos WITH CHECK ADD CONSTRAINT CK_projetos_categoria CHECK (categoria IS NULL OR categoria IN ('A', 'B', 'C'));
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_tab_projetos_categoria')
    CREATE INDEX IX_tab_projetos_categoria ON tab_projetos(categoria) INCLUDE (ativo);
GO
