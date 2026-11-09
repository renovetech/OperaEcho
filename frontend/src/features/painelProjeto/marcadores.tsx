/* Marcadores do mapa: o Leaflet recebe HTML em texto, por isso as classes ficam em strings. */
import L from 'leaflet';

const LUMINANCIA_MAXIMA = 0.12;
const LUZ_MAXIMA = 0.4;
const LUZ_MINIMA = 0.1;
const SATURACAO_MINIMA = 0.65;
const cacheCores = new Map<string, string>();
const cacheIcones = new Map<string, L.DivIcon>();

const paraRgb = (hex: string) => [0, 2, 4].map((inicio) => parseInt(hex.slice(inicio, inicio + 2), 16) / 255) as [number, number, number];
const luminancia = (canais: number[]) => canais
    .map((canal) => (canal <= 0.03928 ? canal / 12.92 : ((canal + 0.055) / 1.055) ** 2.4))
    .reduce((soma, canal, indice) => soma + canal * ([0.2126, 0.7152, 0.0722][indice] ?? 0), 0);

function matizDe([r, g, b]: [number, number, number], maior: number, delta: number): number {
    if (!delta) return 0;
    if (maior === r) return (((g - b) / delta) % 6) * 60 + 360;
    if (maior === g) return ((b - r) / delta + 2) * 60;
    return ((r - g) / delta + 4) * 60;
}

/** Versão escura de uma cor (#rgb ou #rrggbb): cores claras cadastradas somem sobre o mapa. Outro formato volta igual. */
export function corEscura(cor: string): string {
    const salva = cacheCores.get(cor);
    if (salva) return salva;
    const limpa = cor.trim().replace('#', '');
    const hex = /^[0-9a-f]{3}$/i.test(limpa) ? limpa.split('').map((letra) => letra + letra).join('') : limpa;
    if (!/^[0-9a-f]{6}$/i.test(hex)) return cor;
    const rgb = paraRgb(hex);
    const maior = Math.max(...rgb);
    const menor = Math.min(...rgb);
    const delta = maior - menor;
    const matiz = matizDe(rgb, maior, delta) % 360;
    const luzOriginal = (maior + menor) / 2;
    const saturacao = delta ? Math.max(delta / (1 - Math.abs(2 * luzOriginal - 1)), SATURACAO_MINIMA) : 0;
    const canaisCom = (luz: number) => [0, 8, 4].map((n) => {
        const k = (n + matiz / 30) % 12;
        return luz - saturacao * Math.min(luz, 1 - luz) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    });
    let luz = Math.min(luzOriginal, LUZ_MAXIMA);
    while (luminancia(canaisCom(luz)) > LUMINANCIA_MAXIMA && luz > LUZ_MINIMA) luz -= 0.02;
    const resultado = `#${canaisCom(luz).map((canal) => Math.round(canal * 255).toString(16).padStart(2, '0')).join('')}`;
    cacheCores.set(cor, resultado);
    return resultado;
}

function comCache(chave: string, criar: () => L.DivIcon): L.DivIcon {
    const salvo = cacheIcones.get(chave);
    if (salvo) return salvo;
    const icone = criar();
    cacheIcones.set(chave, icone);
    return icone;
}

/** Sigla do tipo (H, R, UBS, ESF, AE, UPA...), com a cor da região na borda e no texto. */
export function iconeUnidade(sigla: string, cor: string, quantidade: number, destaque: boolean): L.DivIcon {
    const texto = sigla.slice(0, 4).replace(/</g, '');
    return comCache(`u|${texto}|${cor}|${quantidade}|${destaque}`, () => {
        const largura = texto.length <= 1 ? 22 : 12 + texto.length * 9;
        const classeDestaque = destaque ? 'scale-[1.35] shadow-[0_0_0_4px_rgba(46,125,50,.35),0_2px_6px_rgba(0,0,0,.4)]' : 'shadow-[0_1px_4px_rgba(0,0,0,.35)]';
        const selo = quantidade > 1 ? `<span class="absolute -top-[9px] -right-[11px] h-[18px] min-w-[18px] rounded-full bg-[#1f2933] px-1 text-center text-[10px] leading-[18px] font-extrabold text-white">${quantidade}</span>` : '';
        return L.divIcon({
            className: 'border-0 bg-transparent',
            iconSize: [largura + 2, 24],
            iconAnchor: [(largura + 2) / 2, 12],
            popupAnchor: [0, -12],
            html: `<div class="box-border flex h-[22px] items-center justify-center rounded-[5px] border-[2.5px] border-solid bg-white font-sans text-[13px] leading-none font-extrabold tracking-tight whitespace-nowrap transition-transform ${classeDestaque}" style="width:${largura}px;border-color:${cor};color:${cor}">${texto}</div>${selo}`
        });
    });
}

export function iconeRotulo(texto: string, cor: string, mini: boolean): L.DivIcon {
    return comCache(`r|${texto}|${cor}|${mini}`, () => L.divIcon({
        className: 'border-0 bg-transparent',
        iconSize: undefined,
        html: `<span class="pointer-events-none inline-block font-sans font-extrabold tracking-wide whitespace-nowrap uppercase opacity-90 [text-shadow:0_0_4px_#fff,0_0_4px_#fff,0_0_8px_#fff] ${mini ? '-translate-x-1/2 translate-y-[60%] text-[13px]' : '-translate-x-1/2 -translate-y-1/2 text-[22px]'}" style="color:${cor}">${texto.replace(/</g, '&lt;')}</span>`
    }));
}

export function SeloTipo({ sigla, titulo }: { sigla: string; titulo?: string }) {
    return <span title={titulo} className="box-border inline-flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded border-2 border-solid border-pine bg-white px-1 text-[10px] leading-none font-extrabold text-pine">{sigla}</span>;
}
