/* ARQUIVO: src/PainelProjetoPublico.jsx
 * ------------------------------------------------------------------------
 * PAINEL PÚBLICO DO PROJETO - operaecho.com/<slug> (ex.: /paraiba)
 * Sem login, somente leitura, pensado para espelhar em TVs/painéis.
 *  - Resumo das atividades lançadas e horas trabalhadas (Implantação + Projetos)
 *  - Mapa por visão: Geral (todas as macros) / Macro / Micro região
 *    · contorno dos municípios (malha IBGE) colorido pela região
 *    · unidades do filtro sinalizadas; abaixo a relação das unidades
 *    · ao lado, o produto selecionado
 *  - Filtros refletidos na URL (?visao=macro&macro=3&produto=4) para fixar
 *    um painel específico na TV.
 * Modelo para qualquer projeto: habilitado em Cadastro > Projetos.
 * Gráficos em SVG puro (mesmo padrão do Painel do Plano de Ação).
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Navigate } from 'react-router-dom';
import { MapContainer, TileLayer, GeoJSON, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Icon from './components/Icon';
import api from './api';
import logo from './logo.png';
import { PALETA_PRODUTOS, COR_SEM_PRODUTO, mapaDeCores } from './config/mapaUnidades';
import './PainelPlanoAcao.css';
import './PainelProjetoPublico.css';

const AUTO_REFRESH_MS = 5 * 60 * 1000;
const PALETA_REGIOES = ['#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F', '#AD1457', '#5D4037', '#9C7A3C', '#283593', '#558B2F', '#0277BD'];
const COR_SEM_REGIAO = '#90A4AE';

/* Versão escura/saturada de uma cor (#rgb ou #rrggbb) para contornos e siglas da micro.
   Cores claras cadastradas (amarelo, ciano, rosa...) somem sobre o mapa; mantém o matiz
   e limita a luminosidade. Cores em outro formato voltam inalteradas. */
const cacheEscura = new Map();
function corEscura(cor) {
    if (cacheEscura.has(cor)) return cacheEscura.get(cor);
    let hex = String(cor || '').trim().replace('#', '');
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split('').map(c => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(hex)) return cor;
    const [r, g, b] = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    const l0 = (max + min) / 2;
    const s0 = d ? d / (1 - Math.abs(2 * l0 - 1)) : 0;
    const s = d ? Math.max(s0, 0.65) : 0;
    const k = n => (n + h / 30) % 12;
    const rgb = l => { const a = s * Math.min(l, 1 - l); return [0, 8, 4].map(n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))); };
    const lum = c => c.map(v => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((t, v, i) => t + v * [0.2126, 0.7152, 0.0722][i], 0);
    // Escurece até ter contraste suficiente sobre o fundo claro do mapa (luminância relativa <= 0.12)
    let l = Math.min(l0, 0.4), c = rgb(l);
    while (lum(c) > 0.12 && l > 0.1) { l -= 0.02; c = rgb(l); }
    const res = '#' + c.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
    cacheEscura.set(cor, res);
    return res;
}
const UF_IBGE = { RO: 11, AC: 12, AM: 13, RR: 14, PA: 15, AP: 16, TO: 17, MA: 21, PI: 22, CE: 23, RN: 24, PB: 25, PE: 26, AL: 27, SE: 28, BA: 29, MG: 31, ES: 32, RJ: 33, SP: 35, PR: 41, SC: 42, RS: 43, MS: 50, MT: 51, GO: 52, DF: 53 };
// Mesmo provedor do Mapa de Unidades (OSM), esmaecido para destacar as regiões
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors &middot; Malha municipal: IBGE';

/* ------------------------------- utilidades ------------------------------- */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmtNum = (n) => Number(n || 0).toLocaleString('pt-BR');
const fmtHoras = (min) => {
    const h = Math.floor((min || 0) / 60), m = Math.round((min || 0) % 60);
    return h ? `${fmtNum(h)}h${m ? ` ${String(m).padStart(2, '0')}min` : ''}` : `${m}min`;
};
const dataBR = (iso) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '-');
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const rotuloMes = (ym) => { const [a, m] = ym.split('-'); return `${MESES[Number(m) - 1]}/${a.slice(2)}`; };

/* Malha municipal + nomes (IBGE), com cache no navegador. */
async function carregarMalhaIBGE(uf) {
    const cod = UF_IBGE[uf];
    if (!cod) return null;
    const chave = `oe_malha_${cod}_v1`;
    try { const c = localStorage.getItem(chave); if (c) return JSON.parse(c); } catch (e) { /* sem cache */ }
    const [rMalha, rNomes] = await Promise.all([
        fetch(`https://servicodados.ibge.gov.br/api/v3/malhas/estados/${cod}?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=minima`),
        fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${cod}/municipios`)
    ]);
    if (!rMalha.ok || !rNomes.ok) throw new Error('IBGE indisponível');
    const malha = await rMalha.json();
    const nomes = await rNomes.json();
    const dados = { malha, nomes: nomes.map(m => ({ id: String(m.id), nome: m.nome })) };
    try { localStorage.setItem(chave, JSON.stringify(dados)); } catch (e) { /* cota cheia: segue sem cache */ }
    return dados;
}

/* --------------------------------- gráficos -------------------------------- */
function BarrasMes({ dados }) {
    if (!dados.length) return <div className="pp-vazio">Sem atividades no período.</div>;
    const W = 620, H = 220, Lm = 30, B = 30, T = 18, R = 8;
    const iw = W - Lm - R, ih = H - T - B;
    const max = Math.max(...dados.map(d => d.qtd), 1);
    const bw = Math.min(42, (iw / dados.length) * 0.62);
    const x = (i) => Lm + (iw / dados.length) * (i + 0.5);
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="ppj-svg" role="img" aria-label="Atividades por mês">
            {[0, 0.5, 1].map(f => (
                <g key={f}>
                    <line x1={Lm} x2={W - R} y1={T + ih - f * ih} y2={T + ih - f * ih} stroke="#EDECE5" />
                    <text x={Lm - 6} y={T + ih - f * ih + 4} textAnchor="end" className="ppj-eixo">{Math.round(max * f)}</text>
                </g>
            ))}
            {dados.map((d, i) => {
                const h = (d.qtd / max) * ih;
                return (
                    <g key={d.mes}>
                        <rect x={x(i) - bw / 2} y={T + ih - h} width={bw} height={Math.max(h, d.qtd ? 2 : 0)} rx="3" fill="#2E7D32">
                            <title>{`${rotuloMes(d.mes)}: ${d.qtd} atividade(s) · ${fmtHoras(d.min)}`}</title>
                        </rect>
                        {d.qtd > 0 && <text x={x(i)} y={T + ih - h - 5} textAnchor="middle" className="ppj-valor">{d.qtd}</text>}
                        <text x={x(i)} y={H - 10} textAnchor="middle" className="ppj-eixo">{rotuloMes(d.mes)}</text>
                    </g>
                );
            })}
        </svg>
    );
}

function BarrasH({ dados, vazio = 'Sem dados.', formatar = fmtNum, onClick }) {
    if (!dados.length) return <div className="pp-vazio">{vazio}</div>;
    const max = Math.max(...dados.map(d => d.valor), 1);
    return (
        <ul className="ppj-barras">
            {dados.map(d => (
                <li key={d.chave} className={onClick ? 'clicavel' : ''} onClick={onClick ? () => onClick(d) : undefined} title={d.titulo || d.nome}>
                    <span className="ppj-barras-nome">{d.cor && <i style={{ background: d.cor }} />}{d.nome}</span>
                    <span className="ppj-barras-trilho"><span style={{ width: `${(d.valor / max) * 100}%`, background: d.cor || 'var(--pine)' }} /></span>
                    <b>{formatar(d.valor)}</b>
                </li>
            ))}
        </ul>
    );
}

function Rosca({ partes, centro, legenda }) {
    const total = partes.reduce((s, p) => s + p.valor, 0);
    const R = 54, C = 2 * Math.PI * R;
    let acc = 0;
    return (
        <div className="pp-donut">
            <svg viewBox="0 0 140 140" role="img" aria-label={legenda}>
                <circle cx="70" cy="70" r={R} fill="none" stroke="#EDECE5" strokeWidth="18" />
                {total > 0 && partes.filter(p => p.valor > 0).map(p => {
                    const len = (p.valor / total) * C;
                    const el = <circle key={p.nome} cx="70" cy="70" r={R} fill="none" stroke={p.cor} strokeWidth="18"
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 70 70)"><title>{`${p.nome}: ${p.valor}`}</title></circle>;
                    acc += len;
                    return el;
                })}
                <text x="70" y="66" textAnchor="middle" className="pp-donut-num">{centro}</text>
                <text x="70" y="86" textAnchor="middle" className="pp-donut-lbl">{legenda}</text>
            </svg>
            <ul className="pp-legenda">
                {partes.map(p => (
                    <li key={p.nome}><span className="pp-dot" style={{ background: p.cor }} /><span>{p.nome}</span><b>{fmtNum(p.valor)}</b>
                        <small>{total ? Math.round((p.valor / total) * 100) : 0}%</small></li>
                ))}
            </ul>
        </div>
    );
}

/* ----------------------------------- mapa ---------------------------------- */
/* Marcador da unidade: sigla do TIPO (H = Hospital, R = Regulação, UBS, ESF, AE, UPA, G).
   Cor da borda/texto = região. Sem tipo cadastrado => "?". Largura acompanha a sigla. */
const cacheIcones = new Map();
function iconeUnidade(sigla, cor, qtd, destaque) {
    const txt = String(sigla || '?').slice(0, 4).replace(/</g, '');
    const k = `${txt}|${cor}|${qtd}|${destaque}`;
    if (cacheIcones.has(k)) return cacheIcones.get(k);
    const w = txt.length <= 1 ? 22 : 12 + txt.length * 9;
    const ic = L.divIcon({
        className: 'ppj-pin', iconSize: [w + 2, 24], iconAnchor: [(w + 2) / 2, 12], popupAnchor: [0, -12],
        html: `<div class="ppj-pin-h${destaque ? ' destaque' : ''}" style="width:${w}px;border-color:${cor};color:${cor}">${txt}</div>`
            + (qtd > 1 ? `<span class="ppj-pin-qtd">${qtd}</span>` : '')
    });
    cacheIcones.set(k, ic);
    return ic;
}
const cacheRotulos = new Map();
function iconeRotulo(texto, cor, mini) {
    const k = `${texto}|${cor}|${mini ? 1 : 0}`;
    if (cacheRotulos.has(k)) return cacheRotulos.get(k);
    const ic = L.divIcon({ className: `ppj-rotulo-regiao${mini ? ' mini' : ''}`, iconSize: null, html: `<span style="color:${cor}">${texto.replace(/</g, '&lt;')}</span>` });
    cacheRotulos.set(k, ic);
    return ic;
}

function Enquadrar({ limites, versao }) {
    const map = useMap();
    useEffect(() => {
        if (!limites || !limites.isValid()) return;
        map.fitBounds(limites, { padding: [24, 24], maxZoom: 12 });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, versao]);
    return null;
}

// Popup aberto: esconde o selo do canto (senão o popup fica atrás dele)
function EventosPopup({ aoMudar }) {
    useMapEvents({ popupopen: () => aoMudar(true), popupclose: () => aoMudar(false) });
    return null;
}

function IrPara({ alvo }) {
    const map = useMap();
    useEffect(() => { if (alvo) map.flyTo([alvo.lat, alvo.lng], 14, { duration: 1 }); }, [map, alvo]);
    return null;
}

/* ================================ COMPONENTE =============================== */
export default function PainelProjetoPublico() {
    const { slug } = useParams();
    const [params, setParams] = useSearchParams();
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState(null);
    const [naoEncontrado, setNaoEncontrado] = useState(false);
    const [carregando, setCarregando] = useState(false);
    const [geo, setGeo] = useState({ estado: 'idle', malha: null, nomes: [] });
    const [alvo, setAlvo] = useState(null);
    const [unidadeFoco, setUnidadeFoco] = useState(null);
    const [popupAberto, setPopupAberto] = useState(false);
    const [recolhidos, setRecolhidos] = useState(() => new Set()); // grupos recolhidos na relação de unidades
    const raizRef = useRef(null);
    const mapaRef = useRef(null);

    // Filtros na URL (permite fixar um painel específico na TV)
    const visao = ['geral', 'macro', 'micro'].includes(params.get('visao')) ? params.get('visao') : 'geral';
    const fMacro = params.get('macro') || '';
    const fMicro = params.get('micro') || '';
    const fProduto = params.get('produto') || '';
    const fTipo = params.get('tipo') || '';
    const fDe = params.get('de') || '';
    const fAte = params.get('ate') || '';
    // Agrupamento da relação de unidades: padrão segue a visão (Geral -> macro; Macro/Micro -> micro)
    const agrupar = ['macro', 'micro', 'lista'].includes(params.get('agrupar')) ? params.get('agrupar') : (visao === 'geral' ? 'macro' : 'micro');
    const setFiltro = (mudancas) => {
        const n = new URLSearchParams(params);
        Object.entries(mudancas).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
        setParams(n, { replace: true });
    };

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const r = await api.get(`/publico/painel-projeto/${encodeURIComponent(String(slug || '').toLowerCase())}`);
            setDados(r.data); setErro(null);
        } catch (e) {
            if (e.response?.status === 404) setNaoEncontrado(true);
            else setErro(e.response?.data?.erro || 'Não foi possível carregar o painel.');
        } finally { setCarregando(false); }
    }, [slug]);

    useEffect(() => { carregar(); const t = setInterval(carregar, AUTO_REFRESH_MS); return () => clearInterval(t); }, [carregar]);

    useEffect(() => {
        if (dados?.projeto?.nome) document.title = `${dados.projeto.nome} · Painel Opera Echo`;
        return () => { document.title = 'Opera Echo'; };
    }, [dados?.projeto?.nome]);

    // Malha municipal do IBGE (UF predominante do projeto)
    const uf = dados?.projeto?.uf;
    useEffect(() => {
        if (!uf) return;
        let ativo = true;
        setGeo(g => ({ ...g, estado: 'carregando' }));
        carregarMalhaIBGE(uf)
            .then(d => { if (ativo) setGeo(d ? { estado: 'ok', malha: d.malha, nomes: d.nomes } : { estado: 'erro', malha: null, nomes: [] }); })
            .catch(() => { if (ativo) setGeo({ estado: 'erro', malha: null, nomes: [] }); });
        return () => { ativo = false; };
    }, [uf]);

    /* --------------------------- estrutura de regiões --------------------------- */
    const regioes = useMemo(() => dados?.regioes || [], [dados]);
    const macroPorId = useMemo(() => {
        const m = new Map();
        regioes.forEach((mac, i) => m.set(mac.id_macro, { ...mac, corFinal: mac.cor || PALETA_REGIOES[i % PALETA_REGIOES.length] }));
        return m;
    }, [regioes]);
    const microPorId = useMemo(() => {
        const m = new Map();
        regioes.forEach((mac, i) => mac.micros.forEach((mi, j) => m.set(mi.id_micro, {
            ...mi, corFinal: mi.cor || PALETA_REGIOES[(i * 3 + j + 1) % PALETA_REGIOES.length]
        })));
        return m;
    }, [regioes]);
    const macroAtual = fMacro ? macroPorId.get(Number(fMacro)) : null;
    const microAtual = fMicro ? microPorId.get(Number(fMicro)) : null;

    // Cor da região conforme a visão: Geral/Macro -> macro; Micro -> micro.
    const corRegiao = useCallback((idMacro, idMicro) => {
        if (visao !== 'micro') return macroPorId.get(idMacro)?.corFinal || COR_SEM_REGIAO;
        return microPorId.get(idMicro)?.corFinal || macroPorId.get(idMacro)?.corFinal || COR_SEM_REGIAO;
    }, [visao, macroPorId, microPorId]);
    // Cor da micro (Geral mostra macro no preenchimento e micro no contorno/marcadores)
    const corMicro = useCallback((idMacro, idMicro) =>
        microPorId.get(idMicro)?.corFinal || macroPorId.get(idMacro)?.corFinal || COR_SEM_REGIAO, [macroPorId, microPorId]);

    const produtos = useMemo(() => dados?.produtos || [], [dados]);
    const coresProduto = useMemo(() => mapaDeCores(produtos), [produtos]);
    const corProduto = (id) => coresProduto[id] || COR_SEM_PRODUTO;
    const produtoAtual = fProduto ? produtos.find(p => String(p.id_produto) === String(fProduto)) : null;

    /* ------------------------------- filtragem -------------------------------- */
    const unidades = useMemo(() => dados?.unidades || [], [dados]);
    const unidadesEscopo = useMemo(() => unidades.filter(u => {
        if (visao !== 'geral' && fMacro && String(u.id_macro) !== String(fMacro)) return false;
        if (visao === 'micro' && fMicro && String(u.id_micro) !== String(fMicro)) return false;
        return true;
    }), [unidades, visao, fMacro, fMicro]);
    // Tipos de unidade presentes no projeto (Hospital, Central de Regulação, UBS, ESF/PSF...)
    const tipos = useMemo(() => dados?.tipos || [], [dados]);
    const tipoPorId = useMemo(() => new Map(tipos.map(t => [t.id_tipo_unidade, t])), [tipos]);
    const tipoAtual = fTipo ? tipoPorId.get(Number(fTipo)) : null;
    const siglaDe = (u) => tipoPorId.get(u.id_tipo_unidade)?.sigla || '?';
    const unidadesFiltro = useMemo(() => unidadesEscopo.filter(u =>
        (!produtoAtual || u.produtos.includes(produtoAtual.id_produto)) && (!fTipo || String(u.id_tipo_unidade) === fTipo)
    ), [unidadesEscopo, produtoAtual, fTipo]);
    // Contagem por tipo no escopo (legenda do mapa), respeitando o produto selecionado
    const resumoTipos = useMemo(() => {
        const m = new Map();
        unidadesEscopo.filter(u => !produtoAtual || u.produtos.includes(produtoAtual.id_produto))
            .forEach(u => { const k = u.id_tipo_unidade || 0; m.set(k, (m.get(k) || 0) + 1); });
        return [...tipos.map(t => ({ ...t, qtd: m.get(t.id_tipo_unidade) || 0 })),
            ...(m.get(0) ? [{ id_tipo_unidade: 0, sigla: '?', nome_tipo: 'Sem tipo', qtd: m.get(0) }] : [])].filter(t => t.qtd > 0);
    }, [unidadesEscopo, produtoAtual, tipos]);
    const idsFiltro = useMemo(() => new Set(unidadesFiltro.map(u => u.id_unidade)), [unidadesFiltro]);

    const atividades = useMemo(() => {
        const nomeProd = produtoAtual ? norm(produtoAtual.nome_produto) : null;
        return (dados?.atividades || []).filter(([idU, di, df, , , prods]) => {
            if (!idsFiltro.has(idU)) return false;
            if (fDe && (df || di) < fDe) return false;
            if (fAte && di > fAte) return false;
            if (nomeProd && !prods.some(p => norm(p) === nomeProd)) return false;
            return true;
        });
    }, [dados, idsFiltro, fDe, fAte, produtoAtual]);

    const porUnidade = useMemo(() => {
        const m = new Map();
        atividades.forEach(([idU, di, df, , , , min]) => {
            const x = m.get(idU) || { qtd: 0, min: 0, ultima: null };
            x.qtd++; x.min += min;
            const fim = df || di;
            if (!x.ultima || fim > x.ultima) x.ultima = fim;
            m.set(idU, x);
        });
        return m;
    }, [atividades]);

    /* ---------------------------------- KPIs ---------------------------------- */
    const kpi = useMemo(() => {
        const totalMin = atividades.reduce((s, a) => s + a[6], 0);
        const semHoras = atividades.filter(a => !a[6]).length;
        const impl = atividades.filter(a => a[3] === 0).length;
        const ultima = atividades.reduce((u, a) => ((a[2] || a[1]) > u ? (a[2] || a[1]) : u), '');
        const atendidas = unidadesFiltro.filter(u => porUnidade.has(u.id_unidade)).length;
        return {
            atividades: atividades.length, impl, proj: atividades.length - impl, totalMin, semHoras, ultima,
            unidades: unidadesFiltro.length, atendidas,
            municipios: new Set(unidadesFiltro.map(u => u.id_cidade).filter(Boolean)).size
        };
    }, [atividades, unidadesFiltro, porUnidade]);

    const serieMes = useMemo(() => {
        const m = new Map();
        atividades.forEach(a => { const k = a[1]?.slice(0, 7); if (!k) return; const x = m.get(k) || { mes: k, qtd: 0, min: 0 }; x.qtd++; x.min += a[6]; m.set(k, x); });
        return [...m.values()].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12);
    }, [atividades]);

    const porMotivo = useMemo(() => {
        const m = new Map();
        atividades.forEach(a => (a[4].length ? a[4] : ['Não informado']).forEach(mot => m.set(mot, (m.get(mot) || 0) + 1)));
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([nome, valor], i) => ({ chave: nome, nome, valor, cor: PALETA_PRODUTOS[i % PALETA_PRODUTOS.length] }));
    }, [atividades]);

    // Distribuição pela região um nível abaixo da visão atual
    const porRegiao = useMemo(() => {
        const m = new Map();
        const chaveDe = (u) => {
            if (visao === 'geral') { const mac = macroPorId.get(u.id_macro); return mac ? [`ma${mac.id_macro}`, mac.nome_macro, mac.corFinal, { macro: mac.id_macro }] : ['sem', 'Sem região', COR_SEM_REGIAO]; }
            if (visao === 'macro') { const mi = microPorId.get(u.id_micro); return mi ? [`mi${mi.id_micro}`, mi.nome_micro, mi.corFinal, { micro: mi.id_micro }] : ['sem', 'Sem micro região', COR_SEM_REGIAO]; }
            return [`c${u.id_cidade}`, u.nome_cidade || 'Sem município', corRegiao(u.id_macro, u.id_micro)];
        };
        unidadesFiltro.forEach(u => {
            const [k, nome, cor, alvoFiltro] = chaveDe(u);
            const x = m.get(k) || { chave: k, nome, cor, alvoFiltro, valor: 0, unidades: 0, min: 0 };
            const pu = porUnidade.get(u.id_unidade);
            x.unidades++; if (pu) { x.valor += pu.qtd; x.min += pu.min; }
            m.set(k, x);
        });
        return [...m.values()].sort((a, b) => b.valor - a.valor || b.unidades - a.unidades)
            .map(x => ({ ...x, titulo: `${x.nome}: ${x.valor} atividade(s) · ${x.unidades} unidade(s) · ${fmtHoras(x.min)}` }));
    }, [unidadesFiltro, porUnidade, visao, macroPorId, microPorId, corRegiao]);

    const topUnidades = useMemo(() => unidadesFiltro
        .map(u => ({ chave: u.id_unidade, nome: u.nome_unidade, valor: porUnidade.get(u.id_unidade)?.qtd || 0, cor: corRegiao(u.id_macro, u.id_micro), u }))
        .filter(x => x.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, 10), [unidadesFiltro, porUnidade, corRegiao]);

    // Produtos (painel lateral): unidades do escopo que têm cada produto
    const resumoProdutos = useMemo(() => produtos.map(p => ({
        ...p, unidades: unidadesEscopo.filter(u => u.produtos.includes(p.id_produto)).length
    })).filter(p => p.unidades > 0).sort((a, b) => b.unidades - a.unidades), [produtos, unidadesEscopo]);

    /* ---------------------------- mapa: municípios ---------------------------- */
    const codPorNome = useMemo(() => new Map(geo.nomes.map(m => [norm(m.nome), m.id])), [geo.nomes]);
    const codDaUnidade = useCallback((u) => (u.uf === uf ? codPorNome.get(norm(u.nome_cidade)) : null), [codPorNome, uf]);

    // Município -> região predominante (todas as unidades do projeto)
    const infoMunicipio = useMemo(() => {
        const m = new Map();
        unidades.forEach(u => {
            const cod = codDaUnidade(u);
            if (!cod) return;
            const x = m.get(cod) || { nome: u.nome_cidade, macros: {}, micros: {}, qtd: 0 };
            x.qtd++;
            if (u.id_macro) x.macros[u.id_macro] = (x.macros[u.id_macro] || 0) + 1;
            if (u.id_micro) x.micros[u.id_micro] = (x.micros[u.id_micro] || 0) + 1;
            m.set(cod, x);
        });
        const topo = (o) => { const e = Object.entries(o).sort((a, b) => b[1] - a[1])[0]; return e ? Number(e[0]) : null; };
        m.forEach(x => { x.macro = topo(x.macros); x.micro = topo(x.micros); });
        return m;
    }, [unidades, codDaUnidade]);

    const codsEscopo = useMemo(() => new Set(unidadesEscopo.map(codDaUnidade).filter(Boolean)), [unidadesEscopo, codDaUnidade]);
    const codsFiltro = useMemo(() => new Set(unidadesFiltro.map(codDaUnidade).filter(Boolean)), [unidadesFiltro, codDaUnidade]);

    const limitesFeature = useMemo(() => {
        const m = new Map();
        (geo.malha?.features || []).forEach(f => { try { m.set(String(f.properties.codarea), L.geoJSON(f).getBounds()); } catch (e) { /* geometria inválida */ } });
        return m;
    }, [geo.malha]);

    const estiloMunicipio = useCallback((f) => {
        const cod = String(f.properties.codarea);
        const info = infoMunicipio.get(cod);
        if (codsEscopo.has(cod)) {
            const ativo = !produtoAtual || codsFiltro.has(cod);
            if (visao === 'geral') return { color: corEscura(corMicro(info?.macro, info?.micro)), weight: 3, opacity: ativo ? 1 : 0.5, fillColor: corRegiao(info?.macro, info?.micro), fillOpacity: ativo ? 0.55 : 0.22 };
            return { color: '#ffffff', weight: 1.2, fillColor: corRegiao(info?.macro, info?.micro), fillOpacity: ativo ? 0.62 : 0.25 };
        }
        if (info) return { color: '#ffffff', weight: 0.8, fillColor: macroPorId.get(info.macro)?.corFinal || COR_SEM_REGIAO, fillOpacity: visao === 'geral' ? 0.35 : 0.12 };
        return { color: '#d5d8d0', weight: 0.6, fillColor: '#eef0ea', fillOpacity: 0.55 };
    }, [infoMunicipio, codsEscopo, codsFiltro, produtoAtual, corRegiao, corMicro, macroPorId, visao]);

    const nomeIbge = useMemo(() => new Map(geo.nomes.map(m => [m.id, m.nome])), [geo.nomes]);
    const aoCadaMunicipio = useCallback((f, layer) => {
        const cod = String(f.properties.codarea);
        const nome = nomeIbge.get(cod) || '';
        const info = infoMunicipio.get(cod);
        if (codsEscopo.has(cod)) {
            layer.bindTooltip(nome, { permanent: true, direction: 'center', className: 'ppj-mun-rotulo' });
        } else if (nome) {
            const reg = info ? macroPorId.get(info.macro)?.nome_macro : null;
            layer.bindTooltip(`${nome}${reg ? ` · ${reg}` : ''}`, { sticky: true, className: 'ppj-mun-hover' });
        }
    }, [nomeIbge, infoMunicipio, codsEscopo, macroPorId]);

    // Rótulo grande da região (ex.: "III MACRO") no centro dos seus municípios
    const rotulosRegiao = useMemo(() => {
        if (!limitesFeature.size) return [];
        const grupos = new Map();
        codsEscopo.forEach(cod => {
            const info = infoMunicipio.get(cod);
            const b = limitesFeature.get(cod);
            if (!info || !b) return;
            const add = (k, texto, cor, mini) => {
                const g = grupos.get(k) || { k, texto, cor, mini, b: L.latLngBounds(b.getSouthWest(), b.getNorthEast()) };
                g.b.extend(b);
                grupos.set(k, g);
            };
            const mac = macroPorId.get(info.macro);
            const mi = microPorId.get(info.micro);
            // Geral/Macro: nome da macro conforme o cadastro (ex.: "MACRO 1"); Geral também mostra a sigla da micro, menor
            if (visao !== 'micro' && mac) add(`ma${mac.id_macro}`, mac.nome_macro, mac.corFinal, false);
            if (visao !== 'macro' && mi) add(`mi${mi.id_micro}`, mi.sigla || mi.nome_micro, visao === 'geral' ? corEscura(mi.corFinal) : mi.corFinal, visao === 'geral');
        });
        return [...grupos.values()].map(g => ({ ...g, centro: g.b.getCenter() }));
    }, [limitesFeature, codsEscopo, infoMunicipio, visao, macroPorId, microPorId]);

    // Pontos das unidades (agrupa as que caem na mesma coordenada)
    const grupos = useMemo(() => {
        const m = new Map();
        unidadesFiltro.forEach(u => {
            if (u.latitude == null || u.longitude == null) return;
            const k = `${u.latitude.toFixed(5)},${u.longitude.toFixed(5)}`;
            if (!m.has(k)) m.set(k, { k, lat: u.latitude, lng: u.longitude, unidades: [] });
            m.get(k).unidades.push(u);
        });
        return [...m.values()];
    }, [unidadesFiltro]);

    const limitesMapa = useMemo(() => {
        let b = null;
        codsEscopo.forEach(cod => { const fb = limitesFeature.get(cod); if (fb) b = b ? b.extend(fb) : L.latLngBounds(fb.getSouthWest(), fb.getNorthEast()); });
        if (!b && grupos.length) b = L.latLngBounds(grupos.map(g => [g.lat, g.lng]));
        if (!b && geo.malha) { try { b = L.geoJSON(geo.malha).getBounds(); } catch (e) { /* sem malha */ } }
        return b;
    }, [codsEscopo, limitesFeature, grupos, geo.malha]);
    const versaoEnquadramento = `${visao}|${fMacro}|${fMicro}|${fProduto}|${fTipo}|${limitesFeature.size}|${grupos.length}`;
    const chaveGeo = `${versaoEnquadramento}|${infoMunicipio.size}`;

    const verUnidade = (u) => {
        setUnidadeFoco(u.id_unidade);
        if (u.latitude != null) { setAlvo({ lat: u.latitude, lng: u.longitude, t: Date.now() }); mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };

    // Relação de unidades agrupada por macro ou micro região (respeita todos os filtros)
    const gruposTabela = useMemo(() => {
        const ordemMacro = new Map(regioes.map((m, i) => [m.id_macro, i]));
        const ordemMicro = new Map(regioes.flatMap((m, i) => m.micros.map((mi, j) => [mi.id_micro, i * 1000 + j])));
        const m = new Map();
        unidadesFiltro.forEach(u => {
            let k, nome, sub = '', cor, ordem, alvoFiltro = null;
            const mac = macroPorId.get(u.id_macro), mi = microPorId.get(u.id_micro);
            if (agrupar === 'lista') { k = 'todas'; nome = 'Todas as unidades'; cor = 'var(--pine)'; ordem = 0; }
            else if (agrupar === 'macro') {
                if (mac) { k = `ma${mac.id_macro}`; nome = mac.nome_macro; cor = mac.corFinal; ordem = ordemMacro.get(mac.id_macro); alvoFiltro = { visao: 'macro', macro: String(mac.id_macro), micro: '' }; }
                else { k = 'sem'; nome = 'Sem macro região'; cor = COR_SEM_REGIAO; ordem = 1e9; }
            } else if (mi) {
                k = `mi${mi.id_micro}`; nome = mi.nome_micro; sub = mac?.nome_macro || ''; cor = mi.corFinal; ordem = ordemMicro.get(mi.id_micro);
                alvoFiltro = { visao: 'micro', macro: String(mi.id_macro), micro: String(mi.id_micro) };
            } else { k = mac ? `ma${mac.id_macro}-sem` : 'sem'; nome = 'Sem micro região'; sub = mac?.nome_macro || 'Sem macro região'; cor = COR_SEM_REGIAO; ordem = 1e9 + (mac ? ordemMacro.get(mac.id_macro) : 999); }
            const g = m.get(k) || { k, nome, sub, cor, ordem, alvoFiltro, unidades: [], qtd: 0, min: 0, cidades: new Set(), atendidas: 0, ultima: null };
            const pu = porUnidade.get(u.id_unidade);
            g.unidades.push(u);
            if (u.id_cidade) g.cidades.add(u.id_cidade);
            if (pu) { g.qtd += pu.qtd; g.min += pu.min; g.atendidas++; if (pu.ultima && (!g.ultima || pu.ultima > g.ultima)) g.ultima = pu.ultima; }
            m.set(k, g);
        });
        const nomeMicro = (u) => microPorId.get(u.id_micro)?.nome_micro || '~';
        return [...m.values()].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt-BR')).map(g => ({
            ...g,
            unidades: g.unidades.sort((a, b) => (agrupar === 'macro' ? nomeMicro(a).localeCompare(nomeMicro(b), 'pt-BR') : 0)
                || String(a.nome_cidade || '').localeCompare(String(b.nome_cidade || ''), 'pt-BR') || a.nome_unidade.localeCompare(b.nome_unidade, 'pt-BR'))
        }));
    }, [unidadesFiltro, porUnidade, agrupar, regioes, macroPorId, microPorId]);

    const alternarGrupo = (k) => setRecolhidos(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    const todosRecolhidos = gruposTabela.length > 0 && gruposTabela.every(g => recolhidos.has(g.k));

    const telaCheia = () => {
        const el = raizRef.current;
        if (!document.fullscreenElement) el?.requestFullscreen?.().catch(() => {});
        else document.exitFullscreen?.();
    };

    /* ------------------------------ renderização ------------------------------ */
    if (naoEncontrado) return <Navigate to="/" replace />;
    if (!dados) {
        return (
            <div className="pp-page pp-page--publico">
                <div className="pp-card pp-vazio">{erro ? <span className="pp-erro"><Icon n="alert" /> {erro}</span> : 'Carregando painel...'}</div>
            </div>
        );
    }

    const tituloEscopo = visao === 'geral' ? 'Todas as regiões'
        : visao === 'macro' ? (macroAtual?.nome_macro || 'Selecione a macro região')
        : (microAtual ? `${macroAtual?.nome_macro ? macroAtual.nome_macro + ' · ' : ''}${microAtual.nome_micro}` : 'Selecione a micro região');
    const microsDaMacro = macroAtual ? macroAtual.micros : regioes.flatMap(m => m.micros);
    const semRegioes = !regioes.length;

    return (
        <div className="pp-page pp-page--publico ppj" ref={raizRef}>
            <header className="pp-head">
                <div className="pp-head-id">
                    <img src={logo} alt="Opera Echo" className="pp-logo" />
                    <div>
                        <h1>{dados.projeto.nome}</h1>
                        <p>Painel público do projeto · atividades, horas e unidades{uf ? ` · ${uf}` : ''}</p>
                    </div>
                </div>
                <div className="pp-head-acoes">
                    <span className="pp-atualizado"><Icon n="clock" /> Atualizado {new Date(dados.gerado_em).toLocaleString('pt-BR')}</span>
                    <button className="pp-btn pp-btn--ghost" onClick={carregar} disabled={carregando}><Icon n="refresh" /> Atualizar</button>
                    <button className="pp-btn" onClick={telaCheia}><Icon n="monitor" /> Tela cheia</button>
                </div>
            </header>

            {/* ------------------------------- FILTROS ------------------------------- */}
            <section className="ppj-filtros">
                <div className="ppj-filtro-visao">
                <span>Visão do mapa</span>
                <div className="ppj-visao" role="tablist" aria-label="Visão do mapa">
                    {[['geral', 'Geral'], ['macro', 'Por Macro'], ['micro', 'Por Micro']].map(([v, r]) => (
                        <button key={v} role="tab" aria-selected={visao === v} className={visao === v ? 'on' : ''} disabled={v !== 'geral' && semRegioes}
                            onClick={() => setFiltro({ visao: v === 'geral' ? '' : v, ...(v === 'geral' ? { macro: '', micro: '' } : {}), ...(v === 'macro' ? { micro: '' } : {}) })}>{r}</button>
                    ))}
                </div>
                </div>
                <label>Macro região
                    <select value={fMacro} disabled={visao === 'geral'} onChange={e => setFiltro({ macro: e.target.value, micro: '' })}>
                        <option value="">{visao === 'geral' ? 'Todas' : 'Selecione...'}</option>
                        {regioes.map(m => <option key={m.id_macro} value={m.id_macro}>{m.nome_macro}</option>)}
                    </select>
                </label>
                <label>Micro região
                    <select value={fMicro} disabled={visao !== 'micro'} onChange={e => {
                        const mi = microPorId.get(Number(e.target.value));
                        setFiltro({ micro: e.target.value, macro: mi ? String(mi.id_macro) : fMacro });
                    }}>
                        <option value="">{visao === 'micro' ? 'Selecione...' : 'Todas'}</option>
                        {microsDaMacro.map(mi => <option key={mi.id_micro} value={mi.id_micro}>{mi.nome_micro}</option>)}
                    </select>
                </label>
                <label>Produto
                    <select value={fProduto} onChange={e => setFiltro({ produto: e.target.value })}>
                        <option value="">Todos os produtos</option>
                        {produtos.map(p => <option key={p.id_produto} value={p.id_produto}>{p.nome_produto}</option>)}
                    </select>
                </label>
                <label>Tipo de unidade
                    <select value={fTipo} onChange={e => setFiltro({ tipo: e.target.value })}>
                        <option value="">Todos os tipos</option>
                        {tipos.map(t => <option key={t.id_tipo_unidade} value={t.id_tipo_unidade}>{t.sigla} - {t.nome_tipo}</option>)}
                    </select>
                </label>
                <label>De<input type="date" value={fDe} max={fAte || undefined} onChange={e => setFiltro({ de: e.target.value })} /></label>
                <label>Até<input type="date" value={fAte} min={fDe || undefined} onChange={e => setFiltro({ ate: e.target.value })} /></label>
                {(fDe || fAte || fProduto || fTipo || visao !== 'geral') && (
                    <button className="ppj-limpar" onClick={() => setParams(new URLSearchParams(), { replace: true })}><Icon n="x" /> Limpar</button>
                )}
            </section>

            {/* --------------------------------- KPIs -------------------------------- */}
            <section className="pp-kpis">
                <div className="pp-kpi pp-kpi--destaque"><span>Atividades lançadas</span><b>{fmtNum(kpi.atividades)}</b><small>Implantação {fmtNum(kpi.impl)} · Projetos {fmtNum(kpi.proj)}</small></div>
                <div className="pp-kpi pp-kpi--destaque"><span>Horas trabalhadas</span><b>{fmtHoras(kpi.totalMin)}</b><small>{kpi.semHoras ? `${fmtNum(kpi.semHoras)} atividade(s) sem horas informadas` : 'registradas nas atividades'}</small></div>
                <div className="pp-kpi"><span>Unidades</span><b>{fmtNum(kpi.unidades)}</b><small>em {fmtNum(kpi.municipios)} município(s)</small></div>
                <div className="pp-kpi"><span>Unidades atendidas</span><b>{fmtNum(kpi.atendidas)}</b><small>{kpi.unidades ? Math.round((kpi.atendidas / kpi.unidades) * 100) : 0}% com atividade no período</small></div>
                <div className="pp-kpi"><span>Última atividade</span><b className="ppj-kpi-data">{dataBR(kpi.ultima)}</b><small>{tituloEscopo}</small></div>
            </section>

            {/* --------------------------- MAPA + PRODUTO ---------------------------- */}
            <section className="ppj-mapa-grid">
                <div className="pp-card ppj-mapa-card" ref={mapaRef}>
                    <h3><Icon n="map" /> Mapa das unidades <small>{tituloEscopo}{tipoAtual ? ` · ${tipoAtual.nome_tipo}` : ''}{produtoAtual ? ` · ${produtoAtual.nome_produto}` : ''}</small></h3>
                    <div className="ppj-mapa">
                        <MapContainer center={[-7.2, -36.7]} zoom={7} style={{ height: '100%', width: '100%' }} zoomSnap={0.25} preferCanvas={false}>
                            <TileLayer url={TILE_URL} attribution={TILE_ATTR} opacity={0.35} />
                            {geo.malha && <GeoJSON key={chaveGeo} data={geo.malha} style={estiloMunicipio} onEachFeature={aoCadaMunicipio} />}
                            {rotulosRegiao.map(r => <Marker key={r.k} position={r.centro} icon={iconeRotulo(r.texto, r.cor, r.mini)} interactive={false} />)}
                            {grupos.map(g => {
                                const u0 = g.unidades[0];
                                const destaque = g.unidades.some(u => u.id_unidade === unidadeFoco);
                                // Ponto com várias unidades: sigla do tipo mais frequente
                                const freq = {};
                                g.unidades.forEach(u => { const sg = siglaDe(u); freq[sg] = (freq[sg] || 0) + 1; });
                                const sigla = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
                                return (
                                    <Marker key={g.k} position={[g.lat, g.lng]} icon={iconeUnidade(sigla, visao === 'geral' ? corEscura(corMicro(u0.id_macro, u0.id_micro)) : corRegiao(u0.id_macro, u0.id_micro), g.unidades.length, destaque)}>
                                        <Popup maxHeight={300} autoPanPaddingTopLeft={[16, 16]} autoPanPaddingBottomRight={[16, 16]}>
                                            <div className="ppj-popup">
                                                {g.unidades.map((u, i) => {
                                                    const pu = porUnidade.get(u.id_unidade);
                                                    return (
                                                        <div key={u.id_unidade}>
                                                            {i > 0 && <hr />}
                                                            <h4><span className="ppj-tipo-badge">{siglaDe(u)}</span>{u.nome_unidade}</h4>
                                                            <div className="ppj-popup-tipo">{tipoPorId.get(u.id_tipo_unidade)?.nome_tipo || 'Tipo não informado'}</div>
                                                            <div>{u.nome_cidade}{u.uf ? ` / ${u.uf}` : ''} · CNES {u.cnes || '-'}</div>
                                                            <div>{macroPorId.get(u.id_macro)?.nome_macro || 'Sem macro'}{u.id_micro ? ` · ${microPorId.get(u.id_micro)?.nome_micro || ''}` : ''}</div>
                                                            <div className="ppj-popup-prod">{u.produtos.map(id => {
                                                                const p = produtos.find(x => x.id_produto === id);
                                                                return p ? <span key={id} className="mu-chip"><i style={{ background: corProduto(id) }} />{p.nome_produto}</span> : null;
                                                            })}</div>
                                                            <div><b>{pu?.qtd || 0}</b> atividade(s) · <b>{fmtHoras(pu?.min || 0)}</b></div>
                                                            {u.aproximada && <div className="mu-aprox">Localização aproximada (centro do município)</div>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </Popup>
                                    </Marker>
                                );
                            })}
                            <Enquadrar limites={limitesMapa} versao={versaoEnquadramento} />
                            <IrPara alvo={alvo} />
                            <EventosPopup aoMudar={setPopupAberto} />
                        </MapContainer>
                        <div className={`ppj-mapa-selo${popupAberto ? ' oculto' : ''}`}>
                            <small>{visao === 'geral' ? 'Visão geral' : visao === 'macro' ? 'Macro região' : 'Micro região'}</small>
                            <b>{tituloEscopo}</b>
                            <span>{fmtNum(unidadesFiltro.length)} unidade(s) · {fmtNum(kpi.municipios)} município(s)</span>
                        </div>
                        {geo.estado === 'erro' && <div className="ppj-mapa-aviso">Contorno dos municípios indisponível no momento - exibindo apenas as unidades.</div>}
                    </div>
                    <div className="ppj-legenda">
                        {(visao === 'geral'
                            ? regioes.map(m => ({ k: m.id_macro, nome: m.nome_macro, cor: macroPorId.get(m.id_macro)?.corFinal, onClick: () => setFiltro({ visao: 'macro', macro: String(m.id_macro), micro: '' }) }))
                            : (macroAtual ? macroAtual.micros : []).map(mi => ({ k: mi.id_micro, nome: mi.nome_micro, cor: microPorId.get(mi.id_micro)?.corFinal, onClick: () => setFiltro({ visao: 'micro', macro: String(mi.id_macro), micro: String(mi.id_micro) }) }))
                        ).map(x => (
                            <button key={x.k} className={String(x.k) === (visao === 'micro' ? fMicro : '') ? 'on' : ''} onClick={x.onClick} title="Abrir no mapa">
                                <i style={{ background: x.cor }} />{x.nome}
                            </button>
                        ))}
                        {semRegioes && <span className="pp-sub">Regiões ainda não cadastradas para este projeto - exibindo todas as unidades.</span>}
                    </div>
                    {/* Legenda dos tipos de unidade (ícone do mapa) - clique filtra */}
                    {resumoTipos.length > 0 && (
                        <div className="ppj-legenda ppj-legenda-tipos">
                            <span className="pp-sub">Tipos de unidade:</span>
                            {resumoTipos.map(t => (
                                <button key={t.id_tipo_unidade} className={String(t.id_tipo_unidade) === fTipo ? 'on' : ''} disabled={!t.id_tipo_unidade}
                                    title={t.id_tipo_unidade ? 'Filtrar por este tipo' : 'Classifique em Cadastro > Unidades'}
                                    onClick={() => setFiltro({ tipo: String(t.id_tipo_unidade) === fTipo ? '' : String(t.id_tipo_unidade) })}>
                                    <span className="ppj-tipo-badge">{t.sigla}</span>{t.nome_tipo} <small>({t.qtd})</small>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <aside className="pp-card ppj-produto">
                    <h3><Icon n="box" /> Produto selecionado</h3>
                    {produtoAtual ? (
                        <div className="ppj-produto-sel" style={{ borderColor: corProduto(produtoAtual.id_produto) }}>
                            <span className="ppj-produto-nome"><i style={{ background: corProduto(produtoAtual.id_produto) }} />{produtoAtual.nome_produto}</span>
                            <div className="ppj-produto-nums">
                                <div><b>{fmtNum(unidadesFiltro.length)}</b><small>unidades de {fmtNum(unidadesEscopo.length)}</small></div>
                                <div><b>{unidadesEscopo.length ? Math.round((unidadesFiltro.length / unidadesEscopo.length) * 100) : 0}%</b><small>cobertura</small></div>
                                <div><b>{fmtNum(kpi.atividades)}</b><small>atividades</small></div>
                                <div><b>{fmtHoras(kpi.totalMin)}</b><small>horas</small></div>
                            </div>
                            <button className="ppj-limpar" onClick={() => setFiltro({ produto: '' })}><Icon n="x" /> Ver todos os produtos</button>
                        </div>
                    ) : null}
                    <ul className="ppj-produtos">
                        {resumoProdutos.map(p => (
                            <li key={p.id_produto} className={String(p.id_produto) === String(fProduto) ? 'on' : ''}
                                onClick={() => setFiltro({ produto: String(p.id_produto) === String(fProduto) ? '' : String(p.id_produto) })}>
                                <span className="ppj-produtos-nome"><i style={{ background: corProduto(p.id_produto) }} />{p.nome_produto}</span>
                                <span className="ppj-barras-trilho"><span style={{ width: `${unidadesEscopo.length ? (p.unidades / unidadesEscopo.length) * 100 : 0}%`, background: corProduto(p.id_produto) }} /></span>
                                <b>{p.unidades}</b>
                            </li>
                        ))}
                        {!resumoProdutos.length && <li className="pp-vazio">Nenhum produto vinculado às unidades.</li>}
                    </ul>
                </aside>
            </section>

            {/* ------------------------- RELAÇÃO DE UNIDADES ------------------------- */}
            <section className="pp-card">
                <div className="ppj-unid-topo">
                    <h3><Icon n="hospital" /> Unidades <small>{fmtNum(unidadesFiltro.length)} · {tituloEscopo}{produtoAtual ? ` · ${produtoAtual.nome_produto}` : ''}</small></h3>
                    <div className="ppj-unid-acoes">
                        <span className="pp-sub">Agrupar por</span>
                        <div className="ppj-visao ppj-visao--mini">
                            {[['macro', 'Macro'], ['micro', 'Micro'], ['lista', 'Sem grupo']].map(([v, r]) => (
                                <button key={v} className={agrupar === v ? 'on' : ''} disabled={v !== 'lista' && semRegioes}
                                    onClick={() => { setRecolhidos(new Set()); setFiltro({ agrupar: v }); }}>{r}</button>
                            ))}
                        </div>
                        {agrupar !== 'lista' && gruposTabela.length > 1 && (
                            <button className="ppj-limpar" onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(gruposTabela.map(g => g.k)))}>
                                <Icon n={todosRecolhidos ? 'arrow-down' : 'arrow-up'} /> {todosRecolhidos ? 'Expandir todos' : 'Recolher todos'}
                            </button>
                        )}
                    </div>
                </div>
                <div className="ppj-tabela-wrap ppj-tabela-wrap--grupos">
                    <table className="ppj-tabela">
                        <thead><tr>
                            <th>Unidade</th><th>Município</th><th>Macro</th><th>Micro</th><th>Produtos</th>
                            <th className="num">Atividades</th><th className="num">Horas</th><th className="num">Última</th>
                        </tr></thead>
                        {gruposTabela.map(g => (
                        <tbody key={g.k}>
                            {agrupar !== 'lista' && (
                                <tr className="ppj-grupo" onClick={() => alternarGrupo(g.k)} style={{ '--cor-grupo': g.cor }}>
                                    <td colSpan="5">
                                        <div className="ppj-grupo-cab">
                                        <span className="ppj-grupo-seta">{recolhidos.has(g.k) ? '▸' : '▾'}</span>
                                        <i className="ppj-grupo-cor" />
                                        <b>{g.nome}</b>{g.sub && <span className="ppj-grupo-sub">{g.sub}</span>}
                                        <span className="ppj-grupo-info">{fmtNum(g.unidades.length)} unidade(s) · {fmtNum(g.cidades.size)} município(s) · {fmtNum(g.atendidas)} atendida(s)</span>
                                        {g.alvoFiltro && (
                                            <button className="ppj-grupo-mapa" title="Abrir esta região no mapa"
                                                onClick={e => { e.stopPropagation(); setFiltro(g.alvoFiltro); mapaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                                                <Icon n="map" /> Ver no mapa
                                            </button>
                                        )}
                                        </div>
                                    </td>
                                    {/* Totais do grupo, nas mesmas colunas das unidades: Atividades / Horas / Última */}
                                    <td className="num ppj-grupo-total"><b>{fmtNum(g.qtd)}</b><small>atividades</small></td>
                                    <td className="num ppj-grupo-total"><b>{g.min ? fmtHoras(g.min) : '-'}</b><small>horas</small></td>
                                    <td className="num ppj-grupo-total"><b>{dataBR(g.ultima)}</b><small>última</small></td>
                                </tr>
                            )}
                            {!recolhidos.has(g.k) && g.unidades.map(u => {
                                const pu = porUnidade.get(u.id_unidade);
                                return (
                                    <tr key={u.id_unidade} className={unidadeFoco === u.id_unidade ? 'foco' : ''} onClick={() => verUnidade(u)} title="Ver no mapa">
                                        <td><span className="ppj-cor-linha" style={{ background: corRegiao(u.id_macro, u.id_micro) }} /><span className="ppj-tipo-badge" title={tipoPorId.get(u.id_tipo_unidade)?.nome_tipo || 'Sem tipo'}>{siglaDe(u)}</span><b>{u.nome_unidade}</b><div className="pp-sub">CNES {u.cnes || '-'}</div></td>
                                        <td>{u.nome_cidade || '-'}</td>
                                        <td>{macroPorId.get(u.id_macro)?.nome_macro || '-'}</td>
                                        <td>{microPorId.get(u.id_micro)?.nome_micro || '-'}</td>
                                        <td>{u.produtos.map(id => {
                                            const p = produtos.find(x => x.id_produto === id);
                                            if (!p) return null;
                                            const sel = String(id) === String(fProduto);
                                            return <span key={id} className={`mu-chip ${sel ? 'ppj-chip-sel' : ''}`} style={sel ? { borderColor: corProduto(id) } : undefined}><i style={{ background: corProduto(id) }} />{p.nome_produto}</span>;
                                        })}</td>
                                        <td className="num"><b>{pu?.qtd || 0}</b></td>
                                        <td className="num">{pu?.min ? fmtHoras(pu.min) : '-'}</td>
                                        <td className="num">{dataBR(pu?.ultima)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        ))}
                        {!unidadesFiltro.length && <tbody><tr><td colSpan="8" className="pp-vazio">Nenhuma unidade para o filtro selecionado.</td></tr></tbody>}
                    </table>
                </div>
            </section>

            {/* ------------------------------- GRÁFICOS ------------------------------ */}
            <section className="pp-grid pp-grid--3">
                <div className="pp-card pp-span-2"><h3><Icon n="bar-chart" /> Atividades por mês <small>últimos 12 meses com registro</small></h3><BarrasMes dados={serieMes} /></div>
                <div className="pp-card"><h3><Icon n="grid" /> Implantação x Projetos</h3>
                    <Rosca centro={fmtNum(kpi.atividades)} legenda="atividades" partes={[
                        { nome: 'Implantação', valor: kpi.impl, cor: '#2E7D32' },
                        { nome: 'Projetos', valor: kpi.proj, cor: '#9C7A3C' }
                    ]} />
                </div>
            </section>
            <section className="pp-grid pp-grid--3">
                <div className="pp-card"><h3><Icon n="target" /> Por motivo da visita</h3><BarrasH dados={porMotivo} vazio="Sem atividades no período." /></div>
                <div className="pp-card"><h3><Icon n="map" /> {visao === 'geral' ? 'Por macro região' : visao === 'macro' ? 'Por micro região' : 'Por município'} <small>atividades</small></h3>
                    <BarrasH dados={porRegiao} vazio="Sem unidades no filtro."
                        onClick={visao !== 'micro' ? (d => d.alvoFiltro && setFiltro(d.alvoFiltro.macro ? { visao: 'macro', macro: String(d.alvoFiltro.macro), micro: '' } : { visao: 'micro', micro: String(d.alvoFiltro.micro), macro: fMacro })) : undefined} />
                </div>
                <div className="pp-card"><h3><Icon n="trend" /> Unidades com mais atividades</h3>
                    <BarrasH dados={topUnidades} vazio="Sem atividades no período." onClick={d => verUnidade(d.u)} />
                </div>
            </section>

            <footer className="ppj-rodape">Opera Echo · Painel público - dados agregados, sem informações pessoais. Atualização automática a cada 5 minutos.</footer>
        </div>
    );
}
