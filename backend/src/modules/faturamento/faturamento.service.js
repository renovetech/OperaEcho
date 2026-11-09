/* Faturamento SUS: regras de negócio (produtos que faturam, valorização pela SIGTAP, análise do arquivo e painel). */
const { httpErro } = require('../../middlewares/errorHandler');
const { lerArquivo, TIPOS, compValida } = require('./faturamento.leitor');
const repositorio = require('./faturamento.repository');

const TAMANHO_PAGINA_PADRAO = 15;
const TAMANHO_PAGINA_MINIMO = 5;
const TAMANHO_PAGINA_MAXIMO = 100;
const MAX_PRODUTOS_NO_FILTRO = 50;
const MAX_PROCEDIMENTOS_NA_PREVIA = 300;
const LIMITE_LAYOUT_RECONHECIDO = 0.6;
const MIN_CODIGOS_PARA_CONFERIR_LAYOUT = 3;
const ORIGENS = ['BPA-C', 'BPA-I', 'APAC', 'AIH-P', 'AIH-S'];

/* Produtos que geram produção SUS: tipos de arquivo aceitos e estrutura de atendimento (filtro do painel).
 * BPA (e APAC) para a produção ambulatorial; AIH só para internação (KlinikosNet e SER II Internação).
 * Chave = nome do produto sem acento, minúsculo. Produto fora da lista não lança faturamento. */
const PRODUTOS_FATURAMENTO = {
    'klinikosnet': { tipos: ['BPA', 'APAC', 'AIH'], estrutura: 'hosp' },
    'upa24h': { tipos: ['BPA', 'APAC'], estrutura: 'hosp' },
    'ser ii (internacao)': { tipos: ['AIH'], estrutura: 'hosp' },
    'prime saude': { tipos: ['BPA', 'APAC'], estrutura: 'aps' },
    'prime saude mental': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'prime tea': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (ambulatorio)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (linhas de cuidado)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'ser ii (tfd)': { tipos: ['BPA', 'APAC'], estrutura: 'esp' },
    'trs': { tipos: ['BPA', 'APAC'], estrutura: 'esp' }
};
const chaveProduto = (nome) => String(nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const regraProduto = (nome) => PRODUTOS_FATURAMENTO[chaveProduto(nome)] || null;
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const idOuNull = (v) => { const n = parseInt(v, 10); return n > 0 ? n : null; };
const arredondar = (valor) => Math.round(valor * 100) / 100;
const somar = (itens, campo) => itens.reduce((s, i) => s + i[campo], 0);
const num = (v) => Number(v) || 0;

function fmtComp(c) { return /^\d{6}$/.test(c || '') ? `${c.slice(4)}/${c.slice(0, 4)}` : '-'; }

// ============================================================================ SIGTAP
/** Tabela SIGTAP usada para valorizar: a da competência; senão a anterior mais próxima; senão a mais antiga. */
async function escolherSigtap(pool, competencia) {
    const lista = await repositorio.listarCompetenciasSigtap(pool);
    if (!lista.length) return null;
    return lista.find(c => c <= competencia) || lista[lista.length - 1];
}

/** Valor unitário de um item: BPA/APAC = serviço ambulatorial (SA); AIH = hospitalar + profissional (SH + SP).
 *  Na AIH só é pago o procedimento principal; um secundário só vale se a SIGTAP o admite como
 *  "AIH (proc. especial)" ou "AIH (proc. secundário)" - instrumentos 04/05 (ex.: diária de permanência a maior). */
function valorUnitario(item, p) {
    const pagoNaAih = item.origem !== 'AIH-S' || (p && p.aih_secundario);
    if (!p || !pagoNaAih) return 0;
    return item.origem.startsWith('AIH') ? Number(p.vl_sh || 0) + Number(p.vl_sp || 0) : Number(p.vl_sa || 0);
}

/** Valoriza os itens pela SIGTAP (altera os itens recebidos). */
async function valorizar(pool, itens, sigtap) {
    const codigos = [...new Set(itens.map(i => i.co_procedimento))];
    const tabela = sigtap && codigos.length ? await repositorio.buscarProcedimentosSigtap(pool, sigtap, codigos) : new Map();
    let semValor = 0;
    for (const it of itens) {
        const p = tabela.get(it.co_procedimento);
        if (!p) semValor++;
        const unit = valorUnitario(it, p);
        it.no_procedimento = p ? p.no_procedimento : (it.no_procedimento || null);
        it.vl_unitario = arredondar(unit);
        it.vl_total = arredondar(unit * it.quantidade);
        it.encontrado = !!p;
    }
    return { semValor, reconhecidos: codigos.filter(c => tabela.has(c)).length, totalCodigos: codigos.length };
}

// ============================================================================ análise do arquivo
/** Projeto/unidade/produto do formulário, validando escopo e vínculo da unidade ao projeto. */
async function validarDestino(pool, body, escopo) {
    const b = body || {};
    const id_projeto = idOuNull(b.id_projeto), id_unidade = idOuNull(b.id_unidade), id_produto = idOuNull(b.id_produto);
    const tipo = String(b.tipo || '').toUpperCase();
    const competencia = soDigitos(b.competencia);
    if (!id_projeto || !id_unidade || !id_produto) throw httpErro(400, 'Selecione projeto, unidade e produto.');
    if (!TIPOS.includes(tipo)) throw httpErro(400, 'Tipo de arquivo inválido (BPA, APAC ou AIH).');
    if (competencia && !compValida(competencia)) throw httpErro(400, 'Competência inválida.');
    const dest = await repositorio.buscarDestino(pool, escopo, { idProjeto: id_projeto, idUnidade: id_unidade, idProduto: id_produto });
    if (!dest) throw httpErro(403, 'Unidade não pertence ao projeto ou está fora da sua lotação.');
    if (!dest.nome_produto) throw httpErro(400, 'Produto inválido.');
    // Cada produto aceita só os seus tipos de arquivo (AIH: KlinikosNet e SER II Internação)
    const regra = regraProduto(dest.nome_produto);
    if (!regra) throw httpErro(400, `O produto ${dest.nome_produto} não gera faturamento SUS.`);
    if (!regra.tipos.includes(tipo)) throw httpErro(400, `${tipo} não é lançado no produto ${dest.nome_produto}. Tipos aceitos: ${regra.tipos.join(', ')}.`);
    return { id_projeto, id_unidade, id_produto, tipo, competencia, dest };
}

function lerUpload(arquivo) {
    if (!arquivo) throw httpErro(400, 'Selecione o arquivo de produção.');
    try { return lerArquivo(arquivo.buffer, arquivo.originalname); }
    catch (e) { throw httpErro(400, e.message); }
}

/** Avisos que dependem só do arquivo e do destino (competência e CNES conferidos). */
function avisosDoDestino(arq, d) {
    const avisos = [];
    if (arq.competencia && d.competencia && arq.competencia !== d.competencia) {
        avisos.push({ nivel: 'alerta', texto: `O arquivo é da competência ${fmtComp(arq.competencia)}, mas foi selecionada ${fmtComp(d.competencia)}.` });
    }
    const cnesUni = soDigitos(d.dest.cnes);
    if (arq.cnes && cnesUni && arq.cnes !== cnesUni.padStart(7, '0')) {
        avisos.push({ nivel: 'alerta', texto: `O CNES do arquivo (${arq.cnes}) é diferente do CNES da unidade ${d.dest.nome_unidade} (${cnesUni}).` });
    }
    return avisos;
}

function avisosDaSigtap(sigtap, competencia) {
    if (!sigtap) return [{ nivel: 'erro', texto: 'Nenhuma Tabela SIGTAP importada. Importe em Parâmetros > SIGTAP para valorizar a produção.' }];
    if (sigtap !== competencia) return [{ nivel: 'info', texto: `A SIGTAP ${fmtComp(competencia)} não está importada; valores calculados pela tabela ${fmtComp(sigtap)}.` }];
    return [];
}

/** Layout não reconhecido: a maioria dos códigos não existe na SIGTAP. */
function conferirLayout(val, sigtap, tipo) {
    if (sigtap && val.totalCodigos >= MIN_CODIGOS_PARA_CONFERIR_LAYOUT && val.reconhecidos / val.totalCodigos < LIMITE_LAYOUT_RECONHECIDO) {
        throw httpErro(400, `Layout do arquivo não reconhecido: só ${val.reconhecidos} de ${val.totalCodigos} códigos existem na SIGTAP. Confira se o arquivo é o exportado do ${tipo}.`);
    }
}

/** Agregado por procedimento (para a prévia), do maior valor para o menor. */
function agregarProcedimentos(itens) {
    const porProc = new Map();
    for (const it of itens) {
        const p = porProc.get(it.co_procedimento) || { co_procedimento: it.co_procedimento, no_procedimento: it.no_procedimento, quantidade: 0, vl_unitario: it.vl_unitario, vl_total: 0, encontrado: it.encontrado };
        p.quantidade += it.quantidade; p.vl_total += it.vl_total;
        porProc.set(it.co_procedimento, p);
    }
    const procedimentos = [...porProc.values()].map(p => ({ ...p, vl_total: arredondar(p.vl_total) }))
        .sort((a, b) => b.vl_total - a.vl_total || b.quantidade - a.quantidade);
    return { procedimentos, quantidade: porProc.size };
}

function resumirAnalise({ arq, d, competencia, sigtap, val, quantidadeProcedimentos }) {
    return {
        tipo: arq.tipo, arquivo: arq.arquivo, competencia, competencia_arquivo: arq.competencia, cnes_arquivo: arq.cnes,
        origem: arq.origem, sigtap_competencia: sigtap,
        unidade: d.dest.nome_unidade, cnes_unidade: d.dest.cnes, projeto: d.dest.nome_projeto, produto: d.dest.nome_produto,
        qt_registros: arq.registros, qt_pacientes: arq.pacientes, qt_procedimentos: quantidadeProcedimentos,
        qt_total: somar(arq.itens, 'quantidade'),
        vl_total: arredondar(somar(arq.itens, 'vl_total')),
        qt_sem_valor: val.semValor,
        por_origem: ORIGENS.map(o => {
            const daOrigem = arq.itens.filter(i => i.origem === o);
            return { origem: o, quantidade: somar(daOrigem, 'quantidade'), vl_total: arredondar(somar(daOrigem, 'vl_total')) };
        }).filter(o => o.quantidade > 0)
    };
}

/** Monta a análise (prévia) do arquivo para o destino escolhido. */
async function analisar(pool, { body, file, escopo }) {
    const d = await validarDestino(pool, body, escopo);
    const arq = lerUpload(file);
    if (arq.tipo !== d.tipo) throw httpErro(400, `O arquivo enviado é de ${arq.tipo}, mas o tipo selecionado é ${d.tipo}.`);
    const competencia = d.competencia || arq.competencia;
    if (!competencia) throw httpErro(400, 'Informe a competência: o arquivo não traz uma competência válida.');
    const avisos = avisosDoDestino(arq, d);
    const sigtap = await escolherSigtap(pool, competencia);
    avisos.push(...avisosDaSigtap(sigtap, competencia));
    const val = await valorizar(pool, arq.itens, sigtap);
    if (val.semValor) avisos.push({ nivel: 'info', texto: `${val.semValor} código(s) de procedimento não encontrados na SIGTAP ${fmtComp(sigtap)} (entram com valor zero).` });
    conferirLayout(val, sigtap, d.tipo);
    const existente = await repositorio.buscarLancamentoExistente(pool, d, competencia);
    const { procedimentos, quantidade } = agregarProcedimentos(arq.itens);

    return {
        destino: d, arq, sigtap, avisos, procedimentos,
        resumo: resumirAnalise({ arq, d, competencia, sigtap, val, quantidadeProcedimentos: quantidade }),
        existente
    };
}

/** Resposta da prévia: sem gravar nada. */
async function previaDoArquivo(pool, dados) {
    const a = await analisar(pool, dados);
    return { resumo: a.resumo, avisos: a.avisos, existente: a.existente, procedimentos: a.procedimentos.slice(0, MAX_PROCEDIMENTOS_NA_PREVIA) };
}

// ============================================================================ lançamentos
async function nomeDoUsuario(pool, usuario) {
    const nome = await repositorio.buscarNomeDoUsuario(pool, usuario?.id_usuario || 0);
    return nome || usuario?.usuario || 'Sistema';
}

/** Grava o lançamento. Se já existir para o mesmo destino/competência/tipo, só substitui com substituir=1.
 *  Devolve { conflito } quando já existe e não foi pedida a substituição. */
async function lancarFaturamento(pool, { body, file, escopo, usuario }) {
    const a = await analisar(pool, { body, file, escopo });
    if (!a.sigtap) throw httpErro(400, 'Importe a Tabela SIGTAP (Parâmetros > SIGTAP) antes de lançar o faturamento.');
    const substituir = String(body.substituir || '') === '1';
    if (a.existente && !substituir) return { conflito: a.existente };
    const nome = await nomeDoUsuario(pool, usuario);
    const id = await repositorio.gravarLancamento(pool, {
        existente: a.existente, destino: a.destino, resumo: a.resumo, itens: a.arq.itens,
        idUsuario: usuario?.id_usuario || null, usuario: nome
    });
    return { id, substituido: Boolean(a.existente), resumo: a.resumo };
}

function filtrosDosLancamentos(q) {
    return {
        projeto: idOuNull(q.projeto), unidade: idOuNull(q.unidade), produto: idOuNull(q.produto),
        tipo: tipoValido(q.tipo), competencia: competenciaValida(q.competencia),
        pagina: Math.max(1, parseInt(q.pagina, 10) || 1),
        tamanho: Math.min(TAMANHO_PAGINA_MAXIMO, Math.max(TAMANHO_PAGINA_MINIMO, parseInt(q.tamanho, 10) || TAMANHO_PAGINA_PADRAO))
    };
}

function tipoValido(valor) {
    const tipo = String(valor || '').toUpperCase();
    return TIPOS.includes(tipo) ? tipo : null;
}

function competenciaValida(valor) {
    const competencia = soDigitos(valor);
    return compValida(competencia) ? competencia : null;
}

async function listarLancamentos(pool, escopo, q) {
    const filtros = filtrosDosLancamentos(q);
    const itens = await repositorio.listarLancamentos(pool, escopo, filtros);
    return { itens, total: itens[0]?.total || 0, pagina: filtros.pagina, tamanho: filtros.tamanho };
}

async function carregarLancamento(pool, escopo, idParam) {
    const id = idOuNull(idParam);
    if (!id) throw httpErro(400, 'Lançamento inválido.');
    const l = await repositorio.buscarLancamento(pool, escopo, id);
    if (!l) throw httpErro(404, 'Lançamento não encontrado.');
    return l;
}

/** Recalcula os valores com a melhor SIGTAP disponível agora (ex.: a competência foi importada depois). */
async function revalorizarLancamento(pool, l) {
    const sigtap = await escolherSigtap(pool, l.competencia);
    if (!sigtap) throw httpErro(400, 'Nenhuma Tabela SIGTAP importada.');
    const itens = await repositorio.listarItensDoLancamento(pool, l.id_lancamento);
    const val = await valorizar(pool, itens, sigtap);
    const total = arredondar(somar(itens, 'vl_total'));
    await repositorio.regravarItens(pool, l.id_lancamento, itens, { sigtap, total, semValor: val.semValor });
    return { mensagem: `Valores recalculados pela SIGTAP ${fmtComp(sigtap)}.`, vl_anterior: Number(l.vl_total), vl_total: total, sigtap_competencia: sigtap };
}

// ============================================================================ cadastros e painel
/** Cadastros para os filtros: projetos, unidades e produtos (respeitando a lotação). */
async function montarOpcoes(pool, escopo) {
    const projetos = await repositorio.listarProjetos(pool, escopo);
    const unidades = (await repositorio.listarUnidades(pool, escopo))
        .map(u => ({ ...u, produtos: u.produtos ? u.produtos.split(',').map(Number) : [] }));
    // Só os produtos que geram faturamento, com os tipos de arquivo aceitos e a estrutura
    const produtos = (await repositorio.listarProdutosAtivos(pool))
        .map(p => ({ ...p, ...regraProduto(p.nome_produto) })).filter(p => p.tipos);
    return { projetos, unidades, produtos, sigtap: await repositorio.listarCompetenciasSigtap(pool) };
}

function filtrosDoPainel(q) {
    return {
        projeto: idOuNull(q.projeto), unidade: idOuNull(q.unidade), produto: idOuNull(q.produto),
        produtos: q.produtos ? String(q.produtos).split(',').map(idOuNull).filter(Boolean).slice(0, MAX_PRODUTOS_NO_FILTRO) : null,
        tipo: tipoValido(q.tipo), de: competenciaValida(q.de), ate: competenciaValida(q.ate)
    };
}

/** Nomes de subgrupos e CBOs pela SIGTAP mais recente. */
async function nomesDaSigtap(pool, cbos) {
    const subgrupos = {}, ocupacoes = {};
    const sig = (await repositorio.listarCompetenciasSigtap(pool))[0];
    if (!sig) return { subgrupos, ocupacoes };
    (await repositorio.buscarSubgruposSigtap(pool, sig)).forEach(x => { subgrupos[x.cod] = x.no_sub_grupo; });
    const codCbo = [...new Set(cbos.map(c => c.co_cbo))];
    if (codCbo.length) {
        (await repositorio.buscarOcupacoesSigtap(pool, sig, codCbo)).forEach(x => { ocupacoes[x.co_ocupacao] = x.no_ocupacao; });
    }
    return { subgrupos, ocupacoes };
}

/** Dados do Faturamento Consolidado: série mensal, procedimento × competência, unidade × competência e CBO. */
async function montarPainel(pool, escopo, q) {
    const filtros = filtrosDoPainel(q);
    const compsTodas = await repositorio.listarCompetenciasDisponiveis(pool, escopo, filtros);
    const { mensal, procs, unidades, cbos } = await repositorio.consultarPainel(pool, escopo, filtros);
    const { subgrupos, ocupacoes } = await nomesDaSigtap(pool, cbos);
    return {
        competencias_disponiveis: compsTodas,
        mensal: mensal.map(m => ({ ...m, vl_total: num(m.vl_total) })),
        procedimentos: procs.map(p => ({ ...p, vl: num(p.vl) })),
        unidades: unidades.map(u => ({ ...u, vl: num(u.vl) })),
        cbos: cbos.map(c => ({ ...c, vl: num(c.vl) })),
        subgrupos, ocupacoes
    };
}

module.exports = {
    garantirEstrutura: repositorio.garantirEstrutura,
    montarOpcoes, previaDoArquivo, lancarFaturamento, listarLancamentos, carregarLancamento,
    revalorizarLancamento, montarPainel, buscarProcedimentosDoLancamento: repositorio.agruparProcedimentosDoLancamento,
    excluirLancamento: repositorio.excluirLancamento
};
