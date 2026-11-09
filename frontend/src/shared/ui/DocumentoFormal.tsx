/* Padrão de todo documento emitido pelo sistema: timbre, seções com fios finos, faixa de indicadores e tabelas sóbrias.
   Só cores em hex: a captura para JPG e PDF não entende oklch nem color-mix. O PDF vetorial segue o mesmo padrão em pdfRelatorio.js. */
import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import Icon from '@/shared/ui/Icon';
import { cn } from '@/shared/lib';

interface TimbreProps {
    /** Palavra acima do título: "Relatório", "Recibo"... */
    rotulo?: string;
    titulo: string;
    subtitulo?: ReactNode;
    emissao: string;
}

export function Timbre({ rotulo = 'Relatório', titulo, subtitulo, emissao }: TimbreProps) {
    return (
        <header className="mb-7 flex items-end justify-between gap-8 border-0 border-b-2 border-solid border-[#1b5e20] pb-4">
            <img src="/logo.png" alt="Opera Echo" className="block h-[58px] w-auto" />
            <div className="text-right">
                <p className="m-0 mb-1 text-[10.5px] font-semibold tracking-[0.18em] text-[#9c7a3c] uppercase">{rotulo}</p>
                <h2 className="m-0 mb-1.5 font-serif text-[23px] leading-tight font-semibold text-[#1b5e20]">{titulo}</h2>
                {subtitulo && <p className="m-0 text-[13px] text-[#334155]">{subtitulo}</p>}
                <p className="m-0 mt-0.5 text-[11.5px] text-[#64748b]">{emissao}</p>
            </div>
        </header>
    );
}

export const RodapeDoc = ({ children }: { children: ReactNode }) => <p className="m-0 mt-8 border-0 border-t border-solid border-[#cbd5e1] pt-2.5 text-center text-[11.5px] text-[#64748b]">{children}</p>;

export const AvisoDoc = ({ children }: { children: ReactNode }) => <p className="m-0 py-14 text-center font-serif text-[15px] text-[#64748b] italic">{children}</p>;

interface SecaoProps {
    titulo: string;
    detalhe?: ReactNode;
    tom?: 'normal' | 'alerta';
    className?: string;
    children: ReactNode;
}

export function SecaoDoc({ titulo, detalhe, tom = 'normal', className, children }: SecaoProps) {
    return (
        <section className={cn('mb-7 break-inside-avoid last:mb-0', className)}>
            <div className="mb-2 flex items-baseline justify-between gap-4 border-0 border-b border-solid border-[#cbd5e1] pb-1.5">
                <h3 className={cn('m-0 font-serif text-[15.5px] font-semibold', tom === 'alerta' ? 'text-[#8f332f]' : 'text-[#1b5e20]')}>{titulo}</h3>
                {detalhe && <span className="text-xs text-[#64748b] tabular-nums">{detalhe}</span>}
            </div>
            {children}
        </section>
    );
}

export interface ItemIndicador {
    rotulo: string;
    valor: ReactNode;
    detalhe?: ReactNode;
    cor?: string;
}

/** Uma linha só, separada por fios, em vez de cartões coloridos. */
export function FaixaIndicadores({ itens }: { itens: ItemIndicador[] }) {
    return (
        <div className="mb-7 grid border-0 border-y border-solid border-[#cbd5e1]" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
            {itens.map((item, indice) => (
                <div key={item.rotulo} className={cn('px-3.5 py-3', indice > 0 && 'border-0 border-l border-solid border-[#e5e7eb]')}>
                    <p className="m-0 mb-1 text-[10.5px] font-semibold tracking-wide text-[#64748b] uppercase">{item.rotulo}</p>
                    <b className="block font-serif text-[20px] leading-tight font-semibold tabular-nums" style={{ color: item.cor ?? '#1e293b' }}>{item.valor}</b>
                    {item.detalhe && <small className="mt-0.5 block text-[11.5px] text-[#64748b]">{item.detalhe}</small>}
                </div>
            ))}
        </div>
    );
}

type Alinhamento = 'esquerda' | 'centro' | 'direita';
const ALINHAR: Record<Alinhamento, string> = { esquerda: 'text-left', centro: 'text-center', direita: 'text-right' };

export const TabelaDoc = ({ cabecalho, children }: { cabecalho: ReactNode; children: ReactNode }) => (
    <table className="w-full border-collapse text-[13px]">
        <thead><tr>{cabecalho}</tr></thead>
        <tbody>{children}</tbody>
    </table>
);

export function ThDoc({ alinhar = 'esquerda', className, children, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { alinhar?: Alinhamento }) {
    return <th className={cn('border-0 border-b border-solid border-[#1b5e20] bg-transparent px-2.5 py-2 text-[11px] font-semibold tracking-wide text-[#334155] uppercase', ALINHAR[alinhar], className)} {...props}>{children}</th>;
}

export function TdDoc({ alinhar = 'esquerda', className, children, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { alinhar?: Alinhamento }) {
    return <td className={cn('border-0 border-b border-solid border-[#eef1f5] px-2.5 py-2 align-top text-[#1e293b]', ALINHAR[alinhar], className)} {...props}>{children}</td>;
}

export const SubLinha = ({ children }: { children: ReactNode }) => <small className="mt-0.5 block text-[11.5px] text-[#64748b]">{children}</small>;

export function SeloDoc({ cor, fundo, children }: { cor: string; fundo?: string; children: ReactNode }) {
    return <span className="inline-block rounded-[3px] border border-solid px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap" style={{ color: cor, borderColor: cor, background: fundo ?? '#ffffff' }}>{children}</span>;
}

export function ChipDoc({ cor, children }: { cor?: string; children: ReactNode }) {
    return (
        <span className="m-0.5 ml-0 inline-flex items-center gap-1 rounded-[3px] border border-solid border-[#e5e7eb] bg-[#f8fafc] px-1.5 py-0.5 text-[11.5px] text-[#334155]">
            {cor && <i className="size-2 rounded-full" style={{ background: cor }} />}{children}
        </span>
    );
}

export const BotaoLinha = ({ aoClicar, icone, children }: { aoClicar: () => void; icone: string; children: ReactNode }) => (
    <button type="button" onClick={aoClicar} className="inline-flex cursor-pointer items-center gap-1 rounded-[3px] border border-solid border-[#1b5e20] bg-white px-2 py-0.5 font-sans text-[11.5px] font-semibold text-[#1b5e20] hover:bg-[#e8f5e9]"><Icon n={icone} /> {children}</button>
);
