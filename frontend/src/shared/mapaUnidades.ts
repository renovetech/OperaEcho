/* Apoio do Mapa de Unidades: paleta por produto, marcador e agrupamento de unidades que caem na mesma coordenada. */
import L, { type DivIcon, type LatLngTuple } from 'leaflet';

// Ordem fixa: o produto N recebe sempre a mesma cor no projeto.
export const PALETA_PRODUTOS = [
    '#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F',
    '#AD1457', '#5D4037', '#558B2F', '#283593', '#F9A825', '#00695C',
    '#4E342E', '#7B1FA2', '#0277BD', '#9E9D24'
];
export const COR_SEM_PRODUTO = '#78909C';

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; OpenStreetMap contributors';
export const CENTRO_BRASIL: LatLngTuple = [-14.235, -51.9253];

const CASAS_DA_COORDENADA = 5;
const CASAS_DA_EXIBICAO = 6;

/** Cor de cada produto, a partir da lista ordenada por nome. */
export function mapaDeCores(produtos: { id_produto: number; nome_produto?: string | null }[]): Record<number, string> {
    const ordenados = [...produtos].sort((a, b) => String(a.nome_produto).localeCompare(String(b.nome_produto), 'pt-BR'));
    return Object.fromEntries(ordenados.map((produto, indice) => [produto.id_produto, PALETA_PRODUTOS[indice % PALETA_PRODUTOS.length] ?? COR_SEM_PRODUTO]));
}

/** Fundo do marcador: uma cor sólida ou "pizza" com as cores dos produtos. */
export function fundoMarcador(cores: string[]): string {
    const lista = cores.length ? cores : [COR_SEM_PRODUTO];
    if (lista.length === 1) return lista[0] ?? COR_SEM_PRODUTO;
    const fatia = 360 / lista.length;
    return `conic-gradient(${lista.map((cor, indice) => `${cor} ${indice * fatia}deg ${(indice + 1) * fatia}deg`).join(', ')})`;
}

const CORPO = 'box-border size-[22px] rounded-full shadow-[0_1px_4px_rgba(0,0,0,0.45)]';
const BORDA_EXATA = 'border-2 border-solid border-white';
const BORDA_APROXIMADA = 'border-2 border-dashed border-white outline-2 -outline-offset-1 outline-dashed outline-black/45';
const QUANTIDADE = 'absolute -top-2 -right-2.5 box-border h-[18px] min-w-[18px] rounded-full border border-solid border-white bg-ink px-1 text-center text-[10px] leading-4 font-bold text-white';

const cacheIcones = new Map<string, DivIcon>();

export function iconeUnidade(cores: string[], quantidade = 1, aproximada = false): DivIcon {
    const chave = `${cores.join('|')}#${quantidade}#${aproximada}`;
    const guardado = cacheIcones.get(chave);
    if (guardado) return guardado;
    const icone = L.divIcon({
        className: 'mu-pin',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
        html: `<div class="${CORPO} ${aproximada ? BORDA_APROXIMADA : BORDA_EXATA}" style="background:${fundoMarcador(cores)}">`
            + (quantidade > 1 ? `<span class="${QUANTIDADE}">${quantidade}</span>` : '') + '</div>'
    });
    cacheIcones.set(chave, icone);
    return icone;
}

interface ComCoordenada { latitude?: number | string | null; longitude?: number | string | null }

/** Agrupa unidades na mesma coordenada (ex.: várias no centro do município). */
export function agruparPorCoordenada<T extends ComCoordenada>(unidades: T[]): { chave: string; lat: number; lng: number; unidades: T[] }[] {
    const grupos = new Map<string, { chave: string; lat: number; lng: number; unidades: T[] }>();
    unidades.forEach((unidade) => {
        if (unidade.latitude == null || unidade.longitude == null) return;
        const lat = Number(unidade.latitude);
        const lng = Number(unidade.longitude);
        const chave = `${lat.toFixed(CASAS_DA_COORDENADA)},${lng.toFixed(CASAS_DA_COORDENADA)}`;
        const grupo = grupos.get(chave);
        if (grupo) grupo.unidades.push(unidade);
        else grupos.set(chave, { chave, lat, lng, unidades: [unidade] });
    });
    return [...grupos.values()];
}

export const fmtCoord = (valor: number | string | null | undefined): string => (valor == null || valor === '' ? '-' : Number(valor).toFixed(CASAS_DA_EXIBICAO));
