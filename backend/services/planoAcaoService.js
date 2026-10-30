/* services/planoAcaoService.js
 * ---------------------------------------------------------------------------
 * Regras de negócio e indicadores do Plano de Ação, compartilhados por:
 *   - rotas internas (grade, listagem, painel)       routes/planoAcao.js
 *   - relatórios                                      routes/relatorios.js
 *   - painel público (somente leitura, sanitizado)    routes/planoAcaoPublico.js
 * --------------------------------------------------------------------------- */
const { sql } = require('../config/database');

/* ============================== CONSTANTES =============================== */
const ST = {
    A_INICIAR: 'A Iniciar',
    ANDAMENTO: 'Em andamento',
    ATRASADO: 'Atrasado',
    FECHADO: 'Fechado'
};
const STATUS_VALIDOS = [ST.A_INICIAR, ST.ANDAMENTO, ST.ATRASADO, ST.FECHADO];
const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
const PLANO = { ANDAMENTO: 'EM ANDAMENTO', CONCLUIDO: 'CONCLUÍDO', ENCERRADO: 'ENCERRADO' };

// Normaliza status legados ("Concluído", "Pendente", "Em Andamento"...)
const normStatus = (s) => {
    const v = String(s || '').trim().toLowerCase();
    if (['fechado', 'concluído', 'concluido'].includes(v)) return ST.FECHADO;
    if (v === 'em andamento') return ST.ANDAMENTO;
    if (v === 'atrasado') return ST.ATRASADO;
    return ST.A_INICIAR;
};
const ehFechado = (s) => normStatus(s) === ST.FECHADO;

/* "Fulano de Tal da Silva" -> "Fulano Silva" (exibição padrão de pessoas) */
const nomeCurto = (nome) => {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '';
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
    return p.length === 1 ? cap(p[0]) : `${cap(p[0])} ${cap(p[p.length - 1])}`;
};

/* Cliente efetivo: o da ação; senão o do plano; senão o projeto (máscara original). */
const clienteDoPlano = (p) => (p && (p.cliente || p.nome_projeto)) || null;
const clienteEfetivo = (i, p) => (i && i.cliente) || clienteDoPlano(p);

/* ================================ DATAS =================================== */
// "Agora" em hora de parede de Brasília (UTC-3), codificada nos campos UTC.
const agoraBR = () => new Date(Date.now() - 3 * 60 * 60 * 1000);
const hojeISO = () => agoraBR().toISOString().slice(0, 10);
const iso = (d) => {
    if (!d) return null;
    if (d instanceof Date) return isNaN(d) ? null : d.toISOString().slice(0, 10);
    const s = String(d);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
const diasEntre = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const addDias = (isoData, n) => new Date(Date.parse(isoData) + n * 86400000).toISOString().slice(0, 10);
const inicioSemana = (isoData) => { // segunda-feira
    const d = new Date(Date.parse(isoData));
    const dow = (d.getUTCDay() + 6) % 7;
    return addDias(isoData, -dow);
};

/* Minutos de expediente (seg-sex, 08-19) entre dois Date (campos UTC = hora BR). */
const EXP_INI_MIN = 8 * 60, EXP_FIM_MIN = 19 * 60;
const minutosUteis = (ini, fim) => {
    if (!ini || !fim || fim <= ini) return 0;
    let total = 0;
    let dia = new Date(Date.UTC(ini.getUTCFullYear(), ini.getUTCMonth(), ini.getUTCDate()));
    const fimMs = fim.getTime();
    while (dia.getTime() < fimMs) {
        const dow = dia.getUTCDay();
        if (dow >= 1 && dow <= 5) {
            const a = Math.max(ini.getTime(), dia.getTime() + EXP_INI_MIN * 60000);
            const b = Math.min(fim.getTime(), dia.getTime() + EXP_FIM_MIN * 60000);
            if (b > a) total += Math.round((b - a) / 60000);
        }
        dia = new Date(dia.getTime() + 86400000);
    }
    return total;
};

/* ============================ REGRAS AUTOMÁTICAS ========================== */
/**
 * Marca como "Atrasado" os itens com prazo previsto vencido e não fechados,
 * em planos ativos. idPlano opcional (null = todos).
 */
async function sincronizarAtrasos(pool, idPlano = null) {
    const r = pool.request().input('hoje', sql.Date, hojeISO());
    let filtro = '';
    if (idPlano) { filtro = ' AND i.id_plano = @id '; r.input('id', sql.Int, idPlano); }
    await r.query(`
        UPDATE i SET i.status = 'Atrasado'
        FROM tab_plano_itens i
        JOIN tab_plano_acao p ON p.id_plano = i.id_plano
        WHERE p.status = 'EM ANDAMENTO'
          AND i.data_fim IS NOT NULL AND i.data_fim < @hoje
          AND i.status IN ('A Iniciar', 'Em andamento', 'Em Andamento', 'Pendente') ${filtro}`);
}

/**
 * Status do plano derivado dos itens: 100% fechado => CONCLUÍDO;
 * havendo item reaberto num plano CONCLUÍDO => volta a EM ANDAMENTO.
 * ENCERRADO é decisão manual e não é alterado aqui.
 */
async function recalcularStatusPlano(reqFactory, idPlano) {
    const r = await reqFactory().input('id', sql.Int, idPlano).query(`
        SELECT p.status,
               (SELECT COUNT(*) FROM tab_plano_itens WHERE id_plano = @id) AS total,
               (SELECT COUNT(*) FROM tab_plano_itens WHERE id_plano = @id AND status IN ('Fechado','Concluído','Concluido')) AS fechados
        FROM tab_plano_acao p WHERE p.id_plano = @id`);
    const p = r.recordset[0];
    if (!p || p.status === PLANO.ENCERRADO) return p ? p.status : null;
    const novo = p.total > 0 && p.total === p.fechados ? PLANO.CONCLUIDO : PLANO.ANDAMENTO;
    if (novo !== p.status) {
        await reqFactory().input('id', sql.Int, idPlano).input('st', sql.VarChar, novo)
            .query('UPDATE tab_plano_acao SET status = @st, data_atualizacao = GETDATE() WHERE id_plano = @id');
    }
    return novo;
}

/* ============================ CARGA ANALÍTICA ============================= */
/**
 * Carrega planos + itens para indicadores.
 * filtros: { ids_planos?, id_projeto?, status_plano?, cliente?, dataInicio?, dataFim?, somentePublicos?, token? }
 * extraWhere: função (request) => trecho SQL adicional sobre "p" (ex.: lotação).
 */
async function carregarBase(pool, filtros = {}, extraWhere = null) {
    const rp = pool.request();
    let where = ' WHERE 1=1 ';
    if (filtros.token) { where += ' AND p.token_publico = @tok AND p.publico = 1 '; rp.input('tok', sql.UniqueIdentifier, filtros.token); }
    if (filtros.somentePublicos) where += ' AND p.publico = 1 ';
    if (filtros.id_plano) { where += ' AND p.id_plano = @idp '; rp.input('idp', sql.Int, filtros.id_plano); }
    if (filtros.id_projeto) { where += ' AND p.id_projeto = @proj '; rp.input('proj', sql.Int, filtros.id_projeto); }
    if (filtros.status_plano) { where += ' AND p.status = @stp '; rp.input('stp', sql.VarChar, filtros.status_plano); }
    if (filtros.cliente) {
        where += ` AND (p.cliente LIKE @cli OR (p.cliente IS NULL AND pj.nome_projeto LIKE @cli)
                    OR EXISTS (SELECT 1 FROM tab_plano_itens ic WHERE ic.id_plano = p.id_plano AND ic.cliente LIKE @cli)) `;
        rp.input('cli', sql.VarChar, `%${filtros.cliente}%`);
    }
    if (filtros.busca) { where += ' AND (p.titulo LIKE @bus OR p.cliente LIKE @bus OR pj.nome_projeto LIKE @bus) '; rp.input('bus', sql.VarChar, `%${filtros.busca}%`); }
    if (filtros.data) { where += ' AND CAST(p.data_criacao AS DATE) = @dtc '; rp.input('dtc', sql.Date, filtros.data); }
    if (filtros.dataInicio && filtros.dataFim) {
        where += ' AND CAST(p.data_criacao AS DATE) BETWEEN @di AND @df ';
        rp.input('di', sql.Date, filtros.dataInicio); rp.input('df', sql.Date, filtros.dataFim);
    }
    if (extraWhere) where += extraWhere(rp);

    const planos = (await rp.query(`
        SELECT p.id_plano, p.titulo, p.status, p.sub_tipo, p.cliente, p.descricao, p.data_criacao,
               p.data_inicio_prevista, p.data_fim_prevista, p.data_encerramento, p.publico, p.token_publico, p.criado_por,
               p.id_projeto, pj.nome_projeto, pr.nome_produto
        FROM tab_plano_acao p
        LEFT JOIN tab_projetos pj ON pj.id_projeto = p.id_projeto
        LEFT JOIN tab_produtos pr ON pr.id_produto = p.id_produto
        ${where}
        ORDER BY p.data_criacao DESC`)).recordset
        .map(p => ({ ...p, token_publico: p.token_publico ? String(p.token_publico).toLowerCase() : null }));

    if (!planos.length) return { planos: [], itens: [], equipe: [], apontamentos: [] };

    // Itens dos planos (IN parametrizado em lotes)
    const ids = planos.map(p => p.id_plano);
    const itens = [], equipe = [], apontamentos = [];
    for (let i = 0; i < ids.length; i += 500) {
        const lote = ids.slice(i, i + 500);
        const ri = pool.request();
        const marks = lote.map((id, k) => { ri.input(`p${k}`, sql.Int, id); return `@p${k}`; }).join(',');
        const [rI, rE, rA] = await Promise.all([
            ri.query(`
                SELECT i.id_item, i.id_plano, i.id_unidade, u.nome_unidade, i.modulo, i.titulo AS grupo,
                       i.descricao, i.responsavel, i.cliente, i.observacao, i.status, i.prioridade, i.ordem,
                       i.percentual, i.data_inicio, i.data_fim, i.data_inicio_real, i.data_fim_real,
                       i.tempo_previsto, i.tempo_gasto, i.horas_trabalhadas
                FROM tab_plano_itens i
                LEFT JOIN tab_unidades u ON u.id_unidade = i.id_unidade
                WHERE i.id_plano IN (${marks})`),
            (() => {
                const r = pool.request();
                const m = lote.map((id, k) => { r.input(`p${k}`, sql.Int, id); return `@p${k}`; }).join(',');
                return r.query(`
                    SELECT e.id_item, i.id_plano, e.id_usuario, us.nome_completo
                    FROM tab_plano_item_equipe e
                    JOIN tab_plano_itens i ON i.id_item = e.id_item
                    JOIN tab_usuarios us ON us.id_usuario = e.id_usuario
                    WHERE i.id_plano IN (${m})`);
            })(),
            (() => {
                const r = pool.request();
                const m = lote.map((id, k) => { r.input(`p${k}`, sql.Int, id); return `@p${k}`; }).join(',');
                return r.query(`
                    SELECT a.id_item, a.id_plano, a.id_usuario, us.nome_completo, a.data_execucao, a.minutos
                    FROM tab_plano_apontamentos a
                    JOIN tab_usuarios us ON us.id_usuario = a.id_usuario
                    WHERE a.id_plano IN (${m})`);
            })()
        ]);
        itens.push(...rI.recordset);
        equipe.push(...rE.recordset.map(x => ({ ...x, nome_completo: nomeCurto(x.nome_completo) })));
        apontamentos.push(...rA.recordset.map(x => ({ ...x, nome_completo: nomeCurto(x.nome_completo) })));
    }
    return { planos, itens, equipe, apontamentos };
}

/* ============================== INDICADORES =============================== */
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);

function progressoItem(i) {
    if (ehFechado(i.status)) return 100;
    const p = parseInt(i.percentual, 10);
    return isNaN(p) ? 0 : Math.max(0, Math.min(99, p));
}

/** Resumo de um conjunto de itens. */
function resumirItens(lista, hoje) {
    const r = { total: lista.length, a_iniciar: 0, andamento: 0, atrasados: 0, fechados: 0,
        progresso: 0, esperado: 0, vencendo_7d: 0, fechados_no_prazo: 0, fechados_com_prazo: 0,
        previsto_min: 0, gasto_min: 0, trabalhado_min: 0 };
    if (!lista.length) return { ...r, aderencia: null, desvio: 0 };
    let somaProg = 0, devidos = 0;
    const lim7 = addDias(hoje, 7);
    lista.forEach(i => {
        const st = normStatus(i.status);
        if (st === ST.FECHADO) r.fechados++;
        else if (st === ST.ATRASADO) r.atrasados++;
        else if (st === ST.ANDAMENTO) r.andamento++;
        else r.a_iniciar++;
        somaProg += progressoItem(i);
        const df = iso(i.data_fim);
        if (df && df <= hoje) devidos++;
        if (df && st !== ST.FECHADO && df >= hoje && df <= lim7) r.vencendo_7d++;
        if (st === ST.FECHADO && df) {
            r.fechados_com_prazo++;
            const dr = iso(i.data_fim_real);
            if (!dr || dr <= df) r.fechados_no_prazo++;
        }
        r.previsto_min += Number(i.tempo_previsto) || 0;
        r.gasto_min += Number(i.tempo_gasto) || 0;
        r.trabalhado_min += Number(i.horas_trabalhadas) || 0;
    });
    r.progresso = Math.round(somaProg / lista.length);
    r.esperado = pct(devidos, lista.length);
    r.desvio = r.progresso - r.esperado;
    r.aderencia = r.fechados_com_prazo ? pct(r.fechados_no_prazo, r.fechados_com_prazo) : null;
    return r;
}

/**
 * Saúde do plano:
 *  CONCLUÍDO  - 100% fechado
 *  CRÍTICO    - >20% atrasado, ou prazo final do plano vencido, ou desvio <= -25pp
 *  ATENÇÃO    - algum atraso, desvio <= -10pp ou entregas vencendo em 7 dias sem início
 *  NO PRAZO   - demais casos
 */
function saudePlano(plano, r, hoje) {
    if (r.total > 0 && r.fechados === r.total) return 'CONCLUÍDO';
    if (plano.status === PLANO.ENCERRADO) return 'ENCERRADO';
    const fimPlano = iso(plano.data_fim_prevista);
    if ((r.total && r.atrasados / r.total > 0.2) || (fimPlano && fimPlano < hoje) || r.desvio <= -25) return 'CRÍTICO';
    if (r.atrasados > 0 || r.desvio <= -10 || r.vencendo_7d > 0) return 'ATENÇÃO';
    return 'NO PRAZO';
}

function agrupar(itens, chaveFn, hoje) {
    const m = new Map();
    itens.forEach(i => {
        const k = chaveFn(i);
        if (k == null || k === '') return;
        if (!m.has(k)) m.set(k, []);
        m.get(k).push(i);
    });
    return [...m.entries()].map(([nome, arr]) => {
        const r = resumirItens(arr, hoje);
        return { nome, total: r.total, fechados: r.fechados, atrasados: r.atrasados, andamento: r.andamento,
            a_iniciar: r.a_iniciar, progresso: r.progresso, previsto_min: r.previsto_min, trabalhado_min: r.trabalhado_min };
    }).sort((a, b) => b.total - a.total);
}

/**
 * Monta o painel completo.
 * opts.publico = true => remove dados sensíveis (observações, nomes de pessoas, tokens).
 */
function montarPainel(base, opts = {}) {
    const hoje = hojeISO();
    const { planos, itens, equipe, apontamentos } = base;
    const publico = !!opts.publico;

    const itensPorPlano = new Map();
    itens.forEach(i => { if (!itensPorPlano.has(i.id_plano)) itensPorPlano.set(i.id_plano, []); itensPorPlano.get(i.id_plano).push(i); });
    const planoPorId = new Map(planos.map(p => [p.id_plano, p]));

    const listaPlanos = planos.map(p => {
        const arr = itensPorPlano.get(p.id_plano) || [];
        const r = resumirItens(arr, hoje);
        const abertos = arr.filter(i => !ehFechado(i.status) && iso(i.data_fim)).map(i => iso(i.data_fim)).sort();
        const out = {
            id_plano: p.id_plano, titulo: p.titulo, cliente: clienteDoPlano(p), cliente_informado: !!p.cliente, nome_projeto: p.nome_projeto, sub_tipo: p.sub_tipo,
            produto: [...new Set(arr.map(i => i.modulo).filter(Boolean))].join(', ') || p.nome_produto,
            status: p.status, saude: saudePlano(p, r, hoje),
            data_criacao: iso(p.data_criacao), data_inicio_prevista: iso(p.data_inicio_prevista), data_fim_prevista: iso(p.data_fim_prevista),
            unidades: new Set(arr.filter(i => i.id_unidade).map(i => i.id_unidade)).size,
            proximo_prazo: abertos[0] || null,
            ...r
        };
        if (!publico) { out.publico = !!p.publico; out.token_publico = p.publico ? p.token_publico : null; }
        return out;
    });

    const geral = resumirItens(itens, hoje);
    const saudeCont = listaPlanos.reduce((acc, p) => { acc[p.saude] = (acc[p.saude] || 0) + 1; return acc; }, {});

    const resumo = {
        planos: planos.length,
        planos_ativos: planos.filter(p => p.status === PLANO.ANDAMENTO).length,
        planos_concluidos: planos.filter(p => p.status === PLANO.CONCLUIDO).length,
        planos_encerrados: planos.filter(p => p.status === PLANO.ENCERRADO).length,
        unidades: new Set(itens.filter(i => i.id_unidade).map(i => i.id_unidade)).size,
        clientes: new Set(itens.map(i => clienteEfetivo(i, planoPorId.get(i.id_plano))).concat(planos.map(clienteDoPlano)).filter(Boolean)).size,
        saude: saudeCont,
        ...geral
    };

    const nomeUnid = (i) => i.nome_unidade || (i.id_unidade ? `Unidade ${i.id_unidade}` : null);
    const decorar = (i) => {
        const p = planoPorId.get(i.id_plano) || {};
        return {
            id_item: i.id_item, id_plano: i.id_plano, plano: p.titulo, cliente: clienteEfetivo(i, p),
            descricao: i.descricao, unidade: nomeUnid(i), modulo: i.modulo, grupo: i.grupo,
            responsavel: i.responsavel, prioridade: i.prioridade, status: normStatus(i.status),
            data_inicio: iso(i.data_inicio), data_fim: iso(i.data_fim)
        };
    };

    const ativos = itens.filter(i => (planoPorId.get(i.id_plano) || {}).status !== PLANO.ENCERRADO);
    const atrasados = ativos.filter(i => normStatus(i.status) === ST.ATRASADO || (!ehFechado(i.status) && iso(i.data_fim) && iso(i.data_fim) < hoje))
        .map(i => ({ ...decorar(i), dias_atraso: iso(i.data_fim) ? diasEntre(iso(i.data_fim), hoje) : null }))
        .sort((a, b) => (b.dias_atraso || 0) - (a.dias_atraso || 0));
    const lim = addDias(hoje, 15);
    const proximos = ativos.filter(i => !ehFechado(i.status) && iso(i.data_fim) && iso(i.data_fim) >= hoje && iso(i.data_fim) <= lim)
        .map(i => ({ ...decorar(i), dias_restantes: diasEntre(hoje, iso(i.data_fim)) }))
        .sort((a, b) => a.dias_restantes - b.dias_restantes);

    // Evolução semanal (12 semanas): previstos x concluídos x acumulado
    const semanaAtual = inicioSemana(hoje);
    const semanas = [];
    for (let k = 11; k >= 0; k--) semanas.push(addDias(semanaAtual, -7 * k));
    const evolucao = semanas.map(s => {
        const fimS = addDias(s, 6);
        const prev = itens.filter(i => { const d = iso(i.data_fim); return d && d >= s && d <= fimS; }).length;
        const conc = itens.filter(i => { const d = iso(i.data_fim_real); return ehFechado(i.status) && d && d >= s && d <= fimS; }).length;
        const acumPrev = itens.filter(i => { const d = iso(i.data_fim); return d && d <= fimS; }).length;
        const acumConc = itens.filter(i => { const d = iso(i.data_fim_real); return ehFechado(i.status) && d && d <= fimS; }).length;
        return { semana: s, previstos: prev, concluidos: conc, acum_previsto: pct(acumPrev, itens.length), acum_realizado: pct(acumConc, itens.length) };
    });

    const painel = {
        gerado_em: new Date().toISOString(),
        hoje,
        resumo,
        planos: listaPlanos,
        por_status: [ST.A_INICIAR, ST.ANDAMENTO, ST.ATRASADO, ST.FECHADO].map(s => ({ nome: s, total: itens.filter(i => normStatus(i.status) === s).length })),
        por_responsavel: agrupar(itens, i => i.responsavel || '(Sem responsável)', hoje),
        por_modulo: agrupar(itens, i => i.modulo || 'Geral', hoje),
        por_unidade: agrupar(itens, nomeUnid, hoje),
        por_cliente: agrupar(itens, i => clienteEfetivo(i, planoPorId.get(i.id_plano)) || '(Sem cliente)', hoje),
        por_etapa: agrupar(itens, i => (i.id_unidade ? 'EXECUÇÃO NAS UNIDADES' : (i.grupo || 'GERAL')), hoje),
        por_prioridade: PRIORIDADES.map(pr => ({ nome: pr, ...(() => { const a = itens.filter(i => (i.prioridade || 'Alta') === pr); const r = resumirItens(a, hoje); return { total: r.total, fechados: r.fechados, atrasados: r.atrasados, progresso: r.progresso }; })() })),
        atrasados: atrasados.slice(0, 200),
        proximos_prazos: proximos.slice(0, 200),
        evolucao
    };

    if (!publico) {
        // Equipe alocada x horas apontadas (pessoas) - só uso interno
        const porPessoa = new Map();
        const pessoa = (id, nome) => { if (!porPessoa.has(id)) porPessoa.set(id, { id_usuario: id, nome, itens: new Set(), abertos: 0, atrasados: 0, trabalhado_min: 0, apontamentos: 0 }); return porPessoa.get(id); };
        const itemPorId = new Map(itens.map(i => [i.id_item, i]));
        equipe.forEach(e => {
            const ps = pessoa(e.id_usuario, e.nome_completo); const it = itemPorId.get(e.id_item);
            if (!ps.itens.has(e.id_item) && it) { ps.itens.add(e.id_item); if (!ehFechado(it.status)) ps.abertos++; if (normStatus(it.status) === ST.ATRASADO) ps.atrasados++; }
        });
        apontamentos.forEach(a => { const ps = pessoa(a.id_usuario, a.nome_completo); ps.trabalhado_min += a.minutos || 0; ps.apontamentos++; });
        painel.por_pessoa = [...porPessoa.values()].map(p => ({ ...p, itens: p.itens.size })).sort((a, b) => b.trabalhado_min - a.trabalhado_min);
    }
    return painel;
}

/** Itens detalhados (relatório). */
function itensDetalhados(base) {
    const hoje = hojeISO();
    const planoPorId = new Map(base.planos.map(p => [p.id_plano, p]));
    const equipePorItem = new Map();
    base.equipe.forEach(e => { if (!equipePorItem.has(e.id_item)) equipePorItem.set(e.id_item, []); equipePorItem.get(e.id_item).push(e.nome_completo); });
    return base.itens.map(i => {
        const p = planoPorId.get(i.id_plano) || {};
        const st = normStatus(i.status);
        const df = iso(i.data_fim), dfr = iso(i.data_fim_real);
        let situacao_prazo = 'SEM PRAZO';
        if (df) {
            if (st === ST.FECHADO) situacao_prazo = (!dfr || dfr <= df) ? 'NO PRAZO' : 'FORA DO PRAZO';
            else situacao_prazo = df < hoje ? 'VENCIDO' : (diasEntre(hoje, df) <= 7 ? 'VENCE EM 7 DIAS' : 'A VENCER');
        }
        return {
            id_item: i.id_item, id_plano: i.id_plano, plano: p.titulo, nome_projeto: p.nome_projeto,
            cliente: clienteEfetivo(i, p), status_plano: p.status,
            modulo: i.modulo, grupo: i.id_unidade ? null : (i.grupo || 'GERAL'), unidade: i.nome_unidade,
            descricao: i.descricao, responsavel: i.responsavel, equipe: (equipePorItem.get(i.id_item) || []).join(', '),
            prioridade: i.prioridade || 'Alta', status: st, percentual: progressoItem(i),
            data_inicio: iso(i.data_inicio), data_fim: df, data_inicio_real: iso(i.data_inicio_real), data_fim_real: dfr,
            tempo_previsto: Number(i.tempo_previsto) || 0, tempo_gasto: Number(i.tempo_gasto) || 0,
            horas_trabalhadas: Number(i.horas_trabalhadas) || 0, observacao: i.observacao, situacao_prazo,
            dias_atraso: df && st !== ST.FECHADO && df < hoje ? diasEntre(df, hoje) : (df && dfr && dfr > df ? diasEntre(df, dfr) : 0)
        };
    });
}

module.exports = {
    ST, STATUS_VALIDOS, PRIORIDADES, PLANO,
    normStatus, ehFechado, nomeCurto, clienteEfetivo, clienteDoPlano, agoraBR, hojeISO, iso, minutosUteis,
    sincronizarAtrasos, recalcularStatusPlano, carregarBase, montarPainel, itensDetalhados, resumirItens, saudePlano
};
