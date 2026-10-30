/* ARQUIVO: src/LinksExternos.js
   Operações > Links Externos.
   Cadastro de links associados aos produtos existentes, persistidos no BANCO
   (compartilhados entre todos os usuários). Exibição agrupada por produto.
   Fluxo: Novo Link -> escolhe o produto -> digita o link -> salva.
   Permissões (módulo 'links_externos'): pode_novo (criar) e pode_editar (editar/excluir). */
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';

export default function LinksExternos({ aoVoltar }) {
    const usuarioLogado = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; }
        catch (e) { return {}; }
    }, []);
    const isAdmin = usuarioLogado.perfil_acesso === 'Administrador';

    const [produtos, setProdutos] = useState([]);
    const [links, setLinks] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [podeNovo, setPodeNovo] = useState(isAdmin);
    const [podeEditar, setPodeEditar] = useState(isAdmin);

    const [modalAberto, setModalAberto] = useState(false);
    const [form, setForm] = useState({ id_link: null, id_produto: '', url: '' });

    // --- Carregamento ---
    const carregarLinks = async () => {
        setCarregando(true);
        try {
            const res = await api.get('/links-externos');
            setLinks(Array.isArray(res.data) ? res.data : []);
        } catch (e) { console.error('Erro ao carregar links', e); setLinks([]); }
        finally { setCarregando(false); }
    };
    useEffect(() => { carregarLinks(); }, []);

    useEffect(() => {
        const carregar = async () => {
            try {
                const res = await api.get('/produtos');
                setProdutos(Array.isArray(res.data) ? res.data : []);
            } catch (e) { console.error('Erro ao carregar produtos', e); setProdutos([]); }
        };
        carregar();
    }, []);

    // --- Permissões ---
    useEffect(() => {
        const carregar = async () => {
            if (isAdmin) { setPodeNovo(true); setPodeEditar(true); return; }
            try {
                const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                const regra = res.data.find(r => r.nome_modulo === 'links_externos');
                setPodeNovo(regra ? regra.pode_novo : false);
                setPodeEditar(regra ? regra.pode_editar : false);
            } catch (e) { console.error('Erro permissões links', e); }
        };
        if (usuarioLogado.id_usuario) carregar();
    }, [isAdmin, usuarioLogado.perfil_acesso, usuarioLogado.id_usuario]);

    const nomeProduto = (id) => {
        const p = produtos.find(x => String(x.id_produto) === String(id));
        return p ? p.nome_produto : 'Produto';
    };
    const normalizarUrl = (url) => /^https?:\/\//i.test(url) ? url : `https://${url}`;

    // Agrupa os links por produto: um card por produto, vários links abaixo
    const agrupados = useMemo(() => {
        const mapa = {};
        links.forEach(l => {
            const chave = String(l.id_produto);
            if (!mapa[chave]) mapa[chave] = { id_produto: l.id_produto, nome_produto: l.nome_produto, itens: [] };
            mapa[chave].itens.push(l);
        });
        return Object.values(mapa).sort((a, b) =>
            String(nomeProduto(a.id_produto)).localeCompare(String(nomeProduto(b.id_produto)))
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [links, produtos]);

    // --- Ações ---
    const abrirNovo = () => { setForm({ id_link: null, id_produto: '', url: '' }); setModalAberto(true); };
    const abrirEdicao = (item) => { setForm({ id_link: item.id_link, id_produto: item.id_produto, url: item.url }); setModalAberto(true); };

    const salvar = async () => {
        if (!form.id_produto) return Swal.fire('Atenção', 'Selecione o produto.', 'warning');
        if (!form.url || !form.url.trim()) return Swal.fire('Atenção', 'Informe o link externo.', 'warning');

        try {
            Swal.fire({ title: 'Salvando...', didOpen: () => Swal.showLoading() });
            const payload = { id_produto: parseInt(form.id_produto), url: form.url.trim() };
            if (form.id_link) await api.put(`/links-externos/${form.id_link}`, payload);
            else await api.post('/links-externos', payload);
            setModalAberto(false);
            await carregarLinks();
            Swal.fire({ title: 'Salvo!', text: 'Link disponível para todos.', icon: 'success', timer: 1400, showConfirmButton: false });
        } catch (e) {
            const msg = e?.response?.data?.erro || 'Falha ao salvar.';
            Swal.fire('Erro', msg, 'error');
        }
    };

    const excluir = async (item) => {
        const ok = await Swal.fire({
            title: 'Excluir link?', text: `${nomeProduto(item.id_produto)}`, icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d32f2f', confirmButtonText: 'Sim, excluir'
        });
        if (ok.isConfirmed) {
            try {
                await api.delete(`/links-externos/${item.id_link}`);
                await carregarLinks();
                Swal.fire({ title: 'Excluído!', icon: 'success', timer: 1200, showConfirmButton: false });
            } catch (e) {
                const msg = e?.response?.data?.erro || 'Falha ao excluir.';
                Swal.fire('Erro', msg, 'error');
            }
        }
    };

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title"><span className="icon"><Icon n="link"/></span><h2>Links Externos</h2></div>
                <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
            </div>

            <div className="form-card" style={{ animation: 'fadeIn 0.5s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                    <h3 style={{ color: 'var(--pine-700)', margin: 0 }}>Links por Produto</h3>
                    {podeNovo && (
                        <button className="btn-salvar" onClick={abrirNovo} style={{ background: 'var(--pine)', padding: '10px 18px' }}><Icon n="plus"/> Novo Link</button>
                    )}
                </div>

                {carregando ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: '40px 15px' }}>Carregando links...</div>
                ) : agrupados.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#999', padding: '40px 15px', border: '1px dashed #ccc', borderRadius: '8px' }}>
                        Nenhum link cadastrado. {podeNovo ? 'Clique em "Novo Link" para começar.' : ''}
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
                        {agrupados.map(grupo => (
                            <div key={grupo.id_produto} style={{ borderLeft: '3px solid var(--pine-700)', padding: '4px 0 4px 16px', marginBottom: '8px' }}>
                                <h4 style={{ margin: '0 0 12px 0', color: '#333', fontSize: '1.05rem', borderBottom: '1px solid #f0f0f0', paddingBottom: '8px' }}>{nomeProduto(grupo.id_produto)}</h4>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {grupo.itens.map(item => (
                                        <div key={item.id_link} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <a href={normalizarUrl(item.url)} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--pine-700)', wordBreak: 'break-all', fontSize: '0.9rem', flex: 1, minWidth: '160px' }}>{item.url}</a>
                                            {podeEditar && (
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn-tab" onClick={() => abrirEdicao(item)} title="Editar" style={{ background: 'var(--pine-700)', color: 'white', padding: '5px 10px' }}><Icon n="edit"/></button>
                                                    <button className="btn-tab" onClick={() => excluir(item)} title="Excluir" style={{ background: '#d32f2f', color: 'white', padding: '5px 10px' }}><Icon n="trash"/></button>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {modalAberto && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                    <div className="modal-content" style={{ width: '520px', maxWidth: '90%', background: 'white', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', overflow: 'hidden', animation: 'fadeIn 0.3s' }}>
                        <div style={{ background: 'var(--pine)', color: 'white', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '500' }}>{form.id_link ? 'Editar Link' : 'Novo Link'}</h3>
                            <button onClick={() => setModalAberto(false)} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: 1 }}>×</button>
                        </div>
                        <div style={{ padding: '25px' }}>
                            <div className="form-group" style={{ marginBottom: '18px' }}>
                                <label style={{ color: '#555', fontWeight: 'bold', fontSize: '0.9rem' }}>Produto</label>
                                <select className="form-control" value={form.id_produto} onChange={e => setForm({ ...form, id_produto: e.target.value })}>
                                    <option value="">Selecione o produto...</option>
                                    {produtos.map(p => <option key={p.id_produto} value={p.id_produto}>{p.nome_produto}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label style={{ color: '#555', fontWeight: 'bold', fontSize: '0.9rem' }}>Link Externo</label>
                                <input type="text" className="form-control" placeholder="https://..." value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ background: '#f9f9f9', padding: '15px 25px', display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid #e0e0e0' }}>
                            <button className="btn-tab" onClick={() => setModalAberto(false)} style={{ background: '#e0e0e0', color: '#555', padding: '10px 18px' }}>Cancelar</button>
                            <button className="btn-salvar" onClick={salvar} style={{ background: 'var(--pine)', padding: '10px 18px' }}><Icon n="save"/> Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
