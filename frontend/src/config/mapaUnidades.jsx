/* ARQUIVO: src/config/mapaUnidades.js
 * Apoio do Mapa de Unidades: paleta por produto, marcador (divIcon) e
 * agrupamento de unidades que caem na mesma coordenada. */
import L from 'leaflet';

// Paleta categórica (ordem fixa: produto N recebe sempre a mesma cor no projeto)
export const PALETA_PRODUTOS = [
    '#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F',
    '#AD1457', '#5D4037', '#558B2F', '#283593', '#F9A825', '#00695C',
    '#4E342E', '#7B1FA2', '#0277BD', '#9E9D24'
];
export const COR_SEM_PRODUTO = '#78909C';

export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTR = '&copy; OpenStreetMap contributors';
export const CENTRO_BRASIL = [-14.235, -51.9253];

/** { id_produto -> cor } a partir da lista de produtos (ordenada por nome). */
export function mapaDeCores(produtos) {
    const m = {};
    [...produtos].sort((a, b) => String(a.nome_produto).localeCompare(String(b.nome_produto), 'pt-BR'))
        .forEach((p, i) => { m[p.id_produto] = PALETA_PRODUTOS[i % PALETA_PRODUTOS.length]; });
    return m;
}

/** Fundo do marcador: 1 cor sólida ou "pizza" com as cores dos produtos. */
export function fundoMarcador(cores) {
    const lista = cores.length ? cores : [COR_SEM_PRODUTO];
    if (lista.length === 1) return lista[0];
    const fatia = 360 / lista.length;
    return `conic-gradient(${lista.map((c, i) => `${c} ${i * fatia}deg ${(i + 1) * fatia}deg`).join(', ')})`;
}

const cacheIcones = new Map();
export function iconeUnidade(cores, qtd = 1, aproximada = false) {
    const chave = `${cores.join('|')}#${qtd}#${aproximada}`;
    if (cacheIcones.has(chave)) return cacheIcones.get(chave);
    const icone = L.divIcon({
        className: 'mu-pin',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
        html: `<div class="mu-pin-corpo${aproximada ? ' aprox' : ''}" style="background:${fundoMarcador(cores)}">`
            + (qtd > 1 ? `<span class="mu-pin-qtd">${qtd}</span>` : '') + '</div>'
    });
    cacheIcones.set(chave, icone);
    return icone;
}

/** Agrupa unidades na mesma coordenada (ex.: várias no centro do município). */
export function agruparPorCoordenada(unidades) {
    const grupos = new Map();
    unidades.forEach(u => {
        if (u.latitude == null || u.longitude == null) return;
        const k = `${Number(u.latitude).toFixed(5)},${Number(u.longitude).toFixed(5)}`;
        if (!grupos.has(k)) grupos.set(k, { chave: k, lat: Number(u.latitude), lng: Number(u.longitude), unidades: [] });
        grupos.get(k).unidades.push(u);
    });
    return [...grupos.values()];
}

export const fmtCoord = (v) => (v == null || v === '' ? '-' : Number(v).toFixed(6));
