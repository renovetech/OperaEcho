/* ARQUIVO: src/components/SeletorCoordenada.js
 * Mini mapa do cadastro de unidade: clique no mapa ou arraste o marcador para
 * definir latitude/longitude. Sem coordenada, centraliza no município. */
import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { iconeUnidade, TILE_URL, TILE_ATTR, CENTRO_BRASIL } from '../config/mapaUnidades';

function Eventos({ aoMarcar }) {
    useMapEvents({ click: (e) => aoMarcar(e.latlng.lat, e.latlng.lng) });
    return null;
}

function Centralizar({ centro, zoom }) {
    const map = useMap();
    useEffect(() => { if (centro) map.setView(centro, zoom); }, [map, centro, zoom]);
    return null;
}

export default function SeletorCoordenada({ latitude, longitude, latCidade, lngCidade, aoMarcar, chaveCentro, somenteLeitura = false }) {
    const temPonto = latitude !== '' && longitude !== '' && latitude != null && longitude != null
        && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
    const ponto = temPonto ? [Number(latitude), Number(longitude)] : null;
    const cidade = latCidade != null && lngCidade != null && latCidade !== '' ? [Number(latCidade), Number(lngCidade)] : null;

    // Recentraliza só quando muda a referência (unidade aberta, município ou
    // coordenada digitada/colada - chaveCentro), não a cada clique/arraste no mapa.
    const { centro, zoom } = useMemo(() => ({ centro: ponto || cidade || CENTRO_BRASIL, zoom: ponto ? 16 : cidade ? 13 : 4 }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [chaveCentro, cidade ? cidade.join(',') : '']);

    return (
        <div className="geo-mapa">
            <MapContainer center={centro} zoom={zoom} style={{ height: '100%', width: '100%' }}>
                <TileLayer url={TILE_URL} attribution={TILE_ATTR} />
                <Centralizar centro={centro} zoom={zoom} />
                {!somenteLeitura && <Eventos aoMarcar={aoMarcar} />}
                {ponto && (
                    <Marker position={ponto} icon={iconeUnidade(['#2E7D32'])} draggable={!somenteLeitura}
                        eventHandlers={{ dragend: (e) => { const p = e.target.getLatLng(); aoMarcar(p.lat, p.lng); } }} />
                )}
            </MapContainer>
        </div>
    );
}
