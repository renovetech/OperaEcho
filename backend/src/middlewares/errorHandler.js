
/**
 * Middleware global de tratamento de erros.
 * Captura qualquer erro não tratado nas rotas e retorna resposta padronizada.
 * Erros 5xx não expõem detalhes internos fora de desenvolvimento.
 */
function errorHandler(err, req, res, next) {
    // Detalhes internos só para quem acessa da própria máquina em desenvolvimento.
    // (O .env de produção estava com NODE_ENV=development e expunha mensagens do SQL a qualquer um.)
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.ip);
    const dev = process.env.NODE_ENV === 'development' && local;
    const statusPrevisto = err.status || 500;
    // Não registra a query string (pode conter token de anexo)
    console.error(`[ERRO ${statusPrevisto}] ${req.method} ${req.path}:`, err.message);

    if (dev && statusPrevisto >= 500) {
        console.error(err.stack);
    }

    // Upload recusado pelo multer (tamanho, quantidade, campos)
    if (err.name === 'MulterError') {
        const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo muito grande (máx. 30 MB).'
            : err.code === 'LIMIT_FILE_COUNT' ? 'Quantidade de arquivos acima do permitido (máx. 20).'
            : 'Envio de arquivo inválido.';
        return res.status(400).json({ erro: msg });
    }

    // Corpo JSON malformado / grande demais
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ erro: 'JSON inválido.' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ erro: 'Conteúdo muito grande.' });
    }

    // Violação de constraint (duplicidade, FK, etc)
    if (err.number === 2627 || err.number === 2601) {
        return res.status(409).json({ erro: 'Registro duplicado. Verifique os dados.' });
    }

    // Banco desatualizado (patch em backend/sql não executado): coluna/tabela inexistente.
    // 207 = Invalid column name | 208 = Invalid object name
    if (err.number === 207 || err.number === 208) {
        const objeto = (String(err.message).match(/'([^']+)'/) || [])[1] || '';
        return res.status(500).json({
            erro: `Estrutura do banco desatualizada${objeto ? ` (${err.number === 207 ? 'coluna' : 'objeto'} "${objeto}" não encontrado)` : ''}. Execute os scripts pendentes de backend/sql.`
        });
    }

    // Tempo esgotado ou banco fora do ar: não é erro nos dados enviados.
    if (['ETIMEOUT', 'ESOCKET', 'ECONNCLOSED', 'ENOTOPEN', 'EREQUEST_TIMEOUT'].includes(err.code)) {
        return res.status(503).json({ erro: 'O banco de dados demorou a responder. Tente novamente em instantes.' });
    }

    // Erros de validação do SQL Server
    if (err.name === 'RequestError') {
        return res.status(400).json({
            erro: 'Erro nos dados enviados.',
            detalhe: dev ? err.message : undefined
        });
    }

    const status = err.status || 500;
    res.status(status).json({
        erro: status < 500 || dev || err.expor ? (err.message || 'Erro.') : 'Erro interno do servidor.'
    });
}

/**
 * Wrapper para handlers async.
 * Evita try/catch repetido em toda rota - erros caem no errorHandler automaticamente.
 * Uso: router.get('/rota', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/** Cria um erro HTTP tratável pelo errorHandler. */
function httpErro(status, mensagem) {
    return Object.assign(new Error(mensagem), { status });
}

module.exports = { errorHandler, asyncHandler, httpErro };
