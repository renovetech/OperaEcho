/* services/sigtapImportacao.js
 * Importação do pacote .zip da Tabela Unificada SIGTAP (DATASUS).
 * Mesmas regras do RenoveReg/RenoveSaúde:
 *  - só o .zip original, que precisa conter tb_procedimento.txt;
 *  - uma importação por vez, processada em segundo plano com etapa/percentual;
 *  - tudo numa única transação: se qualquer etapa falhar, nada muda;
 *  - registra arquivo, competência, usuário, início/fim e totais.
 * Reimportar uma competência já existente substitui os dados dela. */
const { connectToDb, sql } = require('../config/database');
const { abrirZip } = require('../utils/zipLeitor');
const { TABELAS, ddlCompleto } = require('./sigtapCatalogo');

const LOTE = 3000;          // linhas por bulk (abaixo do limiar de escalonamento de lock)
const LOTE_EXCLUSAO = 20000;
const AGORA = `DATEADD(hour, -3, GETUTCDATE())`;

const progresso = new Map(); // id_importacao -> { etapa, percentual }
let emExecucao = null;       // id da importação rodando neste processo
let estruturaOk = false;

const erro = (status, msg) => Object.assign(new Error(msg), { status });

/** Cria as tabelas do SIGTAP se ainda não existirem (uma vez por processo). */
async function garantirEstrutura(pool) {
    if (estruturaOk) return;
    await pool.request().batch(ddlCompleto());
    estruturaOk = true;
}

/** Importações marcadas como PROCESSANDO que não estão rodando aqui foram interrompidas (reinício do servidor). */
async function encerrarOrfas(pool) {
    await pool.request()
        .input('id', sql.Int, emExecucao || 0)
        .query(`UPDATE tab_sigtap_importacao
                SET situacao = 'ERRO', dt_fim = ${AGORA}, mensagem = 'Importação interrompida (servidor reiniciado). Envie o arquivo novamente.'
                WHERE situacao = 'PROCESSANDO' AND id_importacao <> @id`);
}

// ---------------------------------------------------------------- leitura do pacote
function textoDe(zip, arquivo) {
    const b = zip.ler(`${arquivo}.txt`);
    if (!b) return null;
    return b.toString('latin1').replace(/^ï»¿/, '').replace(/^﻿/, '');
}

/** Posições [início 0-based, fim exclusivo] por coluna: *_layout.txt do pacote, senão o padrão do catálogo. */
function posicoes(zip, t) {
    const doPacote = {};
    const csv = textoDe(zip, `${t.arquivo}_layout`);
    if (csv) {
        const linhas = csv.split(/\r?\n/).filter(Boolean);
        const cab = (linhas.shift() || '').toLowerCase().split(',').map(s => s.trim());
        const iN = cab.indexOf('coluna'), iI = cab.findIndex(c => c === 'inicio' || c === 'início'), iF = cab.indexOf('fim');
        if (iN >= 0 && iI >= 0 && iF >= 0) {
            linhas.forEach(l => {
                const p = l.split(',');
                const ini = parseInt(p[iI], 10), fim = parseInt(p[iF], 10);
                if (p[iN] && !isNaN(ini) && !isNaN(fim)) doPacote[p[iN].trim().toLowerCase()] = [ini - 1, fim];
            });
        }
    }
    const pos = {};
    t.colunas.forEach(([nome, , tam, ini]) => { pos[nome] = doPacote[nome] || [ini - 1, ini - 1 + tam]; });
    pos.dt_competencia = doPacote.dt_competencia || null;
    return pos;
}

function valor(bruto, tipo, tam) {
    const v = (bruto || '').trim();
    if (tipo === 'c' || tipo === 'n') return v ? v.slice(0, tam) : null;
    if (!/^-?\d+$/.test(v)) return null;
    const n = parseInt(v, 10);
    return tipo === 'm' || tipo === 'p' ? n / 100 : n;
}

/** Competência do pacote = DT_COMPETENCIA da primeira linha de tb_procedimento. */
function competenciaDoPacote(zip) {
    const txt = textoDe(zip, 'tb_procedimento');
    if (!txt) throw erro(400, 'O pacote não contém o arquivo tb_procedimento.txt.');
    const t = TABELAS.find(x => x.arquivo === 'tb_procedimento');
    const [ini, fim] = posicoes(zip, t).dt_competencia || [330, 336];
    const linha = txt.split(/\r?\n/).find(l => l.trim());
    const comp = linha ? linha.substring(ini, fim).trim() : '';
    if (!/^\d{6}$/.test(comp)) throw erro(400, 'Não foi possível identificar a competência em tb_procedimento.txt.');
    const mes = parseInt(comp.slice(4), 10);
    if (mes < 1 || mes > 12) throw erro(400, `Competência inválida no pacote (${comp}).`);
    return comp;
}

// ---------------------------------------------------------------- início (síncrono na requisição)
async function iniciar({ buffer, nomeArquivo, usuario }) {
    const nome = String(nomeArquivo || 'sigtap.zip').slice(0, 255);
    if (!buffer || !buffer.length) throw erro(400, 'Selecione o arquivo .zip da Tabela Unificada.');
    if (!/\.zip$/i.test(nome)) throw erro(400, 'O arquivo precisa ser o .zip original baixado do SIGTAP.');

    let zip;
    try { zip = abrirZip(buffer); } catch (e) { throw erro(400, 'O arquivo enviado não é um .zip válido.'); }
    if (!zip.tem('tb_procedimento.txt')) throw erro(400, 'O pacote não contém o arquivo tb_procedimento.txt.');
    const competencia = competenciaDoPacote(zip);

    const pool = await connectToDb();
    await garantirEstrutura(pool);
    await encerrarOrfas(pool);
    if (emExecucao) throw erro(409, 'Já existe uma importação em andamento. Aguarde a conclusão.');

    const r = await pool.request()
        .input('a', sql.VarChar(255), nome)
        .input('c', sql.Char(6), competencia)
        .input('u', sql.VarChar(150), String(usuario || 'Sistema').slice(0, 150))
        .query(`INSERT INTO tab_sigtap_importacao (arquivo, competencia, situacao, usuario, dt_inicio)
                OUTPUT INSERTED.id_importacao
                VALUES (@a, @c, 'PROCESSANDO', @u, ${AGORA})`);
    const id = r.recordset[0].id_importacao;

    emExecucao = id;
    progresso.set(id, { etapa: 'Aguardando início', percentual: 0 });
    setImmediate(() => executar(id, zip, competencia));
    return id;
}

// ---------------------------------------------------------------- processamento (segundo plano)
const ROTULOS = {
    tb_procedimento: 'Procedimentos', tb_descricao: 'Descrições', tb_cid: 'CID-10', tb_ocupacao: 'CBO (ocupações)',
    rl_procedimento_cid: 'Procedimento x CID', rl_procedimento_ocupacao: 'Procedimento x CBO',
    rl_procedimento_compativel: 'Compatibilidades', rl_excecao_compatibilidade: 'Exceções de compatibilidade',
    rl_procedimento_habilitacao: 'Habilitações', rl_procedimento_servico: 'Serviços/Classificação',
    tb_tuss: 'TUSS', tb_sia_sih: 'Tabela SIA/SIH', tb_descricao_detalhe: 'Descrição dos atributos',
    rl_procedimento_modalidade: 'Modalidades', rl_procedimento_leito: 'Leitos', rl_procedimento_sia_sih: 'Correspondência SIA/SIH',
    rl_procedimento_renases: 'RENASES', rl_procedimento_tuss: 'Procedimento x TUSS', rl_procedimento_incremento: 'Incrementos', rl_procedimento_registro: 'Instrumentos de registro', rl_procedimento_detalhe: 'Atributos complementares'
};

function tipoMssql(tipo, tam) {
    switch (tipo) {
        case 'c': return sql.VarChar(tam);
        case 'n': return sql.NVarChar(tam);
        case 'i': return sql.Int;
        case 'm': return sql.Decimal(14, 2);
        default: return sql.Decimal(9, 2);
    }
}

async function excluirCompetencia(tx, tabela, competencia) {
    for (;;) {
        const r = await new sql.Request(tx).input('c', sql.Char(6), competencia)
            .query(`DELETE TOP (${LOTE_EXCLUSAO}) FROM ${tabela} WHERE competencia = @c`);
        if (!r.rowsAffected[0]) break;
    }
}

async function carregarTabela(tx, zip, t, competencia) {
    const txt = textoDe(zip, t.arquivo);
    if (txt === null) return 0; // pacote sem o arquivo: tabela fica sem dados nesta competência
    const pos = posicoes(zip, t);

    const novaTabela = () => {
        const tb = new sql.Table(t.tabela);
        tb.create = false;
        tb.columns.add('competencia', sql.Char(6), { nullable: false });
        t.colunas.forEach(([nome, tipo, tam]) => tb.columns.add(nome, tipoMssql(tipo, tam), { nullable: !t.chave.includes(nome) }));
        return tb;
    };

    const iChave = t.chave.map(c => t.colunas.findIndex(x => x[0] === c));
    const vistos = new Set();
    const linhas = [];
    for (const linha of txt.split(/\r?\n/)) {
        if (!linha.trim()) continue;
        const valores = t.colunas.map(([nome, tipo, tam]) => {
            const v = valor(linha.substring(pos[nome][0], pos[nome][1]), tipo, tam);
            return v === null && t.chave.includes(nome) ? '' : v;
        });
        const chave = iChave.map(i => valores[i]).join('|');
        if (!chave.replace(/\|/g, '') || vistos.has(chave)) continue;
        vistos.add(chave);
        linhas.push(valores);
    }

    // Linhas já na ordem da chave clusterizada + dica ORDER: o SQL Server não ordena
    // nem pede memória de ordenação (evita espera RESOURCE_SEMAPHORE em linhas largas).
    linhas.sort((a, b) => {
        for (const i of iChave) {
            if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1;
        }
        return 0;
    });
    const ordem = { competencia: 'ASC' };
    t.chave.forEach(c => { ordem[c] = 'ASC'; });

    for (let i = 0; i < linhas.length; i += LOTE) {
        const tb = novaTabela();
        linhas.slice(i, i + LOTE).forEach(v => tb.rows.add(competencia, ...v));
        await new sql.Request(tx).bulk(tb, { order: ordem });
    }
    return linhas.length;
}

async function executar(id, zip, competencia) {
    const etapa = (e, p) => progresso.set(id, { etapa: e, percentual: Math.min(99, Math.round(p)) });
    let pool, tx;
    try {
        pool = await connectToDb();
        tx = new sql.Transaction(pool);
        await tx.begin();

        // Reimportação: apaga a competência antiga (dentro da mesma transação). Competência nova pula esta etapa.
        const existe = await new sql.Request(tx).input('c', sql.Char(6), competencia)
            .query(`SELECT TOP 1 1 AS x FROM tab_sigtap_tb_procedimento WHERE competencia = @c`);
        const inicioCarga = existe.recordset.length ? 30 : 3;
        if (existe.recordset.length) {
            for (let i = 0; i < TABELAS.length; i++) {
                etapa(`Substituindo dados da competência (${i + 1}/${TABELAS.length})`, 2 + (i / TABELAS.length) * (inicioCarga - 2));
                await excluirCompetencia(tx, TABELAS[i].tabela, competencia);
            }
        }

        // Peso de cada tabela = tamanho do arquivo (percentual acompanha o volume real).
        const pesos = TABELAS.map(t => (zip.ler(`${t.arquivo}.txt`) || { length: 0 }).length);
        const pesoTotal = pesos.reduce((a, b) => a + b, 0) || 1;
        let acumulado = 0, registros = 0;
        const contagem = {};

        for (let i = 0; i < TABELAS.length; i++) {
            const t = TABELAS[i];
            etapa(ROTULOS[t.arquivo] || `Tabela ${t.arquivo}`, inicioCarga + (acumulado / pesoTotal) * (90 - inicioCarga));
            contagem[t.arquivo] = await carregarTabela(tx, zip, t, competencia);
            registros += contagem[t.arquivo];
            acumulado += pesos[i];
        }
        if (!contagem.tb_procedimento) throw new Error('Nenhum procedimento válido foi encontrado em tb_procedimento.txt.');

        etapa('Comparando com a competência anterior', 92);
        const rn = await new sql.Request(tx).input('c', sql.Char(6), competencia).query(`
            DECLARE @ant CHAR(6) = (SELECT MAX(competencia) FROM tab_sigtap_tb_procedimento WHERE competencia < @c);
            SELECT COUNT(*) AS novos FROM tab_sigtap_tb_procedimento p
            WHERE p.competencia = @c
              AND (@ant IS NULL OR NOT EXISTS (SELECT 1 FROM tab_sigtap_tb_procedimento a WHERE a.competencia = @ant AND a.co_procedimento = p.co_procedimento));`);

        etapa('Concluindo', 98);
        await new sql.Request(tx).input('c', sql.Char(6), competencia)
            .query(`UPDATE tab_sigtap_importacao SET removida = 0 WHERE competencia = @c AND situacao = 'CONCLUIDA'`);
        await tx.commit();
        tx = null;

        await pool.request()
            .input('id', sql.Int, id)
            .input('p', sql.Int, contagem.tb_procedimento)
            .input('n', sql.Int, rn.recordset[0].novos)
            .input('cp', sql.Int, contagem.rl_procedimento_compativel || 0)
            .input('r', sql.Int, registros)
            .query(`UPDATE tab_sigtap_importacao
                    SET situacao = 'CONCLUIDA', dt_fim = ${AGORA}, qt_procedimentos = @p, qt_novos = @n,
                        qt_compatibilidades = @cp, qt_registros = @r, removida = 0, mensagem = NULL
                    WHERE id_importacao = @id`);
        console.log(`SIGTAP ${competencia} importado: ${contagem.tb_procedimento} procedimentos, ${registros} registros.`);
    } catch (e) {
        console.error(`Falha na importação SIGTAP ${id}:`, e.message);
        if (tx) { try { await tx.rollback(); } catch (_) { /* conexão já encerrada */ } }
        try {
            await (pool || await connectToDb()).request()
                .input('id', sql.Int, id)
                .input('m', sql.VarChar(2000), String(e.message || e).slice(0, 2000))
                .query(`UPDATE tab_sigtap_importacao SET situacao = 'ERRO', dt_fim = ${AGORA}, mensagem = @m WHERE id_importacao = @id`);
        } catch (_) { /* sem banco: a próxima consulta encerra como órfã */ }
    } finally {
        progresso.delete(id);
        emExecucao = null;
    }
}

/** Remove todos os dados de uma competência (o histórico de importações é mantido). */
async function removerCompetencia(competencia) {
    if (emExecucao) throw erro(409, 'Aguarde a importação em andamento terminar.');
    const pool = await connectToDb();
    await garantirEstrutura(pool);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const t of TABELAS) await excluirCompetencia(tx, t.tabela, competencia);
        await new sql.Request(tx).input('c', sql.Char(6), competencia)
            .query(`UPDATE tab_sigtap_importacao SET removida = 1 WHERE competencia = @c`);
        await tx.commit();
    } catch (e) {
        await tx.rollback();
        throw e;
    }
}

module.exports = {
    iniciar, removerCompetencia, garantirEstrutura, encerrarOrfas,
    progressoDe: (id) => progresso.get(id) || null
};
