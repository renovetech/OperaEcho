/* Exportação da folha da escala em JPG e PDF. */
import { capturarElemento, salvarCanvasJpg } from '@/shared/exportacao';

const ALTURA_LOGO_PDF = 48;
const ALTURA_LOGO_JPG = 52;
const LARGURA_PDF = 1200;
const LARGURA_JPG = 1150;
const QUALIDADE_JPG = 0.94;
const MARGEM_RECORTE = 16;
const MARGEM_PDF_MM = 8;
const LIMITE_BRANCO = 244;

/** A folha assume o formato de exportação (data-exportando) só durante a captura. */
export async function capturarFolha(folha: HTMLElement, largura: number, alturaLogo: number): Promise<HTMLCanvasElement> {
    folha.dataset.exportando = 'true';
    folha.style.width = `${largura}px`;
    folha.style.setProperty('--altura-logo', `${alturaLogo}px`);
    try {
        return await capturarElemento(folha, { largura, altura: folha.offsetHeight });
    } finally {
        delete folha.dataset.exportando;
        folha.style.removeProperty('width');
        folha.style.removeProperty('--altura-logo');
    }
}

/** Remove a sobra branca em volta do conteúdo, deixando uma margem uniforme. */
export function recortarBordasBrancas(canvas: HTMLCanvasElement, margem = MARGEM_RECORTE): HTMLCanvasElement {
    const contexto = canvas.getContext('2d');
    if (!contexto) return canvas;
    const { width: w, height: h } = canvas;
    const pixels = contexto.getImageData(0, 0, w, h).data;
    const temConteudo = (x: number, y: number) => {
        const i = (y * w + x) * 4;
        return (pixels[i] ?? 255) <= LIMITE_BRANCO || (pixels[i + 1] ?? 255) <= LIMITE_BRANCO || (pixels[i + 2] ?? 255) <= LIMITE_BRANCO;
    };
    const linhaTem = (y: number) => { for (let x = 0; x < w; x += 2) if (temConteudo(x, y)) return true; return false; };
    const colunaTem = (x: number) => { for (let y = 0; y < h; y += 2) if (temConteudo(x, y)) return true; return false; };

    let topo = 0;
    let base = h - 1;
    let esquerda = 0;
    let direita = w - 1;
    while (topo < base && !linhaTem(topo)) topo += 1;
    while (base > topo && !linhaTem(base)) base -= 1;
    while (esquerda < direita && !colunaTem(esquerda)) esquerda += 1;
    while (direita > esquerda && !colunaTem(direita)) direita -= 1;

    const x0 = Math.max(0, esquerda - margem);
    const y0 = Math.max(0, topo - margem);
    const largura = Math.min(w - 1, direita + margem) - x0 + 1;
    const altura = Math.min(h - 1, base + margem) - y0 + 1;

    const recorte = document.createElement('canvas');
    recorte.width = largura;
    recorte.height = altura;
    const destino = recorte.getContext('2d');
    if (!destino) return canvas;
    destino.fillStyle = '#ffffff';
    destino.fillRect(0, 0, largura, altura);
    destino.drawImage(canvas, x0, y0, largura, altura, 0, 0, largura, altura);
    return recorte;
}

export async function salvarJpg(folha: HTMLElement, nomeArquivo: string): Promise<void> {
    salvarCanvasJpg(recortarBordasBrancas(await capturarFolha(folha, LARGURA_JPG, ALTURA_LOGO_JPG)), nomeArquivo, QUALIDADE_JPG);
}

export async function salvarPdf(folha: HTMLElement, nomeArquivo: string): Promise<void> {
    const canvas = await capturarFolha(folha, LARGURA_PDF, ALTURA_LOGO_PDF);
    const { default: JsPdf } = await import('jspdf');
    const pdf = new JsPdf('p', 'mm', 'a4');
    const larguraPagina = pdf.internal.pageSize.getWidth();
    const alturaPagina = pdf.internal.pageSize.getHeight();
    const proporcao = canvas.width / canvas.height;
    let largura = larguraPagina - MARGEM_PDF_MM * 2;
    let altura = largura / proporcao;
    if (altura > alturaPagina - MARGEM_PDF_MM * 2) {
        altura = alturaPagina - MARGEM_PDF_MM * 2;
        largura = altura * proporcao;
    }
    // Ocupa a largura da folha e começa no topo; escala curta não fica solta no meio da página.
    pdf.addImage(canvas.toDataURL('image/jpeg', QUALIDADE_JPG), 'JPEG', (larguraPagina - largura) / 2, MARGEM_PDF_MM, largura, altura);
    pdf.save(`${nomeArquivo}.pdf`);
}
