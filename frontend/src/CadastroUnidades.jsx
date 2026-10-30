/* ARQUIVO: src/CadastroUnidades.js */
import React, { useState, useEffect } from 'react';
import Icon from './components/Icon';
import { useFiltrosLista } from './components/FiltrosLista';
import api from './api';
import './CadastroUnidades.css';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import SeletorCoordenada from './components/SeletorCoordenada';

// Lista estática de estados para o Dropdown
const ESTADOS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

// "-7.119495, -34.845011" (copiado do Google Maps) ou "-7,1194; -34,8450" -> [lat, lng]
const PAR_COORDENADAS = /^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*(?:,\s+|;\s*|\s+|,(?=-))\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/;
const numCoord = (v) => (v === '' || v == null ? null : Number(String(v).trim().replace(',', '.')));
const coordValida = (v, lim) => v !== null && Number.isFinite(v) && Math.abs(v) <= lim;

export default function CadastroUnidades({ aoVoltar }) {
    // --- ESTADOS DO FORMULÁRIO (CADASTRO/EDIÇÃO) ---
    const formInicial = {
        id_unidade: '',
        nome_unidade: '',
        cnes: '',
        id_projeto: '',
        uf: '',
        id_cidade: '',
        latitude: '',
        longitude: '',
        id_macro: '',
        id_micro: '',
        id_tipo_unidade: '',
        ativo: true
    };

    const [form, setForm] = useState(formInicial);
    const [produtosSelecionados, setProdutosSelecionados] = useState([]);
    const [chaveCentro, setChaveCentro] = useState(0); // recentraliza o mini mapa
    const [importacao, setImportacao] = useState({ aberto: false, id_projeto: '', linhas: [], arquivo: '', enviando: false });

    // --- ESTADOS DOS FILTROS (BUSCA) ---
    const [filtros, setFiltros] = useState({
        termo: '',
        projeto: '',
        uf: '',
        id_cidade: '',
        status: 'true' 
    });

    // --- PAGINAÇÃO ---
    const [paginacao, setPaginacao] = useState({
        paginaAtual: 1,
        totalPaginas: 1,
        totalItens: 0,
        limite: 10
    });

    // --- LISTAS ---
    const [listaProjetos, setListaProjetos] = useState([]);
    const [listaCidadesForm, setListaCidadesForm] = useState([]); 
    const [listaCidadesFiltro, setListaCidadesFiltro] = useState([]); 
    const [listaUnidades, setListaUnidades] = useState([]);
    const [listaProdutos, setListaProdutos] = useState([]);
    const [regioesProjeto, setRegioesProjeto] = useState([]);
    const [tiposUnidade, setTiposUnidade] = useState([]); // Hospital (H), Central de Regulação (R), UBS, ESF/PSF... // macros (com micros) do projeto do formulário

    // --- CONTROLE DE TELA ---
    const [modoPesquisa, setModoPesquisa] = useState(true); 

    // --- PERMISSÕES (Default: bloqueado) ---
    const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

    // --- CARREGAMENTO INICIAL ---
    useEffect(() => {
        carregarDadosIniciais();
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // Busca cidades quando a UF muda no FORMULÁRIO
    useEffect(() => {
        if (form.uf) {
            carregarCidades(form.uf, setListaCidadesForm);
        } else {
            setListaCidadesForm([]);
        }
    }, [form.uf]);

    // Macro/Micro regiões do projeto selecionado no FORMULÁRIO (nomenclatura própria de cada projeto)
    useEffect(() => {
        if (!form.id_projeto) { setRegioesProjeto([]); return; }
        api.get(`/regioes/projeto/${form.id_projeto}`)
            .then(r => setRegioesProjeto(Array.isArray(r.data) ? r.data : []))
            .catch(() => setRegioesProjeto([]));
    }, [form.id_projeto]);

    // Busca cidades quando a UF muda no FILTRO
    useEffect(() => {
        if (filtros.uf) {
            carregarCidades(filtros.uf, setListaCidadesFiltro);
        } else {
            setListaCidadesFiltro([]);
        }
    }, [filtros.uf]);

    // Dispara a busca quando muda pagina ou entra no modo pesquisa
    useEffect(() => {
        if (modoPesquisa) {
            carregarUnidades();
        }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoPesquisa, paginacao.paginaAtual]); 

    // --- FUNÇÃO DE LEITURA DE USUÁRIO CORRIGIDA ---
    const getUsuarioLogado = () => {
        try {
            const session = sessionStorage.getItem('usuario_opera');
            if (session) return JSON.parse(session);
        } catch (e) {
            console.error("Erro ao ler sessão:", e);
        }
        return null; 
    };

    const carregarDadosIniciais = async () => {
        try {
            // 1. Projetos (Apenas Ativos)
            const resProjetos = await api.get('/projetos');
            setListaProjetos(resProjetos.data.filter(p => p.ativo));

            // Tipos de unidade (sigla exibida no mapa)
            api.get('/tipos-unidade').then(r => setTiposUnidade(Array.isArray(r.data) ? r.data : [])).catch(() => setTiposUnidade([]));

            // 2. Produtos (Apenas Ativos)
            const resProdutos = await api.get('/produtos');
            setListaProdutos(resProdutos.data.filter(p => p.ativo));

            // 3. Permissões (CORREÇÃO AQUI: BUSCA PELA CHAVE 'unidades')
            const usuarioLogado = getUsuarioLogado();
            
            if (usuarioLogado && usuarioLogado.perfil_acesso) {
                if(usuarioLogado.perfil_acesso === 'Administrador') {
                    setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
                } else {
                    const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                    // A chave deve bater com o CadastroPerfil.js ('unidades')
                    const regra = resRegras.data.find(r => r.nome_modulo === 'unidades');
                    
                    if (regra) {
                        setPermissoes({ 
                            pode_acessar: regra.pode_acessar, 
                            pode_novo: regra.pode_novo, 
                            pode_editar: regra.pode_editar 
                        });
                    }
                }
            }
        } catch (error) { console.error("Erro ao carregar dados:", error); }
    };

    const getNomeResponsavel = () => {
        const user = getUsuarioLogado();
        return user ? (user.nome || user.nome_completo || 'Sistema') : 'Desconhecido';
    };

    const carregarCidades = async (uf, setListFn) => {
        try { const res = await api.get(`/cidades/${uf}`); setListFn(res.data); } catch (e) { setListFn([]); }
    };

    const carregarUnidades = async () => {
        try { 
            const query = new URLSearchParams({
                termo: filtros.termo,
                projeto: filtros.projeto,
                status: filtros.status,
                uf: filtros.uf,
                id_cidade: filtros.id_cidade,
                pagina: paginacao.paginaAtual,
                limite: paginacao.limite
            }).toString();

            const res = await api.get(`/unidades/buscar?${query}`);
            
            if (res.data.dados) {
                setListaUnidades(res.data.dados);
                setPaginacao(prev => ({
                    ...prev,
                    totalPaginas: res.data.totalPaginas,
                    totalItens: res.data.total
                }));
            } else {
                setListaUnidades(res.data);
            }
        } catch (e) { console.error("Erro ao buscar unidades", e); }
    };

    // --- HANDLERS ---

    const handleChangeForm = (e) => {
        const { name, value, type, checked } = e.target;
        
        // [VALIDAÇÃO EM TEMPO REAL] Impede digitar mais de 7 dígitos no CNES
        if (name === 'cnes' && value.length > 7) return;

        // Coordenadas: aceita colar o par "lat, lng" em qualquer um dos campos.
        if (name === 'latitude' || name === 'longitude') {
            const par = value.match(PAR_COORDENADAS);
            if (par) {
                setForm(prev => ({ ...prev, latitude: par[1].replace(',', '.'), longitude: par[2].replace(',', '.') }));
                setChaveCentro(c => c + 1);
                return;
            }
            setForm(prev => ({ ...prev, [name]: value.replace(/[^\d.,-]/g, '') }));
            return;
        }

        setForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
        if(name === 'uf') setForm(prev => ({ ...prev, uf: value, id_cidade: '' }));
        // Regiões pertencem ao projeto; trocar o projeto/macro limpa o nível abaixo.
        if(name === 'id_projeto') setForm(prev => ({ ...prev, id_macro: '', id_micro: '' }));
        if(name === 'id_macro') setForm(prev => ({ ...prev, id_micro: '' }));
    };

    const handleChangeFiltro = (e) => {
        const { name, value } = e.target;
        setFiltros(prev => ({ ...prev, [name]: value }));
        if (name !== 'id_cidade') setPaginacao(prev => ({ ...prev, paginaAtual: 1 }));
        if (name === 'uf') setFiltros(prev => ({ ...prev, uf: value, id_cidade: '' }));
    };

    const toggleProduto = (idProduto) => {
        setProdutosSelecionados(prev => prev.includes(idProduto) ? prev.filter(id => id !== idProduto) : [...prev, idProduto]);
    };

    const handleNovo = () => {
        // Bloqueio Lógico
        if(!permissoes.pode_novo) return;
        
        setForm(formInicial);
        setProdutosSelecionados([]);
        setModoPesquisa(false);
    };

    const handleEditar = async (unidade) => {
        setForm({
            id_unidade: unidade.id_unidade,
            nome_unidade: unidade.nome_unidade,
            cnes: unidade.cnes || '',
            id_projeto: unidade.id_projeto,
            uf: unidade.uf || unidade.estado_sigla || '', 
            id_cidade: unidade.id_cidade || '',
            latitude: unidade.latitude != null ? String(Number(unidade.latitude)) : '',
            longitude: unidade.longitude != null ? String(Number(unidade.longitude)) : '',
            id_macro: unidade.id_macro || '',
            id_micro: unidade.id_micro || '',
            id_tipo_unidade: unidade.id_tipo_unidade || '',
            ativo: unidade.ativo
        });
        setChaveCentro(c => c + 1);

        try {
            const resProd = await api.get(`/unidades/${unidade.id_unidade}/produtos`);
            setProdutosSelecionados(resProd.data.map(p => p.id_produto)); 
        } catch (e) { setProdutosSelecionados([]); }

        setModoPesquisa(false);
    };

    const handleSalvar = async (e) => {
        e.preventDefault();
        
        // Proteção extra no envio
        if (form.id_unidade && !permissoes.pode_editar) return Swal.fire('Sem Permissão', 'Você não tem permissão para editar.', 'error');
        if (!form.id_unidade && !permissoes.pode_novo) return Swal.fire('Sem Permissão', 'Você não tem permissão para criar.', 'error');
        
        if (!form.nome_unidade || !form.id_projeto) return Swal.fire('Atenção', 'Preencha Nome e Projeto.', 'warning');

        // [VALIDAÇÃO] CNES Obrigatório e Máximo 7 Dígitos
        if (!form.cnes) return Swal.fire('Atenção', 'O campo CNES é obrigatório.', 'warning');
        if (form.cnes.length > 7) return Swal.fire('Atenção', 'O CNES deve ter no máximo 7 números.', 'warning');

        // [VALIDAÇÃO] Coordenadas opcionais, mas sempre em par e dentro da faixa.
        const lat = numCoord(form.latitude), lng = numCoord(form.longitude);
        if ((lat === null) !== (lng === null)) return Swal.fire('Atenção', 'Informe latitude e longitude juntas (ou deixe as duas em branco).', 'warning');
        if (lat !== null && (!coordValida(lat, 90) || !coordValida(lng, 180)))
            return Swal.fire('Atenção', 'Coordenadas inválidas. Latitude entre -90 e 90 e longitude entre -180 e 180.', 'warning');

        const payload = { ...form, latitude: lat, longitude: lng, produtos: produtosSelecionados, responsavel_acao: getNomeResponsavel() };

        try {
            await api.post('/unidades/salvar', payload);
            Swal.fire({ icon: 'success', title: 'Salvo!', text: 'Unidade salva com sucesso.', timer: 2000, showConfirmButton: false });
            setModoPesquisa(true);
            carregarUnidades();
        } catch (error) { console.error(error); Swal.fire('Erro', error.response?.data?.erro || 'Erro ao salvar unidade.', 'error'); }
    };

    const cidadeForm = listaCidadesForm.find(c => String(c.id_cidade) === String(form.id_cidade));
    const marcarNoMapa = (lat, lng) => setForm(prev => ({ ...prev, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
    const usarCentroMunicipio = () => {
        if (!cidadeForm || cidadeForm.latitude == null) return Swal.fire('Atenção', 'Selecione um município com coordenada cadastrada.', 'warning');
        setForm(prev => ({ ...prev, latitude: String(Number(cidadeForm.latitude)), longitude: String(Number(cidadeForm.longitude)) }));
        setChaveCentro(c => c + 1);
    };
    const limparCoordenadas = () => setForm(prev => ({ ...prev, latitude: '', longitude: '' }));

    // --- IMPORTAÇÃO DE COORDENADAS (planilha CNES / LATITUDE / LONGITUDE) ---
    const baixarModelo = () => {
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['CNES', 'LATITUDE', 'LONGITUDE'], ['2399717', -7.119495, -34.845011]]), 'Coordenadas');
        XLSX.writeFile(wb, 'Modelo_Coordenadas_Unidades.xlsx');
    };

    const lerPlanilha = (e) => {
        const arq = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!arq) return;
        const leitor = new FileReader();
        leitor.onload = (ev) => {
            try {
                const wb = XLSX.read(ev.target.result, { type: 'array' });
                const bruto = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
                const chave = (obj, nomes) => {
                    const k = Object.keys(obj).find(c => nomes.includes(c.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase()));
                    return k ? obj[k] : '';
                };
                const linhas = bruto.map(l => ({
                    cnes: String(chave(l, ['CNES'])).trim(),
                    latitude: String(chave(l, ['LATITUDE', 'LAT'])).trim(),
                    longitude: String(chave(l, ['LONGITUDE', 'LONG', 'LNG', 'LON'])).trim()
                })).filter(l => l.cnes || l.latitude || l.longitude);
                if (!linhas.length) return Swal.fire('Atenção', 'Nenhuma linha encontrada. Use as colunas CNES, LATITUDE e LONGITUDE.', 'warning');
                setImportacao(prev => ({ ...prev, linhas, arquivo: arq.name }));
            } catch (err) { Swal.fire('Erro', 'Não foi possível ler a planilha.', 'error'); }
        };
        leitor.readAsArrayBuffer(arq);
    };

    const enviarImportacao = async () => {
        if (!importacao.linhas.length) return Swal.fire('Atenção', 'Selecione a planilha.', 'warning');
        setImportacao(prev => ({ ...prev, enviando: true }));
        try {
            const r = await api.post('/unidades/coordenadas/importar', { id_projeto: importacao.id_projeto || null, linhas: importacao.linhas });
            const erros = r.data.resultado.filter(x => x.status === 'ERRO');
            const html = erros.length
                ? `<div style="max-height:220px;overflow:auto;text-align:left;font-size:.82rem">${erros.slice(0, 200).map(x => `Linha ${x.linha} - CNES ${x.cnes || '(vazio)'}: ${x.motivo}`).join('<br/>')}</div>`
                : '';
            Swal.fire({ icon: erros.length ? 'warning' : 'success', title: `${r.data.atualizadas} unidade(s) atualizada(s)`, html: erros.length ? `<b>${erros.length} linha(s) com erro:</b>${html}` : 'Todas as linhas foram importadas.' });
            setImportacao({ aberto: false, id_projeto: '', linhas: [], arquivo: '', enviando: false });
            carregarUnidades();
        } catch (error) {
            Swal.fire('Erro', error.response?.data?.erro || 'Falha na importação.', 'error');
            setImportacao(prev => ({ ...prev, enviando: false }));
        }
    };

    const handleLimparFiltros = () => {
        setFiltros({ termo: '', projeto: '', uf: '', id_cidade: '', status: 'Todos' });
        carregarUnidades();
    };

    const mudarPagina = (novaPagina) => {
        if (novaPagina >= 1 && novaPagina <= paginacao.totalPaginas) {
            setPaginacao(prev => ({ ...prev, paginaAtual: novaPagina }));
        }
    };

    // Filtros rápidos adicionais sobre a lista carregada
    const [unidadesFiltradas, barraFiltros] = useFiltrosLista(listaUnidades, [
        { chave: 'tipo', rotulo: 'Tipo', valor: u => u.nome_tipo },
        { chave: 'cidade', rotulo: 'Cidade/UF', valor: u => (u.nome_cidade ? `${u.nome_cidade}/${u.uf || u.estado_sigla}` : '') },
        { chave: 'geo', rotulo: 'Georreferenciada', valor: u => (u.latitude != null && u.longitude != null ? 'Sim' : 'Não') },
        { chave: 'cnes', rotulo: 'CNES', valor: u => (u.cnes ? 'Com CNES' : 'Sem CNES') }
    ]);

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title">
                    <span className="icon"><Icon n="hospital"/></span><h2>Gestão de Unidades</h2>
                </div>
                <div>
                    {permissoes.pode_novo && (
                        <button className={`btn-tab ${!modoPesquisa ? 'ativo' : ''}`} onClick={handleNovo}>Novo</button>
                    )}
                    <button className={`btn-tab ${modoPesquisa ? 'ativo' : ''}`} onClick={() => setModoPesquisa(true)}>Pesquisar</button>
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            {!modoPesquisa ? (
                /* --- FORMULÁRIO (CADASTRO) --- */
                <form className="form-card" onSubmit={handleSalvar}>
                    <h3>{form.id_unidade ? 'Editar Unidade' : 'Nova Unidade'}</h3>
                    <div className="form-row">
                        <div className="form-group flex-2">
                            <label>Nome da Unidade *</label>
                            <input type="text" className="form-control" name="nome_unidade" value={form.nome_unidade} onChange={handleChangeForm} placeholder="Ex: UBS Centro..." required />
                        </div>
                        <div className="form-group flex-1">
                            <label>CNES * (Max: 7)</label>
                            <input 
                                type="number" 
                                className="form-control" 
                                name="cnes" 
                                value={form.cnes} 
                                onChange={handleChangeForm} 
                                placeholder="Somente números" 
                                required
                                maxLength={7} // Ajuda visual no HTML5
                            />
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group flex-2">
                            <label>Projeto Pertencente *</label>
                            <select className="form-control" name="id_projeto" value={form.id_projeto} onChange={handleChangeForm} required>
                                <option value="">-- Selecione --</option>
                                {listaProjetos.map(proj => (<option key={proj.id_projeto} value={proj.id_projeto}>{proj.nome_projeto}</option>))}
                            </select>
                        </div>
                        <div className="form-group-local">
                            <div className="campo-uf">
                                <label>UF</label>
                                <select className="form-control" name="uf" value={form.uf} onChange={handleChangeForm}>
                                    <option value="">-</option>
                                    {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                                </select>
                            </div>
                            <div className="campo-cidade">
                                <label>Município</label>
                                <select className="form-control" name="id_cidade" value={form.id_cidade} onChange={handleChangeForm} disabled={!form.uf}>
                                    <option value="">{form.uf ? '-- Selecione --' : 'Selecione UF'}</option>
                                    {listaCidadesForm.map(cid => (<option key={cid.id_cidade} value={cid.id_cidade}>{cid.nome_cidade}</option>))}
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="form-row">
                        <div className="form-group flex-1">
                            <label>Tipo de Unidade</label>
                            <select className="form-control" name="id_tipo_unidade" value={form.id_tipo_unidade} onChange={handleChangeForm}>
                                <option value="">-- Selecione --</option>
                                {tiposUnidade.filter(t => t.ativo || String(t.id_tipo_unidade) === String(form.id_tipo_unidade)).map(t => (
                                    <option key={t.id_tipo_unidade} value={t.id_tipo_unidade}>{t.sigla} - {t.nome_tipo}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group flex-1">
                            <label>Macro Região</label>
                            <select className="form-control" name="id_macro" value={form.id_macro} onChange={handleChangeForm} disabled={!form.id_projeto || !regioesProjeto.length}>
                                <option value="">{!form.id_projeto ? 'Selecione o projeto' : regioesProjeto.length ? '-- Sem macro --' : 'Projeto sem regiões cadastradas'}</option>
                                {regioesProjeto.filter(m => m.ativo || String(m.id_macro) === String(form.id_macro)).map(m => (
                                    <option key={m.id_macro} value={m.id_macro}>{m.nome_macro}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group flex-1">
                            <label>Micro Região</label>
                            <select className="form-control" name="id_micro" value={form.id_micro} onChange={handleChangeForm} disabled={!form.id_macro}>
                                <option value="">-- Sem micro --</option>
                                {(regioesProjeto.find(m => String(m.id_macro) === String(form.id_macro))?.micros || [])
                                    .filter(mi => mi.ativo || String(mi.id_micro) === String(form.id_micro))
                                    .map(mi => <option key={mi.id_micro} value={mi.id_micro}>{mi.nome_micro}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="geo-section">
                        <h4>Localização da Unidade (Georreferenciamento)</h4>
                        <div className="form-row" style={{ marginBottom: 0 }}>
                            <div className="form-group flex-1">
                                <label>Latitude</label>
                                <input type="text" inputMode="decimal" className="form-control" name="latitude" value={form.latitude} onChange={handleChangeForm} onBlur={() => setChaveCentro(c => c + 1)} placeholder="-7.119495" />
                            </div>
                            <div className="form-group flex-1">
                                <label>Longitude</label>
                                <input type="text" inputMode="decimal" className="form-control" name="longitude" value={form.longitude} onChange={handleChangeForm} onBlur={() => setChaveCentro(c => c + 1)} placeholder="-34.845011" />
                            </div>
                            <div className="geo-acoes">
                                <button type="button" className="geo-btn" onClick={usarCentroMunicipio}><Icon n="pin"/> Centro do município</button>
                                <button type="button" className="geo-btn" onClick={limparCoordenadas}><Icon n="x"/> Limpar</button>
                            </div>
                        </div>
                        <div style={{ marginTop: 8 }}>
                            {form.latitude !== '' && form.longitude !== ''
                                ? <span className="geo-status ok">Unidade georreferenciada</span>
                                : <span className="geo-status aprox">Sem coordenada - o mapa usará o centro do município</span>}
                        </div>
                        <SeletorCoordenada latitude={form.latitude} longitude={form.longitude}
                            latCidade={cidadeForm ? cidadeForm.latitude : null} lngCidade={cidadeForm ? cidadeForm.longitude : null}
                            chaveCentro={chaveCentro} aoMarcar={marcarNoMapa}
                            somenteLeitura={form.id_unidade ? !permissoes.pode_editar : !permissoes.pode_novo} />
                    </div>
                    <div className="produtos-section">
                        <h4>Produtos Vinculados:</h4>
                        <div className="products-grid">
                            {listaProdutos.map(prod => (
                                <div key={prod.id_produto} className={`product-item ${produtosSelecionados.includes(prod.id_produto) ? 'selected' : ''}`} onClick={() => toggleProduto(prod.id_produto)}>
                                    <input type="checkbox" checked={produtosSelecionados.includes(prod.id_produto)} readOnly />
                                    <span>{prod.nome_produto}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="checkbox-wrapper">
                        <label className="checkbox-label">
                            <input type="checkbox" name="ativo" checked={form.ativo} onChange={handleChangeForm} /> 
                            Unidade Ativa
                        </label>
                    </div>
                    <div className="form-actions">
                        {/* Botão Salvar condicional */}
                        {(!form.id_unidade && permissoes.pode_novo) || (form.id_unidade && permissoes.pode_editar) ? (
                            <button type="submit" className="btn-salvar">Salvar Unidade</button>
                        ) : <span style={{color: '#999', fontStyle: 'italic'}}>Você não tem permissão para salvar alterações.</span>}
                    </div>
                </form>
            ) : (
                /* --- LISTAGEM COM FILTROS AVANÇADOS --- */
                <div className="listagem-section">
                    {permissoes.pode_editar && (
                        importacao.aberto ? (
                            <div className="geo-importar">
                                <b><Icon n="upload"/> Importar coordenadas por planilha</b>
                                <p>Colunas: <b>CNES</b>, <b>LATITUDE</b>, <b>LONGITUDE</b> (.xlsx ou .csv). Atualiza apenas as coordenadas das unidades encontradas pelo CNES.</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-end' }}>
                                    <div style={{ minWidth: '220px' }}>
                                        <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>Restringir ao projeto (opcional):</label>
                                        <select className="form-control" value={importacao.id_projeto} onChange={e => setImportacao(prev => ({ ...prev, id_projeto: e.target.value }))}>
                                            <option value="">Todos os projetos</option>
                                            {listaProjetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                                        </select>
                                    </div>
                                    <label className="btn-tab" style={{ height: '38px', margin: 0, display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                                        <Icon n="file"/>&nbsp;{importacao.arquivo || 'Selecionar planilha'}
                                        <input type="file" accept=".xlsx,.xls,.csv" onChange={lerPlanilha} style={{ display: 'none' }} />
                                    </label>
                                    <button className="btn-tab" style={{ height: '38px', margin: 0, background: '#eee', color: '#555' }} onClick={baixarModelo}><Icon n="download"/> Modelo</button>
                                    <button className="btn-tab ativo" style={{ height: '38px', margin: 0 }} onClick={enviarImportacao} disabled={importacao.enviando || !importacao.linhas.length}>
                                        {importacao.enviando ? 'Importando...' : `Importar${importacao.linhas.length ? ` (${importacao.linhas.length})` : ''}`}
                                    </button>
                                    <button className="btn-tab" style={{ height: '38px', margin: 0, background: '#eee', color: '#555' }} onClick={() => setImportacao({ aberto: false, id_projeto: '', linhas: [], arquivo: '', enviando: false })}>Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' }}>
                                <button className="btn-tab" style={{ margin: 0 }} onClick={() => setImportacao(prev => ({ ...prev, aberto: true }))}><Icon n="upload"/> Importar coordenadas</button>
                            </div>
                        )
                    )}
                    <div className="search-bar-advanced" style={{display: 'flex', flexWrap: 'wrap', gap: '10px', background: '#fff', padding: '15px', borderRadius: '8px', marginBottom: '15px', boxShadow: '0 2px 5px rgba(0,0,0,0.05)'}}>
                        <div style={{flex: 2, minWidth: '200px'}}>
                            <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>Buscar (Nome/CNES):</label>
                            <input type="text" className="form-control" name="termo" placeholder="Digite..." value={filtros.termo} onChange={handleChangeFiltro} />
                        </div>
                        <div style={{flex: 1, minWidth: '150px'}}>
                            <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>Projeto:</label>
                            <select className="form-control" name="projeto" value={filtros.projeto} onChange={handleChangeFiltro}>
                                <option value="">Todos</option>
                                {listaProjetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                            </select>
                        </div>
                        <div style={{width: '80px'}}>
                            <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>UF:</label>
                            <select className="form-control" name="uf" value={filtros.uf} onChange={handleChangeFiltro}>
                                <option value="">Todas</option>
                                {ESTADOS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                            </select>
                        </div>
                        <div style={{flex: 1, minWidth: '150px'}}>
                            <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>Cidade:</label>
                            <select className="form-control" name="id_cidade" value={filtros.id_cidade} onChange={handleChangeFiltro} disabled={!filtros.uf}>
                                <option value="">Todas</option>
                                {listaCidadesFiltro.map(c => <option key={c.id_cidade} value={c.id_cidade}>{c.nome_cidade}</option>)}
                            </select>
                        </div>
                        <div style={{width: '120px'}}>
                            <label style={{display:'block', fontSize:'0.8rem', color:'#666', marginBottom:'4px'}}>Status:</label>
                            <select className="form-control" name="status" value={filtros.status} onChange={handleChangeFiltro}>
                                <option value="Todos">Todos</option>
                                <option value="true">Ativos</option>
                                <option value="false">Inativos</option>
                            </select>
                        </div>
                        <div style={{display:'flex', alignItems:'flex-end', gap: '5px'}}>
                            <button className="btn-tab ativo" data-busca="1" onClick={carregarUnidades} style={{height: '38px', margin:0}}><Icon n="search"/> Filtrar</button>
                            <button className="btn-tab" onClick={handleLimparFiltros} style={{height: '38px', margin:0, background: '#eee', color: '#555'}}>Limpar</button>
                        </div>
                    </div>

                    {barraFiltros}
                    <div className="table-responsive">
                        <table className="tabela-unidades">
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th className="center">Tipo</th>
                                    <th>CNES</th>
                                    <th>Projeto</th>
                                    <th>Cidade/UF</th>
                                    <th className="center">Geo</th>
                                    <th className="center">Status</th>
                                    <th className="center">Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {unidadesFiltradas.map(uni => (
                                    <tr key={uni.id_unidade}>
                                        <td>{uni.nome_unidade}</td>
                                        <td className="center" title={uni.nome_tipo || 'Sem tipo'}>{uni.sigla_tipo ? <span className="tipo-unidade-badge">{uni.sigla_tipo}</span> : '-'}</td>
                                        <td>{uni.cnes || '-'}</td>
                                        <td>{uni.nome_projeto || uni.id_projeto}</td>
                                        <td>{uni.nome_cidade ? `${uni.nome_cidade}/${uni.uf || uni.estado_sigla}` : '-'}</td>
                                        <td className="center">
                                            {uni.latitude != null && uni.longitude != null
                                                ? <span title={`${Number(uni.latitude).toFixed(6)}, ${Number(uni.longitude).toFixed(6)}`} style={{ color: 'var(--pine)' }}><Icon n="pin"/></span>
                                                : <span title="Sem coordenada (usa o centro do município)" style={{ color: '#bbb' }}>-</span>}
                                        </td>
                                        <td className="center">
                                            <span className={`status-badge ${uni.ativo ? 'status-ativo' : 'status-inativo'}`}>
                                                {uni.ativo ? 'ATIVO' : 'INATIVO'}
                                            </span>
                                        </td>
                                        <td className="center">
                                            {/* Botão Editar condicional */}
                                            {permissoes.pode_editar ? (
                                                <button className="btn-editar" onClick={() => handleEditar(uni)}><Icon n="edit"/></button>
                                            ) : <span title="Sem permissão"><Icon n="lock"/></span>}
                                        </td>
                                    </tr>
                                ))}
                                {unidadesFiltradas.length === 0 && (
                                    <tr><td colSpan="8" className="center">Nenhuma unidade encontrada.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* PAGINAÇÃO */}
                    {paginacao.totalPaginas > 1 && (
                        <div className="paginacao-container" style={{display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px', marginTop: '20px'}}>
                            <button 
                                className="btn-tab" 
                                onClick={() => mudarPagina(paginacao.paginaAtual - 1)} 
                                disabled={paginacao.paginaAtual === 1}
                                style={{opacity: paginacao.paginaAtual === 1 ? 0.5 : 1}}
                            >
                                ◀ Anterior
                            </button>
                            <span style={{fontWeight: 'bold', color: '#555'}}>
                                Página {paginacao.paginaAtual} de {paginacao.totalPaginas}
                            </span>
                            <button 
                                className="btn-tab" 
                                onClick={() => mudarPagina(paginacao.paginaAtual + 1)} 
                                disabled={paginacao.paginaAtual === paginacao.totalPaginas}
                                style={{opacity: paginacao.paginaAtual === paginacao.totalPaginas ? 0.5 : 1}}
                            >
                                Próximo ▶
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}