/* ARQUIVO: src/FaturamentoLancamento.jsx
 * Operações > Lançar Faturamento.
 * Envia o arquivo de produção (BPA, APAC ou AIH) de uma unidade/produto/competência.
 * O arquivo é lido e valorizado pela SIGTAP numa prévia; só grava ao confirmar.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Swal from 'sweetalert2';
import Icon from './components/Icon';
import api from './api';
import { fmtComp, fmtNum, fmtMoeda, fmtProc } from './sigtapUtils';
import './SigtapConsulta.css';
import './Faturamento.css';

const TIPOS = [
    { v: 'BPA', rotulo: 'BPA', desc: 'Boletim de Produção Ambulatorial (BPA-C e BPA-I)' },
    { v: 'APAC', rotulo: 'APAC', desc: 'Autorização de Procedimento de Alta Complexidade' },
    { v: 'AIH', rotulo: 'AIH', desc: 'Internação Hospitalar (SISAIH01) · KlinikosNet e SER II (Internação)' }
];
const ORIGEM_ROTULO = { 'AIH-P': 'AIH · principal', 'AIH-S': 'AIH · secundários/especiais' };
const NIVEL_ICONE = { erro: 'x', alerta: 'alert', info: 'dot' };

/** AAAAMM <-> AAAA-MM (input type=month) */
const paraMes = (c) => (/^\d{6}$/.test(c || '') ? `${c.slice(0, 4)}-${c.slice(4)}` : '');
const deMes = (m) => String(m || '').replace('-', '');

export default function FaturamentoLancamento({ aoVoltar, podeNovo, podeEditar, aoAbrirPainel }) {
    const [opcoes, setOpcoes] = useState({ projetos: [], unidades: [], produtos: [], sigtap: [] });
    const [form, setForm] = useState({ id_projeto: '', id_unidade: '', id_produto: '', tipo: 'BPA', competencia: '' });
    const [arquivo, setArquivo] = useState(null);
    const [arrastando, setArrastando] = useState(false);
    const [previa, setPrevia] = useState(null);
    const [analisando, setAnalisando] = useState(false);
    const [gravando, setGravando] = useState(0);
    const [hist, setHist] = useState({ itens: [], total: 0, pagina: 1, tamanho: 15 });
    const [filtro, setFiltro] = useState({ projeto: '', unidade: '', competencia: '', tipo: '' });
    const [carregandoHist, setCarregandoHist] = useState(true);
    const entrada = useRef(null);

    useEffect(() => {
        api.get('/faturamento/opcoes').then(r => setOpcoes(r.data))
            .catch(e => Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível carregar os cadastros.', 'error'));
    }, []);

    const carregarHistorico = useCallback(async (pagina = 1, f = filtro) => {
        setCarregandoHist(true);
        try {
            const r = await api.get('/faturamento/lancamentos', { params: { ...f, competencia: deMes(f.competencia), pagina, tamanho: 15 } });
            setHist(r.data);
        } catch (e) {
            setHist({ itens: [], total: 0, pagina: 1, tamanho: 15 });
        } finally { setCarregandoHist(false); }
    }, [filtro]);

    useEffect(() => { carregarHistorico(1); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const unidadesDoProjeto = useMemo(() => opcoes.unidades.filter(u => String(u.id_projeto) === String(form.id_projeto)), [opcoes.unidades, form.id_projeto]);
    const unidadeSel = useMemo(() => opcoes.unidades.find(u => String(u.id_unidade) === String(form.id_unidade)), [opcoes.unidades, form.id_unidade]);
    // Só os produtos que aceitam o tipo de arquivo escolhido; os vinculados à unidade primeiro
    const produtosOrdenados = useMemo(() => {
        const vinc = new Set(unidadeSel?.produtos || []);
        return opcoes.produtos.filter(p => p.tipos.includes(form.tipo)).sort((a, b) => (vinc.has(b.id_produto) - vinc.has(a.id_produto)) || a.nome_produto.localeCompare(b.nome_produto))
            .map(p => ({ ...p, vinculado: vinc.has(p.id_produto) }));
    }, [opcoes.produtos, unidadeSel, form.tipo]);

    // Produto × tipo de arquivo (regra do servidor: AIH só KlinikosNet e SER II Internação; BPA/APAC nos demais).
    // Trocar o produto ajusta o tipo; trocar tipo/unidade escolhe um produto da unidade que aceite o tipo.
    const ajustarProduto = (n, campo) => {
        const prod = opcoes.produtos.find(p => String(p.id_produto) === String(n.id_produto));
        if (campo === 'id_produto') return prod && !prod.tipos.includes(n.tipo) ? { ...n, tipo: prod.tipos[0] } : n;
        if (campo !== 'tipo' && campo !== 'id_unidade') return n;
        const u = opcoes.unidades.find(x => String(x.id_unidade) === String(n.id_unidade));
        const vinculados = opcoes.produtos.filter(p => (u?.produtos || []).includes(p.id_produto) && p.tipos.includes(n.tipo));
        if (prod && prod.tipos.includes(n.tipo) && (campo === 'tipo' || vinculados.includes(prod))) return n;
        const aceitam = opcoes.produtos.filter(p => p.tipos.includes(n.tipo));
        const escolhido = vinculados[0] || (aceitam.length === 1 ? aceitam[0] : null);
        return { ...n, id_produto: escolhido ? String(escolhido.id_produto) : '' };
    };

    const alterar = (campo, valor) => {
        setForm(f => {
            const n = { ...f, [campo]: valor };
            if (campo === 'id_projeto') { n.id_unidade = ''; }
            return ajustarProduto(n, campo);
        });
        setPrevia(null);
    };

    const montarDados = (extra = {}) => {
        const d = new FormData();
        Object.entries({ ...form, competencia: deMes(form.competencia), ...extra }).forEach(([k, v]) => d.append(k, v));
        d.append('arquivo', arquivo);
        return d;
    };

    const prontoParaAnalisar = form.id_projeto && form.id_unidade && form.id_produto && form.tipo && arquivo;

    const analisar = async () => {
        if (!prontoParaAnalisar) return;
        setAnalisando(true);
        setPrevia(null);
        try {
            const { data } = await api.post('/faturamento/analisar', montarDados());
            setPrevia(data);
            // Competência vazia: assume a do arquivo (é a competência real da produção)
            if (!form.competencia && data.resumo.competencia_arquivo) setForm(f => ({ ...f, competencia: paraMes(data.resumo.competencia_arquivo) }));
        } catch (e) {
            Swal.fire('Não foi possível ler o arquivo', e.response?.data?.erro || e.message, 'error');
        } finally { setAnalisando(false); }
    };

    // Reanalisa automaticamente ao completar o formulário ou trocar o arquivo
    useEffect(() => { if (prontoParaAnalisar) analisar(); }, [arquivo, form.id_unidade, form.id_produto, form.tipo, form.competencia]); // eslint-disable-line react-hooks/exhaustive-deps

    const escolher = (f) => {
        if (!f) return;
        setArquivo(f);
        // Sugere o tipo pelo nome (PA = BPA, AP = APAC); a leitura confirma pelo conteúdo
        const n = f.name.toUpperCase();
        const tipo = /AIH/.test(n) ? 'AIH' : /^AP/.test(n) ? 'APAC' : /^PA/.test(n) ? 'BPA' : null;
        if (tipo) setForm(x => ajustarProduto({ ...x, tipo }, 'tipo'));
        if (entrada.current) entrada.current.value = '';
    };

    const gravar = async (substituir = false) => {
        setGravando(1);
        try {
            const { data } = await api.post('/faturamento/lancamentos', montarDados({ substituir: substituir ? '1' : '0' }), {
                onUploadProgress: (ev) => ev.total && setGravando(Math.max(1, Math.round((ev.loaded / ev.total) * 100)))
            });
            await Swal.fire({
                icon: 'success', title: data.mensagem, confirmButtonColor: '#2e7d32',
                html: `${data.resumo.unidade}<br>Competência <b>${fmtComp(data.resumo.competencia)}</b> · ${data.resumo.tipo}<br><b>${fmtMoeda(data.resumo.vl_total)}</b> · ${fmtNum(data.resumo.qt_total)} procedimentos`
            });
            setArquivo(null);
            setPrevia(null);
            setForm(f => ({ ...f, competencia: '' }));
            carregarHistorico(1);
        } catch (e) {
            if (e.response?.status === 409) {
                const ex = e.response.data.existente;
                const r = await Swal.fire({
                    icon: 'warning', title: 'Competência já lançada',
                    html: `Já existe ${form.tipo} desta unidade e produto em <b>${fmtComp(deMes(form.competencia) || previa?.resumo?.competencia)}</b>:<br>${fmtMoeda(ex.vl_total)} · lançado por ${ex.usuario} em ${ex.dt_lancamento}.<br><br>Deseja substituir pelo novo arquivo?`,
                    showCancelButton: true, confirmButtonText: 'Substituir', cancelButtonText: 'Cancelar', confirmButtonColor: '#a23b36'
                });
                if (r.isConfirmed) { setGravando(0); return gravar(true); }
            } else {
                Swal.fire('Erro ao lançar', e.response?.data?.erro || e.message, 'error');
            }
        } finally { setGravando(0); }
    };

    const excluir = async (l) => {
        const r = await Swal.fire({
            icon: 'warning', title: 'Excluir lançamento?',
            html: `${l.nome_unidade}<br>${l.tipo} · ${fmtComp(l.competencia)} · ${fmtMoeda(l.vl_total)}`,
            showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#a23b36'
        });
        if (!r.isConfirmed) return;
        try {
            await api.delete(`/faturamento/lancamentos/${l.id_lancamento}`);
            carregarHistorico(hist.pagina);
        } catch (e) { Swal.fire('Erro', e.response?.data?.erro || e.message, 'error'); }
    };

    const revalorizar = async (l) => {
        try {
            const { data } = await api.post(`/faturamento/lancamentos/${l.id_lancamento}/revalorizar`);
            Swal.fire({ icon: 'success', title: data.mensagem, html: `${fmtMoeda(data.vl_anterior)} → <b>${fmtMoeda(data.vl_total)}</b>`, confirmButtonColor: '#2e7d32' });
            carregarHistorico(hist.pagina);
        } catch (e) { Swal.fire('Erro', e.response?.data?.erro || e.message, 'error'); }
    };

    const detalhar = async (l) => {
        try {
            const { data } = await api.get(`/faturamento/lancamentos/${l.id_lancamento}`);
            const linhas = data.procedimentos.slice(0, 60).map(p => `<tr><td class="mono">${fmtProc(p.co_procedimento)}</td><td>${p.no_procedimento || '<i>não encontrado na SIGTAP</i>'}</td><td class="r mono">${fmtNum(p.quantidade)}</td><td class="r mono">${fmtMoeda(p.vl_total)}</td></tr>`).join('');
            Swal.fire({
                title: `${l.nome_unidade} · ${fmtComp(l.competencia)}`, width: 900, confirmButtonColor: '#2e7d32',
                html: `<div class="ft-swal"><p>${l.tipo} · ${l.nome_produto} · arquivo <b>${l.arquivo || '-'}</b> · SIGTAP ${fmtComp(l.sigtap_competencia)}</p>
                    <table class="sg-tabela"><thead><tr><th>Código</th><th>Procedimento</th><th class="r">Qtd</th><th class="r">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
                    ${data.procedimentos.length > 60 ? `<small>+ ${data.procedimentos.length - 60} procedimentos</small>` : ''}</div>`
            });
        } catch (e) { Swal.fire('Erro', e.response?.data?.erro || e.message, 'error'); }
    };

    const r = previa?.resumo;
    const temErro = previa?.avisos?.some(a => a.nivel === 'erro');
    const paginas = Math.max(1, Math.ceil((hist.total || 0) / (hist.tamanho || 15)));
    const unidadesFiltro = filtro.projeto ? opcoes.unidades.filter(u => String(u.id_projeto) === String(filtro.projeto)) : opcoes.unidades;

    return (
        <div className="cadastro-container sg ft">
            <div className="sg-topo">
                <div className="sg-topo-tit">
                    <span className="sg-topo-ic"><Icon n="upload" /></span>
                    <div>
                        <h2>Lançar Faturamento</h2>
                        <p>Envie o arquivo de produção (BPA, APAC ou AIH). A produção é valorizada pela Tabela SIGTAP.</p>
                    </div>
                </div>
                <div className="sg-topo-acoes">
                    {aoAbrirPainel && <button className="sg-btn sg-btn-out" onClick={aoAbrirPainel}><Icon n="trend" /> Faturamento Consolidado</button>}
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            {podeNovo && (
                <div className="sg-card">
                    <div className="sg-card-tit"><h4><Icon n="file" /> Novo lançamento</h4>
                        {opcoes.sigtap.length === 0 && <span className="sg-badge danger">SIGTAP não importada</span>}
                    </div>

                    <div className="ft-form">
                        <label>Projeto
                            <select className="form-control" value={form.id_projeto} onChange={e => alterar('id_projeto', e.target.value)}>
                                <option value="">Selecione...</option>
                                {opcoes.projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}{p.ativo ? '' : ' (inativo)'}</option>)}
                            </select>
                        </label>
                        <label>Unidade
                            <select className="form-control" value={form.id_unidade} disabled={!form.id_projeto} onChange={e => alterar('id_unidade', e.target.value)}>
                                <option value="">{form.id_projeto ? 'Selecione...' : 'Escolha o projeto'}</option>
                                {unidadesDoProjeto.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}{u.cnes ? ` - CNES ${u.cnes}` : ''}</option>)}
                            </select>
                        </label>
                        <label>Produto
                            <select className="form-control" value={form.id_produto} onChange={e => alterar('id_produto', e.target.value)}>
                                <option value="">Selecione...</option>
                                {produtosOrdenados.map(p => <option key={p.id_produto} value={p.id_produto}>{p.nome_produto}{p.vinculado ? ' ✓' : ''}</option>)}
                            </select>
                        </label>
                        <label>Competência
                            <input type="month" className="form-control mono" value={form.competencia} onChange={e => alterar('competencia', e.target.value)} />
                            <small className="sg-muted">Vazio = usa a competência do arquivo</small>
                        </label>
                    </div>

                    <div className="ft-tipos" role="radiogroup" aria-label="Tipo de arquivo">
                        {TIPOS.map(t => (
                            <button key={t.v} type="button" role="radio" aria-checked={form.tipo === t.v}
                                className={`ft-tipo ${form.tipo === t.v ? 'ativo' : ''}`} onClick={() => alterar('tipo', t.v)}>
                                <b>{t.rotulo}</b><span>{t.desc}</span>
                            </button>
                        ))}
                    </div>

                    <div className={`sg-upload ${arquivo ? 'pronto' : ''} ${arrastando ? 'arrastando' : ''}`}
                        onDragOver={e => { e.preventDefault(); setArrastando(true); }}
                        onDragLeave={() => setArrastando(false)}
                        onDrop={e => { e.preventDefault(); setArrastando(false); escolher(e.dataTransfer.files?.[0]); }}>
                        <span className="sg-upload-ic"><Icon n={arquivo ? 'check' : 'file'} /></span>
                        <b>{arquivo ? 'Arquivo selecionado' : 'Arraste o arquivo aqui ou escolha'}</b>
                        {arquivo
                            ? <div className="sg-arquivo mono">{arquivo.name} <small>({(arquivo.size / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} KB)</small></div>
                            : <span>Arquivo exportado do sistema (ex.: <span className="mono">PA5529581.JAN</span>) ou o .zip com ele.</span>}
                        {gravando > 0 && <div className="sg-barra"><i style={{ width: `${gravando}%` }} /></div>}
                        <div className="sg-upload-acoes">
                            <label className="sg-btn sg-btn-out">
                                <Icon n="file" /> {arquivo ? 'Trocar arquivo' : 'Escolher arquivo'}
                                <input ref={entrada} type="file" hidden onChange={e => escolher(e.target.files?.[0])} />
                            </label>
                            {arquivo && !prontoParaAnalisar && <small className="sg-muted">Selecione projeto, unidade e produto para ler o arquivo.</small>}
                        </div>
                    </div>

                    {analisando && <div className="ft-lendo"><span className="sg-spin" /> Lendo e valorizando o arquivo...</div>}

                    {previa && (
                        <div className="ft-previa">
                            <div className="ft-previa-cab">
                                <div>
                                    <small>Prévia do lançamento</small>
                                    <h3>{r.unidade}</h3>
                                    <span className="sg-muted">{r.projeto} · {r.produto} · {r.tipo}{r.origem ? ` · origem ${r.origem}` : ''}</span>
                                </div>
                                <div className="ft-previa-total">
                                    <small>Valor SIGTAP</small>
                                    <strong className="mono">{fmtMoeda(r.vl_total)}</strong>
                                    <span className="sg-muted">Competência <b className="mono">{fmtComp(r.competencia)}</b></span>
                                </div>
                            </div>

                            <div className="sg-stats ft-stats">
                                <div className="sg-stat"><span>Competência do arquivo</span><strong className="mono">{fmtComp(r.competencia_arquivo)}</strong></div>
                                <div className="sg-stat"><span>CNES do arquivo</span><strong className="mono">{r.cnes_arquivo || '-'}</strong><small>Unidade: {r.cnes_unidade || 'sem CNES'}</small></div>
                                <div className="sg-stat"><span>Procedimentos (qtd)</span><strong className="mono">{fmtNum(r.qt_total)}</strong><small>{fmtNum(r.qt_procedimentos)} códigos · {fmtNum(r.qt_registros)} {r.tipo === 'AIH' ? 'AIHs' : 'registros'}</small></div>
                                {r.tipo === 'AIH'
                                    ? <div className="sg-stat"><span>Internações (AIHs)</span><strong className="mono">{fmtNum(r.qt_registros)}</strong><small>{fmtMoeda(r.qt_registros ? r.vl_total / r.qt_registros : 0)} por AIH</small></div>
                                    : <div className="sg-stat"><span>Pacientes distintos</span><strong className="mono">{r.qt_pacientes ? fmtNum(r.qt_pacientes) : '-'}</strong><small>{r.tipo === 'BPA' ? 'pelo CNS do BPA-I' : 'não se aplica'}</small></div>}
                                <div className="sg-stat"><span>Tabela SIGTAP</span><strong className="mono">{fmtComp(r.sigtap_competencia)}</strong></div>
                            </div>

                            {r.por_origem.length > 1 && (
                                <div className="ft-origens">
                                    {r.por_origem.map(o => (
                                        <div key={o.origem}><b>{ORIGEM_ROTULO[o.origem] || o.origem}</b><span className="mono">{fmtNum(o.quantidade)} proc.</span><span className="mono">{fmtMoeda(o.vl_total)}</span></div>
                                    ))}
                                </div>
                            )}

                            {previa.avisos.length > 0 && (
                                <ul className="ft-avisos">
                                    {previa.avisos.map((a, i) => <li key={i} className={a.nivel}><Icon n={NIVEL_ICONE[a.nivel]} /> {a.texto}</li>)}
                                </ul>
                            )}
                            {previa.existente && (
                                <div className="sg-aviso"><Icon n="alert" /><p>Esta competência já foi lançada ({fmtMoeda(previa.existente.vl_total)} por {previa.existente.usuario} em {previa.existente.dt_lancamento}). Ao confirmar, o lançamento anterior será <b>substituído</b>.</p></div>
                            )}

                            <div className="sg-tabela-wrap ft-tab-previa">
                                <table className="sg-tabela sg-resp">
                                    <thead><tr><th>Código</th><th>Procedimento</th><th className="r">Qtd</th><th className="r">Valor unit.</th><th className="r">Total</th></tr></thead>
                                    <tbody>
                                        {previa.procedimentos.slice(0, 15).map(p => (
                                            <tr key={p.co_procedimento} className={p.encontrado ? '' : 'ft-sem-valor'}>
                                                <td data-l="Código" className="mono">{fmtProc(p.co_procedimento)}</td>
                                                <td data-l="Procedimento">{p.no_procedimento || <i>Não encontrado na SIGTAP</i>}</td>
                                                <td data-l="Qtd" className="r mono">{fmtNum(p.quantidade)}</td>
                                                <td data-l="Valor unit." className="r mono">{fmtMoeda(p.vl_unitario)}</td>
                                                <td data-l="Total" className="r mono">{fmtMoeda(p.vl_total)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {previa.procedimentos.length > 15 && <small className="sg-muted">Mostrando os 15 maiores de {previa.procedimentos.length} procedimentos.</small>}
                            </div>

                            <div className="oe-acoes ft-acoes">
                                <button type="button" className="btn-voltar" onClick={() => { setPrevia(null); setArquivo(null); }}>Cancelar</button>
                                <button type="button" className="sg-btn" disabled={temErro || gravando > 0} onClick={() => gravar(!!previa.existente)}>
                                    <Icon n="save" /> {gravando > 0 ? 'Gravando...' : previa.existente ? 'Substituir lançamento' : 'Confirmar lançamento'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="sg-card">
                <div className="sg-card-tit"><h4><Icon n="clock" /> Lançamentos realizados</h4><small className="sg-muted">{fmtNum(hist.total)} lançamento(s)</small></div>
                <form className="sg-filtros" onSubmit={e => { e.preventDefault(); carregarHistorico(1); }}>
                    <label>Projeto
                        <select className="form-control" value={filtro.projeto} onChange={e => setFiltro({ ...filtro, projeto: e.target.value, unidade: '' })}>
                            <option value="">Todos</option>
                            {opcoes.projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </label>
                    <label>Unidade
                        <select className="form-control" value={filtro.unidade} onChange={e => setFiltro({ ...filtro, unidade: e.target.value })}>
                            <option value="">Todas</option>
                            {unidadesFiltro.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                        </select>
                    </label>
                    <label>Competência
                        <input type="month" className="form-control mono" value={filtro.competencia} onChange={e => setFiltro({ ...filtro, competencia: e.target.value })} />
                    </label>
                    <label>Tipo
                        <select className="form-control" value={filtro.tipo} onChange={e => setFiltro({ ...filtro, tipo: e.target.value })}>
                            <option value="">Todos</option>
                            {TIPOS.map(t => <option key={t.v} value={t.v}>{t.rotulo}</option>)}
                        </select>
                    </label>
                    <div className="sg-filtros-acoes">
                        <button type="button" className="sg-btn sg-btn-out" onClick={() => { const f = { projeto: '', unidade: '', competencia: '', tipo: '' }; setFiltro(f); carregarHistorico(1, f); }}>Limpar</button>
                        <button type="submit" className="sg-btn"><Icon n="search" /> Buscar</button>
                    </div>
                </form>

                <div className="sg-tabela-wrap">
                    <table className="sg-tabela sg-resp">
                        <thead>
                            <tr><th>Unidade / Projeto</th><th>Competência</th><th>Tipo / Produto</th><th className="r">Procedimentos</th><th className="r">Valor SIGTAP</th><th>Lançado por</th><th></th></tr>
                        </thead>
                        <tbody>
                            {carregandoHist ? (
                                <tr><td colSpan={7} className="sg-vazio">Carregando...</td></tr>
                            ) : hist.itens.length === 0 ? (
                                <tr><td colSpan={7} className="sg-vazio"><b>Nenhum lançamento encontrado</b><br />Envie o primeiro arquivo de produção acima.</td></tr>
                            ) : hist.itens.map(l => (
                                <tr key={l.id_lancamento}>
                                    <td data-l="Unidade"><div className="sg-cel-main">{l.nome_unidade}</div><div className="sg-cel-sub">{l.nome_projeto}{l.cnes ? ` · CNES ${l.cnes}` : ''}</div></td>
                                    <td data-l="Competência" className="mono">{fmtComp(l.competencia)}
                                        {l.competencia_arquivo && l.competencia_arquivo !== l.competencia && <div className="sg-cel-sub ft-alerta">arquivo {fmtComp(l.competencia_arquivo)}</div>}
                                    </td>
                                    <td data-l="Tipo"><span className="sg-badge">{l.tipo}</span><div className="sg-cel-sub">{l.nome_produto}</div></td>
                                    <td data-l="Procedimentos" className="r mono">{fmtNum(l.qt_total)}<div className="sg-cel-sub">{l.tipo === 'AIH' ? `${fmtNum(l.qt_registros)} AIHs · ` : ''}{fmtNum(l.qt_procedimentos)} códigos</div></td>
                                    <td data-l="Valor" className="r mono"><b>{fmtMoeda(l.vl_total)}</b>
                                        <div className="sg-cel-sub">SIGTAP {fmtComp(l.sigtap_competencia)}{l.sigtap_competencia !== l.competencia ? ' *' : ''}</div>
                                    </td>
                                    <td data-l="Lançado por"><div className="sg-cel-main">{l.usuario}</div><div className="sg-cel-sub">{l.dt_lancamento}</div></td>
                                    <td className="ft-acoes-linha">
                                        <button title="Ver procedimentos" className="sg-ic-btn" onClick={() => detalhar(l)}><Icon n="search" /></button>
                                        {podeEditar && <button title="Recalcular valores pela SIGTAP" className="sg-ic-btn" onClick={() => revalorizar(l)}><Icon n="refresh" /></button>}
                                        {podeEditar && <button title="Excluir lançamento" className="sg-ic-btn del" onClick={() => excluir(l)}><Icon n="trash" /></button>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <small className="sg-muted">* valorizado por outra competência da SIGTAP (a da produção não estava importada). Importe-a e use <Icon n="refresh" /> para recalcular.</small>
                {paginas > 1 && (
                    <div className="sg-pager">
                        <span>{fmtNum(hist.total)} lançamentos</span>
                        <button className="sg-ic-btn" disabled={hist.pagina <= 1} onClick={() => carregarHistorico(hist.pagina - 1)}><Icon n="arrow-left" /></button>
                        <b>{hist.pagina} / {paginas}</b>
                        <button className="sg-ic-btn" disabled={hist.pagina >= paginas} onClick={() => carregarHistorico(hist.pagina + 1)}><Icon n="arrow-right" /></button>
                    </div>
                )}
            </div>
        </div>
    );
}
