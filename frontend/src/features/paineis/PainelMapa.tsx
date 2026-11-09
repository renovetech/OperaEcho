/* Implantações Consolidadas: mapa das atividades por cidade, projeto e unidade. */
import { useEffect, useMemo, useState } from 'react';
import { icon as criarIcone, type LatLngTuple } from 'leaflet';
import iconeMarcador from 'leaflet/dist/images/marker-icon.png';
import sombraMarcador from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import Icon from '@/shared/ui/Icon';
import type { Periodo, RegistroMapa } from '@/features/paineis/api';
import { buscarMapa } from '@/features/paineis/api';
import { erro, mensagemDeErro } from '@/shared/feedback';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Card } from '@/shared/ui/Pagina';

const MOTIVOS = ['Implantação', 'Treinamento', 'Visita Técnica', 'Apoio ao Projeto'];
const MOTIVOS_SEM_PROFISSIONAIS = ['Visita Técnica', 'Apoio ao Projeto'];
const CENTRO_PADRAO: LatLngTuple = [-10.5, -48.5];
const ZOOM_PADRAO = 5;
const ZOOM_APROXIMADO = 8;
const MARCADOR = criarIcone({ iconUrl: iconeMarcador, shadowUrl: sombraMarcador, iconSize: [25, 41], iconAnchor: [12, 41] });

interface Local {
    lat: number;
    lng: number;
    cidade?: string;
    projeto?: string;
    profissionais: number;
}

interface UnidadeDoProjeto {
    nome: string;
    profissionais: number;
    data_inicio?: string | null;
    data_fim?: string | null;
}

function Voo({ centro, zoom }: { centro: LatLngTuple; zoom: number }) {
    const mapa = useMap();
    useEffect(() => {
        mapa.flyTo(centro, zoom, { duration: 1.5 });
    }, [centro, zoom, mapa]);
    return null;
}

const dataBR = (valor?: string | null) => (valor ? valor.split('T')[0]?.split('-').reverse().join('/') ?? '' : '');

function periodoDaUnidade(unidade: UnidadeDoProjeto | null): string {
    const inicio = dataBR(unidade?.data_inicio);
    if (!inicio) return '-';
    const fim = dataBR(unidade?.data_fim);
    return fim && fim !== inicio ? `${inicio} até ${fim}` : inicio;
}

function agruparPorLocal(registros: RegistroMapa[]): Local[] {
    const grupos = new Map<string, Local>();
    registros.forEach((item) => {
        if (!item.latitude || !item.longitude) return;
        const chave = `${item.latitude},${item.longitude}`;
        const atual = grupos.get(chave) ?? { lat: item.latitude, lng: item.longitude, cidade: item.cidade, projeto: item.nome_projeto, profissionais: 0 };
        grupos.set(chave, { ...atual, profissionais: atual.profissionais + (item.profissionais_env ?? 0) });
    });
    return [...grupos.values()];
}

const Indicador = ({ rotulo, escuro, children }: { rotulo: string; escuro?: boolean; children: React.ReactNode }) => (
    <Card className={cn('px-4 py-3', escuro && 'bg-pine-800')}>
        <p className={cn('m-0 mb-1 text-xs', escuro ? 'text-sage-300' : 'text-text-2')}>{rotulo}</p>
        <div className={cn('text-[15px] font-semibold', escuro ? 'text-white' : 'text-ink')}>{children}</div>
    </Card>
);

export function PainelMapa({ periodo }: { periodo: Periodo }) {
    const [resultado, setResultado] = useState<{ chave: string; lista: RegistroMapa[] }>({ chave: '', lista: [] });
    const [motivo, setMotivo] = useState(MOTIVOS[0] ?? '');
    const [projeto, setProjeto] = useState<string | null>(null);
    const [local, setLocal] = useState<Local | null>(null);
    const [unidade, setUnidade] = useState<UnidadeDoProjeto | null>(null);
    const chave = JSON.stringify(periodo);
    const carregando = resultado.chave !== chave;

    useEffect(() => {
        let ativo = true;
        buscarMapa(periodo)
            .then((lista) => { if (ativo) setResultado({ chave, lista }); })
            .catch((falha: unknown) => {
                if (!ativo) return;
                setResultado({ chave, lista: [] });
                erro(mensagemDeErro(falha, 'Não foi possível carregar o mapa.'));
            });
        return () => { ativo = false; };
    }, [chave, periodo]);

    const doMotivo = useMemo(() => resultado.lista.filter((item) => (item.motivos ?? 'Implantação').includes(motivo)), [resultado.lista, motivo]);
    const doProjeto = useMemo(() => (projeto ? doMotivo.filter((item) => item.nome_projeto === projeto) : doMotivo), [doMotivo, projeto]);
    const projetos = useMemo(() => [...new Set(doMotivo.map((item) => item.nome_projeto).filter(Boolean) as string[])].sort(), [doMotivo]);
    const locais = useMemo(() => agruparPorLocal(doProjeto), [doProjeto]);

    const unidades = useMemo<UnidadeDoProjeto[]>(() => {
        if (!projeto) return [];
        const unicas = new Map<string, UnidadeDoProjeto>();
        doProjeto.forEach((item) => {
            if (!unicas.has(item.nome_unidade)) unicas.set(item.nome_unidade, { nome: item.nome_unidade, profissionais: item.profissionais_env ?? 0, data_inicio: item.data_inicio, data_fim: item.data_fim });
        });
        return [...unicas.values()].sort((a, b) => a.nome.localeCompare(b.nome));
    }, [doProjeto, projeto]);

    const centro = useMemo<LatLngTuple>(() => {
        if (local) return [local.lat, local.lng];
        const ponto = projeto ? doProjeto.find((item) => item.latitude) : undefined;
        return ponto?.latitude && ponto.longitude ? [ponto.latitude, ponto.longitude] : CENTRO_PADRAO;
    }, [local, projeto, doProjeto]);

    const semProfissionais = MOTIVOS_SEM_PROFISSIONAIS.includes(motivo);
    const totalProfissionais = unidade?.profissionais ?? local?.profissionais ?? doProjeto.reduce((soma, item) => soma + (item.profissionais_env ?? 0), 0);

    const selecionarProjeto = (nome: string | null) => {
        setProjeto(nome);
        setLocal(null);
        setUnidade(null);
    };

    return (
        <div className="grid h-[calc(100vh-200px)] min-h-[500px] grid-cols-[300px_1fr] gap-3.5">
            <div className="flex min-h-0 flex-col gap-3">
                <Indicador rotulo="Projeto">{projeto ?? 'Visão geral'}</Indicador>
                <Indicador rotulo="Data do evento">{periodoDaUnidade(unidade)}</Indicador>
                <Indicador escuro rotulo={semProfissionais ? 'Total de atividades' : 'Total de profissionais'}>
                    <span className="text-[26px] leading-tight font-bold tabular-nums">{carregando ? '...' : (semProfissionais ? doProjeto.length : totalProfissionais)}</span>
                </Indicador>
                <Card className="flex min-h-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-2 border-b border-line-2 px-4 py-2.5">
                        <h2 className="m-0 truncate text-[13px] font-semibold text-ink">{projeto ? 'Unidades do projeto' : 'Projetos atendidos'}</h2>
                        {projeto && <Button variant="ghost" size="sm" onClick={() => selecionarProjeto(null)}><Icon n="arrow-left" /> Voltar</Button>}
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                        {!projeto && projetos.map((nome) => (
                            <button key={nome} type="button" onClick={() => selecionarProjeto(nome)} className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-md border-0 bg-transparent px-2.5 py-2 text-left font-sans text-[13px] text-ink hover:bg-surface-2">{nome} <Icon n="arrow-right" /></button>
                        ))}
                        {projeto && unidades.map((item) => (
                            <button key={item.nome} type="button" onClick={() => setUnidade(item)} className={cn('block w-full cursor-pointer rounded-md border-0 bg-transparent px-2.5 py-2 text-left font-sans text-[13px] text-ink hover:bg-surface-2', unidade?.nome === item.nome && 'bg-tint font-semibold text-pine-800')}>{item.nome}</button>
                        ))}
                        {!carregando && !(projeto ? unidades : projetos).length && <p className="m-0 p-3 text-[13px] text-text-2">{projeto ? 'Nenhuma unidade encontrada.' : 'Nenhum projeto encontrado.'}</p>}
                    </div>
                </Card>
            </div>
            <div className="relative overflow-hidden rounded-[10px] border border-solid border-line shadow-card">
                <MapContainer center={CENTRO_PADRAO} zoom={ZOOM_PADRAO} className="size-full">
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                    <Voo centro={centro} zoom={local || projeto ? ZOOM_APROXIMADO : ZOOM_PADRAO} />
                    {locais.map((item) => (
                        <Marker
                            key={`${item.lat},${item.lng}`}
                            icon={MARCADOR}
                            position={[item.lat, item.lng]}
                            eventHandlers={{ click: () => { setLocal(item); setUnidade(null); } }}
                        >
                            <Popup><strong>{item.cidade}</strong><br />{item.projeto}</Popup>
                        </Marker>
                    ))}
                </MapContainer>
                <div role="radiogroup" aria-label="Motivo" className="absolute bottom-4 left-1/2 z-[500] flex -translate-x-1/2 gap-1.5 rounded-full bg-white p-1.5 shadow-pop">
                    {MOTIVOS.map((item) => (
                        <button key={item} type="button" role="radio" aria-checked={motivo === item} onClick={() => { setMotivo(item); selecionarProjeto(null); }} className={cn('cursor-pointer rounded-full border-0 px-3.5 py-1.5 font-sans text-[13px] font-medium whitespace-nowrap', motivo === item ? 'bg-pine text-white' : 'bg-transparent text-text hover:bg-surface-2')}>{item}</button>
                    ))}
                </div>
            </div>
        </div>
    );
}
