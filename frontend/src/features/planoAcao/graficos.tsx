/* Gráficos do painel em SVG e CSS, sem dependências. */
import type { LinhaPainel, PontoCurva, PrazoPainel } from '@/features/planoAcao/api';
import { COR_STATUS_ITEM, dataBR } from '@/features/planoAcao/formatos';
import { cn } from '@/shared/lib';

const Vazio = ({ children }: { children: string }) => <p className="m-0 p-5 text-center text-[13px] text-text-2">{children}</p>;

const RAIO = 54;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;
const COR_PREVISTO = '#9C7A3C';
const COR_REALIZADO = '#2E7D32';
const COR_GRADE = '#EDECE5';

export function Rosca({ dados, total }: { dados: { nome: string; total: number }[]; total: number }) {
    const fatias = dados.filter((item) => item.total > 0).reduce<{ nome: string; total: number; inicio: number; tamanho: number }[]>((lista, item) => {
        const anterior = lista[lista.length - 1];
        const tamanho = (item.total / (total || 1)) * CIRCUNFERENCIA;
        return [...lista, { ...item, tamanho, inicio: anterior ? anterior.inicio + anterior.tamanho : 0 }];
    }, []);

    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 140 140" role="img" aria-label="Distribuição por situação" className="w-36 shrink-0">
                <circle cx="70" cy="70" r={RAIO} fill="none" stroke={COR_GRADE} strokeWidth="18" />
                {fatias.map((fatia) => (
                    <circle key={fatia.nome} cx="70" cy="70" r={RAIO} fill="none" stroke={COR_STATUS_ITEM[fatia.nome] ?? '#999'} strokeWidth="18" strokeDasharray={`${fatia.tamanho} ${CIRCUNFERENCIA - fatia.tamanho}`} strokeDashoffset={-fatia.inicio} transform="rotate(-90 70 70)">
                        <title>{`${fatia.nome}: ${fatia.total}`}</title>
                    </circle>
                ))}
                <text x="70" y="68" textAnchor="middle" className="fill-ink text-[22px] font-bold">{total}</text>
                <text x="70" y="86" textAnchor="middle" className="fill-text-2 text-[11px]">ações</text>
            </svg>
            <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-1.5 p-0 text-[13px]">
                {dados.map((item) => (
                    <li key={item.nome} className="flex items-center gap-2">
                        <span className="size-2.5 shrink-0 rounded-full" style={{ background: COR_STATUS_ITEM[item.nome] }} />
                        <span className="flex-1">{item.nome}</span>
                        <b className="tabular-nums">{item.total}</b>
                        <small className="w-9 text-right text-xs text-text-2 tabular-nums">{total ? Math.round((item.total / total) * 100) : 0}%</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}

const LARGURA = 520;
const ALTURA = 210;
const MARGEM = { esquerda: 34, base: 26, topo: 10, direita: 24 };

export function CurvaS({ pontos }: { pontos?: PontoCurva[] }) {
    const ultimo = pontos?.[pontos.length - 1];
    if (!pontos || !ultimo) return <Vazio>Sem dados de prazo.</Vazio>;
    const areaX = LARGURA - MARGEM.esquerda - MARGEM.direita;
    const areaY = ALTURA - MARGEM.topo - MARGEM.base;
    const x = (indice: number) => MARGEM.esquerda + (pontos.length === 1 ? areaX / 2 : (indice * areaX) / (pontos.length - 1));
    const y = (valor: number) => MARGEM.topo + areaY - (Math.max(0, Math.min(100, valor)) / 100) * areaY;
    const linha = (campo: 'acum_previsto' | 'acum_realizado') => pontos.map((ponto, indice) => `${x(indice)},${y(ponto[campo])}`).join(' ');

    return (
        <div>
            <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label="Curva S: previsto x realizado acumulado" className="w-full">
                {[0, 25, 50, 75, 100].map((valor) => (
                    <g key={valor}>
                        <line x1={MARGEM.esquerda} x2={LARGURA - MARGEM.direita} y1={y(valor)} y2={y(valor)} stroke={COR_GRADE} />
                        <text x={MARGEM.esquerda - 6} y={y(valor) + 3} textAnchor="end" className="fill-text-2 text-[10px]">{valor}%</text>
                    </g>
                ))}
                {pontos.map((ponto, indice) => (indice % 2 === 0 || indice === pontos.length - 1) && (
                    <text key={ponto.semana} x={x(indice)} y={ALTURA - 8} textAnchor="middle" className="fill-text-2 text-[10px]">{ponto.semana.slice(8, 10)}/{ponto.semana.slice(5, 7)}</text>
                ))}
                <polyline points={linha('acum_previsto')} fill="none" stroke={COR_PREVISTO} strokeWidth="2.2" strokeDasharray="5 4" />
                <polyline points={linha('acum_realizado')} fill="none" stroke={COR_REALIZADO} strokeWidth="2.6" />
                {pontos.map((ponto, indice) => (
                    <circle key={ponto.semana} cx={x(indice)} cy={y(ponto.acum_realizado)} r="3" fill={COR_REALIZADO}>
                        <title>{`Semana ${dataBR(ponto.semana)} - previsto ${ponto.acum_previsto}% · realizado ${ponto.acum_realizado}% · concluídas ${ponto.concluidos}`}</title>
                    </circle>
                ))}
            </svg>
            <div className="mt-1 flex justify-center gap-5 text-xs text-text">
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: COR_PREVISTO }} /> Previsto acumulado <b>{ultimo.acum_previsto}%</b></span>
                <span className="inline-flex items-center gap-1.5"><i className="inline-block h-0.5 w-4" style={{ background: COR_REALIZADO }} /> Realizado acumulado <b>{ultimo.acum_realizado}%</b></span>
            </div>
        </div>
    );
}

export function Barras({ dados, maximo = 10, vazio = 'Sem dados.' }: { dados?: LinhaPainel[]; maximo?: number; vazio?: string }) {
    const lista = (dados ?? []).slice(0, maximo);
    if (!lista.length) return <Vazio>{vazio}</Vazio>;
    return (
        <div className="flex flex-col gap-2.5">
            {lista.map((item) => {
                const total = item.total || 1;
                const partes: [number, string][] = [[item.fechados, 'Fechado'], [item.andamento ?? 0, 'Em andamento'], [item.atrasados, 'Atrasado']];
                return (
                    <div key={item.nome} title={`${item.nome}: ${item.fechados}/${item.total} fechadas · ${item.atrasados} atrasadas`}>
                        <div className="mb-1 flex justify-between gap-2 text-xs">
                            <span className="truncate text-ink">{item.nome}</span>
                            <span className="shrink-0 tabular-nums"><b>{item.progresso}%</b> <small className="text-text-2">{item.fechados}/{item.total}</small></span>
                        </div>
                        <div className="flex h-1.5 overflow-hidden rounded-full bg-line-2">
                            {partes.map(([valor, status]) => <span key={status} style={{ width: `${(valor / total) * 100}%`, background: COR_STATUS_ITEM[status] }} />)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

const LIMITE_PRAZOS = 40;
const DIAS_URGENTE = 3;

export function ListaPrazos({ itens, atraso, mostrarPlano }: { itens: PrazoPainel[]; atraso?: boolean; mostrarPlano: boolean }) {
    if (!itens.length) return <Vazio>{atraso ? 'Nenhuma ação atrasada.' : 'Nenhum prazo nos próximos 15 dias.'}</Vazio>;
    return (
        <ul className="m-0 flex max-h-[360px] list-none flex-col gap-2 overflow-y-auto p-0">
            {itens.slice(0, LIMITE_PRAZOS).map((item) => {
                const dias = item.dias_restantes ?? 0;
                const urgente = !atraso && dias <= DIAS_URGENTE;
                return (
                    <li key={item.id_item} className="flex items-start gap-2.5">
                        <span className={cn('mt-0.5 w-11 shrink-0 rounded-md px-1 py-0.5 text-center text-[11.5px] font-bold', atraso && 'bg-danger-tint text-danger', urgente && 'bg-brass-tint text-brass', !atraso && !urgente && 'bg-line-2 text-text-2')}>
                            {atraso ? `${item.dias_atraso ?? '?'}d` : (dias === 0 ? 'hoje' : `${dias}d`)}
                        </span>
                        <div className="min-w-0">
                            <b className="block text-[13px] font-medium text-ink">{item.descricao}</b>
                            <small className="text-xs text-text-2">{[mostrarPlano ? item.plano : null, item.cliente, item.unidade, item.responsavel, `prazo ${dataBR(item.data_fim)}`].filter(Boolean).join(' · ')}</small>
                        </div>
                    </li>
                );
            })}
            {itens.length > LIMITE_PRAZOS && <li className="text-xs text-text-2">+ {itens.length - LIMITE_PRAZOS} ações...</li>}
        </ul>
    );
}
