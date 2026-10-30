/* routes/cadastros.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { parseIntSafe } = require('../utils/validators');
const { filtroPorProjeto } = require('../middlewares/lotacao');
const { gerarSlug, validarSlug } = require('../utils/slugPublico');
const painelPublico = require('./painelProjetoPublico');

// Permissão de escrita validada no servidor.
// Registro com id => 'editar'; sem id => 'novo'.
const autorizarGravacao = (modulo, campoId) => async (req, res, next) => {
    try {
        const acao = req.body && req.body[campoId] ? 'editar' : 'novo';
        if (await temPermissao(req, modulo, acao)) return next();
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    } catch (e) { next(e); }
};

// Coordenada opcional: vazio => null; fora da faixa => erro.
const lerCoordenada = (v, limite) => {
    if (v === undefined || v === null || String(v).trim() === '') return null;
    const n = Number(String(v).replace(',', '.'));
    if (!Number.isFinite(n) || Math.abs(n) > limite) return NaN;
    return Math.round(n * 1e6) / 1e6;
};

// ==============================================================================
// PROJETOS
// ==============================================================================
router.get('/projetos', asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_projetos ORDER BY nome_projeto");
    res.json(r.recordset);
}));

router.post('/projetos/salvar', autenticar, autorizarGravacao('projetos', 'id_projeto'), asyncHandler(async (req, res) => {
    const { id_projeto, nome_projeto, ativo, gera_lotacao } = req.body;

    if (!nome_projeto) return res.status(400).json({ erro: 'Nome do projeto é obrigatório.' });
    // Categorias fixas (sem cadastro): A, B ou C.
    const categoria = String(req.body.categoria || '').trim().toUpperCase();
    if (!['A', 'B', 'C'].includes(categoria)) return res.status(400).json({ erro: 'Informe a categoria do projeto (A, B ou C).' });

    // PAINEL PÚBLICO: ao habilitar, o endereço operaecho.com/<slug> é criado
    // automaticamente a partir do nome (ou do endereço informado).
    const publico = req.body.painel_publico === true;
    const slug = publico ? (String(req.body.slug_publico || '').trim().toLowerCase() || gerarSlug(nome_projeto)) : null;
    if (publico) {
        const erroSlug = validarSlug(slug);
        if (erroSlug) return res.status(400).json({ erro: erroSlug });
    }

    const ativoBit = ativo === true ? 1 : 0;
    const pool = await connectToDb();
    if (publico) {
        const dup = await pool.request().input('s', sql.VarChar(60), slug).input('id', sql.Int, parseIntSafe(id_projeto) || 0)
            .query('SELECT nome_projeto FROM tab_projetos WHERE slug_publico = @s AND id_projeto <> @id');
        if (dup.recordset.length) return res.status(400).json({ erro: `O endereço "/${slug}" já é usado pelo projeto "${dup.recordset[0].nome_projeto}".` });
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const request = new sql.Request(transaction)
            .input('n', sql.VarChar, nome_projeto)
            .input('a', sql.Bit, ativoBit)
            .input('gl', sql.Bit, gera_lotacao === true ? 1 : 0)
            .input('pp', sql.Bit, publico ? 1 : 0)
            .input('slug', sql.VarChar(60), slug)
            .input('cat', sql.Char(1), categoria);

        if (id_projeto) {
            // Desabilitar mantém o slug reservado ao projeto (reabilitar volta ao mesmo endereço).
            await request.input('id', sql.Int, id_projeto)
                .query("UPDATE tab_projetos SET nome_projeto=@n, ativo=@a, gera_lotacao=@gl, painel_publico=@pp, slug_publico=ISNULL(@slug, slug_publico), categoria=@cat WHERE id_projeto=@id");

            // REGRA: o status das unidades acompanha o status do projeto.
            // Inativou o projeto -> inativa todas as unidades dele; reativou -> reativa.
            // Não remove vínculos: lançamentos (atividades, escalas, relatórios e
            // painéis) referenciam a unidade por id e permanecem intactos.
            await new sql.Request(transaction)
                .input('id', sql.Int, id_projeto)
                .input('a', sql.Bit, ativoBit)
                .query("UPDATE tab_unidades SET ativo=@a WHERE id_projeto=@id");
        } else {
            await request.query("INSERT INTO tab_projetos (nome_projeto, ativo, gera_lotacao, painel_publico, slug_publico, categoria) VALUES (@n, @a, @gl, @pp, @slug, @cat)");
        }

        await transaction.commit();
        painelPublico.limparCachePainel();
        res.json({ mensagem: 'Salvo com sucesso', slug_publico: slug });
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}));

// ==============================================================================
// PRODUTOS
// ==============================================================================
router.get('/produtos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_produtos ORDER BY nome_produto");
    res.json(r.recordset);
}));

// Produtos ativos disponíveis como MODELO opcional no Novo Plano de Ação
// (o plano não depende mais do produto; o antigo flag gera_plano_acao foi removido).
router.get('/produtos/plano-acao', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_produtos WHERE ativo=1 ORDER BY nome_produto");
    res.json(r.recordset);
}));

router.post('/produtos/salvar', autenticar, autorizarGravacao('produtos', 'id_produto'), asyncHandler(async (req, res) => {
    const { id_produto, nome_produto, ativo } = req.body;

    if (!nome_produto) return res.status(400).json({ erro: 'Nome do produto é obrigatório.' });

    const pool = await connectToDb();
    const request = pool.request()
        .input('n', sql.VarChar, nome_produto)
        .input('a', sql.Bit, ativo === true ? 1 : 0);

    if (id_produto) {
        await request.input('id', sql.Int, id_produto)
            .query("UPDATE tab_produtos SET nome_produto=@n, ativo=@a WHERE id_produto=@id");
    } else {
        await request.query("INSERT INTO tab_produtos (nome_produto, ativo) VALUES (@n, @a)");
    }

    res.json({ mensagem: 'Salvo' });
}));

// ==============================================================================
// TIPOS DE UNIDADE (Hospital, Central de Regulação, UBS, ESF/PSF, Especializada...)
// ==============================================================================
router.get('/tipos-unidade', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query('SELECT id_tipo_unidade, nome_tipo, sigla, grupo, descricao, ordem, ativo FROM tab_tipos_unidade ORDER BY ordem, nome_tipo');
    res.json(r.recordset);
}));

// ==============================================================================
// UNIDADES
// ==============================================================================
router.get('/unidades/buscar', autenticar, asyncHandler(async (req, res) => {
    const { termo, projeto, status, uf, id_cidade, pagina = 1, limite = 10 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);
    const pool = await connectToDb();
    const request = pool.request();

    let whereClause = " WHERE 1=1 ";

    if (termo && termo !== 'undefined' && termo !== '') {
        whereClause += " AND (u.nome_unidade LIKE @termo OR u.cnes LIKE @termo)";
        request.input('termo', sql.VarChar, `%${termo}%`);
    }
    if (projeto && projeto !== 'undefined' && projeto !== '') {
        whereClause += " AND u.id_projeto = @projeto";
        request.input('projeto', sql.Int, projeto);
    }
    if (status && status !== 'undefined' && status !== 'Todos') {
        whereClause += " AND u.ativo = @status";
        request.input('status', sql.Bit, status === 'true' ? 1 : 0);
    }
    if (uf && uf !== 'undefined' && uf !== '') {
        whereClause += " AND e.sigla = @uf";
        request.input('uf', sql.VarChar, uf);
    }
    if (id_cidade && id_cidade !== 'undefined' && id_cidade !== '') {
        whereClause += " AND u.id_cidade = @id_cidade";
        request.input('id_cidade', sql.Int, id_cidade);
    }

    // ISOLAMENTO POR LOTAÇÃO
    // O isolamento por projeto vale APENAS para as funções vinculadas à lotação
    // (Analista, Líder de Projeto, Operador) - idêntico ao módulo de atividades.
    // Implantador / Coordenador de Implantação / Administrador veem todas as
    // unidades de todos os projetos.
    const _funcao = ((req.escopo && req.escopo.nome_funcao) || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    if (['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'].includes(_funcao)) {
        whereClause += filtroPorProjeto(request, req.escopo, 'u.id_projeto');
    }

    // Paginação parametrizada
    request.input('offset', sql.Int, offset);
    request.input('limite', sql.Int, parseInt(limite));

    const queryDados = `
        SELECT u.id_unidade, u.nome_unidade, u.cnes, u.ativo, u.id_cidade, u.id_projeto,
               u.latitude, u.longitude, u.id_macro, u.id_micro, u.id_tipo_unidade, tu.sigla AS sigla_tipo, tu.nome_tipo,
               c.nome_cidade, e.sigla as uf, p.nome_projeto
        FROM tab_unidades u 
        LEFT JOIN tab_cidades c ON u.id_cidade = c.id_cidade 
        LEFT JOIN tab_estados e ON c.id_estado = e.id_estado 
        LEFT JOIN tab_projetos p ON u.id_projeto = p.id_projeto 
        LEFT JOIN tab_tipos_unidade tu ON tu.id_tipo_unidade = u.id_tipo_unidade
        ${whereClause}
        ORDER BY u.nome_unidade
        OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY
    `;

    const queryTotal = `
        SELECT COUNT(*) as total
        FROM tab_unidades u 
        LEFT JOIN tab_cidades c ON u.id_cidade = c.id_cidade 
        LEFT JOIN tab_estados e ON c.id_estado = e.id_estado 
        LEFT JOIN tab_projetos p ON u.id_projeto = p.id_projeto 
        ${whereClause}
    `;

    const rDados = await request.query(queryDados);
    const rTotal = await request.query(queryTotal);

    res.json({
        dados: rDados.recordset,
        total: rTotal.recordset[0].total,
        paginaAtual: parseInt(pagina),
        totalPaginas: Math.ceil(rTotal.recordset[0].total / parseInt(limite))
    });
}));

router.post('/unidades/salvar', autenticar, autorizarGravacao('unidades', 'id_unidade'), asyncHandler(async (req, res) => {
    const d = req.body;

    if (!d.nome_unidade || !d.id_projeto) {
        return res.status(400).json({ erro: 'Nome e projeto são obrigatórios.' });
    }

    const lat = lerCoordenada(d.latitude, 90);
    const lng = lerCoordenada(d.longitude, 180);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
        return res.status(400).json({ erro: 'Coordenadas inválidas. Latitude entre -90 e 90 e longitude entre -180 e 180.' });
    }
    if ((lat === null) !== (lng === null)) {
        return res.status(400).json({ erro: 'Informe latitude e longitude juntas (ou deixe as duas em branco).' });
    }

    const pool = await connectToDb();

    // Macro/Micro região: precisam pertencer ao projeto da unidade (a micro define a macro).
    let idMacro = parseIntSafe(d.id_macro), idMicro = parseIntSafe(d.id_micro);
    if (idMacro || idMicro) {
        const rr = await pool.request().input('p', sql.Int, d.id_projeto).input('ma', sql.Int, idMacro).input('mi', sql.Int, idMicro).query(`
            SELECT (SELECT id_macro FROM tab_macro_regioes WHERE id_macro=@ma AND id_projeto=@p) AS macro_ok,
                   (SELECT mi.id_macro FROM tab_micro_regioes mi JOIN tab_macro_regioes m ON m.id_macro=mi.id_macro
                     WHERE mi.id_micro=@mi AND m.id_projeto=@p) AS macro_da_micro`);
        const { macro_ok, macro_da_micro } = rr.recordset[0];
        if (!macro_da_micro) idMicro = null;
        idMacro = macro_da_micro || macro_ok || null;
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        const request = new sql.Request(transaction);
        request.input('n', sql.VarChar, d.nome_unidade)
            .input('c', sql.VarChar, d.cnes)
            .input('a', sql.Bit, d.ativo ? 1 : 0)
            .input('idC', sql.Int, d.id_cidade)
            .input('idP', sql.Int, d.id_projeto)
            .input('lat', sql.Decimal(9, 6), lat)
            .input('lng', sql.Decimal(9, 6), lng)
            .input('ma', sql.Int, idMacro)
            .input('mi', sql.Int, idMicro)
            .input('tp', sql.Int, parseIntSafe(d.id_tipo_unidade));

        let idUnidade = d.id_unidade;

        if (idUnidade) {
            await request.input('idU', sql.Int, idUnidade)
                .query("UPDATE tab_unidades SET nome_unidade=@n, cnes=@c, ativo=@a, id_cidade=@idC, id_projeto=@idP, latitude=@lat, longitude=@lng, id_macro=@ma, id_micro=@mi, id_tipo_unidade=@tp WHERE id_unidade=@idU");
            await new sql.Request(transaction).input('idU', sql.Int, idUnidade)
                .query("DELETE FROM tab_unidade_produtos WHERE id_unidade=@idU");
        } else {
            const result = await request.query("INSERT INTO tab_unidades (nome_unidade, cnes, ativo, id_cidade, id_projeto, latitude, longitude, id_macro, id_micro, id_tipo_unidade) OUTPUT INSERTED.id_unidade VALUES (@n, @c, @a, @idC, @idP, @lat, @lng, @ma, @mi, @tp)");
            idUnidade = result.recordset[0].id_unidade;
        }

        if (d.produtos && d.produtos.length > 0) {
            for (const prodId of d.produtos) {
                await new sql.Request(transaction).input('idU', sql.Int, idUnidade).input('idP', sql.Int, prodId)
                    .query("INSERT INTO tab_unidade_produtos (id_unidade, id_produto) VALUES (@idU, @idP)");
            }
        }

        await transaction.commit();
        res.json({ mensagem: 'Salvo com sucesso' });
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}));

// ------------------------------------------------------------------------------
// IMPORTAÇÃO EM MASSA DE COORDENADAS (planilha: CNES + latitude + longitude)
// Atualiza só as coordenadas; a unidade é localizada pelo CNES (e projeto, se
// informado). Retorna o resultado linha a linha para conferência.
// ------------------------------------------------------------------------------
router.post('/unidades/coordenadas/importar', autenticar, autorizarModulo('unidades', 'editar'), asyncHandler(async (req, res) => {
    const { id_projeto, linhas } = req.body || {};
    if (!Array.isArray(linhas) || linhas.length === 0) return res.status(400).json({ erro: 'Planilha vazia.' });
    if (linhas.length > 5000) return res.status(400).json({ erro: 'Limite de 5000 linhas por importação.' });
    const idProj = parseIntSafe(id_projeto);

    const pool = await connectToDb();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    const resultado = [];
    try {
        for (const [i, l] of linhas.entries()) {
            const cnes = String(l.cnes ?? '').replace(/\D/g, '');
            const lat = lerCoordenada(l.latitude, 90);
            const lng = lerCoordenada(l.longitude, 180);
            const linha = i + 2; // linha 1 = cabeçalho da planilha
            if (!cnes) { resultado.push({ linha, cnes, status: 'ERRO', motivo: 'CNES vazio' }); continue; }
            if (lat === null || lng === null || Number.isNaN(lat) || Number.isNaN(lng)) {
                resultado.push({ linha, cnes, status: 'ERRO', motivo: 'Coordenada inválida' }); continue;
            }
            const r = await new sql.Request(transaction)
                .input('c', sql.VarChar, cnes).input('lat', sql.Decimal(9, 6), lat).input('lng', sql.Decimal(9, 6), lng)
                .input('p', sql.Int, idProj)
                .query(`UPDATE tab_unidades SET latitude=@lat, longitude=@lng
                        WHERE (cnes=@c OR cnes=RIGHT('0000000' + @c, 7)) AND (@p IS NULL OR id_projeto=@p);
                        SELECT @@ROWCOUNT AS qtd;`);
            const qtd = r.recordset[0].qtd;
            resultado.push(qtd > 0
                ? { linha, cnes, status: 'OK', motivo: qtd > 1 ? `${qtd} unidades atualizadas` : '' }
                : { linha, cnes, status: 'ERRO', motivo: 'Unidade não encontrada' });
        }
        await transaction.commit();
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
    res.json({
        atualizadas: resultado.filter(r => r.status === 'OK').length,
        erros: resultado.filter(r => r.status === 'ERRO').length,
        resultado
    });
}));

router.get('/unidades/:id/produtos', autenticar, asyncHandler(async (req, res) => {
    const idUni = parseIntSafe(req.params.id);
    if (!idUni) return res.json([]);

    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, idUni)
        .query("SELECT p.id_produto, p.nome_produto, p.ativo FROM tab_unidade_produtos up JOIN tab_produtos p ON up.id_produto = p.id_produto WHERE up.id_unidade = @id AND p.ativo = 1");
    res.json(r.recordset);
}));

// ==============================================================================
// CIDADES / MOTIVOS
// ==============================================================================
router.get('/cidades/:uf', asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('uf', sql.VarChar, req.params.uf)
        .query("SELECT c.* FROM tab_cidades c INNER JOIN tab_estados e ON c.id_estado = e.id_estado WHERE e.sigla = @uf ORDER BY c.nome_cidade");
    res.json(r.recordset);
}));

router.get('/motivos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().query("SELECT * FROM tab_motivos");
    res.json(r.recordset);
}));

module.exports = router;