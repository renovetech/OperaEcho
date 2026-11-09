/* Exportações da folha: JPG pela captura da tela, PDF vetorial no padrão formal e Excel. */
import type { jsPDF as JsPdfDocumento } from 'jspdf';
import { horaOuVazio, minutosParaHora, type LinhaDia, type TotaisHoras, type TotalUnidade } from '@/features/horaExtra/calculos';
import { capturarElemento, carimbarCampos, salvarCanvasJpg, trocarCamposPorTexto } from '@/shared/exportacao';

type Rgb = [number, number, number];

const VERDE: Rgb = [27, 94, 32];
const LATAO: Rgb = [156, 122, 60];
const TINTA: Rgb = [30, 41, 59];
const APAGADO: Rgb = [100, 116, 139];
const FIO: Rgb = [203, 213, 225];
const FIO_CLARO: Rgb = [238, 241, 245];
const FUNDO_FERIADO: Rgb = [246, 241, 230];
const FUNDO_FOLGA: Rgb = [248, 250, 252];

const MARGEM = 12;
const ALTURA_LOGO = 16;
const LARGURA_TABELA = 203;
const ESPACO_COLUNAS = 6;
const ALTURA_CABECALHO_TABELA = 7;
const LINHA_MIN = 4;
const LINHA_MAX = 6;

const COLUNAS = [
    { titulo: 'Dia', largura: 10 }, { titulo: 'Sem.', largura: 13 }, { titulo: 'Unidade', largura: 46, esquerda: true },
    { titulo: 'Fer.', largura: 8 }, { titulo: 'Fol.', largura: 8 },
    { titulo: 'Entrada', largura: 16 }, { titulo: 'Saída', largura: 16 }, { titulo: 'Interv.', largura: 16 },
    { titulo: 'Efetivas', largura: 23 }, { titulo: '50%', largura: 16 }, { titulo: '100%', largura: 16 }, { titulo: 'Ad. N.', largura: 15 }
];

export interface DadosFolha {
    colaborador: string;
    mes: string;
    projeto: string;
    unidade: string;
    emissor: string;
    linhas: LinhaDia[];
    totais: TotaisHoras;
    porUnidade: TotalUnidade[];
    nomeUnidade: (id: number | null) => string;
    nomeProjeto: (id: number | null) => string;
}

const nomeDoArquivo = (dados: Pick<DadosFolha, 'colaborador' | 'mes'>) => `HE_${dados.colaborador}_${dados.mes}`;
const periodoDe = (mes: string) => mes.split('-').reverse().join('/');

function apresentarCampo(campo: Element, texto: string) {
    const ehUnidade = campo instanceof HTMLSelectElement;
    return {
        texto: texto === '-' ? '' : texto,
        estilo: `font-size:12.5px;line-height:26px;height:26px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:#1e293b;text-align:${ehUnidade ? 'left' : 'center'};${ehUnidade ? 'max-width:190px;' : ''}`
    };
}

export async function salvarFolhaJpg(folha: HTMLElement, dados: Pick<DadosFolha, 'colaborador' | 'mes'>): Promise<void> {
    const liberar = carimbarCampos(folha);
    try {
        const canvas = await capturarElemento(folha, { prepararCopia: (copia) => trocarCamposPorTexto(copia, apresentarCampo) });
        salvarCanvasJpg(canvas, nomeDoArquivo(dados));
    } finally {
        liberar();
    }
}

const carregarLogo = () => new Promise<HTMLImageElement | null>((resolver) => {
    const imagem = new Image();
    imagem.onload = () => resolver(imagem);
    imagem.onerror = () => resolver(null);
    imagem.src = '/logo.png';
});

function celulasDaLinha(linha: LinhaDia, dados: DadosFolha): string[] {
    const horario = (valor: string) => (linha.isFolga ? '' : valor);
    return [
        String(linha.dia), linha.diaSemanaStr.slice(0, 3), linha.isFolga ? '' : dados.nomeUnidade(linha.id_unidade),
        linha.isFeriado ? 'X' : '', linha.isFolga ? 'X' : '',
        horario(linha.entrada), horario(linha.saida), horario(linha.intervalo),
        linha.isFolga ? 'FOLGA' : linha.displayEfetivas, horaOuVazio(linha.he50), horaOuVazio(linha.he100), horaOuVazio(linha.adNoturno)
    ];
}

const corDaColuna = (indice: number, linha: LinhaDia): Rgb => {
    if (indice === 11) return LATAO;
    if (indice === 9 || indice === 10) return VERDE;
    return linha.isFolga ? APAGADO : TINTA;
};

/** Folha em uma página: a tabela à esquerda e o resumo com as assinaturas à direita. */
export async function salvarFolhaPdf(dados: DadosFolha): Promise<void> {
    const { default: JsPdf } = await import('jspdf');
    const doc = new JsPdf('l', 'mm', 'a4');
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();
    const fim = largura - MARGEM;

    const logo = await carregarLogo();
    if (logo) doc.addImage(logo, 'PNG', MARGEM, MARGEM, ALTURA_LOGO * (logo.naturalWidth / logo.naturalHeight || 1), ALTURA_LOGO);
    doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...LATAO);
    doc.text('F O L H A   D E   P O N T O', fim, MARGEM + 2, { align: 'right' });
    doc.setFont('times', 'bold').setFontSize(16).setTextColor(...VERDE);
    doc.text('Horas Extras', fim, MARGEM + 8.5, { align: 'right' });
    doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...TINTA);
    doc.text(`${dados.colaborador} · ${periodoDe(dados.mes)} · Projeto: ${dados.projeto} · Unidade: ${dados.unidade}`, fim, MARGEM + 13, { align: 'right' });
    doc.setFontSize(7.5).setTextColor(...APAGADO);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} por ${dados.emissor}`, fim, MARGEM + 17, { align: 'right' });
    const topoCorpo = MARGEM + 20;
    doc.setDrawColor(...VERDE).setLineWidth(0.5).line(MARGEM, topoCorpo, fim, topoCorpo).setLineWidth(0.2);

    const inicioTabela = topoCorpo + 5;
    desenharTabela(doc, dados, inicioTabela, altura - 10);
    desenharResumo(doc, dados, MARGEM + LARGURA_TABELA + ESPACO_COLUNAS, inicioTabela, largura - 2 * MARGEM - LARGURA_TABELA - ESPACO_COLUNAS);

    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...APAGADO);
    doc.text('Opera Echo Management System · Folha de Ponto / Horas Extras', MARGEM, altura - 5);
    doc.save(`${nomeDoArquivo(dados)}.pdf`);
}

type Documento = JsPdfDocumento;

function ajustarTexto(doc: Documento, texto: string, limite: number): string {
    if (doc.getTextWidth(texto) <= limite) return texto;
    let curto = texto;
    while (curto.length > 1 && doc.getTextWidth(`${curto}…`) > limite) curto = curto.slice(0, -1);
    return `${curto}…`;
}

function desenharTabela(doc: Documento, dados: DadosFolha, topo: number, limite: number): void {
    const alturaLinha = Math.max(LINHA_MIN, Math.min(LINHA_MAX, (limite - topo - ALTURA_CABECALHO_TABELA) / Math.max(dados.linhas.length, 1)));
    const fonte = alturaLinha < 4.6 ? 6.5 : 7;
    const posicoes = COLUNAS.reduce<number[]>((lista, coluna) => [...lista, (lista.at(-1) ?? MARGEM) + coluna.largura], [MARGEM]);
    const centro = (indice: number) => (posicoes[indice] ?? 0) + (COLUNAS[indice]?.largura ?? 0) / 2;

    doc.setFont('helvetica', 'bold').setFontSize(fonte).setTextColor(...TINTA);
    COLUNAS.forEach((coluna, indice) => doc.text(coluna.titulo.toUpperCase(), centro(indice), topo + ALTURA_CABECALHO_TABELA - 2.3, { align: 'center' }));
    let y = topo + ALTURA_CABECALHO_TABELA;
    doc.setDrawColor(...VERDE).line(MARGEM, y, MARGEM + LARGURA_TABELA, y);

    dados.linhas.forEach((linha) => {
        if (linha.isFeriado || linha.isFolga || linha.isFDS) {
            doc.setFillColor(...(linha.isFeriado ? FUNDO_FERIADO : FUNDO_FOLGA)).rect(MARGEM, y, LARGURA_TABELA, alturaLinha, 'F');
        }
        celulasDaLinha(linha, dados).forEach((texto, indice) => {
            const coluna = COLUNAS[indice];
            if (!coluna || !texto) return;
            const negrito = indice === 0 || indice >= 8;
            doc.setFont('helvetica', negrito ? 'bold' : 'normal').setFontSize(fonte).setTextColor(...corDaColuna(indice, linha));
            if (coluna.esquerda) doc.text(ajustarTexto(doc, texto, coluna.largura - 3), (posicoes[indice] ?? 0) + 1.5, y + alturaLinha - 1.3);
            else doc.text(texto, centro(indice), y + alturaLinha - 1.3, { align: 'center' });
        });
        y += alturaLinha;
        doc.setDrawColor(...FIO_CLARO).line(MARGEM, y, MARGEM + LARGURA_TABELA, y);
    });
}

function desenharResumo(doc: Documento, dados: DadosFolha, x: number, topo: number, largura: number): void {
    const direita = x + largura;
    const secao = (titulo: string, y: number) => {
        doc.setFont('times', 'bold').setFontSize(11).setTextColor(...VERDE).text(titulo, x, y);
        doc.setDrawColor(...FIO).line(x, y + 1.5, direita, y + 1.5);
    };
    const linha = (rotulo: string, valor: string, cor: Rgb, y: number) => {
        doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...APAGADO).text(rotulo, x, y);
        doc.setFont('helvetica', 'bold').setTextColor(...cor).text(valor, direita, y, { align: 'right' });
    };

    secao('Resumo mensal', topo + 4);
    linha('Carga base', '200:00', TINTA, topo + 10);
    linha('Horas trabalhadas', minutosParaHora(dados.totais.horasEfetivas), TINTA, topo + 15);
    linha('Hora extra 50%', minutosParaHora(dados.totais.he50), VERDE, topo + 20);
    linha('Hora extra 100%', minutosParaHora(dados.totais.he100), VERDE, topo + 25);
    linha('Adicional noturno', minutosParaHora(dados.totais.adNoturno), LATAO, topo + 30);

    let y = topo + 39;
    if (dados.porUnidade.length > 0) {
        const variosProjetos = new Set(dados.porUnidade.map((item) => item.id_projeto).filter(Boolean)).size > 1;
        secao('Por unidade', y);
        y += 6;
        dados.porUnidade.forEach((item) => {
            const nome = variosProjetos ? `${dados.nomeProjeto(item.id_projeto)} · ${dados.nomeUnidade(item.id_unidade)}` : dados.nomeUnidade(item.id_unidade);
            doc.setFont('helvetica', 'bold').setFontSize(7.5).setTextColor(...TINTA);
            doc.text(ajustarTexto(doc, nome, largura), x, y);
            doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...APAGADO).text(`50% ${minutosParaHora(item.he50)} · 100% ${minutosParaHora(item.he100)} · Not. ${minutosParaHora(item.adNoturno)}`, x, y + 3.6);
            y += 8;
        });
    }

    doc.setFont('times', 'italic').setFontSize(8).setTextColor(...APAGADO).text('Valores sujeitos a conferência do RH.', x, y + 1);
    const assinatura = (rotulo: string, yLinha: number) => {
        doc.setDrawColor(...TINTA).line(x + 4, yLinha, direita - 4, yLinha);
        doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(...APAGADO).text(rotulo, x + largura / 2, yLinha + 4, { align: 'center' });
    };
    assinatura('Assinatura do colaborador', y + 18);
    assinatura('Assinatura do gestor', y + 36);
}

export async function salvarFolhaExcel(dados: DadosFolha): Promise<void> {
    const XLSX = await import('xlsx');
    const planilha = [
        ['FOLHA DE PONTO / HORAS EXTRAS'],
        ['Colaborador:', dados.colaborador, 'Período:', dados.mes],
        ['Projeto:', dados.projeto, 'Unidade:', dados.unidade],
        [''],
        ['Dia', 'Semana', 'Projeto', 'Unidade', 'Feriado?', 'Folga?', 'Entrada', 'Saída', 'Intervalo', 'Horas Efetivas', 'H.E. 50%', 'H.E. 100%', 'Adic. Noturno'],
        ...dados.linhas.map((linha) => [
            linha.dia, linha.diaSemanaStr,
            linha.isFolga ? '' : dados.nomeProjeto(linha.id_projeto), linha.isFolga ? '' : dados.nomeUnidade(linha.id_unidade),
            linha.isFeriado ? 'Sim' : 'Não', linha.isFolga ? 'Sim' : 'Não',
            linha.entrada, linha.saida, linha.intervalo, linha.displayEfetivas,
            horaOuVazio(linha.he50), horaOuVazio(linha.he100), horaOuVazio(linha.adNoturno)
        ]),
        [''],
        ['', '', '', '', '', '', '', '', '', 'TOTAIS:', minutosParaHora(dados.totais.he50), minutosParaHora(dados.totais.he100), minutosParaHora(dados.totais.adNoturno)],
        [''],
        ['HORAS EXTRAS POR UNIDADE'],
        ['Projeto', 'Unidade', 'H.E. 50%', 'H.E. 100%', 'Adic. Noturno'],
        ...dados.porUnidade.map((item) => [dados.nomeProjeto(item.id_projeto), dados.nomeUnidade(item.id_unidade), minutosParaHora(item.he50), minutosParaHora(item.he100), minutosParaHora(item.adNoturno)])
    ];
    const aba = XLSX.utils.aoa_to_sheet(planilha);
    aba['!cols'] = [5, 12, 24, 24, 10, 10, 10, 10, 10, 15, 12, 12, 15].map((wch) => ({ wch }));
    const arquivo = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(arquivo, aba, 'Horas Extras');
    XLSX.writeFile(arquivo, `${nomeDoArquivo(dados)}.xlsx`);
}
