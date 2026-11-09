import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/shared/lib';
import { BalaoAjuda } from '@/shared/ui/BalaoAjuda';

const CLASSE_CAMPO = cn(
    'box-border w-full rounded-lg border border-line bg-white px-3 py-2.5 font-sans text-sm text-ink',
    'focus:border-pine focus:outline-none focus:ring-3 focus:ring-tint',
    'disabled:bg-surface-2 disabled:text-text-2'
);

interface FieldProps {
    rotulo: string;
    htmlFor?: string;
    obrigatorio?: boolean;
    /** Regra do campo, mostrada num balão ao lado do rótulo. */
    ajuda?: string;
    className?: string;
    children: ReactNode;
}

export function Field({ rotulo, htmlFor, obrigatorio, ajuda, className, children }: FieldProps) {
    const rotuloCampo = (
        <label htmlFor={htmlFor} className="m-0 text-[12.5px] font-medium text-text">
            {rotulo}{obrigatorio && <span className="ml-0.5 text-danger">*</span>}
        </label>
    );
    return (
        <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
            {ajuda ? <BalaoAjuda texto={ajuda} className="flex w-fit items-center gap-1.5">{rotuloCampo}</BalaoAjuda> : rotuloCampo}
            {children}
        </div>
    );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return <input className={cn(CLASSE_CAMPO, 'read-only:bg-surface-2', className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
    return <select className={cn(CLASSE_CAMPO, 'cursor-pointer', className)} {...props}>{children}</select>;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
    return <textarea className={cn(CLASSE_CAMPO, 'leading-relaxed read-only:bg-surface-2', className)} {...props} />;
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
    rotulo: ReactNode;
}

export function Checkbox({ rotulo, className, ...props }: CheckboxProps) {
    return (
        <label className={cn('inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink', className)}>
            <input type="checkbox" className="size-[17px] cursor-pointer accent-pine" {...props} />
            {rotulo}
        </label>
    );
}

export function Interruptor({ checked, onChange, rotulo, disabled }: { checked: boolean; onChange: () => void; rotulo: string; disabled?: boolean }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={rotulo}
            disabled={disabled}
            onClick={onChange}
            className={cn('relative h-[22px] w-[38px] cursor-pointer rounded-full border-0 p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50', checked ? 'bg-pine' : 'bg-muted')}
        >
            <span className={cn('absolute top-[3px] left-[3px] size-4 rounded-full bg-white shadow-card transition-transform', checked && 'translate-x-4')} />
        </button>
    );
}

interface ItemSelecao {
    id: number;
    nome: string;
}

interface GrupoSelecaoProps {
    itens: ItemSelecao[];
    selecionados: number[];
    aoAlternar: (id: number) => void;
    vazio?: string;
}

/** Marcação múltipla em etiquetas (produtos, lotações). */
export function GrupoSelecao({ itens, selecionados, aoAlternar, vazio = 'Nenhum item disponível.' }: GrupoSelecaoProps) {
    if (!itens.length) return <p className="m-0 text-[13.5px] text-text-2">{vazio}</p>;
    return (
        <div className="flex flex-wrap gap-2">
            {itens.map((item) => {
                const ativo = selecionados.includes(item.id);
                return (
                    <label
                        key={item.id}
                        className={cn(
                            'inline-flex cursor-pointer items-center gap-2 rounded-full border border-solid px-3 py-[5px] text-[13px] transition-colors',
                            ativo ? 'border-pine bg-tint font-semibold text-pine-800' : 'border-line bg-white text-text hover:bg-surface-2'
                        )}
                    >
                        <input type="checkbox" className="accent-pine" checked={ativo} onChange={() => aoAlternar(item.id)} />
                        {item.nome}
                    </label>
                );
            })}
        </div>
    );
}
