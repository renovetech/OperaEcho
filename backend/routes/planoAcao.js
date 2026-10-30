/* routes/planoAcao.js
 * ------------------------------------------------------------------------
 * PLANO DE AÇÃO v3 - gestão completa:
 *   - criação por templates (multi-módulo), inclusão/exclusão de linhas,
 *     unidades e etapas; reordenação; cliente, equipe e horas trabalhadas;
 *   - regras de negócio no servidor (prazos, transições, travas, auditoria);
 *   - autorização por módulo + isolamento por lotação;
 *   - indicadores (painel) e link público por plano.
 * Pré-requisitos: patch_plano_itens.sql e sql/patch_plano_acao_v3.sql.
 * ------------------------------------------------------------------------ */
const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar, autorizarModulo, temPermissao } = require('../middlewares/auth');
const { asyncHandler, httpErro } = require('../middlewares/errorHandler');
const { filtroPorProjeto, lotacaoNoEscopo } = require('../middlewares/lotacao');
const S = require('../services/planoAcaoService');

const MOD = 'plano_acao';
const podeVer = autorizarModulo(MOD, 'acessar');
const podeNovo = autorizarModulo(MOD, 'novo');
const podeVerPainel = autorizarModulo([MOD, 'painel_plano_acao'], 'acessar');

/* =============================== HELPERS ================================= */
const toInt = (v) => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
const txt = (v, max) => { if (v == null) return null; const s = String(v).trim(); return s ? s.slice(0, max) : null; };
// null = vazio; undefined = formato inválido
const dataOk = (v) => {
    if (v == null || v === '') return null;
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) ? s : undefined;
};
const idUser = (req) => (req.usuario && req.usuario.id_usuario) || null;
const fab = (t) => () => new sql.Request(t);
const escopoPlanos = (req) => (request) =>
    (req.escopo && !req.escopo.global) ? filtroPorProjeto(request, req.escopo, 'p.id_projeto') : '';

async function planoNoEscopo(pool, req, idPlano, { editar = false, excluir = false } = {}) {
    if (!idPlano) throw httpErro(400, 'Plano inválido.');
    const r = await pool.request().input('id', sql.Int, idPlano)
        .query('SELECT id_plano, id_projeto, status, titulo, cliente, publico, token_publico, criado_por FROM tab_plano_acao WHERE id_plano = @id');
    const p = r.recordset[0];
    if (!p) throw httpErro(404, 'Plano não encontrado.');
    if (p.token_publico) p.token_publico = String(p.token_publico).toLowerCase();
    if (req.escopo && !req.escopo.global && !lotacaoNoEscopo(req.escopo, p.id_projeto)) {
        throw httpErro(403, 'Este plano pertence a outra lotação.');
    }
    if (editar && !(await podeEditarPlano(req, p))) {
        throw httpErro(403, 'Você não tem permissão para editar este plano (exige permissão de edição, ser o criador ou ter lotação no projeto).');
    }
    if (excluir && !(await temPermissao(req, MOD, 'editar')) && p.criado_por !== idUser(req)) {
        throw httpErro(403, 'Somente gestores do Plano de Ação ou o criador podem excluir o plano.');
    }
    return p;
}

/* Quem pode editar um plano:
 *  - perfil com "Editar" no módulo Plano de Ação; ou
 *  - quem criou o plano; ou
 *  - quem tem a lotação (projeto) do plano e acesso ao módulo. */
async function podeEditarPlano(req, p) {
    if (!p) return false;
    if (await temPermissao(req, MOD, 'editar')) return true;
    const eu = idUser(req);
    if (eu && p.criado_por === eu) return true;
    const lotacoes = (req.escopo && req.escopo.lotacoes) || [];
    return lotacoes.map(Number).includes(Number(p.id_projeto)) && (await temPermissao(req, MOD, 'acessar'));
}
const garantirEditavel = (p) => {
    if (p.status === S.PLANO.ENCERRADO) throw httpErro(409, 'Plano encerrado: reabra-o para editar.');
};

async function itemComPlano(pool, req, idItem, opts = {}) {
    const r = await pool.request().input('id', sql.Int, idItem)
        .query('SELECT * FROM tab_plano_itens WHERE id_item = @id');
    const item = r.recordset[0];
    if (!item) throw httpErro(404, 'Item não encontrado.');
    const plano = await planoNoEscopo(pool, req, item.id_plano, opts);
    return { item, plano };
}

async function registrar(reqF, { id_plano, id_item = null, acao, campo = null, de = null, para = null, id_usuario = null }) {
    const s = (v) => (v == null ? null : String(v instanceof Date ? S.iso(v) : v).slice(0, 500));
    await reqF()
        .input('p', sql.Int, id_plano).input('i', sql.Int, id_item).input('a', sql.VarChar, acao)
        .input('c', sql.VarChar, campo).input('de', sql.VarChar, s(de)).input('para', sql.VarChar, s(para))
        .input('u', sql.Int, id_usuario)
        .query(`INSERT INTO tab_plano_historico (id_plano, id_item, acao, campo, valor_anterior, valor_novo, id_usuario, data_hora)
                VALUES (@p, @i, @a, @c, @de, @para, @u, GETDATE())`);
}

async function inserirItem(reqF, d) {
    const r = await reqF()
        .input('p', sql.Int, d.id_plano)
        .input('u', sql.Int, d.id_unidade || null)
        .input('grupo', sql.VarChar, d.id_unidade ? null : (d.grupo || 'GERAL'))
        .input('mod', sql.VarChar, d.modulo || null)
        .input('desc', sql.VarChar, d.descricao)
        .input('resp', sql.VarChar, d.responsavel || null)
        .input('cli', sql.VarChar, d.cliente || null)
        .input('prio', sql.VarChar, S.PRIORIDADES.includes(d.prioridade) ? d.prioridade : 'Alta')
        .input('di', sql.Date, d.data_inicio || null)
        .input('df', sql.Date, d.data_fim || null)
        .input('ord', sql.Int, d.ordem)
        .input('cp', sql.Int, d.criado_por || null)
        .query(`INSERT INTO tab_plano_itens
                    (id_plano, id_unidade, titulo, modulo, descricao, responsavel, cliente, status, prioridade,
                     data_inicio, data_fim, ordem, criado_por, data_atualizacao)
                OUTPUT INSERTED.id_item
                VALUES (@p, @u, @grupo, @mod, @desc, @resp, @cli, 'A Iniciar', @prio, @di, @df, @ord, @cp, GETDATE())`);
    return r.recordset[0].id_item;
}

/* =========================================================================
   CRIAR PLANO
   ========================================================================= */
router.post('/plano-acao/salvar', autenticar, podeNovo, asyncHandler(async (req, res) => {
    const b = req.body || {};
    const titulo = txt(b.titulo, 300);
    const idProjeto = toInt(b.id_projeto);
    const idProduto = toInt(b.id_produto);
    const unidades = [...new Set((Array.isArray(b.unidades_ids) ? b.unidades_ids : []).map(toInt).filter(Boolean))];
    const etapasPadrao = Array.isArray(b.etapas_padrao) ? b.etapas_padrao : [];
    const etapasUnidade = Array.isArray(b.etapas_unidade) ? b.etapas_unidade : [];
    const dIni = dataOk(b.data_inicio_prevista), dFim = dataOk(b.data_fim_prevista);

    if (!titulo) throw httpErro(400, 'Informe o título do plano.');
    if (!idProjeto) throw httpErro(400, 'Selecione o projeto.');
    if (dIni === undefined || dFim === undefined) throw httpErro(400, 'Datas previstas inválidas.');
    if (dIni && dFim && dFim < dIni) throw httpErro(400, 'O término previsto não pode ser anterior ao início.');
    // Plano pode nascer vazio (montado do zero) - etapas/ações são validadas uma a uma
    const errosEtapa = [];
    [...etapasPadrao, ...etapasUnidade].forEach((e, i) => {
        const di = dataOk(e.data_inicio), df = dataOk(e.data_fim);
        if (di === undefined || df === undefined) errosEtapa.push(`Ação ${i + 1}: data inválida.`);
        else if (di && df && df < di) errosEtapa.push(`"${String(e.acao || '').slice(0, 40)}": fim anterior ao início.`);
    });
    if (errosEtapa.length) throw httpErro(400, errosEtapa.slice(0, 5).join(' '));
    if (req.escopo && !req.escopo.global && !lotacaoNoEscopo(req.escopo, idProjeto)) {
        throw httpErro(403, 'Projeto fora da sua lotação.');
    }

    const pool = await connectToDb();
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const publico = !!b.publico;
        const rPlano = await new sql.Request(t)
            .input('tit', sql.VarChar, titulo)
            .input('proj', sql.Int, idProjeto)
            .input('prod', sql.Int, idProduto)
            .input('sub', sql.VarChar, txt(b.sub_tipo, 60))
            .input('cli', sql.VarChar, txt(b.cliente, 200))
            .input('desc', sql.VarChar, txt(b.descricao, 1000))
            .input('di', sql.Date, dIni).input('df', sql.Date, dFim)
            .input('pub', sql.Bit, publico)
            .input('tok', sql.UniqueIdentifier, publico ? crypto.randomUUID() : null)
            .input('cp', sql.Int, idUser(req))
            .query(`INSERT INTO tab_plano_acao (titulo, id_projeto, id_produto, sub_tipo, cliente, descricao,
                        data_inicio_prevista, data_fim_prevista, publico, token_publico, criado_por, data_criacao, data_atualizacao, status)
                    OUTPUT INSERTED.id_plano
                    VALUES (@tit, @proj, @prod, @sub, @cli, @desc, @di, @df, @pub, @tok, @cp, GETDATE(), GETDATE(), 'EM ANDAMENTO')`);
        const idPlano = rPlano.recordset[0].id_plano;
        const R = fab(t);

        // Unidades + etapas por unidade (repetidas para cada unidade × módulo)
        for (const idUnidade of unidades) {
            await R().input('p', sql.Int, idPlano).input('u', sql.Int, idUnidade)
                .query(`INSERT INTO tab_plano_acao_detalhes (id_plano, id_unidade, status_unidade) VALUES (@p, @u, 'A INICIAR')`);
            let ordU = 1;
            for (const e of etapasUnidade) {
                const desc = txt(e.acao, 1000);
                if (!desc) continue;
                await inserirItem(R, { id_plano: idPlano, id_unidade: idUnidade, modulo: txt(e.modulo, 60), descricao: desc,
                    responsavel: txt(e.responsavel, 100), prioridade: e.prioridade, ordem: ordU++, criado_por: idUser(req),
                    data_inicio: dataOk(e.data_inicio) || null, data_fim: dataOk(e.data_fim) || null });
            }
        }

        // Etapas gerais (sem unidade) - grupo em "titulo", módulo em "modulo"
        let ordem = 1;
        for (const e of etapasPadrao) {
            const desc = txt(e.acao, 1000);
            if (!desc) continue;
            await inserirItem(R, { id_plano: idPlano, grupo: (txt(e.grupo, 120) || 'GERAL').toUpperCase(), modulo: txt(e.modulo, 60), descricao: desc,
                responsavel: txt(e.responsavel, 100), prioridade: e.prioridade, ordem: ordem++, criado_por: idUser(req),
                data_inicio: dataOk(e.data_inicio) || null, data_fim: dataOk(e.data_fim) || null });
        }

        await registrar(R, { id_plano: idPlano, acao: 'CRIACAO', para: titulo, id_usuario: idUser(req) });
        await t.commit();
        res.json({ mensagem: 'Plano criado!', id_plano: idPlano });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   LISTAGEM (com indicadores por plano)
   ========================================================================= */
router.get('/plano-acao/buscar', autenticar, podeVer, asyncHandler(async (req, res) => {
    const { data, projeto, status, busca } = req.query;
    const pool = await connectToDb();
    await S.sincronizarAtrasos(pool);
    const base = await S.carregarBase(pool, {
        data: dataOk(data) || null, id_projeto: toInt(projeto), status_plano: txt(status, 30), busca: txt(busca, 100)
    }, escopoPlanos(req));
    const painel = S.montarPainel(base);
    const brutos = new Map(base.planos.map(p => [p.id_plano, p]));
    const gestor = await temPermissao(req, MOD, 'editar');
    const lista = [];
    for (const p of painel.planos) {
        const b = brutos.get(p.id_plano);
        lista.push({ ...p, qtd_unidades: p.unidades, modulos: p.produto, nome_produto: p.produto,
            pode_editar: gestor || (await podeEditarPlano(req, b)),
            pode_excluir: gestor || (b && b.criado_por === idUser(req)) });
    }
    res.json(lista);
}));

/* =========================================================================
   SITUAÇÕES
   ========================================================================= */
router.get('/plano-acao/situacoes', autenticar, podeVer, asyncHandler(async (req, res) => {
    res.json(S.STATUS_VALIDOS.map(s => ({ nome: s })));
}));

/* =========================================================================
   PAINEL (indicadores consolidados - respeita lotação)
   ========================================================================= */
router.get('/plano-acao/painel', autenticar, podeVerPainel, asyncHandler(async (req, res) => {
    const q = req.query;
    const pool = await connectToDb();
    await S.sincronizarAtrasos(pool);
    const base = await S.carregarBase(pool, {
        id_plano: toInt(q.id_plano), id_projeto: toInt(q.projeto), status_plano: txt(q.status, 30), cliente: txt(q.cliente, 200),
        dataInicio: dataOk(q.dataInicio) || null, dataFim: dataOk(q.dataFim) || null
    }, escopoPlanos(req));
    res.json(S.montarPainel(base));
}));

/* =========================================================================
   APONTAMENTOS (horas trabalhadas / execuções)
   ========================================================================= */
async function recalcularHoras(reqF, idItem) {
    await reqF().input('id', sql.Int, idItem).query(`
        UPDATE tab_plano_itens
        SET horas_trabalhadas = (SELECT NULLIF(SUM(minutos), 0) FROM tab_plano_apontamentos WHERE id_item = @id),
            data_atualizacao = GETDATE()
        WHERE id_item = @id`);
}

router.get('/plano-acao/itens/:idItem/apontamentos', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const { item } = await itemComPlano(pool, req, toInt(req.params.idItem));
    const r = await pool.request().input('id', sql.Int, item.id_item).query(`
        SELECT a.id_apontamento, a.id_usuario, us.nome_completo, a.data_execucao, a.minutos, a.descricao, a.data_registro, a.registrado_por
        FROM tab_plano_apontamentos a
        JOIN tab_usuarios us ON us.id_usuario = a.id_usuario
        WHERE a.id_item = @id
        ORDER BY a.data_execucao DESC, a.id_apontamento DESC`);
    res.json(r.recordset.map(x => ({ ...x, nome_completo: S.nomeCurto(x.nome_completo) })));
}));

router.post('/plano-acao/itens/:idItem/apontamentos', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, toInt(req.params.idItem));
    garantirEditavel(plano);
    const b = req.body || {};
    const eu = idUser(req);
    const alvo = toInt(b.id_usuario) || eu;
    const dataExec = dataOk(b.data_execucao) || S.hojeISO();
    const minutos = toInt(b.minutos);

    if (dataOk(b.data_execucao) === undefined) throw httpErro(400, 'Data da execução inválida.');
    if (dataExec > S.hojeISO()) throw httpErro(400, 'Não é possível apontar horas em data futura.');
    if (!minutos || minutos <= 0 || minutos > 1440) throw httpErro(400, 'Informe um tempo entre 00:01 e 24:00.');
    if (S.ehFechado(item.status)) throw httpErro(409, 'Item fechado: reabra-o para apontar novas horas.');

    // Regra: aponta para si quem está na equipe do item; para terceiros, só quem pode editar o plano.
    const podeGerir = await podeEditarPlano(req, plano);
    const naEquipe = (await pool.request().input('i', sql.Int, item.id_item).input('u', sql.Int, eu)
        .query('SELECT 1 AS ok FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u')).recordset.length > 0;
    if (!podeGerir && (alvo !== eu || !naEquipe)) {
        throw httpErro(403, 'Apenas integrantes da equipe do item (ou gestores do plano) podem apontar horas.');
    }

    // Teto diário: 24h por pessoa somando todos os planos
    const rDia = await pool.request().input('u', sql.Int, alvo).input('d', sql.Date, dataExec)
        .query('SELECT ISNULL(SUM(minutos), 0) AS total FROM tab_plano_apontamentos WHERE id_usuario = @u AND data_execucao = @d');
    if (rDia.recordset[0].total + minutos > 1440) throw httpErro(400, 'O total apontado para a pessoa nesta data ultrapassa 24h.');

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('i', sql.Int, item.id_item).input('p', sql.Int, item.id_plano).input('u', sql.Int, alvo)
            .input('d', sql.Date, dataExec).input('m', sql.Int, minutos).input('desc', sql.VarChar, txt(b.descricao, 500))
            .input('rp', sql.Int, eu)
            .query(`INSERT INTO tab_plano_apontamentos (id_item, id_plano, id_usuario, data_execucao, minutos, descricao, registrado_por)
                    VALUES (@i, @p, @u, @d, @m, @desc, @rp)`);

        // Garante a pessoa na equipe do item
        await R().input('i', sql.Int, item.id_item).input('u', sql.Int, alvo).query(`
            IF NOT EXISTS (SELECT 1 FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u)
                INSERT INTO tab_plano_item_equipe (id_item, id_usuario) VALUES (@i, @u)`);

        // Regra: primeira execução tira o item de "A Iniciar" e liga o cronômetro
        let mudouStatus = null;
        if (S.normStatus(item.status) === S.ST.A_INICIAR) {
            mudouStatus = S.ST.ANDAMENTO;
            await R().input('i', sql.Int, item.id_item).input('ini', sql.DateTime, item.dt_inicio_andamento || S.agoraBR())
                .input('dir', sql.Date, S.iso(item.data_inicio_real) || dataExec)
                .query(`UPDATE tab_plano_itens SET status = 'Em andamento', dt_inicio_andamento = @ini, data_inicio_real = @dir WHERE id_item = @i`);
        } else if (!item.data_inicio_real || S.iso(item.data_inicio_real) > dataExec) {
            await R().input('i', sql.Int, item.id_item).input('dir', sql.Date, dataExec)
                .query('UPDATE tab_plano_itens SET data_inicio_real = @dir WHERE id_item = @i');
        }
        await recalcularHoras(R, item.id_item);
        await registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'APONTAMENTO', campo: 'horas',
            para: `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')} em ${dataExec}`, id_usuario: eu });
        if (mudouStatus) await registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'ALTERACAO', campo: 'status', de: item.status, para: mudouStatus, id_usuario: eu });
        await t.commit();
        res.json({ ok: true, status: mudouStatus || item.status });
    } catch (err) { await t.rollback(); throw err; }
}));

router.delete('/plano-acao/apontamentos/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const r = await pool.request().input('id', sql.Int, toInt(req.params.id))
        .query('SELECT * FROM tab_plano_apontamentos WHERE id_apontamento = @id');
    const a = r.recordset[0];
    if (!a) throw httpErro(404, 'Apontamento não encontrado.');
    const plano = await planoNoEscopo(pool, req, a.id_plano);
    garantirEditavel(plano);
    const eu = idUser(req);
    if (a.id_usuario !== eu && a.registrado_por !== eu && !(await podeEditarPlano(req, plano))) {
        throw httpErro(403, 'Você só pode excluir os seus próprios apontamentos.');
    }
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('id', sql.Int, a.id_apontamento).query('DELETE FROM tab_plano_apontamentos WHERE id_apontamento = @id');
        await recalcularHoras(R, a.id_item);
        await registrar(R, { id_plano: a.id_plano, id_item: a.id_item, acao: 'EXCLUSAO_APONTAMENTO', campo: 'horas',
            de: `${a.minutos} min em ${S.iso(a.data_execucao)}`, id_usuario: eu });
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   ITENS: INCLUIR / EXCLUIR / REORDENAR
   ========================================================================= */
router.post('/plano-acao/itens/:idItem/mover', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, toInt(req.params.idItem), { editar: true });
    garantirEditavel(plano);
    const sobe = (req.body || {}).direcao === 'cima';
    const r = await pool.request()
        .input('p', sql.Int, item.id_plano).input('u', sql.Int, item.id_unidade)
        .input('m', sql.VarChar, item.modulo).input('g', sql.VarChar, item.id_unidade ? null : item.titulo)
        .input('o', sql.Int, item.ordem || 0).input('id', sql.Int, item.id_item)
        .query(`SELECT TOP 1 id_item, ordem FROM tab_plano_itens
                WHERE id_plano = @p AND id_item <> @id
                  AND ISNULL(id_unidade, -1) = ISNULL(@u, -1)
                  AND ISNULL(modulo, '') = ISNULL(@m, '')
                  AND (@u IS NOT NULL OR ISNULL(titulo, 'GERAL') = ISNULL(@g, 'GERAL'))
                  AND ${sobe ? '(ISNULL(ordem,0) < @o OR (ISNULL(ordem,0) = @o AND id_item < @id))' : '(ISNULL(ordem,0) > @o OR (ISNULL(ordem,0) = @o AND id_item > @id))'}
                ORDER BY ISNULL(ordem,0) ${sobe ? 'DESC' : 'ASC'}, id_item ${sobe ? 'DESC' : 'ASC'}`);
    const viz = r.recordset[0];
    if (!viz) return res.json({ ok: true, movido: false });
    let oA = item.ordem || 0, oB = viz.ordem || 0;
    if (oA === oB) { if (sobe) oA = oB - 1; else oA = oB + 1; }
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t).input('a', sql.Int, item.id_item).input('oa', sql.Int, oB).input('b', sql.Int, viz.id_item).input('ob', sql.Int, oA)
            .query('UPDATE tab_plano_itens SET ordem = @oa WHERE id_item = @a; UPDATE tab_plano_itens SET ordem = @ob WHERE id_item = @b;');
        await t.commit();
    } catch (err) { await t.rollback(); throw err; }
    res.json({ ok: true, movido: true });
}));

router.delete('/plano-acao/itens/:idItem', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const { item, plano } = await itemComPlano(pool, req, toInt(req.params.idItem), { editar: true });
    garantirEditavel(plano);
    const forcar = req.query.forcar === '1';
    const rA = await pool.request().input('i', sql.Int, item.id_item)
        .query('SELECT COUNT(*) AS n FROM tab_plano_apontamentos WHERE id_item = @i');
    if (rA.recordset[0].n > 0 && !forcar) {
        throw httpErro(409, `Este item possui ${rA.recordset[0].n} apontamento(s) de horas. Confirme para excluir junto.`);
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('i', sql.Int, item.id_item).query(`
            DELETE FROM tab_plano_apontamentos WHERE id_item = @i;
            DELETE FROM tab_plano_item_equipe WHERE id_item = @i;
            DELETE FROM tab_plano_itens WHERE id_item = @i;`);
        await registrar(R, { id_plano: item.id_plano, id_item: item.id_item, acao: 'EXCLUSAO_ITEM', de: item.descricao, id_usuario: idUser(req) });
        await S.recalcularStatusPlano(R, item.id_plano);
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

router.post('/plano-acao/:id/itens', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    garantirEditavel(plano);
    const b = req.body || {};
    const descricao = txt(b.descricao, 1000);
    const idUnidade = toInt(b.id_unidade);
    const di = dataOk(b.data_inicio), df = dataOk(b.data_fim);
    if (!descricao) throw httpErro(400, 'Descreva a ação.');
    if (di === undefined || df === undefined) throw httpErro(400, 'Datas inválidas.');
    if (di && df && df < di) throw httpErro(400, 'O fim previsto não pode ser anterior ao início.');
    if (idUnidade) {
        const ru = await pool.request().input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade)
            .query('SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u');
        if (!ru.recordset.length) throw httpErro(400, 'A unidade não pertence a este plano.');
    }
    const modulo = txt(b.modulo, 60);
    const grupo = idUnidade ? null : (txt(b.grupo, 120) || 'GERAL').toUpperCase();
    const aposItem = toInt(b.apos_id_item);

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        let ordem;
        const ctx = (r) => r.input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade).input('m', sql.VarChar, modulo).input('g', sql.VarChar, grupo);
        const filtroCtx = `id_plano = @p AND ISNULL(id_unidade,-1) = ISNULL(@u,-1) AND ISNULL(modulo,'') = ISNULL(@m,'')
                           AND (@u IS NOT NULL OR ISNULL(titulo,'GERAL') = ISNULL(@g,'GERAL'))`;
        if (aposItem) {
            const ra = await ctx(R()).input('a', sql.Int, aposItem).query(`SELECT ordem FROM tab_plano_itens WHERE id_item = @a AND ${filtroCtx}`);
            if (ra.recordset.length) {
                ordem = (ra.recordset[0].ordem || 0) + 1;
                await ctx(R()).input('o', sql.Int, ordem).query(`UPDATE tab_plano_itens SET ordem = ordem + 1 WHERE ${filtroCtx} AND ISNULL(ordem,0) >= @o`);
            }
        }
        if (ordem == null) {
            const rm = await ctx(R()).query(`SELECT ISNULL(MAX(ordem), 0) + 1 AS o FROM tab_plano_itens WHERE ${filtroCtx}`);
            ordem = rm.recordset[0].o;
        }
        const idItem = await inserirItem(R, {
            id_plano: plano.id_plano, id_unidade: idUnidade, grupo, modulo, descricao,
            responsavel: txt(b.responsavel, 100), cliente: txt(b.cliente, 200), prioridade: b.prioridade,
            data_inicio: di, data_fim: df, ordem, criado_por: idUser(req)
        });
        await registrar(R, { id_plano: plano.id_plano, id_item: idItem, acao: 'INCLUSAO_ITEM', para: descricao, id_usuario: idUser(req) });
        await S.recalcularStatusPlano(R, plano.id_plano);
        await t.commit();
        res.json({ ok: true, id_item: idItem });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   SALVAR GRADE (lote) - com validação e regras de transição
   ========================================================================= */
const CAMPOS_AUDITADOS = {
    descricao: 'Ação', responsavel: 'Responsável', cliente: 'Cliente', observacao: 'Observação',
    data_inicio: 'Início previsto', data_fim: 'Fim previsto', data_inicio_real: 'Início realizado',
    data_fim_real: 'Fim realizado', prioridade: 'Prioridade', status: 'Situação', percentual: '% Execução'
};

router.post('/plano-acao/atualizar-lote-etapas', autenticar, podeVer, asyncHandler(async (req, res) => {
    const b = req.body || {};
    const etapas = Array.isArray(b.etapas) ? b.etapas : [];
    if (!etapas.length) return res.json({ ok: true, ajustes: [] });
    if (etapas.length > 3000) throw httpErro(413, 'Lote muito grande.');

    const pool = await connectToDb();
    const ids = [...new Set(etapas.map(e => toInt(e.id_item)).filter(Boolean))];
    if (ids.length !== etapas.length) throw httpErro(400, 'Itens inválidos no lote.');

    // Estado atual de todos os itens (1 consulta)
    const atuais = new Map();
    for (let i = 0; i < ids.length; i += 1000) {
        const r = pool.request();
        const m = ids.slice(i, i + 1000).map((id, k) => { r.input(`i${k}`, sql.Int, id); return `@i${k}`; }).join(',');
        (await r.query(`SELECT * FROM tab_plano_itens WHERE id_item IN (${m})`)).recordset.forEach(x => atuais.set(x.id_item, x));
    }
    if (atuais.size !== ids.length) throw httpErro(404, 'Um ou mais itens não existem mais. Recarregue o plano.');
    const planos = new Set([...atuais.values()].map(x => x.id_plano));
    const idPlano = toInt(b.id_plano) || [...planos][0];
    if (planos.size !== 1 || !planos.has(idPlano)) throw httpErro(400, 'Todos os itens devem pertencer ao mesmo plano.');
    const plano = await planoNoEscopo(pool, req, idPlano, { editar: true });
    garantirEditavel(plano);

    // Equipe atual
    const equipeAtual = new Map();
    {
        const r = pool.request().input('p', sql.Int, idPlano);
        (await r.query(`SELECT e.id_item, e.id_usuario FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano = @p`))
            .recordset.forEach(x => { if (!equipeAtual.has(x.id_item)) equipeAtual.set(x.id_item, new Set()); equipeAtual.get(x.id_item).add(x.id_usuario); });
    }

    const hoje = S.hojeISO();
    const erros = [], ajustes = [], planejados = [];

    for (const e of etapas) {
        const atual = atuais.get(toInt(e.id_item));
        const tem = (k) => Object.prototype.hasOwnProperty.call(e, k);
        const err = (msg) => erros.push({ id_item: atual.id_item, descricao: atual.descricao, erro: msg });

        const novo = {
            descricao: tem('descricao') ? txt(e.descricao, 1000) : atual.descricao,
            responsavel: tem('responsavel') ? txt(e.responsavel, 100) : atual.responsavel,
            cliente: tem('cliente') ? txt(e.cliente, 200) : atual.cliente,
            observacao: tem('observacao') ? txt(e.observacao, 1000) : atual.observacao,
            prioridade: tem('prioridade') ? (e.prioridade || 'Alta') : (atual.prioridade || 'Alta'),
            status: tem('status') ? e.status : S.normStatus(atual.status),
            percentual: tem('percentual') ? (e.percentual === '' || e.percentual == null ? null : toInt(e.percentual)) : atual.percentual,
            data_inicio: tem('data_inicio') ? dataOk(e.data_inicio) : S.iso(atual.data_inicio),
            data_fim: tem('data_fim') ? dataOk(e.data_fim) : S.iso(atual.data_fim),
            data_inicio_real: tem('data_inicio_real') ? dataOk(e.data_inicio_real) : S.iso(atual.data_inicio_real),
            data_fim_real: tem('data_fim_real') ? dataOk(e.data_fim_real) : S.iso(atual.data_fim_real)
        };
        const tp = (e.tempo_previsto === '' || e.tempo_previsto == null) ? null : toInt(e.tempo_previsto);

        // ---- validações ----
        if (!novo.descricao) err('A descrição da ação é obrigatória.');
        if (!S.STATUS_VALIDOS.includes(novo.status)) err('Situação inválida.');
        if (!S.PRIORIDADES.includes(novo.prioridade)) err('Prioridade inválida.');
        if (['data_inicio', 'data_fim', 'data_inicio_real', 'data_fim_real'].some(k => novo[k] === undefined)) err('Data em formato inválido.');
        if (novo.percentual != null && (novo.percentual < 0 || novo.percentual > 100)) err('% de execução deve estar entre 0 e 100.');
        if (tp != null && (tp < 0 || tp > 100000)) err('Tempo previsto inválido.');
        if (novo.data_inicio && novo.data_fim && novo.data_fim < novo.data_inicio) err('Fim previsto anterior ao início previsto.');
        if (novo.data_inicio_real && novo.data_inicio_real > hoje) err('Início realizado não pode ser data futura.');
        if (novo.data_fim_real && novo.data_fim_real > hoje) err('Fim realizado não pode ser data futura.');
        if (novo.data_inicio_real && novo.data_fim_real && novo.data_fim_real < novo.data_inicio_real) err('Fim realizado anterior ao início realizado.');
        if (novo.data_fim_real && novo.status !== S.ST.FECHADO && !S.ehFechado(atual.status)) {
            // informar a data de conclusão implica fechar
            novo.status = S.ST.FECHADO;
            ajustes.push({ id_item: atual.id_item, msg: 'Fim realizado informado: item fechado automaticamente.' });
        }

        let equipeNova = null;
        if (Array.isArray(e.equipe)) {
            equipeNova = new Set(e.equipe.map(toInt).filter(Boolean));
            if (equipeNova.size > 50) err('Equipe excede o limite de 50 pessoas.');
        }
        planejados.push({ atual, novo, tp, equipeNova });
    }
    if (erros.length) return res.status(400).json({ erro: `${erros.length} item(ns) com dados inválidos.`, erros });

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        const eu = idUser(req);
        for (const { atual, novo, tp, equipeNova } of planejados) {
            const stAnt = S.normStatus(atual.status);
            let dtIni = atual.dt_inicio_andamento || null;
            let dtFech = atual.dt_fechamento || null;
            let tempoGasto = atual.tempo_gasto != null ? atual.tempo_gasto : null;

            // Regra: atraso automático deixa de valer quando o prazo é repactuado para hoje ou depois
            if (novo.status === S.ST.ATRASADO && stAnt === S.ST.ATRASADO && (!novo.data_fim || novo.data_fim >= hoje)
                && novo.data_fim !== S.iso(atual.data_fim)) {
                novo.status = (dtIni || novo.data_inicio_real) ? S.ST.ANDAMENTO : S.ST.A_INICIAR;
                ajustes.push({ id_item: atual.id_item, msg: `Prazo repactuado: situação ajustada para "${novo.status}".` });
            }
            // Regra: prazo vencido e não fechado => Atrasado
            if ((novo.status === S.ST.A_INICIAR || novo.status === S.ST.ANDAMENTO) && novo.data_fim && novo.data_fim < hoje) {
                novo.status = S.ST.ATRASADO;
                ajustes.push({ id_item: atual.id_item, msg: 'Prazo previsto vencido: situação ajustada para "Atrasado".' });
            }
            // Regra: entrar em execução liga o cronômetro e registra o início realizado
            if (novo.status === S.ST.ANDAMENTO || (novo.status === S.ST.ATRASADO && novo.data_inicio_real)) {
                if (!dtIni) dtIni = S.agoraBR();
                if (!novo.data_inicio_real) novo.data_inicio_real = hoje;
            }
            // Regra: fechamento para o cronômetro, calcula o tempo e completa datas
            if (novo.status === S.ST.FECHADO && stAnt !== S.ST.FECHADO) {
                dtFech = S.agoraBR();
                if (dtIni) tempoGasto = S.minutosUteis(new Date(dtIni), dtFech);
                else if (atual.horas_trabalhadas) tempoGasto = atual.horas_trabalhadas;
                if (!novo.data_fim_real) novo.data_fim_real = hoje;
                if (!novo.data_inicio_real) novo.data_inicio_real = dtIni ? S.iso(dtIni) : novo.data_fim_real;
                if (novo.data_inicio_real > novo.data_fim_real) novo.data_inicio_real = novo.data_fim_real;
                novo.percentual = 100;
            }
            // Regra: reabertura limpa o fechamento
            if (novo.status !== S.ST.FECHADO && stAnt === S.ST.FECHADO) {
                dtFech = null;
                novo.data_fim_real = null;
                if (novo.percentual === 100) novo.percentual = 90;
                ajustes.push({ id_item: atual.id_item, msg: 'Item reaberto: fim realizado removido.' });
            }

            await R()
                .input('id', sql.Int, atual.id_item)
                .input('acao', sql.VarChar, novo.descricao)
                .input('resp', sql.VarChar, novo.responsavel)
                .input('cli', sql.VarChar, novo.cliente)
                .input('obs', sql.VarChar, novo.observacao)
                .input('di', sql.Date, novo.data_inicio)
                .input('df', sql.Date, novo.data_fim)
                .input('dir', sql.Date, novo.data_inicio_real)
                .input('dfr', sql.Date, novo.data_fim_real)
                .input('tp', sql.Int, tp)
                .input('perc', sql.Int, novo.percentual)
                .input('prio', sql.VarChar, novo.prioridade)
                .input('st', sql.VarChar, novo.status)
                .input('ini', sql.DateTime, dtIni)
                .input('fech', sql.DateTime, dtFech)
                .input('tg', sql.Int, tempoGasto)
                .query(`
                    UPDATE tab_plano_itens SET
                        descricao = @acao, responsavel = @resp, cliente = @cli, observacao = @obs,
                        data_inicio = @di, data_fim = @df, data_inicio_real = @dir, data_fim_real = @dfr,
                        percentual = @perc, prioridade = @prio, status = @st,
                        dt_inicio_andamento = @ini, dt_fechamento = @fech, tempo_gasto = @tg,
                        tempo_previsto = CASE WHEN ISNULL(tempo_previsto_bloqueado, 0) = 0 AND @tp IS NOT NULL THEN @tp ELSE tempo_previsto END,
                        tempo_previsto_bloqueado = CASE WHEN ISNULL(tempo_previsto_bloqueado, 0) = 0 AND @tp IS NOT NULL THEN 1 ELSE tempo_previsto_bloqueado END,
                        data_atualizacao = GETDATE()
                    WHERE id_item = @id`);

            // Auditoria campo a campo
            const antigo = { ...atual, status: stAnt, data_inicio: S.iso(atual.data_inicio), data_fim: S.iso(atual.data_fim),
                data_inicio_real: S.iso(atual.data_inicio_real), data_fim_real: S.iso(atual.data_fim_real), prioridade: atual.prioridade || 'Alta' };
            for (const k of Object.keys(CAMPOS_AUDITADOS)) {
                const a = antigo[k] == null ? null : String(antigo[k]);
                const n = novo[k] == null ? null : String(novo[k]);
                if (a !== n) await registrar(R, { id_plano: idPlano, id_item: atual.id_item, acao: 'ALTERACAO', campo: k, de: a, para: n, id_usuario: eu });
            }

            // Equipe (diferencial)
            if (equipeNova) {
                const ant = equipeAtual.get(atual.id_item) || new Set();
                const add = [...equipeNova].filter(x => !ant.has(x));
                const rem = [...ant].filter(x => !equipeNova.has(x));
                for (const u of rem) await R().input('i', sql.Int, atual.id_item).input('u', sql.Int, u).query('DELETE FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u');
                for (const u of add) await R().input('i', sql.Int, atual.id_item).input('u', sql.Int, u).query(`
                    IF EXISTS (SELECT 1 FROM tab_usuarios WHERE id_usuario = @u)
                    AND NOT EXISTS (SELECT 1 FROM tab_plano_item_equipe WHERE id_item = @i AND id_usuario = @u)
                        INSERT INTO tab_plano_item_equipe (id_item, id_usuario) VALUES (@i, @u)`);
                if (add.length || rem.length) await registrar(R, { id_plano: idPlano, id_item: atual.id_item, acao: 'ALTERACAO', campo: 'equipe', de: [...ant].join(','), para: [...equipeNova].join(','), id_usuario: eu });
            }
        }
        const statusPlano = await S.recalcularStatusPlano(R, idPlano);
        await R().input('p', sql.Int, idPlano).query('UPDATE tab_plano_acao SET data_atualizacao = GETDATE() WHERE id_plano = @p');
        await t.commit();
        res.json({ ok: true, ajustes, status_plano: statusPlano });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   UNIDADES: ADICIONAR (com etapas do template) / REMOVER
   ========================================================================= */
router.post('/plano-acao/adicionar-unidade-etapas', autenticar, podeVer, asyncHandler(async (req, res) => {
    const { id_plano, id_unidade, etapas_template } = req.body || {};
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(id_plano), { editar: true });
    garantirEditavel(plano);
    const idUnidade = toInt(id_unidade);
    if (!idUnidade) throw httpErro(400, 'Unidade inválida.');
    const v = await pool.request().input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade)
        .query('SELECT 1 FROM tab_plano_acao_detalhes WHERE id_plano=@p AND id_unidade=@u');
    if (v.recordset.length > 0) return res.json({ jaExiste: true });

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade)
            .query(`INSERT INTO tab_plano_acao_detalhes (id_plano, id_unidade, status_unidade) VALUES (@p, @u, 'A INICIAR')`);
        let o = 1;
        const lista = Array.isArray(etapas_template) && etapas_template.length ? etapas_template : [{ acao: 'INICIAR IMPLANTAÇÃO NA UNIDADE' }];
        for (const e of lista) {
            const desc = txt(e.acao, 1000);
            if (!desc) continue;
            await inserirItem(R, { id_plano: plano.id_plano, id_unidade: idUnidade, modulo: txt(e.modulo, 60), descricao: desc,
                responsavel: txt(e.responsavel, 100), prioridade: e.prioridade, ordem: o++, criado_por: idUser(req) });
        }
        const rn = await R().input('u', sql.Int, idUnidade).query('SELECT nome_unidade FROM tab_unidades WHERE id_unidade = @u');
        await registrar(R, { id_plano: plano.id_plano, acao: 'INCLUSAO_UNIDADE', para: rn.recordset[0] ? rn.recordset[0].nome_unidade : idUnidade, id_usuario: idUser(req) });
        await S.recalcularStatusPlano(R, plano.id_plano);
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

router.delete('/plano-acao/:id/unidades/:idUnidade', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    garantirEditavel(plano);
    const idUnidade = toInt(req.params.idUnidade);
    const r = await pool.request().input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade).query(`
        SELECT COUNT(*) AS itens,
               SUM(CASE WHEN status <> 'A Iniciar' THEN 1 ELSE 0 END) AS iniciados,
               (SELECT COUNT(*) FROM tab_plano_apontamentos a JOIN tab_plano_itens i2 ON i2.id_item = a.id_item
                 WHERE i2.id_plano = @p AND i2.id_unidade = @u) AS apontamentos
        FROM tab_plano_itens WHERE id_plano = @p AND id_unidade = @u`);
    const info = r.recordset[0];
    if ((info.iniciados > 0 || info.apontamentos > 0) && req.query.forcar !== '1') {
        throw httpErro(409, `A unidade possui ${info.iniciados || 0} item(ns) já iniciados e ${info.apontamentos || 0} apontamento(s). Confirme para remover mesmo assim.`);
    }
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('p', sql.Int, plano.id_plano).input('u', sql.Int, idUnidade).query(`
            DELETE a FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE i.id_plano = @p AND i.id_unidade = @u;
            DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano = @p AND i.id_unidade = @u;
            DELETE FROM tab_plano_itens WHERE id_plano = @p AND id_unidade = @u;
            DELETE FROM tab_plano_acao_detalhes WHERE id_plano = @p AND id_unidade = @u;`);
        await registrar(R, { id_plano: plano.id_plano, acao: 'EXCLUSAO_UNIDADE', de: idUnidade, id_usuario: idUser(req) });
        await S.recalcularStatusPlano(R, plano.id_plano);
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   ENCERRAR / REABRIR
   ========================================================================= */
router.put('/plano-acao/encerrar/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    if (plano.status === S.PLANO.ENCERRADO) return res.json({ mensagem: 'Plano já encerrado.' });
    const just = txt((req.body || {}).justificativa, 1000);
    const r = await pool.request().input('p', sql.Int, plano.id_plano)
        .query(`SELECT COUNT(*) AS n FROM tab_plano_itens WHERE id_plano = @p AND status NOT IN ('Fechado','Concluído','Concluido')`);
    const pendentes = r.recordset[0].n;
    // Regra: encerrar com pendências exige justificativa
    if (pendentes > 0 && (!just || just.length < 10)) {
        throw httpErro(400, `Há ${pendentes} item(ns) não fechados. Informe uma justificativa (mín. 10 caracteres) para encerrar.`);
    }
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('id', sql.Int, plano.id_plano).input('j', sql.VarChar, just)
            .query(`UPDATE tab_plano_acao SET status='ENCERRADO', data_encerramento = GETDATE(), justificativa_encerramento = @j, data_atualizacao = GETDATE() WHERE id_plano=@id`);
        await registrar(R, { id_plano: plano.id_plano, acao: 'ENCERRAMENTO', de: plano.status, para: just ? `ENCERRADO - ${just}` : 'ENCERRADO', id_usuario: idUser(req) });
        await t.commit();
    } catch (err) { await t.rollback(); throw err; }
    res.json({ mensagem: 'Plano encerrado.', pendentes });
}));

router.put('/plano-acao/reabrir/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    if (plano.status !== S.PLANO.ENCERRADO) return res.json({ mensagem: 'Plano já está aberto.', status: plano.status });
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('id', sql.Int, plano.id_plano)
            .query(`UPDATE tab_plano_acao SET status='EM ANDAMENTO', data_encerramento = NULL, data_atualizacao = GETDATE() WHERE id_plano=@id`);
        const st = await S.recalcularStatusPlano(R, plano.id_plano);
        await registrar(R, { id_plano: plano.id_plano, acao: 'REABERTURA', de: 'ENCERRADO', para: st, id_usuario: idUser(req) });
        await t.commit();
        res.json({ mensagem: 'Plano reaberto.', status: st });
    } catch (err) { await t.rollback(); throw err; }
}));

/* =========================================================================
   DETALHE DO PLANO
   ========================================================================= */
router.get('/plano-acao/:id/historico', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id));
    const r = await pool.request().input('p', sql.Int, plano.id_plano).query(`
        SELECT TOP 500 h.id_historico, h.id_item, i.descricao AS item, h.acao, h.campo, h.valor_anterior, h.valor_novo,
               h.data_hora, us.nome_completo AS usuario
        FROM tab_plano_historico h
        LEFT JOIN tab_plano_itens i ON i.id_item = h.id_item
        LEFT JOIN tab_usuarios us ON us.id_usuario = h.id_usuario
        WHERE h.id_plano = @p
        ORDER BY h.data_hora DESC, h.id_historico DESC`);
    res.json(r.recordset.map(x => ({ ...x, usuario: S.nomeCurto(x.usuario) })));
}));

router.get('/plano-acao/:id/equipe-disponivel', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id));
    // Todos os usuários cadastrados (ativos primeiro). Exibição: primeiro + último nome.
    const r = await pool.request().input('p', sql.Int, plano.id_plano).query(`
        SELECT u.id_usuario, u.nome_completo, f.nome_funcao, u.ativo,
               CASE WHEN u.id_lotacao = pl.id_projeto THEN 1 ELSE 0 END AS da_lotacao
        FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON f.id_funcao = u.id_funcao
        CROSS JOIN (SELECT id_projeto FROM tab_plano_acao WHERE id_plano = @p) pl
        WHERE u.nome_completo IS NOT NULL AND LTRIM(RTRIM(u.nome_completo)) <> ''
        ORDER BY u.ativo DESC, u.nome_completo`);
    res.json(r.recordset.map(u => ({ ...u, nome_exibicao: S.nomeCurto(u.nome_completo), ativo: !!u.ativo, da_lotacao: !!u.da_lotacao })));
}));

/* =========================================================================
   ETAPAS (grupos de ações): renomear / excluir
   ========================================================================= */
router.put('/plano-acao/:id/etapas', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    garantirEditavel(plano);
    const b = req.body || {};
    const de = txt(b.de, 120), para = (txt(b.para, 120) || '').toUpperCase();
    if (!de || !para) throw httpErro(400, 'Informe o nome atual e o novo nome da etapa.');
    const r = await pool.request().input('p', sql.Int, plano.id_plano).input('m', sql.VarChar, txt(b.modulo, 60))
        .input('de', sql.VarChar, de).input('para', sql.VarChar, para)
        .query(`UPDATE tab_plano_itens SET titulo = @para, data_atualizacao = GETDATE()
                WHERE id_plano = @p AND id_unidade IS NULL AND ISNULL(modulo,'') = ISNULL(@m,'') AND ISNULL(titulo,'GERAL') = @de`);
    await registrar(() => pool.request(), { id_plano: plano.id_plano, acao: 'ALTERACAO', campo: 'etapa', de, para, id_usuario: idUser(req) });
    res.json({ ok: true, alterados: r.rowsAffected[0] });
}));

router.delete('/plano-acao/:id/etapas', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    garantirEditavel(plano);
    const nome = txt(req.query.nome, 120), modulo = txt(req.query.modulo, 60);
    if (!nome) throw httpErro(400, 'Etapa inválida.');
    const filtro = `i.id_plano = @p AND i.id_unidade IS NULL AND ISNULL(i.modulo,'') = ISNULL(@m,'') AND ISNULL(i.titulo,'GERAL') = @n`;
    const ctx = (r) => r.input('p', sql.Int, plano.id_plano).input('m', sql.VarChar, modulo).input('n', sql.VarChar, nome);
    const info = (await ctx(pool.request()).query(`
        SELECT COUNT(*) AS itens,
               (SELECT COUNT(*) FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE ${filtro}) AS apontamentos
        FROM tab_plano_itens i WHERE ${filtro}`)).recordset[0];
    if (info.apontamentos > 0 && req.query.forcar !== '1') {
        throw httpErro(409, `A etapa possui ${info.apontamentos} apontamento(s) de horas. Confirme para excluir mesmo assim.`);
    }
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await ctx(R()).query(`
            DELETE a FROM tab_plano_apontamentos a JOIN tab_plano_itens i ON i.id_item = a.id_item WHERE ${filtro};
            DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE ${filtro};
            DELETE i FROM tab_plano_itens i WHERE ${filtro};`);
        await registrar(R, { id_plano: plano.id_plano, acao: 'EXCLUSAO_ETAPA', de: `${nome} (${info.itens} ações)`, id_usuario: idUser(req) });
        await S.recalcularStatusPlano(R, plano.id_plano);
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

router.put('/plano-acao/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    garantirEditavel(plano);
    const b = req.body || {};
    const titulo = txt(b.titulo, 300);
    const dIni = dataOk(b.data_inicio_prevista), dFim = dataOk(b.data_fim_prevista);
    if (!titulo) throw httpErro(400, 'Informe o título do plano.');
    if (dIni === undefined || dFim === undefined) throw httpErro(400, 'Datas previstas inválidas.');
    if (dIni && dFim && dFim < dIni) throw httpErro(400, 'O término previsto não pode ser anterior ao início.');
    const atual = (await pool.request().input('id', sql.Int, plano.id_plano).query('SELECT * FROM tab_plano_acao WHERE id_plano = @id')).recordset[0];
    const novo = { titulo, cliente: txt(b.cliente, 200), descricao: txt(b.descricao, 1000), data_inicio_prevista: dIni, data_fim_prevista: dFim };

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const R = fab(t);
        await R().input('id', sql.Int, plano.id_plano).input('tit', sql.VarChar, novo.titulo).input('cli', sql.VarChar, novo.cliente)
            .input('desc', sql.VarChar, novo.descricao).input('di', sql.Date, dIni).input('df', sql.Date, dFim)
            .query(`UPDATE tab_plano_acao SET titulo=@tit, cliente=@cli, descricao=@desc, data_inicio_prevista=@di,
                    data_fim_prevista=@df, data_atualizacao=GETDATE() WHERE id_plano=@id`);
        for (const k of Object.keys(novo)) {
            const a = atual[k] instanceof Date ? S.iso(atual[k]) : (atual[k] == null ? null : String(atual[k]));
            if (a !== (novo[k] == null ? null : String(novo[k]))) {
                await registrar(R, { id_plano: plano.id_plano, acao: 'ALTERACAO_PLANO', campo: k, de: a, para: novo[k], id_usuario: idUser(req) });
            }
        }
        await t.commit();
        res.json({ ok: true });
    } catch (err) { await t.rollback(); throw err; }
}));

// Publicação do painel do plano (link público somente leitura)
router.post('/plano-acao/:id/publico', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { editar: true });
    const b = req.body || {};
    const publicar = !!b.publico;
    const regenerar = !!b.regenerar;
    let token = plano.token_publico;
    if (publicar && (!token || regenerar)) token = crypto.randomUUID();
    await pool.request().input('id', sql.Int, plano.id_plano).input('pub', sql.Bit, publicar).input('tok', sql.UniqueIdentifier, token || null)
        .query('UPDATE tab_plano_acao SET publico = @pub, token_publico = @tok, data_atualizacao = GETDATE() WHERE id_plano = @id');
    await registrar(() => pool.request(), { id_plano: plano.id_plano, acao: publicar ? 'PUBLICACAO' : 'DESPUBLICACAO', para: regenerar ? 'novo link' : null, id_usuario: idUser(req) });
    res.json({ publico: publicar, token_publico: publicar ? token : null });
}));

router.get('/plano-acao/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const idPlano = toInt(req.params.id);
    await planoNoEscopo(pool, req, idPlano);
    await S.sincronizarAtrasos(pool, idPlano);

    const [h, d, e, eq] = await Promise.all([
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT p.*, pj.nome_projeto, pr.nome_produto, uc.nome_completo AS criado_por_nome
            FROM tab_plano_acao p
            LEFT JOIN tab_projetos pj ON p.id_projeto = pj.id_projeto
            LEFT JOIN tab_produtos pr ON p.id_produto = pr.id_produto
            LEFT JOIN tab_usuarios uc ON uc.id_usuario = p.criado_por
            WHERE p.id_plano = @id`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT d.*, u.nome_unidade
            FROM tab_plano_acao_detalhes d
            JOIN tab_unidades u ON d.id_unidade = u.id_unidade
            WHERE id_plano = @id
            ORDER BY u.nome_unidade`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT * FROM tab_plano_itens
            WHERE id_plano = @id
            ORDER BY CASE WHEN modulo IS NULL THEN 0 ELSE 1 END, modulo, ISNULL(ordem, 0), id_item`),
        pool.request().input('id', sql.Int, idPlano).query(`
            SELECT e.id_item, e.id_usuario, us.nome_completo
            FROM tab_plano_item_equipe e
            JOIN tab_plano_itens i ON i.id_item = e.id_item
            JOIN tab_usuarios us ON us.id_usuario = e.id_usuario
            WHERE i.id_plano = @id`)
    ]);

    const equipePorItem = new Map();
    eq.recordset.forEach(x => {
        if (!equipePorItem.has(x.id_item)) equipePorItem.set(x.id_item, []);
        equipePorItem.get(x.id_item).push({ id_usuario: x.id_usuario, nome_completo: S.nomeCurto(x.nome_completo) });
    });
    const etapas = e.recordset.map(i => ({ ...i, status: S.normStatus(i.status), equipe: equipePorItem.get(i.id_item) || [] }));
    const cab = h.recordset[0];
    if (cab && cab.token_publico) cab.token_publico = String(cab.token_publico).toLowerCase();
    const resumo = S.resumirItens(etapas, S.hojeISO());

    res.json({
        cabecalho: cab,
        detalhes: d.recordset,
        etapas,
        indicadores: { ...resumo, saude: S.saudePlano(cab, resumo, S.hojeISO()) },
        permissoes: {
            editar: await podeEditarPlano(req, cab),
            excluir: (await temPermissao(req, MOD, 'editar')) || (cab && cab.criado_por === idUser(req)),
            novo: await temPermissao(req, MOD, 'novo')
        }
    });
}));

/* =========================================================================
   EXCLUIR PLANO
   ========================================================================= */
router.delete('/plano-acao/:id', autenticar, podeVer, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    const plano = await planoNoEscopo(pool, req, toInt(req.params.id), { excluir: true });
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t).input('id', sql.Int, plano.id_plano)
            .query(`DELETE FROM tab_plano_apontamentos WHERE id_plano=@id;
                    DELETE e FROM tab_plano_item_equipe e JOIN tab_plano_itens i ON i.id_item = e.id_item WHERE i.id_plano=@id;
                    DELETE FROM tab_plano_historico WHERE id_plano=@id;
                    DELETE FROM tab_plano_itens WHERE id_plano=@id;
                    DELETE FROM tab_plano_acao_detalhes WHERE id_plano=@id;
                    DELETE FROM tab_plano_acao WHERE id_plano=@id`);
        await t.commit();
        res.json({ mensagem: 'Excluído' });
    } catch (err) { await t.rollback(); throw err; }
}));

module.exports = router;
