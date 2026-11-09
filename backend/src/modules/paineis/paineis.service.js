/* Regras dos painéis do dashboard feitas no Node: escopo por lotação, totais, planos e atividades do dia. */
const repositorio = require('./paineis.repository');

const CARGOS_APROVADORES = ['LÍDER DE PROJETO', 'COORDENADOR DE IMPLANTAÇÃO', 'GERENTE', 'ADMINISTRADOR'];
const PERCENTUAL_TOTAL = 100;
const TOTAIS_ZERADOS = { implantadores: 0, operadores: 0, projetos: 0, unidades: 0, produtos: 0 };

const ORIGEM_IMPLANTACAO = { tabela: 'tab_atividades', juncao: 'tab_atividade_implantadores', funcoes: ['IMPLANTADOR'], id_lotacao: null };
const ORIGEM_PROJETOS = { tabela: 'tab_proj_atividades', juncao: 'tab_proj_atividade_implantadores', funcoes: ['OPERADOR', 'ANALISTA'], id_lotacao: null };

/** Escopo do usuário: visão global (SEDE - GD) ou a lista de lotações (sem repetição) que ele enxerga. */
async function getUserScope(pool, rawId) {
    const idUsuario = parseInt(rawId);
    if (!idUsuario || isNaN(idUsuario)) return { isGlobal: false, lotacoes: [] };

    const rUser = await repositorio.lotacaoPrincipalDoUsuario(pool, idUsuario);
    if (rUser.recordset.length === 0) return { isGlobal: false, lotacoes: [] };

    const mainLotacao = rUser.recordset[0].id_lotacao;
    if (mainLotacao === 0 || mainLotacao === null) {
        return { isGlobal: true, lotacoes: [] }; // SEDE - GD enxerga tudo
    }

    const rExtras = await repositorio.lotacoesExtrasDoUsuario(pool, idUsuario);
    const lotacoes = [mainLotacao, ...rExtras.recordset.map(x => x.id_projeto)];
    return { isGlobal: false, lotacoes: [...new Set(lotacoes)] };
}

const semLotacao = (escopo) => !escopo.isGlobal && escopo.lotacoes.length === 0;
const restritoALotacoes = (escopo) => !escopo.isGlobal && escopo.lotacoes.length > 0;

async function totais(pool, idUsuario) {
    const escopo = await getUserScope(pool, idUsuario);

    let filterProjetos = "";
    let filterUsuarios = "";
    let filterUnidades = "";

    if (restritoALotacoes(escopo)) {
        const inClause = escopo.lotacoes.join(',');
        filterProjetos = ` AND id_projeto IN (${inClause}) `;
        filterUsuarios = ` AND u.id_lotacao IN (${inClause}) `;
        filterUnidades = ` AND id_projeto IN (${inClause}) `;
    } else if (semLotacao(escopo)) {
        return TOTAIS_ZERADOS;
    }

    const rImp = await repositorio.contarImplantadores(pool, filterUsuarios);
    const rOp = await repositorio.contarOperadores(pool, filterUsuarios);
    const r2 = await repositorio.contarProjetosAtivos(pool, filterProjetos);
    const r3 = await repositorio.contarUnidadesAtivas(pool, filterUnidades);
    const r4 = await repositorio.contarProdutos(pool, escopo);

    return {
        implantadores: rImp.recordset[0].t,
        operadores: rOp.recordset[0].t,
        projetos: r2.recordset[0].t,
        unidades: r3.recordset[0].t,
        produtos: r4.recordset[0].t
    };
}

async function proximasFerias(pool, idUsuario) {
    const escopo = await getUserScope(pool, idUsuario);

    let filterUsuarios = "";
    if (restritoALotacoes(escopo)) {
        filterUsuarios = ` AND u.id_lotacao IN (${escopo.lotacoes.join(',')}) `;
    } else if (semLotacao(escopo)) {
        return [];
    }
    return (await repositorio.proximasFerias(pool, filterUsuarios)).recordset;
}

function resumirPlano(p) {
    const total = p.total_tarefas || 1;
    const percConcluido = Math.round((p.tarefas_concluidas / total) * PERCENTUAL_TOTAL);
    const percAndamento = Math.round((p.tarefas_andamento / total) * PERCENTUAL_TOTAL);
    const percAtrasado = Math.round((p.tarefas_atrasadas / total) * PERCENTUAL_TOTAL);
    return {
        id_plano: p.id_plano, titulo: p.titulo, nome_projeto: p.nome_projeto,
        total_unidades: p.total_tarefas,
        unidades_concluidas: p.tarefas_concluidas,
        unidades_andamento: p.tarefas_andamento,
        unidades_atrasadas: p.tarefas_atrasadas,
        perc_concluido: percConcluido,
        perc_andamento: percAndamento,
        perc_atrasado: percAtrasado,
        perc_restante: Math.max(0, PERCENTUAL_TOTAL - percConcluido - percAndamento - percAtrasado)
    };
}

async function progressoPlanos(pool, idUsuario) {
    const escopo = await getUserScope(pool, idUsuario);

    let filterProjetos = "";
    if (restritoALotacoes(escopo)) {
        filterProjetos = ` AND p.id_projeto IN (${escopo.lotacoes.join(',')}) `;
    } else if (semLotacao(escopo)) {
        return [];
    }
    return (await repositorio.progressoDosPlanos(pool, filterProjetos)).recordset.map(resumirPlano);
}

/** Atividades do dia agrupadas por projeto (cada atividade conta uma vez, mesmo com vários implantadores). */
async function atividadesHoje(pool, data, origem) {
    const linhas = await repositorio.atividadesDoDia(pool, data, origem);

    const agrupado = linhas.reduce((acc, curr) => {
        const projNome = curr.nome_projeto;

        if (!acc[projNome]) {
            acc[projNome] = {
                nome: projNome,
                atividadesUnicas: new Set(),
                implantadores: new Set(),
                unidades: new Set(),
                motivos: new Set()
            };
        }

        acc[projNome].atividadesUnicas.add(curr.id_atividade);
        if (curr.implantador) acc[projNome].implantadores.add(curr.implantador);
        if (curr.unidade) acc[projNome].unidades.add(curr.unidade);
        if (curr.motivo) acc[projNome].motivos.add(curr.motivo);

        return acc;
    }, {});

    const por_equipe = Object.values(agrupado).map(item => ({
        nome: item.nome,
        total: item.atividadesUnicas.size,
        implantador: Array.from(item.implantadores).join(', '),
        unidade: Array.from(item.unidades).join(', '),
        motivo: Array.from(item.motivos).join(' | ')
    })).sort((a, b) => b.total - a.total);

    const total = por_equipe.reduce((acc, curr) => acc + curr.total, 0);
    return { total, por_equipe };
}

// Barra IMPLANTAÇÃO: SOMENTE função IMPLANTADOR, em tab_atividades, consolidado (sem isolamento por lotação).
const atividadesHojeImplantacao = (pool, data) => atividadesHoje(pool, data, ORIGEM_IMPLANTACAO);

// Barra PROJETOS: SOMENTE funções OPERADOR e ANALISTA, em tab_proj_atividades, sem isolamento por lotação.
const atividadesHojeProjetos = (pool, data) => atividadesHoje(pool, data, ORIGEM_PROJETOS);

const ehAprovador = (nomeFuncao) => CARGOS_APROVADORES.some(cargo => nomeFuncao.includes(cargo)) || nomeFuncao === 'ADMINISTRADOR';

/** Filtros sobre a lotação do aprovador (principal + extras); null quando ele não tem a quem aprovar. */
function filtrosDeAprovacao(escopo) {
    if (escopo.isGlobal) {
        return { filtroAcesso: " AND (id_lotacao IS NULL OR id_lotacao = 0) ", filtroFerias: " AND (u.id_lotacao IS NULL OR u.id_lotacao = 0) " };
    }
    if (escopo.lotacoes.length === 0) return null;
    const inClause = escopo.lotacoes.join(',');
    return { filtroAcesso: ` AND id_lotacao IN (${inClause}) `, filtroFerias: ` AND u.id_lotacao IN (${inClause}) ` };
}

/** Aprovação de cadastro e de férias, filtrada pela lotação de quem tem cargo de aprovador. */
async function notificacoes(pool, idUsuario) {
    if (!idUsuario) return [];

    const rUser = await repositorio.dadosDoUsuario(pool, idUsuario);
    if (rUser.recordset.length === 0) return [];

    const nomeFuncao = (rUser.recordset[0].nome_funcao || '').toUpperCase();
    if (!ehAprovador(nomeFuncao)) return [];

    // Escopo COMPLETO do aprovador: sem as lotações extras, um Líder de Projeto vinculado só como extra não recebia a notificação.
    const filtros = filtrosDeAprovacao(await getUserScope(pool, idUsuario));
    if (!filtros) return [];

    return (await repositorio.pendenciasDeAprovacao(pool, filtros.filtroAcesso, filtros.filtroFerias)).recordset;
}

module.exports = { totais, proximasFerias, progressoPlanos, atividadesHojeImplantacao, atividadesHojeProjetos, notificacoes };
