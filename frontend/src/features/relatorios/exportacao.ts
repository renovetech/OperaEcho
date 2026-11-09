/* Exportações dos relatórios: PDF vetorial pelo motor padrão, captura da tela para JPG e Excel.
   As bibliotecas só carregam ao exportar. */
import type { RefObject } from 'react';
import { criarRelatorioPDF, type ColunaPdf, type RelatorioPdf, type Rgb } from '@/shared/pdfRelatorio';
import { erro, fecharMensagem, mostrarCarregando } from '@/shared/feedback';
import { logErro } from '@/shared/lib';
import { capturarElemento, salvarCanvasJpg } from '@/shared/exportacao';

export type { Celula, ColunaPdf } from '@/shared/pdfRelatorio';
export type DocumentoPdf = RelatorioPdf;

export const VERMELHO_PDF: Rgb = [162, 59, 54];

/** Distribui as larguras relativas das colunas pela largura útil da página. */
export const ajustarColunas = (pdf: DocumentoPdf, colunas: ColunaPdf[]): ColunaPdf[] => {
    const fator = pdf.CW / colunas.reduce((soma, coluna) => soma + coluna.w, 0);
    return colunas.map((coluna) => ({ ...coluna, w: coluna.w * fator }));
};

interface PedidoPdf {
    titulo: string;
    periodo: string;
    usuario: string;
    arquivo: string;
    preencher: (pdf: DocumentoPdf) => void | Promise<void>;
}

export async function gerarPdf({ titulo, periodo, usuario, arquivo, preencher }: PedidoPdf): Promise<void> {
    mostrarCarregando('Gerando PDF...');
    try {
        const pdf = await criarRelatorioPDF(titulo, periodo, usuario);
        await preencher(pdf);
        pdf.finalizar(arquivo);
        fecharMensagem();
    } catch (falha) {
        logErro('Erro ao gerar o PDF do relatório', falha);
        erro('Falha ao gerar o PDF.');
    }
}

const fixar = (no: HTMLElement, propriedade: string, valor: string) => no.style.setProperty(propriedade, valor);
const PROPRIEDADES = ['width', 'max-width', 'margin', 'display'];
const QUALIDADE_JPG = 0.9;
const ESCALA = 2;

interface OpcoesCaptura {
    /** Telas com mapa têm largura fixa: encolher o elemento desmontaria o mapa. */
    larguraFixa?: string;
}

/** JPG do documento na tela: ajusta a largura ao conteúdo, sem controles do mapa, e restaura depois. O PDF é sempre pelo motor padrão (gerarPdf). */
export async function exportarCaptura(referencia: RefObject<HTMLElement | null>, nome: string, { larguraFixa }: OpcoesCaptura = {}): Promise<void> {
    const no = referencia.current;
    if (!no) return;
    mostrarCarregando('Gerando JPG...');
    fixar(no, 'max-width', 'none');
    fixar(no, 'margin', '0');
    if (larguraFixa) {
        fixar(no, 'width', larguraFixa);
    } else {
        fixar(no, 'display', 'inline-block');
        fixar(no, 'width', '0px');
        const larguraTabelas = Math.max(no.scrollWidth, ...[...no.querySelectorAll('table')].map((tabela) => tabela.scrollWidth));
        const estilo = getComputedStyle(no);
        fixar(no, 'width', `${larguraTabelas + (Number.parseFloat(estilo.paddingLeft) || 0) + (Number.parseFloat(estilo.paddingRight) || 0)}px`);
    }
    try {
        const canvas = await capturarElemento(no, { escala: ESCALA, largura: no.scrollWidth, altura: no.scrollHeight });
        salvarCanvasJpg(canvas, nome, QUALIDADE_JPG);
        fecharMensagem();
    } catch (falha) {
        logErro('Erro ao gerar o JPG do relatório', falha);
        erro('Erro ao gerar JPG.');
    } finally {
        PROPRIEDADES.forEach((propriedade) => no.style.removeProperty(propriedade));
    }
}

/** Foto do mapa para o PDF vetorial. */
export async function capturarMapa(no: HTMLElement | null): Promise<{ imagem: string; largura: number; altura: number } | null> {
    if (!no) return null;
    try {
        const canvas = await capturarElemento(no, { escala: ESCALA });
        return { imagem: canvas.toDataURL('image/jpeg', QUALIDADE_JPG), largura: canvas.width, altura: canvas.height };
    } catch (falha) {
        logErro('Erro ao capturar o mapa', falha);
        return null;
    }
}

export async function gerarExcel(abas: { nome: string; linhas: Record<string, unknown>[] }[], arquivo: string): Promise<void> {
    try {
        const XLSX = await import('xlsx');
        const planilha = XLSX.utils.book_new();
        abas.forEach(({ nome, linhas }) => XLSX.utils.book_append_sheet(planilha, XLSX.utils.json_to_sheet(linhas), nome));
        XLSX.writeFile(planilha, arquivo);
    } catch (falha) {
        logErro('Erro ao gerar o Excel do relatório', falha);
        erro('Falha ao gerar o Excel.');
    }
}
