-- ================================================================
-- Opera Echo - Integração WhatsApp (Evolution API) + Mensageria + código de senha
-- Mesmas regras de proteção do número do Renove Saúde (fila, aquecimento,
-- limite por minuto, pausa aleatória e janela de horário), porém com UM
-- número para o sistema inteiro (o Opera Echo não é multiunidade).
-- Idempotente: pode rodar mais de uma vez. Rodar com: node scripts/aplicarPatch.js sql/patch_whatsapp_mensageria.sql
-- ================================================================
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

/* ---------- Usuários: celular confirmado como WhatsApp ---------- */
IF COL_LENGTH('dbo.tab_usuarios', 'celular_whatsapp') IS NULL
    ALTER TABLE dbo.tab_usuarios ADD celular_whatsapp bit NOT NULL CONSTRAINT DF_usuarios_celular_whatsapp DEFAULT (0);
GO

/* ---------- Configuração (linha única) ---------- */
IF OBJECT_ID('dbo.tab_whatsapp_config', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tab_whatsapp_config (
        id                         int            NOT NULL CONSTRAINT PK_whatsapp_config PRIMARY KEY CONSTRAINT CK_whatsapp_config_unica CHECK (id = 1),
        ativo                      bit            NOT NULL CONSTRAINT DF_whats_ativo DEFAULT (0),
        url_api                    varchar(300)   NULL,
        token_acesso               varchar(max)   NULL,     -- apikey da Evolution, cifrada (AES-256-GCM)
        instancia                  varchar(100)   NULL,
        -- Proteção do número (padrões aplicados quando NULL)
        inicio_aquecimento         date           NULL,
        limite_inicial             int            NULL,     -- 80/dia
        crescimento_semanal        int            NULL,     -- 30%
        limite_maximo              int            NULL,     -- 1000/dia
        max_por_minuto             int            NULL,     -- 12
        pausa_min_seg              int            NULL,     -- 2
        pausa_max_seg              int            NULL,     -- 5
        hora_envio_inicio          time(0)        NULL,     -- 08:00
        hora_envio_fim             time(0)        NULL,     -- 20:00
        -- Eventos
        escala_semanal_ativa       bit            NOT NULL CONSTRAINT DF_whats_esc_sem DEFAULT (0),
        escala_semanal_dia         tinyint        NOT NULL CONSTRAINT DF_whats_esc_dia DEFAULT (0),        -- 0=domingo ... 6=sábado
        escala_semanal_hora        time(0)        NOT NULL CONSTRAINT DF_whats_esc_hora DEFAULT ('18:00'),
        escala_semanal_referencia  varchar(10)    NOT NULL CONSTRAINT DF_whats_esc_ref DEFAULT ('PROXIMA'), -- ATUAL | PROXIMA
        escala_semanal_ultima      date           NULL,     -- segunda-feira da última semana enviada
        escala_alteracao_ativa     bit            NOT NULL CONSTRAINT DF_whats_esc_alt DEFAULT (0),
        escala_alteracao_espera    int            NOT NULL CONSTRAINT DF_whats_esc_esp DEFAULT (10),       -- minutos sem novas mudanças
        ferias_ativa               bit            NOT NULL CONSTRAINT DF_whats_ferias DEFAULT (0),
        codigo_senha_ativa         bit            NOT NULL CONSTRAINT DF_whats_codigo DEFAULT (1),
        -- Textos (NULL = padrão do sistema)
        msg_escala_semanal         nvarchar(2000) NULL,
        msg_escala_alteracao       nvarchar(2000) NULL,
        msg_ferias_aprovada        nvarchar(2000) NULL,
        msg_ferias_recusada        nvarchar(2000) NULL,
        msg_codigo_senha           nvarchar(1000) NULL,
        data_atualizacao           datetime       NULL,
        usuario_alteracao          varchar(150)   NULL,
        CONSTRAINT CK_whats_esc_dia CHECK (escala_semanal_dia BETWEEN 0 AND 6),
        CONSTRAINT CK_whats_esc_ref CHECK (escala_semanal_referencia IN ('ATUAL', 'PROXIMA')),
        CONSTRAINT CK_whats_esc_esp CHECK (escala_alteracao_espera BETWEEN 1 AND 240)
    );
    INSERT INTO dbo.tab_whatsapp_config (id) VALUES (1);
END
GO

/* ---------- Fila / trilha de envios ---------- */
IF OBJECT_ID('dbo.tab_whatsapp_envios', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tab_whatsapp_envios (
        id_envio        int IDENTITY(1,1) NOT NULL CONSTRAINT PK_whatsapp_envios PRIMARY KEY,
        id_usuario      int            NULL,
        numero          varchar(20)    NULL,
        tipo_evento     varchar(30)    NOT NULL,  -- ESCALA_SEMANAL | ESCALA_ALTERACAO | FERIAS_APROVADA | FERIAS_RECUSADA | CODIGO_SENHA | TESTE
        modulo          varchar(20)    NULL,      -- IMPLANTACAO | PROJETOS
        referencia      varchar(500)   NULL,      -- semana (AAAA-MM-DD), datas alteradas, id das férias...
        mensagem        nvarchar(max)  NULL,
        status          varchar(20)    NOT NULL,
        prioridade      tinyint        NOT NULL CONSTRAINT DF_whats_env_prio DEFAULT (5),   -- 1 = código de senha (fura a fila)
        liberar_em      datetime       NULL,      -- alteração de escala: agrupa mudanças até esse momento
        expira_em       datetime       NULL,      -- código de senha: não envia depois disso
        motivo          varchar(60)    NULL,
        message_id      varchar(100)   NULL,
        erro            varchar(500)   NULL,
        usuario_origem  varchar(150)   NULL,
        data_criacao    datetime       NOT NULL CONSTRAINT DF_whats_env_criacao DEFAULT (GETDATE()),
        data_envio      datetime       NULL,
        CONSTRAINT CK_whats_env_status CHECK (status IN ('AGUARDANDO', 'PENDENTE', 'ENVIANDO', 'ENVIADO', 'FALHA', 'NAO_ENVIADO', 'CANCELADO'))
    );
    CREATE INDEX IX_whats_env_fila    ON dbo.tab_whatsapp_envios (prioridade, id_envio) WHERE status = 'PENDENTE';
    CREATE INDEX IX_whats_env_agrupa  ON dbo.tab_whatsapp_envios (id_usuario, modulo, liberar_em) WHERE status = 'AGUARDANDO';
    CREATE INDEX IX_whats_env_envio   ON dbo.tab_whatsapp_envios (data_envio) INCLUDE (status) WHERE data_envio IS NOT NULL;
    CREATE INDEX IX_whats_env_criacao ON dbo.tab_whatsapp_envios (data_criacao DESC) INCLUDE (tipo_evento, status);
END
GO

/* ---------- Códigos de redefinição de senha ---------- */
IF OBJECT_ID('dbo.tab_codigos_senha', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.tab_codigos_senha (
        id_codigo     int IDENTITY(1,1) NOT NULL CONSTRAINT PK_codigos_senha PRIMARY KEY,
        id_usuario    int          NOT NULL,
        canal         varchar(10)  NOT NULL,      -- WHATSAPP | EMAIL
        codigo_hash   char(64)     NOT NULL,      -- HMAC-SHA256: o código nunca fica gravado em claro
        destino       varchar(150) NULL,          -- mascarado
        expira_em     datetime     NOT NULL,
        tentativas    int          NOT NULL CONSTRAINT DF_codigos_tent DEFAULT (0),
        usado_em      datetime     NULL,
        ip            varchar(50)  NULL,
        data_criacao  datetime     NOT NULL CONSTRAINT DF_codigos_criacao DEFAULT (GETDATE()),
        CONSTRAINT CK_codigos_canal CHECK (canal IN ('WHATSAPP', 'EMAIL'))
    );
    CREATE INDEX IX_codigos_usuario ON dbo.tab_codigos_senha (id_usuario, data_criacao DESC);
END
GO
