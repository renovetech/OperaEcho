/* Mapa do painel: contorno dos municípios (IBGE) colorido pela região e unidades sinalizadas pela sigla do tipo. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Feature } from 'geojson';
import L, { type Layer, type LatLngBounds } from 'leaflet';
import { GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { MalhaMunicipal, UnidadePainel } from '@/features/painelProjeto/api';
import { corDaMicro, corDaRegiao, COR_SEM_REGIAO, fmtHoras, fmtNum, normalizar, type ConsolidadoPainel, type FiltroPainel } from '@/features/painelProjeto/calculos';
import { corEscura, iconeRotulo, iconeUnidade, SeloTipo } from '@/features/painelProjeto/marcadores';
import { cn } from '@/shared/lib';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTR = '&copy; OpenStreetMap contributors &middot; Malha municipal: IBGE';
const CENTRO_INICIAL: [number, number] = [-7.2, -36.7];
const ROTULO_MUNICIPIO = 'border-0 bg-transparent p-0 text-[10.5px] font-semibold whitespace-nowrap text-[#22302a] shadow-none [text-shadow:0_0_3px_#fff,0_0_3px_#fff,0_0_2px_#fff] before:hidden';
const NOME_VISAO = { geral: 'Visão geral', macro: 'Macro região', micro: 'Micro região' };

export type EstadoMalha = { estado: 'carregando' | 'erro' } | { estado: 'ok'; dados: MalhaMunicipal };

interface InfoMunicipio { qtd: number; macro: number | null; micro: number | null }

function Enquadrar({ limites, versao }: { limites: LatLngBounds | null; versao: string }) {
    const mapa = useMap();
    useEffect(() => {
        if (limites?.isValid()) mapa.fitBounds(limites, { padding: [24, 24], maxZoom: 12 });
        // Reenquadra só quando filtros ou malha mudam; "limites" é um objeto novo a cada cálculo.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapa, versao]);
    return null;
}

function IrPara({ alvo }: { alvo: { lat: number; lng: number; t: number } | null }) {
    const mapa = useMap();
    useEffect(() => {
        if (alvo) mapa.flyTo([alvo.lat, alvo.lng], 14, { duration: 1 });
    }, [mapa, alvo]);
    return null;
}

/** Popup aberto esconde o selo do canto, senão ele fica atrás. */
function EventosPopup({ aoMudar }: { aoMudar: (aberto: boolean) => void }) {
    useMapEvents({ popupopen: () => aoMudar(true), popupclose: () => aoMudar(false) });
    return null;
}

const maisFrequente = (contagem: Map<number, number>) => [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

function PopupUnidade({ unidade, c, separar }: { unidade: UnidadePainel; c: ConsolidadoPainel; separar: boolean }) {
    const dados = c.porUnidade.get(unidade.id_unidade);
    const micro = c.regioes.micros.get(unidade.id_micro ?? 0)?.nome_micro;
    return (
        <div className={cn('text-[12.5px] leading-normal', separar && 'mt-2 border-0 border-t border-solid border-line pt-2')}>
            <h4 className="m-0 mb-1 flex items-start gap-1.5 text-sm font-semibold text-pine"><SeloTipo sigla={c.siglaDe(unidade)} />{unidade.nome_unidade}</h4>
            <p className="m-0 text-[11px] font-bold tracking-wide text-text-2 uppercase">{c.tipoPorId.get(unidade.id_tipo_unidade ?? 0)?.nome_tipo ?? 'Tipo não informado'}</p>
            <p className="m-0">{unidade.nome_cidade}{unidade.uf ? ` / ${unidade.uf}` : ''} · CNES {unidade.cnes || '-'}</p>
            <p className="m-0">{c.regioes.macros.get(unidade.id_macro ?? 0)?.nome_macro ?? 'Sem macro'}{micro ? ` · ${micro}` : ''}</p>
            <p className="m-0"><b>{dados?.qtd ?? 0}</b> atividade(s) · <b>{fmtHoras(dados?.min ?? 0)}</b></p>
            {unidade.aproximada && <p className="m-0 text-brass">Localização aproximada (centro do município)</p>}
        </div>
    );
}

interface MapaProjetoProps {
    uf: string | null;
    malha: EstadoMalha;
    filtro: FiltroPainel;
    c: ConsolidadoPainel;
    unidades: UnidadePainel[];
    unidadeFoco: number | null;
    alvo: { lat: number; lng: number; t: number } | null;
}

export function MapaProjeto({ uf, malha, filtro, c, unidades, unidadeFoco, alvo }: MapaProjetoProps) {
    const [popupAberto, setPopupAberto] = useState(false);
    const { regioes } = c;
    const { visao } = filtro;
    const geo = malha.estado === 'ok' ? malha.dados : null;
    const codPorNome = useMemo(() => new Map((geo?.nomes ?? []).map((municipio) => [normalizar(municipio.nome), municipio.id])), [geo]);
    const nomePorCod = useMemo(() => new Map((geo?.nomes ?? []).map((municipio) => [municipio.id, municipio.nome])), [geo]);
    const codDaUnidade = useCallback((unidade: UnidadePainel) => (unidade.uf === uf ? codPorNome.get(normalizar(unidade.nome_cidade)) : undefined), [codPorNome, uf]);

    // Município -> região predominante, considerando todas as unidades do projeto.
    const infoMunicipio = useMemo(() => {
        const grupos = new Map<string, UnidadePainel[]>();
        unidades.forEach((unidade) => {
            const codigo = codDaUnidade(unidade);
            if (codigo) grupos.set(codigo, [...(grupos.get(codigo) ?? []), unidade]);
        });
        const contar = (lista: UnidadePainel[], campo: 'id_macro' | 'id_micro') => lista.reduce((mapa, unidade) => {
            const id = unidade[campo];
            return id ? mapa.set(id, (mapa.get(id) ?? 0) + 1) : mapa;
        }, new Map<number, number>());
        return new Map([...grupos.entries()].map(([codigo, lista]): [string, InfoMunicipio] => [codigo, { qtd: lista.length, macro: maisFrequente(contar(lista, 'id_macro')), micro: maisFrequente(contar(lista, 'id_micro')) }]));
    }, [unidades, codDaUnidade]);

    const codsEscopo = useMemo(() => new Set(c.unidadesEscopo.map(codDaUnidade).filter(Boolean)), [c.unidadesEscopo, codDaUnidade]);
    const codsFiltro = useMemo(() => new Set(c.unidadesFiltro.map(codDaUnidade).filter(Boolean)), [c.unidadesFiltro, codDaUnidade]);
    const limitesFeature = useMemo(() => new Map((geo?.malha.features ?? []).map((feature): [string, LatLngBounds] => [String(feature.properties?.codarea), L.geoJSON(feature).getBounds()])), [geo]);

    const estilo = useCallback((feature?: Feature) => {
        const codigo = String(feature?.properties?.codarea);
        const info = infoMunicipio.get(codigo);
        if (codsEscopo.has(codigo)) {
            const ativo = !c.produtoAtual || codsFiltro.has(codigo);
            const preenchimento = corDaRegiao(regioes, visao, info?.macro, info?.micro);
            if (visao === 'geral') return { color: corEscura(corDaMicro(regioes, info?.macro, info?.micro)), weight: 3, opacity: ativo ? 1 : 0.5, fillColor: preenchimento, fillOpacity: ativo ? 0.55 : 0.22 };
            return { color: '#ffffff', weight: 1.2, fillColor: preenchimento, fillOpacity: ativo ? 0.62 : 0.25 };
        }
        if (info) return { color: '#ffffff', weight: 0.8, fillColor: regioes.macros.get(info.macro ?? 0)?.corFinal ?? COR_SEM_REGIAO, fillOpacity: visao === 'geral' ? 0.35 : 0.12 };
        return { color: '#d5d8d0', weight: 0.6, fillColor: '#eef0ea', fillOpacity: 0.55 };
    }, [infoMunicipio, codsEscopo, codsFiltro, c.produtoAtual, regioes, visao]);

    const aoCadaMunicipio = useCallback((feature: Feature, camada: Layer) => {
        const codigo = String(feature.properties?.codarea);
        const nome = nomePorCod.get(codigo) ?? '';
        if (codsEscopo.has(codigo)) {
            camada.bindTooltip(nome, { permanent: true, direction: 'center', className: ROTULO_MUNICIPIO });
        } else if (nome) {
            const regiao = regioes.macros.get(infoMunicipio.get(codigo)?.macro ?? 0)?.nome_macro;
            camada.bindTooltip(`${nome}${regiao ? ` · ${regiao}` : ''}`, { sticky: true, className: 'text-[11px] font-semibold' });
        }
    }, [nomePorCod, infoMunicipio, codsEscopo, regioes]);

    // Rótulo da região no centro dos seus municípios. Na visão Geral, também a sigla da micro, menor.
    const rotulos = useMemo(() => {
        const grupos = new Map<string, { k: string; texto: string; cor: string; mini: boolean; limites: LatLngBounds }>();
        const somar = (k: string, texto: string, cor: string, mini: boolean, limites: LatLngBounds) => {
            const atual = grupos.get(k);
            grupos.set(k, { k, texto, cor, mini, limites: L.latLngBounds(limites.getSouthWest(), limites.getNorthEast()).extend(atual?.limites ?? limites) });
        };
        codsEscopo.forEach((codigo) => {
            const info = infoMunicipio.get(codigo ?? '');
            const limites = limitesFeature.get(codigo ?? '');
            if (!info || !limites) return;
            const macro = regioes.macros.get(info.macro ?? 0);
            const micro = regioes.micros.get(info.micro ?? 0);
            if (visao !== 'micro' && macro) somar(`ma${macro.id_macro}`, macro.nome_macro, macro.corFinal, false, limites);
            if (visao !== 'macro' && micro) somar(`mi${micro.id_micro}`, micro.sigla || micro.nome_micro, visao === 'geral' ? corEscura(micro.corFinal) : micro.corFinal, visao === 'geral', limites);
        });
        return [...grupos.values()].map((grupo) => ({ ...grupo, centro: grupo.limites.getCenter() }));
    }, [limitesFeature, codsEscopo, infoMunicipio, visao, regioes]);

    // Unidades na mesma coordenada viram um marcador só.
    const pontos = useMemo(() => {
        const grupos = new Map<string, { k: string; lat: number; lng: number; unidades: UnidadePainel[] }>();
        c.unidadesFiltro.forEach((unidade) => {
            if (unidade.latitude === null || unidade.longitude === null) return;
            const k = `${unidade.latitude.toFixed(5)},${unidade.longitude.toFixed(5)}`;
            grupos.set(k, { k, lat: unidade.latitude, lng: unidade.longitude, unidades: [...(grupos.get(k)?.unidades ?? []), unidade] });
        });
        return [...grupos.values()];
    }, [c.unidadesFiltro]);

    const limitesMapa = useMemo(() => {
        const doEscopo = [...codsEscopo].map((codigo) => limitesFeature.get(codigo ?? '')).filter((item): item is LatLngBounds => Boolean(item));
        const [primeiro, ...resto] = doEscopo;
        if (primeiro) return resto.reduce((soma, item) => soma.extend(item), L.latLngBounds(primeiro.getSouthWest(), primeiro.getNorthEast()));
        if (pontos.length) return L.latLngBounds(pontos.map((ponto): [number, number] => [ponto.lat, ponto.lng]));
        return geo ? L.geoJSON(geo.malha).getBounds() : null;
    }, [codsEscopo, limitesFeature, pontos, geo]);

    const versao = `${visao}|${filtro.macro}|${filtro.micro}|${filtro.produto}|${filtro.tipo}|${limitesFeature.size}|${pontos.length}`;

    return (
        <div className="relative h-[520px]">
            <MapContainer center={CENTRO_INICIAL} zoom={7} zoomSnap={0.25} className="size-full">
                <TileLayer url={TILE_URL} attribution={TILE_ATTR} opacity={0.35} />
                {geo && <GeoJSON key={`${versao}|${infoMunicipio.size}`} data={geo.malha} style={estilo} onEachFeature={aoCadaMunicipio} />}
                {rotulos.map((rotulo) => <Marker key={rotulo.k} position={rotulo.centro} icon={iconeRotulo(rotulo.texto, rotulo.cor, rotulo.mini)} interactive={false} />)}
                {pontos.map((ponto) => {
                    const primeira = ponto.unidades[0];
                    const contagem = ponto.unidades.reduce((mapa, unidade) => mapa.set(c.siglaDe(unidade), (mapa.get(c.siglaDe(unidade)) ?? 0) + 1), new Map<string, number>());
                    const sigla = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '?';
                    const cor = visao === 'geral' ? corEscura(corDaMicro(regioes, primeira?.id_macro, primeira?.id_micro)) : corDaRegiao(regioes, visao, primeira?.id_macro, primeira?.id_micro);
                    return (
                        <Marker key={ponto.k} position={[ponto.lat, ponto.lng]} icon={iconeUnidade(sigla, cor, ponto.unidades.length, ponto.unidades.some((unidade) => unidade.id_unidade === unidadeFoco))}>
                            <Popup maxHeight={300} autoPanPaddingTopLeft={[16, 16]} autoPanPaddingBottomRight={[16, 16]}>
                                {ponto.unidades.map((unidade, indice) => <PopupUnidade key={unidade.id_unidade} unidade={unidade} c={c} separar={indice > 0} />)}
                            </Popup>
                        </Marker>
                    );
                })}
                <Enquadrar limites={limitesMapa} versao={versao} />
                <IrPara alvo={alvo} />
                <EventosPopup aoMudar={setPopupAberto} />
            </MapContainer>
            {!popupAberto && (
                <div className="absolute top-3 right-3 z-[500] rounded-lg bg-white px-3.5 py-2.5 shadow-pop">
                    <small className="block text-[11px] text-text-2">{NOME_VISAO[visao]}</small>
                    <b className="block text-sm font-semibold text-ink">{c.tituloEscopo}</b>
                    <span className="text-xs text-text-2">{fmtNum(c.kpi.unidades)} unidade(s) · {fmtNum(c.kpi.municipios)} município(s)</span>
                </div>
            )}
            {malha.estado === 'erro' && <div className="absolute bottom-3 left-3 z-[500] rounded-md bg-brass-tint px-3 py-1.5 text-xs text-brass">Contorno dos municípios indisponível no momento: exibindo apenas as unidades.</div>}
        </div>
    );
}
