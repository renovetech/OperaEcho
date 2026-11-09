/* Peças visuais compartilhadas pelas telas do SIGTAP. */
import { useMemo, useState, type ReactNode } from 'react';
import Icon from '@/shared/ui/Icon';
import { COMPATIBILIDADE, rotuloCompat } from '@/features/sigtap/formatos';
import { cn } from '@/shared/lib';
import { Input } from '@/shared/ui/Campos';
import { LinhaVazia, Tabela, Td, Th } from '@/shared/ui/Tabela';

const TOM_COMPAT = {
    ok: 'bg-tint text-pine-800',
    perigo: 'bg-danger-tint text-danger',
    ouro: 'bg-brass-tint text-brass',
    marca: 'bg-pine text-white'
};

const TOM_COMPLEXIDADE: Record<string, string> = {
    0: 'bg-line-2 text-text-2',
    1: 'bg-tint text-pine-800',
    2: 'bg-brass-tint text-brass',
    3: 'bg-danger-tint text-danger'
};

const normalizar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function Selo({ className, title, children }: { className?: string; title?: string; children: ReactNode }) {
    return <span title={title} className={cn('inline-block rounded-full bg-line-2 px-2.5 py-[3px] text-xs font-semibold whitespace-nowrap text-text', className)}>{children}</span>;
}

export const SeloComplexidade = ({ tipo, children }: { tipo: number | string; children: ReactNode }) =>
    <Selo className={TOM_COMPLEXIDADE[String(tipo)]}>{children}</Selo>;

export function SeloCompat({ tipo }: { tipo: number | string }) {
    const info = COMPATIBILIDADE[String(tipo)];
    return <Selo className={info && TOM_COMPAT[info.tom]} title={info?.ajuda}>{rotuloCompat(tipo)}</Selo>;
}

export function LinkAcao({ onClick, mono, children }: { onClick: () => void; mono?: boolean; children: ReactNode }) {
    return (
        <button type="button" onClick={onClick} className={cn('cursor-pointer border-0 bg-transparent p-0 text-[13px] font-medium text-pine hover:underline', mono ? 'font-mono' : 'font-sans')}>
            {children}
        </button>
    );
}

export const Mono = ({ children }: { children: ReactNode }) => <span className="font-mono text-[13px]">{children}</span>;

export function BotaoAba({ ativo, desabilitado, onClick, children }: { ativo: boolean; desabilitado?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={ativo}
            disabled={desabilitado}
            onClick={onClick}
            className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 border-0 border-b-2 border-solid bg-transparent px-3 py-2.5 font-sans text-[13.5px] font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                ativo ? 'border-pine text-pine-800' : 'border-transparent text-text-2 hover:text-ink'
            )}
        >
            {children}
        </button>
    );
}

interface ListaFiltravelProps<T> {
    itens: T[];
    cabecalho: string[];
    chave: (item: T) => string;
    busca: (item: T) => string;
    linha: (item: T) => ReactNode[];
    placeholder?: string;
    limite?: number;
}

const MINIMO_PARA_FILTRAR = 8;
const LIMITE_PADRAO = 50;

/** Tabela com filtro local (quando há muitos itens) e "mostrar todos". */
export function ListaFiltravel<T>({ itens, cabecalho, chave, busca, linha, placeholder = 'Filtrar...', limite = LIMITE_PADRAO }: ListaFiltravelProps<T>) {
    const [filtro, setFiltro] = useState('');
    const [todos, setTodos] = useState(false);
    const filtrados = useMemo(() => {
        const termo = normalizar(filtro.trim());
        return termo ? itens.filter((item) => normalizar(busca(item)).includes(termo)) : itens;
    }, [itens, filtro, busca]);
    const visiveis = todos ? filtrados : filtrados.slice(0, limite);

    return (
        <div>
            {itens.length > MINIMO_PARA_FILTRAR && (
                <div className="mb-2.5 flex items-center gap-3">
                    <Input className="w-72" aria-label={placeholder} placeholder={placeholder} value={filtro} onChange={(e) => setFiltro(e.target.value)} />
                    <small className="text-xs text-text-2">{filtrados.length} de {itens.length}</small>
                </div>
            )}
            <Tabela cabecalho={cabecalho.map((titulo, indice) => <Th key={`${titulo}-${indice}`}>{titulo}</Th>)}>
                {visiveis.map((item) => (
                    <tr key={chave(item)}>{linha(item).map((celula, indice) => <Td key={indice}>{celula}</Td>)}</tr>
                ))}
                {!visiveis.length && <LinhaVazia colunas={cabecalho.length}>Nada encontrado.</LinhaVazia>}
            </Tabela>
            {!todos && filtrados.length > limite && (
                <button type="button" onClick={() => setTodos(true)} className="mt-2.5 cursor-pointer border-0 bg-transparent p-0 font-sans text-[13px] font-medium text-pine hover:underline">
                    Mostrar todos ({filtrados.length})
                </button>
            )}
        </div>
    );
}

export function CampoBusca({ valor, placeholder, aoAlterar, autoFocus }: { valor: string; placeholder: string; aoAlterar: (valor: string) => void; autoFocus?: boolean }) {
    return (
        <div className="relative flex-1">
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"><Icon n="search" /></span>
            <Input autoFocus={autoFocus} aria-label={placeholder} className="pl-9" placeholder={placeholder} value={valor} onChange={(e) => aoAlterar(e.target.value)} />
        </div>
    );
}
