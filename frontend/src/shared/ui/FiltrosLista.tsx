/* Filtros rápidos das listagens, aplicados sobre a lista já carregada e guardados na URL. */
import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/shared/ui/Button';
import { Field, Input, Select } from '@/shared/ui/Campos';

export interface CampoFiltro<T> {
    chave: string;
    rotulo: string;
    valor: (item: T) => string | null | undefined;
    tipo?: 'texto' | 'lista';
}

const PREFIXO = 'f_';

const normalizar = (valor: unknown): string =>
    String(valor ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function useFiltrosLista<T>(lista: T[], campos: CampoFiltro<T>[]): [T[], ReactNode] {
    const [parametros, setParametros] = useSearchParams();
    const selecionado = (chave: string) => parametros.get(PREFIXO + chave) ?? '';

    const opcoes = useMemo(() => {
        const resultado: Record<string, string[]> = {};
        campos.filter((campo) => campo.tipo !== 'texto').forEach((campo) => {
            const valores = lista.map((item) => String(campo.valor(item) ?? '').trim()).filter(Boolean);
            resultado[campo.chave] = [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        });
        return resultado;
    }, [lista, campos]);

    const filtrada = lista.filter((item) => campos.every((campo) => {
        const alvo = selecionado(campo.chave);
        if (!alvo) return true;
        const valor = campo.valor(item);
        return campo.tipo === 'texto' ? normalizar(valor).includes(normalizar(alvo)) : String(valor ?? '').trim() === alvo;
    }));

    const alterar = (chave: string, valor: string) => {
        setParametros((atuais) => {
            const proximos = new URLSearchParams(atuais);
            if (valor) proximos.set(PREFIXO + chave, valor);
            else proximos.delete(PREFIXO + chave);
            return proximos;
        }, { replace: true });
    };

    const limpar = () => {
        setParametros((atuais) => {
            const proximos = new URLSearchParams(atuais);
            campos.forEach((campo) => proximos.delete(PREFIXO + campo.chave));
            return proximos;
        }, { replace: true });
    };

    const temFiltro = campos.some((campo) => selecionado(campo.chave));

    const barra = (
        <div className="mb-3.5 flex flex-wrap items-end gap-3.5 rounded-[10px] border border-line bg-white px-4 py-3.5 shadow-card">
            {campos.map((campo) => (
                <Field key={campo.chave} rotulo={campo.rotulo} htmlFor={`filtro-${campo.chave}`} className={campo.tipo === 'texto' ? 'w-80' : 'w-48'}>
                    {campo.tipo === 'texto' ? (
                        <Input id={`filtro-${campo.chave}`} value={selecionado(campo.chave)} placeholder="Todos" onChange={(e) => alterar(campo.chave, e.target.value)} />
                    ) : (
                        <Select id={`filtro-${campo.chave}`} value={selecionado(campo.chave)} onChange={(e) => alterar(campo.chave, e.target.value)}>
                            <option value="">Todos</option>
                            {(opcoes[campo.chave] ?? []).map((valor) => <option key={valor} value={valor}>{valor}</option>)}
                        </Select>
                    )}
                </Field>
            ))}
            <div className="ml-auto flex items-center gap-3">
                {temFiltro && <Button variant="ghost" size="sm" onClick={limpar}>Limpar filtros</Button>}
                <span className="rounded-full bg-tint px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-pine-800">{filtrada.length} de {lista.length}</span>
            </div>
        </div>
    );

    return [filtrada, barra];
}
