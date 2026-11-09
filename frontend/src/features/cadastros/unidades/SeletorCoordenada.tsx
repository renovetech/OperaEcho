/* Mini mapa do cadastro: clique no mapa ou arraste o marcador para definir a coordenada.
   Sem coordenada, centraliza no município. */
import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { LatLngTuple, LeafletEvent, Marker as MarcadorLeaflet } from 'leaflet';
import { CENTRO_BRASIL, iconeUnidade, TILE_ATTR, TILE_URL } from '@/shared/mapaUnidades';

type Coordenada = string | number | null | undefined;

const ZOOM_UNIDADE = 16;
const ZOOM_MUNICIPIO = 13;
const ZOOM_PAIS = 4;
const COR_MARCADOR = '#2E7D32';

function EventosDoMapa({ aoMarcar }: { aoMarcar: (latitude: number, longitude: number) => void }) {
    useMapEvents({ click: (evento) => aoMarcar(evento.latlng.lat, evento.latlng.lng) });
    return null;
}

function Centralizar({ centro, zoom }: { centro: LatLngTuple; zoom: number }) {
    const mapa = useMap();
    useEffect(() => { mapa.setView(centro, zoom); }, [mapa, centro, zoom]);
    return null;
}

function paraPonto(latitude: Coordenada, longitude: Coordenada): LatLngTuple | null {
    if (latitude === '' || longitude === '' || latitude == null || longitude == null) return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null;
}

interface SeletorCoordenadaProps {
    latitude: string;
    longitude: string;
    latCidade: Coordenada;
    lngCidade: Coordenada;
    chaveCentro: number;
    somenteLeitura: boolean;
    aoMarcar: (latitude: number, longitude: number) => void;
}

export function SeletorCoordenada({ latitude, longitude, latCidade, lngCidade, chaveCentro, somenteLeitura, aoMarcar }: SeletorCoordenadaProps) {
    const ponto = paraPonto(latitude, longitude);
    const cidade = paraPonto(latCidade, lngCidade);
    const chaveCidade = cidade ? cidade.join(',') : '';

    // Recentraliza quando muda a referência (unidade, município ou coordenada digitada), não a cada clique no mapa.
    const { centro, zoom } = useMemo(() => {
        if (ponto) return { centro: ponto, zoom: ZOOM_UNIDADE };
        if (cidade) return { centro: cidade, zoom: ZOOM_MUNICIPIO };
        return { centro: CENTRO_BRASIL as LatLngTuple, zoom: ZOOM_PAIS };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chaveCentro, chaveCidade]);

    return (
        <div className="relative isolate mt-3.5 h-80 overflow-hidden rounded-[10px] border border-line">
            <MapContainer center={centro} zoom={zoom} className="size-full">
                <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
                <Centralizar centro={centro} zoom={zoom} />
                {!somenteLeitura && <EventosDoMapa aoMarcar={aoMarcar} />}
                {ponto && (
                    <Marker
                        position={ponto}
                        icon={iconeUnidade([COR_MARCADOR])}
                        draggable={!somenteLeitura}
                        eventHandlers={{
                            dragend: (evento: LeafletEvent) => {
                                const { lat, lng } = (evento.target as MarcadorLeaflet).getLatLng();
                                aoMarcar(lat, lng);
                            }
                        }}
                    />
                )}
            </MapContainer>
        </div>
    );
}
