/* Exportações do Faturamento Consolidado. As bibliotecas só carregam ao exportar. */
import type { DadosPainel } from '@/features/faturamento/api';
import { comSinal, fmtPart, fmtVar, rotComp, varPerc, type Consolidado } from '@/features/faturamento/consolidacao';
import { fmtMoeda, fmtNum, fmtProc } from '@/features/sigtap/formatos';
import type { Celula, ColunaPdf, Rgb } from '@/shared/pdfRelatorio';

const VERDE_ESCURO: Rgb = [27, 94, 32];
const VERMELHO: Rgb = [162, 59, 54];
const QTD_RANKING = 40;
const QTD_CBOS = 20;
const QTD_PARARAM = 15;

type Coluna = ColunaPdf;

/** O gerador de PDF ainda é JavaScript (pdfRelatorio.js); aqui fica só o que esta tela usa dele. */
export async function exportarExcel(m: Consolidado, dados: DadosPainel): Promise<void> {
    const XLSX = await import('xlsx');
    const planilha = XLSX.utils.book_new();
    const cabecalho = m.comps.map(rotComp);
    const nomeGrupo = (cod: string) => `${cod} - ${dados.subgrupos[cod] ?? ''}`;
    const adicionar = (linhas: unknown[][], nome: string) => XLSX.utils.book_append_sheet(planilha, XLSX.utils.aoa_to_sheet(linhas), nome);

    const somaPorGrupo = (campo: 'vl' | 'qt') => {
        const grupos = new Map<string, Record<string, number>>();
        m.listaProcs.forEach((item) => {
            const atual = grupos.get(item.grupo) ?? {};
            grupos.set(item.grupo, Object.fromEntries(m.comps.map((c) => [c, (atual[c] ?? 0) + (item[campo][c] ?? 0)])));
        });
        return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cod, meses]) => [nomeGrupo(cod), ...m.comps.map((c) => meses[c] ?? 0), m.comps.reduce((soma, c) => soma + (meses[c] ?? 0), 0)]);
    };

    adicionar([
        ['GRUPO', ...cabecalho, 'TOTAL'],
        ...somaPorGrupo('vl'),
        ['TOTAL GERAL (R$)', ...m.serie.map((item) => item.vl), m.totalVl],
        [],
        ['GRUPO (QUANTIDADE)', ...cabecalho, 'TOTAL'],
        ...somaPorGrupo('qt'),
        ['QUANTIDADE TOTAL', ...m.serie.map((item) => item.qt), m.totalQt]
    ], 'RESUMO GERAL');

    const ordenados = [...m.listaProcs].sort((a, b) => a.cod.localeCompare(b.cod));
    const porProcedimento = (campo: 'vl' | 'qt') => [
        ['GRUPO', 'PROCEDIMENTO', 'DESCRIÇÃO', ...cabecalho, 'TOTAL'],
        ...ordenados.map((item) => [nomeGrupo(item.grupo), item.cod, item.nome, ...m.comps.map((c) => item[campo][c] ?? 0), campo === 'vl' ? item.totalVl : item.totalQt])
    ];
    adicionar(porProcedimento('vl'), 'EVOLUÇÃO VALOR');
    adicionar(porProcedimento('qt'), 'EVOLUÇÃO QUANTIDADE');
    if (m.listaUnis.length) {
        adicionar([
            ['UNIDADE', 'PROJETO', ...cabecalho.map((c) => `${c} R$`), ...cabecalho.map((c) => `${c} QTD`)],
            ...m.listaUnis.map((unidade) => [unidade.nome, unidade.projeto, ...m.comps.map((c) => unidade.vl[c] ?? ''), ...m.comps.map((c) => unidade.qt[c] ?? '')])
        ], 'UNIDADES');
    }
    adicionar([
        ['COMPETENCIA', 'PROCEDIMENTO', 'DESCRIÇÃO', 'QUANTIDADE', 'VALOR TOTAL', 'GRUPO'],
        ...dados.procedimentos.map((item) => [item.competencia, item.co_procedimento, item.no_procedimento, item.qt, item.vl, nomeGrupo(item.co_procedimento.slice(0, 4))])
    ], 'BASE');
    XLSX.writeFile(planilha, `Faturamento_Consolidado_${m.primeira}_${m.ultima}.xlsx`);
}

interface ContextoPdf {
    ehValor: boolean;
    filtros: string;
    usuario?: string;
    fmtM: (valor: number) => string;
    fmtEixo: (valor: number) => string;
}

export async function exportarPdf(m: Consolidado, { ehValor, filtros, usuario, fmtM, fmtEixo }: ContextoPdf): Promise<void> {
    const { criarRelatorioPDF } = await import('@/shared/pdfRelatorio');
    const pdf = await criarRelatorioPDF(
        'Faturamento Consolidado',
        `Competências ${rotComp(m.primeira)} a ${rotComp(m.ultima)} · ${filtros} · ${ehValor ? 'Valor SIGTAP (R$)' : 'Quantidade produzida'}`,
        usuario
    );
    const { green, blue, muted } = pdf.colors;
    const curto = (valor: number) => fmtEixo(valor).replace('R$ ', '');
    const corVar = (valor?: number | null) => {
        if (!valor) return muted;
        return valor > 0 ? green : VERMELHO;
    };
    const celulaVar = (valor: number | null | undefined, formatar: (v: number) => string): Celula => (valor === null || valor === undefined ? '-' : { t: formatar(valor), color: corVar(valor) });
    const { penultima } = m;

    pdf.kpis([
        { num: fmtM(m.total), lbl: ehValor ? 'Faturamento no período' : 'Produção no período', sub: `${m.nMeses} competência(s)${ehValor ? '' : ` · ${fmtMoeda(m.totalVl)}`}` },
        { num: fmtM(m.ult.v), lbl: `Última competência · ${rotComp(m.ultima)}`, sub: `${fmtVar(m.ult.varP)} vs ${penultima ? rotComp(penultima) : '-'}`, subColor: corVar(m.ult.varP) },
        { num: fmtM(m.media), lbl: 'Média mensal', sub: `Último mês vs média 3m: ${fmtVar(m.vsMedia)}`, subColor: corVar(m.vsMedia) },
        { num: fmtVar(m.crescimento), lbl: 'Crescimento no período', sub: `${rotComp(m.primeira)} ${fmtEixo(m.serie[0]?.v ?? 0)} » ${rotComp(m.ultima)} ${fmtEixo(m.ult.v)}`, c: corVar(m.crescimento) },
        { num: `${rotComp(m.maior.c)} · ${fmtEixo(m.maior.v)}`, lbl: 'Melhor mês', sub: `Pior: ${rotComp(m.menor.c)} · ${fmtEixo(m.menor.v)}` },
        m.internacoes > 0
            ? { num: fmtNum(m.internacoes), lbl: 'Internações (AIHs)', sub: `${fmtNum(m.ult.aih)} em ${rotComp(m.ultima)}` }
            : { num: fmtNum(m.listaProcs.length), lbl: 'Procedimentos distintos', sub: `${fmtNum(m.totalQt)} realizados` }
    ]);

    pdf.bloco('Evolução mês a mês', blue);
    const metade = (pdf.CW - 8) / 2;
    const yGrafico = pdf.cursor.y;
    pdf.graficoBarras(m.serie.map((item) => ({ rot: item.rot, v: item.v, cor: item.c === m.maior.c ? VERDE_ESCURO : green })), { titulo: 'Mensal (barra escura = melhor mês)', fmt: fmtEixo, largura: metade });
    const yFim = pdf.cursor.y;
    pdf.cursor.y = yGrafico;
    pdf.graficoBarras(m.serie.slice(1).map((item) => ({ rot: item.rot, v: item.varV ?? 0, cor: (item.varV ?? 0) >= 0 ? green : VERMELHO })), { titulo: 'Variação vs mês anterior', fmt: fmtEixo, x0: pdf.M + metade + 8, largura: metade });
    pdf.cursor.y = Math.max(yFim, pdf.cursor.y) + 2;
    const comAih = m.internacoes > 0;
    const larguraEvolucao = pdf.CW / (comAih ? 7 : 6);
    const colEvolucao = (h: string, a: Coluna['a'] = 'r'): Coluna => ({ h, w: larguraEvolucao, a });
    pdf.tabela(
        [colEvolucao('Competência', 'l'), colEvolucao('Quantidade'), colEvolucao('Valor SIGTAP'), ...(comAih ? [colEvolucao('Internações')] : []), colEvolucao('Variação'), colEvolucao('Variação %'), colEvolucao('Acumulado')],
        [
            ...m.serie.map((item): Celula[] => [
                { t: item.rot + (item.sem ? ' (sem lançamento)' : ''), bold: item.c === m.maior.c }, fmtNum(item.qt), fmtMoeda(item.vl),
                ...(comAih ? [fmtNum(item.aih)] : []),
                celulaVar(item.varV, (v) => comSinal(v, fmtM)), celulaVar(item.varP, fmtVar), fmtM(item.acum)
            ]),
            [{ t: 'TOTAL', bold: true }, { t: fmtNum(m.totalQt), bold: true }, { t: fmtMoeda(m.totalVl), bold: true }, ...(comAih ? [{ t: fmtNum(m.internacoes), bold: true }] : []), '', '', { t: fmtM(m.total), bold: true, color: green }]
        ]
    );

    if (penultima) {
        pdf.bloco(`Onde trabalhar · ${rotComp(m.ultima)} comparado a ${rotComp(penultima)}`, blue);
        const linha = (item: Consolidado['listaProcs'][number], valor: Celula): Celula[] => [`${fmtProc(item.cod)} · ${item.nome}`, fmtM(item.v[penultima] ?? 0), fmtM(item.v[m.ultima] ?? 0), valor];
        const colunas = (rotulo: string): Coluna[] => [{ h: rotulo, w: pdf.CW * 0.58, a: 'l' }, { h: rotComp(penultima), w: pdf.CW * 0.14, a: 'r' }, { h: rotComp(m.ultima), w: pdf.CW * 0.14, a: 'r' }, { h: 'Variação', w: pdf.CW * 0.14, a: 'r' }];
        if (m.quedas.length) pdf.tabela(colunas('Maiores quedas'), m.quedas.map((item) => linha(item, { t: comSinal(item.varUlt, fmtM), color: VERMELHO, bold: true })));
        if (m.altas.length) pdf.tabela(colunas('Maiores altas'), m.altas.map((item) => linha(item, { t: comSinal(item.varUlt, fmtM), color: green, bold: true })));
        if (m.pararam.length) pdf.tabela(colunas('Deixaram de ser apresentados'), m.pararam.slice(0, QTD_PARARAM).map((item) => linha(item, { t: 'zero no mês', color: VERMELHO })));
        if (m.listaUnis.length > 1 && m.semEnvio.length) pdf.texto(`Unidades sem envio em ${rotComp(m.ultima)}: ${m.semEnvio.map((unidade) => unidade.nome).join(', ')}.`, { color: VERMELHO });
    }

    pdf.bloco('Por grupo de procedimento', blue);
    const larguraNome = pdf.CW * 0.26;
    const larguraTotal = pdf.CW * 0.09;
    const larguraPart = pdf.CW * 0.06;
    const larguraMes = (pdf.CW - larguraNome - larguraTotal - larguraPart) / m.comps.length;
    pdf.tabela(
        [{ h: 'Grupo', w: larguraNome, a: 'l' }, ...m.comps.map((c): Coluna => ({ h: rotComp(c), w: larguraMes, a: 'r' })), { h: 'Total', w: larguraTotal, a: 'r' }, { h: 'Part.', w: larguraPart, a: 'r' }],
        m.gruposOrd.map((grupo): Celula[] => [`${grupo.cod} ${grupo.nome}`, ...m.comps.map((c) => curto(grupo.v[c] ?? 0)), { t: curto(grupo.total), bold: true }, fmtPart(m.total ? grupo.total / m.total : 0)])
    );

    const maiores = [...m.listaProcs].sort((a, b) => b.total - a.total).slice(0, QTD_RANKING);
    pdf.bloco(`Ranking de procedimentos · ${maiores.length} maiores de ${m.listaProcs.length}`, blue);
    pdf.tabela(
        [{ h: '#', w: pdf.CW * 0.04, a: 'c' }, { h: 'Procedimento', w: pdf.CW * 0.44, a: 'l' }, { h: 'Quantidade', w: pdf.CW * 0.1, a: 'r' }, { h: 'Valor SIGTAP', w: pdf.CW * 0.12, a: 'r' }, { h: 'Part.', w: pdf.CW * 0.07, a: 'r' }, { h: penultima ? `${rotComp(penultima)}»${rotComp(m.ultima)}` : 'Var.', w: pdf.CW * 0.12, a: 'r' }, { h: 'Período', w: pdf.CW * 0.11, a: 'r' }],
        maiores.map((item, indice): Celula[] => [
            String(indice + 1), `${fmtProc(item.cod)} · ${item.nome}`, fmtNum(item.totalQt), fmtMoeda(item.totalVl), fmtPart(item.part),
            penultima ? celulaVar(item.varUlt, (v) => comSinal(v, fmtM)) : '-',
            (item.v[m.primeira] ?? 0) === 0 && (item.v[m.ultima] ?? 0) > 0 ? { t: 'NOVO', color: green } : celulaVar(item.varPeriodo, fmtVar)
        ])
    );

    if (m.listaUnis.length > 1) {
        pdf.bloco('Unidade × competência', blue);
        const larguraUnidade = pdf.CW * 0.24;
        const larguraSoma = pdf.CW * 0.09;
        const larguraColuna = (pdf.CW - larguraUnidade - larguraSoma) / m.comps.length;
        pdf.tabela(
            [{ h: 'Unidade', w: larguraUnidade, a: 'l' }, ...m.comps.map((c): Coluna => ({ h: rotComp(c), w: larguraColuna, a: 'r' })), { h: 'Total', w: larguraSoma, a: 'r' }],
            m.listaUnis.map((unidade): Celula[] => [unidade.nome, ...m.comps.map((c): Celula => {
                const valor = unidade.v[c];
                return valor === undefined ? { t: 'sem envio', color: VERMELHO } : curto(valor);
            }), { t: curto(unidade.total), bold: true }])
        );
    }

    if (m.listaCbos.length) {
        pdf.bloco('Por categoria profissional (CBO)', blue);
        pdf.tabela(
            [{ h: 'CBO', w: pdf.CW * 0.1, a: 'l' }, { h: 'Ocupação', w: pdf.CW * 0.45, a: 'l' }, { h: 'Quantidade', w: pdf.CW * 0.15, a: 'r' }, { h: 'Valor SIGTAP', w: pdf.CW * 0.15, a: 'r' }, { h: penultima ? `Var. ${rotComp(m.ultima)}` : 'Var.', w: pdf.CW * 0.15, a: 'r' }],
            m.listaCbos.slice(0, QTD_CBOS).map((cbo): Celula[] => [cbo.cod, cbo.nome, fmtNum(cbo.totalQt), fmtMoeda(cbo.totalVl), penultima ? celulaVar(varPerc(cbo.v[m.ultima] ?? 0, cbo.v[penultima] ?? 0), fmtVar) : '-'])
        );
    }

    pdf.texto('Valores de tabela SIGTAP da produção apresentada (BPA/APAC: serviço ambulatorial; AIH: hospitalar + profissional do procedimento principal e especiais), não o valor aprovado/pago.', { italic: true });
    pdf.finalizar(`Faturamento_Consolidado_${m.primeira}_${m.ultima}`);
}
