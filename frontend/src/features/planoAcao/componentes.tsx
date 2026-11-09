import { useRef, useState, type ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import { COR_SAUDE, iniciais } from '@/features/planoAcao/formatos';
import { cn } from '@/shared/lib';

export function SeloSaude({ saude }: { saude?: string | null }) {
    const cor = COR_SAUDE[saude ?? ''];
    return (
        <span className="inline-block rounded-full border border-solid px-2.5 py-0.5 text-[11.5px] font-bold whitespace-nowrap" style={cor ? { background: cor.bg, color: cor.fg, borderColor: cor.bd } : undefined}>
            {saude ?? '-'}
        </span>
    );
}

export const TagModulo = ({ children }: { children: ReactNode }) =>
    <span className="mr-1 mb-0.5 inline-block rounded bg-tint px-1.5 py-px text-[11px] font-semibold text-pine-800">{children}</span>;

/** Barra de execução: o traço marca o esperado até hoje. */
export function BarraProgresso({ valor, esperado, grande }: { valor: number; esperado?: number | null; grande?: boolean }) {
    return (
        <div className={cn('relative w-full overflow-visible rounded-full bg-line-2', grande ? 'h-2.5' : 'h-1.5')}>
            <span className="block h-full rounded-full bg-pine" style={{ width: `${Math.min(100, valor)}%` }} />
            {esperado != null && <i className="absolute -top-0.5 -bottom-0.5 w-0.5 bg-brass" style={{ left: `${Math.min(100, esperado)}%` }} />}
        </div>
    );
}

export function Avatar({ nome, mais }: { nome?: string; mais?: number }) {
    return (
        <span className={cn('inline-flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold text-white', mais ? 'bg-sage' : 'bg-pine-700')}>
            {mais ? `+${mais}` : iniciais(nome)}
        </span>
    );
}

export function BotaoIcone({ icone, titulo, perigo, ativo, onClick, disabled }: { icone: string; titulo: string; perigo?: boolean; ativo?: boolean; onClick: () => void; disabled?: boolean }) {
    return (
        <button
            type="button"
            title={titulo}
            aria-label={titulo}
            disabled={disabled}
            onClick={onClick}
            className={cn(
                'cursor-pointer rounded-md border-0 bg-transparent p-1.5 disabled:cursor-not-allowed disabled:opacity-40',
                perigo ? 'text-danger hover:bg-danger-tint' : 'text-pine hover:bg-tint',
                ativo && 'bg-tint'
            )}
        >
            <Icon n={icone} />
        </button>
    );
}

/** Campo de inclusão rápida: Enter adiciona. */
export function InclusaoRapida({ placeholder, rotulo = 'Adicionar', aoAdicionar }: { placeholder: string; rotulo?: string; aoAdicionar: (texto: string) => void }) {
    const [texto, setTexto] = useState('');
    const campo = useRef<HTMLInputElement>(null);

    const adicionar = () => {
        const limpo = texto.trim();
        if (!limpo) return;
        aoAdicionar(limpo);
        setTexto('');
        campo.current?.focus();
    };

    return (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-line bg-white px-2.5 py-1 text-muted focus-within:border-pine">
            <Icon n="plus" />
            <input
                ref={campo}
                aria-label={placeholder}
                value={texto}
                placeholder={placeholder}
                maxLength={1000}
                className="min-w-0 flex-1 border-0 bg-transparent p-1 font-sans text-[13px] text-ink outline-none"
                onChange={(evento) => setTexto(evento.target.value)}
                onKeyDown={(evento) => {
                    if (evento.key === 'Enter') {
                        evento.preventDefault();
                        adicionar();
                    }
                }}
            />
            <button type="button" disabled={!texto.trim()} onClick={adicionar} className="cursor-pointer rounded border-0 bg-transparent px-2 py-1 font-sans text-xs font-semibold text-pine hover:bg-tint disabled:cursor-default disabled:text-muted">{rotulo}</button>
        </div>
    );
}
