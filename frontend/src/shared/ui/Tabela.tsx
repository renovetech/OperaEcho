import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import Icon from '@/shared/ui/Icon';
import { cn } from '@/shared/lib';
import { Button } from '@/shared/ui/Button';

export function Tabela({ cabecalho, children }: { cabecalho: ReactNode; children: ReactNode }) {
    return (
        <div className="overflow-x-auto rounded-[10px] border border-line bg-white shadow-card">
            <table className="w-full border-collapse text-[13.5px]">
                <thead><tr>{cabecalho}</tr></thead>
                <tbody>{children}</tbody>
            </table>
        </div>
    );
}

export function Th({ className, children, centro, ...props }: ThHTMLAttributes<HTMLTableCellElement> & { centro?: boolean }) {
    return <th className={cn('px-[18px] py-[11px]', centro ? 'text-center' : 'text-left', className)} {...props}>{children}</th>;
}

export function Td({ className, children, centro, ...props }: TdHTMLAttributes<HTMLTableCellElement> & { centro?: boolean }) {
    return <td className={cn('px-[18px] py-3', centro && 'text-center', className)} {...props}>{children}</td>;
}

export function LinhaVazia({ colunas, children }: { colunas: number; children: ReactNode }) {
    return <tr><td colSpan={colunas} className="px-[18px] py-11 text-center text-sm text-text-2">{children}</td></tr>;
}

export function StatusBadge({ ativo }: { ativo: boolean }) {
    return (
        <span className={cn('inline-block rounded-full px-2.5 py-[3px] text-xs font-semibold', ativo ? 'bg-tint text-pine-800' : 'bg-line-2 text-text-2')}>
            {ativo ? 'Ativo' : 'Inativo'}
        </span>
    );
}

/** Editar quando o perfil pode; cadeado quando não pode. */
export function AcaoEditar({ podeEditar, aoEditar }: { podeEditar: boolean; aoEditar: () => void }) {
    if (!podeEditar) return <span title="Sem permissão" className="text-muted"><Icon n="lock" /></span>;
    return (
        <button type="button" title="Editar" aria-label="Editar" onClick={aoEditar} className="cursor-pointer rounded-md border-0 bg-transparent p-1.5 text-pine hover:bg-tint">
            <Icon n="edit" />
        </button>
    );
}

interface PaginacaoProps {
    pagina: number;
    totalPaginas: number;
    totalItens: number;
    aoMudar: (pagina: number) => void;
}

export function Paginacao({ pagina, totalPaginas, totalItens, aoMudar }: PaginacaoProps) {
    return (
        <div className="mt-3 flex items-center justify-between">
            <span className="text-[12.5px] text-text-2">{totalItens} registro(s)</span>
            <div className="flex items-center gap-3">
                <Button variant="secondary" size="sm" disabled={pagina <= 1} onClick={() => aoMudar(pagina - 1)}>Anterior</Button>
                <span className="text-[13px] text-text">Página {pagina} de {Math.max(totalPaginas, 1)}</span>
                <Button variant="secondary" size="sm" disabled={pagina >= totalPaginas} onClick={() => aoMudar(pagina + 1)}>Próxima</Button>
            </div>
        </div>
    );
}
