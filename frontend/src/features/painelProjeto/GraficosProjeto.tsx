/* Gráficos do painel em SVG puro: a página fica em TVs e não precisa da biblioteca de gráficos. */
import { fmtHoras, fmtNum, rotuloMes, type ItemBarra } from '@/features/painelProjeto/calculos';
import { cn } from '@/shared/lib';

const COR_BARRA = '#2e7d32';
const COR_GRADE = '#edece5';
const LARGURA = 620;
const ALTURA = 220;
const ESQUERDA = 30;
const BASE = 30;
const TOPO = 18;
const DIREITA = 8;
const LARGURA_BARRA_MAX = 42;
const RAIO_ROSCA = 54;

export const SemDados = ({ children }: { children: React.ReactNode }) => <p className="m-0 p-6 text-center text-[13px] text-text-2">{children}</p>;

export function BarrasMes({ dados }: { dados: { mes: string; qtd: number; min: number }[] }) {
    if (!dados.length) return <SemDados>Sem atividades no período.</SemDados>;
    const areaX = LARGURA - ESQUERDA - DIREITA;
    const areaY = ALTURA - TOPO - BASE;
    const maior = Math.max(...dados.map((item) => item.qtd), 1);
    const largura = Math.min(LARGURA_BARRA_MAX, (areaX / dados.length) * 0.62);
    const centro = (indice: number) => ESQUERDA + (areaX / dados.length) * (indice + 0.5);

    return (
        <svg viewBox={`0 0 ${LARGURA} ${ALTURA}`} className="block h-auto w-full" role="img" aria-label="Atividades por mês">
            {[0, 0.5, 1].map((fracao) => (
                <g key={fracao}>
                    <line x1={ESQUERDA} x2={LARGURA - DIREITA} y1={TOPO + areaY - fracao * areaY} y2={TOPO + areaY - fracao * areaY} stroke={COR_GRADE} />
                    <text x={ESQUERDA - 6} y={TOPO + areaY - fracao * areaY + 4} textAnchor="end" className="fill-text-2 text-[11px]">{Math.round(maior * fracao)}</text>
                </g>
            ))}
            {dados.map((item, indice) => {
                const altura = (item.qtd / maior) * areaY;
                return (
                    <g key={item.mes}>
                        <rect x={centro(indice) - largura / 2} y={TOPO + areaY - altura} width={largura} height={Math.max(altura, item.qtd ? 2 : 0)} rx="3" fill={COR_BARRA}>
                            <title>{`${rotuloMes(item.mes)}: ${item.qtd} atividade(s) · ${fmtHoras(item.min)}`}</title>
                        </rect>
                        {item.qtd > 0 && <text x={centro(indice)} y={TOPO + areaY - altura - 5} textAnchor="middle" className="fill-ink text-[11px] font-semibold">{item.qtd}</text>}
                        <text x={centro(indice)} y={ALTURA - 10} textAnchor="middle" className="fill-text-2 text-[11px]">{rotuloMes(item.mes)}</text>
                    </g>
                );
            })}
        </svg>
    );
}

interface BarrasHorizontaisProps<T extends ItemBarra> {
    dados: T[];
    vazio: string;
    aoClicar?: (item: T) => void;
}

export function BarrasHorizontais<T extends ItemBarra>({ dados, vazio, aoClicar }: BarrasHorizontaisProps<T>) {
    if (!dados.length) return <SemDados>{vazio}</SemDados>;
    const maior = Math.max(...dados.map((item) => item.valor), 1);
    return (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-3.5">
            {dados.map((item) => (
                <li key={item.chave} title={item.titulo ?? item.nome}>
                    <button type="button" disabled={!aoClicar} onClick={() => aoClicar?.(item)} className={cn('grid w-full grid-cols-[minmax(0,1.2fr)_1fr_auto] items-center gap-2.5 rounded-md border-0 bg-transparent px-1.5 py-1 text-left font-sans text-[13px] text-ink', aoClicar && 'cursor-pointer hover:bg-surface-2')}>
                        <span className="flex min-w-0 items-center gap-1.5">
                            {item.cor && <i className="size-2 shrink-0 rounded-full" style={{ background: item.cor }} />}
                            <span className="truncate">{item.nome}</span>
                        </span>
                        <span className="h-2 overflow-hidden rounded-full bg-line-2"><span className="block h-full rounded-full" style={{ width: `${(item.valor / maior) * 100}%`, background: item.cor ?? COR_BARRA }} /></span>
                        <b className="font-semibold tabular-nums">{fmtNum(item.valor)}</b>
                    </button>
                </li>
            ))}
        </ul>
    );
}

export function Rosca({ partes, rotulo }: { partes: { nome: string; valor: number; cor: string }[]; rotulo: string }) {
    const total = partes.reduce((soma, parte) => soma + parte.valor, 0);
    const circunferencia = 2 * Math.PI * RAIO_ROSCA;
    const fatias = partes.filter((parte) => parte.valor > 0).reduce<{ nome: string; valor: number; cor: string; tamanho: number; inicio: number }[]>((lista, parte) => {
        const ultima = lista[lista.length - 1];
        return [...lista, { ...parte, tamanho: (parte.valor / total) * circunferencia, inicio: ultima ? ultima.inicio + ultima.tamanho : 0 }];
    }, []);

    return (
        <div className="flex items-center gap-5 p-[18px]">
            <svg viewBox="0 0 140 140" className="w-[150px] shrink-0" role="img" aria-label={rotulo}>
                <circle cx="70" cy="70" r={RAIO_ROSCA} fill="none" stroke={COR_GRADE} strokeWidth="18" />
                {fatias.map((fatia) => (
                    <circle key={fatia.nome} cx="70" cy="70" r={RAIO_ROSCA} fill="none" stroke={fatia.cor} strokeWidth="18" strokeDasharray={`${fatia.tamanho} ${circunferencia - fatia.tamanho}`} strokeDashoffset={-fatia.inicio} transform="rotate(-90 70 70)">
                        <title>{`${fatia.nome}: ${fatia.valor}`}</title>
                    </circle>
                ))}
                <text x="70" y="68" textAnchor="middle" className="fill-ink text-xl font-bold">{fmtNum(total)}</text>
                <text x="70" y="86" textAnchor="middle" className="fill-text-2 text-[10px]">{rotulo}</text>
            </svg>
            <ul className="m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0 text-[13px] text-ink">
                {partes.map((parte) => (
                    <li key={parte.nome} className="flex items-center gap-2">
                        <i className="size-2.5 shrink-0 rounded-full" style={{ background: parte.cor }} />
                        <span className="flex-1">{parte.nome}</span>
                        <b className="font-semibold tabular-nums">{fmtNum(parte.valor)}</b>
                        <small className="text-xs text-text-2 tabular-nums">{total ? Math.round((parte.valor / total) * 100) : 0}%</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}
