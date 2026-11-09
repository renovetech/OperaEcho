import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/shared/ui/Icon';
import { cn } from '@/shared/lib';

interface JanelaProps {
    titulo: ReactNode;
    acoes?: ReactNode;
    rodape?: ReactNode;
    larguraClasse?: string;
    aoFechar: () => void;
    children: ReactNode;
}

/** Janela sobre a tela, para formulários que não cabem em um Swal. */
export function Janela({ titulo, acoes, rodape, larguraClasse = 'w-[640px]', aoFechar, children }: JanelaProps) {
    const idTitulo = useId();

    useEffect(() => {
        const aoTeclar = (evento: KeyboardEvent) => {
            // Com um Swal aberto por cima, o Esc pertence a ele.
            if (evento.key === 'Escape' && !document.querySelector('.swal2-container')) aoFechar();
        };
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [aoFechar]);

    return createPortal(
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-ink/40 p-6">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={idTitulo}
                className={cn('flex max-h-full flex-col overflow-hidden rounded-[14px] border-t-4 border-solid border-pine bg-white shadow-pop', larguraClasse)}
            >
                <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-6 py-3.5">
                    <h2 id={idTitulo} className="m-0 text-[17px] font-semibold text-ink">{titulo}</h2>
                    <div className="flex items-center gap-2">
                        {acoes}
                        <button type="button" aria-label="Fechar" title="Fechar" onClick={aoFechar} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-text-2 hover:bg-line-2 hover:text-ink"><Icon n="x" /></button>
                    </div>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">{children}</div>
                {rodape && <footer className="flex shrink-0 justify-end gap-2.5 border-t border-line bg-surface-2 px-6 py-3.5">{rodape}</footer>}
            </div>
        </div>,
        document.body
    );
}
