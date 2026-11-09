/* Captura única de tela para JPG e PDF. A imagem nasce do próprio navegador (SVG foreignObject), então sai igual à
   tela, com qualquer cor CSS. As bibliotecas só carregam ao exportar. */
const ESCALA_PADRAO = 2;
const QUALIDADE_PADRAO = 0.92;
const LIMITE_CANVAS = 16384;
const ESPERA_MIDIA_MS = 20000;
const ESPERA_IMAGEM_MS = 3000;
const SEM_EXPORTAR = '[data-sem-exportar], .leaflet-control-container';
const MARGEM_VERTICAL_MM = 8;

export interface OpcoesCaptura {
    escala?: number;
    largura?: number;
    altura?: number;
    /** Ajustes só na cópia capturada: a tela não muda. */
    prepararCopia?: (copia: HTMLElement) => void;
}

/** Não usa decode(), que trava com a aba em segundo plano. */
function imagemPronta(imagem: HTMLImageElement): Promise<void> {
    if (imagem.complete) return Promise.resolve();
    return new Promise((resolve) => {
        const concluir = () => resolve();
        imagem.addEventListener('load', concluir, { once: true });
        imagem.addEventListener('error', concluir, { once: true });
        setTimeout(concluir, ESPERA_IMAGEM_MS);
    });
}

const incluirNaCaptura = (no: Node) => !(no instanceof Element) || !no.matches(SEM_EXPORTAR);

/** Com animações desligadas: elementos com entrada animada sairiam invisíveis. */
export async function capturarElemento(elemento: HTMLElement, { escala = ESCALA_PADRAO, largura, altura, prepararCopia }: OpcoesCaptura = {}): Promise<HTMLCanvasElement> {
    const { domToCanvas } = await import('modern-screenshot');
    await Promise.all([...elemento.querySelectorAll('img')].map(imagemPronta));
    document.documentElement.classList.add('oe-captura');
    try {
        return await domToCanvas(elemento, {
            scale: escala,
            backgroundColor: '#ffffff',
            width: largura,
            height: altura,
            timeout: ESPERA_MIDIA_MS,
            maximumCanvasSize: LIMITE_CANVAS,
            filter: incluirNaCaptura,
            onCloneNode: prepararCopia ? (copia) => prepararCopia(copia as HTMLElement) : null
        });
    } finally {
        document.documentElement.classList.remove('oe-captura');
    }
}

type CampoFormulario = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const SELETOR_CAMPOS = 'input, textarea, select';
const MARCA_CHECKBOX = '✓';

function textoDoCampo(campo: CampoFormulario): string {
    if (campo instanceof HTMLSelectElement) return campo.options[campo.selectedIndex]?.text ?? '';
    if (campo instanceof HTMLInputElement && campo.type === 'checkbox') return campo.checked ? MARCA_CHECKBOX : '';
    return campo.value;
}

/** Guarda na tela o texto de cada campo, que o clone não traz (o React marca a opção por propriedade). Devolve quem limpa. */
export function carimbarCampos(raiz: HTMLElement): () => void {
    const campos = [...raiz.querySelectorAll<CampoFormulario>(SELETOR_CAMPOS)];
    campos.forEach((campo) => { campo.dataset.valorExportado = textoDoCampo(campo); });
    return () => campos.forEach((campo) => { delete campo.dataset.valorExportado; });
}

/** Na cópia, cada campo carimbado vira um bloco de texto. */
export function trocarCamposPorTexto(copia: HTMLElement, apresentar: (campo: CampoFormulario, texto: string) => { texto: string; estilo: string }): void {
    copia.querySelectorAll<CampoFormulario>(SELETOR_CAMPOS).forEach((campo) => {
        const { texto, estilo } = apresentar(campo, campo.dataset.valorExportado ?? '');
        const bloco = copia.ownerDocument.createElement('div');
        bloco.textContent = texto;
        bloco.style.cssText = estilo;
        campo.replaceWith(bloco);
    });
}

export function baixarArquivo(endereco: string, nomeArquivo: string): void {
    const link = document.createElement('a');
    link.href = endereco;
    link.download = nomeArquivo;
    link.click();
}

export function salvarCanvasJpg(canvas: HTMLCanvasElement, nome: string, qualidade = QUALIDADE_PADRAO): void {
    baixarArquivo(canvas.toDataURL('image/jpeg', qualidade), `${nome}.jpg`);
}

/** Onde termina cada linha de tabela, em fração da altura do elemento. Medir com o elemento como foi capturado. */
export function medirFimDasLinhas(elemento: HTMLElement): number[] {
    const { top, height } = elemento.getBoundingClientRect();
    return [...elemento.querySelectorAll('tbody tr')].map((linha) => (linha.getBoundingClientRect().bottom - top) / height);
}

/** Onde cortar cada página, sem partir uma linha ao meio; só corta no limite da folha se a linha for maior que ela. */
export function calcularCortes(alturaTotal: number, alturaPagina: number, fimDasLinhas: number[]): number[] {
    const cortes: number[] = [];
    let inicio = 0;
    while (alturaTotal - inicio > alturaPagina) {
        const limite = inicio + alturaPagina;
        const corte = fimDasLinhas.filter((fim) => fim > inicio && fim <= limite).at(-1) ?? limite;
        cortes.push(corte);
        inicio = corte;
    }
    cortes.push(alturaTotal);
    return cortes;
}

/** PDF A4 da largura da folha; o que não couber continua nas páginas seguintes, cortando entre as linhas informadas. */
export async function salvarCanvasPdf(canvas: HTMLCanvasElement, nome: string, orientacao: 'p' | 'l', qualidade = QUALIDADE_PADRAO, fimDasLinhas: number[] = []): Promise<void> {
    const { default: JsPdf } = await import('jspdf');
    const pdf = new JsPdf(orientacao, 'mm', 'a4');
    const larguraPagina = pdf.internal.pageSize.getWidth();
    const alturaUtil = pdf.internal.pageSize.getHeight() - 2 * MARGEM_VERTICAL_MM;
    const mmPorPixel = larguraPagina / canvas.width;
    const fimEmPixels = fimDasLinhas.map((fracao) => fracao * canvas.height);

    let inicio = 0;
    calcularCortes(canvas.height, alturaUtil / mmPorPixel, fimEmPixels).forEach((corte, indice) => {
        const fim = Math.round(corte);
        const pagina = document.createElement('canvas');
        pagina.width = canvas.width;
        pagina.height = fim - inicio;
        pagina.getContext('2d')?.drawImage(canvas, 0, inicio, canvas.width, pagina.height, 0, 0, canvas.width, pagina.height);
        if (indice > 0) pdf.addPage();
        pdf.addImage(pagina.toDataURL('image/jpeg', qualidade), 'JPEG', 0, MARGEM_VERTICAL_MM, larguraPagina, pagina.height * mmPorPixel);
        inicio = fim;
    });
    pdf.save(`${nome}.pdf`);
}
