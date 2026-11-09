/* Grade semanal: mantém as cores e tamanhos de sempre, pois é o que sai no JPG e no PDF. */
import type { ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import type { Colaborador, ItemEscala, TipoEscala } from '@/features/escalas/api';
import { foraDaVigencia, SIGLAS_DIAS } from '@/features/escalas/hooks';
import { cn, formatarDiaMes } from '@/shared/lib';

const CENTRO = 'flex size-full items-center justify-center text-center leading-tight font-bold';
const PARA_EXPORTAR = 'group-data-[exportando]/folha:border-black';

const CELULAS_FIXAS: Partial<Record<TipoEscala, { classe: string; conteudo: ReactNode }>> = {
    SEDE: { classe: 'rounded bg-[#ebfaef] text-base text-[#085815]', conteudo: 'SEDE' },
    SEDE_TREINAMENTO: {
        classe: 'flex-col rounded bg-[#d5f1ef] text-base text-[#046572]',
        conteudo: <><span>SEDE</span><span className="text-[13.5px]">TREINAMENTO</span></>
    },
    HOME_OFFICE: { classe: 'rounded bg-[#edece5] text-base text-[#7b1fa2]', conteudo: 'HOME OFFICE' },
    FALTA: { classe: 'rounded bg-black text-base text-white', conteudo: 'FALTA' },
    ATESTADO: { classe: 'bg-[#ffcdd2] text-[13px] text-[#b71c1c]', conteudo: 'ATESTADO' },
    FERIAS: { classe: 'bg-[#fff9c4] text-[13px] tracking-[1px] text-[#f57f17]', conteudo: 'FÉRIAS' },
    FERIADO: { classe: 'bg-[#eeeeee] text-[13px] tracking-[1px] text-[#555555]', conteudo: 'FERIADO' },
    FOLGA: { classe: 'bg-[#ffebee] text-[13px] text-[#c62828]', conteudo: 'FOLGA' }
};

const CARTAO = 'box-border flex size-full flex-col items-center justify-center p-0.5 text-center leading-[1.1]';

function CelulaTrabalho({ item }: { item: ItemEscala }) {
    const diurno = item.turno === 'DIURNO';
    const noturno = item.turno === 'NOTURNO';
    return (
        <div className={cn(CARTAO, diurno && 'bg-brass-tint', noturno && 'bg-[#edece5]')}>
            {diurno && <span className="mb-1 text-[10.5px] font-bold text-brass"><Icon n="sun" /> PLANTÃO DIURNO</span>}
            {noturno && <span className="mb-1 text-[10.5px] font-bold text-[#5a625b]"><Icon n="moon" /> PLANTÃO NOTURNO</span>}
            <span className="mb-0.5 block w-full text-[11px] font-bold text-pine-800 uppercase">{item.nome_projeto}</span>
            <span className="block w-full text-[10.5px] font-medium text-[#333333]">{item.nome_unidade}</span>
            {item.nomes_produtos && <span className="mt-px max-h-[25px] w-full overflow-hidden text-[9.5px] leading-none text-[#e91e63] italic">{item.nomes_produtos}</span>}
        </div>
    );
}

function ConteudoCelula({ item }: { item?: ItemEscala }) {
    if (!item) return <div className={cn(CENTRO, 'text-2xl font-normal text-[#cccccc]')}>+</div>;
    const fixa = CELULAS_FIXAS[item.tipo];
    if (fixa) return <div className={cn(CENTRO, fixa.classe)}>{fixa.conteudo}</div>;
    if (item.tipo === 'APOIO') {
        return (
            <div className={cn(CARTAO, 'border-0 border-l-4 border-solid border-[#3a5d50]')}>
                <span className="mb-0.5 text-[10.5px] font-bold text-[#3a5d50] uppercase">Apoio ao Projeto</span>
                <span className="mt-0.5 block w-full text-xs font-bold text-[#333333]">{item.nome_projeto}</span>
            </div>
        );
    }
    return <CelulaTrabalho item={item} />;
}

interface GradeEscalaProps {
    colaboradores: Colaborador[];
    dias: string[];
    itemDe: (idUsuario: number, dia: string) => ItemEscala | undefined;
    aoAbrir: (colaborador: Colaborador, dia: string) => void;
}

export function GradeEscala({ colaboradores, dias, itemDe, aoAbrir }: GradeEscalaProps) {
    const bordaTitulo = cn('border border-solid border-pine-800 bg-pine text-center align-middle text-white', PARA_EXPORTAR);
    const bordaCelula = cn('border border-solid border-sage-300', PARA_EXPORTAR);

    return (
        <div className="box-border w-full overflow-hidden rounded-lg border border-solid border-sage-100 group-data-[exportando]/folha:rounded-none group-data-[exportando]/folha:border-2 group-data-[exportando]/folha:border-black">
            <table className="w-full table-fixed border-collapse">
                <thead>
                    <tr>
                        <th className={cn(bordaTitulo, 'h-[50px] w-[220px] bg-pine-800 text-[13.5px] font-bold uppercase')}>Colaboradores</th>
                        {dias.map((dia, indice) => (
                            <th key={dia} className={cn(bordaTitulo, 'h-[50px] font-normal normal-case')}>
                                <div className="mb-0.5 text-xs text-sage-300 uppercase">{SIGLAS_DIAS[indice]}</div>
                                <div className="text-base font-bold text-white">{formatarDiaMes(dia)}</div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {colaboradores.length === 0 && (
                        <tr><td colSpan={dias.length + 1} className="p-8 text-center text-sm text-text-2">Nenhum colaborador nesta semana.</td></tr>
                    )}
                    {colaboradores.map((colaborador) => (
                        <tr key={colaborador.id_usuario} className="hover:bg-transparent">
                            <td className={cn(bordaCelula, 'bg-tint px-2.5 py-0 text-left align-middle text-[13px] font-bold text-pine-800')}>{colaborador.nome_completo}</td>
                            {dias.map((dia) => (foraDaVigencia(colaborador, dia)
                                ? (
                                    <td key={dia} title="Fora do período de atividade do colaborador" className={cn(bordaCelula, 'h-[85px] cursor-not-allowed bg-[#f1f0ea] p-0 text-center align-middle font-bold text-[#a7aba3]')}>-</td>
                                )
                                : (
                                    <td
                                        key={dia}
                                        tabIndex={0}
                                        className={cn(bordaCelula, 'h-[85px] cursor-pointer overflow-hidden bg-white p-0 text-center align-middle hover:bg-[#f1f1f1] hover:outline-2 hover:-outline-offset-2 hover:outline-pine-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine')}
                                        onClick={() => aoAbrir(colaborador, dia)}
                                        onKeyDown={(evento) => { if (evento.key === 'Enter') aoAbrir(colaborador, dia); }}
                                    >
                                        <ConteudoCelula item={itemDe(colaborador.id_usuario, dia)} />
                                    </td>
                                )))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
