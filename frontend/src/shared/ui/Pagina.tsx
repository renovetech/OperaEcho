import type { FormEvent, ReactNode } from 'react';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';

interface PageHeaderProps {
    titulo: ReactNode;
    subtitulo?: ReactNode;
    /** Regra da tela, mostrada num balão ao lado do título. */
    ajuda?: string;
    acoes?: ReactNode;
}

export function PageHeader({ titulo, subtitulo, ajuda, acoes }: PageHeaderProps) {
    const tituloPagina = <h1 className="m-0 mb-1 text-[23px] leading-tight font-bold tracking-tight text-ink">{titulo}</h1>;
    return (
        <div className="mb-[18px] flex items-end justify-between gap-6">
            <div>
                {ajuda
                    ? <BalaoAjuda texto={ajuda} className="flex w-fit items-center gap-2">{tituloPagina}</BalaoAjuda>
                    : tituloPagina}
                {subtitulo && <p className="m-0 text-[13.5px] text-text-2">{subtitulo}</p>}
            </div>
            {acoes && <div className="flex gap-2.5">{acoes}</div>}
        </div>
    );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
    return <section className={cn('rounded-[10px] border border-line bg-white shadow-card', className)}>{children}</section>;
}

interface CardTituloProps {
    titulo: string;
    extra?: ReactNode;
    /** Regra do cartão, mostrada num balão ao lado do título. */
    ajuda?: string;
}

export function CardTitulo({ titulo, extra, ajuda }: CardTituloProps) {
    return (
        <header className="flex items-center justify-between gap-3 border-b border-line-2 px-[18px] py-3.5">
            {ajuda
                ? <BalaoAjuda texto={ajuda} className="flex items-center gap-1.5"><h2 className="m-0 text-[14.5px] font-semibold text-ink">{titulo}</h2></BalaoAjuda>
                : <h2 className="m-0 text-[14.5px] font-semibold text-ink">{titulo}</h2>}
            {extra}
        </header>
    );
}

export function Stat({ rotulo, children }: { rotulo: string; children: ReactNode }) {
    return (
        <Card className="px-[18px] py-4">
            <p className="m-0 mb-[7px] text-[12.5px] text-text-2">{rotulo}</p>
            {children}
        </Card>
    );
}

type TomBadge = 'neutro' | 'marca' | 'ouro';

const TONS_BADGE: Record<TomBadge, string> = {
    neutro: 'bg-line-2 text-text-2',
    marca: 'bg-tint text-pine-800',
    ouro: 'bg-brass-tint text-brass'
};

export function Badge({ tom = 'neutro', children }: { tom?: TomBadge; children: ReactNode }) {
    return <span className={cn('inline-block rounded-full px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap', TONS_BADGE[tom])}>{children}</span>;
}

interface FormCardProps {
    aoEnviar: (evento: FormEvent) => void;
    rodape: ReactNode;
    className?: string;
    children: ReactNode;
}

/** Formulário em cartão, com as ações no rodapé. */
export function FormCard({ aoEnviar, rodape, className, children }: FormCardProps) {
    return (
        <Card className={className}>
            <form onSubmit={aoEnviar}>
                {children}
                <div className="flex items-center justify-end gap-2.5 rounded-b-[10px] border-t border-line bg-surface-2 px-[22px] py-3.5">{rodape}</div>
            </form>
        </Card>
    );
}

export function FormSecao({ titulo, ajuda, children }: { titulo?: string; ajuda?: string; children: ReactNode }) {
    return (
        <div className="border-b border-line-2 px-[22px] py-5 last:border-b-0">
            {titulo && (ajuda
                ? <BalaoAjuda texto={ajuda} className="mb-4 flex w-fit items-center gap-1.5"><h2 className="m-0 text-[14.5px] font-semibold text-ink">{titulo}</h2></BalaoAjuda>
                : <h2 className="m-0 mb-4 text-[14.5px] font-semibold text-ink">{titulo}</h2>)}
            {children}
        </div>
    );
}
