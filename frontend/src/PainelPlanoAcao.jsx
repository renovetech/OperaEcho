/* ARQUIVO: src/PainelPlanoAcao.js
 * Painel (dashboard) do Plano de Ação.
 *  - modo="interno": dentro do sistema (filtros, lotação, horas por pessoa, links públicos)
 *  - modo="publico": sem login, somente leitura (carteira de planos públicos ou um plano via token)
 * Gráficos em SVG/CSS puros (sem dependências novas).
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import logo from './logo.png';
import './PainelPlanoAcao.css';
import {
    COR_STATUS_ITEM, COR_SAUDE, STATUS_PLANO, fmtMin, dataBR,
    linkPublicoPlano, linkPublicoCarteira, copiarTexto
} from './planoAcaoUtils';

const AUTO_REFRESH_MS = 3 * 60 * 1000;

/* ============================== GRÁFICOS ================================ */
function Donut({ dados, total, rotulo }) {
    const R = 54, C = 2 * Math.PI * R;
    let acc = 0;
    return (
        <div className="pp-donut">
            <svg viewBox="0 0 140 140" role="img" aria-label={rotulo}>
                <circle cx="70" cy="70" r={R} fill="none" stroke="#EDECE5" strokeWidth="18" />
                {total > 0 && dados.filter(d => d.total > 0).map(d => {
                    const len = (d.total / total) * C;
                    const el = (
                        <circle key={d.nome} cx="70" cy="70" r={R} fill="none" stroke={COR_STATUS_ITEM[d.nome] || '#999'}
                            strokeWidth="18" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc}
                            transform="rotate(-90 70 70)"><title>{`${d.nome}: ${d.total}`}</title></circle>
                    );
                    acc += len;
                    return el;
                })}
                <text x="70" y="66" textAnchor="middle" className="pp-donut-num">{total}</text>
                <text x="70" y="86" textAnchor="middle" className="pp-donut-lbl">ações</text>
            </svg>
            <ul className="pp-legenda">
                {dados.map(d => (
                    <li key={d.nome}>
                        <span className="pp-dot" style={{ background: COR_STATUS_ITEM[d.nome] }} />
                        <span>{d.nome}</span>
                        <b>{d.total}</b>
                        <small>{total ? Math.round((d.total / total) * 100) : 0}%</small>
                    </li>
                ))}
            </ul>
        </div>
    );
}

function CurvaS({ pontos }) {
    if (!pontos || !pontos.length) return <div className="pp-vazio">Sem dados de prazo.</div>;
    const W = 520, H = 210, L = 34, B = 26, T = 10, Rm = 24;
    const iw = W - L - Rm, ih = H - T - B;
    const x = (i) => L + (pontos.length === 1 ? iw / 2 : (i * iw) / (pontos.length - 1));
    const y = (v) => T + ih - (Math.max(0, Math.min(100, v)) / 100) * ih;
    const linha = (k) => pontos.map((p, i) => `${x(i)},${y(p[k])}`).join(' ');
    const ultimo = pontos[pontos.length - 1];
    return (
        <div className="pp-curva">
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Curva S: previsto x realizado acumulado">
                {[0, 25, 50, 75, 100].map(v => (
                    <g key={v}>
                        <line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} stroke="#EDECE5" />
                        <text x={L - 6} y={y(v) + 3} textAnchor="end" className="pp-eixo">{v}%</text>
                    </g>
                ))}
                {pontos.map((p, i) => (i % 2 === 0 || i === pontos.length - 1) && (
                    <text key={p.semana} x={x(i)} y={H - 8} textAnchor="middle" className="pp-eixo">{p.semana.slice(8, 10)}/{p.semana.slice(5, 7)}</text>
                ))}
                <polyline points={linha('acum_previsto')} fill="none" stroke="#9C7A3C" strokeWidth="2.2" strokeDasharray="5 4" />
                <polyline points={linha('acum_realizado')} fill="none" stroke="#2E7D32" strokeWidth="2.6" />
                {pontos.map((p, i) => (
                    <circle key={i} cx={x(i)} cy={y(p.acum_realizado)} r="3" fill="#2E7D32">
                        <title>{`Semana ${dataBR(p.semana)} - previsto ${p.acum_previsto}% · realizado ${p.acum_realizado}% · concluídas ${p.concluidos}`}</title>
                    </circle>
                ))}
            </svg>
            <div className="pp-curva-leg">
                <span><i style={{ background: '#9C7A3C' }} /> Previsto acumulado <b>{ultimo.acum_previsto}%</b></span>
                <span><i style={{ background: '#2E7D32' }} /> Realizado acumulado <b>{ultimo.acum_realizado}%</b></span>
            </div>
        </div>
    );
}

function Barras({ dados, max = 10, vazio = 'Sem dados.' }) {
    const lista = (dados || []).slice(0, max);
    if (!lista.length) return <div className="pp-vazio">{vazio}</div>;
    return (
        <div className="pp-barras">
            {lista.map(d => {
                const t = d.total || 1;
                return (
                    <div key={d.nome} className="pp-barra-row" title={`${d.nome}: ${d.fechados}/${d.total} fechadas · ${d.atrasados} atrasadas`}>
                        <div className="pp-barra-nome">{d.nome}</div>
                        <div className="pp-barra-trilho">
                            <span style={{ width: `${(d.fechados / t) * 100}%`, background: COR_STATUS_ITEM.Fechado }} />
                            <span style={{ width: `${((d.andamento || 0) / t) * 100}%`, background: COR_STATUS_ITEM['Em andamento'] }} />
                            <span style={{ width: `${(d.atrasados / t) * 100}%`, background: COR_STATUS_ITEM.Atrasado }} />
                        </div>
                        <div className="pp-barra-val">{d.progresso}%<small>{d.fechados}/{d.total}</small></div>
                    </div>
                );
            })}
        </div>
    );
}

const Saude = ({ s }) => {
    const c = COR_SAUDE[s] || COR_SAUDE['NO PRAZO'];
    return <span className="pp-saude" style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>{s}</span>;
};

const Progresso = ({ valor, esperado }) => (
    <div className="pp-prog" title={`Realizado ${valor}% · esperado até hoje ${esperado ?? 0}%`}>
        <div className="pp-prog-trilho">
            <span style={{ width: `${valor}%` }} />
            {esperado != null && <i style={{ left: `${Math.min(100, esperado)}%` }} />}
        </div>
        <b>{valor}%</b>
    </div>
);

/* ============================== COMPONENTE ============================== */
export default function PainelPlanoAcao({ modo = 'interno', token = null, aoVoltar }) {
    const publico = modo === 'publico';
    const [dados, setDados] = useState(null);
    const [erro, setErro] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [projetos, setProjetos] = useState([]);
    const [filtros, setFiltros] = useState({ projeto: '', status: 'EM ANDAMENTO', cliente: '', id_plano: '' });
    const [tv, setTv] = useState(false);
    const [planosOpc, setPlanosOpc] = useState([]);
    const rootRef = useRef(null);

    const carregar = useCallback(async () => {
        setCarregando(true); setErro('');
        try {
            let res;
            if (publico) {
                res = await api.get(token ? `/publico/plano-acao/painel/${encodeURIComponent(token)}` : '/publico/plano-acao/painel');
            } else {
                const p = new URLSearchParams();
                Object.entries(filtros).forEach(([k, v]) => { if (v) p.append(k, v); });
                res = await api.get(`/plano-acao/painel?${p.toString()}`);
            }
            setDados(res.data);
            if (!publico && !filtros.id_plano) setPlanosOpc((res.data.planos || []).map(p => ({ id_plano: p.id_plano, titulo: p.titulo })));
        } catch (e) {
            setErro(e.response?.status === 404 ? 'Painel não encontrado ou não está mais publicado.' : (e.response?.data?.erro || 'Não foi possível carregar o painel.'));
        } finally { setCarregando(false); }
    }, [publico, token, filtros]);

    useEffect(() => { const t = setTimeout(carregar, 250); return () => clearTimeout(t); }, [carregar]);
    useEffect(() => { const t = setInterval(carregar, AUTO_REFRESH_MS); return () => clearInterval(t); }, [carregar]);
    useEffect(() => {
        if (publico) return;
        api.get('/projetos').then(r => setProjetos((r.data || []).filter(p => p.ativo))).catch(() => setProjetos([]));
    }, [publico]);

    const alternarTv = () => {
        const el = rootRef.current;
        if (!tv && el && el.requestFullscreen) el.requestFullscreen().catch(() => {});
        if (tv && document.fullscreenElement) document.exitFullscreen().catch(() => {});
        setTv(!tv);
    };

    const copiarLink = async (link) => {
        const ok = await copiarTexto(link);
        Swal.fire({ icon: ok ? 'success' : 'info', title: ok ? 'Link copiado!' : 'Copie o link', text: link, timer: ok ? 1800 : undefined, showConfirmButton: !ok });
    };

    const r = dados?.resumo;
    const plano = dados?.plano;
    const etapasPorBloco = useMemo(() => {
        if (!dados?.etapas) return [];
        const m = new Map();
        dados.etapas.forEach(e => {
            const k = [e.modulo, e.unidade || e.grupo].filter(Boolean).join(' · ') || 'GERAL';
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(e);
        });
        return [...m.entries()];
    }, [dados]);

    const titulo = publico
        ? (plano ? plano.titulo : (token ? 'Painel do Plano de Ação' : 'Carteira de Planos de Ação'))
        : 'Painel do Plano de Ação';
    const subtitulo = publico
        ? (plano ? [plano.cliente, plano.nome_projeto].filter(Boolean).join(' · ') : '')
        : '';

    return (
        <div className={`pp-page ${publico ? 'pp-page--publico' : ''} ${tv ? 'pp-page--tv' : ''}`} ref={rootRef}>
            <header className="pp-head">
                <div className="pp-head-id">
                    {publico && <img src={logo} alt="Opera Echo" className="pp-logo" />}
                    <div>
                        <h1>{titulo}</h1>
                        {subtitulo && <p>{subtitulo}</p>}
                    </div>
                </div>
                <div className="pp-head-acoes no-print">
                    {dados && <span className="pp-atualizado"><Icon n="clock" /> {new Date(dados.gerado_em).toLocaleString('pt-BR')}</span>}
                    <button className="pp-btn" onClick={carregar} disabled={carregando} title="Atualizar"><Icon n="refresh" /> {carregando ? 'Atualizando…' : 'Atualizar'}</button>
                    <button className="pp-btn" onClick={alternarTv} title="Modo TV (tela cheia, atualiza a cada 5 min)"><Icon n="monitor" /> {tv ? 'Sair do modo TV' : 'Modo TV'}</button>
                    {!publico && <button className="pp-btn" onClick={() => copiarLink(linkPublicoCarteira())} title="Link público da carteira (somente planos publicados)"><Icon n="globe" /> Link público</button>}
                    {publico && token && <a className="pp-btn" href="/painel-plano-acao"><Icon n="grid" /> Carteira</a>}
                    {!publico && aoVoltar && <button className="pp-btn pp-btn--ghost" onClick={aoVoltar}><Icon n="arrow-left" /> Voltar</button>}
                </div>
            </header>

            {!publico && (
                <div className="pp-filtros no-print">
                    <label>Projeto
                        <select value={filtros.projeto} onChange={e => setFiltros(f => ({ ...f, projeto: e.target.value, id_plano: '' }))}>
                            <option value="">Todos</option>
                            {projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </label>
                    <label>Situação do plano
                        <select value={filtros.status} onChange={e => setFiltros(f => ({ ...f, status: e.target.value, id_plano: '' }))}>
                            <option value="">Todas</option>
                            {STATUS_PLANO.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </label>
                    <label>Cliente
                        <input value={filtros.cliente} placeholder="Buscar cliente…" onChange={e => setFiltros(f => ({ ...f, cliente: e.target.value }))} />
                    </label>
                    <label>Plano
                        <select value={filtros.id_plano} onChange={e => setFiltros(f => ({ ...f, id_plano: e.target.value }))}>
                            <option value="">Todos os planos</option>
                            {planosOpc.map(p => <option key={p.id_plano} value={p.id_plano}>{p.titulo}</option>)}
                        </select>
                    </label>
                </div>
            )}

            {erro && <div className="pp-card pp-erro"><Icon n="alert" /> {erro}</div>}
            {!erro && !dados && <div className="pp-card pp-vazio">Carregando painel…</div>}

            {dados && r && (
                <>
                    {plano && (
                        <div className="pp-card pp-plano-info">
                            <div><small>Situação</small><b>{plano.status}</b></div>
                            <div><small>Início previsto</small><b>{dataBR(plano.data_inicio_prevista)}</b></div>
                            <div><small>Término previsto</small><b>{dataBR(plano.data_fim_prevista)}</b></div>
                            <div><small>Unidades</small><b>{r.unidades}</b></div>
                            {dados.planos[0] && <div><small>Saúde</small><Saude s={dados.planos[0].saude} /></div>}
                            {plano.descricao && <p className="pp-plano-desc">{plano.descricao}</p>}
                        </div>
                    )}

                    {/* KPIs */}
                    <section className="pp-kpis">
                        {!plano && <div className="pp-kpi"><span>Planos ativos</span><b>{r.planos_ativos}</b><small>{r.planos} no total · {r.planos_concluidos} concluídos</small></div>}
                        <div className="pp-kpi pp-kpi--destaque">
                            <span>Execução geral</span><b>{r.progresso}%</b>
                            <small className={r.desvio < 0 ? 'neg' : 'pos'}>esperado {r.esperado}% · {r.desvio > 0 ? '+' : ''}{r.desvio} p.p.</small>
                        </div>
                        <div className="pp-kpi"><span>Ações</span><b>{r.total}</b><small>{r.fechados} fechadas · {r.andamento} em andamento</small></div>
                        <div className={`pp-kpi ${r.atrasados ? 'pp-kpi--alerta' : ''}`}><span>Atrasadas</span><b>{r.atrasados}</b><small>{r.total ? Math.round((r.atrasados / r.total) * 100) : 0}% das ações</small></div>
                        <div className="pp-kpi"><span>Vencem em 7 dias</span><b>{r.vencendo_7d}</b><small>ações abertas</small></div>
                        <div className="pp-kpi"><span>Aderência ao prazo</span><b>{r.aderencia == null ? '-' : `${r.aderencia}%`}</b><small>fechadas dentro do prazo</small></div>
                        {!publico && <div className="pp-kpi"><span>Horas trabalhadas</span><b>{fmtMin(r.trabalhado_min)}</b><small>previsto {fmtMin(r.previsto_min)}</small></div>}
                    </section>

                    <section className="pp-grid pp-grid--3">
                        <div className="pp-card"><h3>Situação das ações</h3><Donut dados={dados.por_status} total={r.total} rotulo="Distribuição por situação" /></div>
                        <div className="pp-card pp-span-2"><h3>Curva S - previsto x realizado</h3><CurvaS pontos={dados.evolucao} /></div>
                    </section>

                    {!plano && (
                        <section className="pp-card">
                            <h3>Planos <small>({dados.planos.length})</small>
                                <span className="pp-saude-resumo">
                                    {Object.entries(r.saude || {}).map(([k, v]) => <span key={k}><Saude s={k} /> {v}</span>)}
                                </span>
                            </h3>
                            <div className="pp-tabela-wrap">
                                <table className="pp-tabela">
                                    <thead><tr>
                                        <th>Plano</th><th>Cliente</th>{!publico && <th>Projeto</th>}<th className="c">Saúde</th>
                                        <th style={{ minWidth: 170 }}>Execução <small>(▏= esperado)</small></th>
                                        <th className="c">Ações</th><th className="c">Atrasadas</th><th className="c">Próx. prazo</th><th className="c">Término</th>
                                        <th className="c no-print">{publico ? 'Painel' : 'Público'}</th>
                                    </tr></thead>
                                    <tbody>
                                        {dados.planos.map(p => (
                                            <tr key={p.id_plano || p.token_publico || p.titulo}>
                                                <td><b>{p.titulo}</b><div className="pp-sub">{p.produto || ''}</div></td>
                                                <td>{p.cliente || '-'}</td>
                                                {!publico && <td>{p.nome_projeto || '-'}</td>}
                                                <td className="c"><Saude s={p.saude} /></td>
                                                <td><Progresso valor={p.progresso} esperado={p.esperado} /></td>
                                                <td className="c">{p.fechados}/{p.total}</td>
                                                <td className="c">{p.atrasados ? <b className="pp-neg">{p.atrasados}</b> : 0}</td>
                                                <td className="c">{dataBR(p.proximo_prazo)}</td>
                                                <td className="c">{dataBR(p.data_fim_prevista)}</td>
                                                <td className="c no-print">
                                                    {p.token_publico
                                                        ? (publico
                                                            ? <a className="pp-link" href={`/painel-plano-acao/${p.token_publico}`}>Abrir</a>
                                                            : <button className="pp-link" onClick={() => copiarLink(linkPublicoPlano(p.token_publico))}><Icon n="link" /> Copiar</button>)
                                                        : <span className="pp-sub">privado</span>}
                                                </td>
                                            </tr>
                                        ))}
                                        {!dados.planos.length && <tr><td colSpan="10" className="pp-vazio">Nenhum plano encontrado.</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <section className="pp-grid pp-grid--3">
                        <div className="pp-card"><h3>Por etapa</h3><Barras dados={dados.por_etapa} max={12} /></div>
                        <div className="pp-card"><h3>Por responsável</h3><Barras dados={dados.por_responsavel} max={10} /></div>
                        <div className="pp-card"><h3>Por unidade</h3><Barras dados={dados.por_unidade} max={12} vazio="Plano sem unidades." /></div>
                    </section>

                    {(dados.por_cliente || []).length > 1 && (
                        <section className="pp-card"><h3><Icon n="handshake" /> Por cliente</h3><Barras dados={dados.por_cliente} max={15} /></section>
                    )}

                    {(dados.por_modulo || []).length > 1 && (
                        <section className="pp-grid pp-grid--2">
                            <div className="pp-card"><h3>Por módulo / produto</h3><Barras dados={dados.por_modulo} /></div>
                            <div className="pp-card"><h3>Por prioridade</h3><Barras dados={dados.por_prioridade.filter(p => p.total)} /></div>
                        </section>
                    )}

                    <section className="pp-grid pp-grid--2">
                        <div className="pp-card">
                            <h3><Icon n="alert" /> Ações atrasadas <small>({dados.atrasados.length})</small></h3>
                            <ListaPrazos itens={dados.atrasados} tipo="atraso" mostrarPlano={!plano} />
                        </div>
                        <div className="pp-card">
                            <h3><Icon n="calendar" /> Próximos prazos <small>(15 dias)</small></h3>
                            <ListaPrazos itens={dados.proximos_prazos} tipo="prazo" mostrarPlano={!plano} />
                        </div>
                    </section>

                    {!publico && (dados.por_pessoa || []).length > 0 && (
                        <section className="pp-card">
                            <h3><Icon n="users" /> Equipe - alocação e horas trabalhadas</h3>
                            <div className="pp-tabela-wrap">
                                <table className="pp-tabela">
                                    <thead><tr><th>Pessoa</th><th className="c">Ações alocadas</th><th className="c">Abertas</th><th className="c">Atrasadas</th><th className="c">Apontamentos</th><th className="c">Horas trabalhadas</th></tr></thead>
                                    <tbody>
                                        {dados.por_pessoa.map(p => (
                                            <tr key={p.id_usuario}>
                                                <td>{p.nome}</td><td className="c">{p.itens}</td><td className="c">{p.abertos}</td>
                                                <td className="c">{p.atrasados ? <b className="pp-neg">{p.atrasados}</b> : 0}</td>
                                                <td className="c">{p.apontamentos}</td><td className="c"><b>{fmtMin(p.trabalhado_min)}</b></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    {plano && etapasPorBloco.length > 0 && (
                        <section className="pp-card">
                            <h3><Icon n="clipboard" /> Cronograma de etapas</h3>
                            <div className="pp-tabela-wrap">
                                <table className="pp-tabela pp-tabela--compacta">
                                    <thead><tr><th>Ação</th><th>Cliente</th><th>Responsável</th><th className="c">Início prev.</th><th className="c">Fim prev.</th><th className="c">Início real</th><th className="c">Fim real</th><th className="c">Situação</th></tr></thead>
                                    <tbody>
                                        {etapasPorBloco.map(([bloco, lista]) => (
                                            <React.Fragment key={bloco}>
                                                <tr className="pp-bloco"><td colSpan="8">{bloco}</td></tr>
                                                {lista.map((e, i) => (
                                                    <tr key={i}>
                                                        <td>{e.descricao}</td><td>{e.cliente || '-'}</td><td>{e.responsavel || '-'}</td>
                                                        <td className="c">{dataBR(e.data_inicio)}</td><td className="c">{dataBR(e.data_fim)}</td>
                                                        <td className="c">{dataBR(e.data_inicio_real)}</td><td className="c">{dataBR(e.data_fim_real)}</td>
                                                        <td className="c"><span className="pp-st" style={{ color: COR_STATUS_ITEM[e.status], borderColor: COR_STATUS_ITEM[e.status] }}>{e.status}</span></td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    )}

                    <footer className="pp-foot">
                        <span>Opera Echo - Plano de Ação · {publico ? 'Visualização pública (somente leitura)' : 'Uso interno'}</span>
                        <span>Atualização automática a cada 5 minutos</span>
                    </footer>
                </>
            )}
        </div>
    );
}

function ListaPrazos({ itens, tipo, mostrarPlano }) {
    if (!itens || !itens.length) return <div className="pp-vazio">{tipo === 'atraso' ? 'Nenhuma ação atrasada.' : 'Nenhum prazo nos próximos 15 dias.'}</div>;
    return (
        <ul className="pp-prazos">
            {itens.slice(0, 40).map(i => (
                <li key={i.id_item}>
                    <span className={`pp-prazo-tag ${tipo === 'atraso' ? 'neg' : (i.dias_restantes <= 3 ? 'warn' : '')}`}>
                        {tipo === 'atraso' ? `${i.dias_atraso ?? '?'}d` : (i.dias_restantes === 0 ? 'hoje' : `${i.dias_restantes}d`)}
                    </span>
                    <div>
                        <b>{i.descricao}</b>
                        <small>
                            {[mostrarPlano ? i.plano : null, i.cliente, i.unidade, i.responsavel, `prazo ${dataBR(i.data_fim)}`].filter(Boolean).join(' · ')}
                        </small>
                    </div>
                </li>
            ))}
            {itens.length > 40 && <li className="pp-sub">+ {itens.length - 40} ações…</li>}
        </ul>
    );
}
