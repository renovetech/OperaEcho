/* ARQUIVO: routes/atividades.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, temPermissao, autorizarModulo } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { parseIntSafe } = require('../utils/validators');
const { filtroPorProjeto } = require('../middlewares/lotacao');
const upload = require('../config/upload');
const { regrasRegistro, HORA_VALIDA } = require('../utils/parametros');
const { assinarLista, caminhosMantidos, trechoSeguro, descartarUploads } = require('../utils/arquivos');
const fs = require('fs');
const path = require('path');

const MOD = 'registro_atividades';
// Antes de receber arquivos: precisa ao menos poder criar OU editar no módulo
// (a ação exata é conferida depois, com o corpo do multipart já lido).
const podeGravarAlgo = async (req, res, next) => {
    try {
        if (await temPermissao(req, MOD, 'novo') || await temPermissao(req, MOD, 'editar')) return next();
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    } catch (e) { next(e); }
};

// ==============================================================================
// BUSCAR ATIVIDADES
// ==============================================================================
router.get('/atividades/buscar', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const { termo, dataInicio, dataFim, id_implantador, id_projeto, id_unidade, motivo } = req.query;
    // Paginação limitada
    const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
    const limite = Math.min(1000, Math.max(1, parseInt(req.query.limite) || 50));
    const offset = (pagina - 1) * limite;
    const request = pool.request();
    let whereClause = " WHERE 1=1 ";

    if (termo && termo !== 'undefined' && termo !== '') {
        whereClause += " AND (u.nome_completo LIKE @termo OR un.nome_unidade LIKE @termo OR a.motivos LIKE @termo)";
        request.input('termo', sql.VarChar, `%${termo}%`);
    }
    // Período por SOBREPOSIÇÃO: atividade de vários dias (ex.: 30/09 até 02/10)
    // aparece em qualquer filtro que toque o intervalo - mesma regra dos relatórios.
    if (dataInicio && dataInicio !== 'undefined' && dataInicio !== '') {
        whereClause += " AND CAST(ISNULL(a.data_fim, ISNULL(a.data_inicio, a.data_atividade)) AS DATE) >= @di";
        request.input('di', sql.Date, dataInicio);
    }
    if (dataFim && dataFim !== 'undefined' && dataFim !== '') {
        whereClause += " AND CAST(ISNULL(a.data_inicio, a.data_atividade) AS DATE) <= @df";
        request.input('df', sql.Date, dataFim);
    }
    if (id_implantador && id_implantador !== 'undefined' && id_implantador !== '') {
        whereClause += " AND (a.id_implantador = @imp OR a.id_atividade IN (SELECT id_atividade FROM tab_atividade_implantadores WHERE id_implantador = @imp))";
        request.input('imp', sql.Int, parseIntSafe(id_implantador));
    }
    if (id_projeto && id_projeto !== 'undefined' && id_projeto !== '') {
        whereClause += " AND a.id_projeto = @proj";
        request.input('proj', sql.Int, parseIntSafe(id_projeto));
    }
    if (id_unidade && id_unidade !== 'undefined' && id_unidade !== '') {
        whereClause += " AND a.id_unidade = @uni";
        request.input('uni', sql.Int, parseIntSafe(id_unidade));
    }
    if (motivo && motivo !== 'undefined' && motivo !== '') {
        whereClause += " AND a.motivos LIKE @mot";
        request.input('mot', sql.VarChar, `%${motivo}%`);
    }

    // MÓDULO IMPLANTAÇÃO: visão consolidada por padrão (todos os registros, de
    // todos os implantadores). Exceção por FUNÇÃO: Analista, Líder de Projeto e
    // Operador enxergam apenas os registros da própria lotação (mesmo escopo das
    // demais telas). O isolamento dos Projetos segue nas rotas /projetos/*.
    const _funcao = ((req.escopo && req.escopo.nome_funcao) || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    if (['ANALISTA', 'LIDER DE PROJETO', 'OPERADOR'].includes(_funcao)) {
        whereClause += filtroPorProjeto(request, req.escopo, 'a.id_projeto');
    }

    const countQuery = `
        SELECT COUNT(*) as total 
        FROM tab_atividades a
        LEFT JOIN tab_usuarios u ON a.id_implantador = u.id_usuario
        LEFT JOIN tab_projetos p ON a.id_projeto = p.id_projeto
        LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade
        ${whereClause}
    `;
    const totalResult = await request.query(countQuery);
    const total = totalResult.recordset[0].total;

    const dataQuery = `
        SELECT a.*, u.nome_completo as nome_implantador, p.nome_projeto, un.nome_unidade,
            (SELECT u2.id_usuario, u2.nome_completo FROM tab_atividade_implantadores ai INNER JOIN tab_usuarios u2 ON ai.id_implantador = u2.id_usuario WHERE ai.id_atividade = a.id_atividade FOR JSON PATH) as lista_implantadores,
            (SELECT u3.id_usuario, u3.nome_completo FROM tab_atividade_equipe_projeto ep INNER JOIN tab_usuarios u3 ON ep.id_usuario = u3.id_usuario WHERE ep.id_atividade = a.id_atividade FOR JSON PATH) as lista_equipe_projeto
        FROM tab_atividades a
        LEFT JOIN tab_usuarios u ON a.id_implantador = u.id_usuario
        LEFT JOIN tab_projetos p ON a.id_projeto = p.id_projeto
        LEFT JOIN tab_unidades un ON a.id_unidade = un.id_unidade
        ${whereClause}
        ORDER BY a.data_atividade DESC, a.id_atividade DESC
        OFFSET ${offset} ROWS FETCH NEXT ${limite} ROWS ONLY
    `;
    const result = await request.query(dataQuery);

    const dadosMapeados = result.recordset.map(row => ({
        ...row,
        caminho_arquivo: assinarLista(row.caminho_arquivo),
        lista_implantadores: row.lista_implantadores ? JSON.parse(row.lista_implantadores) : [],
        lista_equipe_projeto: row.lista_equipe_projeto ? JSON.parse(row.lista_equipe_projeto) : []
    }));

    res.json({
        total,
        pagina: parseInt(pagina),
        totalPaginas: Math.ceil(total / limite),
        dados: dadosMapeados
    });
}));

// ==============================================================================
// SALVAR ATIVIDADE (CRIAR/EDITAR)
// ==============================================================================
router.post('/atividades/salvar', autenticar, podeGravarAlgo, upload.array('anexos', 20), asyncHandler(async (req, res) => {
    if (!(await temPermissao(req, MOD, req.body.id_atividade ? 'editar' : 'novo'))) {
        descartarUploads(req);
        return res.status(403).json({ erro: 'Sem permissão para esta ação.' });
    }
    // Qualquer recusa daqui em diante não deixa arquivos órfãos no disco
    res.on('finish', () => { if (res.statusCode >= 400) descartarUploads(req); });
    const {
        id_atividade, data_inicio, data_fim, redmine, profissionais_env, 
        motivos, id_projeto, id_unidade, produtos_trabalhados, tempo_gasto
    } = req.body;
    let implantadores_ids = req.body.implantadores_ids;
    
    // Tratamento robusto para implantadores_ids vindos de requisições multipart form-data (React Native/Web)
    let listaIds = [];
    if (implantadores_ids) {
        try {
            // Se for uma string JSON válida, parseia
            if (typeof implantadores_ids === 'string') {
                listaIds = JSON.parse(implantadores_ids);
                // Se o parse resultar em um número único, coloca em array
                if (typeof listaIds === 'number') {
                    listaIds = [listaIds];
                }
            } else if (Array.isArray(implantadores_ids)) {
                // Se já for array, apenas converte os itens para int
                listaIds = implantadores_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
            } else if (typeof implantadores_ids === 'number') {
                 listaIds = [implantadores_ids];
            }
        } catch (e) {
            // Se o parse falhar (ex: mandou "1" como string literal), tenta converter direto
            const parsed = parseInt(implantadores_ids);
            if (!isNaN(parsed)) {
                listaIds = [parsed];
            } else {
                listaIds = [];
            }
        }
    }

    // EQUIPE DO PROJETO (motivo "Apoio ao Projeto") - mesmo tratamento robusto.
    let equipe_projeto_ids = req.body.equipe_projeto_ids;
    let listaEqpProj = [];
    if (equipe_projeto_ids) {
        try {
            if (typeof equipe_projeto_ids === 'string') {
                listaEqpProj = JSON.parse(equipe_projeto_ids);
                if (typeof listaEqpProj === 'number') listaEqpProj = [listaEqpProj];
            } else if (Array.isArray(equipe_projeto_ids)) {
                listaEqpProj = equipe_projeto_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
            } else if (typeof equipe_projeto_ids === 'number') {
                listaEqpProj = [equipe_projeto_ids];
            }
        } catch (e) {
            const parsed = parseInt(equipe_projeto_ids);
            listaEqpProj = !isNaN(parsed) ? [parsed] : [];
        }
    }
    listaEqpProj = [...new Set((Array.isArray(listaEqpProj) ? listaEqpProj : []).map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0))];

    if (!data_inicio || !id_unidade || !motivos || !Array.isArray(listaIds) || listaIds.length === 0) {
        return res.status(400).json({ erro: 'Preencha os campos obrigatórios. É obrigatório selecionar pelo menos um implantador na Equipe - o sistema NÃO atrela automaticamente o usuário que está criando o registro.' });
    }

    // Garante que todos os IDs são inteiros válidos e remove duplicatas
    listaIds = [...new Set(listaIds.map(id => parseInt(id)).filter(id => !isNaN(id) && id > 0))];
    if (listaIds.length === 0) {
        return res.status(400).json({ erro: 'Lista de implantadores inválida. Selecione pelo menos um implantador válido.' });
    }

    // PARÂMETROS do módulo Implantação (menu Parâmetros): anexo, horas e equipe do Apoio.
    const regras = await regrasRegistro('implantacao');

    // REGRA "Apoio ao Projeto": a Equipe do Projeto é obrigatória (se o parâmetro estiver ligado).
    const _ehApoio = String(motivos || '').split(',').map(m => m.trim()).includes('Apoio ao Projeto');
    if (regras.equipeApoio && _ehApoio && listaEqpProj.length === 0) {
        return res.status(400).json({ erro: 'Para o motivo "Apoio ao Projeto" é obrigatório informar a Equipe do Projeto.' });
    }

    // Horas trabalhadas (Tempo Gasto hh:mm)
    const _tempo = String(tempo_gasto || '').trim();
    if (regras.horas && !_tempo) return res.status(400).json({ erro: 'Informe o Tempo Gasto (hh:mm).' });
    if (_tempo && !HORA_VALIDA.test(_tempo)) return res.status(400).json({ erro: 'Tempo Gasto inválido. Use o formato hh:mm.' });

    // S\u00f3 anexos locais j\u00e1 existentes
    let anexosAtuais = '';
    if (id_atividade) {
        const rAtual = await (await connectToDb()).request().input('id', sql.Int, parseInt(id_atividade))
            .query("SELECT caminho_arquivo FROM tab_atividades WHERE id_atividade = @id");
        if (rAtual.recordset.length === 0) return res.status(404).json({ erro: 'Registro não encontrado.' });
        anexosAtuais = rAtual.recordset[0].caminho_arquivo || '';
    }
    let caminhos = caminhosMantidos(req.body.arquivos_antigos_mantidos, anexosAtuais);

    if (req.files && req.files.length > 0) {
        req.files.forEach(file => {
            let finalFilename = file.filename;

            if (file.filename.includes('-Colaborador-')) {
                // Sanitizado: o nome entra no caminho do arquivo
                const nomeReal = trechoSeguro(req.body.nome_usuario_upload || req.usuario.usuario);
                const newFilename = file.filename.replace('-Colaborador-', `-${nomeReal}-`);
                const oldPath = file.path;
                const newPath = path.join(file.destination, newFilename);
                
                try {
                    fs.renameSync(oldPath, newPath);
                    finalFilename = newFilename;
                } catch(e) {}
            }
            // Registra o caminho do arquivo enviado (mesmo comportamento de projAtividades.js).
            caminhos.push('uploads/atividades/' + finalFilename);
        });
    }

    const caminhoArquivoStr = caminhos.join(',');

    // Anexo obrigatório no servidor (mesma regra do front), exceto "Apoio ao Projeto".
    // PARÂMETRO 'anexo_obrigatorio_implantacao' desligado => anexo opcional em qualquer motivo.
    if (regras.anexo && !_ehApoio && caminhos.filter(c => c && c.trim()).length === 0) {
        return res.status(400).json({ erro: 'É obrigatório anexar pelo menos um arquivo para este motivo.' });
    }

    const pool = await connectToDb();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
        let idAtividade = id_atividade ? parseInt(id_atividade) : null;
        const request = new sql.Request(transaction)
            .input('di', sql.Date, data_inicio)
            .input('df', sql.Date, data_fim || data_inicio)
            .input('r', sql.VarChar(500), redmine || null)
            .input('pf', sql.Int, profissionais_env ? parseInt(profissionais_env) : null)
            .input('tg', sql.VarChar(10), _tempo || null)
            // id_implantador é campo legado para compatibilidade - guarda o primeiro da lista.
            // A fonte de verdade da equipe é tab_atividade_implantadores (lista completa).
            .input('imp', sql.Int, listaIds[0]) 
            .input('m', sql.VarChar(200), motivos)
            .input('pj', sql.Int, parseInt(id_projeto))
            .input('un', sql.Int, parseInt(id_unidade))
            .input('pd', sql.VarChar(500), produtos_trabalhados || '')
            .input('cam_arq', sql.VarChar(sql.MAX), caminhoArquivoStr);

        if (idAtividade) {
            await request.input('id', sql.Int, idAtividade).query(`
                UPDATE tab_atividades SET 
                    data_atividade = @di, data_inicio = @di, data_fim = @df, redmine = @r,
                    profissionais_env = @pf, tempo_gasto = @tg, id_implantador = @imp, motivos = @m,
                    id_projeto = @pj, id_unidade = @un, produtos_trabalhados = @pd, caminho_arquivo = @cam_arq
                WHERE id_atividade = @id
            `);
            await new sql.Request(transaction).input('idA', sql.Int, idAtividade).query("DELETE FROM tab_atividade_implantadores WHERE id_atividade = @idA");
            await new sql.Request(transaction).input('idA', sql.Int, idAtividade).query("DELETE FROM tab_atividade_equipe_projeto WHERE id_atividade = @idA");
        } else {
            const result = await request.query(`
                INSERT INTO tab_atividades 
                (data_atividade, data_inicio, data_fim, redmine, profissionais_env, tempo_gasto, id_implantador, motivos, id_projeto, id_unidade, produtos_trabalhados, caminho_arquivo)
                OUTPUT INSERTED.id_atividade
                VALUES (@di, @di, @df, @r, @pf, @tg, @imp, @m, @pj, @un, @pd, @cam_arq)
            `);
            idAtividade = result.recordset[0].id_atividade;
        }

        if (listaIds && listaIds.length > 0) {
            for (const uid of listaIds) {
                await new sql.Request(transaction).input('idA', sql.Int, idAtividade).input('idU', sql.Int, uid)
                    .query("INSERT INTO tab_atividade_implantadores (id_atividade, id_implantador) VALUES (@idA, @idU)");
            }
        }

        // Equipe do Projeto (Apoio ao Projeto)
        if (listaEqpProj && listaEqpProj.length > 0) {
            for (const uid of listaEqpProj) {
                await new sql.Request(transaction).input('idA', sql.Int, idAtividade).input('idU', sql.Int, uid)
                    .query("INSERT INTO tab_atividade_equipe_projeto (id_atividade, id_usuario) VALUES (@idA, @idU)");
            }
        }

        await transaction.commit();

        res.json({ mensagem: 'Salvo' });
    } catch (err) {
        await transaction.rollback();
        throw err;
    }
}));

// ==============================================================================
// EXCLUIR ATIVIDADE
// ==============================================================================
router.delete('/atividades/:id', autenticar, autorizarModulo(MOD, 'editar'), asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const id = parseInt(req.params.id);
        await new sql.Request(t).input('id', sql.Int, id).query("DELETE FROM tab_atividade_implantadores WHERE id_atividade = @id");
        await new sql.Request(t).input('id', sql.Int, id).query("DELETE FROM tab_atividade_equipe_projeto WHERE id_atividade = @id");
        await new sql.Request(t).input('id', sql.Int, id).query("DELETE FROM tab_atividades WHERE id_atividade = @id");
        await t.commit();
        res.json({ mensagem: 'Excluído' });
    } catch (err) {
        await t.rollback();
        throw err;
    }
}));

module.exports = router;