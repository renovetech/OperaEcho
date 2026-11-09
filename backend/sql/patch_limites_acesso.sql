-- Limite de tentativas de login e recuperação de senha, compartilhado entre as instâncias da API.
IF OBJECT_ID('tab_limites_acesso') IS NULL
BEGIN
    CREATE TABLE tab_limites_acesso (
        chave CHAR(64) NOT NULL PRIMARY KEY,
        inicio DATETIME2 NOT NULL,
        tentativas INT NOT NULL
    );
END
GO
