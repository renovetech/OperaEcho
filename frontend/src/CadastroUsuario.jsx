/* ARQUIVO: src/CadastroUsuario.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import { useFiltrosLista } from './components/FiltrosLista';
import api from './api';
import Swal from 'sweetalert2';
import { mascaraCelular, celularValido, soDigitos, emailValido } from './celular';

export default function CadastroUsuario({ aoVoltar }) {
    
    // --- Lógica de Usuário/Permissão ---
    const getUserSafe = () => {
        try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || null; } catch (e) { return null; }
    };
    const usuarioLogado = getUserSafe();
    const isAdmin = usuarioLogado?.usuario === 'admin' || usuarioLogado?.perfil_acesso === 'Administrador';
    // Somente o login "admin" pode conceder/editar o perfil Administrador.
    const isUsuarioAdmin = usuarioLogado?.usuario === 'admin';

    // --- Estados ---
    const formInicial = {
        id_usuario: '', nome_completo: '', cpf: '', data_nascimento: '', data_admissao: '',
        sexo: '', celular: '', celular_whatsapp: false, email: '', matricula: '',
        id_setor: '', id_funcao: '',
        usuario: '', senha_hash: '', perfil_acesso: '', ativo: false,
        id_lotacao: '' 
    };

    const [form, setForm] = useState(formInicial);
    const [listaUsuarios, setListaUsuarios] = useState([]);
    
    const [listaPerfis, setListaPerfis] = useState([]);
    const [listaProdutos, setListaProdutos] = useState([]); 
    const [produtosSelecionados, setProdutosSelecionados] = useState([]); 
    const [lotacoesExtras, setLotacoesExtras] = useState([]); 
    
    const [listaLotacoes, setListaLotacoes] = useState([]);
    const [listaSetores, setListaSetores] = useState([]);
    const [listaFuncoes, setListaFuncoes] = useState([]);

    const [modoPesquisa, setModoPesquisa] = useState(true); 
    const [termoBusca, setTermoBusca] = useState('');
    const [buscando, setBuscando] = useState(false); // Estado de loading para a busca
    
    const [permissaoNovo, setPermissaoNovo] = useState(isAdmin);
    const [permissaoEditar, setPermissaoEditar] = useState(isAdmin);

    // --- Função Validadora de CPF ---
    const validarCPF = (cpf) => {
        cpf = cpf.replace(/[^\d]+/g, ''); 
        if (cpf === '') return false;
        if (cpf.length !== 11 || 
            cpf === "00000000000" || cpf === "11111111111" || 
            cpf === "22222222222" || cpf === "33333333333" || 
            cpf === "44444444444" || cpf === "55555555555" || 
            cpf === "66666666666" || cpf === "77777777777" || 
            cpf === "88888888888" || cpf === "99999999999")
                return false;
        
        let add = 0;
        for (let i = 0; i < 9; i ++) add += parseInt(cpf.charAt(i)) * (10 - i);
        let rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(9))) return false;
        
        add = 0;
        for (let i = 0; i < 10; i ++) add += parseInt(cpf.charAt(i)) * (11 - i);
        rev = 11 - (add % 11);
        if (rev === 10 || rev === 11) rev = 0;
        if (rev !== parseInt(cpf.charAt(10))) return false;
        
        return true;
    };

    // --- Effects ---
    useEffect(() => {
        const carregarDados = async () => {
            // Carrega a lista inicial (sem filtro)
            buscarUsuarios();

            try {
                const resPerfis = await api.get('/perfis'); 
                if (resPerfis.data && Array.isArray(resPerfis.data)) {
                    setListaPerfis(resPerfis.data.map(p => ({ id: p.id_perfil, nome: p.nome_perfil })));
                } else { throw new Error("Dados de perfil inválidos"); }
            } catch (e) { 
                console.error(e);
                setListaPerfis([{ id: 1, nome: 'Administrador' }, { id: 2, nome: 'Gestor' }, { id: 3, nome: 'Implantador' }, { id: 4, nome: 'Operador' }]);
            }
            
            try {
                const resProds = await api.get('/produtos');
                setListaProdutos(resProds.data.filter(p => p.ativo) || []);
            } catch (e) { console.error(e); }

            try {
                const resProj = await api.get('/projetos');
                const lotacoesDisponiveis = resProj.data.filter(p => p.ativo && p.gera_lotacao);
                setListaLotacoes(lotacoesDisponiveis);
            } catch (e) { console.error(e); }

            try {
                const [resSet, resFun] = await Promise.all([
                    api.get('/setores'),
                    api.get('/funcoes')
                ]);
                setListaSetores(resSet.data);
                setListaFuncoes(resFun.data);
            } catch (e) { console.error("Erro ao carregar setores/funções", e); }

            if (isAdmin) {
                setPermissaoNovo(true);
                setPermissaoEditar(true);
            } else if (usuarioLogado && usuarioLogado.perfil_acesso) {
                try {
                    const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    const regraModulo = resRegras.data.find(r => r.nome_modulo === 'usuarios');
                    if (regraModulo) {
                        setPermissaoNovo(regraModulo.pode_novo);
                        setPermissaoEditar(regraModulo.pode_editar);
                    }
                } catch (error) { console.error(error); }
            }
        };
        carregarDados();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]); // Removi usuarioLogado da dependência direta para evitar loop

    // Função de busca dedicada e robusta
    const buscarUsuarios = async (e) => {
        if(e) e.preventDefault(); // Previne reload se for submit de form
        
        setBuscando(true);
        try {
            // Garante que o termo seja string e codificado (caso tenha caracteres especiais)
            const termoSeguro = encodeURIComponent(termoBusca || '');
            const res = await api.get(`/usuarios/buscar?termo=${termoSeguro}`);
            setListaUsuarios(res.data || []);
        } catch (e) {
            console.error("Erro ao buscar usuários:", e);
            Swal.fire('Erro', 'Falha ao buscar usuários.', 'error');
        } finally {
            setBuscando(false);
        }
    };

    // --- Handlers ---
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        if (name === 'cpf') {
            const cpfLimpo = value.replace(/\D/g, ''); 
            setForm(prev => ({
                ...prev,
                [name]: cpfLimpo,
                usuario: cpfLimpo 
            }));
        } else if (name === 'nome_completo') {
            setForm(prev => ({ ...prev, [name]: value.toUpperCase() }));
        } else if (name === 'celular') {
            setForm(prev => ({ ...prev, celular: mascaraCelular(value) }));
        } else {
            setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        }
    };

    const toggleProduto = (idProduto) => {
        setProdutosSelecionados(prev => 
            prev.includes(idProduto) ? prev.filter(id => id !== idProduto) : [...prev, idProduto]
        );
    };

    const toggleLotacaoExtra = (idProjeto) => {
        setLotacoesExtras(prev =>
            prev.includes(idProjeto) ? prev.filter(id => id !== idProjeto) : [...prev, idProjeto]
        );
    };

    const handleNovo = () => {
        setModoPesquisa(false);
        setForm({ ...formInicial, perfil_acesso: '' }); 
        setProdutosSelecionados([]); 
        setLotacoesExtras([]); 
    };

    const handleEditar = async (u) => {
        const lotacaoAjustada = u.id_lotacao === null ? '0' : u.id_lotacao;
        
        // Carrega IDs. Se o backend não mandou ID no select, tenta usar string vazia para forçar seleção
        setForm({
            ...u,
            celular: mascaraCelular(u.celular || ''),
            celular_whatsapp: !!u.celular_whatsapp,
            email: u.email || '',
            senha_hash: '',
            id_lotacao: lotacaoAjustada,
            id_setor: u.id_setor || '',
            id_funcao: u.id_funcao || ''
        }); 
        try {
            const res = await api.get(`/usuarios/${u.id_usuario}/produtos`);
            setProdutosSelecionados(res.data || []); 
        } catch (e) { setProdutosSelecionados([]); }
        try {
            const resLot = await api.get(`/usuarios/${u.id_usuario}/lotacoes`);
            setLotacoesExtras(resLot.data || []);
        } catch (e) { setLotacoesExtras([]); }
        setModoPesquisa(false);
    };

    const verificarDuplicidade = () => {
        const outrosUsuarios = listaUsuarios.filter(u => String(u.id_usuario) !== String(form.id_usuario));

        const cpfExiste = outrosUsuarios.some(u => u.cpf === form.cpf);
        if (cpfExiste) {
            Swal.fire('Erro', 'Este CPF já está cadastrado para outro usuário.', 'error');
            return true;
        }

        const matriculaExiste = outrosUsuarios.some(u => u.matricula === form.matricula);
        if (matriculaExiste) {
            Swal.fire('Erro', 'Esta Matrícula já está em uso.', 'error');
            return true;
        }

        return false;
    };

    const handleSalvar = async (e) => {
        e.preventDefault();

        // Perfil Administrador é exclusivo do login "admin".
        if (form.perfil_acesso === 'Administrador' && !isUsuarioAdmin) {
            Swal.fire('Acesso Negado', 'Apenas o usuário "admin" pode atribuir ou editar o perfil Administrador.', 'error');
            return;
        }

        if (!form.nome_completo || !form.cpf || !form.usuario || !form.perfil_acesso || !form.matricula || !form.id_setor || !form.id_funcao || !form.data_admissao) {
            Swal.fire('Atenção', 'Preencha todos os campos obrigatórios (*)', 'warning');
            return;
        }

        if (form.id_lotacao === '') {
            Swal.fire('Atenção', 'Selecione a Lotação (ou SEDE - GD).', 'warning');
            return;
        }

        if (!validarCPF(form.cpf)) {
            Swal.fire('Atenção', 'CPF inválido.', 'warning');
            return;
        }

        // Celular com WhatsApp obrigatório (escala, férias e código de senha)
        if (!celularValido(form.celular)) {
            Swal.fire('Atenção', 'Informe o celular com WhatsApp: DDD + 9 dígitos (ex.: (21) 98765-4321).', 'warning');
            return;
        }
        if (!emailValido(form.email)) {
            Swal.fire('Atenção', 'E-mail inválido.', 'warning');
            return;
        }

        if (verificarDuplicidade()) {
            return;
        }

        try {
            const idLotacaoFinal = form.id_lotacao === '0' ? null : parseInt(form.id_lotacao);

            const payload = { 
                id_usuario: form.id_usuario ? parseInt(form.id_usuario) : null, // ID explícito
                nome_completo: form.nome_completo,
                cpf: form.cpf,
                data_nascimento: form.data_nascimento || null, 
                data_admissao: form.data_admissao || null,
                sexo: form.sexo,
                celular: soDigitos(form.celular),
                celular_whatsapp: !!form.celular_whatsapp,
                email: (form.email || '').trim(),
                matricula: form.matricula,
                usuario: form.usuario,
                // Não enviamos senha_hash no update para evitar sobrescrever com vazio
                id_setor: parseInt(form.id_setor), 
                id_funcao: parseInt(form.id_funcao), 
                id_lotacao: idLotacaoFinal,
                ativo: form.ativo,
                perfil_acesso: form.perfil_acesso,
                produtos: produtosSelecionados, 
                lotacoes: lotacoesExtras, 
                responsavel_acao: usuarioLogado ? (usuarioLogado.nome || usuarioLogado.nome_completo) : 'Sistema'
            };

            let mensagemSucesso = 'Dados atualizados com sucesso!';
            let tituloSucesso = 'Atualizado';

            // Se for novo, adiciona a senha padrão
            if (!payload.id_usuario) {
                payload.senha_hash = 'Eco123';
                mensagemSucesso = 'Usuário cadastrado! A senha padrão é "Eco123".';
                tituloSucesso = 'Cadastro Realizado';
            }

            await api.post('/usuarios/salvar', payload);
            
            Swal.fire({ 
                icon: 'success', 
                title: tituloSucesso, 
                text: mensagemSucesso, 
                timer: 3000, 
                showConfirmButton: true 
            });

            setModoPesquisa(true);
            buscarUsuarios(); // Recarrega a lista para mostrar o novo/editado
        } catch (e) { 
            console.error("Erro detalhado:", e);
            if(e.response && e.response.status === 500) {
                 Swal.fire('Erro ao Salvar', 'Ocorreu um erro interno. Verifique duplicidade.', 'error');
            } else {
                 Swal.fire('Erro', e.response?.data?.erro || 'Erro ao salvar usuário.', 'error');
            }
        }
    };

    // Filtros rápidos sobre a lista carregada
    const [usuariosFiltrados, barraFiltros] = useFiltrosLista(listaUsuarios, [
        { chave: 'funcao', rotulo: 'Função', valor: u => u.nome_funcao || u.funcao },
        { chave: 'setor', rotulo: 'Setor', valor: u => u.nome_setor || u.setor },
        { chave: 'perfil', rotulo: 'Perfil', valor: u => u.perfil_acesso },
        { chave: 'status', rotulo: 'Status', valor: x => (x.ativo ? 'Ativo' : 'Inativo') }
    ]);

    return (
        <div className="cadastro-container"> 
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="users"/></span><h2>Gestão de Usuários</h2>
                </div>
                <div>
                    {permissaoNovo && <button className={`btn-tab ${!modoPesquisa ? 'ativo' : ''}`} onClick={handleNovo}>Novo</button>}
                    <button className={`btn-tab ${modoPesquisa ? 'ativo' : ''}`} onClick={() => setModoPesquisa(true)}>Pesquisar</button>
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            {!modoPesquisa ? (
                <form className="form-card" onSubmit={handleSalvar}>
                    <h3>{form.id_usuario ? 'Editar Usuário' : 'Novo Usuário'}</h3>

                    <div className="form-row">
                        <div className="form-group flex-2">
                            <label>Nome Completo *</label>
                            <input type="text" className="form-control" name="nome_completo" value={form.nome_completo} onChange={handleChange} required />
                        </div>
                        <div className="form-group flex-1">
                            <label>CPF * (Preenche Usuário)</label>
                            <input type="text" className="form-control" name="cpf" value={form.cpf} onChange={handleChange} placeholder="Apenas números" maxLength={11} required />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Data Nascimento</label>
                            <input type="date" min="1900-01-01" max="2100-12-31" className="form-control" name="data_nascimento" value={form.data_nascimento ? form.data_nascimento.split('T')[0] : ''} onChange={handleChange} />
                        </div>
                        <div className="form-group flex-1">
                            <label>Data Admissão *</label>
                            <input type="date" min="1900-01-01" max="2100-12-31" className="form-control" name="data_admissao" value={form.data_admissao ? form.data_admissao.split('T')[0] : ''} onChange={handleChange} required />
                        </div>
                        <div className="form-group flex-1">
                            <label>Celular (WhatsApp) *</label>
                            <input type="tel" className="form-control" name="celular" value={form.celular} onChange={handleChange} placeholder="(21) 98765-4321" required />                        </div>
                        <div className="form-group flex-1">
                            <label>Sexo</label>
                            <select className="form-control" name="sexo" value={form.sexo} onChange={handleChange}>
                                <option value="">Selecione...</option>
                                <option value="Masculino">Masculino</option>
                                <option value="Feminino">Feminino</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Matrícula *</label>
                            <input type="text" className="form-control" name="matricula" value={form.matricula} onChange={handleChange} required />
                        </div>

                        <div className="form-group flex-1">
                            <label>E-mail</label>
                            <input type="email" className="form-control" name="email" value={form.email || ''} onChange={handleChange} placeholder="opcional (redefinição de senha)" />
                        </div>
                        
                        <div className="form-group flex-1">
                            <label>Setor *</label>
                            <select className="form-control" name="id_setor" value={form.id_setor} onChange={handleChange} required>
                                <option value="">Selecione...</option>
                                {listaSetores.map(s => (
                                    <option key={s.id_setor} value={s.id_setor}>{s.nome_setor}</option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group flex-1">
                            <label>Lotação (Acesso a Dados) *</label>
                            <select 
                                className="form-control" 
                                name="id_lotacao" 
                                value={form.id_lotacao} 
                                onChange={handleChange} 
                                style={{
                                    backgroundColor: form.id_lotacao === '0' ? '#e8f5e9' : '#fff', 
                                    fontWeight: form.id_lotacao === '0' ? 'bold' : 'normal', 
                                    color: form.id_lotacao === '0' ? '#2e7d32' : '#333'
                                }}
                            >
                                <option value="">Selecione...</option>
                                <option value="0">SEDE - GD (Acesso Total)</option>
                                {listaLotacoes.map((l) => (
                                    <option key={l.id_projeto} value={l.id_projeto}>
                                        {l.nome_projeto}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group flex-1">
                            <label>Lotações adicionais (cobre mais de uma)</label>
                            <div className="form-control" style={{ height: 'auto', maxHeight: '120px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px' }}>
                                {listaLotacoes.length === 0 && <span style={{ color: '#999', fontSize: '0.85rem' }}>Nenhuma lotação disponível.</span>}
                                {listaLotacoes
                                    .filter(l => String(l.id_projeto) !== String(form.id_lotacao))
                                    .map(l => (
                                        <label key={l.id_projeto} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'normal', fontSize: '0.9rem', cursor: 'pointer' }}>
                                            <input type="checkbox" checked={lotacoesExtras.includes(l.id_projeto)} onChange={() => toggleLotacaoExtra(l.id_projeto)} />
                                            {l.nome_projeto}
                                        </label>
                                    ))}
                            </div>
                        </div>
                    </div>

                    <div className="form-row" style={{borderTop:'1px dashed #ccc', paddingTop:'20px'}}>
                        <div className="form-group flex-1">
                            <label>Login (Usuário) *</label>
                            <input type="text" className="form-control" name="usuario" value={form.usuario} readOnly style={{backgroundColor: '#e9ecef', cursor: 'not-allowed'}} title="Preenchido automaticamente pelo CPF" />
                        </div>
                        
                        <div className="form-group flex-1">
                            <label>Função *</label>
                            <select className="form-control" name="id_funcao" value={form.id_funcao} onChange={handleChange} required>
                                <option value="">Selecione...</option>
                                {listaFuncoes.map(f => (
                                    <option key={f.id_funcao} value={f.id_funcao}>{f.nome_funcao}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="form-group flex-1">
                            <label>Perfil de Acesso *</label>
                            <select
                                className="form-control"
                                name="perfil_acesso"
                                value={form.perfil_acesso}
                                onChange={handleChange}
                                required
                                // Trava o campo quando um não-admin abre um usuário que já é Administrador.
                                disabled={!isUsuarioAdmin && form.perfil_acesso === 'Administrador'}
                            >
                                <option value="">Selecione...</option>
                                {listaPerfis
                                    // "Administrador" só aparece para o login admin.
                                    // Mantém o valor atual ao editar um admin já existente (evita campo em branco).
                                    .filter(p => p.nome !== 'Administrador' || isUsuarioAdmin || form.perfil_acesso === 'Administrador')
                                    .map((p) => (
                                        <option key={p.id} value={p.nome}>
                                            {p.nome}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div style={{marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--line)'}}>
                        <label style={{fontSize:'1rem', fontWeight:'bold', color:'var(--pine-700)', display:'block', marginBottom:'10px'}}>
                            Expertise do Colaborador (Produtos):
                        </label>
                        <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
                            {listaProdutos.length > 0 ? listaProdutos.map(p => (
                                <label key={p.id_produto} style={{display:'flex', alignItems:'center', gap:'5px', background:'#fff', padding:'8px 12px', borderRadius:'4px', border:'1px solid #90caf9', cursor:'pointer'}}>
                                    <input type="checkbox" checked={produtosSelecionados.includes(p.id_produto)} onChange={() => toggleProduto(p.id_produto)} />
                                    <span style={{fontSize:'0.9rem', color:'#333'}}>{p.nome_produto}</span>
                                </label>
                            )) : <p style={{color:'#666', fontStyle:'italic'}}>Nenhum produto cadastrado.</p>}
                        </div>
                    </div>

                    <div className="checkbox-wrapper" style={{marginTop:'15px'}}>
                        <label className="checkbox-label">
                            <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChange} />
                            Usuário Ativo no Sistema (Padrão: Inativo)
                        </label>
                    </div>

                    <div className="form-actions">
                        <button type="submit" className="btn-salvar">Salvar Usuário</button>
                    </div>
                </form>
            ) : (
                <div className="listagem-section">
                    <div className="search-bar">
                        <label><Icon n="search"/> Buscar:</label>
                        <input 
                            type="text" 
                            placeholder="Nome, Login ou CPF..." 
                            value={termoBusca} 
                            onChange={e => setTermoBusca(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && buscarUsuarios()} // Busca ao dar Enter
                        />
                        <button data-busca="1" onClick={buscarUsuarios} className="btn-tab ativo" disabled={buscando}>
                            {buscando ? 'Buscando...' : 'Pesquisar'}
                        </button>
                    </div>
                    {barraFiltros}
                    <div className="table-responsive">
                        {buscando ? (
                            <div style={{textAlign: 'center', padding: '20px', color: '#666'}}>
                                <p>Carregando dados...</p>
                            </div>
                        ) : (
                            <table className="tabela-unidades">
                                <thead><tr><th>Nome</th><th>Login</th><th>Função</th><th>Setor</th><th>Perfil</th><th className="center">Status</th><th className="center">Ação</th></tr></thead>
                                <tbody>
                                    {usuariosFiltrados.length > 0 ? (
                                        usuariosFiltrados.map(u => (
                                            <tr key={u.id_usuario}>
                                                <td>{u.nome_completo}</td>
                                                <td>{u.usuario}</td>
                                                <td>{u.nome_funcao || u.funcao}</td>
                                                <td>{u.nome_setor || u.setor}</td>
                                                <td>{u.perfil_acesso}</td>
                                                <td className="center"><span className={`status-badge ${u.ativo ? 'status-ativo' : 'status-inativo'}`}>{u.ativo ? 'ATIVO' : 'INATIVO'}</span></td>
                                                <td className="center">{permissaoEditar && <button className="btn-editar" onClick={() => handleEditar(u)}><Icon n="edit"/></button>}</td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr><td colSpan="7" style={{textAlign: 'center', color: '#999', padding: '20px'}}>Nenhum usuário encontrado.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}