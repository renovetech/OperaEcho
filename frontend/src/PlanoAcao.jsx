/* ARQUIVO: src/PlanoAcao.js - Listagem/gestão dos Planos de Ação */
import React, { useState, useEffect, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import './PlanoAcao.css';
import { COR_SAUDE, STATUS_PLANO, dataBR, linkPublicoPlano, copiarTexto, msgErro } from './planoAcaoUtils';

export default function PlanoAcao({ aoVoltar, aoAbrirDetalhes, aoAbrirPainel }) {
    const [listaPlanos, setListaPlanos] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [filtros, setFiltros] = useState({ data: '', id_projeto: '', status: '', busca: '' });
    const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

    useEffect(() => {
        (async () => {
            try {
                const resProj = await api.get('/projetos');
                setProjetos((resProj.data || []).filter(p => p.ativo));
            } catch (error) { console.error('Erro ao carregar projetos', error); }
            try {
                const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario_opera') || 'null');
                if (usuarioLogado?.perfil_acesso === 'Administrador') {
                    setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
                } else if (usuarioLogado?.perfil_acesso) {
                    const resRegras = await api.get(`/regras/${encodeURIComponent(usuarioLogado.perfil_acesso)}`);
                    const regra = resRegras.data.find(r => r.nome_modulo === 'plano_acao');
                    if (regra) setPermissoes({ pode_acessar: !!regra.pode_acessar, pode_novo: !!regra.pode_novo, pode_editar: !!regra.pode_editar });
                }
            } catch (error) { console.error('Erro ao carregar permissões', error); }
        })();
    }, []);

    const buscarPlanos = useCallback(async () => {
        setCarregando(true);
        try {
            const p = new URLSearchParams();
            if (filtros.data) p.append('data', filtros.data);
            if (filtros.id_projeto) p.append('projeto', filtros.id_projeto);
            if (filtros.status) p.append('status', filtros.status);
            if (filtros.busca) p.append('busca', filtros.busca);
            const response = await api.get(`/plano-acao/buscar?${p.toString()}`);
            setListaPlanos(response.data || []);
        } catch (error) {
            console.error('Erro ao buscar planos:', error);
            setListaPlanos([]);
        } finally { setCarregando(false); }
    }, [filtros]);

    useEffect(() => { const t = setTimeout(buscarPlanos, 300); return () => clearTimeout(t); }, [buscarPlanos]);

    const handleExcluir = async (plano) => {
        if (!(plano.pode_excluir ?? permissoes.pode_editar)) return;
        const result = await Swal.fire({
            title: 'Excluir plano?',
            html: `<b>${plano.titulo}</b><br/>Todas as ações, apontamentos de horas e o histórico serão apagados. Esta operação não pode ser desfeita.`,
            icon: 'warning', input: 'text', inputPlaceholder: 'Digite EXCLUIR para confirmar',
            showCancelButton: true, confirmButtonColor: '#A23B36', confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar',
            preConfirm: (v) => (v === 'EXCLUIR' ? true : Swal.showValidationMessage('Digite EXCLUIR para confirmar'))
        });
        if (!result.isConfirmed) return;
        try {
            await api.delete(`/plano-acao/${plano.id_plano}`);
            Swal.fire({ icon: 'success', title: 'Plano excluído', timer: 1400, showConfirmButton: false });
            buscarPlanos();
        } catch (error) { Swal.fire('Erro', msgErro(error, 'Erro ao excluir plano.'), 'error'); }
    };

    const handleEncerrar = async (plano) => {
        if (!(plano.pode_editar ?? permissoes.pode_editar)) return;
        const pendentes = (plano.total || 0) - (plano.fechados || 0);
        const result = await Swal.fire({
            title: 'Encerrar plano?',
            html: pendentes > 0
                ? `Existem <b>${pendentes}</b> ação(ões) não fechadas.<br/>Informe a justificativa do encerramento:`
                : 'Todas as ações estão fechadas. O plano ficará somente leitura.',
            icon: 'question',
            input: pendentes > 0 ? 'textarea' : undefined,
            inputPlaceholder: 'Justificativa (mín. 10 caracteres)',
            showCancelButton: true, confirmButtonColor: '#2E7D32', confirmButtonText: 'Encerrar', cancelButtonText: 'Cancelar',
            preConfirm: (v) => (pendentes > 0 && (!v || v.trim().length < 10) ? Swal.showValidationMessage('Justificativa obrigatória (mín. 10 caracteres)') : (v || ''))
        });
        if (!result.isConfirmed) return;
        try {
            await api.put(`/plano-acao/encerrar/${plano.id_plano}`, { justificativa: result.value || null });
            Swal.fire({ icon: 'success', title: 'Plano encerrado', timer: 1400, showConfirmButton: false });
            buscarPlanos();
        } catch (error) { Swal.fire('Erro', msgErro(error, 'Não foi possível encerrar o plano.'), 'error'); }
    };

    const handleReabrir = async (plano) => {
        const r = await Swal.fire({ title: 'Reabrir plano?', text: 'O plano voltará a aceitar edições.', icon: 'question', showCancelButton: true, confirmButtonColor: '#2E7D32', confirmButtonText: 'Reabrir', cancelButtonText: 'Cancelar' });
        if (!r.isConfirmed) return;
        try { await api.put(`/plano-acao/reabrir/${plano.id_plano}`); buscarPlanos(); }
        catch (error) { Swal.fire('Erro', msgErro(error), 'error'); }
    };

    const handlePublico = async (plano) => {
        if (plano.publico && plano.token_publico) {
            const r = await Swal.fire({
                title: 'Painel público ativo',
                html: `<input class="swal2-input" readonly value="${linkPublicoPlano(plano.token_publico)}" style="font-size:.85rem" />`,
                showDenyButton: (plano.pode_editar ?? permissoes.pode_editar), showCancelButton: true,
                confirmButtonText: 'Copiar link', denyButtonText: 'Despublicar', cancelButtonText: 'Fechar',
                confirmButtonColor: '#2E7D32', denyButtonColor: '#A23B36'
            });
            if (r.isConfirmed) { await copiarTexto(linkPublicoPlano(plano.token_publico)); Swal.fire({ icon: 'success', title: 'Link copiado!', timer: 1200, showConfirmButton: false }); }
            if (r.isDenied) { await api.post(`/plano-acao/${plano.id_plano}/publico`, { publico: false }); buscarPlanos(); }
            return;
        }
        if (!(plano.pode_editar ?? permissoes.pode_editar)) return Swal.fire('Painel privado', 'Você não tem permissão para publicar este plano.', 'info');
        const r = await Swal.fire({
            title: 'Publicar painel do plano?',
            html: 'Qualquer pessoa com o link poderá ver o <b>painel e o cronograma</b> (somente leitura).<br/>Observações, equipe e horas <b>não</b> são exibidas.',
            icon: 'info', showCancelButton: true, confirmButtonText: 'Publicar', cancelButtonText: 'Cancelar', confirmButtonColor: '#2E7D32'
        });
        if (!r.isConfirmed) return;
        try {
            const res = await api.post(`/plano-acao/${plano.id_plano}/publico`, { publico: true });
            const link = linkPublicoPlano(res.data.token_publico);
            await copiarTexto(link);
            Swal.fire({ icon: 'success', title: 'Publicado! Link copiado', text: link });
            buscarPlanos();
        } catch (error) { Swal.fire('Erro', msgErro(error), 'error'); }
    };

    const contagemSaude = listaPlanos.reduce((acc, p) => { if (p.saude) acc[p.saude] = (acc[p.saude] || 0) + 1; return acc; }, {});

    return (
        <div className="pa-page">
            <div className="pa-header">
                <div className="pa-title"><span className="pa-icon"><Icon n="target" /></span><h2>Plano de Ação</h2></div>
                <div className="pa-actions">
                    {aoAbrirPainel && <button className="pa-btn pa-btn--ghost" onClick={aoAbrirPainel}><Icon n="bar-chart" /> Painel</button>}
                    {permissoes.pode_novo && <button className="pa-btn pa-btn--green" onClick={() => aoAbrirDetalhes('novo')}><Icon n="plus" /> Novo Plano</button>}
                    <button className="pa-btn pa-btn--ghost" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            <div className="pa-filtros">
                <div className="pa-field" style={{ flex: 2 }}>
                    <label>Buscar (título ou cliente)</label>
                    <input value={filtros.busca} placeholder="Digite para buscar…" onChange={e => setFiltros({ ...filtros, busca: e.target.value })} />
                </div>
                <div className="pa-field">
                    <label>Data de criação</label>
                    <input type="date" min="1900-01-01" max="2100-12-31" value={filtros.data} onChange={e => setFiltros({ ...filtros, data: e.target.value })} />
                </div>
                <div className="pa-field">
                    <label>Projeto</label>
                    <select value={filtros.id_projeto} onChange={e => setFiltros({ ...filtros, id_projeto: e.target.value })}>
                        <option value="">Todos</option>
                        {projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                    </select>
                </div>
                <div className="pa-field">
                    <label>Situação</label>
                    <select value={filtros.status} onChange={e => setFiltros({ ...filtros, status: e.target.value })}>
                        <option value="">Todas</option>
                        {STATUS_PLANO.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <button className="pa-btn pa-btn--ghost" onClick={() => setFiltros({ data: '', id_projeto: '', status: '', busca: '' })}>Limpar</button>
            </div>

            {listaPlanos.length > 0 && (
                <div className="pa-resumo-chips">
                    <span><b>{listaPlanos.length}</b> plano(s)</span>
                    {Object.entries(contagemSaude).map(([s, n]) => {
                        const c = COR_SAUDE[s] || {};
                        return <span key={s} className="pa-saude" style={{ background: c.bg, color: c.fg, borderColor: c.bd }}>{s}: {n}</span>;
                    })}
                    <span><b>{listaPlanos.reduce((a, p) => a + (p.atrasados || 0), 0)}</b> ação(ões) atrasada(s)</span>
                </div>
            )}

            <div className="pa-tabela-wrap pa-card">
                <table className="pa-tabela">
                    <thead>
                        <tr>
                            <th>Plano / Cliente</th>
                            <th>Projeto</th>
                            <th>Produto(s)</th>
                            <th className="center">Unid.</th>
                            <th style={{ minWidth: 160 }}>Execução</th>
                            <th className="center">Saúde</th>
                            <th className="center">Atrasadas</th>
                            <th className="center">Próx. prazo</th>
                            <th className="center">Situação</th>
                            <th className="center" style={{ width: 190 }}>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {listaPlanos.map((plano) => {
                            const cs = COR_SAUDE[plano.saude] || {};
                            const encerrado = plano.status === 'ENCERRADO';
                            return (
                                <tr key={plano.id_plano}>
                                    <td>
                                        <button className="pa-link-titulo" onClick={() => aoAbrirDetalhes(plano.id_plano)}>{plano.titulo}</button>
                                        <div className="pa-sub">{plano.cliente || '-'}{plano.cliente_informado === false ? ' (projeto)' : ''} · criado em {dataBR(plano.data_criacao)}</div>
                                    </td>
                                    <td>{plano.nome_projeto || '-'}</td>
                                    <td>{plano.modulos ? plano.modulos.split(', ').map(m => <span key={m} className="pa-mod-tag">{m}</span>) : <span className="pa-mod-empty">-</span>}</td>
                                    <td className="center"><span className="pa-pill-num">{plano.qtd_unidades}</span></td>
                                    <td>
                                        <div className="pa-prog" title={`Realizado ${plano.progresso}% · esperado até hoje ${plano.esperado}%`}>
                                            <div className="pa-prog-trilho"><span style={{ width: `${plano.progresso}%` }} /><i style={{ left: `${plano.esperado}%` }} /></div>
                                            <b>{plano.progresso}%</b>
                                        </div>
                                        <div className="pa-sub">{plano.fechados}/{plano.total} ações fechadas</div>
                                    </td>
                                    <td className="center"><span className="pa-saude" style={{ background: cs.bg, color: cs.fg, borderColor: cs.bd }}>{plano.saude}</span></td>
                                    <td className="center">{plano.atrasados ? <b style={{ color: 'var(--danger)' }}>{plano.atrasados}</b> : 0}</td>
                                    <td className="center">{dataBR(plano.proximo_prazo)}</td>
                                    <td className="center"><span className={`pa-status ${encerrado ? 'pa-status--off' : 'pa-status--on'}`}>{plano.status}</span></td>
                                    <td className="center">
                                        <div className="pa-acoes-linha">
                                            <button className="pa-icon-btn" title="Abrir plano" onClick={() => aoAbrirDetalhes(plano.id_plano)}><Icon n="folder" /></button>
                                            <button className={`pa-icon-btn ${plano.publico ? 'pa-icon-btn--on' : ''}`} title={plano.publico ? 'Painel público ativo' : 'Publicar painel'} onClick={() => handlePublico(plano)}><Icon n="globe" /></button>
                                            {(plano.pode_editar ?? permissoes.pode_editar) && !encerrado && <button className="pa-icon-btn" title="Encerrar plano" onClick={() => handleEncerrar(plano)}><Icon n="check" /></button>}
                                            {(plano.pode_editar ?? permissoes.pode_editar) && encerrado && <button className="pa-icon-btn" title="Reabrir plano" onClick={() => handleReabrir(plano)}><Icon n="undo" /></button>}
                                            {(plano.pode_excluir ?? permissoes.pode_editar) && <button className="pa-icon-btn pa-icon-btn--danger" title="Excluir" onClick={() => handleExcluir(plano)}><Icon n="trash" /></button>}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {!listaPlanos.length && (
                            <tr><td colSpan="10" className="pa-empty">{carregando ? 'Carregando…' : 'Nenhum plano de ação encontrado com os filtros atuais.'}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
