/* ARQUIVO: src/PlanoAcaoDetalhes.js
 * Detalhe + criação do Plano de Ação (v3).
 * - Templates vêm de ./config/planoTemplates (vários módulos no mesmo plano)
 * - Grade editável: incluir/excluir/reordenar linhas, novas etapas, unidades;
 *   colunas de Cliente, Equipe e Horas trabalhadas (apontamentos), datas
 *   previstas/realizadas, % de execução, tempos, situação e prioridade.
 * - Regras de negócio são aplicadas no servidor; aqui só orientamos o usuário.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import logo from './logo.png';
import './PlanoAcao.css';
import {
    OPCOES_RESPONSAVEL, OPCOES_PRIORIDADE, COR_STATUS, STATUS_PADRAO, STATUS_SERII, etapasUnidadePorModulos
} from './config/planoTemplates';
import NovoPlanoAcao from './NovoPlanoAcao';
import { InclusaoRapida } from './MontadorPlano';
import {
    COR_SAUDE, fmtMin, minParaHHMM, mascararHora, hhmmParaMin, soData, dataBR, hojeLocal,
    linkPublicoPlano, copiarTexto, msgErro, iniciais, escaparHtml, nomeCurto, clienteDoPlano
} from './planoAcaoUtils';

const EM_ANDAMENTO = 'Em andamento';
const statusList = (item) => (item.modulo ? STATUS_SERII : STATUS_PADRAO);
const CAMPOS_ENVIO = ['id_item', 'descricao', 'responsavel', 'cliente', 'observacao', 'data_inicio', 'data_fim',
    'data_inicio_real', 'data_fim_real', 'percentual', 'tempo_previsto', 'prioridade', 'status'];

const ROTULO_ACAO_HIST = {
    CRIACAO: 'Criou o plano', ALTERACAO: 'Alterou', ALTERACAO_PLANO: 'Alterou o plano', INCLUSAO_ITEM: 'Incluiu ação',
    EXCLUSAO_ITEM: 'Excluiu ação', INCLUSAO_UNIDADE: 'Incluiu unidade', EXCLUSAO_UNIDADE: 'Removeu unidade',
    APONTAMENTO: 'Apontou horas', EXCLUSAO_APONTAMENTO: 'Excluiu apontamento', ENCERRAMENTO: 'Encerrou o plano',
    REABERTURA: 'Reabriu o plano', PUBLICACAO: 'Publicou o painel', DESPUBLICACAO: 'Despublicou o painel'
};
const ROTULO_CAMPO = {
    descricao: 'Ação', responsavel: 'Responsável', cliente: 'Cliente', observacao: 'Observação', data_inicio: 'Início previsto',
    data_fim: 'Fim previsto', data_inicio_real: 'Início realizado', data_fim_real: 'Fim realizado', prioridade: 'Prioridade',
    status: 'Situação', percentual: '% Execução', equipe: 'Equipe', horas: 'Horas', titulo: 'Título',
    data_inicio_prevista: 'Início previsto do plano', data_fim_prevista: 'Término previsto do plano'
};

export default function PlanoAcaoDetalhes({ idPlano: idInicial, aoVoltar }) {
    const [idAtual, setIdAtual] = useState(idInicial);
    const [loading, setLoading] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const printRef = useRef(null);
    const gridScrollRef = useRef(null);

    const usuarioLogado = useMemo(() => { try { return JSON.parse(sessionStorage.getItem('usuario_opera') || '{}'); } catch (e) { return {}; } }, []);
    const nomeUsuario = usuarioLogado.nome_completo || usuarioLogado.nome || 'Usuário';
    const hoje = hojeLocal();

    /* grade */
    const [cabecalho, setCabecalho] = useState(null);
    const [itens, setItens] = useState([]);
    const [sujos, setSujos] = useState(() => new Set());
    const [indicadores, setIndicadores] = useState(null);
    const [permissoes, setPermissoes] = useState({ editar: false, novo: false });
    const [unidadesDoPlano, setUnidadesDoPlano] = useState([]);
    const [unidadesExtras, setUnidadesExtras] = useState([]);
    const [unidadeAdd, setUnidadeAdd] = useState('');
    const [bloqueados, setBloqueados] = useState(() => new Set());
    const [equipeDisponivel, setEquipeDisponivel] = useState([]);
    const [filtroGrade, setFiltroGrade] = useState({ busca: '', status: '', responsavel: '', atrasados: false, meus: false });
    const [aba, setAba] = useState('grade');
    const [historico, setHistorico] = useState([]);
    const [modal, setModal] = useState(null); // { tipo: 'equipe'|'horas'|'cabecalho'|'acao', item?, ctx? }
    const [etapasNovas, setEtapasNovas] = useState([]); // [{ modulo, nome }] ainda sem ações

    const encerrado = cabecalho?.status === 'ENCERRADO';
    const editavel = permissoes.editar && !encerrado;

    useEffect(() => {
        if (idAtual !== 'novo') carregarPlano(idAtual);
        // eslint-disable-next-line
    }, [idAtual]);

    // Aviso ao sair com alterações não salvas
    useEffect(() => {
        const h = (e) => { if (sujos.size) { e.preventDefault(); e.returnValue = ''; } };
        window.addEventListener('beforeunload', h);
        return () => window.removeEventListener('beforeunload', h);
    }, [sujos]);

    /* =============================== GRADE =============================== */
    const carregarPlano = useCallback(async (id, silencioso = false) => {
        if (!silencioso) setLoading(true);
        try {
            const res = await api.get(`/plano-acao/${id}`);
            setCabecalho(res.data.cabecalho);
            const lista = res.data.etapas || [];
            setItens(lista);
            setSujos(new Set());
            setIndicadores(res.data.indicadores || null);
            setPermissoes(res.data.permissoes || { editar: false, novo: false });
            setUnidadesDoPlano(res.data.detalhes || []);

            const trava = new Set();
            lista.forEach(i => { if (i.tempo_previsto_bloqueado || Number(i.tempo_previsto) > 0) trava.add(i.id_item); });
            setBloqueados(trava);

            if (res.data.cabecalho?.id_projeto) {
                const [rU, rE] = await Promise.all([
                    api.get(`/unidades/buscar?projeto=${res.data.cabecalho.id_projeto}&status=true&limite=1000`).catch(() => ({ data: [] })),
                    api.get(`/plano-acao/${id}/equipe-disponivel`).catch(() => ({ data: [] }))
                ]);
                const todas = rU.data?.dados || (Array.isArray(rU.data) ? rU.data : []);
                const jaTem = (res.data.detalhes || []).map(d => d.id_unidade);
                setUnidadesExtras(todas.filter(u => !jaTem.includes(u.id_unidade)));
                setEquipeDisponivel(rE.data || []);
            }
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', msgErro(e, 'Erro ao carregar o plano.'), 'error');
            if (e.response && [403, 404].includes(e.response.status)) aoVoltar();
        } finally { if (!silencioso) setLoading(false); }
    }, [aoVoltar]);

    const carregarHistorico = async () => {
        try { const r = await api.get(`/plano-acao/${idAtual}/historico`); setHistorico(r.data || []); }
        catch (e) { setHistorico([]); }
    };
    useEffect(() => {
        if (aba === 'historico' && idAtual !== 'novo') carregarHistorico();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba, idAtual]);

    const onChange = (id, campo, valor) => {
        setItens(prev => prev.map(i => i.id_item === id ? { ...i, [campo]: valor } : i));
        if (!campo.startsWith('_')) setSujos(prev => { const n = new Set(prev); n.add(id); return n; });
    };

    const salvar = async ({ silencioso = false } = {}) => {
        if (!sujos.size) { if (!silencioso) Swal.fire({ icon: 'info', title: 'Nada para salvar', timer: 1100, showConfirmButton: false }); return true; }
        setSalvando(true);
        try {
            const etapas = itens.filter(i => sujos.has(i.id_item)).map(i => {
                const o = {};
                CAMPOS_ENVIO.forEach(k => { o[k] = i[k] === undefined ? null : i[k]; });
                ['data_inicio', 'data_fim', 'data_inicio_real', 'data_fim_real'].forEach(k => { o[k] = soData(o[k]) || null; });
                o.equipe = (i.equipe || []).map(e => e.id_usuario);
                return o;
            });
            const res = await api.post('/plano-acao/atualizar-lote-etapas', { id_plano: parseInt(idAtual, 10), etapas });
            const ajustes = res.data?.ajustes || [];
            await carregarPlano(idAtual, true);
            if (!silencioso) {
                if (ajustes.length) {
                    const desc = new Map(itens.map(i => [i.id_item, i.descricao]));
                    Swal.fire({
                        icon: 'success', title: 'Salvo - com ajustes automáticos',
                        html: `<ul style="text-align:left;font-size:.86rem;padding-left:18px">${ajustes.slice(0, 10).map(a => `<li><b>${escaparHtml((desc.get(a.id_item) || '').slice(0, 60))}</b>: ${escaparHtml(a.msg)}</li>`).join('')}</ul>`
                    });
                } else Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1200, showConfirmButton: false });
            }
            return true;
        } catch (e) {
            console.error(e);
            Swal.fire({ icon: 'error', title: 'Não foi possível salvar', html: msgErro(e, 'Falha ao salvar.') });
            return false;
        } finally { setSalvando(false); }
    };

    // Operações estruturais recarregam a grade: salva antes o que estiver pendente
    const garantirSalvo = async () => (sujos.size ? salvar({ silencioso: true }) : true);

    const descartar = async () => {
        if (!sujos.size) return;
        const r = await Swal.fire({ title: 'Descartar alterações?', text: `${sujos.size} linha(s) alteradas serão perdidas.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Descartar', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (r.isConfirmed) carregarPlano(idAtual);
    };

    const voltar = async () => {
        if (sujos.size) {
            const r = await Swal.fire({
                title: 'Alterações não salvas', text: `Há ${sujos.size} linha(s) alteradas.`, icon: 'warning',
                showDenyButton: true, showCancelButton: true, confirmButtonText: 'Salvar e sair', denyButtonText: 'Sair sem salvar', cancelButtonText: 'Continuar editando',
                confirmButtonColor: '#2E7D32', denyButtonColor: '#A23B36'
            });
            if (r.isConfirmed) { if (await salvar({ silencioso: true })) aoVoltar(); return; }
            if (r.isDenied) aoVoltar();
            return;
        }
        aoVoltar();
    };

    const adicionarUnidade = async () => {
        if (!unidadeAdd) return Swal.fire('Atenção', 'Selecione uma unidade.', 'warning');
        if (!(await garantirSalvo())) return;
        try {
            setLoading(true);
            const modulos = [...new Set(itens.map(i => i.modulo || null))];
            let etapas_template = etapasUnidadePorModulos(modulos, cabecalho?.sub_tipo || '');
            if (!etapas_template.length) {
                // Plano montado do zero: replica as ações da primeira unidade já existente
                const ref = itens.find(i => i.id_unidade);
                etapas_template = ref
                    ? itens.filter(i => i.id_unidade === ref.id_unidade).map(i => ({ acao: i.descricao, responsavel: i.responsavel, prioridade: i.prioridade, modulo: i.modulo }))
                    : [];
            }
            await api.post('/plano-acao/adicionar-unidade-etapas', { id_plano: parseInt(idAtual, 10), id_unidade: parseInt(unidadeAdd, 10), etapas_template });
            Swal.fire({ icon: 'success', title: 'Unidade adicionada', timer: 1300, showConfirmButton: false });
            setUnidadeAdd('');
            await carregarPlano(idAtual, true);
        } catch (e) { Swal.fire('Erro', msgErro(e, 'Erro ao adicionar unidade.'), 'error'); }
        finally { setLoading(false); }
    };

    const removerUnidade = async (idUnidade, nome) => {
        const r = await Swal.fire({ title: `Remover a unidade ${nome}?`, text: 'Todas as ações desta unidade serão excluídas do plano.', icon: 'warning', showCancelButton: true, confirmButtonText: 'Remover', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!r.isConfirmed || !(await garantirSalvo())) return;
        const exec = async (forcar) => api.delete(`/plano-acao/${idAtual}/unidades/${idUnidade}${forcar ? '?forcar=1' : ''}`);
        try { await exec(false); }
        catch (e) {
            if (e.response?.status !== 409) return Swal.fire('Erro', msgErro(e), 'error');
            const c = await Swal.fire({ title: 'Confirmação adicional', html: msgErro(e), icon: 'warning', showCancelButton: true, confirmButtonText: 'Remover mesmo assim', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
            if (!c.isConfirmed) return;
            try { await exec(true); } catch (e2) { return Swal.fire('Erro', msgErro(e2), 'error'); }
        }
        carregarPlano(idAtual, true);
    };

    // Abre o formulário completo de ação (contexto: etapa/unidade/posição)
    const incluirItem = (ctx) => setModal({ tipo: 'acao', ctx });

    // Grava uma ação nova (formulário completo ou inclusão rápida)
    const gravarAcao = async (ctx, dados) => {
        if (!(await garantirSalvo())) return false;
        try {
            await api.post(`/plano-acao/${idAtual}/itens`, {
                ...dados, grupo: ctx.grupo || null, modulo: ctx.modulo || null,
                id_unidade: ctx.id_unidade || null, apos_id_item: ctx.apos_id_item || null
            });
            // a etapa pendente passa a existir de fato
            if (ctx.grupo) setEtapasNovas(prev => prev.filter(e => !(e.nome === ctx.grupo && (e.modulo || null) === (ctx.modulo || null))));
            await carregarPlano(idAtual, true);
            return true;
        } catch (e) { Swal.fire('Erro', msgErro(e), 'error'); return false; }
    };

    // Etapas criadas na hora (ficam visíveis até receberem a primeira ação)
    const criarEtapa = (modulo, nome) => {
        const n = String(nome || '').trim().toUpperCase();
        if (!n) return;
        const existe = itens.some(i => !i.id_unidade && (i.modulo || null) === (modulo || null) && (i.titulo || 'GERAL') === n)
            || etapasNovas.some(e => e.nome === n && (e.modulo || null) === (modulo || null));
        if (existe) return Swal.fire('Atenção', 'Já existe uma etapa com esse nome.', 'warning');
        setEtapasNovas(prev => [...prev, { modulo: modulo || null, nome: n }]);
    };

    const renomearEtapa = async (modulo, de, para) => {
        const novo = String(para || '').trim().toUpperCase();
        if (!novo || novo === de) return;
        if (etapasNovas.some(e => e.nome === de && (e.modulo || null) === (modulo || null))) {
            setEtapasNovas(prev => prev.map(e => (e.nome === de && (e.modulo || null) === (modulo || null) ? { ...e, nome: novo } : e)));
            return;
        }
        if (!(await garantirSalvo())) return;
        try { await api.put(`/plano-acao/${idAtual}/etapas`, { modulo, de, para: novo }); await carregarPlano(idAtual, true); }
        catch (e) { Swal.fire('Erro', msgErro(e), 'error'); }
    };

    const excluirEtapa = async (modulo, nome, qtd) => {
        if (!qtd) { setEtapasNovas(prev => prev.filter(e => !(e.nome === nome && (e.modulo || null) === (modulo || null)))); return; }
        const r = await Swal.fire({ title: `Excluir a etapa ${nome}?`, text: `As ${qtd} ação(ões) desta etapa serão excluídas.`, icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir etapa', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!r.isConfirmed || !(await garantirSalvo())) return;
        const url = (f) => `/plano-acao/${idAtual}/etapas?nome=${encodeURIComponent(nome)}${modulo ? `&modulo=${encodeURIComponent(modulo)}` : ''}${f ? '&forcar=1' : ''}`;
        try { await api.delete(url(false)); }
        catch (e) {
            if (e.response?.status !== 409) return Swal.fire('Erro', msgErro(e), 'error');
            const c = await Swal.fire({ title: 'Confirmação adicional', html: msgErro(e), icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir mesmo assim', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
            if (!c.isConfirmed) return;
            try { await api.delete(url(true)); } catch (e2) { return Swal.fire('Erro', msgErro(e2), 'error'); }
        }
        carregarPlano(idAtual, true);
    };

    const excluirItem = async (item) => {
        const r = await Swal.fire({ title: 'Excluir ação?', text: item.descricao, icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!r.isConfirmed || !(await garantirSalvo())) return;
        try { await api.delete(`/plano-acao/itens/${item.id_item}`); }
        catch (e) {
            if (e.response?.status !== 409 || !/apontamento/i.test(e.response?.data?.erro || '')) return Swal.fire('Atenção', msgErro(e), 'warning');
            const c = await Swal.fire({ title: 'Excluir com apontamentos?', html: msgErro(e), icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir tudo', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
            if (!c.isConfirmed) return;
            try { await api.delete(`/plano-acao/itens/${item.id_item}?forcar=1`); } catch (e2) { return Swal.fire('Erro', msgErro(e2), 'error'); }
        }
        carregarPlano(idAtual, true);
    };

    const moverItem = async (item, direcao) => {
        if (!(await garantirSalvo())) return;
        try { await api.post(`/plano-acao/itens/${item.id_item}/mover`, { direcao }); await carregarPlano(idAtual, true); }
        catch (e) { Swal.fire('Erro', msgErro(e), 'error'); }
    };

    const alternarPublico = async () => {
        if (cabecalho.publico && cabecalho.token_publico) {
            const r = await Swal.fire({
                title: 'Painel público ativo',
                html: `<input class="swal2-input" readonly value="${linkPublicoPlano(cabecalho.token_publico)}" style="font-size:.85rem">`,
                showDenyButton: permissoes.editar, showCancelButton: true, confirmButtonText: 'Copiar link', denyButtonText: 'Despublicar',
                cancelButtonText: 'Fechar', confirmButtonColor: '#2E7D32', denyButtonColor: '#A23B36',
                footer: permissoes.editar ? '<a href="#" id="sw-regen">Gerar novo link (revoga o atual)</a>' : '',
                didOpen: () => {
                    const a = document.getElementById('sw-regen');
                    if (a) a.onclick = async (ev) => {
                        ev.preventDefault();
                        const res = await api.post(`/plano-acao/${idAtual}/publico`, { publico: true, regenerar: true });
                        setCabecalho(c => ({ ...c, publico: true, token_publico: res.data.token_publico }));
                        Swal.close();
                        Swal.fire({ icon: 'success', title: 'Novo link gerado', text: linkPublicoPlano(res.data.token_publico) });
                    };
                }
            });
            if (r.isConfirmed) { await copiarTexto(linkPublicoPlano(cabecalho.token_publico)); Swal.fire({ icon: 'success', title: 'Link copiado!', timer: 1200, showConfirmButton: false }); }
            if (r.isDenied) {
                await api.post(`/plano-acao/${idAtual}/publico`, { publico: false });
                setCabecalho(c => ({ ...c, publico: false }));
            }
            return;
        }
        if (!permissoes.editar) return Swal.fire('Painel privado', 'Você não tem permissão para publicar este plano (exige permissão de edição, ser o criador ou ter lotação no projeto).', 'info');
        const r = await Swal.fire({ title: 'Publicar painel do plano?', html: 'Qualquer pessoa com o link verá o <b>painel e o cronograma</b> (somente leitura). Observações, equipe e horas <b>não</b> são exibidas.', icon: 'info', showCancelButton: true, confirmButtonText: 'Publicar', cancelButtonText: 'Cancelar', confirmButtonColor: '#2E7D32' });
        if (!r.isConfirmed) return;
        try {
            const res = await api.post(`/plano-acao/${idAtual}/publico`, { publico: true });
            setCabecalho(c => ({ ...c, publico: true, token_publico: res.data.token_publico }));
            await copiarTexto(linkPublicoPlano(res.data.token_publico));
            Swal.fire({ icon: 'success', title: 'Publicado! Link copiado', text: linkPublicoPlano(res.data.token_publico) });
        } catch (e) { Swal.fire('Erro', msgErro(e), 'error'); }
    };

    /* =============================== EXPORT =============================== */
    const exportar = (tipo) => {
        const node = printRef.current;
        if (!node) return;
        const sc = gridScrollRef.current;
        const prevOv = sc ? { ov: sc.style.overflow, mh: sc.style.maxHeight } : null;
        const prevNode = { w: node.style.width, mw: node.style.maxWidth, disp: node.style.display };

        if (sc) { sc.style.overflow = 'visible'; sc.style.maxHeight = 'none'; }
        node.style.display = 'inline-block';
        node.style.maxWidth = 'none';
        node.style.width = '0px';
        const _grid = node.querySelector('.pa-grid');
        const _cs = getComputedStyle(node);
        const _padLR = (parseFloat(_cs.paddingLeft) || 0) + (parseFloat(_cs.paddingRight) || 0);
        const _tableW = _grid ? _grid.scrollWidth : node.scrollWidth;
        node.style.width = `${_tableW + _padLR}px`;
        Swal.fire({ title: `Gerando ${tipo.toUpperCase()}...`, allowOutsideClick: false, didOpen: () => Swal.showLoading() });

        const onclone = (doc) => {
            const root = doc.querySelector('[data-print-root]') || doc.body;
            root.querySelectorAll('.no-export').forEach(el => el.remove());
            root.querySelectorAll('.pa-equipe').forEach(el => el.remove());
            root.querySelectorAll('.pa-equipe-nomes').forEach(el => { el.style.display = 'block'; });
            root.querySelectorAll('button.pa-horas').forEach(b => { const d = doc.createElement('div'); d.textContent = /\d/.test(b.textContent) ? b.textContent : ''; d.style.cssText = 'text-align:center;font-weight:700;color:#6a5a8a;'; b.replaceWith(d); });
            root.querySelectorAll('input[type="date"]').forEach(inp => {
                const d = doc.createElement('div');
                d.textContent = inp.value ? dataBR(inp.value) : '';
                d.style.cssText = 'text-align:center;font-size:.8rem;padding:6px 2px;color:#14201B;';
                inp.replaceWith(d);
            });
            root.querySelectorAll('input[type="text"], input[type="number"]').forEach(inp => {
                const d = doc.createElement('div');
                d.textContent = inp.value || '';
                d.style.cssText = 'text-align:center;font-size:.82rem;font-weight:700;padding:6px 2px;color:#6a5a8a;';
                inp.replaceWith(d);
            });
            root.querySelectorAll('textarea').forEach(t => {
                const d = doc.createElement('div');
                d.textContent = t.value || '';
                d.style.cssText = 'font-size:.85rem;padding:6px 7px;white-space:pre-wrap;word-break:break-word;line-height:1.4;color:#14201B;';
                t.replaceWith(d);
            });
            root.querySelectorAll('select').forEach(sel => {
                const txt = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : '';
                const d = doc.createElement('div');
                d.textContent = txt === '-' ? '' : txt;
                if (sel.classList.contains('pa-sit')) {
                    d.style.cssText = `text-align:center;font-weight:700;border-radius:8px;padding:6px 8px;border:1px solid ${sel.style.borderColor || '#ccc'};background:${sel.style.background || sel.style.backgroundColor || '#fff'};color:${sel.style.color || '#333'};`;
                } else if (sel.classList.contains('pa-prio')) {
                    d.style.cssText = 'text-align:center;font-weight:700;border:1px solid #d0d5dd;border-radius:8px;padding:6px 8px;color:#14201B;';
                } else {
                    d.style.cssText = 'font-size:.85rem;padding:6px 7px;color:#14201B;';
                }
                sel.replaceWith(d);
            });
        };

        const restore = () => {
            if (sc && prevOv) { sc.style.overflow = prevOv.ov; sc.style.maxHeight = prevOv.mh; }
            node.style.width = prevNode.w; node.style.maxWidth = prevNode.mw; node.style.display = prevNode.disp;
        };

        const W = node.scrollWidth, H = node.scrollHeight;
        html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: W, height: H, windowWidth: W, windowHeight: H, onclone })
            .then(canvas => {
                const img = canvas.toDataURL('image/jpeg', 0.9);
                if (tipo === 'jpg') {
                    const a = document.createElement('a');
                    a.href = img; a.download = `Plano_${idAtual}.jpg`; a.click(); Swal.close(); return;
                }
                const pdf = new jsPDF('l', 'mm', 'a4');
                const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
                const ratio = pw / canvas.width, h = canvas.height * ratio;
                let left = h, pos = 0;
                pdf.addImage(img, 'JPEG', 0, pos, pw, h); left -= ph;
                while (left > 0) { pos = left - h; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, pw, h); left -= ph; }
                pdf.save(`Plano_${idAtual}.pdf`); Swal.close();
            }).catch(() => Swal.close()).finally(restore);
    };

    /* =========================== FILTRO + AGRUPAMENTO ===================== */
    const filtroAtivo = !!(filtroGrade.busca || filtroGrade.status || filtroGrade.responsavel || filtroGrade.atrasados || filtroGrade.meus);
    const visivel = useCallback((i) => {
        if (filtroGrade.status && i.status !== filtroGrade.status) return false;
        if (filtroGrade.responsavel && (i.responsavel || '') !== filtroGrade.responsavel) return false;
        if (filtroGrade.atrasados && !(i.status === 'Atrasado' || (i.status !== 'Fechado' && soData(i.data_fim) && soData(i.data_fim) < hoje))) return false;
        if (filtroGrade.meus && !(i.equipe || []).some(e => e.id_usuario === usuarioLogado.id_usuario)) return false;
        if (filtroGrade.busca) {
            const b = filtroGrade.busca.toLowerCase();
            if (![i.descricao, i.observacao, i.cliente, i.responsavel].some(x => String(x || '').toLowerCase().includes(b))) return false;
        }
        return true;
    }, [filtroGrade, hoje, usuarioLogado.id_usuario]);

    const grupos = useMemo(() => {
        const mapaUnidade = {};
        unidadesDoPlano.forEach(u => { mapaUnidade[u.id_unidade] = u.nome_unidade; });
        const porModulo = {};
        itens.forEach(i => { const m = i.modulo || '__base__'; (porModulo[m] = porModulo[m] || []).push(i); });
        etapasNovas.forEach(e => { const m = e.modulo || '__base__'; porModulo[m] = porModulo[m] || []; });
        if (!Object.keys(porModulo).length) porModulo.__base__ = [];

        return Object.keys(porModulo).map(mod => {
            const lista = porModulo[mod];
            const subgrupos = {};
            lista.filter(i => !i.id_unidade).forEach(i => { const g = i.titulo || 'GERAL'; (subgrupos[g] = subgrupos[g] || []).push(i); });
            etapasNovas.filter(e => (e.modulo || '__base__') === mod).forEach(e => { if (!subgrupos[e.nome]) subgrupos[e.nome] = []; });
            const porUnidade = {};
            lista.filter(i => i.id_unidade).forEach(i => {
                const nome = mapaUnidade[i.id_unidade] || `Unidade ${i.id_unidade}`;
                (porUnidade[nome] = porUnidade[nome] || { id: i.id_unidade, itens: [] }).itens.push(i);
            });
            const total = lista.length;
            const fechados = lista.filter(i => ['Fechado', 'Concluído'].includes(i.status)).length;
            return { modulo: mod === '__base__' ? null : mod, subgrupos, porUnidade, total, fechados, progresso: total ? Math.round((fechados / total) * 100) : 0 };
        });
    }, [itens, unidadesDoPlano, etapasNovas]);

    // Unidades do plano que ficaram sem nenhuma ação (aparecem para permitir remover/incluir)
    const unidadesVazias = useMemo(() => {
        const comItens = new Set(itens.filter(i => i.id_unidade).map(i => i.id_unidade));
        return unidadesDoPlano.filter(u => !comItens.has(u.id_unidade));
    }, [itens, unidadesDoPlano]);

    const temModulos = grupos.some(g => g.modulo);
    const modulosPlano = useMemo(() => [...new Set(itens.map(i => i.modulo).filter(Boolean))], [itens]);
    const responsaveisPlano = useMemo(() => [...new Set(itens.map(i => i.responsavel).filter(Boolean))].sort(), [itens]);
    const nVisiveis = itens.filter(visivel).length;
    const COLS = 17;

    /* =============================== RENDER ============================== */
    if (idAtual === 'novo') return <NovoPlanoAcao aoCancelar={aoVoltar} aoCriar={(id) => setIdAtual(id)} />;
    if (loading || !cabecalho)
        return <div className="pa-page"><div className="pa-card pa-card--pad pa-empty">Carregando plano…</div></div>;

    const ind = indicadores || {};
    const cs = COR_SAUDE[ind.saude] || {};
    const linhaProps = (item) => ({
        item, onChange, bloqueado: bloqueados.has(item.id_item), editavel, hoje,
        sujo: sujos.has(item.id_item), clientePadrao: clienteDoPlano(cabecalho),
        podeApontar: !encerrado,
        onEquipe: () => setModal({ tipo: 'equipe', item }),
        onHoras: () => setModal({ tipo: 'horas', item }),
        onExcluir: () => excluirItem(item),
        onInserir: () => incluirItem({ grupo: item.id_unidade ? null : (item.titulo || 'GERAL'), modulo: item.modulo, id_unidade: item.id_unidade, apos_id_item: item.id_item, rotulo: item.id_unidade ? (unidadesDoPlano.find(u => u.id_unidade === item.id_unidade) || {}).nome_unidade : (item.titulo || 'GERAL') }),
        onMover: (d) => moverItem(item, d)
    });

    return (
        <div className="pa-page">
            <div className="pa-toolbar no-print">
                <div className="pa-toolbar-esq">
                    <button className={`pa-tab ${aba === 'grade' ? 'on' : ''}`} onClick={() => setAba('grade')}><Icon n="grid" /> Plano</button>
                    <button className={`pa-tab ${aba === 'historico' ? 'on' : ''}`} onClick={() => setAba('historico')}><Icon n="clock" /> Histórico</button>
                </div>
                <button className="pa-btn pa-btn--ghost" onClick={() => exportar('pdf')}><Icon n="file" /> PDF</button>
                <button className="pa-btn pa-btn--ghost" onClick={() => exportar('jpg')}><Icon n="image" /> JPG</button>
                <button className={`pa-btn ${cabecalho.publico ? 'pa-btn--blue' : 'pa-btn--ghost'}`} onClick={alternarPublico} title="Painel público do plano"><Icon n="globe" /> {cabecalho.publico ? 'Público' : 'Publicar'}</button>
                {editavel && <button className="pa-btn pa-btn--ghost" onClick={() => setModal({ tipo: 'cabecalho' })}><Icon n="edit" /> Dados do plano</button>}
                {editavel && sujos.size > 0 && <button className="pa-btn pa-btn--ghost" onClick={descartar}><Icon n="undo" /> Descartar</button>}
                {editavel && <button className="pa-btn pa-btn--green" onClick={() => salvar()} disabled={salvando}>
                    <Icon n="save" /> {salvando ? 'Salvando…' : `Salvar${sujos.size ? ` (${sujos.size})` : ''}`}
                </button>}
                <button className="pa-btn pa-btn--ghost" onClick={voltar}>Voltar</button>
            </div>

            {encerrado && (
                <div className="pa-aviso no-print"><Icon n="lock" /> Plano <b>encerrado</b>{cabecalho.data_encerramento ? ` em ${dataBR(cabecalho.data_encerramento)}` : ''} - somente leitura.
                    {cabecalho.justificativa_encerramento && <span> Justificativa: {cabecalho.justificativa_encerramento}</span>}
                </div>
            )}
            {!permissoes.editar && !encerrado && <div className="pa-aviso pa-aviso--info no-print"><Icon n="lock" /> Somente leitura: para editar é preciso ter permissão de edição, ser o criador do plano ou ter lotação no projeto. Você pode apontar horas nas ações em que faz parte da equipe.</div>}

            {aba === 'historico' ? (
                <div className="pa-card pa-card--pad">
                    <h3 style={{ marginTop: 0, color: 'var(--pine)' }}>Histórico de alterações <small style={{ color: 'var(--muted)', fontWeight: 500 }}>(últimos 500 eventos)</small></h3>
                    <div className="pa-tabela-wrap">
                        <table className="pa-tabela">
                            <thead><tr><th>Data/hora</th><th>Usuário</th><th>Evento</th><th>Ação do plano</th><th>De</th><th>Para</th></tr></thead>
                            <tbody>
                                {historico.map(h => (
                                    <tr key={h.id_historico}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{new Date(h.data_hora).toLocaleString('pt-BR')}</td>
                                        <td>{h.usuario || '-'}</td>
                                        <td><b>{ROTULO_ACAO_HIST[h.acao] || h.acao}</b>{h.campo ? ` · ${ROTULO_CAMPO[h.campo] || h.campo}` : ''}</td>
                                        <td style={{ maxWidth: 320 }}>{h.item || '-'}</td>
                                        <td className="pa-hist-val">{fmtHist(h.campo, h.valor_anterior, equipeDisponivel)}</td>
                                        <td className="pa-hist-val">{fmtHist(h.campo, h.valor_novo, equipeDisponivel)}</td>
                                    </tr>
                                ))}
                                {!historico.length && <tr><td colSpan="6" className="pa-empty">Sem eventos registrados.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
            <>
            {editavel && unidadesExtras.length > 0 && (
                <div className="pa-addbar no-print">
                    <strong>+ Adicionar unidade ao plano:</strong>
                    <select value={unidadeAdd} onChange={e => setUnidadeAdd(e.target.value)}>
                        <option value="">Selecione…</option>
                        {unidadesExtras.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                    </select>
                    <button className="pa-btn pa-btn--green" onClick={adicionarUnidade}>Incluir</button>
                </div>
            )}

            <div className="pa-filtros pa-filtros--grade no-print">
                <div className="pa-field" style={{ flex: 2 }}>
                    <label>Buscar na grade</label>
                    <input value={filtroGrade.busca} placeholder="Ação, observação, cliente…" onChange={e => setFiltroGrade(f => ({ ...f, busca: e.target.value }))} />
                </div>
                <div className="pa-field">
                    <label>Situação</label>
                    <select value={filtroGrade.status} onChange={e => setFiltroGrade(f => ({ ...f, status: e.target.value }))}>
                        <option value="">Todas</option>{STATUS_SERII.map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <div className="pa-field">
                    <label>Responsável</label>
                    <select value={filtroGrade.responsavel} onChange={e => setFiltroGrade(f => ({ ...f, responsavel: e.target.value }))}>
                        <option value="">Todos</option>{responsaveisPlano.map(s => <option key={s}>{s}</option>)}
                    </select>
                </div>
                <label className="pa-check"><input type="checkbox" checked={filtroGrade.atrasados} onChange={e => setFiltroGrade(f => ({ ...f, atrasados: e.target.checked }))} /> Só atrasadas</label>
                <label className="pa-check"><input type="checkbox" checked={filtroGrade.meus} onChange={e => setFiltroGrade(f => ({ ...f, meus: e.target.checked }))} /> Minhas ações</label>
                {filtroAtivo && <button className="pa-btn pa-btn--ghost" onClick={() => setFiltroGrade({ busca: '', status: '', responsavel: '', atrasados: false, meus: false })}>Limpar ({nVisiveis}/{itens.length})</button>}
            </div>

            <div className="pa-sheet" ref={printRef} data-print-root>
                <div className="pa-doc-head">
                    <div className="pa-doc-id">
                        <h1>{cabecalho.titulo}</h1>
                        <div className="pa-doc-meta">
                            <span><b>Projeto:</b> {cabecalho.nome_projeto || '-'}</span>
                            <span><b>Cliente:</b> {clienteDoPlano(cabecalho) || '-'}</span>
                            <span><b>Produto:</b> {modulosPlano.length ? modulosPlano.join(', ') : (cabecalho.nome_produto || '-')}</span>
                            {cabecalho.sub_tipo && <span><b>Tipo:</b> {cabecalho.sub_tipo}</span>}
                            <span><b>Criado em:</b> {dataBR(cabecalho.data_criacao)}</span>
                            <span><b>Prazo do plano:</b> {dataBR(cabecalho.data_inicio_prevista)} a {dataBR(cabecalho.data_fim_prevista)}</span>
                            <span><b>Situação:</b> {cabecalho.status}</span>
                        </div>
                        {cabecalho.descricao && <p className="pa-doc-desc">{cabecalho.descricao}</p>}
                    </div>
                    {logo && <img className="pa-doc-logo" src={logo} alt="Opera Echo" />}
                </div>

                {/* Indicadores do plano */}
                <div className="pa-ind">
                    <div className="pa-ind-prog">
                        <div className="pa-ind-topo"><b>Execução {ind.progresso ?? 0}%</b><span>esperado até hoje {ind.esperado ?? 0}%</span></div>
                        <div className="pa-prog-trilho pa-prog-trilho--g"><span style={{ width: `${ind.progresso || 0}%` }} /><i style={{ left: `${ind.esperado || 0}%` }} /></div>
                    </div>
                    <div className="pa-ind-kpi"><small>Saúde</small><span className="pa-saude" style={{ background: cs.bg, color: cs.fg, borderColor: cs.bd }}>{ind.saude || '-'}</span></div>
                    <div className="pa-ind-kpi"><small>Ações</small><b>{ind.fechados ?? 0}/{ind.total ?? 0}</b></div>
                    <div className="pa-ind-kpi"><small>Em andamento</small><b>{ind.andamento ?? 0}</b></div>
                    <div className="pa-ind-kpi"><small>Atrasadas</small><b style={{ color: ind.atrasados ? 'var(--danger)' : undefined }}>{ind.atrasados ?? 0}</b></div>
                    <div className="pa-ind-kpi"><small>Vencem em 7d</small><b>{ind.vencendo_7d ?? 0}</b></div>
                    <div className="pa-ind-kpi"><small>Aderência</small><b>{ind.aderencia == null ? '-' : `${ind.aderencia}%`}</b></div>
                    <div className="pa-ind-kpi"><small>Horas trabalhadas</small><b>{fmtMin(ind.trabalhado_min)}</b></div>
                </div>

                <div className="pa-grid-scroll" ref={gridScrollRef}>
                    <table className="pa-grid">
                        <thead>
                            <tr className="lvl1">
                                <th rowSpan="2" className="pa-col-ord no-export">#</th>
                                <th rowSpan="2">Ação a ser realizada</th>
                                <th rowSpan="2">Cliente</th>
                                <th rowSpan="2">Responsável</th>
                                <th rowSpan="2">Equipe</th>
                                <th rowSpan="2">Observação / Justificativa</th>
                                <th className="col-prev center" colSpan="2">Prazo Previsto</th>
                                <th className="col-real center" colSpan="2">Execução Realizada</th>
                                <th className="col-temp center" colSpan="4">Tempo & Execução</th>
                                <th rowSpan="2">Situação</th>
                                <th rowSpan="2">Prioridade</th>
                                <th rowSpan="2" className="no-export"> </th>
                            </tr>
                            <tr>
                                <th className="col-prev center">Início</th>
                                <th className="col-prev center">Fim</th>
                                <th className="col-real center">Início</th>
                                <th className="col-real center">Fim</th>
                                <th className="col-temp center">%</th>
                                <th className="col-temp center">Previsto</th>
                                <th className="col-temp center">Gasto</th>
                                <th className="col-temp center">Horas trab.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {grupos.map((bloco, bi) => {
                                const temVisivel = [...Object.values(bloco.subgrupos).flat(), ...Object.values(bloco.porUnidade).flatMap(u => u.itens)].some(visivel);
                                if (filtroAtivo && !temVisivel) return null;
                                return (
                                    <React.Fragment key={bi}>
                                        {temModulos && bloco.modulo && (
                                            <tr className="pa-row-modulo">
                                                <td colSpan={COLS}>
                                                    <Icon n="puzzle" /> MÓDULO {bloco.modulo}
                                                    <span className="pa-prog">{bloco.fechados}/{bloco.total} · {bloco.progresso}% concluído</span>
                                                </td>
                                            </tr>
                                        )}

                                        {Object.keys(bloco.subgrupos).map((g, gi) => {
                                            const lista = bloco.subgrupos[g];
                                            const vis = lista.filter(visivel);
                                            if (filtroAtivo && !vis.length) return null;
                                            return (
                                                <React.Fragment key={g}>
                                                    <CabecalhoEtapa cols={COLS} numero={gi + 1} nome={g} lista={lista} hoje={hoje} editavel={editavel}
                                                        onNovaAcao={() => incluirItem({ grupo: g, modulo: bloco.modulo, rotulo: g })}
                                                        onRenomear={(novo) => renomearEtapa(bloco.modulo, g, novo)}
                                                        onExcluir={() => excluirEtapa(bloco.modulo, g, lista.length)} />
                                                    {vis.map(item => <Linha key={item.id_item} {...linhaProps(item)} />)}
                                                    {editavel && !filtroAtivo && (
                                                        <LinhaRapida cols={COLS} placeholder={`Adicionar ação em ${g}… (Enter)`}
                                                            onAdicionar={(t) => gravarAcao({ grupo: g, modulo: bloco.modulo }, { descricao: t })} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                        {editavel && !filtroAtivo && <LinhaNovaEtapa cols={COLS} modulo={bloco.modulo} onCriar={(n) => criarEtapa(bloco.modulo, n)} />}

                                        {Object.keys(bloco.porUnidade).sort().map(uni => {
                                            const { id, itens: lista } = bloco.porUnidade[uni];
                                            const vis = lista.filter(visivel);
                                            if (filtroAtivo && !vis.length) return null;
                                            return (
                                                <React.Fragment key={uni}>
                                                    <CabecalhoEtapa unidade cols={COLS} nome={uni} lista={lista} hoje={hoje} editavel={editavel}
                                                        onNovaAcao={() => incluirItem({ modulo: bloco.modulo, id_unidade: id, rotulo: uni })}
                                                        onExcluir={() => removerUnidade(id, uni)} />
                                                    {vis.map(item => <Linha key={item.id_item} {...linhaProps(item)} />)}
                                                    {editavel && !filtroAtivo && (
                                                        <LinhaRapida cols={COLS} placeholder={`Adicionar ação na unidade ${uni}… (Enter)`}
                                                            onAdicionar={(t) => gravarAcao({ modulo: bloco.modulo, id_unidade: id }, { descricao: t })} />
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                            {!filtroAtivo && unidadesVazias.map(u => (
                                <React.Fragment key={`vz-${u.id_unidade}`}>
                                    <CabecalhoEtapa unidade cols={COLS} nome={u.nome_unidade} lista={[]} hoje={hoje} editavel={editavel}
                                        onNovaAcao={() => incluirItem({ modulo: modulosPlano[0] || null, id_unidade: u.id_unidade, rotulo: u.nome_unidade })}
                                        onExcluir={() => removerUnidade(u.id_unidade, u.nome_unidade)} />
                                    {editavel && <LinhaRapida cols={COLS} placeholder={`Adicionar ação na unidade ${u.nome_unidade}… (Enter)`}
                                        onAdicionar={(t) => gravarAcao({ modulo: modulosPlano[0] || null, id_unidade: u.id_unidade }, { descricao: t })} />}
                                </React.Fragment>
                            ))}
                            {!itens.length && !etapasNovas.length && (
                                <tr><td colSpan={COLS} className="pa-vazio-plano">
                                    <Icon n="clipboard" /> <b>Plano ainda sem etapas.</b> {editavel ? 'Crie a primeira etapa abaixo e cadastre as ações.' : ''}
                                </td></tr>
                            )}
                            {filtroAtivo && !nVisiveis && <tr><td colSpan={COLS} className="pa-empty">Nenhuma ação corresponde aos filtros.</td></tr>}
                        </tbody>
                    </table>
                </div>

                <div className="pa-doc-foot">
                    <span>Opera Echo - Sistema de Gestão da Qualidade</span>
                    <span><b>Gerado por:</b> {nomeUsuario} &nbsp;|&nbsp; <b>Em:</b> {new Date().toLocaleString('pt-BR')}</span>
                </div>
            </div>
            </>
            )}

            {modal?.tipo === 'equipe' && (
                <ModalEquipe
                    item={itens.find(i => i.id_item === modal.item.id_item) || modal.item}
                    disponiveis={equipeDisponivel} editavel={editavel}
                    onFechar={() => setModal(null)}
                    onAplicar={(lista) => { onChange(modal.item.id_item, 'equipe', lista); setModal(null); }}
                />
            )}
            {modal?.tipo === 'horas' && (
                <ModalHoras
                    item={modal.item} equipe={equipeDisponivel} editavel={editavel} podeApontar={!encerrado}
                    usuarioId={usuarioLogado.id_usuario}
                    onFechar={async (mudou) => {
                        setModal(null);
                        if (mudou) {
                            if (sujos.size) {
                                // preserva edições locais: atualiza só horas/status do item afetado
                                try {
                                    const r = await api.get(`/plano-acao/${idAtual}`);
                                    const novo = (r.data.etapas || []).find(i => i.id_item === modal.item.id_item);
                                    if (novo) setItens(prev => prev.map(i => i.id_item === novo.id_item
                                        ? { ...i, horas_trabalhadas: novo.horas_trabalhadas, equipe: sujos.has(i.id_item) ? i.equipe : novo.equipe,
                                            status: sujos.has(i.id_item) ? i.status : novo.status, data_inicio_real: sujos.has(i.id_item) ? i.data_inicio_real : novo.data_inicio_real } : i));
                                    setIndicadores(r.data.indicadores);
                                } catch (e) { /* noop */ }
                            } else carregarPlano(idAtual, true);
                        }
                    }}
                />
            )}
            {modal?.tipo === 'acao' && (
                <ModalAcao ctx={modal.ctx} clientePadrao={clienteDoPlano(cabecalho)} onFechar={() => setModal(null)}
                    onSalvar={async (dados) => { if (await gravarAcao(modal.ctx, dados)) setModal(null); }} />
            )}
            {modal?.tipo === 'cabecalho' && (
                <ModalCabecalho
                    cabecalho={cabecalho}
                    onFechar={() => setModal(null)}
                    onSalvo={() => { setModal(null); carregarPlano(idAtual, true); }}
                />
            )}
        </div>
    );

}

/* Valor legível no histórico */
function fmtHist(campo, v, equipe) {
    if (v == null || v === '') return '-';
    if (/^data_/.test(campo || '')) return dataBR(v);
    if (campo === 'equipe') {
        const m = new Map((equipe || []).map(e => [String(e.id_usuario), nomeCurto(e.nome_completo)]));
        return String(v).split(',').filter(Boolean).map(id => m.get(id) || `#${id}`).join(', ') || '-';
    }
    return String(v);
}

/* Campo de texto de altura automática (sem alça, não corta na exportação) */
function AutoTextarea({ value, onChange, className, maxLength, disabled, placeholder }) {
    const ref = useRef(null);
    const ajustar = () => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } };
    useEffect(() => { ajustar(); }, [value]);
    return (
        <textarea ref={ref} className={className} value={value} maxLength={maxLength} rows={1} disabled={disabled} placeholder={placeholder}
            onChange={e => { onChange(e); ajustar(); }} />
    );
}

/* ================================ LINHA ================================= */
function Linha({ item, onChange, bloqueado, editavel, hoje, sujo, clientePadrao, podeApontar, onEquipe, onHoras, onExcluir, onInserir, onMover }) {
    const cor = COR_STATUS[item.status] || COR_STATUS['A Iniciar'];
    const emAndamento = item.status === EM_ANDAMENTO;
    const fechado = item.status === 'Fechado';
    const liberadoPrevisto = editavel && emAndamento && !bloqueado;
    const tituloPrev = bloqueado ? 'Travado após salvar'
        : (emAndamento ? 'Informe hh:mm (trava ao salvar)' : 'Liberado apenas quando a situação for "Em andamento"');
    const vencido = !fechado && soData(item.data_fim) && soData(item.data_fim) < hoje;
    const equipe = item.equipe || [];
    const set = (campo) => (e) => onChange(item.id_item, campo, e.target.value);

    return (
        <tr className={`${vencido ? 'pa-tr--vencido' : ''} ${sujo ? 'pa-tr--sujo' : ''} ${fechado ? 'pa-tr--fechado' : ''}`}>
            <td className="pa-col-ord no-export">
                {editavel && (
                    <div className="pa-mover">
                        <button title="Mover para cima" onClick={() => onMover('cima')}><Icon n="arrow-up" /></button>
                        <button title="Mover para baixo" onClick={() => onMover('baixo')}><Icon n="arrow-down" /></button>
                    </div>
                )}
            </td>
            <td className="pa-cell-acao">
                {editavel
                    ? <AutoTextarea className="pa-in pa-in--acao" value={item.descricao || ''} maxLength={1000} onChange={set('descricao')} />
                    : <div className="pa-acao-text">{item.descricao}</div>}
            </td>
            <td className="pa-cell-cli">
                <input type="text" className="pa-in" value={item.cliente || ''} maxLength={200} disabled={!editavel}
                    placeholder={clientePadrao || '-'} onChange={set('cliente')} />
            </td>
            <td className="pa-cell-resp">
                <select className="pa-in" value={item.responsavel || ''} disabled={!editavel} onChange={set('responsavel')}>
                    <option value="">-</option>
                    {[...new Set([...OPCOES_RESPONSAVEL, ...(item.responsavel ? [item.responsavel] : [])])].map(o => <option key={o} value={o}>{o}</option>)}
                </select>
            </td>
            <td className="pa-cell-eq">
                <button className="pa-equipe" onClick={onEquipe} title={equipe.map(e => nomeCurto(e.nome_completo)).join(', ') || (editavel ? 'Definir equipe' : 'Sem equipe')}>
                    {equipe.slice(0, 3).map(e => <span key={e.id_usuario} className="pa-avatar">{iniciais(nomeCurto(e.nome_completo))}</span>)}
                    {equipe.length > 3 && <span className="pa-avatar pa-avatar--mais">+{equipe.length - 3}</span>}
                    {!equipe.length && <span className="pa-equipe-vazia">{editavel ? '+ equipe' : '-'}</span>}
                </button>
                <span className="pa-equipe-nomes">{equipe.map(e => nomeCurto(e.nome_completo)).join(', ')}</span>
            </td>
            <td className="pa-cell-obs">
                <AutoTextarea className="pa-in pa-in--obs" value={item.observacao || ''} maxLength={1000} disabled={!editavel}
                    onChange={set('observacao')} />
            </td>

            <td className="pa-cell-date"><input type="date" min="1900-01-01" max="2100-12-31" className="pa-in" disabled={!editavel} value={soData(item.data_inicio)} onChange={set('data_inicio')} /></td>
            <td className="pa-cell-date"><input type="date" max="2100-12-31" className={`pa-in ${vencido ? 'pa-in--venc' : ''}`} disabled={!editavel} min={soData(item.data_inicio) || undefined} value={soData(item.data_fim)} onChange={set('data_fim')} /></td>
            <td className="pa-cell-date"><input type="date" min="1900-01-01" className="pa-in" disabled={!editavel} max={hoje} value={soData(item.data_inicio_real)} onChange={set('data_inicio_real')} /></td>
            <td className="pa-cell-date"><input type="date" className="pa-in" disabled={!editavel} max={hoje} min={soData(item.data_inicio_real) || undefined} value={soData(item.data_fim_real)} onChange={set('data_fim_real')} /></td>

            <td className="pa-cell-perc">
                <input type="number" className="pa-in" min={0} max={100} step={5} disabled={!editavel || fechado}
                    value={fechado ? 100 : (item.percentual ?? '')} placeholder="0"
                    onChange={e => { const v = e.target.value === '' ? null : Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)); onChange(item.id_item, 'percentual', v); }} />
            </td>
            <td className="pa-cell-temp">
                <input
                    className={`pa-in ${bloqueado ? 'pa-in--lock' : ''} ${!liberadoPrevisto ? 'pa-in--disabled' : ''}`}
                    type="text" inputMode="numeric" placeholder="hh:mm" maxLength={5}
                    value={item._tempo_str !== undefined ? item._tempo_str : minParaHHMM(item.tempo_previsto)}
                    disabled={!liberadoPrevisto} title={tituloPrev}
                    onChange={e => {
                        if (!liberadoPrevisto) return;
                        const val = mascararHora(e.target.value);
                        onChange(item.id_item, '_tempo_str', val);
                        onChange(item.id_item, 'tempo_previsto', hhmmParaMin(val));
                    }}
                />
            </td>
            <td className="pa-cell-temp">
                <span className="pa-tempo" title="Calculado automaticamente entre 'Em andamento' e 'Fechado' (expediente seg-sex, 08-19h).">{minParaHHMM(item.tempo_gasto) || '-'}</span>
            </td>
            <td className="pa-cell-temp">
                <button className="pa-horas" onClick={onHoras} disabled={!podeApontar && !item.horas_trabalhadas} title="Apontamentos de horas trabalhadas">
                    {minParaHHMM(item.horas_trabalhadas) || (podeApontar ? '+ horas' : '-')}
                </button>
            </td>

            <td className="pa-cell-sit">
                <select className="pa-sit" style={{ background: cor.bg, color: cor.fg, borderColor: cor.bd }} disabled={!editavel}
                    value={item.status || 'A Iniciar'} onChange={set('status')}>
                    {statusList(item).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </td>
            <td className="pa-cell-prio">
                <select className="pa-prio" value={item.prioridade || 'Alta'} disabled={!editavel} onChange={set('prioridade')}>
                    {OPCOES_PRIORIDADE.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </td>
            <td className="pa-col-acoes no-export">
                {editavel && (
                    <div className="pa-linha-acoes">
                        <button title="Inserir ação abaixo" onClick={onInserir}><Icon n="plus" /></button>
                        <button title="Excluir ação" className="danger" onClick={onExcluir}><Icon n="trash" /></button>
                    </div>
                )}
            </td>
        </tr>
    );
}

/* ===================== ETAPAS / UNIDADES (cabeçalhos) ==================== */
function CabecalhoEtapa({ cols, numero, nome, lista, hoje, editavel, unidade = false, onNovaAcao, onRenomear, onExcluir }) {
    const [editando, setEditando] = useState(false);
    const [valor, setValor] = useState(nome);
    useEffect(() => { setValor(nome); }, [nome]);
    const total = lista.length;
    const fechados = lista.filter(i => i.status === 'Fechado').length;
    const atrasados = lista.filter(i => i.status === 'Atrasado' || (i.status !== 'Fechado' && soData(i.data_fim) && soData(i.data_fim) < hoje)).length;
    const pct = total ? Math.round((fechados / total) * 100) : 0;
    const confirmar = () => { setEditando(false); if (valor.trim() && valor.trim().toUpperCase() !== nome) onRenomear(valor); else setValor(nome); };
    return (
        <tr className={`pa-etapa ${unidade ? 'pa-etapa--uni' : ''}`}>
            <td colSpan={cols}>
                <div className="pa-etapa-bar">
                    <span className="pa-etapa-num">{unidade ? <Icon n="building" /> : String(numero).padStart(2, '0')}</span>
                    <div className="pa-etapa-tit">
                        {editando ? (
                            <input autoFocus value={valor} maxLength={120} onChange={e => setValor(e.target.value.toUpperCase())}
                                onBlur={confirmar} onKeyDown={e => { if (e.key === 'Enter') confirmar(); if (e.key === 'Escape') { setValor(nome); setEditando(false); } }} />
                        ) : (
                            <b onDoubleClick={() => editavel && !unidade && setEditando(true)} title={editavel && !unidade ? 'Duplo clique para renomear' : undefined}>{nome}</b>
                        )}
                        <small>
                            {unidade ? 'Unidade · ' : 'Etapa · '}
                            {total ? `${fechados} de ${total} ação(ões) concluída(s)` : 'nenhuma ação cadastrada'}
                            {atrasados ? <em> · {atrasados} atrasada(s)</em> : null}
                        </small>
                    </div>
                    <div className="pa-etapa-prog" title={`${pct}% concluído`}>
                        <div><span style={{ width: `${pct}%` }} /></div><b>{pct}%</b>
                    </div>
                    {editavel && (
                        <div className="pa-etapa-btns no-export no-print">
                            <button onClick={onNovaAcao} title="Nova ação (formulário completo)"><Icon n="plus" /><span>Ação</span></button>
                            {!unidade && <button onClick={() => setEditando(true)} title="Renomear etapa"><Icon n="edit" /></button>}
                            <button className="danger" onClick={onExcluir} title={unidade ? 'Remover unidade do plano' : 'Excluir etapa'}><Icon n="trash" /></button>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

function LinhaRapida({ cols, placeholder, onAdicionar }) {
    return (
        <tr className="pa-rapida-tr no-export no-print">
            <td colSpan={cols}><InclusaoRapida placeholder={placeholder} onAdicionar={onAdicionar} /></td>
        </tr>
    );
}

function LinhaNovaEtapa({ cols, modulo, onCriar }) {
    const [aberto, setAberto] = useState(false);
    const [nome, setNome] = useState('');
    const criar = () => { if (!nome.trim()) return; onCriar(nome); setNome(''); setAberto(false); };
    return (
        <tr className="pa-nova-etapa-tr no-export no-print">
            <td colSpan={cols}>
                {aberto ? (
                    <div className="pa-nova-etapa">
                        <span className="pa-etapa-num pa-etapa-num--novo"><Icon n="plus" /></span>
                        <input autoFocus value={nome} maxLength={120} placeholder={`Nome da nova etapa${modulo ? ` em ${modulo}` : ''} (ex.: TREINAMENTO)`}
                            onChange={e => setNome(e.target.value.toUpperCase())}
                            onKeyDown={e => { if (e.key === 'Enter') criar(); if (e.key === 'Escape') setAberto(false); }} />
                        <button className="pa-btn pa-btn--green" onClick={criar} disabled={!nome.trim()}>Criar etapa</button>
                        <button className="pa-btn pa-btn--ghost" onClick={() => setAberto(false)}>Cancelar</button>
                    </div>
                ) : (
                    <button className="pa-nova-etapa-btn" onClick={() => setAberto(true)}><Icon n="plus" /> Nova etapa{modulo ? ` em ${modulo}` : ''}</button>
                )}
            </td>
        </tr>
    );
}

/* ================================ MODAIS ================================ */
function ModalAcao({ ctx, clientePadrao, onFechar, onSalvar }) {
    const [f, setF] = useState({ descricao: '', responsavel: '', cliente: '', data_inicio: '', data_fim: '', prioridade: 'Alta' });
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');
    const set = (k) => (e) => setF(p => ({ ...p, [k]: e.target.value }));
    const enviar = async (e) => {
        e.preventDefault();
        if (!f.descricao.trim()) return setErro('Descreva a ação.');
        if (f.data_inicio && f.data_fim && f.data_fim < f.data_inicio) return setErro('O fim previsto não pode ser anterior ao início.');
        setErro(''); setSalvando(true);
        await onSalvar({ ...f, descricao: f.descricao.trim(), responsavel: f.responsavel || null, cliente: f.cliente || null, data_inicio: f.data_inicio || null, data_fim: f.data_fim || null });
        setSalvando(false);
    };
    return (
        <Modal titulo="Nova ação" onFechar={onFechar} largura={620}>
            <form onSubmit={enviar} className="pa-acao-form">
                {ctx.rotulo && <div className="pa-acao-ctx"><Icon n={ctx.id_unidade ? 'building' : 'grid'} /> {ctx.id_unidade ? 'Unidade' : 'Etapa'}: <b>{ctx.rotulo}</b>{ctx.modulo ? <span className="pa-mod-tag">{ctx.modulo}</span> : null}</div>}
                <div className="pa-field">
                    <label>O que será feito? *</label>
                    <textarea rows={3} autoFocus maxLength={1000} value={f.descricao} onChange={set('descricao')} placeholder="Descreva a ação a ser realizada" />
                </div>
                <div className="pa-form-grid">
                    <div className="pa-field">
                        <label>Responsável</label>
                        <select value={f.responsavel} onChange={set('responsavel')}>
                            <option value="">-</option>{OPCOES_RESPONSAVEL.map(o => <option key={o}>{o}</option>)}
                        </select>
                    </div>
                    <div className="pa-field">
                        <label>Cliente</label>
                        <input value={f.cliente} maxLength={200} placeholder={clientePadrao || 'Cliente do plano'} onChange={set('cliente')} />
                    </div>
                    <div className="pa-field"><label>Início previsto</label><input type="date" min="1900-01-01" max="2100-12-31" value={f.data_inicio} onChange={set('data_inicio')} /></div>
                    <div className="pa-field"><label>Fim previsto</label><input type="date" max="2100-12-31" value={f.data_fim} min={f.data_inicio || undefined} onChange={set('data_fim')} /></div>
                </div>
                <div className="pa-field">
                    <label>Prioridade</label>
                    <div className="pa-seg">
                        {OPCOES_PRIORIDADE.map(p => (
                            <button type="button" key={p} className={f.prioridade === p ? 'on' : ''} onClick={() => setF(x => ({ ...x, prioridade: p }))}>{p}</button>
                        ))}
                    </div>
                </div>
                {erro && <div className="pa-form-erro"><Icon n="alert" /> {erro}</div>}
                <div className="pa-modal-rodape">
                    <span />
                    <button type="button" className="pa-btn pa-btn--ghost" onClick={onFechar}>Cancelar</button>
                    <button type="submit" className="pa-btn pa-btn--green" disabled={salvando}><Icon n="plus" /> {salvando ? 'Incluindo…' : 'Incluir ação'}</button>
                </div>
            </form>
        </Modal>
    );
}

function Modal({ titulo, onFechar, children, largura = 560 }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onFechar(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onFechar]);
    return (
        <div className="pa-modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
            <div className="pa-modal" style={{ maxWidth: largura }} role="dialog" aria-modal="true" aria-label={titulo}>
                <div className="pa-modal-head"><h3>{titulo}</h3><button onClick={onFechar} aria-label="Fechar"><Icon n="x" /></button></div>
                <div className="pa-modal-corpo">{children}</div>
            </div>
        </div>
    );
}

function ModalEquipe({ item, disponiveis, editavel, onFechar, onAplicar }) {
    const [sel, setSel] = useState(() => new Map((item.equipe || []).map(e => [e.id_usuario, e])));
    const [busca, setBusca] = useState('');
    const [soAtivos, setSoAtivos] = useState(true);
    const lista = disponiveis.filter(u => (!soAtivos || u.ativo !== false || sel.has(u.id_usuario))
        && (!busca || nomeCurto(u.nome_completo).toLowerCase().includes(busca.toLowerCase()) || (u.nome_funcao || '').toLowerCase().includes(busca.toLowerCase())));
    const toggle = (u) => setSel(prev => { const n = new Map(prev); if (n.has(u.id_usuario)) n.delete(u.id_usuario); else n.set(u.id_usuario, { id_usuario: u.id_usuario, nome_completo: nomeCurto(u.nome_completo) }); return n; });
    return (
        <Modal titulo="Equipe da ação" onFechar={onFechar}>
            <p className="pa-modal-sub">{item.descricao}</p>
            {editavel ? (
                <>
                    <div className="pa-modal-filtro">
                        <input className="pa-modal-busca" placeholder="Buscar por nome ou função…" value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
                        <label className="pa-check"><input type="checkbox" checked={soAtivos} onChange={e => setSoAtivos(e.target.checked)} /> Só ativos</label>
                    </div>
                    <div className="pa-modal-lista">
                        {lista.map(u => (
                            <label key={u.id_usuario} className={`pa-modal-op ${sel.has(u.id_usuario) ? 'on' : ''}`}>
                                <input type="checkbox" checked={sel.has(u.id_usuario)} onChange={() => toggle(u)} />
                                <span className="pa-avatar">{iniciais(nomeCurto(u.nome_completo))}</span>
                                <span>{nomeCurto(u.nome_completo)}<small>{[u.nome_funcao, u.ativo === false ? 'inativo' : null].filter(Boolean).join(' · ')}</small></span>
                            </label>
                        ))}
                        {!lista.length && <div className="pa-empty">Ninguém encontrado.</div>}
                    </div>
                    <div className="pa-modal-rodape">
                        <span>{sel.size} selecionada(s)</span>
                        <button className="pa-btn pa-btn--ghost" onClick={onFechar}>Cancelar</button>
                        <button className="pa-btn pa-btn--green" onClick={() => onAplicar([...sel.values()])}>Aplicar</button>
                    </div>
                </>
            ) : (
                <ul className="pa-modal-lista">
                    {(item.equipe || []).map(e => <li key={e.id_usuario} className="pa-modal-op"><span className="pa-avatar">{iniciais(nomeCurto(e.nome_completo))}</span>{nomeCurto(e.nome_completo)}</li>)}
                    {!(item.equipe || []).length && <li className="pa-empty">Sem equipe definida.</li>}
                </ul>
            )}
        </Modal>
    );
}

function ModalHoras({ item, equipe, editavel, podeApontar, usuarioId, onFechar }) {
    const [lista, setLista] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [mudou, setMudou] = useState(false);
    const [form, setForm] = useState({ data_execucao: hojeLocal(), horas: '', descricao: '', id_usuario: usuarioId });
    const fechar = useCallback(() => onFechar(mudou), [onFechar, mudou]);

    const carregar = useCallback(async () => {
        setCarregando(true);
        try { const r = await api.get(`/plano-acao/itens/${item.id_item}/apontamentos`); setLista(r.data || []); }
        catch (e) { setLista([]); }
        finally { setCarregando(false); }
    }, [item.id_item]);
    useEffect(() => { carregar(); }, [carregar]);

    const total = lista.reduce((a, x) => a + (x.minutos || 0), 0);

    const apontar = async (e) => {
        e.preventDefault();
        const minutos = hhmmParaMin(form.horas);
        if (!minutos) return Swal.fire('Atenção', 'Informe as horas no formato hh:mm.', 'warning');
        try {
            await api.post(`/plano-acao/itens/${item.id_item}/apontamentos`, { data_execucao: form.data_execucao, minutos, descricao: form.descricao, id_usuario: form.id_usuario });
            setForm(f => ({ ...f, horas: '', descricao: '' }));
            setMudou(true);
            carregar();
        } catch (err) { Swal.fire({ icon: 'warning', title: 'Não foi possível apontar', html: msgErro(err) }); }
    };
    const excluir = async (a) => {
        const r = await Swal.fire({ title: 'Excluir apontamento?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#A23B36' });
        if (!r.isConfirmed) return;
        try { await api.delete(`/plano-acao/apontamentos/${a.id_apontamento}`); setMudou(true); carregar(); }
        catch (err) { Swal.fire('Erro', msgErro(err), 'error'); }
    };

    return (
        <Modal titulo="Horas trabalhadas" onFechar={fechar} largura={680}>
            <p className="pa-modal-sub">{item.descricao}</p>
            <div className="pa-horas-total">Total apontado: <b>{fmtMin(total)}</b>{item.tempo_previsto ? <> · previsto <b>{fmtMin(item.tempo_previsto)}</b></> : null}</div>
            {podeApontar && (
                <form className="pa-horas-form" onSubmit={apontar}>
                    {editavel && (
                        <select value={form.id_usuario || ''} onChange={e => setForm(f => ({ ...f, id_usuario: parseInt(e.target.value, 10) }))}>
                            {[...new Map([...equipe.map(u => [u.id_usuario, u])]).values()].filter(u => u.ativo !== false).map(u => <option key={u.id_usuario} value={u.id_usuario}>{nomeCurto(u.nome_completo)}</option>)}
                        </select>
                    )}
                    <input type="date" min="1900-01-01" value={form.data_execucao} max={hojeLocal()} onChange={e => setForm(f => ({ ...f, data_execucao: e.target.value }))} required />
                    <input type="text" inputMode="numeric" placeholder="hh:mm" maxLength={5} value={form.horas} onChange={e => setForm(f => ({ ...f, horas: mascararHora(e.target.value) }))} required style={{ width: 90 }} />
                    <input type="text" placeholder="O que foi executado (opcional)" maxLength={500} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} style={{ flex: 1, minWidth: 160 }} />
                    <button className="pa-btn pa-btn--green" type="submit"><Icon n="plus" /> Apontar</button>
                </form>
            )}
            <div className="pa-modal-lista">
                {carregando ? <div className="pa-empty">Carregando…</div> : (
                    <table className="pa-tabela">
                        <thead><tr><th>Data</th><th>Pessoa</th><th className="center">Tempo</th><th>Descrição</th><th /></tr></thead>
                        <tbody>
                            {lista.map(a => (
                                <tr key={a.id_apontamento}>
                                    <td>{dataBR(a.data_execucao)}</td>
                                    <td>{nomeCurto(a.nome_completo)}</td>
                                    <td className="center"><b>{minParaHHMM(a.minutos)}</b></td>
                                    <td>{a.descricao || '-'}</td>
                                    <td>{podeApontar && (editavel || a.id_usuario === usuarioId || a.registrado_por === usuarioId) &&
                                        <button className="pa-icon-btn pa-icon-btn--danger" title="Excluir" onClick={() => excluir(a)}><Icon n="trash" /></button>}</td>
                                </tr>
                            ))}
                            {!lista.length && <tr><td colSpan="5" className="pa-empty">Nenhum apontamento.</td></tr>}
                        </tbody>
                    </table>
                )}
            </div>
        </Modal>
    );
}

function ModalCabecalho({ cabecalho, onFechar, onSalvo }) {
    const [f, setF] = useState({
        titulo: cabecalho.titulo || '', cliente: cabecalho.cliente || '', descricao: cabecalho.descricao || '',
        data_inicio_prevista: soData(cabecalho.data_inicio_prevista), data_fim_prevista: soData(cabecalho.data_fim_prevista)
    });
    const [salvando, setSalvando] = useState(false);
    const salvar = async (e) => {
        e.preventDefault();
        if (f.data_inicio_prevista && f.data_fim_prevista && f.data_fim_prevista < f.data_inicio_prevista)
            return Swal.fire('Atenção', 'O término previsto não pode ser anterior ao início.', 'warning');
        setSalvando(true);
        try { await api.put(`/plano-acao/${cabecalho.id_plano}`, { ...f, data_inicio_prevista: f.data_inicio_prevista || null, data_fim_prevista: f.data_fim_prevista || null }); onSalvo(); }
        catch (err) { Swal.fire('Erro', msgErro(err), 'error'); }
        finally { setSalvando(false); }
    };
    return (
        <Modal titulo="Dados do plano" onFechar={onFechar} largura={640}>
            <form className="pa-form-grid" onSubmit={salvar}>
                <div className="pa-field pa-field--span2"><label>Título *</label><input value={f.titulo} maxLength={300} required onChange={e => setF({ ...f, titulo: e.target.value })} /></div>
                <div className="pa-field pa-field--span2"><label>Cliente</label><input value={f.cliente} maxLength={200} onChange={e => setF({ ...f, cliente: e.target.value })} /></div>
                <div className="pa-field"><label>Início previsto</label><input type="date" min="1900-01-01" max="2100-12-31" value={f.data_inicio_prevista} onChange={e => setF({ ...f, data_inicio_prevista: e.target.value })} /></div>
                <div className="pa-field"><label>Término previsto</label><input type="date" max="2100-12-31" value={f.data_fim_prevista} min={f.data_inicio_prevista || undefined} onChange={e => setF({ ...f, data_fim_prevista: e.target.value })} /></div>
                <div className="pa-field pa-field--span2"><label>Objetivo / escopo</label><textarea rows={3} maxLength={1000} value={f.descricao} onChange={e => setF({ ...f, descricao: e.target.value })} /></div>
                <div className="pa-modal-rodape pa-field--span2">
                    <span />
                    <button type="button" className="pa-btn pa-btn--ghost" onClick={onFechar}>Cancelar</button>
                    <button type="submit" className="pa-btn pa-btn--green" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
                </div>
            </form>
        </Modal>
    );
}
