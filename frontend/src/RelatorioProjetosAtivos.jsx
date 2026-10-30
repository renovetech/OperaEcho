/* ARQUIVO: src/RelatorioProjetosAtivos.js
 * Relatório - Projetos Ativos: unidades, municípios, produtos, cobertura de
 * georreferenciamento e movimento de atividades no período, por projeto.
 * "Ver no mapa" abre o Mapa de Unidades já filtrado pelo projeto.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { periodoBloqueado } from './periodo';
import Icon from './components/Icon';
import api from './api';
import logo from './logo.png';
import RelatorioMapaUnidades from './RelatorioMapaUnidades';
import { CATEGORIAS_PROJETO } from './config/categoriasProjeto';

const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dataBR = (s) => (s ? s.split('-').reverse().join('/') : '');
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export default function RelatorioProjetosAtivos({ aoVoltar, criarRelatorioPDF, exportarDoc, usuarioLogado, podeVerMapa = true }) {
    const hoje = new Date();
    const [filtros, setFiltros] = useState({ dataInicio: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), dataFim: isoLocal(hoje), categoria: 'Todas', id_projeto: 'Todos' });
    const [projetos, setProjetos] = useState([]);
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [mapaProjeto, setMapaProjeto] = useState(null);
    const exportRef = useRef(null);

    const gerar = useCallback(async (f) => {
        if (f.dataInicio && f.dataFim && f.dataFim < f.dataInicio)
            return Swal.fire('Atenção', 'A data final não pode ser anterior à inicial.', 'warning');
        if (periodoBloqueado(f.dataInicio, f.dataFim)) return;
        setCarregando(true);
        try {
            const r = await api.get('/relatorios/projetos-ativos', { params: { dataInicio: f.dataInicio, dataFim: f.dataFim, categoria: f.categoria, id_projeto: f.id_projeto } });
            setDados(Array.isArray(r.data) ? r.data : []);
        } catch (e) {
            setDados([]);
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível gerar o relatório.', 'error');
        } finally { setCarregando(false); }
    }, []);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { gerar(filtros); }, []);

    useEffect(() => {
        api.get('/projetos')
            .then(r => setProjetos((r.data || []).filter(p => p.ativo === true || p.ativo === 1)))
            .catch(() => setProjetos([]));
    }, []);

    const projetosCategoria = useMemo(() => (filtros.categoria === 'Todas' ? projetos
        : projetos.filter(p => (p.categoria || '').trim() === filtros.categoria)), [projetos, filtros.categoria]);

    const lista = dados || [];

    const tot = useMemo(() => lista.reduce((a, p) => ({
        projetos: a.projetos + 1,
        unidades: a.unidades + p.unidades_ativas,
        georref: a.georref + p.unidades_georref,
        municipios: a.municipios + p.municipios,
        atividades: a.atividades + p.atividades_implantacao + p.atividades_projetos
    }), { projetos: 0, unidades: 0, georref: 0, municipios: 0, atividades: 0 }), [lista]);

    const periodoTxt = (filtros.dataInicio && filtros.dataFim ? `Atividades de ${dataBR(filtros.dataInicio)} até ${dataBR(filtros.dataFim)}` : 'Sem período de atividades')
        + (filtros.categoria !== 'Todas' ? `  ·  Categoria ${filtros.categoria}` : '');
    const semDados = !lista.length;

    const gerarPdf = async () => {
        if (semDados) return Swal.fire('Atenção', 'Nenhum projeto para exportar.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const pdf = await criarRelatorioPDF('Projetos Ativos', periodoTxt);
            const ajustar = (cols) => { const f = pdf.CW / cols.reduce((s, c) => s + c.w, 0); cols.forEach(c => { c.w *= f; }); return cols; };
            pdf.bloco('Indicadores gerais', pdf.colors.green);
            pdf.tabela(ajustar([{ h: 'Projetos ativos', w: 40, a: 'c' }, { h: 'Unidades ativas', w: 40, a: 'c' }, { h: 'Georreferenciadas', w: 40, a: 'c' }, { h: 'Municípios', w: 40, a: 'c' }, { h: 'Atividades no período', w: 40, a: 'c' }]),
                [[String(tot.projetos), String(tot.unidades), `${tot.georref} (${pct(tot.georref, tot.unidades)}%)`, String(tot.municipios), String(tot.atividades)]]);
            pdf.bloco('Resumo por projeto', pdf.colors.green);
            pdf.tabela(ajustar([{ h: 'Projeto', w: 70, a: 'l' }, { h: 'Cat.', w: 14, a: 'c' }, { h: 'UF', w: 22, a: 'c' }, { h: 'Unid. ativas', w: 22, a: 'c' }, { h: 'Inativas', w: 18, a: 'c' }, { h: 'Municípios', w: 22, a: 'c' },
                { h: 'Georref.', w: 24, a: 'c' }, { h: 'Ativ. Implant.', w: 24, a: 'c' }, { h: 'Ativ. Projetos', w: 24, a: 'c' }, { h: 'Última ativ.', w: 24, a: 'c' }]),
                lista.map(p => [p.nome_projeto, p.categoria || '-', p.ufs || '-', String(p.unidades_ativas), String(p.unidades_inativas), String(p.municipios),
                    `${p.unidades_georref} (${pct(p.unidades_georref, p.unidades_ativas)}%)`, String(p.atividades_implantacao), String(p.atividades_projetos), p.ultima_atividade || '-']));
            lista.filter(p => p.produtos.length).forEach(p => {
                pdf.bloco(`${p.nome_projeto} - unidades por produto`, pdf.colors.blue);
                pdf.tabela(ajustar([{ h: 'Produto', w: 160, a: 'l' }, { h: 'Unidades', w: 40, a: 'c' }, { h: '% das unidades ativas', w: 50, a: 'c' }]),
                    p.produtos.map(x => [x.nome_produto, String(x.unidades), `${pct(x.unidades, p.unidades_ativas)}%`]));
            });
            pdf.finalizar('Relatorio_Projetos_Ativos');
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    const gerarExcel = () => {
        if (semDados) return Swal.fire('Atenção', 'Nenhum projeto para exportar.', 'warning');
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.map(p => ({
            Projeto: p.nome_projeto, Categoria: p.categoria || '', UFs: p.ufs || '', 'Unidades ativas': p.unidades_ativas, 'Unidades inativas': p.unidades_inativas,
            Municípios: p.municipios, Georreferenciadas: p.unidades_georref, '% Georref.': pct(p.unidades_georref, p.unidades_ativas),
            'Atividades Implantação': p.atividades_implantacao, 'Atividades Projetos': p.atividades_projetos, 'Última atividade': p.ultima_atividade || '',
            Produtos: p.produtos.map(x => `${x.nome_produto} (${x.unidades})`).join(', ')
        }))), 'Projetos');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(lista.flatMap(p => p.produtos.map(x => ({
            Projeto: p.nome_projeto, Produto: x.nome_produto, Unidades: x.unidades
        })))), 'Produtos');
        XLSX.writeFile(wb, `Relatorio_Projetos_Ativos_${isoLocal(new Date())}.xlsx`);
    };

    if (mapaProjeto) {
        return <RelatorioMapaUnidades aoVoltar={() => setMapaProjeto(null)} criarRelatorioPDF={criarRelatorioPDF}
            exportarDoc={exportarDoc} usuarioLogado={usuarioLogado} projetoInicial={mapaProjeto} />;
    }

    const f = (k) => (e) => setFiltros(prev => ({ ...prev, [k]: e.target.value }));

    // Trocar a categoria limpa o projeto se ele não pertence a ela.
    const mudarCategoria = (e) => {
        const categoria = e.target.value;
        setFiltros(prev => {
            const atual = projetos.find(p => String(p.id_projeto) === String(prev.id_projeto));
            const mantem = !atual || categoria === 'Todas' || (atual.categoria || '').trim() === categoria;
            return { ...prev, categoria, id_projeto: mantem ? prev.id_projeto : 'Todos' };
        });
    };

    return (
        <div className="relatorios-page">
            <div className="filtros-container no-print">
                <div className="relatorio-header-acoes">
                    <h2>Projetos Ativos</h2>
                    <button className="btn-voltar" onClick={aoVoltar}><Icon n="arrow-left" /> Voltar</button>
                </div>
                <div className="filtros-grid-rel">
                    <div className="filtro-item"><label>Atividades de</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataInicio} onChange={f('dataInicio')} /></div>
                    <div className="filtro-item"><label>Até</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataFim} onChange={f('dataFim')} /></div>
                    <div className="filtro-item"><label>Categoria</label>
                        <select value={filtros.categoria} onChange={mudarCategoria}>
                            <option value="Todas">Todas</option>
                            {CATEGORIAS_PROJETO.map(c => <option key={c} value={c}>Categoria {c}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item"><label>Projeto</label>
                        <select value={filtros.id_projeto} onChange={f('id_projeto')}>
                            <option value="Todos">Todos</option>
                            {projetosCategoria.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </div>
                </div>
                <div className="botoes-rel-row">
                    <button className="btn-gerar" data-busca="1" onClick={() => gerar(filtros)} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                    <button className="btn-imprimir" onClick={gerarPdf}><Icon n="printer" /> Exportar PDF</button>
                    <button className="btn-jpg" onClick={() => (semDados ? Swal.fire('Atenção', 'Nenhum projeto para exportar.', 'warning') : exportarDoc('jpg', exportRef, 'Relatorio_Projetos_Ativos', 'l'))}><Icon n="camera" /> Exportar JPG</button>
                    <button className="btn-gerar" style={{ background: '#3E7C5A' }} onClick={gerarExcel}><Icon n="grid" /> Exportar Excel</button>
                </div>
            </div>

            <div id="print-area" className="documento-elegante" ref={exportRef}>
                <header className="header-doc">
                    <img src={logo} alt="Logo" className="logo-doc" style={{ height: '100px', width: 'auto' }} />
                    <div className="info-doc">
                        <h1>Projetos Ativos</h1>
                        <p className="periodo-doc">{periodoTxt}</p>
                        <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                        <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                    </div>
                </header>

                {dados === null ? <p className="aviso-vazio">Carregando...</p> : semDados ? (
                    <p className="aviso-vazio">Nenhum projeto ativo encontrado.</p>
                ) : (
                    <main className="conteudo-doc">
                        <div className="tm-kpis mu-kpis">
                            <div className="tm-kpi"><span className="tm-kpi-num">{tot.projetos}</span><span className="tm-kpi-lbl">Projetos ativos</span></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{tot.unidades}</span><span className="tm-kpi-lbl">Unidades ativas</span></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{pct(tot.georref, tot.unidades)}%</span><span className="tm-kpi-lbl">Georreferenciadas</span><small>{tot.georref} com coordenada</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{tot.municipios}</span><span className="tm-kpi-lbl">Municípios</span></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{tot.atividades}</span><span className="tm-kpi-lbl">Atividades</span><small>implantação + projetos no período</small></div>
                        </div>

                        <div className="agrupamento-projeto">
                            <h3>Resumo por projeto <small>({lista.length})</small></h3>
                            <table className="tabela-elegante">
                                <thead><tr>
                                    <th style={{ textAlign: 'left' }}>Projeto</th><th className="center">Unidades</th><th className="center">Municípios</th>
                                    <th style={{ textAlign: 'left' }}>Produtos (unidades)</th><th className="center">Georreferenciamento</th>
                                    <th className="center">Atividades</th><th className="center">Última atividade</th><th className="center no-print">Mapa</th>
                                </tr></thead>
                                <tbody>
                                    {lista.map(p => {
                                        const g = pct(p.unidades_georref, p.unidades_ativas);
                                        return (
                                            <tr key={p.id_projeto}>
                                                <td><b>{p.nome_projeto}</b><div className="rp-sub">{p.categoria ? `Categoria ${p.categoria} · ` : ''}{p.ufs || 'Sem UF'}{p.gera_lotacao ? ' · Lotação' : ''}</div></td>
                                                <td className="center"><b>{p.unidades_ativas}</b>{p.unidades_inativas > 0 && <div className="rp-sub">{p.unidades_inativas} inativa(s)</div>}</td>
                                                <td className="center">{p.municipios}</td>
                                                <td>{p.produtos.length ? p.produtos.map(x => <span key={x.id_produto} className="mu-chip">{x.nome_produto} <small>({x.unidades})</small></span>) : '-'}</td>
                                                <td className="center">
                                                    <div className="mu-barra" title={`${p.unidades_georref} de ${p.unidades_ativas}`}><span style={{ width: `${g}%` }} /></div>
                                                    <div className="rp-sub">{p.unidades_georref}/{p.unidades_ativas} ({g}%)</div>
                                                </td>
                                                <td className="center">{p.atividades_implantacao + p.atividades_projetos}
                                                    <div className="rp-sub">Impl. {p.atividades_implantacao} · Proj. {p.atividades_projetos}</div></td>
                                                <td className="center">{p.ultima_atividade || '-'}</td>
                                                <td className="center no-print">
                                                    {podeVerMapa && p.unidades_ativas > 0
                                                        ? <button className="mu-ver" onClick={() => setMapaProjeto(p.id_projeto)}><Icon n="map" /> Ver</button>
                                                        : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </main>
                )}
            </div>
        </div>
    );
}
