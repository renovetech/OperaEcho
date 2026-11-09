/* Indicadores e gráficos do Faturamento Consolidado. */
import { useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { comSinal, COR_OUTROS, fmtPart, fmtVar, rotComp, varPerc, type Consolidado } from '@/features/faturamento/consolidacao';
import type { RegrasCalculo } from '@/features/faturamento/regrasCalculo';
import { fmtMoeda, fmtNum } from '@/features/sigtap/formatos';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';
import { Button } from '@/shared/ui/Button';
import { Card, CardTitulo } from '@/shared/ui/Pagina';

export const COR_SERIE = '#2e7d32';
const COR_MELHOR = '#1b5e20';
const COR_QUEDA = '#a23b36';
const COR_GRADE = '#eef1f5';
const EIXO = { fontSize: 11, fill: '#64748b' };
const LIMITE_ROTULOS = 14;
const QTD_PARTICIPACAO = 10;
const VARIACAO_NULA = 0.0005;

export interface FormatosMetrica {
    ehValor: boolean;
    fmtM: (valor: number) => string;
    fmtEixo: (valor: number) => string;
    regras: RegrasCalculo;
}

/** Seta e variação com cor de sinal; nunca só a cor. */
export function Delta({ valor }: { valor?: number | null }) {
    if (valor === null || valor === undefined || !Number.isFinite(valor)) return <span className="font-semibold text-muted">-</span>;
    const nulo = Math.abs(valor) < VARIACAO_NULA;
    let seta = '■';
    if (valor > 0) seta = '▲';
    else if (valor < 0) seta = '▼';
    return <span className={cn('font-semibold whitespace-nowrap tabular-nums', nulo && 'text-text-2', !nulo && valor > 0 && 'text-pine', !nulo && valor < 0 && 'text-danger')}>{seta} {fmtVar(valor)}</span>;
}

function Dica({ titulo, children }: { titulo: ReactNode; children: ReactNode }) {
    return (
        <div className="rounded-lg border border-solid border-line bg-white px-3 py-2 text-xs shadow-pop">
            <b className="mb-1 block text-ink">{titulo}</b>
            {children}
        </div>
    );
}

export const LinhaDica = ({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) => (
    <div className="flex justify-between gap-4 text-text">
        <span>{cor && <i className="mr-1.5 inline-block size-2 rounded-full" style={{ background: cor }} />}{rotulo}</span>
        <span className="font-semibold tabular-nums">{valor}</span>
    </div>
);

export { Dica };

const Kpi = ({ rotulo, ajuda, destaque, children, detalhe }: { rotulo: string; ajuda: string; destaque?: boolean; children: ReactNode; detalhe: ReactNode }) => (
    <Card className={cn(destaque && 'bg-pine-800')}>
        <BalaoAjuda texto={ajuda} claro={destaque} className="relative h-full px-4 py-3.5" classeIcone="absolute top-2.5 right-2.5">
            <p className={cn('m-0 mb-1 pr-4 text-xs', destaque ? 'text-sage-300' : 'text-text-2')}>{rotulo}</p>
            <strong className={cn('block text-[19px] leading-tight font-bold tabular-nums', destaque ? 'text-white' : 'text-ink')}>{children}</strong>
            <small className={cn('text-[11.5px]', destaque ? 'text-sage-300' : 'text-text-2')}>{detalhe}</small>
        </BalaoAjuda>
    </Card>
);

export function Indicadores({ m, f }: { m: Consolidado; f: FormatosMetrica }) {
    const anterior = m.serie[m.serie.length - 2];
    return (
        <div className="mb-3.5 grid grid-cols-6 gap-3">
            <Kpi destaque ajuda={f.regras.periodo} rotulo={f.ehValor ? 'Faturamento no período' : 'Produção no período'} detalhe={`${rotComp(m.primeira)} a ${rotComp(m.ultima)} · ${m.nMeses} competência(s)${f.ehValor ? '' : ` · ${fmtMoeda(m.totalVl)} SIGTAP`}`}>{f.fmtM(m.total)}</Kpi>
            <Kpi ajuda={f.regras.ultima} rotulo={`Última competência · ${rotComp(m.ultima)}`} detalhe={<><Delta valor={m.ult.varP} /> vs {m.penultima ? rotComp(m.penultima) : '-'}</>}>{f.fmtM(m.ult.v)}</Kpi>
            <Kpi ajuda={f.regras.media} rotulo="Média mensal" detalhe={<>Último mês vs média 3m <Delta valor={m.vsMedia} /></>}>{f.fmtM(m.media)}</Kpi>
            <Kpi ajuda={f.regras.crescimento} rotulo="Crescimento no período" detalhe={`${rotComp(m.primeira)} ${f.fmtEixo(m.serie[0]?.v ?? 0)} → ${rotComp(m.ultima)} ${f.fmtEixo(m.ult.v)}`}><Delta valor={m.crescimento} /></Kpi>
            <Kpi ajuda={f.regras.melhorPior} rotulo="Melhor / pior mês" detalhe={`Pior: ${rotComp(m.menor.c)} · ${f.fmtEixo(m.menor.v)}`}>{rotComp(m.maior.c)} <em className="text-[13px] font-medium text-text-2 not-italic">{f.fmtEixo(m.maior.v)}</em></Kpi>
            {m.internacoes > 0
                ? <Kpi ajuda={f.regras.internacoes} rotulo="Internações (AIHs)" detalhe={<>{fmtNum(m.ult.aih)} em {rotComp(m.ultima)} <Delta valor={anterior ? varPerc(m.ult.aih, anterior.aih) : null} /></>}>{fmtNum(m.internacoes)}</Kpi>
                : <Kpi ajuda={m.pacientes ? f.regras.pacientes : f.regras.procedimentos} rotulo={m.pacientes ?'Pacientes atendidos (BPA-I)' : 'Procedimentos distintos'} detalhe={m.pacientes ? `Soma mensal · ${fmtNum(m.ult.pac)} em ${rotComp(m.ultima)}` : `${fmtNum(m.totalQt)} procedimentos realizados`}>{fmtNum(m.pacientes || m.listaProcs.length)}</Kpi>}
        </div>
    );
}

export function GraficosEvolucao({ m, f }: { m: Consolidado; f: FormatosMetrica }) {
    const [acumulado, setAcumulado] = useState(false);
    const larguraEixo = f.ehValor ? 78 : 56;

    return (
        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
            <Card>
                <CardTitulo
                    titulo="Evolução mês a mês"
                    ajuda={f.regras.evolucao}
                    extra={(
                        <div className="flex gap-1">
                            <Button size="sm" variant={acumulado ? 'ghost' : 'secondary'} onClick={() => setAcumulado(false)}>Mensal</Button>
                            <Button size="sm" variant={acumulado ? 'secondary' : 'ghost'} onClick={() => setAcumulado(true)}>Acumulado</Button>
                        </div>
                    )}
                />
                <div className="h-[280px] px-3 pt-3">
                    <ResponsiveContainer>
                        <BarChart data={m.serie} margin={{ top: 22, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
                            <CartesianGrid vertical={false} stroke={COR_GRADE} />
                            <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tick={EIXO} />
                            <YAxis tickFormatter={f.fmtEixo} width={larguraEixo} tickLine={false} axisLine={false} tick={EIXO} />
                            <Tooltip
                                cursor={{ fill: 'rgba(46,125,50,.07)' }}
                                content={({ active, payload, label }) => {
                                    const item = payload?.[0]?.payload as Consolidado['serie'][number] | undefined;
                                    if (!active || !item) return null;
                                    return (
                                        <Dica titulo={`${label}${item.sem ? ' · sem lançamento' : ''}`}>
                                            <LinhaDica rotulo="Quantidade" valor={fmtNum(item.qt)} />
                                            <LinhaDica rotulo="Valor SIGTAP" valor={fmtMoeda(item.vl)} />
                                            <LinhaDica rotulo="Variação" valor={item.varV === null ? '-' : `${comSinal(item.varV, f.fmtM)} (${fmtVar(item.varP)})`} />
                                            <LinhaDica rotulo="Acumulado" valor={f.fmtM(item.acum)} />
                                            {item.uni > 1 && <LinhaDica rotulo="Unidades" valor={String(item.uni)} />}
                                        </Dica>
                                    );
                                }}
                            />
                            <Bar dataKey={acumulado ? 'acum' : 'v'} fill={COR_SERIE} radius={[4, 4, 0, 0]} maxBarSize={46} label={m.serie.length <= LIMITE_ROTULOS ? { position: 'top', fontSize: 10, fill: '#64748b', formatter: (valor: unknown) => f.fmtEixo(Number(valor)) } : false}>
                                {m.serie.map((item) => <Cell key={item.c} fill={!acumulado && item.c === m.maior.c ? COR_MELHOR : COR_SERIE} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
            <Card>
                <CardTitulo titulo="Variação vs mês anterior" ajuda={f.regras.variacao} />
                <div className="h-[280px] px-3 pt-3">
                    <ResponsiveContainer>
                        <BarChart data={m.serie.slice(1)} margin={{ top: 10, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
                            <CartesianGrid vertical={false} stroke={COR_GRADE} />
                            <XAxis dataKey="rot" tickLine={false} axisLine={false} tick={EIXO} />
                            <YAxis tickFormatter={f.fmtEixo} width={larguraEixo} tickLine={false} axisLine={false} tick={EIXO} />
                            <ReferenceLine y={0} stroke="#94a3b8" />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,.04)' }}
                                content={({ active, payload, label }) => {
                                    const item = payload?.[0]?.payload as Consolidado['serie'][number] | undefined;
                                    if (!active || !item) return null;
                                    return <Dica titulo={label}><LinhaDica rotulo="Variação" valor={comSinal(item.varV ?? 0, f.fmtM)} /><LinhaDica rotulo="Percentual" valor={fmtVar(item.varP)} /></Dica>;
                                }}
                            />
                            <Bar dataKey="varV" radius={[4, 4, 4, 4]} maxBarSize={40}>
                                {m.serie.slice(1).map((item) => <Cell key={item.c} fill={(item.varV ?? 0) >= 0 ? COR_SERIE : COR_QUEDA} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
        </div>
    );
}

export function GraficosGrupos({ m, f }: { m: Consolidado; f: FormatosMetrica }) {
    return (
        <div className="mb-3.5 grid grid-cols-2 gap-3.5">
            <Card>
                <CardTitulo titulo="Por grupo de procedimento" ajuda={f.regras.grupos} />
                <div className="h-[340px] px-3 pt-3">
                    <ResponsiveContainer>
                        <BarChart data={m.serieGrupos} margin={{ top: 8, right: 8, left: 4, bottom: 8 }} barCategoryGap="22%">
                            <CartesianGrid vertical={false} stroke={COR_GRADE} />
                            <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tick={EIXO} />
                            <YAxis tickFormatter={f.fmtEixo} width={f.ehValor ? 78 : 56} tickLine={false} axisLine={false} tick={EIXO} />
                            <Tooltip
                                cursor={{ fill: 'rgba(0,0,0,.04)' }}
                                content={({ active, payload, label }) => {
                                    if (!active || !payload?.length) return null;
                                    const total = payload.reduce((soma, item) => soma + (Number(item.value) || 0), 0);
                                    return (
                                        <Dica titulo={label}>
                                            {[...payload].reverse().filter((item) => item.value).map((item) => <LinhaDica key={String(item.dataKey)} rotulo={String(item.name)} valor={f.fmtM(Number(item.value))} cor={item.color} />)}
                                            <div className="mt-1 border-0 border-t border-solid border-line pt-1"><LinhaDica rotulo="Total" valor={f.fmtM(total)} /></div>
                                        </Dica>
                                    );
                                }}
                            />
                            {m.topGrupos.map((grupo) => <Bar key={grupo.cod} dataKey={grupo.cod} name={`${grupo.cod} ${grupo.nome}`} stackId="g" fill={m.corGrupo[grupo.cod]} stroke="#fff" strokeWidth={1} maxBarSize={46} />)}
                            {m.outros.length > 0 && <Bar dataKey="outros" name="Outros grupos" stackId="g" fill={COR_OUTROS} stroke="#fff" strokeWidth={1} maxBarSize={46} />}
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>
            <Card>
                <CardTitulo titulo="Participação no período" ajuda={f.regras.participacao} />
                <div className="flex max-h-[352px] flex-col gap-2.5 overflow-y-auto p-[18px]">
                    {m.gruposOrd.slice(0, QTD_PARTICIPACAO).map((grupo) => {
                        const parte = m.total ? grupo.total / m.total : 0;
                        const cor = m.corGrupo[grupo.cod] ?? COR_OUTROS;
                        return (
                            <div key={grupo.cod} title={`${grupo.cod} - ${grupo.nome}`}>
                                <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                                    <span className="flex min-w-0 items-center gap-1.5"><i className="size-2 shrink-0 rounded-full" style={{ background: cor }} /><span className="truncate"><b className="font-mono">{grupo.cod}</b> {grupo.nome}</span></span>
                                    <span className="flex shrink-0 gap-2 tabular-nums"><b>{fmtPart(parte)}</b><span className="text-text-2">{f.fmtEixo(grupo.total)}</span>{m.penultima && <Delta valor={varPerc(grupo.v[m.ultima] ?? 0, grupo.v[m.penultima] ?? 0)} />}</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-line-2"><span className="block h-full rounded-full" style={{ width: `${Math.max(parte * 100, 0.6)}%`, background: cor }} /></div>
                            </div>
                        );
                    })}
                    {m.gruposOrd.length > QTD_PARTICIPACAO && <small className="text-xs text-text-2">+ {m.gruposOrd.length - QTD_PARTICIPACAO} grupo(s) com menor participação</small>}
                    {!m.gruposOrd.length && <p className="m-0 text-[13px] text-text-2">Sem {f.ehValor ? 'valor' : 'quantidade'} no período.</p>}
                </div>
            </Card>
        </div>
    );
}
