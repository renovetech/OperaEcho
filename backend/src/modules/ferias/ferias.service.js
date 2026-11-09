/* Férias: regras de negócio (quem aprova quem, prazo legal da CLT, períodos, escala e relatório de prazos). */
const { connectToDb } = require('../../config/database');
const repositorio = require('./ferias.repository');

const MS_POR_DIA = 86400000;
// Período máximo de um lançamento de férias (evita laço de dezenas de milhares de
// dias dentro de uma transação com datas absurdas - vetor de DoS no banco)
const MAX_DIAS_FERIAS = 60;
const MESES_LIMITE_GOZO = 23;
const DIAS_FERIAS_VENDIDAS = 30;
const DIAS_SALDO_TOTAL = 30;
const DIAS_PROXIMO_LIMITE = 90;
const PRIMEIRO_PERIODO = '1º Período (15 Dias)';
const SEGUNDO_PERIODO = '2º Período (15 Dias)';
const MENSAGEM_PERIODO_INVALIDO = `Período inválido (data final antes da inicial ou acima de ${MAX_DIAS_FERIAS} dias).`;

// Normaliza função (sem acentos / maiúsculas) para comparações estáveis
const normalizarFuncao = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .trim().toUpperCase();

// Regra de aprovação por função do aprovador x função do solicitante.
// - Administrador / Gerente  -> qualquer um
// - Coordenador de Implantação -> somente IMPLANTADOR
// - Líder de Projeto -> somente ANALISTA e OPERADOR
function podeAprovarFuncao(escopo, funcaoSolicitante) {
    const aprov = normalizarFuncao(escopo && escopo.nome_funcao);
    const ehAdmin = (escopo && escopo.perfil_acesso) === 'Administrador';
    const alvo = normalizarFuncao(funcaoSolicitante);

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
    return repositorio.colaboradorNasLotacoes(pool, alvo, escopo.lotacoes);
}

function periodoValido(di, df) {
    const a = new Date(di), b = new Date(df);
    if (isNaN(a) || isNaN(b) || b < a) return false;
    return (b - a) / MS_POR_DIA + 1 <= MAX_DIAS_FERIAS;
}

/** Último dia em que as férias do período aquisitivo podem terminar: início do período + 1 ano e 11 meses. */
function limiteDoPeriodo(inicioPA) {
    const limite = new Date(inicioPA);
    limite.setMonth(limite.getMonth() + MESES_LIMITE_GOZO);
    limite.setDate(limite.getDate() - 1);
    return limite;
}

const dataIso = (data) => data.toISOString().split('T')[0];

// ==============================================================================
// VALIDAÇÃO DO LIMITE LEGAL (CLT - Art. 134)
// Período máximo de gozo: 1 ano e 11 meses a partir do início do período aquisitivo
// ==============================================================================
async function validarLimitePeriodoAquisitivo(id_usuario, periodo_aquisitivo, data_fim) {
    const pool = await connectToDb();
    const dataAdmissao = await repositorio.buscarDataAdmissao(pool, id_usuario);
    if (!dataAdmissao) {
        return { valido: false, motivo: 'Data de admissão não cadastrada para este usuário.' };
    }

    // Início do período aquisitivo: dia/mês da admissão no ano informado
    const adm = new Date(dataAdmissao);   // coluna DATE: meia-noite UTC
    const inicioPA = new Date(parseInt(periodo_aquisitivo), adm.getUTCMonth(), adm.getUTCDate());
    const limite = limiteDoPeriodo(inicioPA);

    if (new Date(data_fim) > limite) {
        const limiteFmt = dataIso(limite);
        return {
            valido: false,
            motivo: `A solicitação ultrapassa o prazo legal de 1 ano e 11 meses do período aquisitivo de ${periodo_aquisitivo}. Data limite: ${limiteFmt}.`,
            data_limite: limiteFmt
        };
    }

    return { valido: true };
}

// ==============================================================================
// SALDO E SOBREPOSIÇÃO: mesma conta da web e do app. Quem vende 10 dias consome os 30 do período.
// O aviso de conflito com colegas é outra coisa: continua só como aviso, na aprovação.
// ==============================================================================
const DIAS_POR_PERIODO = 30;
const TIPOS_COM_VENDA = ['10 Vendidos', '20 Dias (c/ 10'];

function custoDaSolicitacao({ tipo, inicio, fim }) {
    if (TIPOS_COM_VENDA.some((marca) => String(tipo || '').includes(marca))) return DIAS_POR_PERIODO;
    return Math.ceil(Math.abs(new Date(fim) - new Date(inicio)) / MS_POR_DIA) + 1;
}

const custoDaLinha = (linha) => custoDaSolicitacao({ tipo: linha.tipo_solicitacao, inicio: linha.data_inicio, fim: linha.data_fim });

/** Devolve { erro } ou { restante }, o saldo do período antes desta solicitação. */
async function conferirSaldoESobreposicao(pool, { idUsuario, periodoAquisitivo, tipoSolicitacao, dataInicio, dataFim, idIgnorado }) {
    const ativas = await repositorio.listarFeriasAtivas(pool, parseInt(idUsuario));
    const outras = ativas.filter((linha) => linha.id_ferias !== idIgnorado);
    const inicio = new Date(dataInicio);
    const fim = new Date(dataFim);
    if (outras.some((linha) => new Date(linha.data_inicio) <= fim && new Date(linha.data_fim) >= inicio)) {
        return { erro: 'O colaborador já tem férias solicitadas ou aprovadas neste período.' };
    }
    const doPeriodo = (linha) => String(linha.periodo_aquisitivo) === String(periodoAquisitivo);
    const usados = outras.filter(doPeriodo).reduce((soma, linha) => soma + custoDaLinha(linha), 0);
    const restante = Math.max(0, DIAS_POR_PERIODO - usados);
    const custo = custoDaSolicitacao({ tipo: tipoSolicitacao, inicio: dataInicio, fim: dataFim });
    // Na edição, um histórico antigo acima do saldo não impede ajuste que não aumente os dias.
    const atual = ativas.find((linha) => linha.id_ferias === idIgnorado);
    const aumentou = !atual || custo > custoDaLinha(atual);
    if (aumentou && custo > restante) return { erro: `A solicitação consome ${custo} dias e o saldo do período é de ${restante} dias.` };
    return { restante };
}

// ==============================================================================
// REORDENAÇÃO CRONOLÓGICA DOS PERÍODOS
// ==============================================================================
async function reordenarPeriodosDeFerias(id_usuario, periodo_aquisitivo) {
    try {
        const pool = await connectToDb();
        const records = await repositorio.listarPeriodosAtivos(pool, id_usuario, periodo_aquisitivo);
        if (records.length > 0 && records[0].tipo_solicitacao !== PRIMEIRO_PERIODO) {
            await repositorio.definirTipoDoPeriodo(pool, records[0].id_ferias, PRIMEIRO_PERIODO);
        }
        if (records.length > 1 && records[1].tipo_solicitacao !== SEGUNDO_PERIODO) {
            await repositorio.definirTipoDoPeriodo(pool, records[1].id_ferias, SEGUNDO_PERIODO);
        }
    } catch (err) { console.error("Erro ao reordenar períodos:", err); }
}

// ==============================================================================
// SYNC ESCALA (INSERIR/REMOVER FÉRIAS)
// ==============================================================================
async function syncEscalaFerias(transaction, id_usuario, data_inicio, data_fim, acao) {
    if (acao === 'inserir') {
        if (!periodoValido(data_inicio, data_fim)) throw Object.assign(new Error('Período de férias inválido.'), { status: 400 });
        let curr = new Date(data_inicio);
        const end = new Date(data_fim);
        while (curr <= end) {
            await repositorio.marcarFeriasNaEscala(transaction, id_usuario, dataIso(curr));
            curr.setDate(curr.getDate() + 1);
        }
    } else if (acao === 'remover') {
        await repositorio.removerFeriasDaEscala(transaction, id_usuario, data_inicio, data_fim);
    }
}

// ==============================================================================
// RELATÓRIO DE PRAZOS LEGAIS (CLT - Art. 134) - Convenção RH
// PA = ano em que o direito é adquirido (admissão + N anos)
// ==============================================================================
function diasDaSolicitacao(f) {
    if (f.tipo_solicitacao && (f.tipo_solicitacao.includes('10 Vendidos') || f.tipo_solicitacao.includes('20 Dias (c/ 10'))) {
        return DIAS_FERIAS_VENDIDAS;
    }
    const ini = new Date(f.data_inicio);
    const fim = new Date(f.data_fim);
    return Math.ceil(Math.abs(fim - ini) / MS_POR_DIA) + 1;
}

function somarDias(feriasDoPA) {
    let diasGozados = 0;     // Soma somente solicitações APROVADAS
    let diasEmAnalise = 0;   // Soma somente solicitações PENDENTES (informativo)
    for (const f of feriasDoPA) {
        const dias = diasDaSolicitacao(f);
        if (f.status === 'APROVADO') diasGozados += dias;
        else if (f.status === 'PENDENTE') diasEmAnalise += dias;
    }
    return { diasGozados, diasEmAnalise };
}

function statusDoPrazo(diasParaLimite) {
    if (diasParaLimite < 0) return 'VENCIDO';
    if (diasParaLimite <= DIAS_PROXIMO_LIMITE) return 'PROXIMO_LIMITE';
    return 'NO_PRAZO';
}

function linhaDoPeriodo(u, pa, feriasDoPA, hoje) {
    const adm = new Date(u.data_admissao);   // coluna DATE: meia-noite UTC
    const inicioPA = new Date(pa, adm.getUTCMonth(), adm.getUTCDate());
    const limite = limiteDoPeriodo(inicioPA);
    const { diasGozados, diasEmAnalise } = somarDias(feriasDoPA);
    const diasParaLimite = Math.ceil((limite - hoje) / MS_POR_DIA);

    return {
        id_usuario: u.id_usuario,
        matricula: u.matricula,
        nome_completo: u.nome_completo,
        setor: u.setor,
        funcao: u.funcao,
        data_admissao: u.data_admissao,
        periodo_aquisitivo: pa,
        inicio_pa: dataIso(inicioPA),
        data_limite: dataIso(limite),
        dias_gozados: diasGozados,
        dias_em_analise: diasEmAnalise,
        // Saldo restante = 30 - somente o que foi APROVADO
        // (dias em análise NÃO consomem saldo, ainda estão disponíveis)
        saldo_restante: DIAS_SALDO_TOTAL - diasGozados,
        dias_para_limite: diasParaLimite,
        status_prazo: statusDoPrazo(diasParaLimite)
    };
}

/** PA "N" inicia em N/mês/dia da admissão e termina em (N+1)/mês/(dia-1). */
function periodoJaAdquirido(u, pa, hoje) {
    const adm = new Date(u.data_admissao);
    const fimPA = new Date(pa + 1, adm.getUTCMonth(), adm.getUTCDate());
    fimPA.setDate(fimPA.getDate() - 1);
    return fimPA < hoje;
}

function linhasDoUsuario(u, ferias, hoje) {
    const linhas = [];
    const anoAdmissao = new Date(u.data_admissao).getUTCFullYear();
    for (let pa = anoAdmissao; pa <= hoje.getFullYear(); pa++) {
        // Só entra no relatório se o direito já foi adquirido (fim do PA já passou)
        if (!periodoJaAdquirido(u, pa, hoje)) continue;
        const feriasDoPA = ferias.filter(f => f.id_usuario === u.id_usuario && f.periodo_aquisitivo === pa);
        // Só considera PAs que tenham alguma solicitação registrada no sistema.
        // O sistema tem histórico curto: PAs anteriores ao uso do sistema não devem
        // aparecer como "vencidos" só porque não há registro digital deles.
        if (feriasDoPA.length === 0) continue;
        linhas.push(linhaDoPeriodo(u, pa, feriasDoPA, hoje));
    }
    return linhas;
}

function montarRelatorioPrazos(usuarios, ferias, agora = new Date()) {
    const hoje = new Date(agora);
    hoje.setHours(0, 0, 0, 0);
    const linhas = usuarios.flatMap(u => linhasDoUsuario(u, ferias, hoje));
    linhas.sort((a, b) => a.dias_para_limite - b.dias_para_limite);
    return linhas;
}

module.exports = {
    MENSAGEM_PERIODO_INVALIDO, podeAprovarFuncao, normalizarFuncao, podeVerColaborador, periodoValido,
    validarLimitePeriodoAquisitivo, conferirSaldoESobreposicao, reordenarPeriodosDeFerias, syncEscalaFerias, montarRelatorioPrazos
};
