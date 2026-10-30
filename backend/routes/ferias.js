/* routes/ferias.js */
const express = require('express');
const router = express.Router();
const { connectToDb, sql } = require('../config/database');
const { autenticar } = require('../middlewares/auth');
const { asyncHandler } = require('../middlewares/errorHandler');
const { lotacaoNoEscopo } = require('../middlewares/lotacao');
const notificacoes = require('../services/whatsapp/notificacoes');

// Normaliza função (sem acentos / maiúsculas) para comparações estáveis
const _normFuncao = (s) => (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim().toUpperCase();

// Regra de aprovação por função do aprovador x função do solicitante.
// - Administrador / Gerente  -> qualquer um
// - Coordenador de Implantação -> somente IMPLANTADOR
// - Líder de Projeto -> somente ANALISTA e OPERADOR
function podeAprovarFuncao(escopo, funcaoSolicitante) {
    const aprov = _normFuncao(escopo && escopo.nome_funcao);
    const ehAdmin = (escopo && escopo.perfil_acesso) === 'Administrador';
    const alvo = _normFuncao(funcaoSolicitante);

    if (ehAdmin || aprov === 'GERENTE') return true;
    if (aprov === 'COORDENADOR DE IMPLANTACAO') return alvo === 'IMPLANTADOR';
    if (aprov === 'LIDER DE PROJETO') return alvo === 'ANALISTA' || alvo === 'OPERADOR';
    return false;
}

// Acesso aos dados de férias de UM colaborador: o próprio, visão global, ou
// colaborador de uma lotação do escopo (mesma regra de /ferias/colaboradores).
async function podeVerColaborador(pool, req, idAlvo) {
    const alvo = parseInt(idAlvo);
    if (!alvo || !req.usuario) return false;
    if (alvo === parseInt(req.usuario.id_usuario)) return true;
    const escopo = req.escopo || {};
    if (escopo.global) return true;
    if (!Array.isArray(escopo.lotacoes) || escopo.lotacoes.length === 0) return false;
    const request = pool.request().input('alvo', sql.Int, alvo);
    const marks = escopo.lotacoes.map((id, i) => { request.input(`pv${i}`, sql.Int, id); return `@pv${i}`; });
    const r = await request.query(`
        SELECT 1 AS ok FROM tab_usuarios
        WHERE id_usuario = @alvo
          AND ( id_lotacao IN (${marks.join(',')})
                OR id_usuario IN (SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto IN (${marks.join(',')})) )`);
    return r.recordset.length > 0;
}

// ==============================================================================
// HELPER: VALIDAÇÃO DO LIMITE LEGAL (CLT - Art. 134)
// Período máximo de gozo: 1 ano e 11 meses a partir do início do período aquisitivo
// ==============================================================================
async function validarLimitePeriodoAquisitivo(id_usuario, periodo_aquisitivo, data_fim) {
    const pool = await connectToDb();
    const r = await pool.request()
        .input('u', sql.Int, id_usuario)
        .query("SELECT data_admissao FROM tab_usuarios WHERE id_usuario = @u");

    const dataAdmissao = r.recordset[0]?.data_admissao;
    if (!dataAdmissao) {
        return { valido: false, motivo: 'Data de admissão não cadastrada para este usuário.' };
    }

    // Início do período aquisitivo: dia/mês da admissão no ano informado
    const adm = new Date(dataAdmissao);
    const inicioPA = new Date(parseInt(periodo_aquisitivo), adm.getMonth(), adm.getDate());

    // Limite final: início do período aquisitivo + 1 ano e 11 meses
    const limite = new Date(inicioPA);
    limite.setMonth(limite.getMonth() + 23);
    limite.setDate(limite.getDate() - 1);

    const dtFim = new Date(data_fim);
    if (dtFim > limite) {
        const limiteFmt = limite.toISOString().split('T')[0];
        return {
            valido: false,
            motivo: `A solicitação ultrapassa o prazo legal de 1 ano e 11 meses do período aquisitivo de ${periodo_aquisitivo}. Data limite: ${limiteFmt}.`,
            data_limite: limiteFmt
        };
    }

    return { valido: true };
}

// ==============================================================================
// HELPER: REORDENAÇÃO CRONOLÓGICA DOS PERÍODOS
// ==============================================================================
async function reordenarPeriodosDeFerias(id_usuario, periodo_aquisitivo) {
    try {
        const pool = await connectToDb();
        const res = await pool.request()
            .input('u', sql.Int, id_usuario).input('pa', sql.Int, periodo_aquisitivo)
            .query(`
                SELECT id_ferias, tipo_solicitacao FROM tab_ferias 
                WHERE id_usuario = @u AND periodo_aquisitivo = @pa AND status <> 'RECUSADO'
                AND (tipo_solicitacao LIKE '%1º Período%' OR tipo_solicitacao LIKE '%2º Período%')
                ORDER BY data_inicio ASC
            `);
        const records = res.recordset;
        if (records.length > 0 && records[0].tipo_solicitacao !== '1º Período (15 Dias)') {
            await pool.request().input('id', sql.Int, records[0].id_ferias)
                .query("UPDATE tab_ferias SET tipo_solicitacao = '1º Período (15 Dias)' WHERE id_ferias = @id");
        }
        if (records.length > 1 && records[1].tipo_solicitacao !== '2º Período (15 Dias)') {
            await pool.request().input('id', sql.Int, records[1].id_ferias)
                .query("UPDATE tab_ferias SET tipo_solicitacao = '2º Período (15 Dias)' WHERE id_ferias = @id");
        }
    } catch (err) { console.error("Erro ao reordenar períodos:", err); }
}

// ==============================================================================
// HELPER: SYNC ESCALA (INSERIR/REMOVER FÉRIAS)
// ==============================================================================
// Período máximo de um lançamento de férias (evita laço de dezenas de milhares de
// dias dentro de uma transação com datas absurdas - vetor de DoS no banco)
const MAX_DIAS_FERIAS = 60;
function periodoValido(di, df) {
    const a = new Date(di), b = new Date(df);
    if (isNaN(a) || isNaN(b) || b < a) return false;
    return (b - a) / 86400000 + 1 <= MAX_DIAS_FERIAS;
}

async function syncEscalaFerias(transaction, id_usuario, data_inicio, data_fim, acao) {
    if (acao === 'inserir') {
        if (!periodoValido(data_inicio, data_fim)) throw Object.assign(new Error('Período de férias inválido.'), { status: 400 });
        let curr = new Date(data_inicio);
        const end = new Date(data_fim);
        while (curr <= end) {
            const iso = curr.toISOString().split('T')[0];
            await new sql.Request(transaction)
                .input('u', sql.Int, id_usuario).input('d', sql.Date, iso).input('tp', sql.VarChar, 'FERIAS')
                .query(`
                    DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u AND data_escala=@d);
                    DELETE FROM tab_escalas WHERE id_usuario=@u AND data_escala=@d;
                    INSERT INTO tab_escalas (id_usuario, data_escala, tipo) VALUES (@u, @d, @tp);
                `);
            curr.setDate(curr.getDate() + 1);
        }
    } else if (acao === 'remover') {
        await new sql.Request(transaction)
            .input('u', sql.Int, id_usuario).input('di', sql.Date, data_inicio).input('df', sql.Date, data_fim)
            .query(`
                DELETE FROM tab_escala_produtos WHERE id_escala IN (SELECT id_escala FROM tab_escalas WHERE id_usuario=@u AND data_escala BETWEEN @di AND @df AND tipo='FERIAS');
                DELETE FROM tab_escalas WHERE id_usuario=@u AND data_escala BETWEEN @di AND @df AND tipo='FERIAS';
            `);
    }
}

// ==============================================================================
// COLABORADORES SELECIONÁVEIS PARA SOLICITAÇÃO (isolado por escopo/lotação)
// modulo=implantacao -> global vê todos os implantadores; senão só o próprio
// modulo=projetos   -> global/Líder de Projeto vê os usuários da lotação;
//                       demais funções só veem a si mesmos
// ==============================================================================
router.get('/ferias/colaboradores', autenticar, asyncHandler(async (req, res) => {
    const { modulo, lotacao } = req.query;
    const escopo = req.escopo || {};
    const selfId = req.usuario && req.usuario.id_usuario;
    const ehGlobal = !!escopo.global;
    const funcao = _normFuncao(escopo.nome_funcao);
    const ehLider = funcao === 'LIDER DE PROJETO';

    const pool = await connectToDb();
    const request = pool.request();

    const selectSelf = async () => {
        const r = await pool.request().input('id', sql.Int, selfId)
            .query(`SELECT * FROM tab_usuarios WHERE id_usuario = @id`);
        return r.recordset;
    };

    let registros = [];

    if (modulo === 'projetos') {
        const idLot = parseInt(lotacao);
        if (!idLot) return res.status(400).json({ erro: 'Selecione a lotação.' });
        if (!ehGlobal && !lotacaoNoEscopo(escopo, idLot)) {
            return res.status(403).json({ erro: 'Lotação fora do seu escopo.' });
        }
        if (ehGlobal || ehLider) {
            const r = await request.input('lot', sql.Int, idLot).query(`
                SELECT * FROM tab_usuarios
                WHERE ativo = 1
                  AND ( id_lotacao = @lot
                        OR id_usuario IN (SELECT id_usuario FROM tab_usuario_lotacoes WHERE id_projeto = @lot) )
                ORDER BY nome_completo
            `);
            registros = r.recordset;
        } else {
            registros = await selectSelf();
        }
    } else {
        // modulo = implantacao
        if (ehGlobal) {
            const r = await request.query(`
                SELECT u.* FROM tab_usuarios u
                LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
                WHERE u.ativo = 1
                  AND (UPPER(f.nome_funcao) LIKE '%IMPLANTADOR%' OR UPPER(u.funcao) LIKE '%IMPLANTADOR%')
                ORDER BY u.nome_completo
            `);
            registros = r.recordset;
        } else {
            registros = await selectSelf();
        }
    }

    const limpos = registros.map(({ senha_hash, ...u }) => u);
    res.json(limpos);
}));

// ==============================================================================
// HISTÓRICO DE FÉRIAS DE UM COLABORADOR (saldo / tabela da solicitação)
// Sempre filtra pelo id_usuario informado (não usa visão gerencial).
// ==============================================================================
router.get('/ferias/historico/:id', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();
    if (!(await podeVerColaborador(pool, req, req.params.id))) return res.status(403).json({ erro: 'Colaborador fora do seu escopo.' });
    const r = await pool.request()
        .input('id', sql.Int, parseInt(req.params.id))
        .query(`
            SELECT f.*, u.nome_completo, u.cpf, u.matricula, u.setor, u.funcao,
                   u.data_nascimento, u.data_admissao
            FROM tab_ferias f
            INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
            WHERE f.id_usuario = @id
            ORDER BY f.data_solicitacao DESC
        `);
    res.json(r.recordset);
}));

// ==============================================================================
// CONFLITOS
// ==============================================================================
router.post('/ferias/conflitos', autenticar, asyncHandler(async (req, res) => {
    const { id_ferias, data_inicio, data_fim } = req.body;
    const pool = await connectToDb();

    // Descobre a lotação/função do dono da solicitação analisada
    const dono = await pool.request().input('id', sql.Int, id_ferias || 0).query(`
        SELECT u.id_lotacao, u.funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        WHERE f.id_ferias = @id
    `);

    const request = pool.request()
        .input('id', sql.Int, id_ferias || 0)
        .input('di', sql.Date, data_inicio)
        .input('df', sql.Date, data_fim);

    // Escopo do conflito: mesma lotação; ou, se SEDE - GD (sem lotação), só entre implantadores
    let escopoSql = ' AND 1=0 ';
    if (dono.recordset.length > 0) {
        const idLot = dono.recordset[0].id_lotacao;
        if (idLot) {
            escopoSql = ' AND u.id_lotacao = @lot ';
            request.input('lot', sql.Int, idLot);
        } else {
            escopoSql = " AND u.id_lotacao IS NULL AND UPPER(u.funcao) LIKE '%IMPLANTADOR%' ";
        }
    }

    const result = await request.query(`
        SELECT u.nome_completo, f.data_inicio, f.data_fim, f.status FROM tab_ferias f 
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario 
        WHERE f.id_ferias <> @id AND f.status IN ('APROVADO', 'PENDENTE') 
        AND f.data_inicio <= @df AND f.data_fim >= @di
        ${escopoSql}
    `);
    res.json(result.recordset);
}));

// ==============================================================================
// SALVAR FÉRIAS
// ==============================================================================
router.post('/ferias/salvar', autenticar, asyncHandler(async (req, res) => {
    const { id_usuario, periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim, dias_restantes } = req.body;

    const pool = await connectToDb();
    if (!(await podeVerColaborador(pool, req, id_usuario))) {
        return res.status(403).json({ erro: 'Colaborador fora do seu escopo.' });
    }
    if (!periodoValido(data_inicio, data_fim)) {
        return res.status(400).json({ erro: `Período inválido (data final antes da inicial ou acima de ${MAX_DIAS_FERIAS} dias).` });
    }

    // Validação CLT - Art. 134 (limite de 1 ano e 11 meses)
    const validacao = await validarLimitePeriodoAquisitivo(id_usuario, periodo_aquisitivo, data_fim);
    if (!validacao.valido) {
        return res.status(400).json({ erro: validacao.motivo, data_limite: validacao.data_limite });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t)
            .input('id_u', sql.Int, id_usuario).input('pa', sql.Int, periodo_aquisitivo)
            .input('tipo', sql.VarChar, tipo_solicitacao).input('di', sql.Date, data_inicio)
            .input('df', sql.Date, data_fim).input('dr', sql.Int, dias_restantes)
            .query(`INSERT INTO tab_ferias (id_usuario, periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim, dias_restantes, status, data_solicitacao) 
                    VALUES (@id_u, @pa, @tipo, @di, @df, @dr, 'PENDENTE', GETDATE())`);
        await t.commit();
        await reordenarPeriodosDeFerias(id_usuario, periodo_aquisitivo);
        res.json({ mensagem: 'OK' });
    } catch (err) { await t.rollback(); throw err; }
}));

// ==============================================================================
// EDITAR FÉRIAS
// ==============================================================================
router.put('/ferias/editar/:id', autenticar, asyncHandler(async (req, res) => {
    const { periodo_aquisitivo, tipo_solicitacao, data_inicio, data_fim } = req.body;
    const idFerias = parseInt(req.params.id);
    const pool = await connectToDb();
    if (!periodoValido(data_inicio, data_fim)) {
        return res.status(400).json({ erro: `Período inválido (data final antes da inicial ou acima de ${MAX_DIAS_FERIAS} dias).` });
    }

    // Edição só dentro do escopo; férias aprovadas só por quem pode aprová-las.
    const rDono = await pool.request().input('id', sql.Int, idFerias).query(`
        SELECT f.id_usuario, f.status, u.funcao AS funcao_txt, fn.nome_funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE f.id_ferias = @id`);
    if (rDono.recordset.length === 0) return res.status(404).json({ erro: 'Férias não encontradas.' });
    const dono = rDono.recordset[0];
    if (!(await podeVerColaborador(pool, req, dono.id_usuario))) {
        return res.status(403).json({ erro: 'Colaborador fora do seu escopo.' });
    }
    if (dono.status === 'APROVADO' && !podeAprovarFuncao(req.escopo, dono.nome_funcao || dono.funcao_txt)) {
        return res.status(403).json({ erro: 'Férias já aprovadas só podem ser alteradas por quem pode aprová-las.' });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        const rAntigo = await new sql.Request(t).input('id', sql.Int, idFerias)
            .query("SELECT * FROM tab_ferias WHERE id_ferias = @id");
        const dadosAntigos = rAntigo.recordset[0];
        if (!dadosAntigos) throw new Error("Férias não encontradas");

        // Validação CLT - Art. 134 (limite de 1 ano e 11 meses)
        const validacao = await validarLimitePeriodoAquisitivo(dadosAntigos.id_usuario, periodo_aquisitivo, data_fim);
        if (!validacao.valido) {
            await t.rollback();
            return res.status(400).json({ erro: validacao.motivo, data_limite: validacao.data_limite });
        }

        if (dadosAntigos.status === 'APROVADO') {
            await syncEscalaFerias(t, dadosAntigos.id_usuario, dadosAntigos.data_inicio, dadosAntigos.data_fim, 'remover');
        }

        await new sql.Request(t)
            .input('id', sql.Int, idFerias).input('pa', sql.Int, periodo_aquisitivo)
            .input('tipo', sql.VarChar, tipo_solicitacao).input('di', sql.Date, data_inicio).input('df', sql.Date, data_fim)
            .query("UPDATE tab_ferias SET periodo_aquisitivo=@pa, tipo_solicitacao=@tipo, data_inicio=@di, data_fim=@df WHERE id_ferias=@id");

        if (dadosAntigos.status === 'APROVADO') {
            await syncEscalaFerias(t, dadosAntigos.id_usuario, data_inicio, data_fim, 'inserir');
        }

        await t.commit();
        await reordenarPeriodosDeFerias(dadosAntigos.id_usuario, periodo_aquisitivo);
        res.json({ mensagem: 'Atualizado e sincronizado com sucesso' });
    } catch (err) { await t.rollback(); throw err; }
}));

// ==============================================================================
// LISTAR FÉRIAS
// Regra: colaboradores inativos não aparecem na visão gerencial.
// Antes de listar, remove automaticamente as solicitações "PENDENTE" (Em Análise)
// pertencentes a colaboradores inativos, e filtra a listagem para retornar
// apenas registros de colaboradores ativos.
// Observação: na visão pessoal (id_usuario informado, perfil comum), mantém
// o comportamento original para o próprio usuário ver seu histórico.
// ==============================================================================
router.get('/ferias/listar', autenticar, asyncHandler(async (req, res) => {
    const { id_usuario, lotacao } = req.query;
    const pool = await connectToDb();
    const escopo = req.escopo || {};
    // Perfil do TOKEN, nunca da query (o front envia ?perfil=..., agora ignorado).
    const perfil = escopo.perfil_acesso || (req.usuario && req.usuario.perfil_acesso);

    const ehVisaoGerencial = !id_usuario || perfil === 'Administrador' || perfil === 'Gestor';
    // Visão pessoal de outro colaborador: só dentro do escopo.
    if (!ehVisaoGerencial && !(await podeVerColaborador(pool, req, id_usuario))) {
        return res.status(403).json({ erro: 'Colaborador fora do seu escopo.' });
    }

    // Limpeza automática: exclui "Em Análise" (PENDENTE) de colaboradores inativos
    // Só executa na visão gerencial para não rodar a cada consulta pessoal.
    if (ehVisaoGerencial) {
        try {
            await pool.request().query(`
                DELETE FROM tab_ferias
                WHERE status = 'PENDENTE'
                  AND id_usuario IN (SELECT id_usuario FROM tab_usuarios WHERE ativo = 0)
            `);
        } catch (errLimpeza) {
            console.error("Erro ao limpar solicitações Em Análise de colaboradores inativos:", errLimpeza);
        }
    }

    const request = pool.request();
    let query = `SELECT f.*, u.nome_completo, u.cpf, u.matricula, u.setor, u.funcao, u.data_nascimento, u.data_admissao,
        ISNULL(pl.nome_projeto, 'SEDE - GD') AS nome_lotacao
        FROM tab_ferias f INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_projetos pl ON u.id_lotacao = pl.id_projeto WHERE 1=1 `;
    if (id_usuario && perfil !== 'Administrador' && perfil !== 'Gestor') {
        query += " AND f.id_usuario = @idUsuario";
        request.input('idUsuario', sql.Int, parseInt(id_usuario));
    } else {
        // Visão gerencial: oculta registros de colaboradores inativos
        query += " AND u.ativo = 1";

        // Filtro de lotação da tela de Aprovação de Férias.
        if (lotacao === 'SEDE') {
            // SEDE - GD -> implantadores (somente visão global/coordenação alcança)
            query += " AND (UPPER(u.funcao) LIKE '%IMPLANTADOR%') ";
            if (!escopo.global) query += " AND 1=0 ";
        } else if (lotacao && lotacao !== 'Todos' && lotacao !== '') {
            query += " AND u.id_lotacao = @lot ";
            request.input('lot', sql.Int, parseInt(lotacao));
            if (!escopo.global && !lotacaoNoEscopo(escopo, lotacao)) query += " AND 1=0 ";
        } else if (!escopo.global) {
            // Sem filtro explícito: isola pela(s) lotação(ões) do escopo do aprovador
            if (!escopo.lotacoes || escopo.lotacoes.length === 0) {
                query += " AND 1=0 ";
            } else {
                const marks = escopo.lotacoes.map((id, i) => {
                    request.input(`esc${i}`, sql.Int, id);
                    return `@esc${i}`;
                });
                query += ` AND u.id_lotacao IN (${marks.join(',')}) `;
            }
        }
    }
    query += " ORDER BY f.data_solicitacao DESC";
    const r = await request.query(query);
    res.json(r.recordset);
}));

// ==============================================================================
// RELATÓRIO DE PRAZOS LEGAIS (CLT - Art. 134) - Convenção RH
// PA = ano em que o direito é adquirido (admissão + N anos)
// ==============================================================================
router.get('/ferias/relatorio-prazos', autenticar, asyncHandler(async (req, res) => {
    const pool = await connectToDb();

    const rUsers = await pool.request().query(`
        SELECT u.id_usuario, u.nome_completo, u.matricula, u.cpf, u.setor, u.funcao, u.data_admissao
        FROM tab_usuarios u
        LEFT JOIN tab_funcoes f ON u.id_funcao = f.id_funcao
        WHERE u.ativo = 1 
          AND u.data_admissao IS NOT NULL
          AND (f.nome_funcao LIKE '%IMPLANTADOR%' OR u.funcao LIKE '%IMPLANTADOR%')
        ORDER BY u.nome_completo
    `);
    const usuarios = rUsers.recordset;

    const rFerias = await pool.request().query(`
        SELECT f.id_usuario, f.periodo_aquisitivo, f.tipo_solicitacao, f.data_inicio, f.data_fim, f.status
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE u.ativo = 1
          AND f.status <> 'RECUSADO'
          AND (fn.nome_funcao LIKE '%IMPLANTADOR%' OR u.funcao LIKE '%IMPLANTADOR%')
    `);
    const ferias = rFerias.recordset;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const anoCorrente = hoje.getFullYear();

    const linhas = [];

    for (const u of usuarios) {
        const adm = new Date(u.data_admissao);
        const mesAdm = adm.getMonth();
        const diaAdm = adm.getDate();
        const anoAdm = adm.getFullYear();

        // PA "N" inicia em N/mês/dia da admissão e termina em (N+1)/mês/(dia-1)
        // Só consideramos PAs cujo direito JÁ foi adquirido (fim do aquisitivo já passou)
        for (let pa = anoAdm; pa <= anoCorrente; pa++) {
            const inicioPA = new Date(pa, mesAdm, diaAdm);

            // Fim do período aquisitivo = 1 dia antes do "aniversário" no ano N+1
            const fimPA = new Date(pa + 1, mesAdm, diaAdm);
            fimPA.setDate(fimPA.getDate() - 1);

            // Só entra no relatório se o direito já foi adquirido (fim do PA já passou)
            if (fimPA >= hoje) continue;

            const limite = new Date(inicioPA);
            limite.setMonth(limite.getMonth() + 23);
            limite.setDate(limite.getDate() - 1);

            const feriasDoPA = ferias.filter(f => f.id_usuario === u.id_usuario && f.periodo_aquisitivo === pa);

            // Só considera PAs que tenham alguma solicitação registrada no sistema.
            // O sistema tem histórico curto: PAs anteriores ao uso do sistema não devem
            // aparecer como "vencidos" só porque não há registro digital deles.
            if (feriasDoPA.length === 0) continue;

            let diasGozados = 0;     // Soma somente solicitações APROVADAS
            let diasEmAnalise = 0;   // Soma somente solicitações PENDENTES (informativo)
            for (const f of feriasDoPA) {
                let dias = 0;
                if (f.tipo_solicitacao && (f.tipo_solicitacao.includes('10 Vendidos') || f.tipo_solicitacao.includes('20 Dias (c/ 10'))) {
                    dias = 30;
                } else {
                    const ini = new Date(f.data_inicio);
                    const fim = new Date(f.data_fim);
                    dias = Math.ceil(Math.abs(fim - ini) / (1000 * 60 * 60 * 24)) + 1;
                }
                if (f.status === 'APROVADO') diasGozados += dias;
                else if (f.status === 'PENDENTE') diasEmAnalise += dias;
            }
            // Saldo restante = 30 - somente o que foi APROVADO
            // (dias em análise NÃO consomem saldo, ainda estão disponíveis)
            const saldo = 30 - diasGozados;

            const diasParaLimite = Math.ceil((limite - hoje) / (1000 * 60 * 60 * 24));
            let statusPrazo;
            if (diasParaLimite < 0) statusPrazo = 'VENCIDO';
            else if (diasParaLimite <= 90) statusPrazo = 'PROXIMO_LIMITE';
            else statusPrazo = 'NO_PRAZO';

            linhas.push({
                id_usuario: u.id_usuario,
                matricula: u.matricula,
                nome_completo: u.nome_completo,
                setor: u.setor,
                funcao: u.funcao,
                data_admissao: u.data_admissao,
                periodo_aquisitivo: pa,
                inicio_pa: inicioPA.toISOString().split('T')[0],
                data_limite: limite.toISOString().split('T')[0],
                dias_gozados: diasGozados,
                dias_em_analise: diasEmAnalise,
                saldo_restante: saldo,
                dias_para_limite: diasParaLimite,
                status_prazo: statusPrazo
            });
        }
    }

    linhas.sort((a, b) => a.dias_para_limite - b.dias_para_limite);
    res.json(linhas);
}));

// ==============================================================================
// ALTERAR STATUS (APROVAR / RECUSAR)
// ==============================================================================
router.put('/ferias/status/:id', autenticar, asyncHandler(async (req, res) => {
    const { status } = req.body;
    if (!['APROVADO', 'RECUSADO', 'PENDENTE'].includes(status)) {
        return res.status(400).json({ erro: 'Status inválido.' });
    }
    const pool = await connectToDb();

    // Trava por função: confere se o aprovador pode atuar sobre a função do solicitante
    const rAlvo = await pool.request().input('id', sql.Int, req.params.id).query(`
        SELECT u.funcao AS funcao_txt, fn.nome_funcao
        FROM tab_ferias f
        INNER JOIN tab_usuarios u ON f.id_usuario = u.id_usuario
        LEFT JOIN tab_funcoes fn ON u.id_funcao = fn.id_funcao
        WHERE f.id_ferias = @id
    `);
    if (rAlvo.recordset.length === 0) {
        return res.status(404).json({ erro: 'Solicitação não encontrada.' });
    }
    const funcaoSolicitante = rAlvo.recordset[0].nome_funcao || rAlvo.recordset[0].funcao_txt;
    if (!podeAprovarFuncao(req.escopo, funcaoSolicitante)) {
        return res.status(403).json({ erro: 'Você não tem permissão para aprovar/recusar férias desta função.' });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
        await new sql.Request(t).input('id', sql.Int, req.params.id).input('st', sql.VarChar, status)
            .query("UPDATE tab_ferias SET status = @st WHERE id_ferias = @id");
        const r = await new sql.Request(t).input('id', sql.Int, req.params.id)
            .query("SELECT * FROM tab_ferias WHERE id_ferias = @id");
        const d = r.recordset[0];

        if (d) {
            if (status === 'APROVADO') {
                await syncEscalaFerias(t, d.id_usuario, d.data_inicio, d.data_fim, 'inserir');
            } else if (status === 'RECUSADO') {
                await syncEscalaFerias(t, d.id_usuario, d.data_inicio, d.data_fim, 'remover');
            }
        }
        await t.commit();
        // Pós-commit: falha aqui não pode tentar rollback de transação já finalizada
        if (d) {
            try { await reordenarPeriodosDeFerias(d.id_usuario, d.periodo_aquisitivo); }
            catch (e) { console.error('[ferias] reordenação de períodos falhou:', e.message); }
        }
        res.json({ ok: true });
        // Aviso ao solicitante pelo WhatsApp (não bloqueia a resposta)
        if (d) notificacoes.feriasStatus(d.id_ferias, status, req.usuario.id_usuario);
    } catch (err) {
        try { await t.rollback(); } catch (_) { /* transação já finalizada */ }
        throw err;
    }
}));

module.exports = router;