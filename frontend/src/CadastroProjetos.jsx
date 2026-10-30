/* ARQUIVO: src/CadastroProjetos.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import { useFiltrosLista } from './components/FiltrosLista';
import api from './api';
import Swal from 'sweetalert2';
import { CATEGORIAS_PROJETO } from './config/categoriasProjeto';
// Usa o CSS global (Dashboard.css)

// "Projeto Paraíba" -> "paraiba" (mesma regra do backend: utils/slugPublico.js)
const gerarSlug = (nome) => String(nome || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/^\s*(projeto|cliente)\s+/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
const linkPainel = (slug) => `${window.location.host}/${slug}`;

export default function CadastroProjetos({ aoVoltar }) {
    // [EVOLUÇÃO]: Adicionado campo 'gera_lotacao' no estado inicial
    const formInicial = { id_projeto: '', nome_projeto: '', categoria: '', ativo: true, gera_lotacao: false, painel_publico: false, slug_publico: '' };
    const [form, setForm] = useState(formInicial);
    const [listaProjetos, setListaProjetos] = useState([]);
    const [modoPesquisa, setModoPesquisa] = useState(true);
    
    // --- PERMISSÕES (Default: bloqueado) ---
    const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

    useEffect(() => { 
        carregar();
        carregarPermissoes();
    }, []);

    const carregarPermissoes = async () => {
        try {
            const session = sessionStorage.getItem('usuario_opera');
            const usuarioLogado = session ? JSON.parse(session) : null;

            if (usuarioLogado && usuarioLogado.perfil_acesso) {
                if (usuarioLogado.perfil_acesso === 'Administrador') {
                    setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
                } else {
                    const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    const regra = resRegras.data.find(r => r.nome_modulo === 'projetos');
                    
                    if (regra) {
                        setPermissoes({ 
                            pode_acessar: regra.pode_acessar, 
                            pode_novo: regra.pode_novo, 
                            pode_editar: regra.pode_editar 
                        });
                    }
                }
            }
        } catch (error) { console.error("Erro ao carregar permissões:", error); }
    };

    const carregar = async () => {
        try {
            const res = await api.get('/projetos');
            setListaProjetos(res.data);
        } catch (e) { console.error(e); }
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        
        if (form.id_projeto && !permissoes.pode_editar) return Swal.fire('Sem Permissão', 'Você não tem permissão para editar projetos.', 'error');
        if (!form.id_projeto && !permissoes.pode_novo) return Swal.fire('Sem Permissão', 'Você não tem permissão para criar projetos.', 'error');

        if (!form.nome_projeto) return Swal.fire('Atenção', 'Preencha o nome do projeto.', 'warning');
        if (!form.categoria) return Swal.fire('Atenção', 'Selecione a categoria do projeto.', 'warning');

        try {
            const payload = {
                id_projeto: form.id_projeto || null,
                nome_projeto: form.nome_projeto,
                categoria: form.categoria,
                ativo: form.ativo,
                gera_lotacao: form.gera_lotacao, // [EVOLUÇÃO]: Envia o novo campo
                painel_publico: form.painel_publico,
                slug_publico: form.painel_publico ? (form.slug_publico || gerarSlug(form.nome_projeto)) : ''
            };

            const res = await api.post('/projetos/salvar', payload);
            const slug = res.data?.slug_publico;

            if (slug) {
                Swal.fire({ icon: 'success', title: 'Salvo!', html: `Projeto salvo. Painel público disponível em:<br/><a href="/${slug}" target="_blank" rel="noreferrer"><b>${linkPainel(slug)}</b></a>` });
            } else {
                Swal.fire({ icon: 'success', title: 'Salvo!', text: 'Projeto salvo com sucesso.', timer: 1500, showConfirmButton: false });
            }

            setForm(formInicial);
            setModoPesquisa(true);
            carregar();
        } catch(e) { 
            console.error(e);
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível salvar o projeto.', 'error'); 
        }
    };

    const handleEditar = (p) => {
        setForm({
            id_projeto: p.id_projeto,
            nome_projeto: p.nome_projeto,
            categoria: (p.categoria || '').trim(),
            ativo: p.ativo === true || p.ativo === 1,
            // [EVOLUÇÃO]: Carrega o valor do banco
            gera_lotacao: p.gera_lotacao === true || p.gera_lotacao === 1,
            painel_publico: p.painel_publico === true || p.painel_publico === 1,
            slug_publico: p.slug_publico || ''
        });
        setModoPesquisa(false);
    };

    const handleNovo = () => {
        if (!permissoes.pode_novo) return;
        setForm(formInicial);
        setModoPesquisa(false);
    };

    // Filtros rápidos sobre a lista carregada
    const [projetosFiltrados, barraFiltros] = useFiltrosLista(listaProjetos, [
        { chave: 'nome', rotulo: 'Nome', tipo: 'texto', valor: p => p.nome_projeto },
        { chave: 'categoria', rotulo: 'Categoria', valor: p => p.categoria },
        { chave: 'lotacao', rotulo: 'Lotação', valor: p => (p.gera_lotacao ? 'Sim' : 'Não') },
        { chave: 'painel', rotulo: 'Painel Público', valor: p => (p.painel_publico && p.slug_publico ? 'Sim' : 'Não') },
        { chave: 'status', rotulo: 'Status', valor: x => (x.ativo ? 'Ativo' : 'Inativo') }
    ]);

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="folder"/></span><h2>Gestão de Projetos</h2>
                </div>
                <div>
                    {permissoes.pode_novo && (
                        <button className={`btn-tab ${!modoPesquisa ? 'ativo' : ''}`} onClick={handleNovo}>Novo</button>
                    )}
                    <button className={`btn-tab ${modoPesquisa ? 'ativo' : ''}`} onClick={() => setModoPesquisa(true)}>Listar</button>
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            {!modoPesquisa ? (
                <form className="form-card" onSubmit={handleSalvar}>
                    <h3>{form.id_projeto ? 'Editar Projeto' : 'Novo Projeto'}</h3>
                    
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Nome do Projeto *</label>
                            <input type="text" className="form-control" 
                                value={form.nome_projeto} 
                                onChange={e => setForm({...form, nome_projeto: e.target.value})} 
                                required
                            />
                        </div>
                        <div className="form-group" style={{minWidth: '160px'}}>
                            <label>Categoria *</label>
                            <select className="form-control" value={form.categoria}
                                onChange={e => setForm({...form, categoria: e.target.value})} required>
                                <option value="">Selecione</option>
                                {CATEGORIAS_PROJETO.map(c => <option key={c} value={c}>Categoria {c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* [EVOLUÇÃO]: Novo Checkbox Gera Lotação */}
                    <div className="checkbox-wrapper" style={{marginTop: '15px', padding: '10px', background: '#f0f4c3', borderRadius: '5px'}}>
                        <label className="checkbox-label" style={{color: '#558b2f', fontWeight: 'bold'}}>
                            <input 
                                type="checkbox" 
                                checked={form.gera_lotacao} 
                                onChange={e => setForm({...form, gera_lotacao: e.target.checked})} 
                            />
                            Gera Lotação? (Define visualização exclusiva para usuários)
                        </label>
                    </div>

                    {/* PAINEL PÚBLICO: cria o endereço operaecho.com/<slug> automaticamente */}
                    <div className="checkbox-wrapper" style={{marginTop: '12px', padding: '12px', background: 'var(--tint)', borderRadius: '6px', flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}>
                        <label className="checkbox-label" style={{color: 'var(--pine)', fontWeight: 'bold'}}>
                            <input
                                type="checkbox"
                                checked={form.painel_publico}
                                onChange={e => setForm({...form, painel_publico: e.target.checked, slug_publico: form.slug_publico || gerarSlug(form.nome_projeto)})}
                            />
                            Painel Público? (página aberta, sem login, com atividades, horas e mapa das unidades)
                        </label>
                        {form.painel_publico && (
                            <div className="form-group" style={{margin: 0}}>
                                <label>Endereço do painel</label>
                                <div style={{display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap'}}>
                                    <span style={{fontFamily: 'var(--font-mono)', color: 'var(--text-2)'}}>{window.location.host}/</span>
                                    <input type="text" className="form-control" style={{maxWidth: '260px', fontFamily: 'var(--font-mono)'}}
                                        value={form.slug_publico}
                                        placeholder={gerarSlug(form.nome_projeto) || 'paraiba'}
                                        onChange={e => setForm({...form, slug_publico: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60)})}
                                    />
                                    {form.id_projeto && form.slug_publico && (
                                        <a href={`/${form.slug_publico}`} target="_blank" rel="noreferrer" className="btn-tab" style={{textDecoration: 'none', marginLeft: 0}}><Icon n="link"/> Abrir</a>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="checkbox-wrapper">
                        <label className="checkbox-label">
                            <input 
                                type="checkbox" 
                                checked={form.ativo} 
                                onChange={e => setForm({...form, ativo: e.target.checked})} 
                            />
                            Projeto Ativo
                        </label>
                    </div>

                    <div className="form-actions">
                        {(!form.id_projeto && permissoes.pode_novo) || (form.id_projeto && permissoes.pode_editar) ? (
                            <button type="submit" className="btn-salvar">Salvar Projeto</button>
                        ) : (
                            <span style={{color: '#999', fontStyle: 'italic'}}>Sem permissão para salvar.</span>
                        )}
                    </div>
                </form>
            ) : (
                <div className="listagem-section">
                    {barraFiltros}
                    <div className="table-responsive">
                        <table className="tabela-unidades">
                            <thead>
                                <tr>
                                    <th>Nome do Projeto</th>
                                    <th className="center">Categoria</th>
                                    <th className="center">Lotação?</th> {/* [EVOLUÇÃO] Nova Coluna */}
                                    <th className="center">Painel Público</th>
                                    <th className="center">Status</th>
                                    <th className="center">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {projetosFiltrados.map(p => (
                                    <tr key={p.id_projeto}>
                                        <td>{p.nome_projeto}</td>
                                        <td className="center">{p.categoria ? <b>{p.categoria}</b> : <span style={{color:'#ccc'}}>-</span>}</td>
                                        {/* [EVOLUÇÃO] Indicador visual na lista */}
                                        <td className="center">
                                            {p.gera_lotacao ? <span style={{color:'green', fontWeight:'bold'}}>SIM</span> : <span style={{color:'#ccc'}}>Não</span>}
                                        </td>
                                        <td className="center">
                                            {p.painel_publico && p.slug_publico
                                                ? <a href={`/${p.slug_publico}`} target="_blank" rel="noreferrer" style={{color: 'var(--pine)', fontWeight: 'bold', fontFamily: 'var(--font-mono)'}}>/{p.slug_publico}</a>
                                                : <span style={{color:'#ccc'}}>Não</span>}
                                        </td>
                                        <td className="center">
                                            <span className={`status-badge ${p.ativo ? 'status-ativo' : 'status-inativo'}`}>
                                                {p.ativo ? 'ATIVO' : 'INATIVO'}
                                            </span>
                                        </td>
                                        <td className="center">
                                            {permissoes.pode_editar ? (
                                                <button className="btn-editar" onClick={() => handleEditar(p)}><Icon n="edit"/></button>
                                            ) : (
                                                <span title="Sem permissão"><Icon n="lock"/></span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}