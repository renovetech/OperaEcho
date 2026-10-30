import Icon from './components/Icon';
/* ARQUIVO: src/LancamentoHoraExtra.js */
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useEffect, useMemo, useRef, useState } from 'react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import api from './api';
import './LancamentoHoraExtra.css';
import logo from './logo.png';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

/* ===== TABELAS CLT (ESTIMATIVA - vigência 2026; ajuste aqui quando mudarem) ===== */
// INSS progressivo 2026 (Portaria Interministerial MPS/MF nº 13/2026).
// Salário mínimo R$ 1.621,00 · teto R$ 8.475,55 · desconto máximo R$ 988,09.
// Cada faixa incide só sobre a parcela dentro dela.
const INSS_FAIXAS = [
    { ate: 1621.00, aliq: 0.075 },
    { ate: 2902.84, aliq: 0.09 },
    { ate: 4354.27, aliq: 0.12 },
    { ate: 8475.55, aliq: 0.14 }, // teto (desconto máx. R$ 988,09)
];
// IRRF mensal 2026 - Tabela Progressiva (Lei 15.191/2025). NÃO foi alterada pela 15.270.
const IRRF_FAIXAS = [
    { ate: 2428.80, aliq: 0.0,   deduz: 0.0 },
    { ate: 2826.65, aliq: 0.075, deduz: 182.16 },
    { ate: 3751.05, aliq: 0.15,  deduz: 394.16 },
    { ate: 4664.68, aliq: 0.225, deduz: 675.49 },
    { ate: Infinity, aliq: 0.275, deduz: 908.73 },
];
const IRRF_DEDUCAO_DEPENDENTE = 189.59;
const IRRF_DESCONTO_SIMPLIFICADO = 607.20; // opção que substitui as deduções legais (25% da faixa isenta)
const VT_ALIQUOTA = 0.06; // 6% do salário-base

const calcularINSS = (base) => {
    if (base <= 0) return 0;
    let inss = 0, anterior = 0;
    for (const f of INSS_FAIXAS) {
        if (base > anterior) {
            inss += (Math.min(base, f.ate) - anterior) * f.aliq;
            anterior = f.ate;
        } else break;
    }
    return inss; // acima do teto, mantém o valor da última faixa
};

// Redutor da Lei 15.270/2025 (vigência 01/01/2026): isenta rendimentos até R$ 5.000
// e reduz gradualmente até R$ 7.350. redução = min(312,89 ; 978,62 − 0,133145 × rend).
const irrfRedutor = (rendimentos) => {
    if (rendimentos > 7350) return 0;
    return Math.min(312.89, Math.max(0, 978.62 - 0.133145 * rendimentos));
};

// IRRF final estimado = imposto da tabela progressiva − redutor da nova lei (nunca negativo).
// 'rendimentos' = rendimentos tributáveis do mês (bruto). A base usa a maior dedução
// entre (INSS + dependentes) e o desconto simplificado.
const calcularIRRF = (rendimentos, inss, dependentes) => {
    if (rendimentos <= 0) return 0;
    const descLegal = inss + (dependentes * IRRF_DEDUCAO_DEPENDENTE);
    const base = Math.max(0, rendimentos - Math.max(descLegal, IRRF_DESCONTO_SIMPLIFICADO));
    const faixa = IRRF_FAIXAS.find(f => base <= f.ate) || IRRF_FAIXAS[IRRF_FAIXAS.length - 1];
    const impostoTabela = Math.max(0, base * faixa.aliq - faixa.deduz);
    const reducao = Math.min(impostoTabela, irrfRedutor(rendimentos));
    return Math.max(0, impostoTabela - reducao);
};


export default function LancamentoHoraExtra({ aoVoltar, lotacaoFixa, apiBase = '', moduloAcesso, permissaoNovo, permissaoEditar }) {
    const [modoLista, setModoLista] = useState(true); 
    const [mesAno, setMesAno] = useState(new Date().toISOString().slice(0, 7)); 
    const [colaboradores, setColaboradores] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [unidades, setUnidades] = useState([]);
    // Catálogo ACUMULADO de unidades de todos os projetos visitados no mês.
    // Chave = id_unidade -> { nome_unidade, id_projeto }. Garante que trocar de
    // projeto no topo NUNCA "apague" os dias já marcados de outro projeto.
    const [catUnidades, setCatUnidades] = useState({});
    const [historicoLancamentos, setHistoricoLancamentos] = useState([]); 
    
    // Controle de Edição e Permissões
    const [idLancamentoAtual, setIdLancamentoAtual] = useState(null); 
    
    // Estado para guardar as permissões reais do banco
    const [permissoesModulo, setPermissoesModulo] = useState({
        pode_novo: false,
        pode_editar: false
    });

    const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
    const [projetoSelecionado, setProjetoSelecionado] = useState('');
    const [unidadeSelecionada, setUnidadeSelecionada] = useState('');
    
    const [configJornada, setConfigJornada] = useState({
        entrada: '08:00',
        saida: '17:00',
        intervalo: '01:00',
        cargaDiaria: 8,
        cargaMensalPadrao: 200 
    });

    // Estado da Calculadora CLT com formatação string (00:00)
    const [calcHE, setCalcHE] = useState({
        salario: '',
        cargaHoraria: '200',
        horas50: '00:00',
        horas100: '00:00',
        horasNoturnas: '00:00',
        diasUteis: '25',
        diasDsr: '5',
        dependentes: '0'
    });

    useEffect(() => {
        const savedConfig = localStorage.getItem('configJornada');
        if (savedConfig) setConfigJornada(JSON.parse(savedConfig));
    }, []);

    useEffect(() => {
        localStorage.setItem('configJornada', JSON.stringify(configJornada));
    }, [configJornada]);

    const [linhas, setLinhas] = useState([]);
    const [rangeUnidade, setRangeUnidade] = useState({ de: '', ate: '', id: '' });
    const exportRef = useRef();

    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario_opera')) || {};
    const isAdminOrGestor = ['Administrador', 'Gestor'].includes(usuarioLogado.perfil_acesso);

    useEffect(() => {
        carregarAuxiliares();
        carregarHistorico(); 
        buscarPermissoesReais(); 
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

    // Modo Projetos: permissões resolvidas pelo componente pai (módulo proj_*).
    useEffect(() => {
        if (typeof permissaoNovo === 'boolean' || typeof permissaoEditar === 'boolean') {
            setPermissoesModulo({ pode_novo: !!permissaoNovo, pode_editar: !!permissaoEditar });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissaoNovo, permissaoEditar]);

    const buscarPermissoesReais = async () => {
        // Em modo Projetos as permissões vêm por props; não sobrescreve.
        if (typeof permissaoNovo === 'boolean' || typeof permissaoEditar === 'boolean') {
            setPermissoesModulo({ pode_novo: !!permissaoNovo, pode_editar: !!permissaoEditar });
            return;
        }
        if (isAdminOrGestor) {
            setPermissoesModulo({ pode_novo: true, pode_editar: true });
            return;
        }
        try {
            const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
            const regraHE = res.data.find(r => r.nome_modulo === (moduloAcesso || 'hora_extra'));
            if (regraHE) {
                setPermissoesModulo({
                    pode_novo: regraHE.pode_novo,   
                    pode_editar: regraHE.pode_editar 
                });
            } else {
                setPermissoesModulo({ pode_novo: false, pode_editar: false });
            }
        } catch (error) {
            console.error("Erro ao buscar permissões:", error);
        }
    };

    useEffect(() => {
        if (!modoLista && usuarioSelecionado && mesAno && !idLancamentoAtual) {
            gerarGradeDias();
        }
        
        if (modoLista) {
            setCalcHE(prev => ({ ...prev, salario: '' }));
        }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesAno, usuarioSelecionado, modoLista, idLancamentoAtual]);

    const carregarAuxiliares = async () => {
        try {
            const [resProj, resUsers] = await Promise.all([
                api.get('/projetos'),
                api.get(lotacaoFixa ? `/implantadores?id_projeto=${lotacaoFixa}` : '/implantadores') 
            ]);
            const _lp = resProj.data.filter(p => p.ativo);
            setProjetos(lotacaoFixa ? _lp.filter(p => String(p.id_projeto) === String(lotacaoFixa)) : _lp);
            setColaboradores(resUsers.data); 
            if (!isAdminOrGestor) setUsuarioSelecionado(usuarioLogado.id_usuario); 
        } catch (e) { console.error(e); }
    };

    const carregarHistorico = async () => {
        try {
            const params = new URLSearchParams();
            params.append('perfil', usuarioLogado.perfil_acesso);
            if (!isAdminOrGestor) params.append('id_usuario', usuarioLogado.id_usuario);
            
            const res = await api.get(`${apiBase}/hora-extra/buscar?${params.toString()}`);
            
            // ORDENAÇÃO: Mais recente primeiro. Desempate por ordem alfabética.
            const historicoOrdenado = res.data.sort((a, b) => {
                if (a.mes_referencia > b.mes_referencia) return -1;
                if (a.mes_referencia < b.mes_referencia) return 1;
                return (a.colaborador || '').localeCompare(b.colaborador || '');
            });

            setHistoricoLancamentos(historicoOrdenado);
        } catch (error) {
            console.error("Erro histórico:", error);
            setHistoricoLancamentos([]);
        }
    };

    const calcularStatusVisual = (item) => {
        if (item.status === 'PAGO' || item.status === 'RECUSADO') return item.status;
        if (item.status === 'PENDENTE') {
            const [anoRef, mesRef] = item.mes_referencia.split('-').map(Number);
            const dataPagamento = new Date(anoRef, (mesRef - 1) + 2, 5);
            const hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            dataPagamento.setHours(0, 0, 0, 0);
            if (hoje >= dataPagamento) return 'PAGO';
        }
        return item.status;
    };

    const handleVerLancamento = async (lancamento) => {
        if (!permissoesModulo.pode_editar && !isAdminOrGestor) return;
        
        try {
            Swal.fire({ title: 'Carregando...', didOpen: () => Swal.showLoading() });
            
            const res = await api.get(`${apiBase}/hora-extra/detalhes/${lancamento.id_lancamento}`);
            const dadosCompletos = res.data;

            setIdLancamentoAtual(lancamento.id_lancamento);
            setMesAno(lancamento.mes_referencia);
            setUsuarioSelecionado(lancamento.id_usuario);
            
            setCalcHE(prev => ({ ...prev, salario: '' }));

            const detalhes = dadosCompletos.detalhes || [];

            // Descobre todos os projetos presentes nos dias (+ o principal do cabeçalho)
            // e carrega as unidades de cada um para o catálogo, para nada "apagar".
            const projetosDoMes = new Set(detalhes.map(d => d.id_projeto).filter(Boolean).map(Number));
            if (lancamento.id_projeto) projetosDoMes.add(parseInt(lancamento.id_projeto));
            for (const idp of projetosDoMes) {
                try {
                    const r = await api.get(`/unidades/buscar?projeto=${idp}&status=true&limite=1000`);
                    mergeCatalogo(r.data.dados || r.data, idp);
                } catch (e) { /* segue mesmo se um projeto falhar */ }
            }

            if (lancamento.id_projeto) {
                const idProj = parseInt(lancamento.id_projeto);
                setProjetoSelecionado(idProj);
                try {
                    const resUnidades = await api.get(`/unidades/buscar?projeto=${idProj}&status=true&limite=1000`);
                    setUnidades(resUnidades.data.dados || resUnidades.data);
                } catch (e) { /* catálogo já cobre a exibição */ }
                if (lancamento.id_unidade) setUnidadeSelecionada(parseInt(lancamento.id_unidade));
            } else {
                setProjetoSelecionado('');
                setUnidadeSelecionada('');
            }

            if (detalhes.length > 0) {
                const linhasMapeadas = detalhes.map(d => {
                    const [anoRef, mesRef] = lancamento.mes_referencia.split('-').map(Number);
                    const dataObj = new Date(anoRef, mesRef - 1, d.dia_numero);
                    
                    const diaSemana = dataObj.getDay();
                    const isFDS = diaSemana === 0 || diaSemana === 6; 
                    
                    const calculos = calcularLinha(dataObj, d.entrada, d.saida, d.intervalo, d.is_feriado, d.is_folga);
                    
                    return {
                        dia: d.dia_numero, 
                        dataObj: dataObj, 
                        diaSemanaStr: DIAS_SEMANA[diaSemana],
                        isFeriado: d.is_feriado, 
                        isFolga: d.is_folga, 
                        isFDS: isFDS, 
                        entrada: d.entrada, 
                        saida: d.saida, 
                        intervalo: d.intervalo, 
                        id_unidade: d.id_unidade ?? null, 
                        id_projeto: d.id_projeto ?? (lancamento.id_projeto ? parseInt(lancamento.id_projeto) : null), 
                        ...calculos
                    };
                });
                setLinhas(linhasMapeadas);
            } else {
                gerarGradeDias();
            }

            setModoLista(false);
            Swal.close();
        } catch (error) {
            console.error(error); Swal.fire('Erro', 'Não foi possível carregar os detalhes.', 'error');
        }
    };

    const handleNovoLancamento = () => {
        if (!permissoesModulo.pode_novo) return;

        setIdLancamentoAtual(null); 
        setModoLista(false);
        setMesAno(new Date().toISOString().slice(0, 7));
        setProjetoSelecionado('');
        setUnidadeSelecionada('');
        setLinhas([]); 
        
        setCalcHE(prev => ({ ...prev, salario: '' }));
        
        if(isAdminOrGestor) setUsuarioSelecionado(''); 
        else setUsuarioSelecionado(usuarioLogado.id_usuario);
    };

    const handleExcluir = async (id, e) => {
        if (e) e.stopPropagation();
        if (!permissoesModulo.pode_editar) return;

        const result = await Swal.fire({
            title: 'Tem certeza?', text: "Essa ação não pode ser desfeita!", icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3A5D50', confirmButtonText: 'Sim, excluir!'
        });

        if (result.isConfirmed) {
            try {
                await api.delete(`${apiBase}/hora-extra/${id}`);
                Swal.fire('Excluído!', 'O registro foi apagado.', 'success');
                carregarHistorico();
                if (!modoLista) setModoLista(true);
            } catch (error) { Swal.fire('Erro', 'Erro ao excluir.', 'error'); }
        }
    };

    useEffect(() => {
        if (lotacaoFixa && projetos.length > 0 && String(projetoSelecionado) !== String(lotacaoFixa)) {
            handleProjetoChange(String(lotacaoFixa));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lotacaoFixa, projetos]);

    const handleProjetoChange = async (idProjeto) => {
        const id = parseInt(idProjeto);
        setProjetoSelecionado(id);
        setUnidadeSelecionada('');
        setRangeUnidade(prev => ({ ...prev, id: '' }));
        if(id) {
            try {
                const res = await api.get(`/unidades/buscar?projeto=${id}&status=true&limite=1000`);
                const lista = res.data.dados || res.data;
                setUnidades(lista);
                mergeCatalogo(lista, id);
            } catch (e) { setUnidades([]); }
        } else { setUnidades([]); }
    };

    // Acumula unidades no catálogo sem perder as de projetos anteriores
    const mergeCatalogo = (lista, idProjeto) => {
        setCatUnidades(prev => {
            const novo = { ...prev };
            (lista || []).forEach(u => {
                novo[u.id_unidade] = { nome_unidade: u.nome_unidade, id_projeto: idProjeto ?? u.id_projeto ?? null };
            });
            return novo;
        });
    };

    const timeToMin = (time) => { if (!time) return 0; const [h, m] = time.split(':').map(Number); return h * 60 + m; };
    const minToTime = (min) => { const h = Math.floor(min / 60); const m = Math.round(min % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };

    // --- NOVA REGRA MATEMÁTICA CORRIGIDA: VIRADA DE NOITE PARA DOMINGO E ABATIMENTO DE INTERVALO ---
    const calcularLinha = (dia, entrada, saida, intervalo, isFeriado, isFolga) => {
        if (isFolga) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: 'FOLGA' };
        if (!entrada || !saida || entrada.length < 5 || saida.length < 5) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: '' };
        
        let mEntrada = timeToMin(entrada); let mSaida = timeToMin(saida); const mIntervalo = timeToMin(intervalo);
        if (mSaida < mEntrada) mSaida += 1440; 
        let totalMinutos = mSaida - mEntrada - mIntervalo; if (totalMinutos < 0) totalMinutos = 0;
        
        let minutosNoturnos = 0; const inicioNoturno = 1320; const fimNoturno = 1740; 
        const startOverlap = Math.max(mEntrada, inicioNoturno); const endOverlap = Math.min(mSaida, fimNoturno);
        if (startOverlap < endOverlap) minutosNoturnos = endOverlap - startOverlap;
        if (mEntrada < 300) { const fimMadrugada = Math.min(mSaida, 300); if (mEntrada < fimMadrugada) minutosNoturnos += (fimMadrugada - mEntrada); }
        
        let he50 = 0; let he100 = 0; 
        const diaSemana = dia.getDay();
        let isVirada = mSaida > 1440;
        let diaSemana2 = (diaSemana + 1) % 7; 

        // NOVA LÓGICA: ABATER O INTERVALO DO MAIOR PERÍODO PARA EVITAR HORAS QUEBRADAS
        let efetivoDia1 = totalMinutos;
        let efetivoDia2 = 0;
        if (isVirada) {
            let minDia1 = 1440 - mEntrada;
            let minDia2 = mSaida - 1440;
            
            if (minDia1 >= minDia2) {
                efetivoDia1 = minDia1 - mIntervalo;
                efetivoDia2 = minDia2;
            } else {
                efetivoDia1 = minDia1;
                efetivoDia2 = minDia2 - mIntervalo;
            }
            
            if (efetivoDia1 < 0) { efetivoDia2 += efetivoDia1; efetivoDia1 = 0; }
            if (efetivoDia2 < 0) { efetivoDia1 += efetivoDia2; efetivoDia2 = 0; }
        }

        const addHE = (mins, dSem, isFer) => {
            if (dSem === 0 || isFer) he100 += mins;
            else he50 += mins;
        };

        if (diaSemana === 0 || isFeriado || diaSemana === 6) {
            addHE(efetivoDia1, diaSemana, isFeriado);
            if (efetivoDia2 > 0) addHE(efetivoDia2, diaSemana2, false);
        } else {
            const padraoEntrada = timeToMin(configJornada.entrada); 
            const padraoSaida = timeToMin(configJornada.saida); 
            const padraoIntervalo = timeToMin(configJornada.intervalo); 
            const jornadaPadraoMin = (padraoSaida - padraoEntrada) - padraoIntervalo; 
            
            if (totalMinutos > jornadaPadraoMin) { 
                let totalExcedente = totalMinutos - jornadaPadraoMin;
                if (isVirada && diaSemana === 5) {
                    let heNoSabado = Math.min(totalExcedente, efetivoDia2);
                    let heNaSexta = totalExcedente - heNoSabado;
                    addHE(heNaSexta, diaSemana, isFeriado);
                    addHE(heNoSabado, diaSemana2, false);
                } else {
                    addHE(totalExcedente, diaSemana, isFeriado);
                }
            }
        }

        return { horasEfetivas: totalMinutos, he50: he50, he100: he100, adNoturno: minutosNoturnos, displayEfetivas: minToTime(totalMinutos) };
    };

    const gerarGradeDias = () => {
        const [ano, mes] = mesAno.split('-').map(Number);
        const diasNoMes = new Date(ano, mes, 0).getDate();
        const novaLista = [];
        for (let i = 1; i <= diasNoMes; i++) {
            const dataObj = new Date(ano, mes - 1, i);
            const diaSemana = dataObj.getDay(); 

            const isFDS = diaSemana === 0 || diaSemana === 6;
            const isFolga = isFDS; 

            let _entrada = '';
            let _saida = '';
            let _intervalo = '';

            if (!isFolga) { 
                _entrada = configJornada.entrada; 
                _saida = configJornada.saida; 
                _intervalo = configJornada.intervalo; 
            }
            
            const calculos = calcularLinha(dataObj, _entrada, _saida, _intervalo, false, isFolga);
            
            novaLista.push({ 
                dia: i, 
                dataObj: dataObj, 
                diaSemanaStr: DIAS_SEMANA[diaSemana], 
                isFeriado: false, 
                isFolga: isFolga, 
                isFDS: isFDS, 
                entrada: _entrada, 
                saida: _saida, 
                intervalo: _intervalo, 
                id_unidade: unidadeSelecionada ? parseInt(unidadeSelecionada) : null, 
                id_projeto: projetoSelecionado ? parseInt(projetoSelecionado) : null, 
                ...calculos 
            });
        }
        setLinhas(novaLista);
    };

    const atualizarLinha = (index, campo, valor) => {
        setLinhas(prev => {
            const novaLista = [...prev];
            const item = { ...novaLista[index], [campo]: valor };
            if (['entrada', 'saida', 'intervalo', 'isFeriado', 'isFolga'].includes(campo)) {
                if (campo === 'isFolga' && valor === true) {
                      item.entrada = ''; item.saida = ''; item.intervalo = '';
                } 
                const calculos = calcularLinha(item.dataObj, item.entrada, item.saida, item.intervalo, item.isFeriado, item.isFolga);
                Object.assign(item, calculos);
            }
            novaLista[index] = item;
            return novaLista;
        });
    };

    const totais = useMemo(() => {
        return linhas.reduce((acc, curr) => ({
            he50: acc.he50 + curr.he50, he100: acc.he100 + curr.he100, adNoturno: acc.adNoturno + curr.adNoturno, horasEfetivas: acc.horasEfetivas + curr.horasEfetivas
        }), { he50: 0, he100: 0, adNoturno: 0, horasEfetivas: 0 });
    }, [linhas]);

    // Quebra das horas extras POR UNIDADE (guarda também o projeto). Só entram dias que geraram HE.
    const totaisPorUnidade = useMemo(() => {
        const map = {};
        for (const l of linhas) {
            if (!l.he50 && !l.he100 && !l.adNoturno) continue;
            const key = l.id_unidade || 'SEM';
            if (!map[key]) map[key] = { id_unidade: l.id_unidade || null, id_projeto: l.id_projeto || null, he50: 0, he100: 0, adNoturno: 0 };
            map[key].he50 += l.he50; map[key].he100 += l.he100; map[key].adNoturno += l.adNoturno;
        }
        return Object.values(map).sort((a, b) => (b.he50 + b.he100 + b.adNoturno) - (a.he50 + a.he100 + a.adNoturno));
    }, [linhas]);

    // Nomes que resolvem SEMPRE (catálogo acumulado primeiro, depois lista atual)
    const nomeUnidadePorId = (id) => {
        if (!id) return 'Sem unidade';
        return catUnidades[id]?.nome_unidade
            || unidades.find(u => String(u.id_unidade) === String(id))?.nome_unidade
            || `Unidade ${id}`;
    };
    const nomeProjetoPorId = (id) => {
        if (!id) return 'Sem projeto';
        return projetos.find(p => String(p.id_projeto) === String(id))?.nome_projeto || `Projeto ${id}`;
    };

    // Unidades do catálogo agrupadas por projeto (para o seletor por dia com optgroup)
    const catAgrupado = useMemo(() => {
        const g = {};
        Object.entries(catUnidades).forEach(([idU, info]) => {
            const p = info.id_projeto || 'SEM';
            (g[p] = g[p] || []).push({ id_unidade: Number(idU), nome_unidade: info.nome_unidade });
        });
        return g;
    }, [catUnidades]);

    // Define unidade de UM dia via seletor da linha (deriva o projeto pelo catálogo)
    const setUnidadeLinha = (idx, idUni) => {
        const id = idUni ? parseInt(idUni) : null;
        const idProj = id ? (catUnidades[id]?.id_projeto ?? null) : null;
        setLinhas(prev => {
            const nova = [...prev];
            nova[idx] = { ...nova[idx], id_unidade: id, id_projeto: idProj };
            return nova;
        });
    };

    // Unidade padrão do topo: preenche apenas dias úteis SEM unidade (não sobrescreve escolha manual)
    const aplicarUnidadePadrao = (idUni) => {
        setUnidadeSelecionada(idUni);
        const id = idUni ? parseInt(idUni) : null;
        const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
        setLinhas(prev => prev.map(l => (l.isFolga || l.id_unidade) ? l : { ...l, id_unidade: id, id_projeto: idProj }));
    };

    // Força a unidade padrão em TODOS os dias úteis (sobrescreve)
    const aplicarUnidadeTodos = () => {
        const id = unidadeSelecionada ? parseInt(unidadeSelecionada) : null;
        const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
        setLinhas(prev => prev.map(l => l.isFolga ? l : { ...l, id_unidade: id, id_projeto: idProj }));
    };

    // Atribui projeto+unidade a um intervalo de dias, usando o que está selecionado no topo.
    // (Ex.: dias 1-15 no Projeto A/Unidade X, dias 16-31 no Projeto B/Unidade Y.)
    const aplicarUnidadeIntervalo = () => {
        const de = parseInt(rangeUnidade.de), ate = parseInt(rangeUnidade.ate);
        const id = rangeUnidade.id ? parseInt(rangeUnidade.id) : null;
        const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
        if (!de || !ate || de > ate) return Swal.fire('Atenção', 'Informe um intervalo de dias válido (De ≤ Até).', 'warning');
        if (!id) return Swal.fire('Atenção', 'Selecione a unidade para aplicar no período.', 'warning');
        setLinhas(prev => prev.map(l => (l.dia >= de && l.dia <= ate && !l.isFolga) ? { ...l, id_unidade: id, id_projeto: idProj } : l));
    };

    useEffect(() => {
        setCalcHE(prev => ({
            ...prev,
            horas50: minToTime(totais.he50),
            horas100: minToTime(totais.he100),
            horasNoturnas: minToTime(totais.adNoturno)
        }));
    }, [totais]);

    const handleSalvar = async () => {
        if (!usuarioSelecionado || !projetoSelecionado) return Swal.fire('Atenção', 'Selecione o Colaborador e o Projeto.', 'warning');
        
        if (idLancamentoAtual && !permissoesModulo.pode_editar) return Swal.fire('Erro', 'Sem permissão para editar.', 'error');
        if (!idLancamentoAtual && !permissoesModulo.pode_novo) return Swal.fire('Erro', 'Sem permissão para criar.', 'error');

        // Avisa se houver dia com hora extra sem unidade atribuída
        const semUnidade = linhas.some(l => (l.he50 || l.he100 || l.adNoturno) && !l.id_unidade);
        if (semUnidade) {
            const r = await Swal.fire({
                title: 'Dias sem unidade',
                text: 'Há dias com hora extra sem unidade atribuída. Deseja salvar mesmo assim?',
                icon: 'warning', showCancelButton: true,
                confirmButtonText: 'Salvar assim mesmo', cancelButtonText: 'Voltar e ajustar'
            });
            if (!r.isConfirmed) return;
        }

        // Cabeçalho guarda o projeto/unidade PRINCIPAL (o de mais horas), como referência
        const principal = totaisPorUnidade[0] || null;
        const idUnidadePrincipal = principal?.id_unidade || (unidadeSelecionada ? parseInt(unidadeSelecionada) : null);
        const idProjetoPrincipal = principal?.id_projeto || (projetoSelecionado ? parseInt(projetoSelecionado) : null);

        const payload = {
            id_lancamento: idLancamentoAtual,
            id_usuario: parseInt(usuarioSelecionado), 
            id_projeto: idProjetoPrincipal, 
            id_unidade: idUnidadePrincipal,
            mes_referencia: mesAno, 
            detalhes_dias: linhas, 
            totais: totais
        };
        
        Swal.fire({ title: 'Salvando...', didOpen: () => Swal.showLoading() });
        try {
            await api.post(`${apiBase}/hora-extra/salvar`, payload);
            Swal.fire('Sucesso!', 'Lançamento salvo.', 'success');
            setModoLista(true); carregarHistorico();
        } catch (error) {
            console.error(error); Swal.fire('Erro', 'Erro ao salvar.', 'error');
        }
    };

    const formatarHoraInput = (valor) => {
        let v = valor.replace(/\D/g, ''); 
        if (v.length > 5) v = v.substring(0, 5); 
        if (v.length > 2) {
            v = v.substring(0, v.length - 2) + ':' + v.substring(v.length - 2);
        }
        return v;
    };

    const handleSalarioChange = (e) => {
        let value = e.target.value.replace(/\D/g, ''); 
        if (value === '') { 
            setCalcHE({...calcHE, salario: ''}); 
            return; 
        }
        value = (parseInt(value, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        setCalcHE({...calcHE, salario: value});
    };

    const timeStrToDecimal = (timeStr) => {
        if (!timeStr) return 0;
        let h = 0, m = 0;
        if (timeStr.includes(':')) {
            const parts = timeStr.split(':');
            h = Number(parts[0]) || 0;
            m = Number(parts[1]) || 0;
        } else {
            h = Number(timeStr) || 0;
        }
        return h + (m / 60);
    };

    const resultadosCalc = useMemo(() => {
        const salStr = calcHE.salario.replace(/\./g, '').replace(',', '.');
        const sal = parseFloat(salStr) || 0;
        const ch = parseFloat(calcHE.cargaHoraria) || 220;
        
        const h50 = timeStrToDecimal(calcHE.horas50);
        const h100 = timeStrToDecimal(calcHE.horas100);
        const hNoturnas = timeStrToDecimal(calcHE.horasNoturnas);
        
        const du = parseFloat(calcHE.diasUteis) || 25;
        const dsr = parseFloat(calcHE.diasDsr) || 5;

        const horaBase = ch > 0 ? sal / ch : 0;
        const valorHE50 = horaBase * 1.5 * h50;
        const valorHE100 = horaBase * 2.0 * h100;
        const valorNoturno = horaBase * 1.5 * 0.3 * hNoturnas; 
        
        const totalExtras = valorHE50 + valorHE100 + valorNoturno;
        const valorDSR = du > 0 ? (totalExtras / du) * dsr : 0;
        
        const totalReceber = sal + totalExtras + valorDSR;

        // ---- Descontos estimados (CLT) ----
        const dependentes = parseInt(calcHE.dependentes) || 0;
        const baseBruta = totalReceber;                 // salário + HE + DSR
        const inss = calcularINSS(baseBruta);
        const vt = sal * VT_ALIQUOTA;                   // 6% do salário-base
        const irrf = calcularIRRF(baseBruta, inss, dependentes);
        const totalDescontos = inss + vt + irrf;
        const liquido = baseBruta - totalDescontos;

        const formatarMoeda = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        return {
            horaBase: formatarMoeda(horaBase),
            valorHE50: formatarMoeda(valorHE50),
            valorHE100: formatarMoeda(valorHE100),
            valorNoturno: formatarMoeda(valorNoturno),
            valorDSR: formatarMoeda(valorDSR),
            totalReceber: formatarMoeda(totalReceber),
            inss: formatarMoeda(inss),
            vt: formatarMoeda(vt),
            irrf: formatarMoeda(irrf),
            totalDescontos: formatarMoeda(totalDescontos),
            liquido: formatarMoeda(liquido),
            temValores: baseBruta > 0
        };
    }, [calcHE]);

    const prepareExport = () => { const botoes = document.querySelectorAll('.no-print'); botoes.forEach(b => b.style.display = 'none'); return botoes; };

    // Exportação no mesmo molde dos relatórios: captura em LARGURA NATURAL (sem o
    // "espremido" da tela) para resolução nítida e layout elegante, mantendo a
    // característica original da inicial (folha numa página centralizada).
    // JPG continua como imagem (formato raster por natureza), capturado em largura natural
    const exportarFolha = (tipo) => {
        if (!usuarioSelecionado) return Swal.fire('Erro', 'Selecione um colaborador', 'error');
        const node = exportRef.current;
        if (!node) return;
        const nomeColaborador = colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || 'Colaborador';
        const nomeArquivo = `HE_${nomeColaborador}_${mesAno}`;

        const botoes = prepareExport();
        node.classList.add('exportando');
        const prev = { w: node.style.width, mw: node.style.maxWidth, disp: node.style.display, mg: node.style.margin };
        node.style.display = 'inline-block';
        node.style.maxWidth = 'none';
        node.style.margin = '0';
        node.style.width = '0px';
        let maxW = node.scrollWidth;
        node.querySelectorAll('table').forEach(t => { if (t.scrollWidth > maxW) maxW = t.scrollWidth; });
        const cs = getComputedStyle(node);
        const padLR = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
        node.style.width = `${maxW + padLR}px`;

        Swal.fire({ title: `Gerando ${tipo.toUpperCase()}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const restore = () => {
            node.style.width = prev.w; node.style.maxWidth = prev.mw; node.style.display = prev.disp; node.style.margin = prev.mg;
            node.classList.remove('exportando');
            botoes.forEach(b => b.style.display = '');
        };

        const W = node.scrollWidth, H = node.scrollHeight;
        html2canvas(node, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: W, height: H, windowWidth: W, windowHeight: H })
            .then(canvas => {
                const imgData = canvas.toDataURL('image/jpeg', 0.92);
                const link = document.createElement('a');
                link.download = `${nomeArquivo}.jpg`; link.href = imgData; link.click();
                Swal.close();
            })
            .catch(() => Swal.fire('Erro', `Erro ao gerar ${tipo.toUpperCase()}.`, 'error'))
            .finally(restore);
    };

    // ===================== PDF VETORIAL (mesmo molde dos relatórios) =====================
    // Desenhado com texto/tabela reais - a resolução da tela NÃO interfere no resultado.
    const carregarLogoImg = () => new Promise((ok) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = () => ok(null);
        im.src = logo;
    });

    const gerarPdfFolha = async () => {
        if (!usuarioSelecionado) return Swal.fire('Erro', 'Selecione um colaborador', 'error');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const nomeColab = colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || 'Colaborador';
            const nomeProj = projetos.find(p => String(p.id_projeto) === String(projetoSelecionado))?.nome_projeto || 'N/A';
            const nomeUni = unidades.find(u => String(u.id_unidade) === String(unidadeSelecionada))?.nome_unidade || 'N/A';
            const projetosPdf = [...new Set(totaisPorUnidade.map(t => t.id_projeto).filter(Boolean))];
            const nomeProjHdr = projetosPdf.length > 1
                ? 'Vários projetos'
                : (projetosPdf.length === 1 ? nomeProjetoPorId(projetosPdf[0]) : nomeProj);
            const nomeUniHdr = totaisPorUnidade.length > 1
                ? 'Várias unidades'
                : (totaisPorUnidade.length === 1 ? nomeUnidadePorId(totaisPorUnidade[0].id_unidade) : nomeUni);

            const doc = new jsPDF('l', 'mm', 'a4');
            const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
            const M = 12, CW = W - 2 * M;
            const green = [46, 125, 50], blue = [21, 101, 192], gold = [176, 124, 5],
                  ink = [31, 41, 51], muted = [110, 116, 124], grid = [210, 214, 220];
            const cursor = { y: M };

            // ---- Cabeçalho ----
            const img = await carregarLogoImg();
            const logoH = 20, logoW = img ? logoH * ((img.naturalWidth / img.naturalHeight) || 1) : 0;
            if (img) { try { doc.addImage(img, 'PNG', M, M, logoW, logoH); } catch (e) {} }
            doc.setFont(undefined, 'bold'); doc.setFontSize(16); doc.setTextColor(...ink);
            doc.text('FOLHA DE PONTO / HORAS EXTRAS', W - M, M + 5, { align: 'right' });
            doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
            doc.text(`Colaborador: ${nomeColab}`, W - M, M + 11, { align: 'right' });
            doc.text(`Período: ${mesAno}   ·   Projeto: ${nomeProjHdr}   ·   Unidade: ${nomeUniHdr}`, W - M, M + 16, { align: 'right' });
            doc.text(`Gerado por: ${usuarioLogado.nome_completo || '-'} em ${new Date().toLocaleString('pt-BR')}`, W - M, M + 21, { align: 'right' });
            cursor.y = M + Math.max(logoH, 21) + 4;
            doc.setDrawColor(...green); doc.setLineWidth(0.6); doc.line(M, cursor.y, W - M, cursor.y); doc.setLineWidth(0.2);
            cursor.y += 5;

            // ---- Tabela (esquerda) + Resumo (direita), tudo em UMA página ----
            const tableW = 203;                 // tabela (com coluna Unidade)
            const gap = 6;
            const panelX = M + tableW + gap;
            const panelW = CW - tableW - gap;   // ~64mm p/ o resumo
            const cols = [
                { h: 'Dia', w: 10 }, { h: 'Semana', w: 13 }, { h: 'Unidade', w: 33, align: 'left' },
                { h: 'Fer', w: 8 }, { h: 'Fol', w: 8 },
                { h: 'Entrada', w: 21 }, { h: 'Saída', w: 21 }, { h: 'Interv.', w: 19 },
                { h: 'Efetivas', w: 23 }, { h: '50%', w: 16 }, { h: '100%', w: 16 }, { h: 'Ad.N', w: 15 }
            ];
            const colX = []; { let xx = M; cols.forEach(c => { colX.push(xx); xx += c.w; }); }

            // Trunca texto para caber na largura da coluna (usado na Unidade)
            const fitText = (txt, maxW) => {
                if (!txt) return '';
                if (doc.getTextWidth(txt) <= maxW) return txt;
                let s = txt;
                while (s.length > 1 && doc.getTextWidth(s + '…') > maxW) s = s.slice(0, -1);
                return s + '…';
            };

            // Altura de linha adaptativa para caber em uma única página
            const headerH = 7;
            const bodyTop = cursor.y;
            const bottomLimit = H - 10;
            let rowH = (bottomLimit - bodyTop - headerH) / linhas.length;
            rowH = Math.max(4.0, Math.min(6.0, rowH));
            const fs = rowH < 4.6 ? 6.5 : 7;

            const cabec = () => {
                doc.setFillColor(...green); doc.setDrawColor(27, 94, 32);
                doc.rect(M, cursor.y, tableW, headerH, 'FD');
                doc.setFont(undefined, 'bold'); doc.setFontSize(fs); doc.setTextColor(255, 255, 255);
                cols.forEach((c, ci) => doc.text(c.h, colX[ci] + c.w / 2, cursor.y + headerH - 2.3, { align: 'center' }));
                cursor.y += headerH;
            };
            cabec();

            linhas.forEach((item, idx) => {
                let fill = idx % 2 === 1 ? [249, 250, 251] : [255, 255, 255];
                if (item.isFolga) fill = [224, 242, 241];
                else if (item.isFeriado) fill = [255, 249, 196];
                else if (item.isFDS) fill = [252, 228, 236];
                doc.setFillColor(...fill); doc.rect(M, cursor.y, tableW, rowH, 'F');

                // realces por coluna (igual à tela): Efetivas(8), 50%(9), 100%(10) e Ad.N(11 escuro)
                doc.setFillColor(241, 248, 233); doc.rect(colX[8], cursor.y, cols[8].w, rowH, 'F');
                doc.setFillColor(227, 242, 253); doc.rect(colX[9], cursor.y, cols[9].w, rowH, 'F'); doc.rect(colX[10], cursor.y, cols[10].w, rowH, 'F');
                doc.setFillColor(55, 71, 79); doc.rect(colX[11], cursor.y, cols[11].w, rowH, 'F');

                const uniTxt = item.isFolga ? '' : nomeUnidadePorId(item.id_unidade);
                const ent = item.isFolga ? '' : (item.entrada || '');
                const sai = item.isFolga ? '' : (item.saida || '');
                const itv = item.isFolga ? '' : (item.intervalo || '');
                const efe = item.isFolga ? 'FOLGA' : (item.displayEfetivas || '');
                const h50 = item.he50 > 0 ? minToTime(item.he50) : '';
                const h100 = item.he100 > 0 ? minToTime(item.he100) : '';
                const adn = item.adNoturno > 0 ? minToTime(item.adNoturno) : '';
                const cells = [
                    { t: String(item.dia), bold: true, color: ink },
                    { t: item.diaSemanaStr.substring(0, 3), color: item.isFolga ? muted : ink },
                    { t: uniTxt, color: item.isFolga ? muted : blue, align: 'left' },
                    { t: item.isFeriado ? 'X' : '', color: ink },
                    { t: item.isFolga ? 'X' : '', color: ink },
                    { t: ent, color: item.isFolga ? muted : ink },
                    { t: sai, color: item.isFolga ? muted : ink },
                    { t: itv, color: item.isFolga ? muted : ink },
                    { t: efe, bold: true, color: item.isFolga ? muted : [51, 105, 30] },
                    { t: h50, bold: true, color: blue },
                    { t: h100, bold: true, color: blue },
                    { t: adn, bold: true, color: [255, 235, 59] }
                ];
                doc.setFontSize(fs);
                cols.forEach((c, ci) => {
                    const o = cells[ci];
                    doc.setFont(undefined, o.bold ? 'bold' : 'normal'); doc.setTextColor(...(o.color || ink));
                    if (c.align === 'left') {
                        doc.text(fitText(o.t || '', c.w - 3), colX[ci] + 1.8, cursor.y + rowH - 1.5, { align: 'left' });
                    } else {
                        doc.text(o.t || '', colX[ci] + c.w / 2, cursor.y + rowH - 1.5, { align: 'center' });
                    }
                });
                doc.setDrawColor(...grid); doc.setFont(undefined, 'normal');
                let xv = M; cols.forEach(c => { doc.line(xv, cursor.y, xv, cursor.y + rowH); xv += c.w; });
                doc.line(xv, cursor.y, xv, cursor.y + rowH);
                doc.line(M, cursor.y + rowH, M + tableW, cursor.y + rowH);
                cursor.y += rowH;
            });

            // ---- Resumo (direita) ----
            const nPost = totaisPorUnidade.length;
            const py = bodyTop, cardH = 54 + (nPost > 0 ? 8 + nPost * 5 : 0);
            doc.setDrawColor(...grid); doc.setFillColor(250, 250, 250); doc.rect(panelX, py, panelW, cardH, 'FD');
            doc.setFont(undefined, 'bold'); doc.setFontSize(9.5); doc.setTextColor(...ink);
            doc.text('RESUMO MENSAL', panelX + panelW / 2, py + 8, { align: 'center' });
            doc.setDrawColor(...grid); doc.line(panelX + 5, py + 11, panelX + panelW - 5, py + 11);
            const linhaResumo = (lbl, val, cor, yy) => {
                doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
                doc.text(lbl, panelX + 6, yy);
                doc.setFont(undefined, 'bold'); doc.setTextColor(...cor);
                doc.text(val, panelX + panelW - 6, yy, { align: 'right' });
            };
            linhaResumo('Carga Base:', '200:00', ink, py + 18);
            linhaResumo('Horas Trabalhadas:', minToTime(totais.horasEfetivas), green, py + 25);
            doc.setFont(undefined, 'bold'); doc.setFontSize(8); doc.setTextColor(...muted);
            doc.text('BANCO DE HORAS / EXTRAS', panelX + panelW / 2, py + 33, { align: 'center' });
            linhaResumo('H.E. 50%:', minToTime(totais.he50), blue, py + 40);
            linhaResumo('H.E. 100%:', minToTime(totais.he100), blue, py + 45.5);
            linhaResumo('Adic. Noturno:', minToTime(totais.adNoturno), gold, py + 51);
            if (nPost > 0) {
                let yP = py + 57;
                doc.setFont(undefined, 'bold'); doc.setFontSize(7.5); doc.setTextColor(...muted);
                doc.text('HORAS EXTRAS POR UNIDADE (50 / 100 / Not.)', panelX + panelW / 2, yP, { align: 'center' }); yP += 5;
                const multiProj = projetosPdf.length > 1;
                doc.setFontSize(6.8);
                totaisPorUnidade.forEach(t => {
                    let nome = nomeUnidadePorId(t.id_unidade);
                    if (multiProj) nome = `${nomeProjetoPorId(t.id_projeto)} · ${nome}`;
                    const nomeCurto = nome.length > 26 ? nome.slice(0, 25) + '…' : nome;
                    doc.setFont(undefined, 'normal'); doc.setTextColor(...ink);
                    doc.text(nomeCurto, panelX + 6, yP);
                    doc.setTextColor(...blue);
                    doc.text(`${minToTime(t.he50)} / ${minToTime(t.he100)} / ${minToTime(t.adNoturno)}`, panelX + panelW - 6, yP, { align: 'right' });
                    yP += 5;
                });
            }
            doc.setFont(undefined, 'italic'); doc.setFontSize(6.8); doc.setTextColor(...muted);
            doc.text('* Valores sujeitos a conferência do RH.', panelX + panelW / 2, py + cardH + 5, { align: 'center' });

            // ---- Assinaturas (direita, abaixo do resumo) ----
            const sigY1 = py + cardH + 24, sigY2 = sigY1 + 22;
            doc.setDrawColor(70, 70, 70);
            doc.line(panelX + 8, sigY1, panelX + panelW - 8, sigY1);
            doc.setFont(undefined, 'normal'); doc.setFontSize(8.5); doc.setTextColor(...muted);
            doc.text('Assinatura do Colaborador', panelX + panelW / 2, sigY1 + 5, { align: 'center' });
            doc.line(panelX + 8, sigY2, panelX + panelW - 8, sigY2);
            doc.text('Assinatura do Gestor', panelX + panelW / 2, sigY2 + 5, { align: 'center' });

            // ---- Rodapé (todas as páginas) ----
            const total = doc.internal.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i); doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
                doc.text('Opera Echo Management System · Folha de Ponto / Horas Extras', M, H - 6);
                doc.text(`Página ${i} de ${total}`, W - M, H - 6, { align: 'right' });
            }

            doc.save(`HE_${nomeColab}_${mesAno}.pdf`);
            Swal.close();
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error');
        }
    };

    const handleExportPDF = () => gerarPdfFolha();
    const handleExportExcel = () => { if (!usuarioSelecionado) return Swal.fire('Erro', 'Selecione um colaborador', 'error'); const nomeColaborador = colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || 'Colaborador'; const projetosXls = [...new Set(totaisPorUnidade.map(t => t.id_projeto).filter(Boolean))]; const nomeProjetoCab = projetosXls.length > 1 ? 'Vários projetos' : (projetosXls.length === 1 ? nomeProjetoPorId(projetosXls[0]) : (projetos.find(p => String(p.id_projeto) === String(projetoSelecionado))?.nome_projeto || 'N/A')); const nomeUnidadeCab = totaisPorUnidade.length > 1 ? 'Várias unidades' : (totaisPorUnidade.length === 1 ? nomeUnidadePorId(totaisPorUnidade[0].id_unidade) : (unidades.find(u => String(u.id_unidade) === String(unidadeSelecionada))?.nome_unidade || 'N/A')); const dadosExcel = []; dadosExcel.push(["FOLHA DE PONTO / HORAS EXTRAS"]); dadosExcel.push(["Colaborador:", nomeColaborador, "Período:", mesAno]); dadosExcel.push(["Projeto:", nomeProjetoCab, "Unidade:", nomeUnidadeCab]); dadosExcel.push([""]); dadosExcel.push(["Dia", "Semana", "Projeto", "Unidade", "Feriado?", "Folga?", "Entrada", "Saída", "Intervalo", "Horas Efetivas", "H.E. 50%", "H.E. 100%", "Adic. Noturno"]); linhas.forEach(item => { dadosExcel.push([ item.dia, item.diaSemanaStr, item.isFolga ? "" : nomeProjetoPorId(item.id_projeto), item.isFolga ? "" : nomeUnidadePorId(item.id_unidade), item.isFeriado ? "Sim" : "Não", item.isFolga ? "Sim" : "Não", item.entrada || "", item.saida || "", item.intervalo || "", item.displayEfetivas, item.he50 > 0 ? minToTime(item.he50) : "", item.he100 > 0 ? minToTime(item.he100) : "", item.adNoturno > 0 ? minToTime(item.adNoturno) : "" ]); }); dadosExcel.push([""]); dadosExcel.push(["", "", "", "", "", "", "", "", "", "TOTAIS:", minToTime(totais.he50), minToTime(totais.he100), minToTime(totais.adNoturno)]); dadosExcel.push([""]); dadosExcel.push(["HORAS EXTRAS POR UNIDADE"]); dadosExcel.push(["Projeto", "Unidade", "H.E. 50%", "H.E. 100%", "Adic. Noturno"]); totaisPorUnidade.forEach(t => dadosExcel.push([ nomeProjetoPorId(t.id_projeto), nomeUnidadePorId(t.id_unidade), minToTime(t.he50), minToTime(t.he100), minToTime(t.adNoturno) ])); const ws = XLSX.utils.aoa_to_sheet(dadosExcel); const wscols = [{wch: 5}, {wch: 12}, {wch: 24}, {wch: 24}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 10}, {wch: 15}, {wch: 12}, {wch: 12}, {wch: 15}]; ws['!cols'] = wscols; const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Horas Extras"); XLSX.writeFile(wb, `HE_${nomeColaborador}_${mesAno}.xlsx`); };
    const handleExportJPG = () => exportarFolha('jpg');

    if (modoLista) {
        return (
            <div className="he-container">
                <div className="he-header">
                    <div className="he-title">
                        <span className="icon-large"></span>
                        <div><h2>Horas Extras</h2><p>Histórico e Lançamentos</p></div>
                    </div>
                    <div>
                        {permissoesModulo.pode_novo && (
                            <button className="btn-tab ativo" onClick={handleNovoLancamento}>+ Novo Lançamento</button>
                        )}
                        <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                    </div>
                </div>
                <div className="he-listagem">
                    <table className="he-table">
                        <thead><tr><th>Mês/Ano</th><th>Colaborador</th><th>Projeto</th><th>Status</th><th style={{minWidth:'100px'}}>Ação</th></tr></thead>
                        <tbody>
                            {historicoLancamentos.length === 0 ? (
                                <tr><td colSpan="5" style={{textAlign:'center', padding:'20px', color:'#777'}}>Nenhum registro encontrado.</td></tr>
                            ) : (
                                historicoLancamentos.map(h => {
                                    const statusExibicao = calcularStatusVisual(h);
                                    const styleStatus = statusExibicao === 'PAGO' ? { color: 'green', fontWeight: 'bold' } : {};
                                    const habilitaEditar = isAdminOrGestor || permissoesModulo.pode_editar;
                                    const habilitaExcluir = isAdminOrGestor || permissoesModulo.pode_editar;
                                    return (
                                        <tr key={h.id_lancamento}>
                                            <td>{h.mes_referencia}</td>
                                            <td>{h.colaborador}</td>
                                            <td>{h.nome_projeto}</td>
                                            <td style={styleStatus}>{statusExibicao}</td>
                                            <td style={{textAlign:'center'}}>
                                                <div style={{display:'flex', gap:'8px', justifyContent:'center'}}>
                                                    <button 
                                                        className="btn-editar" 
                                                        onClick={() => handleVerLancamento(h)}
                                                        disabled={!habilitaEditar}
                                                        title="Abrir/Editar"
                                                        style={{ opacity: habilitaEditar ? 1 : 0.5, cursor: habilitaEditar ? 'pointer' : 'not-allowed', padding:'6px 12px', whiteSpace: 'nowrap'}}
                                                    >
                                                        <Icon n="folder"/>
                                                    </button>
                                                    <button 
                                                        className="btn-excluir" 
                                                        onClick={(e) => handleExcluir(h.id_lancamento, e, h.id_usuario)}
                                                        disabled={!habilitaExcluir}
                                                        title="Excluir"
                                                        style={{ opacity: habilitaExcluir ? 1 : 0.5, cursor: habilitaExcluir ? 'pointer' : 'not-allowed', backgroundColor: '#A23B36', color: '#fff', border:'none', padding:'6px 12px', borderRadius:'4px', whiteSpace: 'nowrap'}}
                                                    >
                                                        <Icon n="trash"/>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    const nomeColaboradorAtual = colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || '';
    const nomeUnidadeAtual = unidades.find(u => String(u.id_unidade) === String(unidadeSelecionada))?.nome_unidade || 'N/A';
    const nomeProjetoAtual = projetos.find(p => String(p.id_projeto) === String(projetoSelecionado))?.nome_projeto || 'N/A';
    const projetosNoMes = [...new Set(totaisPorUnidade.map(t => t.id_projeto).filter(Boolean))];
    const nomeProjetoResumo = projetosNoMes.length > 1
        ? 'Vários projetos (ver resumo)'
        : (projetosNoMes.length === 1 ? nomeProjetoPorId(projetosNoMes[0]) : nomeProjetoAtual);
    const nomeUnidadeResumo = totaisPorUnidade.length > 1
        ? 'Várias unidades (ver resumo)'
        : (totaisPorUnidade.length === 1 ? nomeUnidadePorId(totaisPorUnidade[0].id_unidade) : nomeUnidadeAtual);

    return (
        <div className="he-container">
            <div className="he-header no-print">
                <div className="he-title">
                    <span className="icon-large"><Icon n="file"/></span>
                    <div><h2>{idLancamentoAtual ? 'Editar Lançamento' : 'Novo Lançamento'}</h2><p>Preencha os horários</p></div>
                </div>
                <div>
                      {idLancamentoAtual && permissoesModulo.pode_editar && (
                        <button className="btn-excluir" onClick={(e) => handleExcluir(idLancamentoAtual, e)} style={{backgroundColor: '#A23B36', color: '#fff', border:'none', padding:'8px 15px', borderRadius:'4px', marginRight:'10px'}}>
                            Excluir Registro
                        </button>
                    )}
                    <button className="btn-voltar" onClick={() => setModoLista(true)}>Cancelar</button>
                </div>
            </div>

            <div className="he-controls no-print">
                <div className="control-group"><label>Mês</label><input type="month" className="form-control" value={mesAno} onChange={e => setMesAno(e.target.value)} disabled={!!idLancamentoAtual} /></div>
                <div className="control-group" style={{flex: 2}}><label>Colaborador</label><select className="form-control" value={usuarioSelecionado} onChange={e => setUsuarioSelecionado(e.target.value)} disabled={!isAdminOrGestor}><option value="">Selecione...</option>{colaboradores.map(c => <option key={c.id_usuario} value={c.id_usuario}>{c.nome_completo}</option>)}</select></div>
                <div className="control-group"><label>Projeto</label><select className="form-control" value={projetoSelecionado} onChange={e => handleProjetoChange(e.target.value)}><option value="">Selecione...</option>{projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}</select></div>
                <div className="control-group" style={{flex: 1.5}}><label>Unidade Padrão</label><select className="form-control" value={unidadeSelecionada} onChange={e => aplicarUnidadePadrao(e.target.value)} disabled={!projetoSelecionado}><option value="">Selecione...</option>{unidades.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}</select></div>
            </div>

            <div className="he-posto-tools no-print">
                <span className="posto-tools-title"><Icon n="pin"/> Atribuir unidade por período:</span>
                <label>De</label>
                <input type="number" min="1" max="31" value={rangeUnidade.de} onChange={e => setRangeUnidade({...rangeUnidade, de: e.target.value})} />
                <label>até</label>
                <input type="number" min="1" max="31" value={rangeUnidade.ate} onChange={e => setRangeUnidade({...rangeUnidade, ate: e.target.value})} />
                <label>Unidade</label>
                <select value={rangeUnidade.id} onChange={e => setRangeUnidade({...rangeUnidade, id: e.target.value})} disabled={!projetoSelecionado}>
                    <option value="">Selecione...</option>
                    {unidades.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                </select>
                <button className="btn-posto-aplicar" onClick={aplicarUnidadeIntervalo}>Aplicar no período</button>
                <button className="btn-posto-todos" onClick={aplicarUnidadeTodos} disabled={!unidadeSelecionada}>Aplicar padrão a todos</button>
            </div>

            <div className="he-config-panel no-print">
                <details>
                    <summary><Icon n="settings"/> Configurar Jornada Padrão (Salva automaticamente)</summary>
                    <div className="config-grid">
                        <div className="form-group"><label>Entrada</label><input type="time" value={configJornada.entrada} onChange={e => setConfigJornada({...configJornada, entrada: e.target.value})} /></div>
                        <div className="form-group"><label>Saída</label><input type="time" value={configJornada.saida} onChange={e => setConfigJornada({...configJornada, saida: e.target.value})} /></div>
                        <div className="form-group"><label>Intervalo</label><input type="time" value={configJornada.intervalo} onChange={e => setConfigJornada({...configJornada, intervalo: e.target.value})} /></div>
                        <button className="btn-tab ativo" onClick={gerarGradeDias} style={{marginTop: '22px'}}><Icon n="refresh"/> Aplicar na Tabela</button>
                    </div>
                </details>
            </div>

            {/* CALCULADORA CLT */}
            <div className="he-config-panel no-print" style={{marginTop: '10px'}}>
                <details>
                    <summary style={{color: '#388E3C', fontWeight: 'bold'}}><Icon n="bar-chart"/> Calculadora de Horas Extras e DSR (CLT)</summary>
                    
                    <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginTop: '15px' }}>
                        <div className="form-group"><label>Salário Base (R$)</label><input type="text" className="form-control" placeholder="0,00" value={calcHE.salario} onChange={handleSalarioChange} /></div>
                        <div className="form-group"><label>Carga Mensal</label><input type="number" className="form-control" value={calcHE.cargaHoraria} onChange={e => setCalcHE({...calcHE, cargaHoraria: e.target.value})} /></div>
                        
                        <div className="form-group"><label>Qtd. Horas 50%</label><input type="text" placeholder="00:00" className="form-control" value={calcHE.horas50} onChange={e => setCalcHE({...calcHE, horas50: formatarHoraInput(e.target.value)})} /></div>
                        <div className="form-group"><label>Qtd. Horas 100%</label><input type="text" placeholder="00:00" className="form-control" value={calcHE.horas100} onChange={e => setCalcHE({...calcHE, horas100: formatarHoraInput(e.target.value)})} /></div>
                        <div className="form-group"><label>Qtd. Horas Noturnas</label><input type="text" placeholder="00:00" className="form-control" value={calcHE.horasNoturnas} onChange={e => setCalcHE({...calcHE, horasNoturnas: formatarHoraInput(e.target.value)})} /></div>
                        
                        <div className="form-group"><label>Dias Úteis no Mês</label><input type="number" className="form-control" value={calcHE.diasUteis} onChange={e => setCalcHE({...calcHE, diasUteis: e.target.value})} /></div>
                        <div className="form-group"><label>Dias DSR (Dom/Fer)</label><input type="number" className="form-control" value={calcHE.diasDsr} onChange={e => setCalcHE({...calcHE, diasDsr: e.target.value})} /></div>
                        <div className="form-group"><label>Dependentes (IR)</label><input type="number" min="0" className="form-control" value={calcHE.dependentes} onChange={e => setCalcHE({...calcHE, dependentes: e.target.value})} /></div>
                    </div>

                    <div style={{ marginTop: '15px', padding: '15px 0 0', borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#388E3C', display: 'block' }}>Valor Hora Base</span>
                            <strong style={{ fontSize: '1.1rem', color: '#333' }}>{resultadosCalc.horaBase}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#388E3C', display: 'block' }}>Total HE 50%</span>
                            <strong style={{ fontSize: '1.1rem', color: '#333' }}>{resultadosCalc.valorHE50}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#388E3C', display: 'block' }}>Total HE 100%</span>
                            <strong style={{ fontSize: '1.1rem', color: '#333' }}>{resultadosCalc.valorHE100}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#388E3C', display: 'block' }}>HE Noturna (50% + 30%)</span>
                            <strong style={{ fontSize: '1.1rem', color: '#333' }}>{resultadosCalc.valorNoturno}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#388E3C', display: 'block' }}>Valor DSR</span>
                            <strong style={{ fontSize: '1.1rem', color: '#333' }}>{resultadosCalc.valorDSR}</strong>
                        </div>
                        <div style={{ textAlign: 'center', borderLeft: '2px solid #90caf9', paddingLeft: '15px' }}>
                            <span style={{ fontSize: '0.9rem', color: '#388E3C', display: 'block', fontWeight: 'bold' }}>TOTAL BRUTO</span>
                            <strong style={{ fontSize: '1.3rem', color: '#2E7D32' }}>{resultadosCalc.totalReceber}</strong>
                        </div>
                    </div>

                    {/* DESCONTOS ESTIMADOS (CLT) */}
                    <div style={{ marginTop: '12px', padding: '15px', background: '#F9EEEC', borderRadius: '6px', border: '1px solid #F0D9D6', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#8F332F', display: 'block' }}>INSS</span>
                            <strong style={{ fontSize: '1.1rem', color: '#7A2B27' }}>- {resultadosCalc.inss}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#8F332F', display: 'block' }}>Vale-Transporte (6%)</span>
                            <strong style={{ fontSize: '1.1rem', color: '#7A2B27' }}>- {resultadosCalc.vt}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#8F332F', display: 'block' }}>IRRF</span>
                            <strong style={{ fontSize: '1.1rem', color: '#7A2B27' }}>- {resultadosCalc.irrf}</strong>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '0.8rem', color: '#8F332F', display: 'block' }}>Total de Descontos</span>
                            <strong style={{ fontSize: '1.1rem', color: '#7A2B27' }}>- {resultadosCalc.totalDescontos}</strong>
                        </div>
                        <div style={{ textAlign: 'center', borderLeft: '2px solid #ef9a9a', paddingLeft: '15px' }}>
                            <span style={{ fontSize: '0.9rem', color: '#388E3C', display: 'block', fontWeight: 'bold' }}>LÍQUIDO ESTIMADO</span>
                            <strong style={{ fontSize: '1.3rem', color: '#388E3C' }}>{resultadosCalc.liquido}</strong>
                        </div>
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>
                        *Ferramenta estimativa baseada nas normas gerais da CLT. INSS pela tabela progressiva 2026 (Portaria MPS/MF nº 13/2026, teto R$ 8.475,55) e IRRF conforme a Lei 15.270/2025 (isenção até R$ 5.000 e redução até R$ 7.350, vigente desde jan/2026), mais VT de 6%. Os descontos são aproximados e não substituem o contracheque oficial do departamento pessoal, podendo haver variações conforme convenções coletivas, benefícios e a real base de incidência de cada tributo.
                    </div>
                </details>
            </div>

            <div className="he-print-area" ref={exportRef}>
                <div className="print-header">
                    <img src={logo} alt="Logo" style={{height: '90px', objectFit: 'contain'}} /> 
                    <div className="print-info">
                        <h3>FOLHA DE PONTO / HORAS EXTRAS</h3>
                        <p style={{marginBottom:'2px'}}><strong>Colaborador:</strong> {nomeColaboradorAtual}</p>
                        <p style={{fontSize: '0.85rem', marginBottom:'2px'}}>
                            <strong>Período:</strong> {mesAno} &nbsp;|&nbsp; 
                            <strong>Projeto:</strong> {nomeProjetoResumo} &nbsp;|&nbsp; 
                            <strong>Unidade:</strong> {nomeUnidadeResumo}
                        </p>
                        <p style={{fontSize: '0.7rem', color: '#888'}}>
                            Gerado por: {usuarioLogado.nome_completo} em {new Date().toLocaleString()}
                        </p>
                    </div>
                </div>

                <div className="print-body-row">
                    <div className="print-table-container">
                        <table className="he-table">
                            <thead>
                                <tr>
                                    <th style={{width: '30px'}}>Dia</th>
                                    <th style={{width: '50px'}}>Semana</th>
                                    <th className="posto-col" style={{minWidth: '90px'}}>Unidade</th>
                                    <th style={{width: '25px'}}>FER</th>
                                    <th style={{width: '25px'}}>FOL</th>
                                    <th>Entrada</th>
                                    <th>Saída</th>
                                    <th>Interv.</th>
                                    <th className="highlight-col">Efetivas</th>
                                    <th className="he-col">50%</th>
                                    <th className="he-col">100%</th>
                                    <th className="night-col">Ad.N</th>
                                </tr>
                            </thead>
                            <tbody>
                                {linhas.map((item, idx) => (
                                    <tr key={idx} className={`${item.isFDS ? 'row-weekend' : ''} ${item.isFeriado ? 'row-holiday' : ''} ${item.isFolga ? 'row-dayoff' : ''}`}>
                                        <td style={{textAlign: 'center', fontWeight: 'bold'}}>{item.dia}</td>
                                        <td style={{fontSize:'0.7rem'}}>{item.diaSemanaStr.substring(0,3)}</td>
                                        <td className="posto-cell">
                                            <select className="input-posto" value={item.id_unidade || ''} onChange={e => setUnidadeLinha(idx, e.target.value)} disabled={item.isFolga} title={item.id_projeto ? nomeProjetoPorId(item.id_projeto) : ''}>
                                                <option value="">-</option>
                                                {Object.entries(catAgrupado).map(([pid, us]) => (
                                                    <optgroup key={pid} label={pid === 'SEM' ? 'Sem projeto' : nomeProjetoPorId(pid)}>
                                                        {us.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                                                    </optgroup>
                                                ))}
                                            </select>
                                        </td>
                                        <td style={{textAlign: 'center'}}><input type="checkbox" checked={item.isFeriado} onChange={e => atualizarLinha(idx, 'isFeriado', e.target.checked)} /></td>
                                        <td style={{textAlign: 'center'}}><input type="checkbox" checked={item.isFolga} onChange={e => atualizarLinha(idx, 'isFolga', e.target.checked)} /></td>
                                        <td><input type="time" className="input-time" value={item.entrada} onChange={e => atualizarLinha(idx, 'entrada', e.target.value)} disabled={item.isFolga} /></td>
                                        <td><input type="time" className="input-time" value={item.saida} onChange={e => atualizarLinha(idx, 'saida', e.target.value)} disabled={item.isFolga} /></td>
                                        <td><input type="time" className="input-time" value={item.intervalo} onChange={e => atualizarLinha(idx, 'intervalo', e.target.value)} disabled={item.isFolga} /></td>
                                        <td className="highlight-col">{item.displayEfetivas}</td>
                                        <td className="he-col">{item.he50 > 0 ? minToTime(item.he50) : ''}</td>
                                        <td className="he-col">{item.he100 > 0 ? minToTime(item.he100) : ''}</td>
                                        <td className="night-col">{item.adNoturno > 0 ? minToTime(item.adNoturno) : ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="print-summary-panel">
                        <div className="summary-card">
                            <div className="summary-title">RESUMO MENSAL</div>
                            <div className="summary-item"><span className="lbl">Carga Base:</span><span className="val">200:00</span></div>
                            <div className="summary-divider"></div>
                            <div className="summary-item"><span className="lbl">Horas Trabalhadas:</span><span className="val highlight">{minToTime(totais.horasEfetivas)}</span></div>
                            <div className="summary-divider"></div>
                            <div className="summary-section-title">BANCO DE HORAS / EXTRAS</div>
                            <div className="summary-item"><span className="lbl">H.E. 50%:</span><span className="val blue">{minToTime(totais.he50)}</span></div>
                            <div className="summary-item"><span className="lbl">H.E. 100%:</span><span className="val blue">{minToTime(totais.he100)}</span></div>
                            <div className="summary-item"><span className="lbl">Adic. Noturno:</span><span className="val gold">{minToTime(totais.adNoturno)}</span></div>

                            {totaisPorUnidade.length > 0 && (
                                <>
                                    <div className="summary-divider"></div>
                                    <div className="summary-section-title">Horas Extras por Unidade</div>
                                    {totaisPorUnidade.map((t, i) => (
                                        <div className="summary-posto" key={i}>
                                            {projetosNoMes.length > 1 && (
                                                <div className="summary-posto-projeto">{nomeProjetoPorId(t.id_projeto)}</div>
                                            )}
                                            <div className="summary-posto-nome">{nomeUnidadePorId(t.id_unidade)}</div>
                                            <div className="summary-item" style={{marginBottom: '2px'}}>
                                                <span className="lbl">50%</span><span className="val blue">{minToTime(t.he50)}</span>
                                            </div>
                                            <div className="summary-item" style={{marginBottom: '2px'}}>
                                                <span className="lbl">100%</span><span className="val blue">{minToTime(t.he100)}</span>
                                            </div>
                                            <div className="summary-item" style={{marginBottom: '2px'}}>
                                                <span className="lbl">Ad. Not.</span><span className="val gold">{minToTime(t.adNoturno)}</span>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}

                            <div className="summary-footer-note">* Valores sujeitos a conferência do RH.</div>
                        </div>
                        <div className="signature-box-vertical">
                            <div className="sig-line">Assinatura Colaborador</div>
                            <div className="sig-line" style={{marginTop:'28px'}}>Assinatura Gestor</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="he-footer-actions no-print" style={{display:'flex', gap:'15px', justifyContent:'center'}}>
                {(permissoesModulo.pode_novo || (idLancamentoAtual && permissoesModulo.pode_editar)) && (
                    <button className="btn-salvar" onClick={handleSalvar} style={{fontSize: '1.1rem', padding: '12px 25px', backgroundColor: '#2E7D32'}}><Icon n="save"/> Salvar Dados</button>
                )}
                <button className="btn-salvar" onClick={handleExportPDF} style={{fontSize: '1.1rem', padding: '12px 25px', backgroundColor: '#388E3C'}}><Icon n="file"/> Exportar PDF</button>
                <button className="btn-salvar" onClick={handleExportExcel} style={{fontSize: '1.1rem', padding: '12px 25px', backgroundColor: '#388e3c'}}><Icon n="bar-chart"/> Exportar Excel</button>
                <button className="btn-salvar" onClick={handleExportJPG} style={{fontSize: '1.1rem', padding: '12px 25px', backgroundColor: '#e65100'}}><Icon n="camera"/> Exportar JPG</button>
            </div>
        </div>
    );
}