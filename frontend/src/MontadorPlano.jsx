/* ARQUIVO: src/MontadorPlano.js
 * Montador de etapas e ações para criar o Plano de Ação do zero
 * (ou ajustar um modelo carregado). Tudo é editado aqui antes de gerar.
 * ------------------------------------------------------------------------ */
import React, { useState, useRef } from 'react';
import Icon from './components/Icon';
import { OPCOES_RESPONSAVEL, OPCOES_PRIORIDADE } from './config/planoTemplates';

let _seq = 0;
export const novaChave = () => `k${Date.now().toString(36)}${(_seq++).toString(36)}`;
export const novaAcao = (acao = '', extra = {}) => ({ key: novaChave(), acao, responsavel: '', data_inicio: '', data_fim: '', prioridade: 'Alta', ...extra });
export const novaEtapa = (nome = '', acoes = [], modulo = null) => ({ key: novaChave(), nome, modulo, acoes });

const mover = (lista, i, d) => {
    const j = i + d;
    if (j < 0 || j >= lista.length) return lista;
    const n = [...lista]; [n[i], n[j]] = [n[j], n[i]]; return n;
};

/* Linha de ação editável */
function LinhaAcao({ a, idx, onChange, onRemover, onMover, total }) {
    const set = (k) => (e) => onChange({ ...a, [k]: e.target.value });
    const invertida = a.data_inicio && a.data_fim && a.data_fim < a.data_inicio;
    return (
        <div className={`mp-acao ${invertida ? 'mp-acao--erro' : ''}`}>
            <div className="mp-acao-ord">
                <button type="button" disabled={idx === 0} onClick={() => onMover(-1)} title="Subir"><Icon n="arrow-up" /></button>
                <span>{idx + 1}</span>
                <button type="button" disabled={idx === total - 1} onClick={() => onMover(1)} title="Descer"><Icon n="arrow-down" /></button>
            </div>
            <input className="mp-acao-desc" value={a.acao} maxLength={1000} placeholder="Descreva a ação…" onChange={set('acao')} />
            <select className="mp-mini" value={a.responsavel} onChange={set('responsavel')} title="Responsável">
                <option value="">Responsável</option>
                {OPCOES_RESPONSAVEL.map(o => <option key={o}>{o}</option>)}
            </select>
            <label className="mp-data" title="Início previsto"><span>Início</span><input type="date" min="1900-01-01" max="2100-12-31" value={a.data_inicio} onChange={set('data_inicio')} /></label>
            <label className="mp-data" title="Fim previsto"><span>Fim</span><input type="date" max="2100-12-31" value={a.data_fim} min={a.data_inicio || undefined} onChange={set('data_fim')} /></label>
            <select className={`mp-mini mp-prio mp-prio--${(a.prioridade || 'Alta').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}`} value={a.prioridade} onChange={set('prioridade')} title="Prioridade">
                {OPCOES_PRIORIDADE.map(p => <option key={p}>{p}</option>)}
            </select>
            <button type="button" className="mp-x" onClick={onRemover} title="Remover ação"><Icon n="x" /></button>
        </div>
    );
}

/* Campo de inclusão rápida (Enter adiciona) */
function InclusaoRapida({ placeholder, onAdicionar, rotulo = 'Adicionar' }) {
    const [v, setV] = useState('');
    const ref = useRef(null);
    const ok = () => { const t = v.trim(); if (!t) return; onAdicionar(t); setV(''); ref.current && ref.current.focus(); };
    return (
        <div className="mp-rapida">
            <Icon n="plus" />
            <input ref={ref} value={v} placeholder={placeholder} maxLength={1000}
                onChange={e => setV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } }} />
            <button type="button" onClick={ok} disabled={!v.trim()}>{rotulo}</button>
        </div>
    );
}

export function ListaAcoes({ acoes, onChange }) {
    const upd = (i, a) => onChange(acoes.map((x, j) => (j === i ? a : x)));
    return (
        <>
            {acoes.map((a, i) => (
                <LinhaAcao key={a.key} a={a} idx={i} total={acoes.length}
                    onChange={(n) => upd(i, n)}
                    onRemover={() => onChange(acoes.filter((_, j) => j !== i))}
                    onMover={(d) => onChange(mover(acoes, i, d))} />
            ))}
            {!acoes.length && <div className="mp-vazio">Nenhuma ação ainda - digite abaixo e pressione Enter.</div>}
        </>
    );
}

export default function MontadorPlano({ etapas, setEtapas, acoesUnidade, setAcoesUnidade, qtdUnidades, modulos = [] }) {
    const [novoNome, setNovoNome] = useState('');
    const updEtapa = (i, e) => setEtapas(etapas.map((x, j) => (j === i ? e : x)));
    const totalAcoes = etapas.reduce((s, e) => s + e.acoes.length, 0);

    const criarEtapa = () => {
        const n = novoNome.trim();
        if (!n) return;
        setEtapas([...etapas, novaEtapa(n.toUpperCase(), [], modulos.length === 1 ? modulos[0] : null)]);
        setNovoNome('');
    };

    return (
        <div className="mp">
            <div className="mp-resumo">
                <span><b>{etapas.length}</b> etapa(s)</span>
                <span><b>{totalAcoes}</b> ação(ões) gerais</span>
                {qtdUnidades > 0 && <span><b>{acoesUnidade.length}</b> ação(ões) × <b>{qtdUnidades}</b> unidade(s) = <b>{acoesUnidade.length * qtdUnidades}</b></span>}
            </div>

            {etapas.map((et, i) => {
                const invalida = !et.nome.trim();
                return (
                    <section key={et.key} className="mp-etapa">
                        <header className="mp-etapa-head">
                            <span className="mp-num">{String(i + 1).padStart(2, '0')}</span>
                            <input className={`mp-etapa-nome ${invalida ? 'mp-erro' : ''}`} value={et.nome} maxLength={120} placeholder="NOME DA ETAPA"
                                onChange={e => updEtapa(i, { ...et, nome: e.target.value.toUpperCase() })} />
                            {modulos.length > 0 && (
                                <select className="mp-mini" value={et.modulo || ''} onChange={e => updEtapa(i, { ...et, modulo: e.target.value || null })} title="Módulo">
                                    <option value="">Sem módulo</option>
                                    {modulos.map(m => <option key={m}>{m}</option>)}
                                </select>
                            )}
                            <span className="mp-cont">{et.acoes.length} ação(ões)</span>
                            <div className="mp-etapa-btns">
                                <button type="button" disabled={i === 0} onClick={() => setEtapas(mover(etapas, i, -1))} title="Subir etapa"><Icon n="arrow-up" /></button>
                                <button type="button" disabled={i === etapas.length - 1} onClick={() => setEtapas(mover(etapas, i, 1))} title="Descer etapa"><Icon n="arrow-down" /></button>
                                <button type="button" className="danger" onClick={() => setEtapas(etapas.filter((_, j) => j !== i))} title="Excluir etapa"><Icon n="trash" /></button>
                            </div>
                        </header>
                        <div className="mp-etapa-corpo">
                            <ListaAcoes acoes={et.acoes} onChange={(acoes) => updEtapa(i, { ...et, acoes })} />
                            <InclusaoRapida placeholder={`Nova ação em ${et.nome || 'esta etapa'}… (Enter)`} onAdicionar={(t) => updEtapa(i, { ...et, acoes: [...et.acoes, novaAcao(t)] })} />
                        </div>
                    </section>
                );
            })}

            <div className="mp-nova-etapa">
                <span className="mp-num mp-num--novo"><Icon n="plus" /></span>
                <input value={novoNome} maxLength={120} placeholder="Nova etapa"
                    onChange={e => setNovoNome(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarEtapa(); } }} />
                <button type="button" className="pa-btn pa-btn--green" onClick={criarEtapa} disabled={!novoNome.trim()}>Criar etapa</button>
            </div>

            {qtdUnidades > 0 && (
                <section className="mp-etapa mp-etapa--unidade">
                    <header className="mp-etapa-head">
                        <span className="mp-num mp-num--uni"><Icon n="building" /></span>
                        <div className="mp-etapa-tit">
                            <b>EXECUÇÃO EM CADA UNIDADE</b>
                            <small>Estas ações serão replicadas para as {qtdUnidades} unidade(s) selecionada(s).</small>
                        </div>
                        <span className="mp-cont">{acoesUnidade.length} ação(ões)</span>
                    </header>
                    <div className="mp-etapa-corpo">
                        <ListaAcoes acoes={acoesUnidade} onChange={setAcoesUnidade} />
                        <InclusaoRapida placeholder="Nova ação por unidade" onAdicionar={(t) => setAcoesUnidade([...acoesUnidade, novaAcao(t)])} />
                    </div>
                </section>
            )}
        </div>
    );
}

export { InclusaoRapida };
