/* ARQUIVO: src/FaturamentoConsolidado.jsx
 * Operações > Painéis > Faturamento Consolidado.
 * Evolução mês a mês da produção lançada (BPA/APAC/AIH valorizados pela SIGTAP):
 * indicadores, série mensal, onde trabalhar (quedas, altas, procedimentos que
 * pararam, unidades sem envio), grupos, análise individual, ranking, mapa de calor
 * por unidade, categorias profissionais (CBO) e exportação para Excel.
 * Todo o painel alterna entre VALOR (R$ SIGTAP) e QUANTIDADE: a produção da Atenção
 * Primária não tem valor na SIGTAP (é financiada por PAB/Previne), então nela o
 * painel abre em quantidade.
 * ------------------------------------------------------------------------ */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, LineChart, Line, ReferenceLine } from 'recharts';
import Icon from './components/Icon';
import api from './api';
import { fmtNum, fmtMoeda, fmtProc } from './sigtapUtils';
import { criarRelatorioPDF } from './pdfRelatorio';
import './SigtapConsulta.css';
import './Faturamento.css';

// Paleta categórica validada (ordem fixa; nunca reciclada). "Outros" fica em cinza.
const CORES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const COR_OUTROS = '#a8a79f';
const COR_SERIE = 'var(--pine)';
// Estruturas de atendimento: o servidor informa a estrutura de cada produto (aps, esp, hosp)
const ESTRUTURAS = [
    { v: 'aps', rotulo: 'Atenção Primária' },
    { v: 'esp', rotulo: 'Atenção Especializada' },
    { v: 'hosp', rotulo: 'Hospitalar e Urgência' }
];
const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

const rotComp = (c) => (/^\d{6}$/.test(c || '') ? `${MESES[+c.slice(4) - 1]}/${c.slice(2, 4)}` : '-');
const proxComp = (c) => { let a = +c.slice(0, 4), m = +c.slice(4) + 1; if (m > 12) { m = 1; a++; } return `${a}${String(m).padStart(2, '0')}`; };
const faixaComps = (ini, fim) => { const r = []; let c = ini; while (c <= fim && r.length < 120) { r.push(c); c = proxComp(c); } return r; };
const varPerc = (atual, ant) => (ant ? (atual - ant) / ant : null);
const fmtVar = (v) => (v === null || v === undefined ? '-' : `${v > 0 ? '+' : ''}${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`);
const fmtPart = (v) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const moedaCurta = (v) => {
    const a = Math.abs(v);
    if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
    if (a >= 1e3) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
    return `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
};
const numCurto = (v) => (Math.abs(v) >= 1e3 ? `${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : fmtNum(v));
const comSinal = (v, fmt) => `${v > 0 ? '+' : ''}${fmt(v)}`;

/** Seta + variação com cor de sinal; nunca só a cor. */
function Delta({ v }) {
    if (v === null || v === undefined || !isFinite(v)) return <span className="ft-delta neutro">-</span>;
    const cls = Math.abs(v) < 0.0005 ? 'neutro' : v > 0 ? 'alta' : 'queda';
    return <span className={`ft-delta ${cls}`}>{v > 0 ? '▲' : v < 0 ? '▼' : '■'} {fmtVar(v)}</span>;
}

/** Mini gráfico de linha (tendência do procedimento). */
function Sparkline({ valores }) {
    const max = Math.max(...valores, 0);
    if (!max) return <svg className="ft-spark" viewBox="0 0 80 24" aria-hidden="true"><line x1="0" y1="22" x2="80" y2="22" /></svg>;
    const passo = valores.length > 1 ? 80 / (valores.length - 1) : 0;
    const pts = valores.map((v, i) => `${(i * passo).toFixed(1)},${(22 - (v / max) * 19).toFixed(1)}`).join(' ');
    const ult = valores.length - 1;
    return (
        <svg className="ft-spark" viewBox="-2 0 84 24" aria-hidden="true">
            <polyline points={pts} />
            <circle cx={ult * passo} cy={22 - (valores[ult] / max) * 19} r="2.4" />
        </svg>
    );
}

function DicaGrafico({ active, payload, label, formato }) {
    if (!active || !payload?.length) return null;
    const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
    return (
        <div className="ft-dica">
            <b>{label}</b>
            {[...payload].reverse().filter(p => p.value).map(p => (
                <div key={p.dataKey}><i style={{ background: p.color || p.fill }} />{p.name}<span className="mono">{formato(p.value)}</span></div>
            ))}
            {payload.length > 1 && <div className="ft-dica-total">Total<span className="mono">{formato(total)}</span></div>}
        </div>
    );
}

/** Mais da metade da quantidade sem valor SIGTAP = produção de Atenção Primária: abre em quantidade.
 *  Com internação (AIH) no recorte, abre sempre em valor. */
const metricaSugerida = (d) => {
    if (d.mensal.some(m => m.qt_aih > 0)) return 'vl';
    const qt = d.procedimentos.reduce((s, p) => s + p.qt, 0);
    const semValor = d.procedimentos.filter(p => !p.vl).reduce((s, p) => s + p.qt, 0);
    return qt && semValor / qt > 0.5 ? 'qt' : 'vl';
};

export default function FaturamentoConsolidado({ aoVoltar, aoAbrirLancamento }) {
    const [opcoes, setOpcoes] = useState({ projetos: [], unidades: [], produtos: [] });
    const [filtro, setFiltro] = useState({ projeto: '', unidade: '', estrutura: '', produto: '', tipo: '', de: '', ate: '' });
    const [dados, setDados] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [metrica, setMetrica] = useState('vl');          // vl | qt (todo o painel)
    const [acumulado, setAcumulado] = useState(false);
    const [procSel, setProcSel] = useState('');
    const [busca, setBusca] = useState('');
    const [ordem, setOrdem] = useState({ campo: 'total', desc: true });
    const [verTodos, setVerTodos] = useState(false);

    useEffect(() => {
        api.get('/faturamento/opcoes').then(r => setOpcoes(r.data)).catch(() => {});
    }, []);

    const carregar = useCallback(async (f = filtro) => {
        setCarregando(true);
        try {
            const est = ESTRUTURAS.find(e => e.v === f.estrutura);
            const produtos = est && !f.produto ? opcoes.produtos.filter(p => p.estrutura === est.v).map(p => p.id_produto).join(',') || '0' : '';
            const { estrutura, ...params } = f; // eslint-disable-line no-unused-vars
            const { data } = await api.get('/faturamento/painel', { params: { ...params, produtos } });
            setDados(data);
            setMetrica(metricaSugerida(data));
        } catch (e) {
            Swal.fire('Erro', e.response?.data?.erro || 'Não foi possível carregar o painel.', 'error');
        } finally { setCarregando(false); }
    }, [filtro, opcoes.produtos]);

    useEffect(() => { carregar(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const aplicar = (campo, valor) => {
        const f = { ...filtro, [campo]: valor };
        if (campo === 'projeto') f.unidade = '';
        if (campo === 'estrutura') f.produto = '';
        if (campo === 'projeto' || campo === 'unidade') { f.de = ''; f.ate = ''; }
        setFiltro(f);
        setProcSel('');
        carregar(f);
    };

    const ehValor = metrica === 'vl';
    // Quantidade sempre inteira (a média mensal pode vir fracionada)
    const fmtM = ehValor ? fmtMoeda : (v) => fmtNum(Math.round(v));
    const fmtEixo = ehValor ? moedaCurta : numCurto;
    const unidadeM = ehValor ? 'R$' : 'procedimentos';

    // ------------------------------------------------------------------ consolidação
    const m = useMemo(() => {
        if (!dados || !dados.mensal.length) return null;
        const comps = faixaComps(dados.mensal[0].competencia, dados.mensal[dados.mensal.length - 1].competencia);
        const porComp = Object.fromEntries(dados.mensal.map(x => [x.competencia, x]));
        const ultima = comps[comps.length - 1], penultima = comps[comps.length - 2], primeira = comps[0];
        let acum = 0;
        const serie = comps.map((c, i) => {
            const x = porComp[c];
            const vl = x ? x.vl_total : 0, qt = x ? x.qt_total : 0, v = ehValor ? vl : qt;
            acum += v;
            const ant = i > 0 ? (porComp[comps[i - 1]] || { vl_total: 0, qt_total: 0 }) : null;
            const vAnt = ant ? (ehValor ? ant.vl_total : ant.qt_total) : null;
            return {
                c, rot: rotComp(c), vl, qt, v, acum, sem: !x, uni: x?.qt_unidades || 0, pac: x?.qt_pacientes || 0, aih: x?.qt_aih || 0,
                varV: ant ? v - vAnt : null, varP: ant ? varPerc(v, vAnt) : null
            };
        });

        // Procedimentos (v = mapa da métrica ativa por competência)
        const procs = new Map();
        dados.procedimentos.forEach(p => {
            let it = procs.get(p.co_procedimento);
            if (!it) {
                it = { cod: p.co_procedimento, nome: p.no_procedimento || 'Não encontrado na SIGTAP', grupo: p.co_procedimento.slice(0, 4), vl: {}, qt: {}, totalVl: 0, totalQt: 0 };
                procs.set(p.co_procedimento, it);
            }
            if (p.no_procedimento) it.nome = p.no_procedimento;
            it.vl[p.competencia] = (it.vl[p.competencia] || 0) + p.vl;
            it.qt[p.competencia] = (it.qt[p.competencia] || 0) + p.qt;
            it.totalVl += p.vl; it.totalQt += p.qt;
        });
        const total = serie.reduce((s, x) => s + x.v, 0);
        const listaProcs = [...procs.values()].map(p => {
            const v = ehValor ? p.vl : p.qt, tot = ehValor ? p.totalVl : p.totalQt;
            return {
                ...p, v, total: tot,
                part: total ? tot / total : 0,
                varUlt: penultima ? (v[ultima] || 0) - (v[penultima] || 0) : 0,
                varPeriodo: varPerc(v[ultima] || 0, v[primeira] || 0),
                meses: comps.filter(c => (p.qt[c] || 0) > 0).length
            };
        });

        // Grupos (subgrupo SIGTAP: 4 primeiros dígitos)
        const grupos = new Map();
        listaProcs.forEach(p => {
            const g = grupos.get(p.grupo) || { cod: p.grupo, nome: dados.subgrupos[p.grupo] || 'Subgrupo não identificado', v: {}, total: 0 };
            comps.forEach(c => { g.v[c] = (g.v[c] || 0) + (p.v[c] || 0); });
            g.total += p.total;
            grupos.set(p.grupo, g);
        });
        const gruposOrd = [...grupos.values()].filter(g => g.total > 0).sort((a, b) => b.total - a.total);
        const topGrupos = gruposOrd.slice(0, gruposOrd.length > 8 ? 7 : 8);
        const outros = gruposOrd.slice(topGrupos.length);
        // Cor fixa por grupo (pela ordem do código, não pelo ranking: não repinta ao trocar filtro)
        const corGrupo = {};
        [...topGrupos].sort((a, b) => a.cod.localeCompare(b.cod)).forEach((g, i) => { corGrupo[g.cod] = CORES[i]; });
        const serieGrupos = comps.map(c => {
            const o = { c, rot: rotComp(c) };
            topGrupos.forEach(g => { o[g.cod] = g.v[c] || 0; });
            if (outros.length) o.outros = outros.reduce((s, g) => s + (g.v[c] || 0), 0);
            return o;
        });

        // Unidades × competência
        const unis = new Map();
        dados.unidades.forEach(u => {
            const it = unis.get(u.id_unidade) || { id: u.id_unidade, nome: u.nome_unidade, projeto: u.nome_projeto, v: {}, vl: {}, qt: {}, total: 0 };
            const v = ehValor ? u.vl : u.qt;
            it.v[u.competencia] = v; it.vl[u.competencia] = u.vl; it.qt[u.competencia] = u.qt; it.total += v;
            unis.set(u.id_unidade, it);
        });
        const listaUnis = [...unis.values()].sort((a, b) => b.total - a.total);
        const maxCelula = Math.max(1, ...listaUnis.flatMap(u => Object.values(u.v)));

        // CBO
        const cbos = new Map();
        dados.cbos.forEach(x => {
            const it = cbos.get(x.co_cbo) || { cod: x.co_cbo, nome: dados.ocupacoes[x.co_cbo] || `CBO ${x.co_cbo}`, v: {}, totalVl: 0, totalQt: 0, total: 0 };
            const v = ehValor ? x.vl : x.qt;
            it.v[x.competencia] = (it.v[x.competencia] || 0) + v;
            it.totalVl += x.vl; it.totalQt += x.qt; it.total += v;
            cbos.set(x.co_cbo, it);
        });
        const listaCbos = [...cbos.values()].filter(c => c.total > 0).sort((a, b) => b.total - a.total);

        // Indicadores
        const comDados = serie.filter(x => !x.sem);
        const maior = comDados.reduce((a, b) => (b.v > a.v ? b : a), comDados[0]);
        const menor = comDados.reduce((a, b) => (b.v < a.v ? b : a), comDados[0]);
        const ult = serie[serie.length - 1];
        const anteriores = comDados.filter(x => x.c < ultima).slice(-3);
        const media3 = anteriores.length ? anteriores.reduce((s, x) => s + x.v, 0) / anteriores.length : null;

        // Onde trabalhar
        const quedas = penultima ? listaProcs.filter(p => p.varUlt < 0).sort((a, b) => a.varUlt - b.varUlt).slice(0, 6) : [];
        const altas = penultima ? listaProcs.filter(p => p.varUlt > 0).sort((a, b) => b.varUlt - a.varUlt).slice(0, 6) : [];
        const pararam = penultima ? listaProcs.filter(p => (p.qt[penultima] || 0) > 0 && !(p.qt[ultima] || 0)).sort((a, b) => (b.v[penultima] || 0) - (a.v[penultima] || 0)) : [];
        const novos = penultima ? listaProcs.filter(p => !(p.qt[penultima] || 0) && (p.qt[ultima] || 0) > 0) : [];
        const semEnvio = listaUnis.filter(u => u.qt[ultima] === undefined);

        return {
            comps, serie, listaProcs, gruposOrd, topGrupos, outros, corGrupo, serieGrupos, listaUnis, maxCelula, listaCbos,
            total, totalVl: serie.reduce((s, x) => s + x.vl, 0), totalQt: serie.reduce((s, x) => s + x.qt, 0),
            maior, menor, ult, ultima, penultima, primeira, nMeses: comDados.length,
            media: comDados.length ? total / comDados.length : 0,
            crescimento: varPerc(ult.v, serie[0].v),
            vsMedia: media3 ? varPerc(ult.v, media3) : null,
            quedas, altas, pararam, novos, semEnvio,
            pacientes: comDados.reduce((s, x) => s + x.pac, 0),
            internacoes: comDados.reduce((s, x) => s + x.aih, 0)
        };
    }, [dados, ehValor]);

    // Procedimento em análise individual: o primeiro do ranking por padrão
    const procAnalise = useMemo(() => {
        if (!m) return null;
        return m.listaProcs.find(p => p.cod === procSel) || [...m.listaProcs].sort((a, b) => b.total - a.total)[0];
    }, [m, procSel]);

    const ranking = useMemo(() => {
        if (!m) return [];
        const t = busca.trim().toLowerCase();
        const dig = t.replace(/\D/g, '');
        const lista = m.listaProcs.filter(p => !t || p.nome.toLowerCase().includes(t) || (dig.length >= 2 && p.cod.includes(dig)));
        const chave = { total: 'total', var: 'varUlt', periodo: 'varPeriodo', nome: 'nome' }[ordem.campo];
        lista.sort((a, b) => {
            const x = a[chave] ?? -Infinity, y = b[chave] ?? -Infinity;
            const r = typeof x === 'string' ? x.localeCompare(y) : x - y;
            return ordem.desc ? -r : r;
        });
        return lista;
    }, [m, busca, ordem]);

    const ordenar = (campo) => setOrdem(o => ({ campo, desc: o.campo === campo ? !o.desc : campo !== 'nome' }));
    const setaOrdem = (campo) => (ordem.campo === campo ? (ordem.desc ? ' ▼' : ' ▲') : '');
    const selecionarProc = (cod) => {
        setProcSel(cod);
        requestAnimationFrame(() => document.querySelector('.ft-analise')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    };

    const exportar = () => {
        if (!m) return;
        const wb = XLSX.utils.book_new();
        const cab = m.comps.map(rotComp);
        const nomeGrupo = (cod) => `${cod} - ${dados.subgrupos[cod] || ''}`;
        const grupoPor = (campo) => {
            const g = {};
            m.listaProcs.forEach(p => { g[p.grupo] = g[p.grupo] || {}; m.comps.forEach(c => { g[p.grupo][c] = (g[p.grupo][c] || 0) + (p[campo][c] || 0); }); });
            return g;
        };
        const gv = grupoPor('vl'), gq = grupoPor('qt');
        const resumo = [['GRUPO', ...cab, 'TOTAL'],
            ...Object.keys(gv).sort().map(cod => [nomeGrupo(cod), ...m.comps.map(c => gv[cod][c]), m.comps.reduce((s, c) => s + gv[cod][c], 0)]),
            ['TOTAL GERAL (R$)', ...m.serie.map(s => s.vl), m.totalVl], [],
            ['GRUPO (QUANTIDADE)', ...cab, 'TOTAL'],
            ...Object.keys(gq).sort().map(cod => [nomeGrupo(cod), ...m.comps.map(c => gq[cod][c]), m.comps.reduce((s, c) => s + gq[cod][c], 0)]),
            ['QUANTIDADE TOTAL', ...m.serie.map(s => s.qt), m.totalQt]];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'RESUMO GERAL');
        const ordenados = [...m.listaProcs].sort((a, b) => a.cod.localeCompare(b.cod));
        const porProc = (campo) => [['GRUPO', 'PROCEDIMENTO', 'DESCRIÇÃO', ...cab, 'TOTAL'],
            ...ordenados.map(p => [nomeGrupo(p.grupo), p.cod, p.nome, ...m.comps.map(c => p[campo][c] || 0), campo === 'vl' ? p.totalVl : p.totalQt])];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porProc('vl')), 'EVOLUÇÃO VALOR');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(porProc('qt')), 'EVOLUÇÃO QUANTIDADE');
        if (m.listaUnis.length) {
            XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['UNIDADE', 'PROJETO', ...cab.map(c => `${c} R$`), ...cab.map(c => `${c} QTD`)],
                ...m.listaUnis.map(u => [u.nome, u.projeto, ...m.comps.map(c => u.vl[c] ?? ''), ...m.comps.map(c => u.qt[c] ?? '')])]), 'UNIDADES');
        }
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['COMPETENCIA', 'PROCEDIMENTO', 'DESCRIÇÃO', 'QUANTIDADE', 'VALOR TOTAL', 'GRUPO'],
            ...dados.procedimentos.map(p => [p.competencia, p.co_procedimento, p.no_procedimento, p.qt, p.vl, nomeGrupo(p.co_procedimento.slice(0, 4))])]), 'BASE');
        XLSX.writeFile(wb, `Faturamento_Consolidado_${m.primeira}_${m.ultima}.xlsx`);
    };

    // PDF no padrão dos Relatórios (pdfRelatorio.js), seguindo a métrica e os filtros da tela
    const exportarPdf = async () => {
        if (!m) return;
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            let usuario = {};
            try { usuario = JSON.parse(sessionStorage.getItem('usuario_opera')) || {}; } catch (e) { /* sem sessão */ }
            const nomeDe = (lista, campo, id, rotulo) => lista.find(x => String(x[campo]) === String(id))?.[rotulo];
            const filtrosTxt = [
                nomeDe(opcoes.projetos, 'id_projeto', filtro.projeto, 'nome_projeto'),
                nomeDe(opcoes.unidades, 'id_unidade', filtro.unidade, 'nome_unidade'),
                ESTRUTURAS.find(e => e.v === filtro.estrutura)?.rotulo,
                nomeDe(opcoes.produtos, 'id_produto', filtro.produto, 'nome_produto'),
                filtro.tipo
            ].filter(Boolean).join(' · ') || 'Todos os projetos e unidades';
            const pdf = await criarRelatorioPDF('Faturamento Consolidado',
                `Competências ${rotComp(m.primeira)} a ${rotComp(m.ultima)} · ${filtrosTxt} · ${ehValor ? 'Valor SIGTAP (R$)' : 'Quantidade produzida'}`,
                usuario.nome_completo || usuario.nome);
            const { green, blue, muted } = pdf.colors;
            const red = [162, 59, 54];
            const corVar = (v) => (v > 0 ? green : v < 0 ? red : muted);
            const celVar = (v, fmt) => (v === null || v === undefined ? '-' : { t: fmt(v), color: corVar(v) });

            // Indicadores
            pdf.kpis([
                { num: fmtM(m.total), lbl: ehValor ? 'Faturamento no período' : 'Produção no período', sub: `${m.nMeses} competência(s)${ehValor ? '' : ` · ${fmtMoeda(m.totalVl)}`}` },
                { num: fmtM(m.ult.v), lbl: `Última competência · ${rotComp(m.ultima)}`, sub: `${fmtVar(m.ult.varP)} vs ${m.penultima ? rotComp(m.penultima) : '-'}`, subColor: corVar(m.ult.varP) },
                { num: fmtM(m.media), lbl: 'Média mensal', sub: `Último mês vs média 3m: ${fmtVar(m.vsMedia)}`, subColor: corVar(m.vsMedia) },
                { num: fmtVar(m.crescimento), lbl: 'Crescimento no período', sub: `${rotComp(m.primeira)} ${fmtEixo(m.serie[0].v)} » ${rotComp(m.ultima)} ${fmtEixo(m.ult.v)}`, c: corVar(m.crescimento) },
                { num: `${rotComp(m.maior.c)} · ${fmtEixo(m.maior.v)}`, lbl: 'Melhor mês', sub: `Pior: ${rotComp(m.menor.c)} · ${fmtEixo(m.menor.v)}` },
                m.internacoes > 0
                    ? { num: fmtNum(m.internacoes), lbl: 'Internações (AIHs)', sub: `${fmtNum(m.ult.aih)} em ${rotComp(m.ultima)}` }
                    : { num: fmtNum(m.listaProcs.length), lbl: 'Procedimentos distintos', sub: `${fmtNum(m.totalQt)} realizados` }
            ]);

            // Evolução mês a mês
            pdf.bloco('Evolução mês a mês', blue);
            const meia = (pdf.CW - 8) / 2, yGraf = pdf.cursor.y;
            pdf.graficoBarras(m.serie.map(s => ({ rot: s.rot, v: s.v, cor: s.c === m.maior.c ? [27, 94, 32] : green })), { titulo: 'Mensal (barra escura = melhor mês)', fmt: fmtEixo, largura: meia });
            const yFim = pdf.cursor.y; pdf.cursor.y = yGraf;
            pdf.graficoBarras(m.serie.slice(1).map(s => ({ rot: s.rot, v: s.varV, cor: s.varV >= 0 ? green : red })), { titulo: 'Variação vs mês anterior', fmt: fmtEixo, x0: pdf.M + meia + 8, largura: meia });
            pdf.cursor.y = Math.max(yFim, pdf.cursor.y) + 2;
            const comAih = m.internacoes > 0;
            const cw = pdf.CW / (comAih ? 7 : 6);
            pdf.tabela(
                [{ h: 'Competência', w: cw, a: 'l' }, { h: 'Quantidade', w: cw, a: 'r' }, { h: 'Valor SIGTAP', w: cw, a: 'r' },
                    ...(comAih ? [{ h: 'Internações', w: cw, a: 'r' }] : []),
                    { h: 'Variação', w: cw, a: 'r' }, { h: 'Variação %', w: cw, a: 'r' }, { h: 'Acumulado', w: cw, a: 'r' }],
                m.serie.map(s => [
                    { t: s.rot + (s.sem ? ' (sem lançamento)' : ''), bold: s.c === m.maior.c }, fmtNum(s.qt), fmtMoeda(s.vl),
                    ...(comAih ? [fmtNum(s.aih)] : []),
                    celVar(s.varV, v => comSinal(v, fmtM)), celVar(s.varP, fmtVar), fmtM(s.acum)
                ]).concat([[{ t: 'TOTAL', bold: true }, { t: fmtNum(m.totalQt), bold: true }, { t: fmtMoeda(m.totalVl), bold: true },
                    ...(comAih ? [{ t: fmtNum(m.internacoes), bold: true }] : []), '', '', { t: fmtM(m.total), bold: true, color: green }]])
            );

            // Onde trabalhar
            if (m.penultima) {
                pdf.bloco(`Onde trabalhar · ${rotComp(m.ultima)} comparado a ${rotComp(m.penultima)}`, blue);
                const linhaProc = (p, valor) => [`${fmtProc(p.cod)} · ${p.nome}`, fmtM(p.v[m.penultima] || 0), fmtM(p.v[m.ultima] || 0), valor];
                const colsFoco = (rot) => [{ h: rot, w: pdf.CW * 0.58, a: 'l' }, { h: rotComp(m.penultima), w: pdf.CW * 0.14, a: 'r' }, { h: rotComp(m.ultima), w: pdf.CW * 0.14, a: 'r' }, { h: 'Variação', w: pdf.CW * 0.14, a: 'r' }];
                if (m.quedas.length) pdf.tabela(colsFoco('Maiores quedas'), m.quedas.map(p => linhaProc(p, { t: comSinal(p.varUlt, fmtM), color: red, bold: true })));
                if (m.altas.length) pdf.tabela(colsFoco('Maiores altas'), m.altas.map(p => linhaProc(p, { t: comSinal(p.varUlt, fmtM), color: green, bold: true })));
                if (m.pararam.length) pdf.tabela(colsFoco('Deixaram de ser apresentados'), m.pararam.slice(0, 15).map(p => linhaProc(p, { t: 'zero no mês', color: red })));
                if (m.listaUnis.length > 1 && m.semEnvio.length) pdf.texto(`Unidades sem envio em ${rotComp(m.ultima)}: ${m.semEnvio.map(u => u.nome).join(', ')}.`, { color: red });
            }

            // Grupos de procedimento × competência
            pdf.bloco('Por grupo de procedimento', blue);
            const wNomeG = pdf.CW * 0.26, wTot = pdf.CW * 0.09, wPart = pdf.CW * 0.06, wMes = (pdf.CW - wNomeG - wTot - wPart) / m.comps.length;
            pdf.tabela(
                [{ h: 'Grupo', w: wNomeG, a: 'l' }, ...m.comps.map(c => ({ h: rotComp(c), w: wMes, a: 'r' })), { h: 'Total', w: wTot, a: 'r' }, { h: 'Part.', w: wPart, a: 'r' }],
                m.gruposOrd.map(g => [`${g.cod} ${g.nome}`, ...m.comps.map(c => fmtEixo(g.v[c] || 0).replace('R$ ', '')), { t: fmtEixo(g.total).replace('R$ ', ''), bold: true }, fmtPart(m.total ? g.total / m.total : 0)])
            );

            // Ranking
            const top = [...m.listaProcs].sort((a, b) => b.total - a.total).slice(0, 40);
            pdf.bloco(`Ranking de procedimentos · ${top.length} maiores de ${m.listaProcs.length}`, blue);
            pdf.tabela(
                [{ h: '#', w: pdf.CW * 0.04, a: 'c' }, { h: 'Procedimento', w: pdf.CW * 0.44, a: 'l' }, { h: 'Quantidade', w: pdf.CW * 0.1, a: 'r' },
                    { h: 'Valor SIGTAP', w: pdf.CW * 0.12, a: 'r' }, { h: 'Part.', w: pdf.CW * 0.07, a: 'r' },
                    { h: m.penultima ? `${rotComp(m.penultima)}»${rotComp(m.ultima)}` : 'Var.', w: pdf.CW * 0.12, a: 'r' }, { h: 'Período', w: pdf.CW * 0.11, a: 'r' }],
                top.map((p, i) => [String(i + 1), `${fmtProc(p.cod)} · ${p.nome}`, fmtNum(p.totalQt), fmtMoeda(p.totalVl), fmtPart(p.part),
                    m.penultima ? celVar(p.varUlt, v => comSinal(v, fmtM)) : '-',
                    (p.v[m.primeira] || 0) === 0 && (p.v[m.ultima] || 0) > 0 ? { t: 'NOVO', color: green } : celVar(p.varPeriodo, fmtVar)])
            );

            // Unidades × competência
            if (m.listaUnis.length > 1) {
                pdf.bloco('Unidade × competência', blue);
                const wU = pdf.CW * 0.24, wT = pdf.CW * 0.09, wM = (pdf.CW - wU - wT) / m.comps.length;
                pdf.tabela(
                    [{ h: 'Unidade', w: wU, a: 'l' }, ...m.comps.map(c => ({ h: rotComp(c), w: wM, a: 'r' })), { h: 'Total', w: wT, a: 'r' }],
                    m.listaUnis.map(u => [u.nome, ...m.comps.map(c => (u.v[c] === undefined ? { t: 'sem envio', color: red } : fmtEixo(u.v[c]).replace('R$ ', ''))), { t: fmtEixo(u.total).replace('R$ ', ''), bold: true }])
                );
            }

            // CBO
            if (m.listaCbos.length) {
                pdf.bloco('Por categoria profissional (CBO)', blue);
                pdf.tabela(
                    [{ h: 'CBO', w: pdf.CW * 0.1, a: 'l' }, { h: 'Ocupação', w: pdf.CW * 0.45, a: 'l' }, { h: 'Quantidade', w: pdf.CW * 0.15, a: 'r' },
                        { h: 'Valor SIGTAP', w: pdf.CW * 0.15, a: 'r' }, { h: m.penultima ? `Var. ${rotComp(m.ultima)}` : 'Var.', w: pdf.CW * 0.15, a: 'r' }],
                    m.listaCbos.slice(0, 20).map(c => [c.cod, c.nome, fmtNum(c.totalQt), fmtMoeda(c.totalVl),
                        m.penultima ? celVar(varPerc(c.v[m.ultima] || 0, c.v[m.penultima] || 0), fmtVar) : '-'])
                );
            }

            pdf.texto('Valores de tabela SIGTAP da produção apresentada (BPA/APAC: serviço ambulatorial; AIH: hospitalar + profissional do procedimento principal e especiais), não o valor aprovado/pago.', { italic: true });
            pdf.finalizar(`Faturamento_Consolidado_${m.primeira}_${m.ultima}`);
            Swal.close();
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error');
        }
    };

    // ------------------------------------------------------------------ render
    const unidadesFiltro = filtro.projeto ? opcoes.unidades.filter(u => String(u.id_projeto) === String(filtro.projeto)) : opcoes.unidades;
    const compsDisp = dados?.competencias_disponiveis || [];
    const estSel = ESTRUTURAS.find(e => e.v === filtro.estrutura);
    const produtosFiltro = estSel ? opcoes.produtos.filter(p => p.estrutura === estSel.v) : opcoes.produtos;
    const tick = { fontSize: 11, fill: 'var(--text-2)' };

    return (
        <div className="cadastro-container sg ft ft-painel">
            <div className="sg-topo">
                <div className="sg-topo-tit">
                    <span className="sg-topo-ic"><Icon n="trend" /></span>
                    <div>
                        <h2>Faturamento Consolidado</h2>
                        <p>Evolução mês a mês da produção apresentada (BPA, APAC e AIH).</p>
                    </div>
                </div>
                <div className="sg-topo-acoes">
                    {m && <button className="sg-btn sg-btn-out" onClick={exportarPdf}><Icon n="printer" /> Exportar PDF</button>}
                    {m && <button className="sg-btn sg-btn-out" onClick={exportar}><Icon n="download" /> Exportar Excel</button>}
                    {aoAbrirLancamento && <button className="sg-btn sg-btn-out" onClick={aoAbrirLancamento}><Icon n="upload" /> Lançar Faturamento</button>}
                    <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
                </div>
            </div>

            <div className="sg-card ft-filtros">
                <label>Projeto
                    <select className="form-control" value={filtro.projeto} onChange={e => aplicar('projeto', e.target.value)}>
                        <option value="">Todos os projetos</option>
                        {opcoes.projetos.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                    </select>
                </label>
                <label>Unidade
                    <select className="form-control" value={filtro.unidade} onChange={e => aplicar('unidade', e.target.value)}>
                        <option value="">Todas as unidades</option>
                        {unidadesFiltro.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                    </select>
                </label>
                <label>Estrutura
                    <select className="form-control" value={filtro.estrutura} onChange={e => aplicar('estrutura', e.target.value)}>
                        <option value="">Todas</option>
                        {ESTRUTURAS.map(e => <option key={e.v} value={e.v}>{e.rotulo}</option>)}
                    </select>
                </label>
                <label>Produto
                    <select className="form-control" value={filtro.produto} onChange={e => aplicar('produto', e.target.value)}>
                        <option value="">Todos</option>
                        {produtosFiltro.map(p => <option key={p.id_produto} value={p.id_produto}>{p.nome_produto}</option>)}
                    </select>
                </label>
                <label>Tipo
                    <select className="form-control" value={filtro.tipo} onChange={e => aplicar('tipo', e.target.value)}>
                        <option value="">Todos</option>
                        <option value="BPA">BPA</option><option value="APAC">APAC</option><option value="AIH">AIH</option>
                    </select>
                </label>
                <label>Competência de
                    <select className="form-control mono" value={filtro.de} onChange={e => aplicar('de', e.target.value)}>
                        <option value="">Início</option>
                        {compsDisp.map(c => <option key={c} value={c}>{rotComp(c)}</option>)}
                    </select>
                </label>
                <label>até
                    <select className="form-control mono" value={filtro.ate} onChange={e => aplicar('ate', e.target.value)}>
                        <option value="">Última</option>
                        {compsDisp.filter(c => !filtro.de || c >= filtro.de).map(c => <option key={c} value={c}>{rotComp(c)}</option>)}
                    </select>
                </label>
            </div>

            {carregando && !m && <div className="sg-card ft-lendo"><span className="sg-spin" /> Carregando painel...</div>}

            {!carregando && dados && !m && (
                <div className="sg-card sg-vazio ft-vazio">
                    <Icon n="inbox" />
                    <b>Nenhum faturamento lançado para este filtro.</b>
                    <span>Envie os arquivos de BPA, APAC ou AIH em Operações &gt; Lançar Faturamento.</span>
                    {aoAbrirLancamento && <button className="sg-btn" onClick={aoAbrirLancamento}><Icon n="upload" /> Lançar Faturamento</button>}
                </div>
            )}

            {m && (
                <div className={`ft-corpo ${carregando ? 'carregando' : ''}`}>
                    <div className="ft-barra-metrica">
                        <div className="sg-seg ft-seg" role="tablist" aria-label="Métrica do painel">
                            <button className={ehValor ? 'ativo' : ''} onClick={() => setMetrica('vl')}><Icon n="trend" /> Valor SIGTAP (R$)</button>
                            <button className={!ehValor ? 'ativo' : ''} onClick={() => setMetrica('qt')}><Icon n="bar-chart" /> Quantidade produzida</button>
                        </div>
                        {!ehValor && m.totalVl < m.totalQt && (
                            <span className="ft-nota"><Icon n="alert" /> A maior parte desta produção não tem valor na SIGTAP (Atenção Primária é financiada por PAB/Previne Brasil). Acompanhe pela quantidade.</span>
                        )}
                    </div>

                    {/* ---------------- INDICADORES ---------------- */}
                    <div className="ft-kpis">
                        <div className="ft-kpi destaque">
                            <span>{ehValor ? 'Faturamento no período' : 'Produção no período'}</span>
                            <strong className="mono">{fmtM(m.total)}</strong>
                            <small>{rotComp(m.primeira)} a {rotComp(m.ultima)} · {m.nMeses} competência(s){ehValor ? '' : ` · ${fmtMoeda(m.totalVl)} SIGTAP`}</small>
                        </div>
                        <div className="ft-kpi">
                            <span>Última competência · {rotComp(m.ultima)}</span>
                            <strong className="mono">{fmtM(m.ult.v)}</strong>
                            <small><Delta v={m.ult.varP} /> vs {m.penultima ? rotComp(m.penultima) : '-'}</small>
                        </div>
                        <div className="ft-kpi">
                            <span>Média mensal</span>
                            <strong className="mono">{fmtM(m.media)}</strong>
                            <small>Último mês vs média 3m <Delta v={m.vsMedia} /></small>
                        </div>
                        <div className="ft-kpi">
                            <span>Crescimento no período</span>
                            <strong><Delta v={m.crescimento} /></strong>
                            <small className="mono">{rotComp(m.primeira)} {fmtEixo(m.serie[0].v)} → {rotComp(m.ultima)} {fmtEixo(m.ult.v)}</small>
                        </div>
                        <div className="ft-kpi">
                            <span>Melhor / pior mês</span>
                            <strong className="mono ft-kpi-par">{rotComp(m.maior.c)} <em>{fmtEixo(m.maior.v)}</em></strong>
                            <small className="mono">Pior: {rotComp(m.menor.c)} · {fmtEixo(m.menor.v)}</small>
                        </div>
                        {m.internacoes > 0 ? (
                            <div className="ft-kpi">
                                <span>Internações (AIHs)</span>
                                <strong className="mono">{fmtNum(m.internacoes)}</strong>
                                <small>{fmtNum(m.ult.aih)} em {rotComp(m.ultima)} <Delta v={m.serie.length > 1 ? varPerc(m.ult.aih, m.serie[m.serie.length - 2].aih) : null} /></small>
                            </div>
                        ) : (
                            <div className="ft-kpi">
                                <span>{m.pacientes ? 'Pacientes atendidos (BPA-I)' : 'Procedimentos distintos'}</span>
                                <strong className="mono">{fmtNum(m.pacientes || m.listaProcs.length)}</strong>
                                <small>{m.pacientes ? `Soma mensal · ${fmtNum(m.ult.pac)} em ${rotComp(m.ultima)}` : `${fmtNum(m.totalQt)} procedimentos realizados`}</small>
                            </div>
                        )}
                    </div>

                    {/* ---------------- EVOLUÇÃO ---------------- */}
                    <div className="ft-grade-2">
                        <div className="sg-card ft-graf-card">
                            <div className="sg-card-tit">
                                <h4><Icon n="bar-chart" /> Evolução mês a mês</h4>
                                <div className="sg-seg ft-seg">
                                    <button className={!acumulado ? 'ativo' : ''} onClick={() => setAcumulado(false)}>Mensal</button>
                                    <button className={acumulado ? 'ativo' : ''} onClick={() => setAcumulado(true)}>Acumulado</button>
                                </div>
                            </div>
                            <div className="ft-graf ft-graf-g">
                                <ResponsiveContainer>
                                    <BarChart data={m.serie} margin={{ top: 22, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
                                        <CartesianGrid vertical={false} stroke="var(--line-2)" />
                                        <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={tick} />
                                        <YAxis tickFormatter={fmtEixo} width={ehValor ? 78 : 56} tickLine={false} axisLine={false} tick={tick} />
                                        <Tooltip cursor={{ fill: 'rgba(46,125,50,.07)' }} content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const s = payload[0].payload;
                                            return (
                                                <div className="ft-dica">
                                                    <b>{label}{s.sem ? ' · sem lançamento' : ''}</b>
                                                    <div>Quantidade<span className="mono">{fmtNum(s.qt)}</span></div>
                                                    <div>Valor SIGTAP<span className="mono">{fmtMoeda(s.vl)}</span></div>
                                                    <div>Variação<span className="mono">{s.varV === null ? '-' : `${comSinal(s.varV, fmtM)} (${fmtVar(s.varP)})`}</span></div>
                                                    <div>Acumulado<span className="mono">{fmtM(s.acum)}</span></div>
                                                    {s.uni > 1 && <div>Unidades<span className="mono">{s.uni}</span></div>}
                                                </div>
                                            );
                                        }} />
                                        <Bar dataKey={acumulado ? 'acum' : 'v'} fill={COR_SERIE} radius={[4, 4, 0, 0]} maxBarSize={46}
                                            label={m.serie.length <= 14 ? { position: 'top', fontSize: 10, fill: 'var(--text-2)', formatter: (v) => fmtEixo(v).replace(/ /g, ' ') } : false}>
                                            {m.serie.map(s => <Cell key={s.c} fill={!acumulado && s.c === m.maior.c ? 'var(--pine-800)' : COR_SERIE} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {!acumulado && <small className="sg-muted ft-graf-leg">Barra mais escura = melhor mês ({rotComp(m.maior.c)})</small>}
                        </div>

                        <div className="sg-card ft-graf-card">
                            <div className="sg-card-tit"><h4><Icon n="trend" /> Variação vs mês anterior</h4><small className="sg-muted">{unidadeM}</small></div>
                            <div className="ft-graf ft-graf-g">
                                <ResponsiveContainer>
                                    <BarChart data={m.serie.slice(1)} margin={{ top: 10, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
                                        <CartesianGrid vertical={false} stroke="var(--line-2)" />
                                        <XAxis dataKey="rot" tickLine={false} axisLine={false} tick={tick} />
                                        <YAxis tickFormatter={fmtEixo} width={ehValor ? 78 : 56} tickLine={false} axisLine={false} tick={tick} />
                                        <ReferenceLine y={0} stroke="var(--muted)" />
                                        <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} content={({ active, payload, label }) => {
                                            if (!active || !payload?.length) return null;
                                            const s = payload[0].payload;
                                            return <div className="ft-dica"><b>{label}</b><div>Variação<span className="mono">{comSinal(s.varV, fmtM)}</span></div><div>Percentual<span className="mono">{fmtVar(s.varP)}</span></div></div>;
                                        }} />
                                        <Bar dataKey="varV" radius={[4, 4, 4, 4]} maxBarSize={40}>
                                            {m.serie.slice(1).map(s => <Cell key={s.c} fill={s.varV >= 0 ? 'var(--ok)' : 'var(--danger)'} />)}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="ft-legenda-sinal"><span><i className="alta" /> ▲ cresceu</span><span><i className="queda" /> ▼ caiu</span></div>
                        </div>
                    </div>

                    {/* ---------------- ONDE TRABALHAR ---------------- */}
                    {m.penultima && (
                        <div className="sg-card ft-foco">
                            <div className="sg-card-tit">
                                <h4><Icon n="target" /> Onde trabalhar</h4>
                                <small className="sg-muted">{rotComp(m.ultima)} comparado a {rotComp(m.penultima)} · clique para analisar</small>
                            </div>
                            <div className="ft-foco-grade">
                                <div className="ft-foco-col queda">
                                    <h5>▼ Maiores quedas</h5>
                                    {m.quedas.length === 0 ? <p className="sg-muted">Nenhum procedimento caiu.</p> : m.quedas.map(p => (
                                        <button key={p.cod} className="ft-foco-item" onClick={() => selecionarProc(p.cod)}>
                                            <span className="ft-foco-nome" title={p.nome}>{p.nome}</span>
                                            <span className="mono ft-foco-val ft-neg">{comSinal(p.varUlt, fmtM)}</span>
                                            <small className="mono">{fmtM(p.v[m.penultima] || 0)} → {fmtM(p.v[m.ultima] || 0)}</small>
                                        </button>
                                    ))}
                                </div>
                                <div className="ft-foco-col alta">
                                    <h5>▲ Maiores altas</h5>
                                    {m.altas.length === 0 ? <p className="sg-muted">Nenhum procedimento cresceu.</p> : m.altas.map(p => (
                                        <button key={p.cod} className="ft-foco-item" onClick={() => selecionarProc(p.cod)}>
                                            <span className="ft-foco-nome" title={p.nome}>{p.nome}</span>
                                            <span className="mono ft-foco-val ft-pos">{comSinal(p.varUlt, fmtM)}</span>
                                            <small className="mono">{fmtM(p.v[m.penultima] || 0)} → {fmtM(p.v[m.ultima] || 0)}</small>
                                        </button>
                                    ))}
                                </div>
                                <div className="ft-foco-col alerta">
                                    <h5><Icon n="alert" /> Deixaram de ser apresentados</h5>
                                    {m.pararam.length === 0 ? <p className="sg-muted">Tudo o que foi apresentado em {rotComp(m.penultima)} seguiu em {rotComp(m.ultima)}.</p> : (
                                        <>
                                            {m.pararam.slice(0, 6).map(p => (
                                                <button key={p.cod} className="ft-foco-item" onClick={() => selecionarProc(p.cod)}>
                                                    <span className="ft-foco-nome" title={p.nome}>{p.nome}</span>
                                                    <span className="mono ft-foco-val">{fmtM(p.v[m.penultima] || 0)}</span>
                                                    <small className="mono">em {rotComp(m.penultima)} · zero em {rotComp(m.ultima)}</small>
                                                </button>
                                            ))}
                                            {m.pararam.length > 6 && <small className="sg-muted">+ {m.pararam.length - 6} procedimento(s)</small>}
                                        </>
                                    )}
                                    {m.novos.length > 0 && <p className="ft-foco-nota"><b>{m.novos.length}</b> procedimento(s) novo(s) em {rotComp(m.ultima)}.</p>}
                                </div>
                                {m.listaUnis.length > 1 && (
                                    <div className="ft-foco-col alerta">
                                        <h5><Icon n="building" /> Unidades sem envio em {rotComp(m.ultima)}</h5>
                                        {m.semEnvio.length === 0 ? <p className="sg-muted">Todas as unidades enviaram.</p> : m.semEnvio.slice(0, 8).map(u => (
                                            <div key={u.id} className="ft-foco-item estatico">
                                                <span className="ft-foco-nome" title={u.nome}>{u.nome}</span>
                                                <small>{u.projeto}</small>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* ---------------- GRUPOS ---------------- */}
                    <div className="ft-grade-2 ft-grade-grupos">
                        <div className="sg-card ft-graf-card">
                            <div className="sg-card-tit"><h4><Icon n="grid" /> Por grupo de procedimento</h4><small className="sg-muted">{unidadeM}</small></div>
                            <div className="ft-graf ft-graf-g">
                                <ResponsiveContainer>
                                    <BarChart data={m.serieGrupos} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barCategoryGap="22%">
                                        <CartesianGrid vertical={false} stroke="var(--line-2)" />
                                        <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={tick} />
                                        <YAxis tickFormatter={fmtEixo} width={ehValor ? 78 : 56} tickLine={false} axisLine={false} tick={tick} />
                                        <Tooltip cursor={{ fill: 'rgba(0,0,0,.04)' }} content={<DicaGrafico formato={fmtM} />} />
                                        {m.topGrupos.map(g => <Bar key={g.cod} dataKey={g.cod} name={`${g.cod} ${g.nome}`} stackId="g" fill={m.corGrupo[g.cod]} stroke="#fff" strokeWidth={1} maxBarSize={46} />)}
                                        {m.outros.length > 0 && <Bar dataKey="outros" name="Outros grupos" stackId="g" fill={COR_OUTROS} stroke="#fff" strokeWidth={1} maxBarSize={46} />}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="sg-card">
                            <div className="sg-card-tit"><h4><Icon n="target" /> Participação no período</h4></div>
                            <div className="ft-part">
                                {m.gruposOrd.slice(0, 10).map(g => {
                                    const part = m.total ? g.total / m.total : 0;
                                    return (
                                        <div key={g.cod} className="ft-part-linha" title={`${g.cod} - ${g.nome}`}>
                                            <div className="ft-part-tit">
                                                <i style={{ background: m.corGrupo[g.cod] || COR_OUTROS }} />
                                                <span><b className="mono">{g.cod}</b> {g.nome}</span>
                                            </div>
                                            <div className="ft-part-barra"><i style={{ width: `${Math.max(part * 100, 0.6)}%`, background: m.corGrupo[g.cod] || COR_OUTROS }} /></div>
                                            <div className="ft-part-val mono">
                                                <b>{fmtPart(part)}</b>
                                                <span>{fmtEixo(g.total)}</span>
                                                {m.penultima && <Delta v={varPerc(g.v[m.ultima] || 0, g.v[m.penultima] || 0)} />}
                                            </div>
                                        </div>
                                    );
                                })}
                                {m.gruposOrd.length > 10 && <small className="sg-muted">+ {m.gruposOrd.length - 10} grupo(s) com menor participação</small>}
                                {m.gruposOrd.length === 0 && <p className="sg-muted">Sem {ehValor ? 'valor' : 'quantidade'} no período.</p>}
                            </div>
                        </div>
                    </div>

                    {/* ---------------- ANÁLISE INDIVIDUAL ---------------- */}
                    {procAnalise && (
                        <div className="sg-card ft-analise">
                            <div className="sg-card-tit">
                                <h4><Icon n="search" /> Análise do procedimento</h4>
                                <select className="form-control ft-sel-proc" value={procAnalise.cod} onChange={e => setProcSel(e.target.value)}>
                                    {[...m.listaProcs].sort((a, b) => b.total - a.total).map(p => <option key={p.cod} value={p.cod}>{p.cod} - {p.nome}</option>)}
                                </select>
                            </div>
                            <div className="ft-analise-cab">
                                <div><small>Código</small><b className="mono">{fmtProc(procAnalise.cod)}</b></div>
                                <div className="ft-analise-nome"><small>Descrição</small><b>{procAnalise.nome}</b></div>
                                <div><small>Grupo</small><b>{procAnalise.grupo} - {dados.subgrupos[procAnalise.grupo] || '-'}</b></div>
                                <div><small>Quantidade / valor</small><b className="mono">{fmtNum(procAnalise.totalQt)} · {fmtMoeda(procAnalise.totalVl)}</b></div>
                                <div><small>Participação</small><b className="mono">{fmtPart(procAnalise.part)}</b></div>
                            </div>
                            <div className="ft-grade-2">
                                <div className="ft-graf ft-graf-p">
                                    <ResponsiveContainer>
                                        <LineChart data={m.comps.map(c => ({ rot: rotComp(c), v: procAnalise.v[c] || 0 }))} margin={{ top: 14, right: 14, left: 0, bottom: 0 }}>
                                            <CartesianGrid vertical={false} stroke="var(--line-2)" />
                                            <XAxis dataKey="rot" tickLine={false} axisLine={{ stroke: 'var(--line)' }} tick={tick} />
                                            <YAxis tickFormatter={fmtEixo} width={ehValor ? 72 : 52} tickLine={false} axisLine={false} tick={tick} allowDecimals={ehValor} />
                                            <Tooltip content={<DicaGrafico formato={fmtM} />} />
                                            <Line type="monotone" dataKey="v" name={ehValor ? 'Valor' : 'Quantidade'} stroke={COR_SERIE} strokeWidth={2} dot={{ r: 4, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="sg-tabela-wrap">
                                    <table className="sg-tabela ft-tab-compacta">
                                        <thead><tr><th>Comp.</th><th className="r">Qtd</th><th className="r">Valor</th><th className="r">Var.</th><th className="r">Var. %</th><th className="r">Acumulado</th></tr></thead>
                                        <tbody>
                                            {(() => {
                                                let acc = 0;
                                                return m.comps.map((c, i) => {
                                                    const v = procAnalise.v[c] || 0, ant = i ? procAnalise.v[m.comps[i - 1]] || 0 : null;
                                                    acc += v;
                                                    return (
                                                        <tr key={c}>
                                                            <td className="mono">{rotComp(c)}</td>
                                                            <td className="r mono">{fmtNum(procAnalise.qt[c] || 0)}</td>
                                                            <td className="r mono">{fmtMoeda(procAnalise.vl[c] || 0)}</td>
                                                            <td className={`r mono ${ant !== null && v - ant < 0 ? 'ft-neg' : ant !== null && v - ant > 0 ? 'ft-pos' : ''}`}>{ant === null ? '-' : comSinal(v - ant, fmtM)}</td>
                                                            <td className="r">{ant === null ? '-' : ant === 0 ? (v ? <span className="sg-badge ok">NOVO</span> : '-') : <Delta v={varPerc(v, ant)} />}</td>
                                                            <td className="r mono">{fmtM(acc)}</td>
                                                        </tr>
                                                    );
                                                });
                                            })()}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ---------------- RANKING ---------------- */}
                    <div className="sg-card">
                        <div className="sg-card-tit">
                            <h4><Icon n="trend" /> Ranking de procedimentos</h4>
                            <input className="form-control ft-busca" placeholder="Buscar código ou nome..." value={busca} onChange={e => setBusca(e.target.value)} />
                        </div>
                        <div className="sg-tabela-wrap">
                            <table className="sg-tabela sg-resp ft-ranking">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th className="ft-ord" onClick={() => ordenar('nome')}>Procedimento{setaOrdem('nome')}</th>
                                        <th>Tendência</th>
                                        <th className="r ft-ord" onClick={() => ordenar('total')}>{ehValor ? 'Valor' : 'Quantidade'}{setaOrdem('total')}</th>
                                        <th className="r">Part.</th>
                                        <th className="r ft-ord" onClick={() => ordenar('var')}>{m.penultima ? `${rotComp(m.penultima)} → ${rotComp(m.ultima)}` : 'Var.'}{setaOrdem('var')}</th>
                                        <th className="r ft-ord" onClick={() => ordenar('periodo')}>Período{setaOrdem('periodo')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {ranking.slice(0, verTodos ? ranking.length : 15).map((p, i) => (
                                        <tr key={p.cod} className={`sg-clicavel ${procAnalise?.cod === p.cod ? 'ft-sel' : ''}`} onClick={() => selecionarProc(p.cod)}>
                                            <td data-l="#" className="mono sg-muted">{i + 1}</td>
                                            <td data-l="Procedimento"><div className="sg-cel-main">{p.nome}</div><div className="sg-cel-sub mono">{fmtProc(p.cod)} · {p.meses}/{m.comps.length} meses</div></td>
                                            <td data-l="Tendência"><Sparkline valores={m.comps.map(c => p.v[c] || 0)} /></td>
                                            <td data-l={ehValor ? 'Valor' : 'Quantidade'} className="r mono"><b>{fmtM(p.total)}</b></td>
                                            <td data-l="Part." className="r mono">{fmtPart(p.part)}</td>
                                            <td data-l="Último mês" className={`r mono ${p.varUlt > 0 ? 'ft-pos' : p.varUlt < 0 ? 'ft-neg' : ''}`}>{m.penultima ? comSinal(p.varUlt, fmtM) : '-'}</td>
                                            <td data-l="Período" className="r">{(p.v[m.primeira] || 0) === 0 && (p.v[m.ultima] || 0) > 0 ? <span className="sg-badge ok">NOVO</span> : <Delta v={p.varPeriodo} />}</td>
                                        </tr>
                                    ))}
                                    {ranking.length === 0 && <tr><td colSpan={7} className="sg-vazio">Nenhum procedimento encontrado.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                        {ranking.length > 15 && (
                            <button className="sg-btn sg-btn-out ft-ver-mais" onClick={() => setVerTodos(v => !v)}>
                                {verTodos ? 'Mostrar só os 15 primeiros' : `Ver todos os ${ranking.length} procedimentos`}
                            </button>
                        )}
                    </div>

                    {/* ---------------- UNIDADES ---------------- */}
                    {m.listaUnis.length > 1 && (
                        <div className="sg-card">
                            <div className="sg-card-tit"><h4><Icon n="building" /> Unidade × competência</h4>
                                <div className="ft-escala"><span>menor</span><i /><span>maior</span><span className="ft-escala-vazio">sem envio</span></div>
                            </div>
                            <div className="sg-tabela-wrap">
                                <table className="ft-calor">
                                    <thead><tr><th>Unidade</th>{m.comps.map(c => <th key={c} className="mono">{rotComp(c)}</th>)}<th className="r">Total</th></tr></thead>
                                    <tbody>
                                        {m.listaUnis.map(u => (
                                            <tr key={u.id}>
                                                <td><div className="sg-cel-main">{u.nome}</div><div className="sg-cel-sub">{u.projeto}</div></td>
                                                {m.comps.map(c => {
                                                    const v = u.v[c];
                                                    if (v === undefined) return <td key={c} className="vazio" title={`${u.nome} · ${rotComp(c)}: sem lançamento`}>-</td>;
                                                    const t = Math.sqrt(v / m.maxCelula);
                                                    return <td key={c} title={`${u.nome} · ${rotComp(c)}: ${fmtNum(u.qt[c])} proc. · ${fmtMoeda(u.vl[c])}`}
                                                        style={{ background: `color-mix(in srgb, var(--pine) ${Math.round(8 + t * 82)}%, #fff)`, color: t > 0.55 ? '#fff' : 'var(--ink)' }}
                                                        className="mono">{fmtEixo(v).replace('R$ ', '')}</td>;
                                                })}
                                                <td className="r mono"><b>{fmtEixo(u.total)}</b></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* ---------------- CBO ---------------- */}
                    {m.listaCbos.length > 0 && (
                        <div className="sg-card">
                            <div className="sg-card-tit"><h4><Icon n="users" /> Por categoria profissional (CBO)</h4><small className="sg-muted">12 maiores no período</small></div>
                            <div className="ft-cbos">
                                {m.listaCbos.slice(0, 12).map(c => (
                                    <div key={c.cod} className="ft-cbo">
                                        <div className="ft-cbo-tit"><span title={c.nome}>{c.nome}</span><small className="mono">{c.cod}</small></div>
                                        <div className="ft-part-barra"><i style={{ width: `${Math.max((c.total / m.listaCbos[0].total) * 100, 0.8)}%`, background: COR_SERIE }} /></div>
                                        <div className="ft-cbo-val mono">
                                            <b>{fmtM(c.total)}</b>
                                            <span>{ehValor ? `${fmtNum(c.totalQt)} proc.` : fmtMoeda(c.totalVl)}</span>
                                            {m.penultima && <Delta v={varPerc(c.v[m.ultima] || 0, c.v[m.penultima] || 0)} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <p className="ft-rodape sg-muted">
                        Valores de tabela SIGTAP da produção apresentada (BPA/APAC: serviço ambulatorial; AIH: hospitalar + profissional), não o valor aprovado/pago.
                    </p>
                </div>
            )}
        </div>
    );
}
