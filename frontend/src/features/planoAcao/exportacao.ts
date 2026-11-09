/* Exportação da folha do plano em JPG e PDF. */
import { dataBR } from '@/features/planoAcao/formatos';
import { capturarElemento, carimbarCampos, medirFimDasLinhas, salvarCanvasJpg, salvarCanvasPdf, trocarCamposPorTexto } from '@/shared/exportacao';

const QUALIDADE = 0.9;
const COR_TEXTO = '#14201B';
const COR_TEMPO = '#6a5a8a';

type Campo = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function bloco(doc: Document, texto: string, estilo: string): HTMLDivElement {
    const elemento = doc.createElement('div');
    elemento.textContent = texto;
    elemento.style.cssText = estilo;
    return elemento;
}

/* O cliente vazio herda o nome do projeto, que a tela mostra como placeholder. */
const ROTULO_CLIENTE = 'Cliente';
const ehCampoCliente = (campo: Campo) => campo.getAttribute('aria-label') === ROTULO_CLIENTE;

function estiloDoCampo(campo: Campo): string {
    if (campo instanceof HTMLTextAreaElement) return `font-size:.85rem;padding:6px 7px;white-space:pre-wrap;word-break:break-word;line-height:1.4;color:${COR_TEXTO};`;
    if (campo instanceof HTMLSelectElement) {
        return campo.dataset.selo
            ? `text-align:center;font-weight:700;border-radius:8px;padding:6px 8px;border:1px solid ${campo.style.borderColor || '#d0d5dd'};background:${campo.style.backgroundColor || '#fff'};color:${campo.style.color || COR_TEXTO};`
            : `font-size:.85rem;padding:6px 7px;color:${COR_TEXTO};`;
    }
    if (ehCampoCliente(campo)) return `font-size:.85rem;padding:6px 7px;color:${COR_TEXTO};`;
    return campo.type === 'date'
        ? `text-align:center;font-size:.8rem;padding:6px 2px;color:${COR_TEXTO};`
        : `text-align:center;font-size:.82rem;font-weight:700;padding:6px 2px;color:${COR_TEMPO};`;
}

function exibicaoDoCampo(campo: Campo, texto: string): string {
    if (ehCampoCliente(campo) && !texto && campo instanceof HTMLInputElement) return campo.placeholder;
    if (campo instanceof HTMLInputElement && campo.type === 'date') return texto ? dataBR(texto) : '';
    return texto === '-' ? '' : texto;
}

/** Na cópia, campos viram texto e o botão de horas perde a aparência de botão. */
function prepararCopia(copia: HTMLElement): void {
    const doc = copia.ownerDocument;
    copia.querySelectorAll('[data-botao-horas]').forEach((botao) => {
        const texto = botao.textContent ?? '';
        botao.replaceWith(bloco(doc, /\d/.test(texto) ? texto : '', `text-align:center;font-weight:700;color:${COR_TEMPO};`));
    });
    trocarCamposPorTexto(copia, (campo, texto) => ({ texto: exibicaoDoCampo(campo, texto), estilo: estiloDoCampo(campo) }));
}

/** A folha abre na largura total da grade, sem a rolagem, só durante a captura. */
async function capturar(folha: HTMLElement): Promise<{ canvas: HTMLCanvasElement; fimDasLinhas: number[] }> {
    const rolagem = folha.querySelector<HTMLElement>('[data-grade-rolagem]');
    const grade = folha.querySelector<HTMLElement>('table');
    const estilo = getComputedStyle(folha);
    const largura = (grade?.scrollWidth ?? folha.scrollWidth) + (Number.parseFloat(estilo.paddingLeft) || 0) + (Number.parseFloat(estilo.paddingRight) || 0);
    const equipes = [...folha.querySelectorAll<HTMLElement>('[data-equipe-nomes]')];

    rolagem?.style.setProperty('overflow', 'visible');
    rolagem?.style.setProperty('max-height', 'none');
    folha.style.width = `${largura}px`;
    const liberarCampos = carimbarCampos(folha);
    equipes.forEach((equipe) => equipe.style.setProperty('display', 'block'));
    try {
        const canvas = await capturarElemento(folha, { largura: folha.scrollWidth, altura: folha.scrollHeight, prepararCopia });
        return { canvas, fimDasLinhas: medirFimDasLinhas(folha) };
    } finally {
        rolagem?.style.removeProperty('overflow');
        rolagem?.style.removeProperty('max-height');
        folha.style.removeProperty('width');
        liberarCampos();
        equipes.forEach((equipe) => equipe.style.removeProperty('display'));
    }
}

export async function salvarPlanoJpg(folha: HTMLElement, nome: string): Promise<void> {
    const { canvas } = await capturar(folha);
    salvarCanvasJpg(canvas, nome, QUALIDADE);
}

export async function salvarPlanoPdf(folha: HTMLElement, nome: string): Promise<void> {
    const { canvas, fimDasLinhas } = await capturar(folha);
    await salvarCanvasPdf(canvas, nome, 'l', QUALIDADE, fimDasLinhas);
}
