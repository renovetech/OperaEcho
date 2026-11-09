/* Indicadores do Plano de Ação: resumo de itens, saúde do plano, painel e itens detalhados (funções puras). */
const {
    ST, PRIORIDADES, PLANO, normStatus, ehFechado, clienteEfetivo, clienteDoPlano, hojeISO, iso, diasEntre, addDias, inicioSemana
} = require('./planoAcao.dominio');

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

module.exports = { montarPainel, itensDetalhados, resumirItens, saudePlano };
