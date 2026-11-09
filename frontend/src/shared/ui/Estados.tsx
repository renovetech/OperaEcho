import type { ReactNode } from 'react';

export function Carregando() {
    return (
        <div role="status" aria-label="Carregando" className="flex min-h-64 items-center justify-center">
            <span className="size-7 animate-spin rounded-full border-2 border-line border-t-pine" />
        </div>
    );
}

/** Linhas de espera para listas: a tela não salta quando os dados chegam. */
export function Esqueleto({ linhas = 6 }: { linhas?: number }) {
    return (
        <div role="status" aria-label="Carregando" className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-4">
            {Array.from({ length: linhas }, (_, indice) => <span key={indice} className="h-8 animate-pulse rounded-md bg-line-2" />)}
        </div>
    );
}

interface AvisoProps {
    titulo: string;
    children?: ReactNode;
    acao?: ReactNode;
}

export function Aviso({ titulo, children, acao }: AvisoProps) {
    return (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-line bg-white p-8 text-center">
            <h2 className="m-0 text-base font-semibold text-ink">{titulo}</h2>
            {children && <p className="m-0 max-w-md text-sm text-text-2">{children}</p>}
            {acao}
        </div>
    );
}
