/* ARQUIVO: src/CadastroProdutos.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import { useFiltrosLista } from './components/FiltrosLista';
import api from './api';
import './CadastroProdutos.css'; 
import Swal from 'sweetalert2';

function CadastroProdutos({ aoVoltar }) {
    // ESTADO INICIAL DO FORMULÁRIO
    const formInicial = { 
        id_produto: '', 
        nome_produto: '', 
        ativo: true
    };
    
    const [form, setForm] = useState(formInicial);
    const [listaProdutos, setListaProdutos] = useState([]);
    const [modoPesquisa, setModoPesquisa] = useState(true);
    
    // PERMISSÕES (Default: bloqueado)
    const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

    useEffect(() => {
        carregarDadosIniciais();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    const carregarDadosIniciais = async () => {
        carregarProdutos();
        
        // 1. Leitura robusta do usuário
        let usuarioLogado = null;
        try {
            const session = sessionStorage.getItem('usuario_opera');
            if (session) usuarioLogado = JSON.parse(session);
            else {
            }
        } catch (e) {}

        // 2. Definição de Permissões
        if (usuarioLogado && usuarioLogado.perfil_acesso) {
            if(usuarioLogado.perfil_acesso === 'Administrador') {
                setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
            } else {
                try {
                    const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    // Busca pela chave 'produtos' (conforme CadastroPerfil.js)
                    const regra = resRegras.data.find(r => r.nome_modulo === 'produtos');
                    
                    if (regra) {
                        setPermissoes({ 
                            pode_acessar: regra.pode_acessar, 
                            pode_novo: regra.pode_novo, 
                            pode_editar: regra.pode_editar 
                        });
                    }
                } catch (error) { console.error("Erro permissões:", error); }
            }
        }
    };

    const getUsuarioLogadoNome = () => {
        try {
            const session = sessionStorage.getItem('usuario_opera');
            if (session) {
                const u = JSON.parse(session);
                return u.nome || u.nome_completo || 'Sistema';
            }
            
            return 'Sistema';
        } catch (e) { return 'Desconhecido'; }
    };

    const carregarProdutos = async () => {
        try { const res = await api.get('/produtos'); setListaProdutos(res.data); } catch (e) {}
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        
        // Proteção no envio
        if (form.id_produto && !permissoes.pode_editar) return Swal.fire('Erro', "Sem permissão para editar.", 'error');
        if (!form.id_produto && !permissoes.pode_novo) return Swal.fire('Erro', "Sem permissão para criar.", 'error');

        if (!form.nome_produto) return Swal.fire('Atenção', "Preencha o nome.", 'warning');

        const payload = { ...form, responsavel_acao: getUsuarioLogadoNome() };

        try {
            await api.post('/produtos/salvar', payload);
            Swal.fire('Sucesso', "Produto salvo!", 'success');
            setForm(formInicial);
            setModoPesquisa(true);
            carregarProdutos();
        } catch (e) { Swal.fire('Erro', "Erro ao salvar.", 'error'); }
    };

    const handleEditar = (prod) => {
        setForm({ id_produto: prod.id_produto, nome_produto: prod.nome_produto, ativo: prod.ativo === true || prod.ativo === 1 });
        setModoPesquisa(false);
    };

    const handleNovo = () => {
        if(!permissoes.pode_novo) return;
        setForm(formInicial);
        setModoPesquisa(false);
    };

    // Filtros rápidos sobre a lista carregada
    const [produtosFiltrados, barraFiltros] = useFiltrosLista(listaProdutos, [
        { chave: 'nome', rotulo: 'Nome', tipo: 'texto', valor: p => p.nome_produto },
        { chave: 'status', rotulo: 'Status', valor: x => (x.ativo ? 'Ativo' : 'Inativo') }
    ]);

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="box"/></span><h2>Gestão de Produtos</h2>
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
                <form className="form-padrao" onSubmit={handleSalvar}>
                    <div className="form-titulo">{form.id_produto ? 'Editar Produto' : 'Novo Produto'}</div>
                    
                    <div className="linha">
                        <div className="campo flex-1">
                            <label>Nome do Produto *</label>
                            <input type="text" value={form.nome_produto} onChange={e => setForm({...form, nome_produto: e.target.value})} required />
                        </div>
                    </div>

                    {/* ÁREA DOS CHECKBOXES */}
                    <div style={{ display: 'flex', gap: '30px', marginTop: '20px' }}>
                        
                        <div className="campo-check">
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#333' }}>
                                <input 
                                    type="checkbox" 
                                    checked={form.ativo} 
                                    onChange={e => setForm({...form, ativo: e.target.checked})} 
                                    style={{ width: '18px', height: '18px', accentColor: '#2e7d32' }}
                                /> 
                                Produto Ativo
                            </label>
                        </div>

                    </div>

                    <div className="btns-form">
                        {/* Botão Salvar condicional */}
                        {(!form.id_produto && permissoes.pode_novo) || (form.id_produto && permissoes.pode_editar) ? (
                            <button type="submit" className="btn-salvar">Salvar Produto</button>
                        ) : <span style={{color:'#999'}}>Sem permissão de salvar.</span>}
                    </div>
                </form>
            ) : (
                <div className="tabela-container">
                    {barraFiltros}
                    <table className="tabela-unidades">
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th className="center" style={{width: '100px'}}>Status</th>
                                <th className="center" style={{width: '100px'}}>Ação</th>
                            </tr>
                        </thead>
                        <tbody>
                            {produtosFiltrados.map(p => (
                                <tr key={p.id_produto} className={!p.ativo ? 'row-inativo' : ''}>
                                    <td>{p.nome_produto}</td>


                                    <td className="center"><span className={`badge ${p.ativo?'ativo':'inativo'}`}>{p.ativo?'Ativo':'Inativo'}</span></td>
                                    
                                    <td className="center">
                                        {/* Botão Editar condicional */}
                                        {permissoes.pode_editar ? (
                                            <button className="btn-editar-icon" onClick={() => handleEditar(p)}><Icon n="edit"/></button>
                                        ) : <span><Icon n="lock"/></span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

export default CadastroProdutos;