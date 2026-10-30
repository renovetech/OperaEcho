/* ARQUIVO: src/CadastroRegioes.js
 * CADASTRO > MACRO E MICRO REGIÕES
 * Cada projeto tem a sua nomenclatura: macro pertence ao projeto e micro
 * pertence à macro. Aba "Vincular Unidades" associa as unidades do projeto
 * à macro/micro (uma a uma ou em massa).
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import './Parametros.css';

const PALETA = ['#2E7D32', '#1565C0', '#C62828', '#EF6C00', '#6A1B9A', '#00838F', '#AD1457', '#5D4037', '#9C7A3C', '#283593'];
const macroVazia = { id_macro: '', nome_macro: '', sigla: '', cor: PALETA[0], ativo: true };
const microVazia = { id_micro: '', nome_micro: '', sigla: '', cor: '', ativo: true };

export default function CadastroRegioes({ aoVoltar }) {
    const [projetos, setProjetos] = useState([]);
    const [idProjeto, setIdProjeto] = useState('');
    const [aba, setAba] = useState('regioes');
    const [macros, setMacros] = useState([]);
    const [macroSel, setMacroSel] = useState(null);
    const [formMacro, setFormMacro] = useState(macroVazia);
    const [formMicro, setFormMicro] = useState(microVazia);
    const [permissoes, setPermissoes] = useState({ pode_novo: false, pode_editar: false });

    // Vínculo de unidades
    const [unidades, setUnidades] = useState([]);
    const [alteracoes, setAlteracoes] = useState({}); // id_unidade -> { id_macro, id_micro }
    const [filtroVinc, setFiltroVinc] = useState({ termo: '', situacao: 'todas' });
    const [selecionadas, setSelecionadas] = useState(new Set());
    const [massa, setMassa] = useState({ id_macro: '', id_micro: '' });

    useEffect(() => {
        api.get('/projetos').then(r => setProjetos((r.data || []).filter(p => p.ativo))).catch(() => setProjetos([]));
        const usuario = (() => { try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; } catch (e) { return {}; } })();
        if (usuario.perfil_acesso === 'Administrador') setPermissoes({ pode_novo: true, pode_editar: true });
        else if (usuario.perfil_acesso) {
            api.get(`/regras/${usuario.perfil_acesso}`).then(r => {
                const regra = (r.data || []).find(x => x.nome_modulo === 'regioes');
                if (regra) setPermissoes({ pode_novo: !!regra.pode_novo, pode_editar: !!regra.pode_editar });
            }).catch(() => {});
        }
    }, []);

    const carregarRegioes = useCallback(async () => {
        if (!idProjeto) { setMacros([]); return; }
        try {
            const r = await api.get(`/regioes/projeto/${idProjeto}`);
            setMacros(r.data || []);
        } catch (e) { setMacros([]); }
    }, [idProjeto]);

    const carregarUnidades = useCallback(async () => {
        if (!idProjeto) { setUnidades([]); return; }
        try {
            const r = await api.get(`/regioes/unidades/${idProjeto}`);
            setUnidades(r.data || []);
            setAlteracoes({});
            setSelecionadas(new Set());
        } catch (e) { setUnidades([]); }
    }, [idProjeto]);

    useEffect(() => {
        setMacroSel(null); setFormMacro(macroVazia); setFormMicro(microVazia);
        carregarRegioes(); carregarUnidades();
    }, [carregarRegioes, carregarUnidades]);

    const macroAtual = macros.find(m => m.id_macro === macroSel) || null;
    const podeGravar = (id) => (id ? permissoes.pode_editar : permissoes.pode_novo);

    /* ------------------------------ MACRO ------------------------------ */
    const salvarMacro = async (e) => {
        e.preventDefault();
        if (!formMacro.nome_macro.trim()) return Swal.fire('Atenção', 'Informe o nome da macro região.', 'warning');
        try {
            await api.post('/regioes/macro/salvar', { ...formMacro, id_projeto: idProjeto, ordem: formMacro.ordem ?? macros.length });
            setFormMacro({ ...macroVazia, cor: PALETA[(macros.length + 1) % PALETA.length] });
            carregarRegioes();
        } catch (err) { Swal.fire('Erro', err.response?.data?.erro || 'Não foi possível salvar.', 'error'); }
    };

    const excluirMacro = async (m) => {
        const ok = await Swal.fire({ icon: 'warning', title: `Excluir "${m.nome_macro}"?`, showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!ok.isConfirmed) return;
        try {
            await api.delete(`/regioes/macro/${m.id_macro}`);
            if (macroSel === m.id_macro) setMacroSel(null);
            carregarRegioes();
        } catch (err) { Swal.fire('Atenção', err.response?.data?.erro || 'Não foi possível excluir.', 'warning'); }
    };

    /* ------------------------------ MICRO ------------------------------ */
    const salvarMicro = async (e) => {
        e.preventDefault();
        if (!macroAtual) return;
        if (!formMicro.nome_micro.trim()) return Swal.fire('Atenção', 'Informe o nome da micro região.', 'warning');
        try {
            await api.post('/regioes/micro/salvar', { ...formMicro, id_macro: formMicro.id_macro || macroAtual.id_macro, cor: formMicro.cor || null, ordem: formMicro.ordem ?? macroAtual.micros.length });
            setFormMicro(microVazia);
            carregarRegioes(); carregarUnidades();
        } catch (err) { Swal.fire('Erro', err.response?.data?.erro || 'Não foi possível salvar.', 'error'); }
    };

    const excluirMicro = async (mi) => {
        const ok = await Swal.fire({ icon: 'warning', title: `Excluir "${mi.nome_micro}"?`, showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!ok.isConfirmed) return;
        try { await api.delete(`/regioes/micro/${mi.id_micro}`); carregarRegioes(); }
        catch (err) { Swal.fire('Atenção', err.response?.data?.erro || 'Não foi possível excluir.', 'warning'); }
    };

    /* ------------------------ VÍNCULO DE UNIDADES ---------------------- */
    const valorDe = (u) => alteracoes[u.id_unidade] || { id_macro: u.id_macro || '', id_micro: u.id_micro || '' };
    const microsDa = (idMacro) => macros.find(m => String(m.id_macro) === String(idMacro))?.micros || [];

    const alterarUnidade = (u, campo, valor) => {
        const atual = valorDe(u);
        const novo = campo === 'id_macro' ? { id_macro: valor, id_micro: '' } : { ...atual, id_micro: valor };
        setAlteracoes(prev => ({ ...prev, [u.id_unidade]: novo }));
    };

    const unidadesFiltradas = useMemo(() => {
        const t = filtroVinc.termo.trim().toLowerCase();
        return unidades.filter(u => {
            const v = valorDe(u);
            if (filtroVinc.situacao === 'sem' && v.id_macro) return false;
            if (filtroVinc.situacao === 'com' && !v.id_macro) return false;
            if (t && !`${u.nome_unidade} ${u.cnes || ''} ${u.nome_cidade || ''}`.toLowerCase().includes(t)) return false;
            return true;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unidades, filtroVinc, alteracoes]);

    const aplicarEmMassa = () => {
        if (!massa.id_macro) return Swal.fire('Atenção', 'Escolha a macro região.', 'warning');
        if (!selecionadas.size) return Swal.fire('Atenção', 'Marque as unidades na lista.', 'warning');
        setAlteracoes(prev => {
            const n = { ...prev };
            selecionadas.forEach(id => { n[id] = { id_macro: massa.id_macro, id_micro: massa.id_micro }; });
            return n;
        });
        setSelecionadas(new Set());
    };

    const salvarVinculos = async () => {
        const itens = Object.entries(alteracoes).map(([id_unidade, v]) => ({ id_unidade: Number(id_unidade), id_macro: v.id_macro || null, id_micro: v.id_micro || null }));
        if (!itens.length) return;
        try {
            const r = await api.post('/regioes/unidades/vincular', { id_projeto: idProjeto, itens });
            Swal.fire({ icon: 'success', title: 'Salvo!', text: r.data?.mensagem, timer: 1600, showConfirmButton: false });
            carregarUnidades(); carregarRegioes();
        } catch (err) { Swal.fire('Erro', err.response?.data?.erro || 'Não foi possível salvar.', 'error'); }
    };

    const qtdAlteradas = Object.keys(alteracoes).length;
    const semRegiao = unidades.filter(u => !valorDe(u).id_macro).length;
    const todasMarcadas = unidadesFiltradas.length > 0 && unidadesFiltradas.every(u => selecionadas.has(u.id_unidade));

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="map" /></span><h2>Macro e Micro Regiões</h2>
                </div>
                <div>
                    <button className={`btn-tab ${aba === 'regioes' ? 'ativo' : ''}`} onClick={() => setAba('regioes')}>Regiões</button>
                    <button className={`btn-tab ${aba === 'unidades' ? 'ativo' : ''}`} onClick={() => setAba('unidades')}>Vincular Unidades</button>
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            <div className="form-card">
                <div className="rg-topo">
                    <div className="form-group">
                        <label>Projeto *</label>
                        <select className="form-control" value={idProjeto} onChange={e => setIdProjeto(e.target.value)}>
                            <option value="">-- Selecione o projeto --</option>
                            {projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </div>
                    {idProjeto && (
                        <div className="rg-resumo">
                            <span>{macros.length} macro(s)</span>
                            <span>{macros.reduce((s, m) => s + m.micros.length, 0)} micro(s)</span>
                            <span>{unidades.length} unidade(s)</span>
                            <span style={semRegiao ? { background: 'var(--brass-tint)', color: 'var(--brass)' } : undefined}>{semRegiao} sem região</span>
                        </div>
                    )}
                </div>

                {!idProjeto && <p className="rg-vazio">Selecione o projeto.</p>}

                {idProjeto && aba === 'regioes' && (
                    <div className="rg-grid">
                        {/* ---------------- MACROS ---------------- */}
                        <div className="rg-col">
                            <h4>Macro Regiões <small>clique para ver as micros</small></h4>
                            {podeGravar(formMacro.id_macro) && (
                                <form className="rg-form" onSubmit={salvarMacro}>
                                    <label>Nome<input className="form-control" value={formMacro.nome_macro} maxLength={120} placeholder="Ex.: III Macro" onChange={e => setFormMacro({ ...formMacro, nome_macro: e.target.value })} /></label>
                                    <label>Sigla<input className="form-control" value={formMacro.sigla || ''} maxLength={20} placeholder="III" onChange={e => setFormMacro({ ...formMacro, sigla: e.target.value })} /></label>
                                    <label>Cor<input type="color" value={formMacro.cor || PALETA[0]} onChange={e => setFormMacro({ ...formMacro, cor: e.target.value })} /></label>
                                    <button type="submit" className="btn-salvar">{formMacro.id_macro ? 'Atualizar' : 'Adicionar'}</button>
                                    {formMacro.id_macro && (
                                        <>
                                            <label className="checkbox-label" style={{ flexDirection: 'row', alignItems: 'center', gridColumn: '1 / -1' }}>
                                                <input type="checkbox" checked={formMacro.ativo} onChange={e => setFormMacro({ ...formMacro, ativo: e.target.checked })} /> Ativa
                                            </label>
                                            <button type="button" className="rg-cancelar" onClick={() => setFormMacro(macroVazia)}>Cancelar edição</button>
                                        </>
                                    )}
                                </form>
                            )}
                            <ul className="rg-lista">
                                {macros.map(m => (
                                    <li key={m.id_macro} className={`${macroSel === m.id_macro ? 'sel' : ''} ${m.ativo ? '' : 'inativo'}`} onClick={() => { setMacroSel(m.id_macro); setFormMicro(microVazia); }}>
                                        <span className="rg-cor" style={{ background: m.cor || '#9aa' }} />
                                        <span className="rg-nome">{m.nome_macro}{m.sigla ? ` (${m.sigla})` : ''}<small>{m.micros.length} micro(s) · {m.unidades} unidade(s){m.ativo ? '' : ' · inativa'}</small></span>
                                        <span className="rg-acoes" onClick={e => e.stopPropagation()}>
                                            {permissoes.pode_editar && <button title="Editar" onClick={() => setFormMacro({ ...m, ativo: !!m.ativo })}><Icon n="edit" /></button>}
                                            {permissoes.pode_editar && <button title="Excluir" className="del" onClick={() => excluirMacro(m)}><Icon n="trash" /></button>}
                                        </span>
                                    </li>
                                ))}
                                {!macros.length && <li className="rg-vazio" style={{ cursor: 'default', border: 'none' }}>Nenhuma macro região cadastrada.</li>}
                            </ul>
                        </div>

                        {/* ---------------- MICROS ---------------- */}
                        <div className="rg-col">
                            <h4>Micro Regiões {macroAtual && <small>de {macroAtual.nome_macro}</small>}</h4>
                            {!macroAtual ? <p className="rg-vazio">Selecione uma macro região ao lado.</p> : (
                                <>
                                    {podeGravar(formMicro.id_micro) && (
                                        <form className="rg-form" onSubmit={salvarMicro}>
                                            <label>Nome<input className="form-control" value={formMicro.nome_micro} maxLength={120} placeholder="Ex.: 6ª Região" onChange={e => setFormMicro({ ...formMicro, nome_micro: e.target.value })} /></label>
                                            <label>Sigla<input className="form-control" value={formMicro.sigla || ''} maxLength={20} placeholder="6ª" onChange={e => setFormMicro({ ...formMicro, sigla: e.target.value })} /></label>
                                            <label>Cor<input type="color" value={formMicro.cor || macroAtual.cor || PALETA[0]} onChange={e => setFormMicro({ ...formMicro, cor: e.target.value })} /></label>
                                            <button type="submit" className="btn-salvar">{formMicro.id_micro ? 'Atualizar' : 'Adicionar'}</button>
                                            {formMicro.id_micro && (
                                                <>
                                                    <label style={{ gridColumn: '1 / 3' }}>Macro
                                                        <select className="form-control" value={formMicro.id_macro} onChange={e => setFormMicro({ ...formMicro, id_macro: e.target.value })}>
                                                            {macros.map(m => <option key={m.id_macro} value={m.id_macro}>{m.nome_macro}</option>)}
                                                        </select>
                                                    </label>
                                                    <label className="checkbox-label" style={{ flexDirection: 'row', alignItems: 'center', gridColumn: '3 / -1' }}>
                                                        <input type="checkbox" checked={formMicro.ativo} onChange={e => setFormMicro({ ...formMicro, ativo: e.target.checked })} /> Ativa
                                                    </label>
                                                    <button type="button" className="rg-cancelar" onClick={() => setFormMicro(microVazia)}>Cancelar edição</button>
                                                </>
                                            )}
                                        </form>
                                    )}
                                    <ul className="rg-lista">
                                        {macroAtual.micros.map(mi => (
                                            <li key={mi.id_micro} className={mi.ativo ? '' : 'inativo'} style={{ cursor: 'default' }}>
                                                <span className="rg-cor" style={{ background: mi.cor || macroAtual.cor || '#9aa' }} />
                                                <span className="rg-nome">{mi.nome_micro}{mi.sigla ? ` (${mi.sigla})` : ''}<small>{mi.unidades} unidade(s){mi.ativo ? '' : ' · inativa'}</small></span>
                                                <span className="rg-acoes">
                                                    {permissoes.pode_editar && <button title="Editar" onClick={() => setFormMicro({ ...mi, ativo: !!mi.ativo, cor: mi.cor || '' })}><Icon n="edit" /></button>}
                                                    {permissoes.pode_editar && <button title="Excluir" className="del" onClick={() => excluirMicro(mi)}><Icon n="trash" /></button>}
                                                </span>
                                            </li>
                                        ))}
                                        {!macroAtual.micros.length && <li className="rg-vazio" style={{ cursor: 'default', border: 'none' }}>Nenhuma micro região nesta macro.</li>}
                                    </ul>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {idProjeto && aba === 'unidades' && (
                    <>
                        <div className="rg-vinc-filtros">
                            <input className="form-control" placeholder="Buscar unidade, CNES ou município..." value={filtroVinc.termo} onChange={e => setFiltroVinc({ ...filtroVinc, termo: e.target.value })} />
                            <select className="form-control" value={filtroVinc.situacao} onChange={e => setFiltroVinc({ ...filtroVinc, situacao: e.target.value })}>
                                <option value="todas">Todas as unidades</option>
                                <option value="sem">Sem região</option>
                                <option value="com">Com região</option>
                            </select>
                        </div>

                        {permissoes.pode_editar && (
                            <div className="rg-vinc-massa">
                                <b>{selecionadas.size} marcada(s)</b> → aplicar
                                <select className="form-control" value={massa.id_macro} onChange={e => setMassa({ id_macro: e.target.value, id_micro: '' })}>
                                    <option value="">Macro...</option>
                                    {macros.filter(m => m.ativo).map(m => <option key={m.id_macro} value={m.id_macro}>{m.nome_macro}</option>)}
                                </select>
                                <select className="form-control" value={massa.id_micro} onChange={e => setMassa({ ...massa, id_micro: e.target.value })} disabled={!massa.id_macro}>
                                    <option value="">Micro (opcional)...</option>
                                    {microsDa(massa.id_macro).filter(mi => mi.ativo).map(mi => <option key={mi.id_micro} value={mi.id_micro}>{mi.nome_micro}</option>)}
                                </select>
                                <button type="button" onClick={aplicarEmMassa}>Aplicar</button>
                            </div>
                        )}

                        <div className="rg-tabela-wrap">
                            <table className="tabela-unidades">
                                <thead>
                                    <tr>
                                        {permissoes.pode_editar && <th className="center" style={{ width: 36 }}>
                                            <input type="checkbox" checked={todasMarcadas} onChange={e => setSelecionadas(e.target.checked ? new Set(unidadesFiltradas.map(u => u.id_unidade)) : new Set())} />
                                        </th>}
                                        <th>Unidade</th><th>Município</th><th>Macro Região</th><th>Micro Região</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {unidadesFiltradas.map(u => {
                                        const v = valorDe(u);
                                        return (
                                            <tr key={u.id_unidade} className={alteracoes[u.id_unidade] ? 'rg-alterada' : ''}>
                                                {permissoes.pode_editar && <td className="center">
                                                    <input type="checkbox" checked={selecionadas.has(u.id_unidade)} onChange={e => setSelecionadas(prev => { const n = new Set(prev); e.target.checked ? n.add(u.id_unidade) : n.delete(u.id_unidade); return n; })} />
                                                </td>}
                                                <td><b>{u.nome_unidade}</b><div style={{ fontSize: '.75rem', color: '#888' }}>CNES {u.cnes || '-'}{u.ativo ? '' : ' · Inativa'}</div></td>
                                                <td>{u.nome_cidade || '-'}{u.uf ? ` / ${u.uf}` : ''}</td>
                                                <td>
                                                    <select className="form-control" value={v.id_macro} disabled={!permissoes.pode_editar} onChange={e => alterarUnidade(u, 'id_macro', e.target.value)}>
                                                        <option value="">- Sem macro -</option>
                                                        {macros.map(m => <option key={m.id_macro} value={m.id_macro}>{m.nome_macro}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <select className="form-control" value={v.id_micro} disabled={!permissoes.pode_editar || !v.id_macro} onChange={e => alterarUnidade(u, 'id_micro', e.target.value)}>
                                                        <option value="">- Sem micro -</option>
                                                        {microsDa(v.id_macro).map(mi => <option key={mi.id_micro} value={mi.id_micro}>{mi.nome_micro}</option>)}
                                                    </select>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {!unidadesFiltradas.length && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 20, color: '#999' }}>Nenhuma unidade.</td></tr>}
                                </tbody>
                            </table>
                        </div>

                        {permissoes.pode_editar && (
                            <div className="form-actions">
                                {qtdAlteradas > 0 && <button type="button" className="btn-tab" onClick={() => setAlteracoes({})}>Descartar</button>}
                                <button type="button" className="btn-salvar" disabled={!qtdAlteradas} onClick={salvarVinculos}>
                                    Salvar vínculos{qtdAlteradas ? ` (${qtdAlteradas})` : ''}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}
