/* ARQUIVO: src/AprovacaoFerias.js
   Operações > Gestão > Aprovação de Férias.
   Gestão de TODAS as solicitações, com filtro de lotação (incluindo SEDE - GD
   para os implantadores) e aprovação travada por função do aprovador:
   - Gerente / Administrador  -> qualquer função
   - Coordenador de Implantação -> somente Implantador
   - Líder de Projeto -> somente Analista e Operador
   O backend reforça a mesma regra em /ferias/status. */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import logo from './logo.png';

export default function AprovacaoFerias({ aoVoltar }) {
    const usuarioLogado = useMemo(() => {
        try { return JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; }
        catch (e) { return {}; }
    }, []);

    const dataHoraGeracao = new Date().toLocaleString('pt-BR');

    const reciboRef = useRef(null);
    const relatorioGeralRef = useRef(null);
    const relatorioPrazosRef = useRef(null);

    const [listaGestao, setListaGestao] = useState([]);
    const [mostrarConcluidas, setMostrarConcluidas] = useState(false);
    const [modalAberto, setModalAberto] = useState(false);
    const [conflitos, setConflitos] = useState([]);
    const [alertaCLT, setAlertaCLT] = useState(null);
    const [relatorioCategorias, setRelatorioCategorias] = useState({ concluidas: [], aprovadas: [], pendentes: [] });
    const [relatorioPrazos, setRelatorioPrazos] = useState([]);

    // Filtro de lotação
    const [lotacaoFiltro, setLotacaoFiltro] = useState('Todos');
    const [lotacoesDisponiveis, setLotacoesDisponiveis] = useState([]);
    const [escopoGlobal, setEscopoGlobal] = useState(false);

    // Permissão de editar/aprovar (ferias_gestao)
    const [podeEditar, setPodeEditar] = useState(usuarioLogado.perfil_acesso === 'Administrador');

    const [opcoesFerias] = useState([
        { id: '30_DIAS', label: '30 Dias Corridos', dias: 30 },
        { id: '1_PERIODO_15', label: '1º Período (15 Dias)', dias: 15 },
        { id: '2_PERIODO_15', label: '2º Período (15 Dias)', dias: 15 },
        { id: '20_DIAS_VENDIDO', label: '20 Dias (c/ 10 Vendidos)', dias: 20 }
    ]);

    const [formEdicao, setFormEdicao] = useState({
        id_ferias: null, nome_completo: '', periodo_aquisitivo: '', tipo_id: '',
        tipo_label: '', data_inicio: '', data_fim: '', status: '', data_solicitacao: '',
        cpf: '', data_nascimento: '', matricula: '', setor: '', funcao: '', data_admissao: null, nome_lotacao: ''
    });

    // --- Regra de aprovação por função (cliente; backend reforça) ---
    const normF = (s) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
    const aprovFuncao = normF(usuarioLogado.funcao);
    const ehAdmin = usuarioLogado.perfil_acesso === 'Administrador';
    const podeAprovarFuncao = (funcaoSolic) => {
        const alvo = normF(funcaoSolic);
        if (ehAdmin || aprovFuncao === 'GERENTE') return true;
        if (aprovFuncao === 'COORDENADOR DE IMPLANTACAO') return alvo === 'IMPLANTADOR';
        if (aprovFuncao === 'LIDER DE PROJETO') return alvo === 'ANALISTA' || alvo === 'OPERADOR';
        return false;
    };

    // --- Permissão de edição ---
    useEffect(() => {
        const carregar = async () => {
            if (usuarioLogado.perfil_acesso === 'Administrador') { setPodeEditar(true); return; }
            try {
                const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                const regra = res.data.find(r => r.nome_modulo === 'ferias_gestao');
                setPodeEditar(regra ? regra.pode_editar : false);
            } catch (e) { console.error('Erro permissões gestão férias:', e); }
        };
        if (usuarioLogado.id_usuario) carregar();
    }, [usuarioLogado.perfil_acesso, usuarioLogado.id_usuario]);

    // --- Lotações para o filtro ---
    useEffect(() => {
        const carregar = async () => {
            try {
                const r = await api.get('/projetos/minhas-lotacoes');
                setLotacoesDisponiveis(r.data?.lotacoes || []);
                setEscopoGlobal(!!r.data?.global);
            } catch (e) { setLotacoesDisponiveis([]); }
        };
        carregar();
    }, []);

    // --- Helpers ---
    const formatarDataLocal = (dataString) => {
        if (!dataString) return '';
        const parteData = dataString.split('T')[0];
        const [ano, mes, dia] = parteData.split('-');
        return `${dia}/${mes}/${ano}`;
    };
    const getStatusColor = (s) => s === 'APROVADO' ? '#E8F5E9' : s === 'RECUSADO' ? '#F6E9E7' : '#F6F1E6';
    const getStatusTextoColor = (s) => s === 'APROVADO' ? '#2E7D32' : s === 'RECUSADO' ? '#A23B36' : '#9C7A3C';
    const formatarStatus = (s) => s === 'PENDENTE' ? 'Em Análise' : s;

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
            setAlertaCLT({ periodo: periodoAquisitivo, inicio_pa: calc.inicioPA.toISOString().split('T')[0], data_limite: calc.limite.toISOString().split('T')[0] });
            return false;
        }
        setAlertaCLT(null);
        return true;
    };

    // --- Carregamento da visão gerencial ---
    const carregarVisaoGerencial = async (lot = lotacaoFiltro) => {
        try {
            const params = { perfil: 'Administrador' };
            if (lot && lot !== 'Todos') params.lotacao = lot;
            const res = await api.get('/ferias/listar', { params });
            const ordenado = res.data.sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));
            setListaGestao(ordenado);
        } catch (error) { console.error('Erro visão gerencial', error); }
    };

    useEffect(() => { carregarVisaoGerencial(lotacaoFiltro); /* eslint-disable-next-line */ 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotacaoFiltro]);

    const verificarConflitos = async (id, inicio, fim) => {
        if (!inicio || !fim) return;
        try {
            const res = await api.post('/ferias/conflitos', { id_ferias: id, data_inicio: inicio, data_fim: fim });
            setConflitos(res.data);
        } catch (error) { console.error('Erro ao verificar conflitos', error); }
    };

    const abrirModalGestao = async (req) => {
        let tipoId = '30_DIAS';
        if (req.tipo_solicitacao.includes('1º Período')) tipoId = '1_PERIODO_15';
        else if (req.tipo_solicitacao.includes('2º Período')) tipoId = '2_PERIODO_15';
        else if (req.tipo_solicitacao.includes('20 Dias')) tipoId = '20_DIAS_VENDIDO';

        const dInicio = req.data_inicio ? req.data_inicio.split('T')[0] : '';
        const dFim = req.data_fim ? req.data_fim.split('T')[0] : '';

        setFormEdicao({
            id_ferias: req.id_ferias, nome_completo: req.nome_completo, periodo_aquisitivo: req.periodo_aquisitivo,
            tipo_id: tipoId, tipo_label: req.tipo_solicitacao, data_inicio: dInicio, data_fim: dFim,
            status: req.status, data_solicitacao: req.data_solicitacao,
            cpf: req.cpf || 'Não informado',
            data_nascimento: req.data_nascimento ? formatarDataLocal(req.data_nascimento) : 'Não informada',
            data_admissao: req.data_admissao || null,
            nome_lotacao: req.nome_lotacao || 'Não informada',
            matricula: req.matricula || 'S/N', setor: req.setor || 'Geral', funcao: req.funcao || 'Colaborador'
        });

        verificarConflitos(req.id_ferias, dInicio, dFim);
        verificarLimiteCLT(req.data_admissao, req.periodo_aquisitivo, dFim);
        setModalAberto(true);
    };

    useEffect(() => {
        if (modalAberto && formEdicao.data_inicio && formEdicao.tipo_id) {
            const opcao = opcoesFerias.find(o => o.id === formEdicao.tipo_id);
            if (opcao) {
                const dtIni = new Date(formEdicao.data_inicio + 'T12:00:00');
                const dtFim = new Date(dtIni);
                dtFim.setDate(dtFim.getDate() + (opcao.dias - 1));
                const novaFim = dtFim.toISOString().split('T')[0];
                if (novaFim !== formEdicao.data_fim || formEdicao.tipo_label !== opcao.label) {
                    setFormEdicao(prev => ({ ...prev, data_fim: novaFim, tipo_label: opcao.label }));
                }
                verificarConflitos(formEdicao.id_ferias, formEdicao.data_inicio, novaFim);
                verificarLimiteCLT(formEdicao.data_admissao, formEdicao.periodo_aquisitivo, novaFim);
            }
        }
        // eslint-disable-next-line
    }, [formEdicao.data_inicio, formEdicao.tipo_id, formEdicao.periodo_aquisitivo]);

    const handleSalvarEdicao = async (e) => {
        if (e) e.preventDefault();
        try {
            await api.put(`/ferias/editar/${formEdicao.id_ferias}`, {
                periodo_aquisitivo: formEdicao.periodo_aquisitivo, tipo_solicitacao: formEdicao.tipo_label,
                data_inicio: formEdicao.data_inicio, data_fim: formEdicao.data_fim
            });
            if (formEdicao.status === 'APROVADO') {
                await api.put(`/ferias/status/${formEdicao.id_ferias}`, { status: 'APROVADO' });
            }
            Swal.fire({ title: 'Atualizado!', text: 'Dados alterados.', icon: 'success', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
            carregarVisaoGerencial();
        } catch (e) {
            const msg = e?.response?.data?.erro || 'Erro ao atualizar.';
            Swal.fire({ title: 'Erro', text: msg, icon: 'error', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
        }
    };

    const handleStatus = async (novoStatus, e) => {
        if (e) e.preventDefault();
        if (!podeAprovarFuncao(formEdicao.funcao)) {
            return Swal.fire({ title: 'Ação não permitida', text: `Sua função não pode ${novoStatus === 'APROVADO' ? 'aprovar' : 'recusar'} férias de ${formEdicao.funcao}.`, icon: 'warning', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
        }
        const confirmar = await Swal.fire({
            title: novoStatus === 'APROVADO' ? 'Aprovar Férias?' : 'Rejeitar Férias?',
            text: 'Essa ação atualizará o status da solicitação.',
            icon: 'question', showCancelButton: true, confirmButtonColor: novoStatus === 'APROVADO' ? '#2E7D32' : '#A23B36',
            confirmButtonText: 'Sim, confirmar', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; }
        });
        if (confirmar.isConfirmed) {
            try {
                await api.put(`/ferias/status/${formEdicao.id_ferias}`, { status: novoStatus });
                setFormEdicao(prev => ({ ...prev, status: novoStatus }));
                Swal.fire({ title: 'Sucesso', text: 'Status alterado.', icon: 'success', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
                carregarVisaoGerencial();
            } catch (e) {
                const msg = e?.response?.data?.erro || 'Erro status.';
                Swal.fire({ title: 'Erro', text: msg, icon: 'error', didOpen: () => { const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
            }
        }
    };

    const gerarReciboJPG = (e) => {
        if (e) e.preventDefault();
        const input = reciboRef.current;
        if (!input) return;
        input.style.display = 'block';
        Swal.fire({ title: 'Gerando Imagem...', didOpen: () => { Swal.showLoading(); const c = Swal.getContainer(); if (c) c.style.zIndex = '20000'; } });
        html2canvas(input, { scale: 2 }).then((canvas) => {
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.download = `Recibo_Ferias_${formEdicao.nome_completo}.jpg`;
            link.click();
            input.style.display = 'none';
            Swal.close();
        });
    };

    const gerarRelatorioGeral = async () => {
        try {
            Swal.fire({ title: 'Gerando Relatório...', didOpen: () => Swal.showLoading() });
            const params = { perfil: 'Administrador' };
            if (lotacaoFiltro && lotacaoFiltro !== 'Todos') params.lotacao = lotacaoFiltro;
            const res = await api.get('/ferias/listar', { params });
            const anoCorrente = new Date().getFullYear();
            const anoAnterior = anoCorrente - 1;

            let dadosFiltrados = res.data
                .filter(d => (d.status === 'APROVADO' || d.status === 'PENDENTE') && (d.periodo_aquisitivo === anoAnterior || d.periodo_aquisitivo === anoCorrente))
                .sort((a, b) => new Date(a.data_inicio) - new Date(b.data_inicio));

            if (dadosFiltrados.length === 0) {
                Swal.close();
                return Swal.fire('Aviso', `Não há solicitações para os períodos aquisitivos de ${anoAnterior} e ${anoCorrente}.`, 'info');
            }

            const mapaSaldos = {};
            const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            const concluidas = [], aprovadas = [], pendentes = [];

            dadosFiltrados.forEach(req => {
                const chave = `${req.id_usuario}_${req.periodo_aquisitivo}`;
                if (mapaSaldos[chave] === undefined) mapaSaldos[chave] = 30;
                let diasConsumidos = 0;
                if (req.tipo_solicitacao.includes('10 Vendidos') || req.tipo_solicitacao.includes('20 Dias (c/ 10')) {
                    diasConsumidos = 30;
                } else {
                    const inicio = new Date(req.data_inicio);
                    const fim = new Date(req.data_fim);
                    diasConsumidos = Math.ceil(Math.abs(fim - inicio) / (1000 * 60 * 60 * 24)) + 1;
                }
                mapaSaldos[chave] = mapaSaldos[chave] - diasConsumidos;
                const saldoParaMostrar = mapaSaldos[chave] < 0 ? 0 : mapaSaldos[chave];
                const dataFimGozo = new Date(req.data_fim.split('T')[0] + 'T23:59:59');
                const objFinal = { ...req, saldo_calculado: saldoParaMostrar };
                if (req.status === 'PENDENTE') { objFinal.status_relatorio = 'PENDENTE'; pendentes.push(objFinal); }
                else if (req.status === 'APROVADO' && dataFimGozo < hoje) { objFinal.status_relatorio = 'CONCLUÍDA'; concluidas.push(objFinal); }
                else { objFinal.status_relatorio = 'APROVADA'; aprovadas.push(objFinal); }
            });

            setRelatorioCategorias({ concluidas, aprovadas, pendentes });
            setTimeout(() => {
                const input = relatorioGeralRef.current;
                if (!input) return;
                input.style.display = 'block';
                html2canvas(input, { scale: 2, useCORS: true }).then((canvas) => {
                    const imgData = canvas.toDataURL('image/jpeg', 0.9);
                    const pdf = new jsPDF('p', 'mm', 'a4');
                    const pdfWidth = pdf.internal.pageSize.getWidth();
                    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
                    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, imgHeight);
                    pdf.save(`Relatorio_Ferias_${anoAnterior}-${anoCorrente}.pdf`);
                    input.style.display = 'none';
                    Swal.close();
                });
            }, 500);
        } catch (e) { Swal.close(); console.error(e); Swal.fire('Erro', 'Erro ao gerar relatório.', 'error'); }
    };

    const gerarRelatorioPrazos = async () => {
        try {
            Swal.fire({ title: 'Gerando Relatório...', didOpen: () => Swal.showLoading() });
            const res = await api.get('/ferias/relatorio-prazos');
            if (!res.data || res.data.length === 0) {
                Swal.close();
                return Swal.fire('Aviso', 'Nenhum implantador ativo com período aquisitivo em aberto.', 'info');
            }
            setRelatorioPrazos(res.data);
            await new Promise(r => setTimeout(r, 200));
            const input = relatorioPrazosRef.current;
            if (!input) { Swal.close(); return; }
            input.style.display = 'block';
            const canvas = await html2canvas(input, { scale: 2 });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            const pdf = new jsPDF('l', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Relatorio_Prazos_Ferias_${new Date().toISOString().split('T')[0]}.pdf`);
            input.style.display = 'none';
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Erro ao gerar relatório de prazos.', 'error'); }
    };

    const TabelaRelatorio = ({ titulo, dados, corCabecalho, corStatus }) => {
        if (dados.length === 0) return null;
        return (
            <div style={{ marginBottom: '30px' }}>
                <h3 style={{ borderBottom: `2px solid ${corCabecalho}`, paddingBottom: '5px', color: corCabecalho, textTransform: 'uppercase', marginBottom: '10px' }}>
                    {titulo} ({dados.length})
                </h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                        <tr style={{ background: corCabecalho, color: 'white' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Matrícula</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Colaborador</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Tipo</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Período Aq.</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Saldo</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Início Gozo</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Fim Gozo</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dados.map((item, index) => (
                            <tr key={index} style={{ background: index % 2 === 0 ? '#fff' : '#F4F3EE', borderBottom: '1px solid #ddd' }}>
                                <td style={{ padding: '8px' }}>{item.matricula || 'S/N'}</td>
                                <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.nome_completo}</td>
                                <td style={{ padding: '8px' }}>{item.tipo_solicitacao}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{item.periodo_aquisitivo}</td>
                                <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#388E3C' }}>{item.saldo_calculado}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{formatarDataLocal(item.data_inicio)}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>{formatarDataLocal(item.data_fim)}</td>
                                <td style={{ padding: '8px', textAlign: 'center', color: corStatus, fontWeight: 'bold' }}>{item.status_relatorio}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="cadastro-container">
            <div className="page-header">
                <div className="header-title"><span className="icon"><Icon n="check"/></span><h2>Aprovação de Férias</h2></div>
                <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
            </div>

            <div className="form-card" style={{ animation: 'fadeIn 0.5s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                    <h3 style={{ color: '#388E3C', margin: 0 }}>Visão Gerencial de Férias</h3>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                        <div className="form-group" style={{ margin: 0, minWidth: '220px' }}>
                            <select className="form-control" value={lotacaoFiltro} onChange={e => setLotacaoFiltro(e.target.value)}>
                                <option value="Todos">Todas as lotações</option>
                                {escopoGlobal && <option value="SEDE"><Icon n="building"/> SEDE - GD (Implantadores)</option>}
                                {lotacoesDisponiveis.map(l => (
                                    <option key={l.id_projeto} value={l.id_projeto}>{l.nome_projeto}</option>
                                ))}
                            </select>
                        </div>
                        <button className="btn-tab" onClick={() => setMostrarConcluidas(prev => !prev)} style={{ background: mostrarConcluidas ? '#5A625B' : '#E3E2DA', color: mostrarConcluidas ? 'white' : '#555' }}>
                            {mostrarConcluidas ? 'Ocultar Concluídas/Recusadas' : 'Mostrar Concluídas/Recusadas'}
                        </button>
                        <button className="btn-tab" onClick={gerarRelatorioGeral} style={{ background: '#23302A', color: 'white' }}><Icon n="file"/> Relatório Geral</button>
                        <button className="btn-tab" onClick={gerarRelatorioPrazos} style={{ background: '#388E3C', color: 'white' }}>Relatório de Prazos</button>
                        <button className="btn-tab" onClick={() => carregarVisaoGerencial()}><Icon n="refresh"/> Atualizar</button>
                    </div>
                </div>

                <div className="table-responsive">
                    <table className="tabela-unidades" style={{ width: '100%' }}>
                        <thead><tr><th>Colaborador</th><th>Função</th><th>Data Solic.</th><th>Tipo</th><th>Início</th><th>Fim</th><th style={{ textAlign: 'center' }}>Status</th><th style={{ textAlign: 'center' }}>Ação</th></tr></thead>
                        <tbody>
                            {listaGestao.filter(req => {
                                if (req.status === 'RECUSADO') return mostrarConcluidas;
                                if (req.status !== 'APROVADO') return true;
                                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                                const dataFim = new Date(req.data_fim.split('T')[0] + 'T23:59:59');
                                const concluida = dataFim < hoje;
                                return mostrarConcluidas ? true : !concluida;
                            }).map(req => {
                                const liberado = podeEditar && podeAprovarFuncao(req.funcao);
                                return (
                                    <tr key={req.id_ferias} style={{ backgroundColor: getStatusColor(req.status) }}>
                                        <td style={{ fontWeight: 'bold' }}>{req.nome_completo}</td>
                                        <td>{req.funcao || '-'}</td>
                                        <td>{formatarDataLocal(req.data_solicitacao)}</td>
                                        <td>{req.tipo_solicitacao}</td>
                                        <td>{formatarDataLocal(req.data_inicio)}</td>
                                        <td>{formatarDataLocal(req.data_fim)}</td>
                                        <td style={{ textAlign: 'center' }}><span style={{ color: getStatusTextoColor(req.status), fontWeight: 'bold', border: `1px solid ${getStatusTextoColor(req.status)}`, padding: '2px 8px', borderRadius: '12px', background: 'white' }}>{formatarStatus(req.status)}</span></td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="btn-tab"
                                                onClick={() => abrirModalGestao(req)}
                                                disabled={!liberado}
                                                title={liberado ? 'Gerenciar' : 'Sua função não pode aprovar esta solicitação'}
                                                style={{ background: liberado ? '#388E3C' : '#A7ABA3', color: 'white', padding: '6px 12px', cursor: liberado ? 'pointer' : 'not-allowed' }}
                                            >
                                                <Icon n="settings"/> Gerenciar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {listaGestao.length === 0 && (
                                <tr><td colSpan="8" style={{ textAlign: 'center', color: '#999', padding: '20px' }}>Nenhuma solicitação encontrada para o filtro selecionado.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {modalAberto && (
                <div className="modal-overlay" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}>
                    <div className="modal-content" style={{ width: '700px', maxWidth: '90%', background: 'white', padding: '0', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)', overflow: 'hidden', animation: 'fadeIn 0.3s' }}>
                        <div style={{ background: '#2E7D32', color: 'white', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '500' }}>Gerenciar Solicitação de Férias</h3>
                            <button onClick={() => { setModalAberto(false); setAlertaCLT(null); setConflitos([]); }} style={{ background: 'transparent', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1' }}>×</button>
                        </div>
                        <div style={{ padding: '25px' }}>
                            {conflitos.length > 0 && (
                                <div style={{ backgroundColor: '#F6F1E6', color: '#7A5F2E', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #EADFC0' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Icon n="alert"/> Atenção: Conflito de Datas Detectado!</strong>
                                    <ul style={{ margin: '10px 0 0 20px', padding: 0, fontSize: '0.9rem' }}>
                                        {conflitos.map((c, idx) => (
                                            <li key={idx}><strong>{c.nome_completo}</strong> está de férias entre {formatarDataLocal(c.data_inicio)} e {formatarDataLocal(c.data_fim)} ({c.status})</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            {alertaCLT && (
                                <div style={{ backgroundColor: '#F6F1E6', color: '#7A5F2E', padding: '15px', borderRadius: '8px', marginBottom: '20px', border: '1px solid #EADFC0' }}>
                                    <strong style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Icon n="alert"/> Atenção: Prazo Legal (CLT Art. 134) Excedido!</strong>
                                    <div style={{ marginTop: '8px', fontSize: '0.9rem' }}>
                                        O período aquisitivo de <b>{alertaCLT.periodo}</b> (iniciado em {formatarDataLocal(alertaCLT.inicio_pa)}) deve ser concluído em até <b>1 ano e 11 meses</b>.<br />
                                        Data limite para o fim do gozo: <b>{formatarDataLocal(alertaCLT.data_limite)}</b>.
                                    </div>
                                </div>
                            )}
                            <div style={{ background: '#F1F0EA', padding: '15px', borderRadius: '8px', borderLeft: '5px solid #388E3C', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                    <label style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Colaborador</label>
                                    <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#333' }}>{formEdicao.nome_completo}</span>
                                </div>
                                <span style={{ fontSize: '0.85rem', color: '#388E3C', fontWeight: 'bold', background: '#E8F5E9', padding: '4px 12px', borderRadius: '12px' }}>{formEdicao.funcao}</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                                <div className="form-group"><label style={{ color: '#555', fontWeight: 'bold', fontSize: '0.9rem' }}>Período Aquisitivo</label><input type="number" className="form-control" style={{ fontSize: '1rem', padding: '8px' }} value={formEdicao.periodo_aquisitivo} onChange={e => setFormEdicao({ ...formEdicao, periodo_aquisitivo: e.target.value })} /></div>
                                <div className="form-group" style={{ gridColumn: '2 / 3' }}><label style={{ color: '#555', fontWeight: 'bold', fontSize: '0.9rem' }}>Tipo de Férias</label><select className="form-control" style={{ fontSize: '1rem', padding: '8px' }} value={formEdicao.tipo_id} onChange={e => setFormEdicao({ ...formEdicao, tipo_id: e.target.value })}>{opcoesFerias.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}</select></div>
                                <div className="form-group"><label style={{ color: '#2E7D32', fontWeight: 'bold', fontSize: '0.9rem' }}>Início do Gozo</label><input type="date" min="1900-01-01" max="2100-12-31" className="form-control" style={{ border: '2px solid #2E7D32', fontSize: '1rem', padding: '8px' }} value={formEdicao.data_inicio} onChange={e => setFormEdicao({ ...formEdicao, data_inicio: e.target.value })} /></div>
                                <div className="form-group"><label style={{ color: '#A23B36', fontWeight: 'bold', fontSize: '0.9rem' }}>Fim do Gozo</label><input type="date" min="1900-01-01" max="2100-12-31" className="form-control" style={{ background: '#fce4ec', border: '2px solid #A23B36', fontSize: '1rem', padding: '8px', color: '#A23B36', fontWeight: 'bold' }} value={formEdicao.data_fim} readOnly /></div>
                            </div>
                            <div className="form-group" style={{ textAlign: 'center', marginBottom: '10px' }}>
                                <label style={{ color: '#555', fontWeight: 'bold', fontSize: '0.9rem', display: 'block', marginBottom: '5px' }}>Status Atual</label>
                                <span style={{ display: 'inline-block', padding: '6px 15px', background: getStatusColor(formEdicao.status), color: getStatusTextoColor(formEdicao.status), fontWeight: 'bold', borderRadius: '20px', border: `1px solid ${getStatusTextoColor(formEdicao.status)}` }}>{formatarStatus(formEdicao.status).toUpperCase()}</span>
                            </div>
                        </div>
                        <div style={{ background: '#F4F3EE', padding: '15px 25px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #E3E2DA' }}>
                            <button className="btn-tab" onClick={(e) => gerarReciboJPG(e)} style={{ background: '#23302A', color: 'white', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 15px', fontSize: '0.9rem', cursor: 'pointer' }}><Icon n="camera"/> Gerar Recibo</button>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="btn-salvar" onClick={(e) => handleSalvarEdicao(e)} disabled={!podeEditar} style={{ background: '#388E3C', padding: '10px 15px', fontSize: '0.9rem', cursor: podeEditar ? 'pointer' : 'not-allowed', opacity: podeEditar ? 1 : 0.6 }}><Icon n="save"/> Salvar</button>
                                <button className="btn-salvar" onClick={(e) => handleStatus('APROVADO', e)} disabled={!podeAprovarFuncao(formEdicao.funcao) || !podeEditar} style={{ background: '#2E7D32', padding: '10px 15px', fontSize: '0.9rem', cursor: 'pointer', opacity: (podeAprovarFuncao(formEdicao.funcao) && podeEditar) ? 1 : 0.5 }}><Icon n="check"/> Aprovar</button>
                                <button className="btn-salvar" onClick={(e) => handleStatus('RECUSADO', e)} disabled={!podeAprovarFuncao(formEdicao.funcao) || !podeEditar} style={{ background: '#A23B36', padding: '10px 15px', fontSize: '0.9rem', cursor: 'pointer', opacity: (podeAprovarFuncao(formEdicao.funcao) && podeEditar) ? 1 : 0.5 }}><Icon n="x"/> Rejeitar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* RECIBO (oculto) */}
            <div ref={reciboRef} style={{ display: 'none', width: '800px', background: 'white', padding: '40px', fontFamily: 'Arial, sans-serif', color: '#333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '3px solid #2E7D32', paddingBottom: '15px', marginBottom: '30px' }}>
                    <img src={logo} alt="Logo" style={{ height: '60px' }} />
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ color: '#2E7D32', margin: 0, textTransform: 'uppercase' }}>Recibo de Férias</h2>
                        <span style={{ fontSize: '0.9rem', color: '#666' }}>Emitido em: {dataHoraGeracao}</span><br />
                        <span style={{ fontSize: '0.9rem', color: '#666' }}>Gerado por: {usuarioLogado.nome_completo || 'Sistema'}</span>
                    </div>
                </div>
                <div style={{ background: '#F4F3EE', padding: '20px', borderRadius: '8px', border: '1px solid #ddd', marginBottom: '30px' }}>
                    <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #ccc', paddingBottom: '5px', color: '#388E3C' }}>Dados do Colaborador</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.95rem' }}>
                        <div><strong>Nome:</strong> {formEdicao.nome_completo}</div>
                        <div><strong>CPF:</strong> {formEdicao.cpf}</div>
                        <div><strong>Data Nasc.:</strong> {formEdicao.data_nascimento}</div>
                        <div><strong>Matrícula:</strong> {formEdicao.matricula}</div>
                        <div><strong>Setor:</strong> {formEdicao.setor}</div>
                        <div><strong>Função:</strong> {formEdicao.funcao}</div>
                        <div><strong>Lotação:</strong> {formEdicao.nome_lotacao}</div>
                        <div><strong>Data de Admissão:</strong> {formatarDataLocal(formEdicao.data_admissao) || 'Não informada'}</div>
                        <div style={{ gridColumn: '1 / -1', marginTop: '10px', borderTop: '1px dashed #ccc', paddingTop: '10px' }}>
                            <strong>Data da Solicitação:</strong> {formatarDataLocal(formEdicao.data_solicitacao)}
                        </div>
                    </div>
                </div>
                <div style={{ background: '#E8F5E9', padding: '20px', borderRadius: '8px', border: '1px solid #C8E6C9', marginBottom: '40px' }}>
                    <h3 style={{ margin: '0 0 15px 0', borderBottom: '1px solid #A5D6A7', paddingBottom: '5px', color: '#2E7D32' }}>Detalhes das Férias</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                        <p><strong>Período Aquisitivo:</strong> {formEdicao.periodo_aquisitivo}</p>
                        <p><strong>Tipo:</strong> {formEdicao.tipo_label}</p>
                        <p><strong>Data de Início:</strong> {formatarDataLocal(formEdicao.data_inicio)}</p>
                        <p><strong>Data de Fim:</strong> {formatarDataLocal(formEdicao.data_fim)}</p>
                        <p><strong>Status Atual:</strong> {formEdicao.status}</p>
                    </div>
                </div>
                <div style={{ marginTop: '80px', display: 'flex', justifyContent: 'space-between' }}>
                    <div style={{ borderTop: '1px solid #000', width: '40%', textAlign: 'center', paddingTop: '5px' }}>Assinatura do Colaborador</div>
                    <div style={{ borderTop: '1px solid #000', width: '40%', textAlign: 'center', paddingTop: '5px' }}>Assinatura do Gestor</div>
                </div>
                <div style={{ marginTop: '50px', textAlign: 'center', fontSize: '0.8rem', color: '#999' }}>Opera Echo Management System - Documento gerado eletronicamente.</div>
            </div>

            {/* RELATÓRIO GERAL (oculto) */}
            <div ref={relatorioGeralRef} style={{ display: 'none', width: '1100px', padding: '40px', background: 'white', fontFamily: 'Arial, sans-serif', color: '#333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #2E7D32', paddingBottom: '20px', marginBottom: '30px' }}>
                    <img src={logo} alt="Opera Echo" style={{ height: '70px' }} />
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, color: '#2E7D32', textTransform: 'uppercase' }}>Relatório Geral de Férias - {new Date().getFullYear() - 1}/{new Date().getFullYear()}</h2>
                        <span style={{ fontSize: '0.9rem', color: '#555' }}>Gerado por: {usuarioLogado.nome_completo || 'Sistema'}</span><br />
                        <span style={{ fontSize: '0.9rem', color: '#555' }}>Em: {dataHoraGeracao}</span>
                    </div>
                </div>
                <TabelaRelatorio titulo="Concluídas (Férias já gozadas)" dados={relatorioCategorias.concluidas} corCabecalho="#5A625B" corStatus="#5A625B" />
                <TabelaRelatorio titulo="Aprovadas (Férias a gozar ou em curso)" dados={relatorioCategorias.aprovadas} corCabecalho="#2E7D32" corStatus="#2E7D32" />
                <TabelaRelatorio titulo="Pendentes (Aguardando análise)" dados={relatorioCategorias.pendentes} corCabecalho="#9C7A3C" corStatus="#9C7A3C" />
                <div style={{ marginTop: '40px', borderTop: '1px solid #ccc', paddingTop: '10px', fontSize: '0.8rem', textAlign: 'center', color: '#777' }}>Opera Echo Management System | Relatório Confidencial</div>
            </div>

            {/* RELATÓRIO DE PRAZOS (oculto) */}
            <div ref={relatorioPrazosRef} style={{ display: 'none', width: '1200px', padding: '40px', background: 'white', fontFamily: 'Arial, sans-serif', color: '#333' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '4px solid #388E3C', paddingBottom: '20px', marginBottom: '30px' }}>
                    <img src={logo} alt="Opera Echo" style={{ height: '70px' }} />
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, color: '#388E3C', textTransform: 'uppercase' }}>Relatório de Prazos Legais - Férias</h2>
                        <span style={{ fontSize: '0.85rem', color: '#555' }}>Implantadores Ativos | CLT Art. 134 (1 ano e 11 meses)</span><br />
                        <span style={{ fontSize: '0.85rem', color: '#555' }}>Gerado por: {usuarioLogado.nome_completo || 'Sistema'}</span><br />
                        <span style={{ fontSize: '0.85rem', color: '#555' }}>Em: {dataHoraGeracao}</span>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '15px', marginBottom: '25px', fontSize: '0.85rem' }}>
                    <div style={{ flex: 1, padding: '10px 15px', background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: '6px' }}>
                        <strong style={{ color: '#2E7D32' }}>● No Prazo:</strong> mais de 90 dias até o limite legal
                    </div>
                    <div style={{ flex: 1, padding: '10px 15px', background: '#F6F1E6', border: '1px solid #E6D6AC', borderRadius: '6px' }}>
                        <strong style={{ color: '#9C7A3C' }}>● Próximo do Limite:</strong> 90 dias ou menos
                    </div>
                    <div style={{ flex: 1, padding: '10px 15px', background: '#F6E9E7', border: '1px solid #F0D9D6', borderRadius: '6px' }}>
                        <strong style={{ color: '#A23B36' }}>● Vencido:</strong> prazo legal ultrapassado
                    </div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#388E3C', color: 'white' }}>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Matrícula</th>
                            <th style={{ padding: '8px', textAlign: 'left' }}>Colaborador</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Admissão</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Período Aq.</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Início PA</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Data Limite</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Dias Gozados</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Em Análise</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Saldo</th>
                            <th style={{ padding: '8px', textAlign: 'center' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {relatorioPrazos.map((item, index) => {
                            const corFundo = item.status_prazo === 'VENCIDO' ? '#F6E9E7' : item.status_prazo === 'PROXIMO_LIMITE' ? '#F6F1E6' : (index % 2 === 0 ? '#fff' : '#F4F3EE');
                            const corStatus = item.status_prazo === 'VENCIDO' ? '#A23B36' : item.status_prazo === 'PROXIMO_LIMITE' ? '#9C7A3C' : '#2E7D32';
                            const labelStatus = item.status_prazo === 'VENCIDO' ? 'VENCIDO' : item.status_prazo === 'PROXIMO_LIMITE' ? 'PRÓXIMO DO LIMITE' : 'NO PRAZO';
                            return (
                                <tr key={index} style={{ background: corFundo, borderBottom: '1px solid #ddd' }}>
                                    <td style={{ padding: '8px' }}>{item.matricula || 'S/N'}</td>
                                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{item.nome_completo}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{formatarDataLocal(item.data_admissao)}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{item.periodo_aquisitivo}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{formatarDataLocal(item.inicio_pa)}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: corStatus }}>{formatarDataLocal(item.data_limite)}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>{item.dias_gozados}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: (item.dias_em_analise || 0) > 0 ? '#9C7A3C' : '#999' }}>{item.dias_em_analise || 0}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#388E3C' }}>{item.saldo_restante}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: 'bold', color: corStatus }}>{labelStatus}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div style={{ marginTop: '40px', borderTop: '1px solid #ccc', paddingTop: '10px', fontSize: '0.8rem', textAlign: 'center', color: '#777' }}>Opera Echo Management System | Relatório Confidencial</div>
            </div>
        </div>
    );
}