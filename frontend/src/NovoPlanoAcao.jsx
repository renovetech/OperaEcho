/* ARQUIVO: src/NovoPlanoAcao.js
 * Criação do Plano de Ação.
 * Padrão: montar do zero - etapas e ações cadastradas na hora.
 * Opcional: carregar o modelo de um produto como ponto de partida (editável).
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import './PlanoAcao.css';
import { resolverTemplate, montarEtapas } from './config/planoTemplates';
import MontadorPlano, { novaEtapa, novaAcao } from './MontadorPlano';
import { msgErro } from './planoAcaoUtils';

const PASSOS = ['Projeto', 'Unidades', 'Modelo (opcional)', 'Etapas e ações', 'Dados do plano'];

export default function NovoPlanoAcao({ aoCancelar, aoCriar }) {
    const [passo, setPasso] = useState(0);
    const [projetos, setProjetos] = useState([]);
    const [unidades, setUnidades] = useState([]);
    const [produtosPlano, setProdutosPlano] = useState([]);
    const [produtosVinculados, setProdutosVinculados] = useState(() => new Set());
    const [buscaUni, setBuscaUni] = useState('');
    const [form, setForm] = useState({
        id_projeto: '', ids_unidades: [], ids_produtos: [], sub_tipo: '', titulo: '',
        cliente: '', descricao: '', data_inicio_prevista: '', data_fim_prevista: '', publico: false
    });
    const [etapas, setEtapas] = useState(() => [novaEtapa('PLANEJAMENTO')]);
    const [acoesUnidade, setAcoesUnidade] = useState([]);
    const [gerando, setGerando] = useState(false);

    useEffect(() => {
        Promise.all([api.get('/projetos'), api.get('/produtos/plano-acao').catch(() => ({ data: [] }))])
            .then(([rP, rProd]) => { setProjetos((rP.data || []).filter(p => p.ativo)); setProdutosPlano(rProd.data || []); })
            .catch(() => {});
    }, []);

    const projetoSel = projetos.find(p => String(p.id_projeto) === String(form.id_projeto));

    const trocarProjeto = async (id) => {
        setForm(f => ({ ...f, id_projeto: id, ids_unidades: [], ids_produtos: [], sub_tipo: '' }));
        setUnidades([]);
        if (!id) return;
        try {
            const res = await api.get(`/unidades/buscar?projeto=${id}&status=true&limite=1000`);
            setUnidades(res.data?.dados || (Array.isArray(res.data) ? res.data : []));
        } catch (e) { setUnidades([]); }
    };

    // Produtos efetivamente vinculados às unidades escolhidas
    useEffect(() => {
        let cancelado = false;
        (async () => {
            if (!form.ids_unidades.length) { setProdutosVinculados(new Set(produtosPlano.map(p => p.id_produto))); return; }
            const resps = await Promise.all(form.ids_unidades.map(idu => api.get(`/unidades/${idu}/produtos`).then(r => r.data).catch(() => [])));
            if (cancelado) return;
            const ids = new Set();
            resps.forEach(arr => (arr || []).forEach(p => ids.add(p.id_produto)));
            setProdutosVinculados(ids);
        })();
        return () => { cancelado = true; };
    }, [form.ids_unidades, produtosPlano]);

    // Só produtos com modelo de etapas cadastrado (o plano não depende mais de flag no produto)
    const produtosVisiveis = useMemo(() => produtosPlano.filter(p => produtosVinculados.has(p.id_produto) && resolverTemplate(p.nome_produto)), [produtosPlano, produtosVinculados]);
    const produtosSel = useMemo(() => produtosPlano.filter(p => form.ids_produtos.includes(p.id_produto)), [produtosPlano, form.ids_produtos]);
    const precisaSubTipo = produtosSel.some(p => resolverTemplate(p.nome_produto)?.precisaSubTipo);
    const modulos = useMemo(() => [...new Set(produtosSel.map(p => resolverTemplate(p.nome_produto)?.modulo).filter(Boolean))], [produtosSel]);
    const unidadesFiltradas = unidades.filter(u => !buscaUni || u.nome_unidade.toLowerCase().includes(buscaUni.toLowerCase()));

    const toggle = (campo, id) => setForm(f => ({ ...f, [campo]: f[campo].includes(id) ? f[campo].filter(x => x !== id) : [...f[campo], id] }));

    // Converte o modelo dos produtos escolhidos em etapas editáveis do montador
    const carregarModelo = async () => {
        if (!produtosSel.length) return Swal.fire('Atenção', 'Selecione ao menos um produto.', 'warning');
        if (precisaSubTipo && !form.sub_tipo) return Swal.fire('Atenção', 'Selecione o Tipo de Atenção.', 'warning');
        const temConteudo = etapas.some(e => e.acoes.length) || acoesUnidade.length;
        let substituir = true;
        if (temConteudo) {
            const r = await Swal.fire({ title: 'Carregar modelo', text: 'Você já tem etapas montadas.', icon: 'question', showDenyButton: true, showCancelButton: true,
                confirmButtonText: 'Substituir', denyButtonText: 'Acrescentar', cancelButtonText: 'Cancelar', confirmButtonColor: '#2E7D32', denyButtonColor: '#388E3C' });
            if (r.isDismissed) return;
            substituir = r.isConfirmed;
        }
        const novas = [], uni = [];
        produtosSel.forEach(prod => {
            const tpl = resolverTemplate(prod.nome_produto);
            if (!tpl) return;
            const { etapas_padrao, etapas_unidade } = montarEtapas(tpl, form.sub_tipo, form.ids_unidades);
            etapas_padrao.forEach(e => {
                let et = novas.find(x => x.nome === (e.grupo || 'GERAL') && x.modulo === (e.modulo || null));
                if (!et) { et = novaEtapa(e.grupo || 'GERAL', [], e.modulo || null); novas.push(et); }
                et.acoes.push(novaAcao(e.acao, { responsavel: e.responsavel || '' }));
            });
            etapas_unidade.forEach(e => uni.push(novaAcao(e.acao, { responsavel: e.responsavel || '', modulo: e.modulo || null })));
        });
        if (!novas.length && !uni.length) return Swal.fire('Sem modelo', 'Os produtos escolhidos não possuem modelo cadastrado. Monte as etapas do zero.', 'info');
        const base = substituir ? [] : etapas.filter(e => e.acoes.length || e.nome.trim());
        setEtapas([...base, ...novas]);
        setAcoesUnidade(substituir ? uni : [...acoesUnidade, ...uni]);
        if (!form.titulo) {
            const t = produtosSel.length === 1
                ? (resolverTemplate(produtosSel[0].nome_produto)?.tituloSugerido || `IMPLANTAÇÃO ${produtosSel[0].nome_produto.toUpperCase()}`)
                : `IMPLANTAÇÃO - ${produtosSel.map(s => (resolverTemplate(s.nome_produto)?.modulo || s.nome_produto).toUpperCase()).join(' + ')}`;
            setForm(f => ({ ...f, titulo: t }));
        }
        setPasso(3);
        Swal.fire({ icon: 'success', title: 'Modelo carregado', text: 'Ajuste etapas e ações como quiser.', timer: 1500, showConfirmButton: false });
    };

    const validarPasso = (p) => {
        if (p === 0 && !form.id_projeto) return 'Selecione o projeto.';
        if (p === 3) {
            if (etapas.some(e => !e.nome.trim())) return 'Há etapa sem nome.';
            const inv = [...etapas.flatMap(e => e.acoes), ...acoesUnidade].find(a => a.data_inicio && a.data_fim && a.data_fim < a.data_inicio);
            if (inv) return `A ação "${inv.acao.slice(0, 40)}" tem fim anterior ao início.`;
            if (etapas.flatMap(e => e.acoes).some(a => !a.acao.trim()) || acoesUnidade.some(a => !a.acao.trim())) return 'Há ação sem descrição.';
        }
        if (p === 4) {
            if (!form.titulo.trim()) return 'Informe o título do plano.';
            if (form.data_inicio_prevista && form.data_fim_prevista && form.data_fim_prevista < form.data_inicio_prevista) return 'O término previsto não pode ser anterior ao início.';
        }
        return null;
    };
    const avancar = () => { const e = validarPasso(passo); if (e) return Swal.fire('Atenção', e, 'warning'); setPasso(p => Math.min(4, p + 1)); };
    const irPara = (p) => { for (let i = 0; i < p; i++) { const e = validarPasso(i); if (e) return Swal.fire('Atenção', e, 'warning'); } setPasso(p); };

    const gerar = async () => {
        for (let i = 0; i <= 4; i++) { const e = validarPasso(i); if (e) { setPasso(i); return Swal.fire('Atenção', e, 'warning'); } }
        const totalAcoes = etapas.reduce((s, e) => s + e.acoes.length, 0) + acoesUnidade.length;
        if (!totalAcoes) {
            const r = await Swal.fire({ title: 'Plano sem ações', text: 'Deseja criar o plano vazio e cadastrar as ações depois, na grade?', icon: 'question', showCancelButton: true, confirmButtonText: 'Criar vazio', cancelButtonText: 'Voltar', confirmButtonColor: '#2E7D32' });
            if (!r.isConfirmed) return;
        }
        const limpa = (a) => ({ acao: a.acao.trim(), responsavel: a.responsavel || null, prioridade: a.prioridade, data_inicio: a.data_inicio || null, data_fim: a.data_fim || null });
        setGerando(true);
        try {
            const res = await api.post('/plano-acao/salvar', {
                titulo: form.titulo.trim(), id_projeto: form.id_projeto,
                id_produto: form.ids_produtos[0] || null, ids_produtos: form.ids_produtos,
                unidades_ids: form.ids_unidades, sub_tipo: form.sub_tipo || null,
                cliente: form.cliente, descricao: form.descricao,
                data_inicio_prevista: form.data_inicio_prevista || null, data_fim_prevista: form.data_fim_prevista || null,
                publico: form.publico,
                etapas_padrao: etapas.flatMap(e => e.acoes.map(a => ({ ...limpa(a), grupo: e.nome.trim(), modulo: e.modulo || null }))),
                etapas_unidade: acoesUnidade.map(a => ({ ...limpa(a), modulo: a.modulo || (modulos.length === 1 ? modulos[0] : null) }))
            });
            Swal.fire({ icon: 'success', title: 'Plano criado!', timer: 1300, showConfirmButton: false });
            aoCriar(res.data.id_plano);
        } catch (e) { Swal.fire({ icon: 'error', title: 'Falha ao criar o plano', html: msgErro(e) }); }
        finally { setGerando(false); }
    };

    return (
        <div className="pa-page">
            <div className="pa-header">
                <div className="pa-title"><span className="pa-icon"><Icon n="target" /></span><h2>Novo Plano de Ação</h2></div>
                <button className="pa-btn pa-btn--ghost" onClick={aoCancelar}>Cancelar</button>
            </div>

            <ol className="np-passos">
                {PASSOS.map((p, i) => (
                    <li key={p} className={`${i === passo ? 'on' : ''} ${i < passo ? 'feito' : ''}`} onClick={() => irPara(i)}>
                        <span>{i < passo ? <Icon n="check" /> : i + 1}</span>{p}
                    </li>
                ))}
            </ol>

            <div className="pa-card pa-card--pad np-corpo">
                {passo === 0 && (
                    <>
                        <h3 className="np-tit">Em qual projeto este plano será executado?</h3>
                        <div className="np-cards">
                            {projetos.map(p => (
                                <button key={p.id_projeto} type="button" className={`np-card ${String(form.id_projeto) === String(p.id_projeto) ? 'on' : ''}`} onClick={() => trocarProjeto(String(p.id_projeto))}>
                                    <Icon n="folder" /> {p.nome_projeto}
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {passo === 1 && (
                    <>
                        <h3 className="np-tit">Unidades envolvidas <small>(opcional - {form.ids_unidades.length} selecionada(s))</small></h3>
                        <div className="np-barra">
                            <input placeholder="Buscar unidade…" value={buscaUni} onChange={e => setBuscaUni(e.target.value)} />
                            <button className="pa-btn pa-btn--ghost" onClick={() => setForm(f => ({ ...f, ids_unidades: [...new Set([...f.ids_unidades, ...unidadesFiltradas.map(u => u.id_unidade)])] }))}>Marcar visíveis</button>
                            <button className="pa-btn pa-btn--ghost" onClick={() => setForm(f => ({ ...f, ids_unidades: [] }))}>Limpar</button>
                        </div>
                        <div className="pa-chip-grid" style={{ maxHeight: 340, overflowY: 'auto' }}>
                            {unidadesFiltradas.map(u => {
                                const on = form.ids_unidades.includes(u.id_unidade);
                                return (
                                    <div key={u.id_unidade} className={`pa-chip ${on ? 'pa-chip--on' : ''}`} onClick={() => toggle('ids_unidades', u.id_unidade)}>
                                        <input type="checkbox" checked={on} readOnly /> {u.nome_unidade}
                                    </div>
                                );
                            })}
                            {!unidadesFiltradas.length && <p className="pa-empty">Nenhuma unidade encontrada.</p>}
                        </div>
                    </>
                )}

                {passo === 2 && (
                    <>
                        <h3 className="np-tit">Partir de um modelo? <small>(opcional)</small></h3>
                        <div className="np-cards">
                            <button type="button" className={`np-card np-card--grande ${!form.ids_produtos.length ? 'on' : ''}`} onClick={() => { setForm(f => ({ ...f, ids_produtos: [], sub_tipo: '' })); setPasso(3); }}>
                                <Icon n="edit" /><b>Montar do zero</b><small>Crio as etapas e ações agora</small>
                            </button>
                        </div>
                        {produtosVisiveis.length > 0 && <>
                            <h4 className="np-sec">Produtos / módulos disponíveis</h4>
                            <div className="pa-chip-grid">
                                {produtosVisiveis.map(p => {
                                    const on = form.ids_produtos.includes(p.id_produto);
                                    const tpl = resolverTemplate(p.nome_produto);
                                    return (
                                        <div key={p.id_produto} className={`pa-chip ${on ? 'pa-chip--on' : ''}`} onClick={() => toggle('ids_produtos', p.id_produto)}>
                                            <input type="checkbox" checked={on} readOnly />
                                            <span>{p.nome_produto}{tpl?.modulo ? ` · ${tpl.modulo}` : ''}{!tpl && <small className="np-semmodelo"> (sem modelo)</small>}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            {precisaSubTipo && (
                                <div className="np-subtipo">
                                    <b>Tipo de Atenção:</b>
                                    {['Atenção Primária', 'Atenção Secundária'].map(st => (
                                        <label key={st}><input type="radio" name="subtipo" checked={form.sub_tipo === st} onChange={() => setForm(f => ({ ...f, sub_tipo: st }))} /> {st}</label>
                                    ))}
                                </div>
                            )}
                            {form.ids_produtos.length > 0 && (
                                <div style={{ marginTop: 16 }}>
                                    <button className="pa-btn pa-btn--green" onClick={carregarModelo}><Icon n="clipboard" /> Carregar modelo nas etapas</button>
                                </div>
                            )}
                        </>}
                    </>
                )}

                {passo === 3 && (
                    <>
                        <h3 className="np-tit">Etapas e ações</h3>
                        <MontadorPlano etapas={etapas} setEtapas={setEtapas} acoesUnidade={acoesUnidade} setAcoesUnidade={setAcoesUnidade}
                            qtdUnidades={form.ids_unidades.length} modulos={modulos} />
                    </>
                )}

                {passo === 4 && (
                    <>
                        <h3 className="np-tit">Dados do plano</h3>
                        <div className="pa-form-grid">
                            <div className="pa-field pa-field--span2">
                                <label>Título do plano *</label>
                                <input value={form.titulo} maxLength={300} placeholder="Ex.: IMPLANTAÇÃO DO PRONTUÁRIO - REDE MUNICIPAL" onChange={e => setForm({ ...form, titulo: e.target.value })} />
                            </div>
                            <div className="pa-field pa-field--span2">
                                <label>Cliente</label>
                                <input value={form.cliente} maxLength={200} placeholder={projetoSel ? projetoSel.nome_projeto : 'Nome do cliente'} onChange={e => setForm({ ...form, cliente: e.target.value })} />
                            </div>
                            <div className="pa-field">
                                <label>Início previsto</label>
                                <input type="date" min="1900-01-01" max="2100-12-31" value={form.data_inicio_prevista} onChange={e => setForm({ ...form, data_inicio_prevista: e.target.value })} />
                            </div>
                            <div className="pa-field">
                                <label>Término previsto</label>
                                <input type="date" max="2100-12-31" value={form.data_fim_prevista} min={form.data_inicio_prevista || undefined} onChange={e => setForm({ ...form, data_fim_prevista: e.target.value })} />
                            </div>
                            <div className="pa-field pa-field--span2">
                                <label>Objetivo / escopo</label>
                                <textarea rows={3} maxLength={1000} value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} />
                            </div>
                            <label className="pa-check"><input type="checkbox" checked={form.publico} onChange={e => setForm({ ...form, publico: e.target.checked })} /> Publicar o painel deste plano (link público somente leitura)</label>
                        </div>
                        <div className="np-revisao">
                            <span><Icon n="folder" /> {projetoSel?.nome_projeto || '-'}</span>
                            <span><Icon n="building" /> {form.ids_unidades.length} unidade(s)</span>
                            <span><Icon n="grid" /> {etapas.length} etapa(s)</span>
                            <span><Icon n="check" /> {etapas.reduce((s, e) => s + e.acoes.length, 0) + acoesUnidade.length * form.ids_unidades.length} ação(ões) no total</span>
                        </div>
                    </>
                )}

                <div className="np-nav">
                    <button className="pa-btn pa-btn--ghost" disabled={passo === 0} onClick={() => setPasso(p => Math.max(0, p - 1))}><Icon n="arrow-left" /> Voltar</button>
                    {passo < 4
                        ? <button className="pa-btn pa-btn--green" onClick={avancar}>Continuar <Icon n="arrow-right" /></button>
                        : <button className="pa-btn pa-btn--green" onClick={gerar} disabled={gerando}><Icon n="target" /> {gerando ? 'Criando…' : 'Criar plano de ação'}</button>}
                </div>
            </div>
        </div>
    );
}
