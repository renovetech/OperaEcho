/* Recibo em JPG e relatórios em PDF. */
import { capturarElemento, medirFimDasLinhas, salvarCanvasJpg, salvarCanvasPdf } from '@/shared/exportacao';

const QUALIDADE_JPG = 0.9;
const QUALIDADE_PDF = 0.95;

export async function salvarReciboJpg(elemento: HTMLElement, nomeArquivo: string): Promise<void> {
    salvarCanvasJpg(await capturarElemento(elemento), nomeArquivo, QUALIDADE_JPG);
}

/** PDF em A4; o que não couber na folha continua nas seguintes. */
export async function salvarRelatorioPdf(elemento: HTMLElement, orientacao: 'p' | 'l', nomeArquivo: string): Promise<void> {
    const canvas = await capturarElemento(elemento);
    await salvarCanvasPdf(canvas, nomeArquivo, orientacao, QUALIDADE_PDF, medirFimDasLinhas(elemento));
}
