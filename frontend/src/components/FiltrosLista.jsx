/* ARQUIVO: src/components/FiltrosLista.jsx
 * Filtros rápidos das listagens de cadastro, aplicados sobre a lista já carregada
 * (não fazem nova consulta à API).
 *
 * campos: [{ chave, rotulo, valor: (item) => string, tipo?: 'texto' | 'lista' }]
 *  - 'lista' (padrão): seleção com os valores distintos da própria lista
 *  - 'texto': busca por trecho (sem diferenciar maiúsculas/acentos)
 * Uso: const [filtrada, barra] = useFiltrosLista(lista, campos); */
import { useMemo, useState } from 'react';

const normalizar = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function useFiltrosLista(lista, campos) {
    const [sel, setSel] = useState({});
    const base = Array.isArray(lista) ? lista : [];

    const opcoes = useMemo(() => {
        const o = {};
        campos.filter(c => c.tipo !== 'texto').forEach(c => {
            o[c.chave] = [...new Set(base.map(i => String(c.valor(i) ?? '').trim()).filter(Boolean))]
                .sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
        });
        return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [base]);

    const filtrada = base.filter(item => campos.every(c => {
        const alvo = sel[c.chave];
        if (!alvo) return true;
        const v = c.valor(item);
        return c.tipo === 'texto' ? normalizar(v).includes(normalizar(alvo)) : String(v ?? '').trim() === alvo;
    }));

    const ativos = Object.values(sel).filter(Boolean).length;

    const barra = (
        <div className="oe-filtros">
            {campos.map(c => (
                <label key={c.chave} className={`oe-filtro ${c.tipo === 'texto' ? 'oe-filtro--texto' : ''}`}>
                    <span>{c.rotulo}</span>
                    {c.tipo === 'texto' ? (
                        <input type="text" value={sel[c.chave] || ''} placeholder="Todos"
                            onChange={e => setSel(s => ({ ...s, [c.chave]: e.target.value }))} />
                    ) : (
                        <select value={sel[c.chave] || ''} onChange={e => setSel(s => ({ ...s, [c.chave]: e.target.value }))}>
                            <option value="">Todos</option>
                            {(opcoes[c.chave] || []).map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                    )}
                </label>
            ))}
            <div className="oe-filtros-fim">
                <span className="oe-filtros-total">{filtrada.length} de {base.length}</span>
                {ativos > 0 && <button type="button" className="btn-voltar" onClick={() => setSel({})}>Limpar filtros</button>}
            </div>
        </div>
    );

    return [filtrada, barra];
}

export default useFiltrosLista;
