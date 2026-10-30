/* ARQUIVO: src/RegistroFerias.js
   Tela de SOLICITAÇÃO de Férias (isolada por escopo/lotação).
   - Implantação: seletor lista os implantadores (visão global) ou só o próprio.
   - Projetos: renderizada via wrapper Projetos.js (lotacaoFixa); o seletor
     lista os usuários da lotação (Gerente/Líder) ou só o próprio.
   A aprovação/gestão fica na tela dedicada AprovacaoFerias (Operações > Gestão). */
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';

export default function RegistroFerias({
    aoVoltar,
    modulo = 'implantacao',
    // Props vindas do wrapper Operações > Projetos (Projetos.js)
    lotacaoFixa,
    permissaoNovo
}) {
    const getUsuarioLogado = () => {
        try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; }
        catch (e) { return {}; }
    };
    const usuarioLogado = getUsuarioLogado();

    // Modo de operação: projetos quando renderizado pelo wrapper (lotacaoFixa)
    const modoFerias = (lotacaoFixa !== undefined && lotacaoFixa !== null && lotacaoFixa !== '')
        ? 'projetos'
        : (modulo || 'implantacao');
    const lotacaoAtual = lotacaoFixa || null;

    const dataHoje = new Date().toLocaleDateString('pt-BR');

    // --- Permissão de criar (Novo) ---
    // Projetos: vem do wrapper. Implantação: lê /regras do perfil.
    const [podeNovo, setPodeNovo] = useState(
        modoFerias === 'projetos' ? !!permissaoNovo : (usuarioLogado.perfil_acesso === 'Administrador')
    );

    useEffect(() => {
        if (modoFerias === 'projetos') { setPodeNovo(!!permissaoNovo); return; }
        const carregar = async () => {
            if (usuarioLogado.perfil_acesso === 'Administrador') { setPodeNovo(true); return; }
            try {
                const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                const regra = res.data.find(r => r.nome_modulo === 'ferias_solicitacao');
                setPodeNovo(regra ? (regra.pode_novo || regra.pode_acessar) : false);
            } catch (e) { console.error('Erro permissões férias:', e); }
        };
        if (usuarioLogado.id_usuario) carregar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modoFerias, permissaoNovo, usuarioLogado.perfil_acesso]);

    // --- Colaboradores selecionáveis ---
    const [colaboradores, setColaboradores] = useState([]);
    const [colaboradorSel, setColaboradorSel] = useState('');
    const [listaHistorico, setListaHistorico] = useState([]);

    const colaboradorAtual = useMemo(
        () => colaboradores.find(c => String(c.id_usuario) === String(colaboradorSel)) || null,
        [colaboradores, colaboradorSel]
    );

    useEffect(() => {
        const carregarColaboradores = async () => {
            try {
                const params = { modulo: modoFerias };
                if (modoFerias === 'projetos') params.lotacao = lotacaoAtual;
                const res = await api.get('/ferias/colaboradores', { params });
                const lista = Array.isArray(res.data) ? res.data : [];
                setColaboradores(lista);
                // Auto-seleciona quando há exatamente um (ex.: apenas o próprio usuário)
                if (lista.length === 1) setColaboradorSel(String(lista[0].id_usuario));
                else setColaboradorSel('');
            } catch (e) {
                console.error('Erro ao carregar colaboradores', e);
                setColaboradores([]);
                setColaboradorSel('');
            }
        };
        if (usuarioLogado.id_usuario) carregarColaboradores();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modoFerias, lotacaoAtual]);

    // --- Histórico do colaborador selecionado (saldo + tabela) ---
    const carregarHistorico = async (idColab) => {
        if (!idColab) { setListaHistorico([]); return; }
        try {
            const res = await api.get(`/ferias/historico/${idColab}`);
            setListaHistorico(Array.isArray(res.data) ? res.data : []);
        } catch (e) { console.error('Erro histórico colaborador', e); setListaHistorico([]); }
    };
    useEffect(() => { carregarHistorico(colaboradorSel); /* eslint-disable-next-line */ }, [colaboradorSel]);

    // --- Formulário ---
    const [opcoesFerias, setOpcoesFerias] = useState([
        { id: '30_DIAS', label: '30 Dias Corridos', dias: 30, checked: false, data_inicio: '' },
        { id: '1_PERIODO_15', label: '1º Período (15 Dias)', dias: 15, checked: false, data_inicio: '' },
        { id: '2_PERIODO_15', label: '2º Período (15 Dias)', dias: 15, checked: false, data_inicio: '' },
        { id: '20_DIAS_VENDIDO', label: '20 Dias (c/ 10 Vendidos)', dias: 20, checked: false, data_inicio: '' }
    ]);
    const [dadosGerais, setDadosGerais] = useState({ periodo_aquisitivo: new Date().getFullYear() - 1, dias_restantes: 30 });
    const [alertaCLT, setAlertaCLT] = useState(null);

    // --- CÁLCULO DE SALDO ---
    useEffect(() => {
        let diasUsados = 0;
        const anoSelecionado = dadosGerais.periodo_aquisitivo.toString();
        if (listaHistorico.length > 0) {
            listaHistorico.forEach(req => {
                if (req.periodo_aquisitivo.toString() === anoSelecionado && req.status !== 'RECUSADO') {
                    if (req.tipo_solicitacao.includes('10 Vendidos') || req.tipo_solicitacao.includes('20 Dias (c/ 10')) {
                        diasUsados += 30;
                    } else {
                        const inicio = new Date(req.data_inicio);
                        const fim = new Date(req.data_fim);
                        const diffDays = Math.ceil(Math.abs(fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
                        diasUsados += diffDays;
                    }
                }
            });
        }
        const saldo = 30 - diasUsados;
        setDadosGerais(prev => ({ ...prev, dias_restantes: saldo < 0 ? 0 : saldo }));
    }, [listaHistorico, dadosGerais.periodo_aquisitivo]);

    // --- Helpers ---
    const formatarDataLocal = (dataString) => {
        if (!dataString) return '';
        const parteData = dataString.split('T')[0];
        const [ano, mes, dia] = parteData.split('-');
        return `${dia}/${mes}/${ano}`;
    };
    const calcularLimiteCLT = (dataAdmissao, periodoAquisitivo) => {
        if (!dataAdmissao || !periodoAquisitivo) return null;
        const adm = new Date(dataAdmissao.split('T')[0] + 'T12:00:00');
        const inicioPA = new Date(parseInt(periodoAquisitivo), adm.getMonth(), adm.getDate());
        const limite = new Date(inicioPA);
        limite.setMonth(limite.getMonth() + 23);
        limite.setDate(limite.getDate() - 1);
        return { inicioPA, limite };
    };
    const verificarLimiteCLT = (dataAdmissao, periodoAquisitivo, dataFim) => {
        if (!dataAdmissao || !periodoAquisitivo || !dataFim) { setAlertaCLT(null); return true; }
        const calc = calcularLimiteCLT(dataAdmissao, periodoAquisitivo);
        if (!calc) { setAlertaCLT(null); return true; }
        const dtFim = new Date(dataFim + 'T12:00:00');
        if (dtFim > calc.limite) {
            setAlertaCLT({
                periodo: periodoAquisitivo,
                inicio_pa: calc.inicioPA.toISOString().split('T')[0],
                data_limite: calc.limite.toISOString().split('T')[0]
            });
            return false;
        }
        setAlertaCLT(null);
        return true;
    };

    const handleCheck = (id) => {
        setOpcoesFerias(prev => {
            const novo = prev.map(op => ({ ...op }));
            const item = novo.find(op => op.id === id);
            item.checked = !item.checked;
            if (item.checked) {
                if (id === '30_DIAS' || id === '20_DIAS_VENDIDO') {
                    novo.forEach(op => { if (op.id !== id) { op.checked = false; op.data_inicio = ''; } });
                } else if (id === '1_PERIODO_15' || id === '2_PERIODO_15') {
                    novo.forEach(op => { if (op.id === '30_DIAS' || op.id === '20_DIAS_VENDIDO') { op.checked = false; op.data_inicio = ''; } });
                }
            } else { item.data_inicio = ''; }
            return novo;
        });
    };
    const handleDateChange = (id, novaData) => {
        setOpcoesFerias(prev => prev.map(op => op.id === id ? { ...op, data_inicio: novaData } : op));
    };

    // Sinaliza limite legal em tempo real
    useEffect(() => {
        const adm = colaboradorAtual?.data_admissao;
        if (!adm) { setAlertaCLT(null); return; }
        const selecionados = opcoesFerias.filter(op => op.checked && op.data_inicio);
        if (selecionados.length === 0) { setAlertaCLT(null); return; }
        for (const item of selecionados) {
            const dtIni = new Date(item.data_inicio + 'T12:00:00');
            const dtFim = new Date(dtIni);
            dtFim.setDate(dtFim.getDate() + (item.dias - 1));
            const ok = verificarLimiteCLT(adm, dadosGerais.periodo_aquisitivo, dtFim.toISOString().split('T')[0]);
            if (!ok) return;
        }
        setAlertaCLT(null);
        // eslint-disable-next-line
    }, [opcoesFerias, dadosGerais.periodo_aquisitivo, colaboradorAtual]);

    const handleSalvarSolicitacao = async () => {
        if (!colaboradorSel) return Swal.fire('Atenção', 'Selecione o colaborador.', 'warning');
        if (!podeNovo) return Swal.fire('Atenção', 'Você não tem permissão para criar solicitações.', 'warning');

        const selecionados = opcoesFerias.filter(op => op.checked);
        if (selecionados.length === 0) return Swal.fire('Atenção', 'Selecione um tipo.', 'warning');
        if (selecionados.some(op => !op.data_inicio)) return Swal.fire('Atenção', 'Preencha as datas.', 'warning');

        const limitePA = new Date().getFullYear() - 1;
        if (parseInt(dadosGerais.periodo_aquisitivo) > limitePA) {
            return Swal.fire({
                icon: 'warning', title: 'Período Aquisitivo Inválido',
                html: `O período aquisitivo só pode ser solicitado após sua conclusão.<br/>Ano máximo permitido atualmente: <b>${limitePA}</b>.`
            });
        }

        const itemSelecionado = selecionados[0];
        const custoDias = itemSelecionado.id === '20_DIAS_VENDIDO' ? 30 : itemSelecionado.dias;
        if (custoDias > dadosGerais.dias_restantes) {
            return Swal.fire({
                title: 'Saldo Insuficiente',
                html: `Esta opção consome <b>${custoDias} dias</b> do saldo.<br/>O colaborador possui apenas <b>${dadosGerais.dias_restantes} dias</b> restantes para o período de ${dadosGerais.periodo_aquisitivo}.`,
                icon: 'error'
            });
        }

        const admColab = colaboradorAtual?.data_admissao;
        if (admColab) {
            for (const item of selecionados) {
                const dtIni = new Date(item.data_inicio + 'T12:00:00');
                const dtFim = new Date(dtIni);
                dtFim.setDate(dtFim.getDate() + (item.dias - 1));
                const ok = verificarLimiteCLT(admColab, dadosGerais.periodo_aquisitivo, dtFim.toISOString().split('T')[0]);
                if (!ok) {
                    const calc = calcularLimiteCLT(admColab, dadosGerais.periodo_aquisitivo);
                    return Swal.fire({
                        title: 'Prazo Legal Excedido',
                        html: `A solicitação <b>${item.label}</b> ultrapassa o prazo de <b>1 ano e 11 meses</b> do período aquisitivo de <b>${dadosGerais.periodo_aquisitivo}</b> (CLT Art. 134).<br/><br/>Data limite legal: <b>${formatarDataLocal(calc.limite.toISOString().split('T')[0])}</b>.`,
                        icon: 'error'
                    });
                }
            }
        }

        try {
            Swal.fire({ title: 'Enviando...', didOpen: () => Swal.showLoading() });
            for (const item of selecionados) {
                const dtIni = new Date(item.data_inicio + 'T12:00:00');
                const dtFim = new Date(dtIni);
                dtFim.setDate(dtFim.getDate() + (item.dias - 1));
                await api.post('/ferias/salvar', {
                    id_usuario: parseInt(colaboradorSel),
                    periodo_aquisitivo: dadosGerais.periodo_aquisitivo,
                    tipo_solicitacao: item.label,
                    data_inicio: item.data_inicio,
                    data_fim: dtFim.toISOString().split('T')[0],
                    dias_restantes: dadosGerais.dias_restantes
                });
            }
            Swal.fire('Sucesso!', 'Solicitação enviada.', 'success');
            setOpcoesFerias(prev => prev.map(op => ({ ...op, checked: false, data_inicio: '' })));
            setAlertaCLT(null);
            carregarHistorico(colaboradorSel);
        } catch (error) {
            const msg = error?.response?.data?.erro || 'Falha ao salvar.';
            Swal.fire('Erro', msg, 'error');
        }
    };

    const getStatusColor = (s) => s === 'APROVADO' ? '#e8f5e9' : s === 'RECUSADO' ? '#ffebee' : '#fff3e0';
    const getStatusTextoColor = (s) => s === 'APROVADO' ? '#2e7d32' : s === 'RECUSADO' ? '#d32f2f' : '#ef6c00';
    const formatarStatus = (s) => s === 'PENDENTE' ? 'Em Análise' : s;

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title"><span className="icon"><Icon n="umbrella"/></span><h2>Solicitação de Férias</h2></div>
                <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
            </div>

            <div className="form-card" style={{ animation: 'fadeIn 0.5s' }}>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '20px' }}>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label>Data Atual</label>
                        <input type="text" className="form-control" value={dataHoje} readOnly style={{ backgroundColor: '#f5f5f5', textAlign: 'center' }} />
                    </div>
                    <div className="form-group" style={{ flex: 2 }}>
                        <label>Colaborador</label>
                        <select
                            className="form-control"
                            value={colaboradorSel}
                            onChange={e => setColaboradorSel(e.target.value)}
                            style={{ fontWeight: 'bold', color: 'var(--pine-700)' }}
                            disabled={colaboradores.length <= 1}
                        >
                            <option value="">Selecione o colaborador...</option>
                            {colaboradores.map(c => (
                                <option key={c.id_usuario} value={c.id_usuario}>
                                    {c.nome_completo}{c.funcao ? ` - ${c.funcao}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label>Dias Restantes</label>
                        <input type="number" className="form-control" value={dadosGerais.dias_restantes} readOnly style={{ backgroundColor: '#e3f2fd', color: 'var(--pine-700)', fontWeight: 'bold', textAlign: 'center' }} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                        <label>Período Aquisitivo (Ano)</label>
                        <input
                            type="number"
                            className="form-control"
                            value={dadosGerais.periodo_aquisitivo}
                            max={new Date().getFullYear() - 1}
                            onChange={e => {
                                const valor = e.target.value;
                                const limite = new Date().getFullYear() - 1;
                                if (valor === '' || parseInt(valor) <= limite) {
                                    setDadosGerais({ ...dadosGerais, periodo_aquisitivo: valor });
                                } else {
                                    Swal.fire({ icon: 'warning', title: 'Período Aquisitivo Inválido', html: `O período aquisitivo só pode ser solicitado após sua conclusão.<br/>Ano máximo permitido atualmente: <b>${limite}</b>.` });
                                }
                            }}
                            title={`Ano máximo permitido: ${new Date().getFullYear() - 1}`}
                        />
                    </div>
                </div>

                <div style={{ marginBottom: '25px', paddingBottom: '15px', borderBottom: '1px solid var(--line)' }}>
                    {alertaCLT && (
                        <div style={{ backgroundColor: '#fff3cd', color: '#856404', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #ffeeba' }}>
                            <strong style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Icon n="alert"/> Atenção: Prazo Legal (CLT Art. 134) Excedido!</strong>
                            <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                                O período aquisitivo de <b>{alertaCLT.periodo}</b> (iniciado em {formatarDataLocal(alertaCLT.inicio_pa)}) deve ser concluído em até <b>1 ano e 11 meses</b>.<br />
                                Data limite para o fim do gozo: <b>{formatarDataLocal(alertaCLT.data_limite)}</b>.
                            </div>
                        </div>
                    )}
                    <label style={{ display: 'block', marginBottom: '15px', fontWeight: 'bold', color: '#555' }}>Selecione o(s) Período(s):</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                        {opcoesFerias.map(op => (
                            <label key={op.id} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px', background: 'white', border: op.checked ? '2px solid #2e7d32' : '1px solid #ccc', borderRadius: '6px', minWidth: '180px' }}>
                                <input type="checkbox" checked={op.checked} onChange={() => handleCheck(op.id)} style={{ accentColor: '#2e7d32', width: '18px', height: '18px' }} />
                                <span style={{ fontWeight: op.checked ? 'bold' : 'normal', color: op.checked ? '#2e7d32' : '#333' }}>{op.label}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px' }}>
                    {opcoesFerias.map(op => op.checked && (
                        <div key={op.id} style={{ animation: 'fadeIn 0.3s', flex: '1 1 300px' }}>
                            <div className="form-group"><label style={{ color: 'var(--pine)', fontWeight: 'bold' }}>Início para {op.label}</label><input type="date" min="1900-01-01" max="2100-12-31" className="form-control" value={op.data_inicio} onChange={e => handleDateChange(op.id, e.target.value)} style={{ border: '2px solid var(--pine)' }} /></div>
                        </div>
                    ))}
                </div>

                <div style={{ textAlign: 'right', borderTop: '1px solid #eee', paddingTop: '20px', marginTop: '20px' }}>
                    <button className="btn-salvar" onClick={handleSalvarSolicitacao} disabled={!podeNovo || !colaboradorSel} style={{ padding: '12px 30px', fontSize: '1.1rem', opacity: (!podeNovo || !colaboradorSel) ? 0.6 : 1, cursor: (!podeNovo || !colaboradorSel) ? 'not-allowed' : 'pointer' }}><Icon n="target"/> ENVIAR SOLICITAÇÃO</button>
                </div>

                <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '4px solid #e0e0e0' }}>
                    <h4 style={{ color: '#555', marginBottom: '15px' }}><Icon n="folder"/> Solicitações do Colaborador</h4>
                    <div className="table-responsive">
                        <table className="tabela-unidades" style={{ width: '100%', fontSize: '0.9rem' }}>
                            <thead><tr><th>Data Solicitação</th><th>Tipo</th><th>Período</th><th style={{ textAlign: 'center' }}>Período de Gozo</th><th style={{ textAlign: 'center' }}>Status</th></tr></thead>
                            <tbody>
                                {listaHistorico.length === 0 ? (
                                    <tr><td colSpan="5" style={{ textAlign: 'center', color: '#999', padding: '15px' }}>{colaboradorSel ? 'Nenhuma solicitação registrada.' : 'Selecione um colaborador.'}</td></tr>
                                ) : listaHistorico.map(req => (
                                    <tr key={req.id_ferias} style={{ backgroundColor: getStatusColor(req.status) }}>
                                        <td>{formatarDataLocal(req.data_solicitacao)}</td>
                                        <td>{req.tipo_solicitacao}</td>
                                        <td>{req.periodo_aquisitivo}</td>
                                        <td style={{ textAlign: 'center' }}>{formatarDataLocal(req.data_inicio)} até {formatarDataLocal(req.data_fim)}</td>
                                        <td style={{ textAlign: 'center' }}><span style={{ color: getStatusTextoColor(req.status), fontWeight: 'bold', border: `1px solid ${getStatusTextoColor(req.status)}`, padding: '2px 8px', borderRadius: '12px', background: 'white' }}>{formatarStatus(req.status)}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
