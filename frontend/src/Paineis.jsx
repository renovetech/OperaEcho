/* ARQUIVO: src/Paineis.js */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Icon from './components/Icon';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import api from './api'; 
import 'leaflet/dist/leaflet.css';
import './Paineis.css'; 
import L from 'leaflet';
import Swal from 'sweetalert2';
import { periodoBloqueado } from './periodo';

const TITULOS_PAINEL = {
    implatacao_consolidada: 'Implantações Consolidadas',
    produtividade: 'Produtividade Individual',
    produtos_detalhado: 'Produtividade por Unidade',
    metricas_implantacao: 'Métricas da Implantação'
};

import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({ iconUrl: icon, shadowUrl: iconShadow, iconSize: [25, 41], iconAnchor: [12, 41] });
L.Marker.prototype.options.icon = DefaultIcon;

const DEFAULT_CENTER = [-10.5000, -48.5000]; 
const DEFAULT_ZOOM = 5; 

function MapController({ center, zoom }) {
    const map = useMap();
    useEffect(() => { 
        if (center) map.flyTo(center, zoom, { duration: 1.5 }); 
    }, [center, zoom, map]); 
    return null;
}

const formatarNomeGrafico = (nomeCompleto) => {
    if (!nomeCompleto) return '';
    const partes = nomeCompleto.trim().split(' ');
    if (partes.length === 1) return partes[0];
    return `${partes[0]} ${partes[partes.length - 1]}`; 
};

export default function Paineis({ tipoPainel, aoVoltar }) {
    const [dataInicio, setDataInicio] = useState('');
    const [dataFim, setDataFim] = useState('');
    const [loading, setLoading] = useState(false);
    
    const [dadosMapa, setDadosMapa] = useState([]); 
    const [dadosProdutividade, setDadosProdutividade] = useState([]);
    const [dadosProdutos, setDadosProdutos] = useState({ geral: [], detalheImplantadores: [] });
    const [, setDadosMetricas] = useState([]);
    const [metricasAgrupadas, setMetricasAgrupadas] = useState([]); 

    const [usuariosAtivos, setUsuariosAtivos] = useState([]);

    const [produtoSelecionado, setProdutoSelecionado] = useState(null);
    const [listaDetalheProduto, setListaDetalheProduto] = useState([]);

    const [itemSelecionado, setItemSelecionado] = useState(null); 
    const [unidadeSelecionada, setUnidadeSelecionada] = useState(null); 
    const [filtroMapa, setFiltroMapa] = useState('Implantação'); 
    
    const [projetoSelecionadoMapa, setProjetoSelecionadoMapa] = useState(null);

    const [detalhesProdutividade, setDetalhesProdutividade] = useState([]);
    const [detalheTitulo, setDetalheTitulo] = useState('Clique em um card para ver detalhes');
    
    const isMounted = useRef(false);
    const [acessoLiberado, setAcessoLiberado] = useState(false);

    useEffect(() => {
        const verificarAcesso = async () => {
            try {
                const session = sessionStorage.getItem('usuario_opera');
                const usuarioLogado = session ? JSON.parse(session) : null;

                if (usuarioLogado && usuarioLogado.perfil_acesso) {
                    if (usuarioLogado.perfil_acesso === 'Administrador') {
                        setAcessoLiberado(true);
                        return;
                    }
                    let moduloKey = '';
                    switch (tipoPainel) {
                        case 'implatacao_consolidada': moduloKey = 'painel_consolidado'; break;
                        case 'produtividade': moduloKey = 'painel_prod_ind'; break;
                        case 'produtos_detalhado': moduloKey = 'painel_prod_uni'; break;
                        case 'metricas_implantacao': moduloKey = 'painel_metricas'; break;
                        default: moduloKey = '';
                    }

                    if (moduloKey) {
                        const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                        const regra = resRegras.data.find(r => r.nome_modulo === moduloKey);
                        if (regra && regra.pode_acessar) setAcessoLiberado(true);
                        else Swal.fire('Acesso Negado', 'Você não tem permissão para visualizar este painel.', 'error').then(() => aoVoltar());
                    } else setAcessoLiberado(true); 
                } else aoVoltar();
            } catch (error) {
                console.error("Erro ao verificar permissão painel:", error);
                aoVoltar();
            }
        };
        verificarAcesso();
    }, [tipoPainel, aoVoltar]);

    useEffect(() => {
        if (acessoLiberado) {
            api.get('/implantadores').then(res => {
                const nomesAtivos = res.data.map(u => u.nome_completo.toUpperCase());
                setUsuariosAtivos(nomesAtivos);
            }).catch(console.error);
        }
    }, [acessoLiberado]);

    const isImplantadorAtivo = (nome) => {
        if (!nome) return false;
        return usuariosAtivos.includes(nome.toUpperCase());
    };

    const processarMetricas = (dados) => {
        const agrupado = {};
        dados.forEach(d => {
            if (!agrupado[d.implantador]) {
                agrupado[d.implantador] = { 
                    nome: d.implantador, 
                    produtosImplantacao: [], 
                    produtosTreinamento: [], 
                    totalGeral: d.total_real_implantador || 0 
                };
            }
            if (d.qtd_implantacao > 0) agrupado[d.implantador].produtosImplantacao.push({ nome: d.produto, qtd: d.qtd_implantacao });
            if (d.qtd_treinamento > 0) agrupado[d.implantador].produtosTreinamento.push({ nome: d.produto, qtd: d.qtd_treinamento });
        });
        setMetricasAgrupadas(Object.values(agrupado).sort((a, b) => b.totalGeral - a.totalGeral));
    };

    const carregarDados = async (usarFiltros = false) => {
        if (loading) return;
        setLoading(true);
        try {
            let params = '';
            if (usarFiltros && dataInicio && dataFim) params = `?dataInicio=${dataInicio}&dataFim=${dataFim}`;

            if (tipoPainel === 'produtividade') {
                const response = await api.get(`/dashboard/estatisticas-produtividade${params}`);
                if (isMounted.current) setDadosProdutividade(response.data || []);
            } else if (tipoPainel === 'implatacao_consolidada') {
                const response = await api.get(`/dashboard/mapa-implantacao${params}`);
                if (isMounted.current) setDadosMapa(response.data || []);
            } else if (tipoPainel === 'produtos_detalhado') {
                const response = await api.get('/dashboard/produtividade-produtos'); 
                if (isMounted.current) {
                    setDadosProdutos(response.data || { geral: [], detalheImplantadores: [] });
                    if (produtoSelecionado && usarFiltros) carregarDetalhesProduto(produtoSelecionado);
                }
            } else if (tipoPainel === 'metricas_implantacao') {
                const response = await api.get(`/dashboard/metricas-implantacao${params}`);
                if (isMounted.current) processarMetricas(response.data || []);
            }
        } catch (error) { console.error("Erro ao buscar dados:", error); } 
        finally { if (isMounted.current) setLoading(false); }
    };

    const carregarDetalhesProduto = async (nomeProduto) => {
        try {
            setLoading(true);
            let params = `?nome_produto=${encodeURIComponent(nomeProduto)}`;
            if (dataInicio && dataFim) params += `&dataInicio=${dataInicio}&dataFim=${dataFim}`;
            const res = await api.get(`/dashboard/detalhes-produto${params}`);
            if (isMounted.current) {
                setListaDetalheProduto(res.data || []);
                setProdutoSelecionado(nomeProduto);
            }
        } catch (e) { console.error(e); } finally { if (isMounted.current) setLoading(false); }
    };

    useEffect(() => {
        if (!acessoLiberado) return;
        isMounted.current = true;
        setDadosProdutividade([]); setDadosMapa([]); setDetalhesProdutividade([]); setDadosProdutos({ geral: [], detalheImplantadores: [] }); setDadosMetricas([]); setMetricasAgrupadas([]);
        setProdutoSelecionado(null); setListaDetalheProduto([]);
        setDataInicio(''); setDataFim('');
        setItemSelecionado(null); setUnidadeSelecionada(null); setProjetoSelecionadoMapa(null);
        carregarDados(false);
        return () => { isMounted.current = false; };
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipoPainel, acessoLiberado]);

    const handleFiltrar = () => { if (periodoBloqueado(dataInicio, dataFim)) return; carregarDados(true); };
    
    const handleLimpar = () => { 
        setDataInicio(''); setDataFim(''); setProdutoSelecionado(null); setItemSelecionado(null); setUnidadeSelecionada(null); setProjetoSelecionadoMapa(null);
        setTimeout(() => carregarDados(false), 50); 
    };

    const buscarDetalhesAntigo = async (implantador) => {
        try {
            setDetalheTitulo(`Carregando: ${implantador}...`);
            let params = `?implantador=${implantador}`;
            if (dataInicio && dataFim) params += `&dataInicio=${dataInicio}&dataFim=${dataFim}`;
            const res = await api.get(`/dashboard/detalhe-produtividade${params}`);
            if (isMounted.current) { setDetalhesProdutividade(res.data || []); setDetalheTitulo(`Histórico: ${implantador}`); }
        } catch (error) { console.error(error); }
    };

    const dadosFiltradosPorMotivo = useMemo(() => dadosMapa.filter(item => (item.motivos||'Implantação').includes(filtroMapa)), [dadosMapa, filtroMapa]);

    const listaProjetosUnicos = useMemo(() => {
        const projetos = [...new Set(dadosFiltradosPorMotivo.map(d => d.nome_projeto).filter(Boolean))];
        return projetos.sort();
    }, [dadosFiltradosPorMotivo]);

    const dadosAgrupadosPorCidade = useMemo(() => {
        const grupos = {};
        dadosFiltradosPorMotivo.forEach(item => { 
            if(!item.latitude) return;
            if(projetoSelecionadoMapa && item.nome_projeto !== projetoSelecionadoMapa) return;
            const key = `${item.latitude},${item.longitude}`; 
            if (!grupos[key]) grupos[key] = { lat: item.latitude, lng: item.longitude, cidade: item.cidade, estado: item.estado, projeto: item.nome_projeto, profissionais_total: 0, unidadesMap: {} }; 
            grupos[key].profissionais_total += (item.profissionais_env || 0);
            const nomeUni = item.nome_unidade; 
            if (!grupos[key].unidadesMap[nomeUni]) grupos[key].unidadesMap[nomeUni] = { totalProfissionais: 0, registros: [] };
            grupos[key].unidadesMap[nomeUni].totalProfissionais += (item.profissionais_env || 0);
            grupos[key].unidadesMap[nomeUni].registros.push(item);
        });
        return Object.values(grupos).map(g => ({ 
            ...g, unidades: Object.keys(g.unidadesMap).map(nome => {
                const dadosUni = g.unidadesMap[nome];
                return { nome: nome, profissionais: dadosUni.totalProfissionais, data_inicio: dadosUni.registros[0]?.data_inicio, data_fim: dadosUni.registros[0]?.data_fim };
            }) 
        }));
    }, [dadosFiltradosPorMotivo, projetoSelecionadoMapa]);
    
    const listaUnidadesDoProjeto = useMemo(() => {
        if (!projetoSelecionadoMapa) return [];
        const unidadesBrutas = dadosFiltradosPorMotivo.filter(d => d.nome_projeto === projetoSelecionadoMapa);
        const mapaUnico = new Map();
        const listaFinal = [];
        unidadesBrutas.forEach(u => {
            if(!mapaUnico.has(u.nome_unidade)) {
                mapaUnico.set(u.nome_unidade, true);
                listaFinal.push({
                    nome: u.nome_unidade,
                    profissionais: u.profissionais_env || 0,
                    data_inicio: u.data_inicio,
                    data_fim: u.data_fim
                });
            }
        });
        return listaFinal.sort((a,b) => a.nome.localeCompare(b.nome));
    }, [projetoSelecionadoMapa, dadosFiltradosPorMotivo]);

    const kpiDataEvento = useMemo(() => {
        if (unidadeSelecionada && unidadeSelecionada.data_inicio) {
            const d1 = new Date(unidadeSelecionada.data_inicio); d1.setMinutes(d1.getMinutes() + d1.getTimezoneOffset());
            const s1 = d1.toLocaleDateString('pt-BR');
            if (unidadeSelecionada.data_fim) {
                const d2 = new Date(unidadeSelecionada.data_fim); d2.setMinutes(d2.getMinutes() + d2.getTimezoneOffset());
                const s2 = d2.toLocaleDateString('pt-BR');
                if (s1 !== s2) return `${s1} até ${s2}`;
            }
            return s1;
        }
        return "-";
    }, [unidadeSelecionada]);

    const kpiProfissionais = useMemo(() => { 
        if (filtroMapa === 'Visita Técnica' || filtroMapa === 'Apoio ao Projeto') return 0;
        if (unidadeSelecionada && unidadeSelecionada.profissionais !== undefined) return unidadeSelecionada.profissionais;
        if (itemSelecionado) return itemSelecionado.profissionais_total;
        const base = projetoSelecionadoMapa ? dadosFiltradosPorMotivo.filter(d => d.nome_projeto === projetoSelecionadoMapa) : dadosFiltradosPorMotivo;
        return base.reduce((acc, curr) => acc + (curr.profissionais_env || 0), 0);
    }, [unidadeSelecionada, itemSelecionado, dadosFiltradosPorMotivo, projetoSelecionadoMapa, filtroMapa]);

    const kpiVisitasTecnicas = useMemo(() => {
        if (filtroMapa !== 'Visita Técnica' && filtroMapa !== 'Apoio ao Projeto') return 0;
        const base = projetoSelecionadoMapa ? dadosFiltradosPorMotivo.filter(d => d.nome_projeto === projetoSelecionadoMapa) : dadosFiltradosPorMotivo;
        return base.length;
    }, [dadosFiltradosPorMotivo, projetoSelecionadoMapa, filtroMapa]);

    const handlePinoClick = (local) => { setItemSelecionado(local); setUnidadeSelecionada(null); };

    const handleProjetoClick = (nomeProj) => {
        setProjetoSelecionadoMapa(nomeProj);
        setItemSelecionado(null);
        setUnidadeSelecionada(null);
    };

    const handleUnidadeClick = (unidade) => {
        setUnidadeSelecionada(unidade);
    };

    const mapCenter = useMemo(() => {
        if(itemSelecionado) return [itemSelecionado.lat, itemSelecionado.lng];
        if(projetoSelecionadoMapa) {
            const ponto = dadosFiltradosPorMotivo.find(d => d.nome_projeto === projetoSelecionadoMapa && d.latitude);
            if(ponto) return [ponto.latitude, ponto.longitude];
        }
        return DEFAULT_CENTER;
    }, [itemSelecionado, projetoSelecionadoMapa, dadosFiltradosPorMotivo]);

    const mapZoom = (itemSelecionado || projetoSelecionadoMapa) ? 8 : DEFAULT_ZOOM;

    const estiloContainer = { padding: '20px', backgroundColor: '#f0f2f5', height: 'calc(100vh - var(--rodape-h, 0px))', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflowY: (tipoPainel === 'produtos_detalhado' || tipoPainel === 'metricas_implantacao' || tipoPainel === 'produtividade') ? 'auto' : 'hidden', overflowX: 'hidden' };

    if (!acessoLiberado) return <div className="cadastro-container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 'calc(100vh - var(--rodape-h, 0px))' }}><p>Verificando permissões...</p></div>;

    const renderMetricasImplantacao = () => (
        <div className="grid-metricas-container">
            {metricasAgrupadas.length === 0 ? <div className="empty-state"><span style={{fontSize: '3rem'}}><Icon n="folder"/></span><p>Nenhum registro encontrado.</p></div> : 
                metricasAgrupadas.filter(imp => isImplantadorAtivo(imp.nome)).map((imp, idx) => (
                    <div key={idx} className="card-implantador-skill">
                        <div className="card-header-skill"><div className="avatar-letra">{imp.nome.charAt(0)}</div><div style={{flex:1}}><h3>{imp.nome}</h3><span className="badge-total">{imp.totalGeral} Atividades</span></div></div>
                        <div className="card-body-skill">
                            <div className="coluna-skill"><h5 style={{color: 'var(--pine)', borderBottom: '2px solid var(--pine)', marginBottom:'5px', paddingBottom:'2px'}}>IMPLANTAÇÃO <small>({imp.produtosImplantacao.reduce((acc,p)=>acc+p.qtd, 0)})</small></h5><ul className="lista-produtos">{imp.produtosImplantacao.length > 0 ? imp.produtosImplantacao.map((prod, i) => (<li key={i}><span>{prod.nome}</span><span className="qtd-tag green">{prod.qtd}</span></li>)) : <li className="empty">Nenhum</li>}</ul></div>
                            <div className="coluna-skill"><h5 style={{color: 'var(--pine-700)', borderBottom: '2px solid var(--pine-700)', marginBottom:'5px', paddingBottom:'2px'}}>TREINAMENTO <small>({imp.produtosTreinamento.reduce((acc,p)=>acc+p.qtd, 0)})</small></h5><ul className="lista-produtos">{imp.produtosTreinamento.length > 0 ? imp.produtosTreinamento.map((prod, i) => (<li key={i}><span>{prod.nome}</span><span className="qtd-tag blue">{prod.qtd}</span></li>)) : <li className="empty">Nenhum</li>}</ul></div>
                        </div>
                    </div>
                ))
            }
        </div>
    );

    const renderProdutividadeIndividual = () => {
        const dadosFiltrados = dadosProdutividade.filter(dado => isImplantadorAtivo(dado.implantador));
        const dadosOrdenados = [...dadosFiltrados].sort((a, b) => {
            const totalA = a.total_atividades_real ?? (a.qtd_implantacao + a.qtd_treinamento + a.qtd_visita + (a.qtd_apoio || 0));
            const totalB = b.total_atividades_real ?? (b.qtd_implantacao + b.qtd_treinamento + b.qtd_visita + (b.qtd_apoio || 0));
            return totalB - totalA;
        });

        return (
            <div className="layout-produtividade-cards">
                <div className="grid-performance">
                    {dadosOrdenados.map((dado, index) => {
                        const total = dado.total_atividades_real ?? (dado.qtd_implantacao + dado.qtd_treinamento + dado.qtd_visita + (dado.qtd_apoio || 0));
                        if (total === 0) return null;
                        return (
                            <div key={index} className="card-performance" onClick={() => buscarDetalhesAntigo(dado.implantador)}>
                                <div className="perf-header"><div className="perf-avatar">{dado.implantador.charAt(0)}</div><div className="perf-info"><h4>{formatarNomeGrafico(dado.implantador)}</h4><span className="perf-total">{total} Atividades</span></div></div>
                                <div className="perf-stats">
                                    <div className="stat-item"><span className="stat-label" style={{color: 'var(--pine)'}}>IMPLANTAÇÃO</span><span className="stat-value">{dado.qtd_implantacao}</span></div>
                                    <div className="stat-item"><span className="stat-label" style={{color: 'var(--pine-700)'}}>TREINAMENTO</span><span className="stat-value">{dado.qtd_treinamento}</span></div>
                                    <div className="stat-item"><span className="stat-label" style={{color: '#f9a825'}}>VISITA</span><span className="stat-value">{dado.qtd_visita}</span></div>
                                    <div className="stat-item"><span className="stat-label" style={{color: 'var(--slate)'}}>APOIO</span><span className="stat-value">{dado.qtd_apoio || 0}</span></div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="coluna-detalhe-fixa">
                    <div className="card-detalhe-header"><h4 style={{margin: 0, color: '#333'}}>HISTÓRICO RECENTE</h4><p style={{color: '#666', marginTop: '5px', fontSize: '0.9rem'}}>{detalheTitulo}</p></div>
                    <div className="lista-detalhes-scroll"><table className="tabela-padrao-mini"><thead><tr><th>DATA</th><th>UNIDADE / PROJETO</th></tr></thead><tbody>{detalhesProdutividade.length>0?detalhesProdutividade.map((det,idx)=>(<tr key={idx}><td style={{width:'85px'}}>{new Date(det.data).toLocaleDateString()}</td><td><div style={{fontWeight:'bold'}}>{det.unidade}</div><div style={{fontSize:'0.75rem'}}>{det.projeto}</div></td></tr>)):<div style={{textAlign:'center', marginTop:'50px', opacity:0.5}}><Icon n="arrow-up"/> Clique no gráfico</div>}</tbody></table></div>
                </div>
            </div>
        );
    };

    const renderPainelProdutos = () => (
        <div className="dashboard-grid-produtos" style={{display:'grid', gap:'20px', padding:'20px'}}>
            <div className="coluna-full"><h3 className="section-title"><Icon n="box"/> Quantitativo Geral por Produto</h3><div className="mini-cards-grid">{dadosProdutos.geral.map((item, index) => { const isSelected = produtoSelecionado === item.nome_produto; return (<div key={index} className="mini-card card-blue" onClick={() => carregarDetalhesProduto(item.nome_produto)} style={{cursor: 'pointer', border: isSelected ? '3px solid #f57c00' : 'none', transform: isSelected ? 'scale(1.02)' : 'scale(1)', transition: 'all 0.2s'}}><span className="mini-card-title">{item.nome_produto}</span><span className="mini-card-value">{item.qtd_unidades} Unidades</span></div>); })}</div></div>
            <div className="coluna-full" style={{marginTop: '20px'}}><div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'10px'}}><h3 className="section-title">{produtoSelecionado ? `Detalhes Completos: ${produtoSelecionado}` : 'Desempenho Geral por Implantador'}</h3>{produtoSelecionado && <button onClick={() => setProdutoSelecionado(null)} style={{background:'#d32f2f', color:'white', border:'none', padding:'5px 15px', borderRadius:'4px', cursor:'pointer'}}>X Limpar Seleção</button>}</div>{produtoSelecionado ? (<div style={{background:'white', borderRadius:'8px', boxShadow:'0 2px 5px rgba(0,0,0,0.05)', overflowX:'auto'}}><table className="tabela-padrao"><thead><tr><th>DATA</th><th>UNIDADE</th><th>PROJETO</th><th>IMPLANTADOR</th><th>MOTIVO</th></tr></thead><tbody>{listaDetalheProduto.length > 0 ? (listaDetalheProduto.filter(item => isImplantadorAtivo(item.implantador)).map((item, idx) => (<tr key={idx}><td>{new Date(item.data_atividade).toLocaleDateString()}</td><td style={{fontWeight:'bold', color:'var(--pine-700)'}}>{item.unidade || '-'}</td><td>{item.projeto || '-'}</td><td>{item.implantador || '-'}</td><td style={{color: '#555'}}>{item.motivos || '-'}</td></tr>))) : (<tr><td colSpan="5" style={{textAlign:'center', padding:'20px'}}>Nenhum registro encontrado.</td></tr>)}</tbody></table></div>) : (<table className="tabela-padrao"><thead><tr><th>Implantador</th><th>Produto</th><th className="center">Total Atividades</th></tr></thead><tbody>{dadosProdutos.detalheImplantadores.filter(item => isImplantadorAtivo(item.implantador)).map((item, idx) => (<tr key={idx}><td style={{fontWeight: 'bold'}}>{item.implantador}</td><td>{item.nome_produto}</td><td className="center">{item.qtd_atividades}</td></tr>))}</tbody></table>)}</div>
        </div>
    );

    return (
        <div className="cadastro-container" style={estiloContainer}>
            <div className="page-header" style={{ marginBottom: '15px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, gap: '16px', flexWrap: 'wrap' }}>
                <div className="header-title"><h2>{TITULOS_PAINEL[tipoPainel] || 'Painel'}</h2></div>
                <div style={{display: 'flex', alignItems: 'center', gap: '10px', flexWrap:'wrap'}}>
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                    {(tipoPainel !== 'produtos_detalhado') && (<><div style={{display:'flex', alignItems:'center', gap:'5px', background:'#fff', padding:'5px 10px', borderRadius:'6px', border:'1px solid #ccc'}}><input type="date" min="1900-01-01" max="2100-12-31" value={dataInicio} onChange={e=>setDataInicio(e.target.value)} style={{border:'none', outline:'none', color:'#555'}} /><span style={{fontSize:'0.8rem', color:'#999'}}>até</span><input type="date" min="1900-01-01" max="2100-12-31" value={dataFim} onChange={e=>setDataFim(e.target.value)} style={{border:'none', outline:'none', color:'#555'}} /></div><button data-busca="1" onClick={handleFiltrar} style={{background:'var(--pine)', color:'#fff', border:'none', padding:'6px 15px', borderRadius:'4px', cursor:'pointer', fontWeight:'bold'}}>{loading ? '...' : 'Filtrar'}</button><button onClick={handleLimpar} style={{background:'#fff', color:'#666', border:'1px solid #ccc', padding:'6px 15px', borderRadius:'4px', cursor:'pointer'}}>Limpar</button></>)}
                </div>
            </div>

            <div style={{flex:1, position:'relative', overflow: (tipoPainel === 'produtos_detalhado' || tipoPainel === 'metricas_implantacao' || tipoPainel === 'produtividade') ? 'visible' : 'hidden'}}>
                {tipoPainel === 'produtividade' && renderProdutividadeIndividual()}
                {tipoPainel === 'metricas_implantacao' && renderMetricasImplantacao()}
                {tipoPainel === 'produtos_detalhado' && renderPainelProdutos()}

                {tipoPainel === 'implatacao_consolidada' && (
                    <div className="mapa-layout-container">
                        <div className="mapa-sidebar">
                            <div className="kpi-card kpi-green-light"><h4>PROJETO</h4><h2>{projetoSelecionadoMapa || "Visão Geral"}</h2></div>
                            <div className="kpi-card kpi-green-light"><h4>DATA DO EVENTO</h4><h2 style={{fontSize:'1.2rem'}}>{kpiDataEvento}</h2></div>
                            {filtroMapa !== 'Visita Técnica' && filtroMapa !== 'Apoio ao Projeto' ? (<div className="kpi-card kpi-green-dark"><h4>TOTAL PROFISSIONAIS</h4><h1>{loading ? '...' : kpiProfissionais}</h1></div>) : (<div className="kpi-card kpi-green-dark" style={{borderLeftColor: '#f9a825'}}><h4>TOTAL DE ATIVIDADES</h4><h1>{loading ? '...' : kpiVisitasTecnicas}</h1></div>)}
                            
                            <div className="kpi-card kpi-green-light">
                                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                                    <h4>{projetoSelecionadoMapa ? `UNIDADES DE ${projetoSelecionadoMapa}` : "PROJETOS ATENDIDOS"}</h4>
                                    {projetoSelecionadoMapa && (
                                        <button 
                                            onClick={() => handleProjetoClick(null)}
                                            style={{background:'#d32f2f', color:'white', border:'none', borderRadius:'4px', padding:'2px 8px', fontSize:'0.7rem', cursor:'pointer'}}
                                        >
                                            Voltar
                                        </button>
                                    )}
                                </div>
                                
                                <div style={{marginTop:'10px', maxHeight:'250px', overflowY:'auto', textAlign:'left'}}>
                                    {!projetoSelecionadoMapa && listaProjetosUnicos.length > 0 && listaProjetosUnicos.map((proj, i) => (
                                        <div key={i} onClick={() => handleProjetoClick(proj)} style={{padding:'6px', cursor: 'pointer', borderBottom: '1px solid #ddd', fontSize: '0.9rem'}}>
                                            {proj} <span style={{float:'right', fontSize:'0.8rem'}}><Icon n="arrow-right"/></span>
                                        </div>
                                    ))}

                                    {projetoSelecionadoMapa && listaUnidadesDoProjeto.length > 0 && listaUnidadesDoProjeto.map((uni, i) => (
                                        <div key={i} onClick={() => handleUnidadeClick(uni)} 
                                             style={{
                                                 padding:'6px', cursor: 'pointer', borderBottom: '1px solid #ddd', fontSize: '0.85rem',
                                                 backgroundColor: unidadeSelecionada?.nome === uni.nome ? '#fff9c4' : 'transparent',
                                                 fontWeight: unidadeSelecionada?.nome === uni.nome ? 'bold' : 'normal'
                                             }}>
                                            {uni.nome}
                                        </div>
                                    ))}

                                    {(!projetoSelecionadoMapa && listaProjetosUnicos.length === 0) && <p style={{color:'#999', fontSize:'0.8rem'}}>Nenhum projeto encontrado.</p>}
                                    {(projetoSelecionadoMapa && listaUnidadesDoProjeto.length === 0) && <p style={{color:'#999', fontSize:'0.8rem'}}>Nenhuma unidade encontrada.</p>}
                                </div>
                            </div>
                        </div>
                        <div className="mapa-content">
                            <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} style={{height:'100%', width:'100%'}}><TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap'/><MapController center={mapCenter} zoom={mapZoom}/>{dadosAgrupadosPorCidade.map((local, idx) => (<Marker key={idx} position={[local.lat, local.lng]} eventHandlers={{click: () => handlePinoClick(local)}}><Popup><strong>{local.cidade}</strong><br/>{local.projeto}</Popup></Marker>))}</MapContainer>
                            <div className="mapa-filtros-bottom">{['Implantação', 'Treinamento', 'Visita Técnica', 'Apoio ao Projeto'].map(tipo => (<button key={tipo} className={`badge-filtro ${filtroMapa === tipo ? 'ativo' : ''}`} onClick={() => { setFiltroMapa(tipo); setItemSelecionado(null); setUnidadeSelecionada(null); setProjetoSelecionadoMapa(null); }}>{tipo}</button>))}</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}