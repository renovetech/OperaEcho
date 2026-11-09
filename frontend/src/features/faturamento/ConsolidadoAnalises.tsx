/* Onde trabalhar, análise do procedimento, ranking, unidades e categorias profissionais. */
import { useMemo, useState, type ReactNode, type Ref } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Icon from '@/shared/ui/Icon';
import { COR_SERIE, Delta, Dica, LinhaDica, type FormatosMetrica } from '@/features/faturamento/ConsolidadoGraficos';
import { comSinal, fmtPart, rotComp, varPerc, type Consolidado, type ProcedimentoConsolidado } from '@/features/faturamento/consolidacao';
import { fmtMoeda, fmtNum, fmtProc } from '@/features/sigtap/formatos';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';
import { Input, Select } from '@/shared/ui/Campos';
import { Card, CardTitulo } from '@/shared/ui/Pagina';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const QTD_RANKING = 15;
const QTD_PARARAM = 6;
const QTD_SEM_ENVIO = 8;
const QTD_CBOS = 12;
const COR_CALOR = [46, 125, 50];

const corVariacao = (valor: number) => {
    if (valor > 0) return 'text-pine';
    return valor < 0 ? 'text-danger' : '';
};

const SeloNovo = () => <span className="inline-block rounded-full bg-tint px-2 py-px text-[11px] font-bold text-pine-800">NOVO</span>;

function ItemFoco({ nome, valor, detalhe, corValor, aoClicar }: { nome: string; valor?: string; detalhe: string; corValor?: string; aoClicar?: () => void }) {
    const conteudo = (
        <>
            <span className="flex justify-between gap-2 text-[13px]"><span className="min-w-0 truncate text-ink" title={nome}>{nome}</span>{valor && <b className={cn('shrink-0 tabular-nums', corValor)}>{valor}</b>}</span>
            <small className="block text-[11.5px] text-text-2 tabular-nums">{detalhe}</small>
        </>
    );
    if (!aoClicar) return <div className="rounded-md px-2 py-1.5">{conteudo}</div>;
    return <button type="button" onClick={aoClicar} className="block w-full cursor-pointer rounded-md border-0 bg-transparent px-2 py-1.5 text-left font-sans hover:bg-surface-2">{conteudo}</button>;
}

const ColunaFoco = ({ titulo, cor, children }: { titulo: ReactNode; cor: string; children: ReactNode }) => (
    <div className="min-w-0">
        <h3 className={cn('m-0 mb-1.5 px-2 text-[13px] font-semibold', cor)}>{titulo}</h3>
        {children}
    </div>
);

const Vazio = ({ children }: { children: ReactNode }) => <p className="m-0 px-2 text-[13px] text-text-2">{children}</p>;

export function OndeTrabalhar({ m, f, aoSelecionar }: { m: Consolidado; f: FormatosMetrica; aoSelecionar: (cod: string) => void }) {
    const { penultima, ultima } = m;
    if (!penultima) return null;
    const variacao = (item: ProcedimentoConsolidado) => `${f.fmtM(item.v[penultima] ?? 0)} → ${f.fmtM(item.v[ultima] ?? 0)}`;
    const comUnidades = m.listaUnis.length > 1;

    return (
        <Card className="mb-3.5">
            <CardTitulo titulo={`Onde trabalhar: ${rotComp(ultima)} comparado a ${rotComp(penultima)}`} ajuda={f.regras.ondeTrabalhar} />
            <div className={cn('grid gap-3 p-3', comUnidades ? 'grid-cols-4' : 'grid-cols-3')}>
                <ColunaFoco titulo="▼ Maiores quedas" cor="text-danger">
                    {!m.quedas.length && <Vazio>Nenhum procedimento caiu.</Vazio>}
                    {m.quedas.map((item) => <ItemFoco key={item.cod} nome={item.nome} valor={comSinal(item.varUlt, f.fmtM)} corValor="text-danger" detalhe={variacao(item)} aoClicar={() => aoSelecionar(item.cod)} />)}
                </ColunaFoco>
                <ColunaFoco titulo="▲ Maiores altas" cor="text-pine">
                    {!m.altas.length && <Vazio>Nenhum procedimento cresceu.</Vazio>}
                    {m.altas.map((item) => <ItemFoco key={item.cod} nome={item.nome} valor={comSinal(item.varUlt, f.fmtM)} corValor="text-pine" detalhe={variacao(item)} aoClicar={() => aoSelecionar(item.cod)} />)}
                </ColunaFoco>
                <ColunaFoco titulo={<><Icon n="alert" /> Deixaram de ser apresentados</>} cor="text-brass">
                    {!m.pararam.length && <Vazio>Tudo o que foi apresentado em {rotComp(penultima)} seguiu em {rotComp(ultima)}.</Vazio>}
                    {m.pararam.slice(0, QTD_PARARAM).map((item) => <ItemFoco key={item.cod} nome={item.nome} valor={f.fmtM(item.v[penultima] ?? 0)} detalhe={`em ${rotComp(penultima)} · zero em ${rotComp(ultima)}`} aoClicar={() => aoSelecionar(item.cod)} />)}
                    {m.pararam.length > QTD_PARARAM && <small className="block px-2 text-xs text-text-2">+ {m.pararam.length - QTD_PARARAM} procedimento(s)</small>}
                    {m.novos.length > 0 && <p className="m-0 mt-1.5 px-2 text-xs text-pine-800"><b>{m.novos.length}</b> procedimento(s) novo(s) em {rotComp(ultima)}.</p>}
                </ColunaFoco>
                {comUnidades && (
                    <ColunaFoco titulo={<><Icon n="building" /> Unidades sem envio em {rotComp(ultima)}</>} cor="text-brass">
                        {!m.semEnvio.length && <Vazio>Todas as unidades enviaram.</Vazio>}
                        {m.semEnvio.slice(0, QTD_SEM_ENVIO).map((unidade) => <ItemFoco key={unidade.id} nome={unidade.nome} detalhe={unidade.projeto} />)}
                    </ColunaFoco>
                )}
            </div>
        </Card>
    );
}

interface AnaliseProps {
    m: Consolidado;
    f: FormatosMetrica;
    procedimento: ProcedimentoConsolidado;
    nomeGrupo?: string;
    aoSelecionar: (cod: string) => void;
    referencia: Ref<HTMLDivElement>;
}

export function AnaliseProcedimento({ m, f, procedimento: p, nomeGrupo, aoSelecionar, referencia }: AnaliseProps) {
    const ordenados = useMemo(() => [...m.listaProcs].sort((a, b) => b.total - a.total), [m.listaProcs]);
    const linhas = m.comps.reduce<{ c: string; v: number; anterior: number | null; acumulado: number }[]>((lista, c, indice) => {
        const v = p.v[c] ?? 0;
        const anteriorComp = indice ? m.comps[indice - 1] : undefined;
        return [...lista, { c, v, anterior: anteriorComp ? (p.v[anteriorComp] ?? 0) : null, acumulado: (lista[lista.length - 1]?.acumulado ?? 0) + v }];
    }, []);

    return (
        <div ref={referencia} className="mb-3.5 scroll-mt-3">
            <Card>
                <CardTitulo
                    titulo="Análise do procedimento"
                    ajuda={f.regras.analise}
                    extra={(
                        <Select aria-label="Procedimento" className="w-[420px] py-1.5" value={p.cod} onChange={(e) => aoSelecionar(e.target.value)}>
                            {ordenados.map((item) => <option key={item.cod} value={item.cod}>{item.cod} - {item.nome}</option>)}
                        </Select>
                    )}
                />
                <div className="grid grid-cols-[auto_2fr_2fr_auto_auto] gap-x-6 gap-y-2 border-b border-line-2 px-[18px] py-3 text-[13px]">
                    <div><small className="block text-xs text-text-2">Código</small><b className="font-mono">{fmtProc(p.cod)}</b></div>
                    <div><small className="block text-xs text-text-2">Descrição</small><b className="font-semibold">{p.nome}</b></div>
                    <div><small className="block text-xs text-text-2">Grupo</small><b className="font-semibold">{p.grupo} - {nomeGrupo ?? '-'}</b></div>
                    <div><small className="block text-xs text-text-2">Quantidade / valor</small><b className="tabular-nums">{fmtNum(p.totalQt)} · {fmtMoeda(p.totalVl)}</b></div>
                    <div><small className="block text-xs text-text-2">Participação</small><b className="tabular-nums">{fmtPart(p.part)}</b></div>
                </div>
                <div className="grid grid-cols-[2fr_3fr] items-start gap-3.5 p-3.5">
                    <div className="h-[260px]">
                        <ResponsiveContainer>
                            <LineChart data={m.comps.map((c) => ({ rot: rotComp(c), v: p.v[c] ?? 0 }))} margin={{ top: 14, right: 14, left: 0, bottom: 0 }}>
                                <CartesianGrid vertical={false} stroke="#eef1f5" />
                                <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: '#e5e7eb' }} tick={{ fontSize: 11, fill: '#64748b' }} />
                                <YAxis tickFormatter={f.fmtEixo} width={f.ehValor ? 72 : 52} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={f.ehValor} />
                                <Tooltip content={({ active, payload, label }) => (active && payload?.length ? <Dica titulo={label}><LinhaDica rotulo={f.ehValor ? 'Valor' : 'Quantidade'} valor={f.fmtM(Number(payload[0]?.value))} /></Dica> : null)} />
                                <Line type="monotone" dataKey="v" stroke={COR_SERIE} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="max-h-[260px] overflow-y-auto">
                        <Tabela cabecalho={<><Th>Comp.</Th><Th className="text-right">Qtd</Th><Th className="text-right">Valor</Th><Th className="text-right">Var.</Th><Th className="text-right">Var. %</Th><Th className="text-right">Acumulado</Th></>}>
                            {linhas.map(({ c, v, anterior, acumulado }) => (
                                <tr key={c}>
                                    <Td className="py-1.5 tabular-nums">{rotComp(c)}</Td>
                                    <Td className="py-1.5 text-right tabular-nums">{fmtNum(p.qt[c] ?? 0)}</Td>
                                    <Td className="py-1.5 text-right whitespace-nowrap tabular-nums">{fmtMoeda(p.vl[c] ?? 0)}</Td>
                                    <Td className={cn('py-1.5 text-right whitespace-nowrap tabular-nums', anterior !== null && corVariacao(v - anterior))}>{anterior === null ? '-' : comSinal(v - anterior, f.fmtM)}</Td>
                                    <Td className="py-1.5 text-right">
                                        {anterior === null && '-'}
                                        {anterior === 0 && (v ? <SeloNovo /> : '-')}
                                        {Boolean(anterior) && <Delta valor={varPerc(v, anterior)} />}
                                    </Td>
                                    <Td className="py-1.5 text-right whitespace-nowrap tabular-nums">{f.fmtM(acumulado)}</Td>
                                </tr>
                            ))}
                        </Tabela>
                    </div>
                </div>
            </Card>
        </div>
    );
}

function Tendencia({ valores }: { valores: number[] }) {
    const maximo = Math.max(...valores, 0);
    if (!maximo) return <svg viewBox="0 0 80 24" className="h-6 w-20" aria-hidden="true"><line x1="0" y1="22" x2="80" y2="22" stroke="#cbd5e1" /></svg>;
    const passo = valores.length > 1 ? 80 / (valores.length - 1) : 0;
    const altura = (valor: number) => 22 - (valor / maximo) * 19;
    const pontos = valores.map((valor, indice) => `${(indice * passo).toFixed(1)},${altura(valor).toFixed(1)}`).join(' ');
    const ultimo = valores.length - 1;
    return (
        <svg viewBox="-2 0 84 24" className="h-6 w-20" aria-hidden="true">
            <polyline points={pontos} fill="none" stroke={COR_SERIE} strokeWidth="1.5" />
            <circle cx={ultimo * passo} cy={altura(valores[ultimo] ?? 0)} r="2.4" fill={COR_SERIE} />
        </svg>
    );
}

type CampoOrdem = 'total' | 'var' | 'periodo' | 'nome';
interface Ordem { campo: CampoOrdem; desc: boolean }

function TituloOrdenavel({ campo, ordem, direita, aoOrdenar, children }: { campo: CampoOrdem; ordem: Ordem; direita?: boolean; aoOrdenar: (campo: CampoOrdem) => void; children: ReactNode }) {
    const ativo = ordem.campo === campo;
    let seta = '';
    let sentido: 'ascending' | 'descending' | undefined;
    if (ativo) {
        seta = ordem.desc ? ' ▼' : ' ▲';
        sentido = ordem.desc ? 'descending' : 'ascending';
    }
    return (
        <Th className={direita ? 'text-right' : undefined} aria-sort={sentido}>
            <button type="button" onClick={() => aoOrdenar(campo)} className="cursor-pointer border-0 bg-transparent p-0 font-sans text-[inherit] font-[inherit] text-inherit uppercase">{children}{seta}</button>
        </Th>
    );
}

export function RankingProcedimentos({ m, f, selecionado, aoSelecionar }: { m: Consolidado; f: FormatosMetrica; selecionado?: string; aoSelecionar: (cod: string) => void }) {
    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState<Ordem>({ campo: 'total', desc: true });
    const [verTodos, setVerTodos] = useState(false);

    const ranking = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        const digitos = termo.replace(/\D/g, '');
        const valorDe = (item: ProcedimentoConsolidado) => ({ total: item.total, var: item.varUlt, periodo: item.varPeriodo ?? -Infinity, nome: 0 })[ordem.campo];
        return m.listaProcs
            .filter((item) => !termo || item.nome.toLowerCase().includes(termo) || (digitos.length >= 2 && item.cod.includes(digitos)))
            .sort((a, b) => {
                const resultado = ordem.campo === 'nome' ? a.nome.localeCompare(b.nome) : valorDe(a) - valorDe(b);
                return ordem.desc ? -resultado : resultado;
            });
    }, [m.listaProcs, busca, ordem]);

    const ordenar = (campo: CampoOrdem) => setOrdem((atual) => ({ campo, desc: atual.campo === campo ? !atual.desc : campo !== 'nome' }));
    const titulo = (campo: CampoOrdem, rotulo: ReactNode, direita?: boolean) => <TituloOrdenavel campo={campo} ordem={ordem} direita={direita} aoOrdenar={ordenar}>{rotulo}</TituloOrdenavel>;

    return (
        <Card className="mb-3.5">
            <CardTitulo titulo="Ranking de procedimentos" ajuda={f.regras.ranking} extra={<Input aria-label="Buscar código ou nome" className="w-72 py-1.5" placeholder="Buscar código ou nome..." value={busca} onChange={(e) => setBusca(e.target.value)} />} />
            <div className="p-3.5">
                <Tabela cabecalho={(
                    <>
                        <Th>#</Th>
                        {titulo('nome', 'Procedimento')}
                        <Th>Tendência</Th>
                        {titulo('total', f.ehValor ? 'Valor' : 'Quantidade', true)}
                        <Th className="text-right">Part.</Th>
                        {titulo('var', m.penultima ? `${rotComp(m.penultima)} → ${rotComp(m.ultima)}` : 'Var.', true)}
                        {titulo('periodo', 'Período', true)}
                    </>
                )}>
                    {!ranking.length && <LinhaVazia colunas={7}>Nenhum procedimento encontrado.</LinhaVazia>}
                    {ranking.slice(0, verTodos ? ranking.length : QTD_RANKING).map((item, indice) => (
                        <tr key={item.cod} tabIndex={0} onClick={() => aoSelecionar(item.cod)} onKeyDown={(e) => { if (e.key === 'Enter') aoSelecionar(item.cod); }} className={cn('cursor-pointer', selecionado === item.cod && 'bg-tint')}>
                            <Td className="text-text-2 tabular-nums">{indice + 1}</Td>
                            <Td><b className="font-medium">{item.nome}</b><small className="block font-mono text-xs text-text-2">{fmtProc(item.cod)} · {item.meses}/{m.comps.length} meses</small></Td>
                            <Td><Tendencia valores={m.comps.map((c) => item.v[c] ?? 0)} /></Td>
                            <Td className="text-right font-semibold whitespace-nowrap tabular-nums">{f.fmtM(item.total)}</Td>
                            <Td className="text-right tabular-nums">{fmtPart(item.part)}</Td>
                            <Td className={cn('text-right whitespace-nowrap tabular-nums', corVariacao(item.varUlt))}>{m.penultima ? comSinal(item.varUlt, f.fmtM) : '-'}</Td>
                            <Td className="text-right">{(item.v[m.primeira] ?? 0) === 0 && (item.v[m.ultima] ?? 0) > 0 ? <SeloNovo /> : <Delta valor={item.varPeriodo} />}</Td>
                        </tr>
                    ))}
                </Tabela>
                {ranking.length > QTD_RANKING && <Button variant="secondary" size="sm" className="mt-3" onClick={() => setVerTodos(!verTodos)}>{verTodos ? `Mostrar só os ${QTD_RANKING} primeiros` : `Ver todos os ${ranking.length} procedimentos`}</Button>}
            </div>
        </Card>
    );
}

/** Mapa de calor: raiz para as unidades menores também aparecerem. */
function estiloCelula(valor: number, maximo: number) {
    const intensidade = Math.sqrt(valor / maximo);
    const peso = (8 + intensidade * 82) / 100;
    const canal = (cor: number) => Math.round(cor * peso + 255 * (1 - peso));
    return { background: `rgb(${COR_CALOR.map(canal).join(',')})`, color: intensidade > 0.55 ? '#fff' : '#1e293b' };
}

export function UnidadesPorCompetencia({ m, f }: { m: Consolidado; f: FormatosMetrica }) {
    if (m.listaUnis.length <= 1) return null;
    return (
        <Card className="mb-3.5">
            <CardTitulo titulo="Unidade × competência" ajuda={f.regras.unidades} />
            <div className="overflow-x-auto p-3.5">
                <table className="w-full border-separate border-spacing-0.5 text-xs">
                    <thead>
                        <tr>
                            <th className="bg-transparent px-2 py-1 text-left font-semibold text-text-2">Unidade</th>
                            {m.comps.map((c) => <th key={c} className="bg-transparent px-1 py-1 text-center font-semibold whitespace-nowrap text-text-2">{rotComp(c)}</th>)}
                            <th className="bg-transparent px-2 py-1 text-right font-semibold text-text-2">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {m.listaUnis.map((unidade) => (
                            <tr key={unidade.id} className="hover:bg-transparent">
                                <td className="min-w-[220px] px-2 py-1"><b className="font-medium text-ink">{unidade.nome}</b><small className="block text-[11px] text-text-2">{unidade.projeto}</small></td>
                                {m.comps.map((c) => {
                                    const valor = unidade.v[c];
                                    if (valor === undefined) return <td key={c} title={`${unidade.nome} · ${rotComp(c)}: sem lançamento`} className="rounded bg-surface-2 px-1 py-1.5 text-center text-muted">-</td>;
                                    return <td key={c} title={`${unidade.nome} · ${rotComp(c)}: ${fmtNum(unidade.qt[c] ?? 0)} proc. · ${fmtMoeda(unidade.vl[c] ?? 0)}`} style={estiloCelula(valor, m.maxCelula)} className="rounded px-1 py-1.5 text-center whitespace-nowrap tabular-nums">{f.fmtEixo(valor).replace('R$ ', '')}</td>;
                                })}
                                <td className="px-2 py-1 text-right font-semibold whitespace-nowrap tabular-nums">{f.fmtEixo(unidade.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </Card>
    );
}

export function CategoriasProfissionais({ m, f }: { m: Consolidado; f: FormatosMetrica }) {
    const maior = m.listaCbos[0]?.total ?? 1;
    if (!m.listaCbos.length) return null;
    return (
        <Card className="mb-3.5">
            <CardTitulo titulo="Por categoria profissional (CBO)" ajuda={f.regras.cbos} />
            <div className="grid grid-cols-3 gap-x-6 gap-y-3 p-[18px]">
                {m.listaCbos.slice(0, QTD_CBOS).map((cbo) => (
                    <div key={cbo.cod} className="min-w-0">
                        <div className="flex justify-between gap-2 text-[13px]"><span className="truncate text-ink" title={cbo.nome}>{cbo.nome}</span><small className="shrink-0 font-mono text-xs text-text-2">{cbo.cod}</small></div>
                        <div className="my-1 h-1.5 overflow-hidden rounded-full bg-line-2"><span className="block h-full rounded-full" style={{ width: `${Math.max((cbo.total / maior) * 100, 0.8)}%`, background: COR_SERIE }} /></div>
                        <div className="flex gap-2 text-xs tabular-nums"><b>{f.fmtM(cbo.total)}</b><span className="text-text-2">{f.ehValor ? `${fmtNum(cbo.totalQt)} proc.` : fmtMoeda(cbo.totalVl)}</span>{m.penultima && <Delta valor={varPerc(cbo.v[m.ultima] ?? 0, cbo.v[m.penultima] ?? 0)} />}</div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
