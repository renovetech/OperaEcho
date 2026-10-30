/* ARQUIVO: src/RelatorioPlanoAcao.js
 * Relatório 6 - Plano de Ação: Status, Etapas e Execução.
 * Segue o molde dos demais relatórios (Relatorios.css / motor de PDF vetorial
 * recebido por props), com exportação PDF, JPG e Excel.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import { periodoBloqueado } from './periodo';
import * as XLSX from 'xlsx';
import logo from './logo.png';
import { OPCOES_RESPONSAVEL } from './config/planoTemplates';
import { STATUS_ITEM, STATUS_PLANO, COR_SAUDE, COR_STATUS_ITEM, fmtMin, dataBR, minParaHHMM } from './planoAcaoUtils';

const SITUACOES_PRAZO = ['NO PRAZO', 'FORA DO PRAZO', 'VENCIDO', 'VENCE EM 7 DIAS', 'A VENCER', 'SEM PRAZO'];
const COR_PRAZO = {
    'NO PRAZO': '#2E7D32', 'FORA DO PRAZO': '#8F332F', 'VENCIDO': '#A23B36',
    'VENCE EM 7 DIAS': '#8A5212', 'A VENCER': '#5A625B', 'SEM PRAZO': '#8A8F88'
};
const rgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

export default function RelatorioPlanoAcao({ aoVoltar, criarRelatorioPDF, exportarDoc, usuarioLogado }) {
    const [filtros, setFiltros] = useState({
        dataInicio: '', dataFim: '', id_projeto: 'Todos', id_plano: '', status_plano: 'Todos',
        status: 'Todos', responsavel: 'Todos', situacao_prazo: 'Todos', cliente: ''
    });
    const [opcoes, setOpcoes] = useState({ detalhe: true, observacoes: false });
    const [projetos, setProjetos] = useState([]);
    const [planos, setPlanos] = useState([]);
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const exportRef = useRef(null);

    useEffect(() => {
        api.get('/projetos').then(r => setProjetos(r.data || [])).catch(() => setProjetos([]));
    }, []);
    useEffect(() => {
        const p = new URLSearchParams();
        if (filtros.id_projeto && filtros.id_projeto !== 'Todos') p.append('projeto', filtros.id_projeto);
        api.get(`/plano-acao/buscar?${p.toString()}`).then(r => setPlanos(r.data || [])).catch(() => setPlanos([]));
    }, [filtros.id_projeto]);

    const gerar = async () => {
        if ((filtros.dataInicio && !filtros.dataFim) || (!filtros.dataInicio && filtros.dataFim))
            return Swal.fire('Atenção', 'Informe o período completo (início e fim) ou deixe ambos em branco.', 'warning');
        if (filtros.dataInicio && filtros.dataFim && filtros.dataFim < filtros.dataInicio)
            return Swal.fire('Atenção', 'A data final não pode ser anterior à inicial.', 'warning');
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const params = {};
            Object.entries(filtros).forEach(([k, v]) => { if (v && v !== 'Todos') params[k] = v; });
            const r = await api.get('/relatorios/plano-acao', { params });
            setDados(r.data);
            if (!(r.data.itens || []).length) Swal.fire('Informação', 'Nenhuma ação encontrada com os filtros aplicados.', 'info');
        } catch (e) {
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível gerar o relatório.', 'error');
        } finally { setCarregando(false); }
    };

    const itensPorPlano = useMemo(() => {
        const m = new Map();
        (dados?.itens || []).forEach(i => { if (!m.has(i.plano)) m.set(i.plano, []); m.get(i.plano).push(i); });
        return [...m.entries()];
    }, [dados]);

    const periodoTxt = filtros.dataInicio && filtros.dataFim
        ? `Planos criados entre ${dataBR(filtros.dataInicio)} e ${dataBR(filtros.dataFim)}`
        : 'Todos os períodos';

    const semDados = !dados || !(dados.itens || []).length;

    /* ------------------------------- PDF -------------------------------- */
    const gerarPdf = async () => {
        if (semDados) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const r = dados.resumo;
            const pdf = await criarRelatorioPDF('Plano de Ação - Status e Execução', periodoTxt);
            const ajustar = (cols) => { const f = pdf.CW / cols.reduce((s, c) => s + c.w, 0); cols.forEach(c => { c.w *= f; }); return cols; };

            pdf.bloco('Indicadores gerais', pdf.colors.green);
            pdf.tabela(ajustar([{ h: 'Indicador', w: 110, a: 'l' }, { h: 'Valor', w: 60, a: 'c' }, { h: 'Indicador', w: 110, a: 'l' }, { h: 'Valor', w: 60, a: 'c' }]), [
                ['Planos no recorte', String(r.planos), 'Ações', `${r.fechados}/${r.total} fechadas`],
                ['Execução realizada', `${r.progresso}%`, 'Execução esperada até hoje', `${r.esperado}% (${r.desvio > 0 ? '+' : ''}${r.desvio} p.p.)`],
                ['Ações atrasadas', { t: String(r.atrasados), color: r.atrasados ? [162, 59, 54] : undefined, bold: true }, 'Vencem em 7 dias', String(r.vencendo_7d)],
                ['Aderência ao prazo', r.aderencia == null ? '-' : `${r.aderencia}%`, 'Horas trabalhadas / previstas', `${fmtMin(r.trabalhado_min)} / ${fmtMin(r.previsto_min)}`],
                ['A iniciar', String(r.a_iniciar), 'Em andamento', String(r.andamento)]
            ]);

            pdf.bloco('Resumo por plano', pdf.colors.green);
            pdf.tabela(ajustar([
                { h: 'Plano', w: 90, a: 'l' }, { h: 'Cliente', w: 50, a: 'l' }, { h: 'Saúde', w: 26, a: 'c' }, { h: 'Exec.', w: 18, a: 'c' },
                { h: 'Esper.', w: 18, a: 'c' }, { h: 'Ações', w: 20, a: 'c' }, { h: 'Atras.', w: 18, a: 'c' }, { h: 'Próx. prazo', w: 24, a: 'c' }, { h: 'Término', w: 24, a: 'c' }
            ]), dados.planos.map(p => [p.titulo, p.cliente || '-', { t: p.saude, bold: true, color: rgb((COR_SAUDE[p.saude] || {}).fg || '#333333') },
                `${p.progresso}%`, `${p.esperado}%`, `${p.fechados}/${p.total}`, String(p.atrasados), dataBR(p.proximo_prazo), dataBR(p.data_fim_prevista)]));

            const tabelaGrupo = (titulo, lista) => {
                if (!lista || !lista.length) return;
                pdf.bloco(titulo, pdf.colors.blue);
                pdf.tabela(ajustar([{ h: 'Nome', w: 110, a: 'l' }, { h: 'Ações', w: 22, a: 'c' }, { h: 'Fechadas', w: 22, a: 'c' }, { h: 'Andamento', w: 22, a: 'c' }, { h: 'Atrasadas', w: 22, a: 'c' }, { h: '% Exec.', w: 22, a: 'c' }]),
                    lista.map(x => [x.nome, String(x.total), String(x.fechados), String(x.andamento || 0), String(x.atrasados), `${x.progresso}%`]));
            };
            if ((dados.por_cliente || []).length > 1) tabelaGrupo('Por cliente', dados.por_cliente);
            tabelaGrupo('Por etapa', dados.por_etapa);
            tabelaGrupo('Por responsável', dados.por_responsavel);
            tabelaGrupo('Por unidade', dados.por_unidade);
            if ((dados.por_modulo || []).length > 1) tabelaGrupo('Por módulo', dados.por_modulo);

            if ((dados.por_pessoa || []).length) {
                pdf.bloco('Equipe - alocação e horas trabalhadas', pdf.colors.blue);
                pdf.tabela(ajustar([{ h: 'Pessoa', w: 100, a: 'l' }, { h: 'Ações', w: 22, a: 'c' }, { h: 'Abertas', w: 22, a: 'c' }, { h: 'Atrasadas', w: 22, a: 'c' }, { h: 'Apont.', w: 22, a: 'c' }, { h: 'Horas', w: 30, a: 'c' }]),
                    dados.por_pessoa.map(p => [p.nome, String(p.itens), String(p.abertos), String(p.atrasados), String(p.apontamentos), fmtMin(p.trabalhado_min)]));
            }

            if (dados.atrasados.length) {
                pdf.bloco(`Ações atrasadas (${dados.atrasados.length})`, [162, 59, 54]);
                pdf.tabela(ajustar([{ h: 'Plano', w: 60, a: 'l' }, { h: 'Ação', w: 110, a: 'l' }, { h: 'Unidade', w: 50, a: 'l' }, { h: 'Responsável', w: 40, a: 'l' }, { h: 'Prazo', w: 24, a: 'c' }, { h: 'Dias', w: 16, a: 'c' }]),
                    dados.atrasados.map(i => [i.plano, i.descricao, i.unidade || i.grupo || '-', i.responsavel || '-', dataBR(i.data_fim), { t: String(i.dias_atraso ?? '-'), bold: true, color: [162, 59, 54] }]));
            }
            if (dados.proximos_prazos.length) {
                pdf.bloco(`Próximos prazos - 15 dias (${dados.proximos_prazos.length})`, pdf.colors.blue);
                pdf.tabela(ajustar([{ h: 'Plano', w: 60, a: 'l' }, { h: 'Ação', w: 110, a: 'l' }, { h: 'Unidade', w: 50, a: 'l' }, { h: 'Responsável', w: 40, a: 'l' }, { h: 'Prazo', w: 24, a: 'c' }, { h: 'Faltam', w: 16, a: 'c' }]),
                    dados.proximos_prazos.map(i => [i.plano, i.descricao, i.unidade || i.grupo || '-', i.responsavel || '-', dataBR(i.data_fim), `${i.dias_restantes}d`]));
            }

            if (opcoes.detalhe) {
                itensPorPlano.forEach(([plano, lista]) => {
                    pdf.bloco(`Detalhamento - ${plano} (${lista.length} ações)`, pdf.colors.green);
                    const cols = [{ h: 'Ação', w: 84, a: 'l' }, { h: 'Cliente', w: 36, a: 'l' }, { h: 'Etapa/Unidade', w: 38, a: 'l' }, { h: 'Resp.', w: 30, a: 'l' }, { h: 'Equipe', w: 36, a: 'l' },
                        { h: 'Prev. ini/fim', w: 30, a: 'c' }, { h: 'Real ini/fim', w: 30, a: 'c' }, { h: '%', w: 11, a: 'c' }, { h: 'Situação', w: 22, a: 'c' }, { h: 'Prazo', w: 24, a: 'c' }, { h: 'Horas', w: 16, a: 'c' }];
                    if (opcoes.observacoes) cols.push({ h: 'Observação', w: 50, a: 'l' });
                    pdf.tabela(ajustar(cols), lista.map(i => {
                        const row = [i.descricao, i.cliente || '-', [i.modulo, i.unidade || i.grupo].filter(Boolean).join(' · ') || '-', i.responsavel || '-', i.equipe || '-',
                            `${dataBR(i.data_inicio)}\n${dataBR(i.data_fim)}`, `${dataBR(i.data_inicio_real)}\n${dataBR(i.data_fim_real)}`, `${i.percentual}%`,
                            { t: i.status, bold: true, color: rgb(COR_STATUS_ITEM[i.status] || '#333333') },
                            { t: i.situacao_prazo, color: rgb(COR_PRAZO[i.situacao_prazo] || '#333333') }, minParaHHMM(i.horas_trabalhadas) || '-'];
                        if (opcoes.observacoes) row.push(i.observacao || '');
                        return row;
                    }));
                });
            }

            pdf.texto('Metodologia: Execução = média do % de execução das ações (fechada = 100%). Esperado = % de ações cujo prazo previsto já venceu. '
                + 'Aderência = ações fechadas dentro do prazo previsto ÷ ações fechadas com prazo. Saúde: CRÍTICO (>20% atrasado, término do plano vencido ou desvio ≤ −25 p.p.), '
                + 'ATENÇÃO (atrasos, desvio ≤ −10 p.p. ou entregas em 7 dias), NO PRAZO (demais).', { italic: true });
            pdf.finalizar('Relatorio_Plano_Acao');
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    /* ------------------------------ EXCEL ------------------------------- */
    const gerarExcel = () => {
        if (semDados) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');
        const wb = XLSX.utils.book_new();
        const r = dados.resumo;
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
            ['Plano de Ação - Status e Execução'], [periodoTxt], [`Gerado em ${new Date().toLocaleString('pt-BR')} por ${usuarioLogado.nome_completo || ''}`], [],
            ['Indicador', 'Valor'],
            ['Planos', r.planos], ['Ações', r.total], ['Fechadas', r.fechados], ['Em andamento', r.andamento], ['A iniciar', r.a_iniciar],
            ['Atrasadas', r.atrasados], ['Vencem em 7 dias', r.vencendo_7d], ['Execução realizada (%)', r.progresso], ['Execução esperada (%)', r.esperado],
            ['Desvio (p.p.)', r.desvio], ['Aderência ao prazo (%)', r.aderencia ?? ''], ['Horas trabalhadas', minParaHHMM(r.trabalhado_min)], ['Tempo previsto', minParaHHMM(r.previsto_min)]
        ]), 'Resumo');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados.planos.map(p => ({
            Plano: p.titulo, Cliente: p.cliente || '', Projeto: p.nome_projeto || '', Situação: p.status, Saúde: p.saude,
            'Execução %': p.progresso, 'Esperado %': p.esperado, 'Desvio p.p.': p.desvio, Ações: p.total, Fechadas: p.fechados,
            'Em andamento': p.andamento, Atrasadas: p.atrasados, 'Próximo prazo': dataBR(p.proximo_prazo), 'Término previsto': dataBR(p.data_fim_prevista),
            'Horas trabalhadas': minParaHHMM(p.trabalhado_min)
        }))), 'Planos');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados.itens.map(i => ({
            Plano: i.plano, Cliente: i.cliente || '', Projeto: i.nome_projeto || '', Módulo: i.modulo || '', Etapa: i.grupo || '', Unidade: i.unidade || '',
            Ação: i.descricao, Responsável: i.responsavel || '', Equipe: i.equipe || '', Prioridade: i.prioridade, Situação: i.status, '% Execução': i.percentual,
            'Início previsto': dataBR(i.data_inicio), 'Fim previsto': dataBR(i.data_fim), 'Início realizado': dataBR(i.data_inicio_real), 'Fim realizado': dataBR(i.data_fim_real),
            'Situação do prazo': i.situacao_prazo, 'Dias de atraso': i.dias_atraso || 0, 'Tempo previsto': minParaHHMM(i.tempo_previsto),
            'Tempo gasto': minParaHHMM(i.tempo_gasto), 'Horas trabalhadas': minParaHHMM(i.horas_trabalhadas), Observação: i.observacao || ''
        }))), 'Ações');
        const grp = (lista) => (lista || []).map(x => ({ Nome: x.nome, Ações: x.total, Fechadas: x.fechados, 'Em andamento': x.andamento || 0, Atrasadas: x.atrasados, 'Execução %': x.progresso }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grp(dados.por_cliente)), 'Por cliente');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grp(dados.por_etapa)), 'Por etapa');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grp(dados.por_responsavel)), 'Por responsável');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(grp(dados.por_unidade)), 'Por unidade');
        if ((dados.por_pessoa || []).length) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados.por_pessoa.map(p => ({
                Pessoa: p.nome, 'Ações alocadas': p.itens, Abertas: p.abertos, Atrasadas: p.atrasados, Apontamentos: p.apontamentos, 'Horas trabalhadas': minParaHHMM(p.trabalhado_min)
            }))), 'Equipe');
        }
        XLSX.writeFile(wb, `Relatorio_Plano_Acao_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const r = dados?.resumo;
    const f = (k) => (e) => setFiltros(prev => ({ ...prev, [k]: e.target.value, ...(k === 'id_projeto' ? { id_plano: '' } : {}) }));

    return (
        <div className="relatorios-page">
            <div className="filtros-container no-print">
                <div className="relatorio-header-acoes">
                    <h2>Plano de Ação - Status e Execução</h2>
                    <button className="btn-voltar" onClick={aoVoltar}><Icon n="arrow-left" /> Voltar</button>
                </div>

                <div className="filtros-grid-rel">
                    <div className="filtro-item"><label>Criados de</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataInicio} onChange={f('dataInicio')} /></div>
                    <div className="filtro-item"><label>Até</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataFim} onChange={f('dataFim')} /></div>
                    <div className="filtro-item">
                        <label>Projeto</label>
                        <select value={filtros.id_projeto} onChange={f('id_projeto')}>
                            <option value="Todos">Todos os Projetos</option>
                            {projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Plano</label>
                        <select value={filtros.id_plano} onChange={f('id_plano')}>
                            <option value="">Todos os planos</option>
                            {planos.map(p => <option key={p.id_plano} value={p.id_plano}>{p.titulo}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Situação do plano</label>
                        <select value={filtros.status_plano} onChange={f('status_plano')}>
                            <option value="Todos">Todas</option>{STATUS_PLANO.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Situação da ação</label>
                        <select value={filtros.status} onChange={f('status')}>
                            <option value="Todos">Todas</option>{STATUS_ITEM.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Responsável</label>
                        <select value={filtros.responsavel} onChange={f('responsavel')}>
                            <option value="Todos">Todos</option>{OPCOES_RESPONSAVEL.map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Situação do prazo</label>
                        <select value={filtros.situacao_prazo} onChange={f('situacao_prazo')}>
                            <option value="Todos">Todas</option>{SITUACOES_PRAZO.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="filtro-item"><label>Cliente</label><input value={filtros.cliente} placeholder="Contém…" onChange={f('cliente')} /></div>
                </div>

                <div className="rp-opcoes">
                    <label><input type="checkbox" checked={opcoes.detalhe} onChange={e => setOpcoes(o => ({ ...o, detalhe: e.target.checked }))} /> Detalhamento por ação</label>
                    <label><input type="checkbox" checked={opcoes.observacoes} onChange={e => setOpcoes(o => ({ ...o, observacoes: e.target.checked }))} /> Incluir observações</label>
                </div>

                <div className="botoes-rel-row">
                    <button className="btn-gerar" data-busca="1" onClick={gerar} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                    <button className="btn-imprimir" onClick={gerarPdf}><Icon n="printer" /> Exportar PDF</button>
                    <button className="btn-jpg" onClick={() => (semDados ? Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning') : exportarDoc('jpg', exportRef, 'Relatorio_Plano_Acao', 'l'))}><Icon n="camera" /> Exportar JPG</button>
                    <button className="btn-gerar" style={{ background: '#3E7C5A' }} onClick={gerarExcel}><Icon n="grid" /> Exportar Excel</button>
                </div>
            </div>

            <div id="print-area" className="documento-elegante" ref={exportRef}>
                <header className="header-doc">
                    <img src={logo} alt="Logo" className="logo-doc" style={{ height: '120px', width: 'auto' }} />
                    <div className="info-doc">
                        <h1>Plano de Ação - Status e Execução</h1>
                        <p className="periodo-doc">{periodoTxt}</p>
                        <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                        <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                    </div>
                </header>

                {semDados ? (
                    <div className="aviso-vazio">Defina os filtros e clique em “Filtrar Dados”.</div>
                ) : (
                    <main className="conteudo-doc">
                        <div className="tm-kpis rp-kpis">
                            <div className="tm-kpi"><span className="tm-kpi-num">{r.planos}</span><span className="tm-kpi-lbl">Planos</span><small>{r.planos_ativos} ativos · {r.planos_concluidos} concluídos</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{r.progresso}%</span><span className="tm-kpi-lbl">Execução realizada</span><small>esperado {r.esperado}%</small></div>
                            <div className="tm-kpi"><span className={`tm-kpi-num ${r.desvio < 0 ? 'tm-neg' : 'tm-pos'}`}>{r.desvio > 0 ? '+' : ''}{r.desvio} p.p.</span><span className="tm-kpi-lbl">Desvio de cronograma</span><small>realizado − esperado</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{r.aderencia == null ? '-' : `${r.aderencia}%`}</span><span className="tm-kpi-lbl">Aderência ao prazo</span><small>{r.fechados_no_prazo}/{r.fechados_com_prazo} no prazo</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{r.fechados}/{r.total}</span><span className="tm-kpi-lbl">Ações fechadas</span><small>{r.andamento} em andamento · {r.a_iniciar} a iniciar</small></div>
                            <div className="tm-kpi"><span className={`tm-kpi-num ${r.atrasados ? 'tm-neg' : ''}`}>{r.atrasados}</span><span className="tm-kpi-lbl">Atrasadas</span><small>{r.vencendo_7d} vencem em 7 dias</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{fmtMin(r.trabalhado_min)}</span><span className="tm-kpi-lbl">Horas trabalhadas</span><small>previsto {fmtMin(r.previsto_min)}</small></div>
                            <div className="tm-kpi"><span className="tm-kpi-num">{r.unidades}</span><span className="tm-kpi-lbl">Unidades</span><small>{r.clientes} cliente(s)</small></div>
                        </div>

                        <div className="rp-dist">
                            {dados.por_status.map(s => (
                                <div key={s.nome} className="tm-dist-card" style={{ color: COR_STATUS_ITEM[s.nome], borderColor: COR_STATUS_ITEM[s.nome], background: '#fff' }}>
                                    <b>{s.nome}</b><span>{s.total}</span><small>{r.total ? Math.round((s.total / r.total) * 100) : 0}% das ações</small>
                                </div>
                            ))}
                        </div>

                        <div className="agrupamento-projeto">
                            <h3>Resumo por plano <small>({dados.planos.length})</small></h3>
                            <table className="tabela-elegante">
                                <thead><tr>
                                    <th style={{ textAlign: 'left' }}>Plano</th><th style={{ textAlign: 'left' }}>Cliente</th><th className="center">Saúde</th>
                                    <th className="center">Execução</th><th className="center">Esperado</th><th className="center">Desvio</th><th className="center">Ações</th>
                                    <th className="center">Atrasadas</th><th className="center">Próx. prazo</th><th className="center">Término</th>
                                </tr></thead>
                                <tbody>
                                    {dados.planos.map(p => {
                                        const cs = COR_SAUDE[p.saude] || {};
                                        return (
                                            <tr key={p.id_plano}>
                                                <td><b>{p.titulo}</b><div className="rp-sub">{p.nome_projeto}</div></td>
                                                <td>{p.cliente || '-'}</td>
                                                <td className="center"><span className="tm-badge" style={{ background: cs.bg, color: cs.fg, borderColor: cs.bd }}>{p.saude}</span></td>
                                                <td className="center"><b>{p.progresso}%</b></td>
                                                <td className="center">{p.esperado}%</td>
                                                <td className="center" style={{ color: p.desvio < 0 ? '#8F332F' : '#2E7D32', fontWeight: 700 }}>{p.desvio > 0 ? '+' : ''}{p.desvio}</td>
                                                <td className="center">{p.fechados}/{p.total}</td>
                                                <td className="center">{p.atrasados}</td>
                                                <td className="center">{dataBR(p.proximo_prazo)}</td>
                                                <td className="center">{dataBR(p.data_fim_prevista)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="rp-duas">
                            <TabelaGrupo titulo="Por etapa" lista={dados.por_etapa} />
                            <TabelaGrupo titulo="Por responsável" lista={dados.por_responsavel} />
                        </div>
                        {(dados.por_cliente || []).length > 1 && <TabelaGrupo titulo="Por cliente" lista={dados.por_cliente} />}
                        <div className="rp-duas">
                            <TabelaGrupo titulo="Por unidade" lista={dados.por_unidade} />
                            {(dados.por_modulo || []).length > 1
                                ? <TabelaGrupo titulo="Por módulo" lista={dados.por_modulo} />
                                : <TabelaGrupo titulo="Por prioridade" lista={dados.por_prioridade.filter(p => p.total)} />}
                        </div>

                        {(dados.por_pessoa || []).length > 0 && (
                            <div className="agrupamento-projeto">
                                <h3>Equipe - alocação e horas trabalhadas</h3>
                                <table className="tabela-elegante">
                                    <thead><tr><th style={{ textAlign: 'left' }}>Pessoa</th><th className="center">Ações</th><th className="center">Abertas</th><th className="center">Atrasadas</th><th className="center">Apontamentos</th><th className="center">Horas</th></tr></thead>
                                    <tbody>{dados.por_pessoa.map(p => (
                                        <tr key={p.id_usuario}><td>{p.nome}</td><td className="center">{p.itens}</td><td className="center">{p.abertos}</td><td className="center">{p.atrasados}</td><td className="center">{p.apontamentos}</td><td className="center"><b>{fmtMin(p.trabalhado_min)}</b></td></tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}

                        {dados.atrasados.length > 0 && (
                            <div className="agrupamento-projeto">
                                <h3 style={{ color: '#8F332F' }}>Ações atrasadas <small>({dados.atrasados.length})</small></h3>
                                <table className="tabela-elegante">
                                    <thead><tr><th style={{ textAlign: 'left' }}>Plano</th><th style={{ textAlign: 'left' }}>Ação</th><th style={{ textAlign: 'left' }}>Unidade/Etapa</th><th style={{ textAlign: 'left' }}>Responsável</th><th className="center">Prazo</th><th className="center">Dias</th></tr></thead>
                                    <tbody>{dados.atrasados.map(i => (
                                        <tr key={i.id_item}><td style={{ fontSize: '.8rem' }}>{i.plano}</td><td style={{ fontSize: '.82rem' }}>{i.descricao}</td><td style={{ fontSize: '.8rem' }}>{i.unidade || i.grupo || '-'}</td><td style={{ fontSize: '.8rem' }}>{i.responsavel || '-'}</td><td className="center">{dataBR(i.data_fim)}</td><td className="center" style={{ color: '#8F332F', fontWeight: 700 }}>{i.dias_atraso}</td></tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}

                        {dados.proximos_prazos.length > 0 && (
                            <div className="agrupamento-projeto">
                                <h3>Próximos prazos <small>(15 dias)</small></h3>
                                <table className="tabela-elegante">
                                    <thead><tr><th style={{ textAlign: 'left' }}>Plano</th><th style={{ textAlign: 'left' }}>Ação</th><th style={{ textAlign: 'left' }}>Unidade/Etapa</th><th style={{ textAlign: 'left' }}>Responsável</th><th className="center">Prazo</th><th className="center">Faltam</th></tr></thead>
                                    <tbody>{dados.proximos_prazos.map(i => (
                                        <tr key={i.id_item}><td style={{ fontSize: '.8rem' }}>{i.plano}</td><td style={{ fontSize: '.82rem' }}>{i.descricao}</td><td style={{ fontSize: '.8rem' }}>{i.unidade || i.grupo || '-'}</td><td style={{ fontSize: '.8rem' }}>{i.responsavel || '-'}</td><td className="center">{dataBR(i.data_fim)}</td><td className="center">{i.dias_restantes}d</td></tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}

                        {opcoes.detalhe && itensPorPlano.map(([plano, lista]) => (
                            <div className="agrupamento-projeto" key={plano}>
                                <h3>Detalhamento - {plano} <small>({lista.length} ações)</small></h3>
                                <table className="tabela-elegante rp-detalhe">
                                    <thead><tr>
                                        <th style={{ textAlign: 'left' }}>Ação</th><th style={{ textAlign: 'left' }}>Cliente</th><th style={{ textAlign: 'left' }}>Etapa / Unidade</th><th style={{ textAlign: 'left' }}>Responsável</th>
                                        <th style={{ textAlign: 'left' }}>Equipe</th><th className="center">Previsto</th><th className="center">Realizado</th><th className="center">%</th>
                                        <th className="center">Situação</th><th className="center">Prazo</th><th className="center">Horas</th>
                                        {opcoes.observacoes && <th style={{ textAlign: 'left' }}>Observação</th>}
                                    </tr></thead>
                                    <tbody>{lista.map(i => (
                                        <tr key={i.id_item}>
                                            <td>{i.descricao}</td>
                                            <td>{i.cliente || '-'}</td>
                                            <td>{[i.modulo, i.unidade || i.grupo].filter(Boolean).join(' · ') || '-'}</td>
                                            <td>{i.responsavel || '-'}</td>
                                            <td>{i.equipe || '-'}</td>
                                            <td className="center">{dataBR(i.data_inicio)}<br />{dataBR(i.data_fim)}</td>
                                            <td className="center">{dataBR(i.data_inicio_real)}<br />{dataBR(i.data_fim_real)}</td>
                                            <td className="center">{i.percentual}%</td>
                                            <td className="center" style={{ color: COR_STATUS_ITEM[i.status], fontWeight: 700 }}>{i.status}</td>
                                            <td className="center" style={{ color: COR_PRAZO[i.situacao_prazo], fontWeight: 600 }}>{i.situacao_prazo}{i.dias_atraso ? ` (${i.dias_atraso}d)` : ''}</td>
                                            <td className="center">{minParaHHMM(i.horas_trabalhadas) || '-'}</td>
                                            {opcoes.observacoes && <td>{i.observacao || ''}</td>}
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        ))}

                        <p className="tm-nota">
                            Execução = média do % de execução das ações (ação fechada = 100%). Esperado = % de ações cujo prazo previsto já venceu.
                            Desvio = realizado − esperado (pontos percentuais). Aderência = ações fechadas dentro do prazo ÷ ações fechadas que tinham prazo.
                            Saúde: CRÍTICO (&gt;20% atrasado, término do plano vencido ou desvio ≤ −25 p.p.), ATENÇÃO (atrasos, desvio ≤ −10 p.p. ou entregas em 7 dias), NO PRAZO (demais).
                        </p>
                    </main>
                )}
            </div>
        </div>
    );
}

function TabelaGrupo({ titulo, lista }) {
    if (!lista || !lista.length) return <div />;
    return (
        <div className="agrupamento-projeto">
            <h3>{titulo}</h3>
            <table className="tabela-elegante">
                <thead><tr><th style={{ textAlign: 'left' }}>Nome</th><th className="center">Ações</th><th className="center">Fechadas</th><th className="center">Atrasadas</th><th className="center">% Exec.</th></tr></thead>
                <tbody>{lista.map(x => (
                    <tr key={x.nome}>
                        <td style={{ fontSize: '.84rem' }}>{x.nome}</td><td className="center">{x.total}</td><td className="center">{x.fechados}</td>
                        <td className="center" style={{ color: x.atrasados ? '#8F332F' : undefined, fontWeight: x.atrasados ? 700 : 400 }}>{x.atrasados}</td>
                        <td className="center"><b>{x.progresso}%</b></td>
                    </tr>
                ))}</tbody>
            </table>
        </div>
    );
}
