/* services/faturamentoLeitor.js
 * Leitura dos arquivos de produção SUS (Operações > Lançar Faturamento).
 *  - BPA  : exportação do BPA Magnético (cabeçalho 01#BPA#, linhas 02 = BPA-C, 03 = BPA-I).
 *  - APAC : exportação do APAC Magnético (cabeçalho 01#APAC, linhas 14 = corpo, 13 = procedimentos).
 *  - AIH  : exportação do SISAIH01 (linha 01 = AIH, 03 = continuação; até 9 procedimentos por linha).
 * O resultado é a produção agregada por origem + procedimento + CBO, sem dado
 * pessoal (o CNS do paciente só é usado para contar pacientes distintos).
 * Arquivos .zip são abertos e o maior arquivo de dentro é lido. */
const { abrirZip } = require('../utils/zipLeitor');

const TIPOS = ['BPA', 'APAC', 'AIH'];

// Posição 1-based (como nos manuais do DATASUS) -> substring
const campo = (linha, ini, tam) => linha.substr(ini - 1, tam);
const soDig = (s) => String(s || '').replace(/\D/g, '');
const inteiro = (s) => { const n = parseInt(soDig(s), 10); return isNaN(n) ? 0 : n; };
const compValida = (c) => /^\d{6}$/.test(c) && +c.slice(4) >= 1 && +c.slice(4) <= 12 && +c.slice(0, 4) >= 2000;

/** Buffer do upload -> { nome, texto }. Descompacta .zip (maior entrada). */
function extrairTexto(buffer, nomeArquivo) {
    let nome = nomeArquivo || 'arquivo';
    let buf = buffer;
    if (buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50) {
        const zip = abrirZip(buf);
        const nomes = zip.nomes();
        if (!nomes.length) throw new Error('O .zip está vazio.');
        let maior = null;
        for (const n of nomes) {
            const conteudo = zip.ler(n);
            if (conteudo && (!maior || conteudo.length > maior.buf.length)) maior = { n, buf: conteudo };
        }
        nome = maior.n.toUpperCase();
        buf = maior.buf;
    }
    // Arquivos do DATASUS são gravados em ISO-8859-1
    return { nome, texto: buf.toString('latin1') };
}

function detectarTipo(texto) {
    const ini = texto.slice(0, 12).toUpperCase();
    if (ini.startsWith('01#BPA#')) return 'BPA';
    if (ini.startsWith('01#APAC')) return 'APAC';
    return 'AIH';
}

/** Acumula a produção agregada. */
function novoAcumulador() {
    const itens = new Map();
    const pacientes = new Set();
    return {
        itens, pacientes, registros: 0,
        somar(origem, proc, cbo, qtd) {
            if (!/^\d{10}$/.test(proc) || qtd <= 0) return;
            const k = `${origem}|${proc}|${cbo}`;
            const it = itens.get(k);
            if (it) it.quantidade += qtd;
            else itens.set(k, { origem, co_procedimento: proc, co_cbo: cbo, quantidade: qtd });
        }
    };
}

// ------------------------------------------------------------------ BPA
function lerBPA(linhas) {
    const cab = linhas[0];
    const acc = novoAcumulador();
    const cnes = new Map();
    for (const l of linhas) {
        const tp = l.slice(0, 2);
        if (tp === '02') {          // BPA consolidado
            acc.registros++;
            cnes.set(campo(l, 3, 7), (cnes.get(campo(l, 3, 7)) || 0) + 1);
            acc.somar('BPA-C', campo(l, 27, 10), soDig(campo(l, 16, 6)), inteiro(campo(l, 40, 6)));
        } else if (tp === '03') {   // BPA individualizado
            acc.registros++;
            cnes.set(campo(l, 3, 7), (cnes.get(campo(l, 3, 7)) || 0) + 1);
            acc.somar('BPA-I', campo(l, 50, 10), soDig(campo(l, 31, 6)), inteiro(campo(l, 89, 6)));
            const cns = soDig(campo(l, 60, 15));
            if (cns.length === 15) acc.pacientes.add(cns);
        }
    }
    return {
        competencia: soDig(campo(cab, 8, 6)),
        cnes: maisFrequente(cnes),
        origem: campo(cab, 30, 30).trim(),
        acc
    };
}

// ------------------------------------------------------------------ APAC
function lerAPAC(linhas) {
    const cab = linhas[0];
    const acc = novoAcumulador();
    const cnes = new Map();
    const apacs = new Set();
    for (const l of linhas) {
        const tp = l.slice(0, 2);
        if (tp === '14') {          // corpo da APAC
            apacs.add(campo(l, 9, 13));
            const c = soDig(campo(l, 24, 7));
            if (c.length === 7) cnes.set(c, (cnes.get(c) || 0) + 1);
        } else if (tp === '13') {   // procedimentos realizados
            acc.registros++;
            acc.somar('APAC', campo(l, 22, 10), soDig(campo(l, 32, 6)), inteiro(campo(l, 38, 7)));
        }
    }
    return { competencia: soDig(campo(cab, 8, 6)), cnes: maisFrequente(cnes), origem: campo(cab, 30, 30).trim(), acc, apacs: apacs.size };
}

// ------------------------------------------------------------------ AIH (SISAIH01)
// Cabeçalho de cada linha: 12-17 apresentação (AAAAMM), 31-37 CNES, 44-56 nº da AIH,
// 57-58 identificação (01 = AIH, 03 = continuação, 05 = longa permanência).
// Procedimentos realizados: 9 blocos de 79 posições a partir da 718
// (código 10, quantidade 3, competência 6; CBO do profissional 38 posições antes do código).
// O 1º bloco da linha 01 é o procedimento principal (AIH-P); os demais são secundários/especiais (AIH-S).
const AIH_INI = 718, AIH_BLOCO = 79, AIH_BLOCOS = 9;
function lerAIH(linhas) {
    const acc = novoAcumulador();
    const cnes = new Map();
    const comps = new Map();
    const aihs = new Set();
    for (const l of linhas) {
        const ident = campo(l, 57, 2);
        if (l.length < AIH_INI + 18 || !['01', '03', '05'].includes(ident)) continue;
        const num = soDig(campo(l, 44, 13));
        if (num.length !== 13) continue;
        if (ident !== '03') aihs.add(num);
        const c = soDig(campo(l, 31, 7));
        if (c.length === 7) cnes.set(c, (cnes.get(c) || 0) + 1);
        const cmp = soDig(campo(l, 12, 6));
        if (compValida(cmp)) comps.set(cmp, (comps.get(cmp) || 0) + 1);
        for (let b = 0; b < AIH_BLOCOS; b++) {
            const p = AIH_INI + b * AIH_BLOCO;
            const proc = campo(l, p, 10);
            if (!/^\d{10}$/.test(proc) || proc === '0000000000') continue;
            const principal = ident === '01' && b === 0;
            acc.somar(principal ? 'AIH-P' : 'AIH-S', proc, soDig(campo(l, p - 38, 6)), inteiro(campo(l, p + 10, 3)) || (principal ? 1 : 0));
        }
    }
    acc.registros = aihs.size;   // nº de AIHs (internações) apresentadas
    return { competencia: maisFrequente(comps), cnes: maisFrequente(cnes), origem: '', acc };
}

function maisFrequente(mapa) {
    let melhor = '', n = -1;
    for (const [k, v] of mapa) if (v > n) { melhor = k; n = v; }
    return melhor;
}

/**
 * Lê o arquivo e devolve a produção agregada.
 * @returns {{ tipo, arquivo, competencia, cnes, origem, registros, pacientes, itens: Array }}
 */
function lerArquivo(buffer, nomeArquivo) {
    const { nome, texto } = extrairTexto(buffer, nomeArquivo);
    const linhas = texto.split(/\r?\n/).map(l => l.replace(/\r$/, '')).filter(l => l.trim());
    if (!linhas.length) throw new Error('Arquivo vazio.');
    const tipo = detectarTipo(texto);
    const r = tipo === 'BPA' ? lerBPA(linhas) : tipo === 'APAC' ? lerAPAC(linhas) : lerAIH(linhas);
    const itens = [...r.acc.itens.values()];
    if (!itens.length) {
        throw new Error(tipo === 'AIH'
            ? 'Não foi possível reconhecer o arquivo. Envie o arquivo exportado do BPA, APAC ou SISAIH01.'
            : `Nenhum procedimento encontrado no arquivo de ${tipo}.`);
    }
    return {
        tipo,
        arquivo: nome,
        competencia: compValida(r.competencia) ? r.competencia : '',
        cnes: r.cnes || '',
        origem: r.origem || '',
        registros: r.acc.registros,
        pacientes: r.acc.pacientes.size,
        apacs: r.apacs,
        itens
    };
}

module.exports = { lerArquivo, TIPOS, compValida };
