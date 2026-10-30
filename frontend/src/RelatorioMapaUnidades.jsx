/* ARQUIVO: src/RelatorioMapaUnidades.js
 * Relatório - Mapa de Unidades por Projeto.
 * Sinaliza no mapa cada unidade do projeto pela coordenada própria
 * (tab_unidades.latitude/longitude). Sem coordenada, usa o centro do município
 * e marca como "localização aproximada". Filtro por produto, município e status;
 * sem filtro de produto, mostra todas as unidades com as cores dos produtos.
 * Mesmo molde dos demais relatórios (Relatorios.css / PDF vetorial por props).
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import Icon from './components/Icon';
import { CATEGORIAS_PROJETO } from './config/categoriasProjeto';
import api from './api';
import logo from './logo.png';
import {
    mapaDeCores, iconeUnidade, agruparPorCoordenada, fmtCoord,
    COR_SEM_PRODUTO, TILE_URL, TILE_ATTR, CENTRO_BRASIL
} from './config/mapaUnidades';

const SEM_PRODUTO = 0;

// Ajusta o enquadramento sempre que o conjunto de pontos muda.
function Enquadrar({ pontos }) {
    const map = useMap();
    useEffect(() => {
        if (!pontos.length) return;
        if (pontos.length === 1) { map.setView(pontos[0], 14); return; }
        map.fitBounds(L.latLngBounds(pontos), { padding: [30, 30], maxZoom: 14 });
    }, [map, pontos]);
    return null;
}

export default function RelatorioMapaUnidades({ aoVoltar, criarRelatorioPDF, exportarDoc, usuarioLogado, projetoInicial }) {
    const [projetos, setProjetos] = useState([]);
    const [filtros, setFiltros] = useState({
        categoria: 'Todas', id_projeto: projetoInicial ? String(projetoInicial) : '', id_produto: 'Todos', status: 'true', id_cidade: 'Todos', localizacao: 'Todas'
    });
    const [unidades, setUnidades] = useState(null);
    const [ocultos, setOcultos] = useState(new Set()); // produtos desligados na legenda
    const [carregando, setCarregando] = useState(false);
    const exportRef = useRef(null);
    const mapBoxRef = useRef(null);
    const mapRef = useRef(null);

    useEffect(() => {
        api.get('/projetos')
            .then(r => setProjetos((r.data || []).filter(p => p.ativo === true || p.ativo === 1)))
            .catch(() => setProjetos([]));
    }, []);

    const projetosCategoria = useMemo(() => (filtros.categoria === 'Todas' ? projetos
        : projetos.filter(p => (p.categoria || '').trim() === filtros.categoria)), [projetos, filtros.categoria]);

    // Carrega as unidades do projeto (ou de todos os projetos da categoria);
    // produto/município/localização filtram no cliente.
    useEffect(() => {
        if (!filtros.id_projeto) { setUnidades(null); return; }
        let ativo = true;
        setCarregando(true);
        api.get('/relatorios/mapa-unidades', { params: { id_projeto: filtros.id_projeto, status: filtros.status, categoria: filtros.categoria } })
            .then(r => { if (ativo) { setUnidades(Array.isArray(r.data) ? r.data : []); setOcultos(new Set()); } })
            .catch(e => { if (ativo) { setUnidades([]); Swal.fire('Erro', e.response?.data?.erro || 'Falha ao carregar as unidades.', 'error'); } })
            .finally(() => { if (ativo) setCarregando(false); });
        return () => { ativo = false; };
    }, [filtros.id_projeto, filtros.status, filtros.categoria]);

    const produtos = useMemo(() => {
        const m = new Map();
        (unidades || []).forEach(u => u.produtos.forEach(p => m.set(p.id_produto, p)));
        return [...m.values()].sort((a, b) => a.nome_produto.localeCompare(b.nome_produto, 'pt-BR'));
    }, [unidades]);
    const cores = useMemo(() => mapaDeCores(produtos), [produtos]);
    const corDe = (id) => (id === SEM_PRODUTO ? COR_SEM_PRODUTO : cores[id] || COR_SEM_PRODUTO);

    const municipios = useMemo(() => {
        const m = new Map();
        (unidades || []).forEach(u => { if (u.id_cidade) m.set(u.id_cidade, `${u.nome_cidade}${u.uf ? ' / ' + u.uf : ''}`); });
        return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
    }, [unidades]);

    // Produtos "visíveis" de cada unidade, conforme filtro e legenda.
    const produtosVisiveis = (u) => {
        if (filtros.id_produto !== 'Todos') {
            const id = Number(filtros.id_produto);
            return u.produtos.some(p => p.id_produto === id) ? [id] : [];
        }
        if (!u.produtos.length) return ocultos.has(SEM_PRODUTO) ? [] : [SEM_PRODUTO];
        return u.produtos.map(p => p.id_produto).filter(id => !ocultos.has(id));
    };

    const filtradas = useMemo(() => (unidades || []).filter(u => {
        if (filtros.id_cidade !== 'Todos' && String(u.id_cidade) !== String(filtros.id_cidade)) return false;
        if (filtros.localizacao === 'Exata' && u.aproximada) return false;
        if (filtros.localizacao === 'Aproximada' && !u.aproximada) return false;
        return produtosVisiveis(u).length > 0;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [unidades, filtros.id_cidade, filtros.localizacao, filtros.id_produto, ocultos]);

    const grupos = useMemo(() => agruparPorCoordenada(filtradas), [filtradas]);
    const pontos = useMemo(() => grupos.map(g => [g.lat, g.lng]), [grupos]);
    const semCoordenada = filtradas.filter(u => u.latitude == null || u.longitude == null);

    const resumo = useMemo(() => ({
        unidades: filtradas.length,
        exatas: filtradas.filter(u => !u.aproximada).length,
        aproximadas: filtradas.filter(u => u.aproximada && u.latitude != null).length,
        municipios: new Set(filtradas.map(u => u.id_cidade).filter(Boolean)).size,
        produtos: new Set(filtradas.flatMap(u => u.produtos.map(p => p.id_produto))).size
    }), [filtradas]);

    const contagemProduto = (id) => (unidades || []).filter(u => (id === SEM_PRODUTO ? !u.produtos.length : u.produtos.some(p => p.id_produto === id))).length;

    const alternarLegenda = (id) => {
        if (filtros.id_produto !== 'Todos') return;
        setOcultos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    };

    const verNoMapa = (u) => {
        if (mapRef.current && u.latitude != null) {
            mapRef.current.flyTo([u.latitude, u.longitude], 16, { animate: true, duration: 1.2 });
            mapBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const nomeProjeto = filtros.id_projeto === 'Todos'
        ? `Categoria ${filtros.categoria} - todos os projetos`
        : (projetos.find(p => String(p.id_projeto) === String(filtros.id_projeto))?.nome_projeto || '');
    const nomeProduto = filtros.id_produto === 'Todos' ? 'Todos os produtos' : (produtos.find(p => String(p.id_produto) === String(filtros.id_produto))?.nome_produto || '');
    const subtitulo = `${nomeProjeto || 'Projeto'}  ·  ${nomeProduto}${filtros.id_cidade !== 'Todos' ? '  ·  ' + (municipios.find(m => String(m[0]) === String(filtros.id_cidade))?.[1] || '') : ''}`;
    const semDados = !filtradas.length;

    const legenda = filtros.id_produto !== 'Todos'
        ? produtos.filter(p => String(p.id_produto) === String(filtros.id_produto))
        : [...produtos, ...(contagemProduto(SEM_PRODUTO) ? [{ id_produto: SEM_PRODUTO, nome_produto: 'Sem produto vinculado' }] : [])];

    /* ------------------------------- PDF -------------------------------- */
    const capturarMapa = async () => {
        const node = mapBoxRef.current;
        if (!node) return null;
        const controles = node.querySelectorAll('.leaflet-control-container');
        controles.forEach(c => { c.style.display = 'none'; });
        try {
            const canvas = await html2canvas(node, { useCORS: true, scale: 2, logging: false, backgroundColor: '#ffffff' });
            return { img: canvas.toDataURL('image/jpeg', 0.9), w: canvas.width, h: canvas.height };
        } catch (e) { return null; } finally { controles.forEach(c => { c.style.display = ''; }); }
    };

    const gerarPdf = async () => {
        if (semDados) return Swal.fire('Atenção', 'Selecione um projeto com unidades para exportar.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const pdf = await criarRelatorioPDF('Mapa de Unidades', subtitulo);
            const ajustar = (cols) => { const f = pdf.CW / cols.reduce((s, c) => s + c.w, 0); cols.forEach(c => { c.w *= f; }); return cols; };

            const cap = await capturarMapa();
            if (cap) {
                const maxH = pdf.H - pdf.cursor.y - 16;
                let w = pdf.CW, h = (cap.h / cap.w) * w;
                if (h > maxH) { h = maxH; w = (cap.w / cap.h) * h; }
                pdf.doc.addImage(cap.img, 'JPEG', pdf.M + (pdf.CW - w) / 2, pdf.cursor.y, w, h);
                pdf.cursor.y += h + 4;
                pdf.texto('Marcador tracejado = localização aproximada (centro do município). Número no marcador = unidades no mesmo ponto.', { italic: true });
            }

            pdf.doc.addPage(); pdf.cursor.y = pdf.M;
            pdf.bloco('Indicadores', pdf.colors.green);
            pdf.tabela(ajustar([{ h: 'Unidades', w: 40, a: 'c' }, { h: 'Coordenada exata', w: 40, a: 'c' }, { h: 'Aproximadas', w: 40, a: 'c' }, { h: 'Municípios', w: 40, a: 'c' }, { h: 'Produtos', w: 40, a: 'c' }]),
                [[String(resumo.unidades), String(resumo.exatas), String(resumo.aproximadas), String(resumo.municipios), String(resumo.produtos)]]);

            pdf.bloco('Legenda - unidades por produto', pdf.colors.green);
            pdf.tabela(ajustar([{ h: 'Produto', w: 160, a: 'l' }, { h: 'Cor', w: 30, a: 'c' }, { h: 'Unidades', w: 40, a: 'c' }]),
                legenda.map(p => {
                    const hex = corDe(p.id_produto);
                    return [p.nome_produto, { t: '●', bold: true, color: [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) },
                        String(filtradas.filter(u => (p.id_produto === SEM_PRODUTO ? !u.produtos.length : u.produtos.some(x => x.id_produto === p.id_produto))).length)];
                }));

            pdf.bloco(`Unidades (${filtradas.length})`, pdf.colors.blue);
            pdf.tabela(ajustar([{ h: 'Unidade', w: 80, a: 'l' }, { h: 'CNES', w: 22, a: 'c' }, { h: 'Município/UF', w: 45, a: 'l' }, { h: 'Produtos', w: 75, a: 'l' },
                { h: 'Latitude', w: 24, a: 'c' }, { h: 'Longitude', w: 24, a: 'c' }, { h: 'Localização', w: 24, a: 'c' }]),
                filtradas.map(u => [u.nome_unidade, u.cnes || '-', `${u.nome_cidade || '-'}${u.uf ? ' / ' + u.uf : ''}`,
                    u.produtos.map(p => p.nome_produto).join(', ') || '-', fmtCoord(u.latitude), fmtCoord(u.longitude),
                    u.aproximada ? { t: 'Aproximada', color: [138, 82, 18], bold: true } : { t: 'Exata', color: pdf.colors.green, bold: true }]));
            pdf.finalizar(`Mapa_Unidades_${(nomeProjeto || 'projeto').replace(/\s+/g, '_')}`);
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    /* ------------------------------ EXCEL ------------------------------- */
    const gerarExcel = () => {
        if (semDados) return Swal.fire('Atenção', 'Selecione um projeto com unidades para exportar.', 'warning');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filtradas.map(u => ({
            Projeto: u.nome_projeto, Unidade: u.nome_unidade, CNES: u.cnes || '', Município: u.nome_cidade || '', UF: u.uf || '',
            Produtos: u.produtos.map(p => p.nome_produto).join(', '), Latitude: u.latitude, Longitude: u.longitude,
            Localização: u.aproximada ? 'Aproximada (centro do município)' : 'Exata', Status: u.ativo ? 'Ativa' : 'Inativa'
        }))), 'Unidades');
        XLSX.writeFile(wb, `Mapa_Unidades_${(nomeProjeto || 'projeto').replace(/\s+/g, '_')}.xlsx`);
    };

    const f = (k) => (e) => setFiltros(prev => ({
        ...prev, [k]: e.target.value,
        ...(k === 'id_projeto' ? { id_produto: 'Todos', id_cidade: 'Todos' } : {})
    }));

    // Trocar a categoria mantém o projeto se ele pertence a ela; senão, mostra todos os da categoria.
    const mudarCategoria = (e) => {
        const categoria = e.target.value;
        setFiltros(prev => {
            const atual = projetos.find(p => String(p.id_projeto) === String(prev.id_projeto));
            const mantem = atual && (categoria === 'Todas' || (atual.categoria || '').trim() === categoria);
            const id_projeto = mantem ? prev.id_projeto : (categoria === 'Todas' ? '' : 'Todos');
            return { ...prev, categoria, id_projeto, ...(id_projeto !== prev.id_projeto ? { id_produto: 'Todos', id_cidade: 'Todos' } : {}) };
        });
    };

    return (
        <div className="relatorios-page">
            <div className="filtros-container no-print">
                <div className="relatorio-header-acoes">
                    <h2>Mapa de Unidades</h2>
                    <button className="btn-voltar" onClick={aoVoltar}><Icon n="arrow-left" /> Voltar</button>
                </div>

                <div className="filtros-grid-rel">
                    <div className="filtro-item">
                        <label>Categoria</label>
                        <select value={filtros.categoria} onChange={mudarCategoria}>
                            <option value="Todas">Todas</option>
                            {CATEGORIAS_PROJETO.map(c => <option key={c} value={c}>Categoria {c}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Projeto</label>
                        <select value={filtros.id_projeto} onChange={f('id_projeto')}>
                            {filtros.categoria === 'Todas'
                                ? <option value="">Selecione o projeto</option>
                                : <option value="Todos">Todos da categoria {filtros.categoria}</option>}
                            {projetosCategoria.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Produto</label>
                        <select value={filtros.id_produto} onChange={f('id_produto')} disabled={!produtos.length}>
                            <option value="Todos">Todos os Produtos</option>
                            {produtos.map(p => <option key={p.id_produto} value={p.id_produto}>{p.nome_produto}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Município</label>
                        <select value={filtros.id_cidade} onChange={f('id_cidade')} disabled={!municipios.length}>
                            <option value="Todos">Todos os Municípios</option>
                            {municipios.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Status da Unidade</label>
                        <select value={filtros.status} onChange={f('status')}>
                            <option value="true">Ativas</option>
                            <option value="false">Inativas</option>
                            <option value="Todos">Todas</option>
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Localização</label>
                        <select value={filtros.localizacao} onChange={f('localizacao')}>
                            <option value="Todas">Exata e aproximada</option>
                            <option value="Exata">Somente coordenada exata</option>
                            <option value="Aproximada">Somente aproximada</option>
                        </select>
                    </div>
                </div>

                <div className="botoes-rel-row">
                    <button className="btn-imprimir" onClick={gerarPdf} disabled={carregando}><Icon n="printer" /> Exportar PDF</button>
                    <button className="btn-jpg" onClick={() => (semDados ? Swal.fire('Atenção', 'Selecione um projeto com unidades.', 'warning') : exportarDoc('jpg', exportRef, 'Mapa_Unidades', 'l'))}><Icon n="camera" /> Exportar JPG</button>
                    <button className="btn-gerar" style={{ background: '#3E7C5A' }} onClick={gerarExcel}><Icon n="grid" /> Exportar Excel</button>
                </div>
            </div>

            <div id="print-area" className="documento-elegante" ref={exportRef}>
                <header className="header-doc">
                    <img src={logo} alt="Logo" className="logo-doc" style={{ height: '100px', width: 'auto' }} />
                    <div className="info-doc">
                        <h1>Mapa de Unidades</h1>
                        <p className="periodo-doc">{subtitulo}</p>
                        <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                        <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                    </div>
                </header>

                <main className="conteudo-doc">
                    {!filtros.id_projeto && <p className="aviso-vazio">Selecione um projeto para ver as unidades no mapa.</p>}
                    {filtros.id_projeto && carregando && <p className="aviso-vazio">Carregando unidades...</p>}

                    {filtros.id_projeto && !carregando && unidades && (
                        <>
                            <div className="tm-kpis mu-kpis">
                                <div className="tm-kpi"><span className="tm-kpi-num">{resumo.unidades}</span><span className="tm-kpi-lbl">Unidades</span><small>no filtro atual</small></div>
                                <div className="tm-kpi"><span className="tm-kpi-num">{resumo.exatas}</span><span className="tm-kpi-lbl">Coordenada exata</span><small>{resumo.unidades ? Math.round((resumo.exatas / resumo.unidades) * 100) : 0}% georreferenciadas</small></div>
                                <div className="tm-kpi"><span className={`tm-kpi-num ${resumo.aproximadas ? 'tm-neg' : ''}`}>{resumo.aproximadas}</span><span className="tm-kpi-lbl">Aproximadas</span><small>centro do município</small></div>
                                <div className="tm-kpi"><span className="tm-kpi-num">{resumo.municipios}</span><span className="tm-kpi-lbl">Municípios</span><small>com unidades</small></div>
                                <div className="tm-kpi"><span className="tm-kpi-num">{resumo.produtos}</span><span className="tm-kpi-lbl">Produtos</span><small>nas unidades exibidas</small></div>
                            </div>

                            <div className="mu-mapa" ref={mapBoxRef}>
                                <MapContainer center={CENTRO_BRASIL} zoom={4} style={{ height: '100%', width: '100%' }} ref={mapRef} preferCanvas>
                                    <TileLayer url={TILE_URL} attribution={TILE_ATTR} crossOrigin="anonymous" />
                                    <Enquadrar pontos={pontos} />
                                    {grupos.map(g => {
                                        const idsCores = [...new Set(g.unidades.flatMap(produtosVisiveis))];
                                        const aprox = g.unidades.every(u => u.aproximada);
                                        return (
                                            <Marker key={g.chave} position={[g.lat, g.lng]} icon={iconeUnidade(idsCores.slice(0, 8).map(corDe), g.unidades.length, aprox)}>
                                                <Popup maxHeight={320}>
                                                    <div className="mu-popup">
                                                        {g.unidades.map((u, i) => (
                                                            <div key={u.id_unidade}>
                                                                {i > 0 && <hr />}
                                                                <h4>{u.nome_unidade}</h4>
                                                                <div>CNES: <b>{u.cnes || '-'}</b></div>
                                                                <div>{u.nome_cidade}{u.uf ? ` / ${u.uf}` : ''}</div>
                                                                <div style={{ margin: '4px 0' }}>
                                                                    {u.produtos.length ? u.produtos.map(p => (
                                                                        <span key={p.id_produto} className="mu-chip"><i style={{ background: corDe(p.id_produto) }} />{p.nome_produto}</span>
                                                                    )) : <span className="mu-chip">Sem produto</span>}
                                                                </div>
                                                                <div>{fmtCoord(u.latitude)}, {fmtCoord(u.longitude)}</div>
                                                                {u.aproximada
                                                                    ? <div className="mu-aprox">Localização aproximada (centro do município)</div>
                                                                    : <div className="mu-exata">Coordenada da unidade</div>}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </Popup>
                                            </Marker>
                                        );
                                    })}
                                </MapContainer>
                            </div>

                            <div className="mu-legenda">
                                {legenda.map(p => (
                                    <span key={p.id_produto} className={`mu-legenda-item ${ocultos.has(p.id_produto) ? 'off' : ''}`}
                                        title={filtros.id_produto === 'Todos' ? 'Clique para ocultar/exibir' : ''} onClick={() => alternarLegenda(p.id_produto)}>
                                        <span className="mu-cor" style={{ background: corDe(p.id_produto) }} />
                                        {p.nome_produto} <small>({contagemProduto(p.id_produto)})</small>
                                    </span>
                                ))}
                                <span className="mu-legenda-item"><span className="mu-cor mu-cor--aprox" /> Localização aproximada</span>
                            </div>

                            {semCoordenada.length > 0 && (
                                <p className="tm-nota" style={{ marginTop: 0 }}>
                                    {semCoordenada.length} unidade(s) sem coordenada e sem município georreferenciado - não aparecem no mapa: {semCoordenada.map(u => u.nome_unidade).join(', ')}.
                                </p>
                            )}

                            <div className="agrupamento-projeto">
                                <h3>Unidades <small>({filtradas.length})</small></h3>
                                <table className="tabela-elegante">
                                    <thead><tr>
                                        <th style={{ textAlign: 'left' }}>Unidade</th><th className="center">CNES</th><th style={{ textAlign: 'left' }}>Município/UF</th>
                                        <th style={{ textAlign: 'left' }}>Produtos</th><th className="center">Latitude</th><th className="center">Longitude</th>
                                        <th className="center">Localização</th><th className="center no-print">Ação</th>
                                    </tr></thead>
                                    <tbody>
                                        {filtradas.map(u => (
                                            <tr key={u.id_unidade}>
                                                <td><b>{u.nome_unidade}</b>{!u.ativo && <div className="rp-sub">Inativa</div>}</td>
                                                <td className="center">{u.cnes || '-'}</td>
                                                <td>{u.nome_cidade || '-'}{u.uf ? ` / ${u.uf}` : ''}</td>
                                                <td>{u.produtos.length ? u.produtos.map(p => (
                                                    <span key={p.id_produto} className="mu-chip"><i style={{ background: corDe(p.id_produto) }} />{p.nome_produto}</span>
                                                )) : '-'}</td>
                                                <td className="center">{fmtCoord(u.latitude)}</td>
                                                <td className="center">{fmtCoord(u.longitude)}</td>
                                                <td className="center">{u.aproximada ? <span className="mu-aprox">Aproximada</span> : <span className="mu-exata">Exata</span>}</td>
                                                <td className="center no-print">
                                                    {u.latitude != null
                                                        ? <button className="mu-ver" onClick={() => verNoMapa(u)}><Icon n="pin" /> Ver</button>
                                                        : <span style={{ color: '#999', fontSize: '.8rem' }}>Sem local</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {!filtradas.length && <tr><td colSpan="8" style={{ textAlign: 'center', padding: '20px' }}>Nenhuma unidade para os filtros selecionados.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </main>
            </div>
        </div>
    );
}
