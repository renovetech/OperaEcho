/* ARQUIVO: src/Relatorios.js */
import React, { useState, useEffect, useRef } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import { periodoBloqueado } from './periodo';
import logo from './logo.png';
import html2canvas from 'html2canvas'; 
import jsPDF from 'jspdf';
import { criarRelatorioPDF as criarRelatorioPdfPadrao } from './pdfRelatorio';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Relatorios.css';
import { OPCOES_RESPONSAVEL } from './config/planoTemplates';
import RelatorioPlanoAcao from './RelatorioPlanoAcao';
import RelatorioProjetosAtivos from './RelatorioProjetosAtivos';
import RelatorioMapaUnidades from './RelatorioMapaUnidades';

import marcadorRetina from 'leaflet/dist/images/marker-icon-2x.png';
import marcador from 'leaflet/dist/images/marker-icon.png';
import marcadorSombra from 'leaflet/dist/images/marker-shadow.png';

// Correção do ícone padrão do Leaflet no React
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: marcadorRetina,
    iconUrl: marcador,
    shadowUrl: marcadorSombra,
});

const Relatorios = ({ aoVoltar, inicial }) => {
    const [subTela] = useState(inicial || 'estatistica_atividades'); 
    
    // Helper: minutos -> "HHh MMmin" (apresentação do tempo nos relatórios)
    const fmtMin = (m) => {
        const t = Math.round(Number(m) || 0);
        if (t <= 0) return '-';
        const h = Math.floor(t / 60), mm = t % 60;
        if (h && mm) return `${h}h ${String(mm).padStart(2, '0')}min`;
        if (h) return `${h}h`;
        return `${mm}min`;
    };
    const fmtDesvio = (m) => {
        const t = Math.round(Number(m) || 0);
        if (t === 0) return '0min';
        return (t > 0 ? '+' : '−') + fmtMin(Math.abs(t));
    };

    // Helper: soma total de minutos (valor bruto) de uma lista de itens
    const somarMinutosLista = (lista) => {
        let totalMinutos = 0;
        (lista || []).forEach(item => {
            if (item.tempo_gasto && item.tempo_gasto.includes(':')) {
                const [h, m] = item.tempo_gasto.split(':');
                totalMinutos += (parseInt(h, 10) || 0) * 60 + (parseInt(m, 10) || 0);
            }
        });
        return totalMinutos;
    };

    // Helper: soma tempo em formato "HH:MM" de uma lista de itens
    const somarHorasString = (lista) => fmtMin(somarMinutosLista(lista));

    // Helper: soma total de profissionais capacitados de uma lista de itens
    const somarProfCapLista = (lista) =>
        (lista || []).reduce((acc, item) => acc + (parseInt(item.profissionais_env, 10) || 0), 0);

    // ===================== MOTOR DE PDF VETORIAL (padrão único: src/pdfRelatorio.js) =====================
    const criarRelatorioPDF = (titulo, periodoTxt) =>
        criarRelatorioPdfPadrao(titulo, periodoTxt, usuarioLogado.nome_completo || usuarioLogado.nome);

    // ---- Relatório 1: Estatísticas da Implantação ----
    const gerarPdfEstatisticas = async () => {
        if (!dados.length) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const tituloDoc = subTela === 'estatistica_projetos' ? 'Estatística dos Projetos' : 'Estatísticas da Implantação';
            const nomeArqBase = subTela === 'estatistica_projetos' ? 'Estatisticas_Projetos' : 'Estatisticas';
            // No relatório de Projetos a coluna representa os Operadores/Analistas
            // do projeto; no de Implantação, os Implantadores.
            const ehProj = subTela === 'estatistica_projetos';
            const pdf = await criarRelatorioPDF(tituloDoc,
                `Período: ${formatarApenasDataBr(filtros.dataInicio)} até ${formatarApenasDataBr(filtros.dataFim)}`);
            [...new Set(dados.map(d => d.motivos))].forEach(mot => {
                const dm = dados.filter(d => d.motivos === mot);
                pdf.bloco(`Total de ${mot}: ${dm.length}`, pdf.colors.green);
                [...new Set(dm.map(d => d.nome_projeto))].forEach(proj => {
                    const us = dm.filter(d => d.nome_projeto === proj);
                    pdf.bloco(`Projeto: ${proj}  (Soma: ${us.length} | Tempo Total: ${somarHorasString(us)})`, pdf.colors.blue);

                    const cols = [{ h: 'Unidade', w: 100, a: 'l' }, { h: 'Produto(s)', w: 75, a: 'l' }];
                    if (mostrarImplantador) cols.push({ h: ehProj ? 'Operador(es)/Analista(s)' : 'Implantador(es)', w: 75, a: 'l' });
                    if (!ehProj && mostrarEquipeProjeto) cols.push({ h: 'Equipe Projeto', w: 75, a: 'l' });
                    if (mostrarProfCap) cols.push({ h: 'Profissionais Cap.', w: 40, a: 'c' });
                    cols.push({ h: 'Data Reg.', w: 28, a: 'c' }, { h: 'Tempo', w: 30, a: 'c' });
                    const fator = pdf.CW / cols.reduce((s, c) => s + c.w, 0);
                    cols.forEach(c => { c.w = c.w * fator; });

                    pdf.tabela(
                        cols,
                        us.map(u => {
                            const row = [u.nome_unidade || '-', u.produtos_trabalhados || '---'];
                            if (mostrarImplantador) row.push((ehProj ? u.operadores_analistas : u.implantadores) || '---');
                            if (!ehProj && mostrarEquipeProjeto) row.push(u.equipe_projeto || '---');
                            if (mostrarProfCap) row.push(String(u.profissionais_env || '0'));
                            row.push(formatarApenasDataBr(u.data_inicial), u.tempo_gasto || '00:00');
                            return row;
                        })
                    );
                });
            });

            // ---- Totais Gerais (soma de todos os motivos da visita) ----
            const totalMinGeral = somarMinutosLista(dados);
            const totalProfGeral = somarProfCapLista(dados);
            pdf.garantir(20);
            pdf.cursor.y += 2;
            pdf.doc.setDrawColor(...pdf.colors.green); pdf.doc.setLineWidth(0.6);
            pdf.doc.line(pdf.M, pdf.cursor.y, pdf.W - pdf.M, pdf.cursor.y); pdf.doc.setLineWidth(0.2);
            pdf.cursor.y += 6;
            pdf.bloco('Totais Gerais', pdf.colors.green);
            const linhasTotais = [
                ['Total de Registros', String(dados.length)],
                ['Tempo Total Geral', fmtMin(totalMinGeral)],
            ];
            if (mostrarProfCap) linhasTotais.push(['Profissionais Capacitados', String(totalProfGeral)]);
            pdf.tabela(
                [{ h: 'Indicador', w: pdf.CW * 0.6, a: 'l' }, { h: 'Total', w: pdf.CW * 0.4, a: 'c' }],
                linhasTotais.map(([ind, val]) => [{ t: ind, bold: true }, { t: val, bold: true, color: pdf.colors.green }])
            );

            pdf.finalizar(`${nomeArqBase}_${filtros.dataInicio || 'periodo'}`);
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    // ---- Relatório 3: Presença por Implantador ----
    const gerarPdfPresencaImpl = async () => {
        if (!dadosPresenca || Object.keys(dadosPresenca).length === 0) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const pdf = await criarRelatorioPDF('Presença por Implantador',
                `Período: ${formatarApenasDataBr(filtrosPresenca.dataInicio)} até ${formatarApenasDataBr(filtrosPresenca.dataFim)}`);
            Object.values(dadosPresenca).forEach(local => {
                const porImp = local.registros.reduce((acc, r) => { (acc[r.nome_implantador] = acc[r.nome_implantador] || new Set()).add(formatarApenasDataBr(r.data_inicio)); return acc; }, {});
                pdf.bloco(`Projeto ${local.projeto}  ›  ${local.unidade}`, pdf.colors.green);
                const linhas = Object.entries(porImp).sort().map(([imp, datas]) => {
                    const arr = Array.from(datas).sort((a, b) => (a.split('/').reverse().join('') > b.split('/').reverse().join('') ? 1 : -1));
                    return [imp, arr.join(', '), String(arr.length)];
                });
                pdf.tabela([{ h: 'Implantador', w: 80, a: 'l' }, { h: 'Datas', w: 160, a: 'l' }, { h: 'Dias', w: 33, a: 'c' }], linhas);
            });
            pdf.finalizar(`Presenca_Implantador_${filtrosPresenca.dataInicio || 'periodo'}`);
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    // ---- Relatório 4: Presença por Equipe ----
    const gerarPdfPresencaEquipe = async () => {
        if (!dadosEquipe || Object.keys(dadosEquipe).length === 0) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const pdf = await criarRelatorioPDF('Presença por Equipe',
                `Período: ${formatarApenasDataBr(filtrosEquipe.dataInicio)} até ${formatarApenasDataBr(filtrosEquipe.dataFim)}`);
            Object.values(dadosEquipe).forEach(local => {
                const porData = local.registros.reduce((acc, r) => { const d = formatarApenasDataBr(r.data_inicio); (acc[d] = acc[d] || new Set()).add(r.nome_implantador); return acc; }, {});
                pdf.bloco(`Projeto ${local.projeto}  ›  ${local.unidade}`, pdf.colors.blue);
                const linhas = Object.entries(porData).sort((a, b) => (a[0].split('/').reverse().join('') > b[0].split('/').reverse().join('') ? 1 : -1))
                    .map(([data, nomes]) => { const arr = Array.from(nomes).sort(); return [data, arr.join(', '), String(arr.length)]; });
                pdf.tabela([{ h: 'Data', w: 30, a: 'c' }, { h: 'Implantadores', w: 210, a: 'l' }, { h: 'Qtd', w: 33, a: 'c' }], linhas);
            });
            pdf.finalizar(`Presenca_Equipe_${filtrosEquipe.dataInicio || 'periodo'}`);
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error'); }
    };

    // ===================== PDF VETORIAL - TEMPO MÉDIO DE AÇÃO =====================
    const gerarPdfTempoMedio = async () => {
        if (!dadosTempo || (dadosTempo.itens || []).length === 0)
            return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning');

        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const { resumo: r, porResponsavel, porAcao, itens } = dadosTempo;
            const doc = new jsPDF('l', 'mm', 'a4');
            const W = doc.internal.pageSize.getWidth();
            const H = doc.internal.pageSize.getHeight();
            const M = 12;
            const CW = W - 2 * M;

            const green = [30, 58, 48], blue = [39, 75, 62];
            const ink = [31, 41, 51], muted = [110, 116, 124], grid = [222, 226, 230];
            const red = [198, 40, 40], amber = [239, 108, 0];
            const dm = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '-');
            const cor = (m) => (m > 0 ? red : (m < 0 ? green : ink));

            const cursor = { y: M };

            let logoImg = null, logoRatio = 1;
            await new Promise((ok) => {
                const im = new Image();
                im.onload = () => { logoImg = im; logoRatio = im.naturalWidth / im.naturalHeight || 1; ok(); };
                im.onerror = () => ok();
                im.src = logo;
            });

            const logoH = 18, logoW = logoH * logoRatio;
            if (logoImg) { try { doc.addImage(logoImg, 'PNG', M, M, logoW, logoH); } catch (e) {} }
            doc.setFont(undefined, 'bold'); doc.setFontSize(18); doc.setTextColor(...green);
            doc.text('Tempo Médio de Ação', W - M, M + 6, { align: 'right' });
            doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
            doc.text(`Período: ${dm(filtrosTempo.dataInicio)} até ${dm(filtrosTempo.dataFim)}`, W - M, M + 12, { align: 'right' });
            doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}   ·   Usuário: ${usuarioLogado.nome_completo || usuarioLogado.nome || '-'}`, W - M, M + 17, { align: 'right' });
            cursor.y = M + logoH + 6;
            doc.setDrawColor(...green); doc.setLineWidth(0.6); doc.line(M, cursor.y, W - M, cursor.y); doc.setLineWidth(0.2);
            cursor.y += 7;

            const kpis = [
                { num: String(r.com_dados), lbl: 'Execuções avaliadas', sub: `${r.sem_dados} sem dados`, c: green },
                { num: fmtMin(r.media_previsto), lbl: 'Média prevista', c: green },
                { num: fmtMin(r.media_gasto), lbl: 'Média gasta', c: green },
                { num: fmtDesvio(r.media_desvio), lbl: 'Desvio médio', c: cor(r.media_desvio) }
            ];
            const gap = 5, kpiW = (CW - 3 * gap) / 4, kpiH = 20;
            kpis.forEach((k, i) => {
                const x = M + i * (kpiW + gap);
                doc.setFillColor(248, 249, 250); doc.setDrawColor(...grid);
                doc.roundedRect(x, cursor.y, kpiW, kpiH, 1.5, 1.5, 'FD');
                doc.setFillColor(...k.c); doc.rect(x, cursor.y, 1.6, kpiH, 'F');
                doc.setFont(undefined, 'bold'); doc.setFontSize(15); doc.setTextColor(...k.c);
                doc.text(k.num, x + 5, cursor.y + 9);
                doc.setFont(undefined, 'bold'); doc.setFontSize(7.5); doc.setTextColor(90, 90, 90);
                doc.text(k.lbl.toUpperCase(), x + 5, cursor.y + 14);
                if (k.sub) { doc.setFont(undefined, 'normal'); doc.setFontSize(7); doc.setTextColor(150, 150, 150); doc.text(k.sub, x + 5, cursor.y + 18); }
            });
            cursor.y += kpiH + 6;

            const dist = [
                { t: 'Estourado', n: r.qtd_estourado, m: r.media_tempo_estourado, bg: [255, 235, 238], fg: red },
                { t: 'Na média', n: r.qtd_na_media, m: r.media_tempo_na_media, bg: [255, 248, 225], fg: amber },
                { t: 'No prazo', n: r.qtd_legal, m: r.media_tempo_legal, bg: [232, 245, 233], fg: green }
            ];
            const dW = (CW - 2 * gap) / 3, dH = 16;
            dist.forEach((d, i) => {
                const x = M + i * (dW + gap);
                doc.setFillColor(...d.bg); doc.setDrawColor(...d.fg);
                doc.roundedRect(x, cursor.y, dW, dH, 1.5, 1.5, 'FD');
                doc.setFont(undefined, 'bold'); doc.setFontSize(8.5); doc.setTextColor(...d.fg);
                doc.text(d.t.toUpperCase(), x + dW / 2, cursor.y + 5.5, { align: 'center' });
                doc.setFontSize(14); doc.text(String(d.n), x + dW / 2, cursor.y + 11.5, { align: 'center' });
                doc.setFont(undefined, 'normal'); doc.setFontSize(7);
                doc.text(`média ${fmtMin(d.m)}`, x + dW / 2, cursor.y + 14.8, { align: 'center' });
            });
            cursor.y += dH + 8;

            const tabela = (titulo, cols, linhas) => {
                const headerH = 7.5, lineH = 4, padX = 2;
                const secao = () => {
                    doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...blue);
                    doc.text(titulo, M, cursor.y); cursor.y += 4.5; doc.setFont(undefined, 'normal');
                };
                const cabec = () => {
                    doc.setFillColor(241, 243, 245); doc.setDrawColor(...grid);
                    doc.rect(M, cursor.y, CW, headerH, 'FD');
                    doc.setFont(undefined, 'bold'); doc.setFontSize(8); doc.setTextColor(...ink);
                    let x = M;
                    cols.forEach(c => {
                        const cx = c.a === 'c' ? x + c.w / 2 : x + padX;
                        doc.text(c.h, cx, cursor.y + headerH - 2.3, { align: c.a === 'c' ? 'center' : 'left' });
                        x += c.w;
                    });
                    cursor.y += headerH; doc.setFont(undefined, 'normal');
                };
                secao(); cabec(); doc.setFontSize(8);
                linhas.forEach((linha, idx) => {
                    const cellLines = cols.map((c, ci) => {
                        const cell = linha[ci]; const txt = (cell && typeof cell === 'object') ? (cell.t ?? '') : String(cell ?? '');
                        return doc.splitTextToSize(txt, c.w - padX * 2);
                    });
                    const maxL = Math.max(1, ...cellLines.map(a => a.length));
                    const rowH = maxL * lineH + 2.4;
                    if (cursor.y + rowH > H - 12) { doc.addPage(); cursor.y = M; secao(); cabec(); doc.setFontSize(8); }
                    if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(M, cursor.y, CW, rowH, 'F'); }
                    let x = M;
                    cols.forEach((c, ci) => {
                        const cell = linha[ci]; const obj = (cell && typeof cell === 'object') ? cell : { t: String(cell ?? '') };
                        doc.setTextColor(...(obj.color || ink)); doc.setFont(undefined, obj.bold ? 'bold' : 'normal');
                        const cx = c.a === 'c' ? x + c.w / 2 : x + padX;
                        cellLines[ci].forEach((ln, li) => doc.text(ln, cx, cursor.y + 3.8 + li * lineH, { align: c.a === 'c' ? 'center' : 'left' }));
                        x += c.w;
                    });
                    doc.setFont(undefined, 'normal'); doc.setDrawColor(...grid);
                    doc.line(M, cursor.y + rowH, M + CW, cursor.y + rowH);
                    cursor.y += rowH;
                });
                cursor.y += 6;
            };

            tabela('Ranking por Responsável  (maior desvio primeiro)',
                [{ h: 'Responsável', w: 88, a: 'l' }, { h: 'Itens', w: 22, a: 'c' }, { h: 'Média prev.', w: 38, a: 'c' },
                 { h: 'Média gasto', w: 38, a: 'c' }, { h: 'Desvio médio', w: 47, a: 'c' }, { h: 'Estourados', w: 40, a: 'c' }],
                porResponsavel.map(x => [
                    x.responsavel, String(x.qtd), fmtMin(x.media_previsto), fmtMin(x.media_gasto),
                    { t: fmtDesvio(x.media_desvio), color: cor(x.media_desvio), bold: true }, String(x.estourados)
                ]));

            tabela('Ações Mais Demoradas  (maior tempo gasto primeiro)',
                [{ h: 'Ação', w: 118, a: 'l' }, { h: 'Ocorr.', w: 20, a: 'c' }, { h: 'Média prev.', w: 35, a: 'c' },
                 { h: 'Média gasto', w: 35, a: 'c' }, { h: 'Desvio médio', w: 45, a: 'c' }, { h: 'Estour.', w: 20, a: 'c' }],
                porAcao.slice(0, 20).map(x => [
                    x.descricao, String(x.qtd), fmtMin(x.media_previsto), fmtMin(x.media_gasto),
                    { t: fmtDesvio(x.media_desvio), color: cor(x.media_desvio), bold: true }, String(x.estourados)
                ]));

            const CLS = { 'ESTOURADO': { t: 'Estourado', c: red }, 'NA MEDIA': { t: 'Na média', c: amber }, 'LEGAL': { t: 'No prazo', c: green }, 'SEM DADOS': { t: 'Sem dados', c: muted } };
            tabela(`Detalhe por Execução  (${itens.length} itens)`,
                [{ h: 'Projeto', w: 42, a: 'l' }, { h: 'Ação', w: 96, a: 'l' }, { h: 'Responsável', w: 42, a: 'l' },
                 { h: 'Prev.', w: 21, a: 'c' }, { h: 'Gasto', w: 21, a: 'c' }, { h: 'Desvio', w: 26, a: 'c' }, { h: 'Classif.', w: 25, a: 'c' }],
                itens.map(x => {
                    const cl = CLS[x.classificacao] || CLS['SEM DADOS'];
                    return [
                        x.nome_projeto || '-', (x.descricao || '') + (x.modulo ? `  [${x.modulo}]` : ''), x.responsavel || '-',
                        fmtMin(x.previsto_min), fmtMin(x.gasto_min),
                        x.classificacao === 'SEM DADOS' ? '-' : { t: fmtDesvio(x.desvio_min), color: cor(x.desvio_min), bold: true },
                        { t: cl.t, color: cl.c, bold: true }
                    ];
                }));

            if (cursor.y + 14 > H - 12) { doc.addPage(); cursor.y = M; }
            doc.setFont(undefined, 'italic'); doc.setFontSize(7.5); doc.setTextColor(...muted);
            doc.text('Base: previsto e gasto em horas (hh:mm); gasto contado em expediente (seg-sex, 08-19). '
                + 'Estourado / Na média / No prazo usam tolerância de ±10% sobre o previsto.', M, cursor.y + 6, { maxWidth: CW });

            const total = doc.internal.getNumberOfPages();
            for (let i = 1; i <= total; i++) {
                doc.setPage(i); doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
                doc.text('Opera Echo Management System · Tempo Médio de Ação', M, H - 6);
                doc.text(`Página ${i} de ${total}`, W - M, H - 6, { align: 'right' });
            }

            doc.save(`Tempo_Medio_Acao_${filtrosTempo.dataInicio || 'periodo'}.pdf`);
            Swal.close();
        } catch (e) {
            console.error(e);
            Swal.fire('Erro', 'Falha ao gerar o PDF.', 'error');
        }
    };
    
    // Estados 
    const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '', motivo: 'Todos', projeto: 'Todos', unidade: 'Todas' });
    const [mostrarImplantador, setMostrarImplantador] = useState(false);
    const [mostrarEquipeProjeto, setMostrarEquipeProjeto] = useState(false);
    const [mostrarProfCap, setMostrarProfCap] = useState(false);
    const [dados, setDados] = useState([]);
    const [projetos, setProjetos] = useState([]);
    const [unidades, setUnidades] = useState([]);
    
    const [filtrosAuditoria, setFiltrosAuditoria] = useState({ dataInicio: '', dataFim: '', usuario: 'Todos', tipo_registro: 'Todos' });
    const [dadosAuditoria, setDadosAuditoria] = useState([]);
    const [usuariosSistema, setUsuariosSistema] = useState([]);

    const [filtrosPresenca, setFiltrosPresenca] = useState({ dataInicio: '', dataFim: '', motivo: 'Todos', id_projeto: 'Todos', id_unidade: 'Todas' });
    const [dadosPresenca, setDadosPresenca] = useState(null);
    const [projetosPresenca, setProjetosPresenca] = useState([]);
    const [unidadesPresenca, setUnidadesPresenca] = useState([]);

    const [filtrosEquipe, setFiltrosEquipe] = useState({ dataInicio: '', dataFim: '', motivo: 'Todos', id_projeto: 'Todos', id_unidade: 'Todas' });
    const [dadosEquipe, setDadosEquipe] = useState(null);
    const [projetosEquipe, setProjetosEquipe] = useState([]);
    const [unidadesEquipe, setUnidadesEquipe] = useState([]);

    const [filtrosTempo, setFiltrosTempo] = useState({ dataInicio: '', dataFim: '', id_projeto: 'Todos', responsavel: 'Todos', status: 'Todos' });
    const [dadosTempo, setDadosTempo] = useState(null);
    const [projetosTempo, setProjetosTempo] = useState([]);

    const [carregando, setCarregando] = useState(false);
    
    // Controle de Permissões Independentes
    const [permissoesGlobais, setPermissoesGlobais] = useState({ 
        estatisticas: false, 
        estatisticas_projetos: false,
        auditoria: false, 
        presenca_implantador: false,
        presenca_equipe: false,
        tempo_medio: false,
        plano_acao: false,
        projetos_ativos: false,
        mapa_unidades: false,
        verificado: false
    });

    const exportRef = useRef(); 
    const mapRef = useRef(null); 
    const usuarioLogado = JSON.parse(sessionStorage.getItem('usuario_opera')) || {};

    // --- VERIFICAÇÃO DE PERMISSÃO RIGOROSA ---
    useEffect(() => {
        const verificarAcesso = async () => {
            try {
                if (usuarioLogado.perfil_acesso === 'Administrador') {
                    setPermissoesGlobais({ estatisticas: true, estatisticas_projetos: true, auditoria: true, presenca_implantador: true, presenca_equipe: true, tempo_medio: true, plano_acao: true, projetos_ativos: true, mapa_unidades: true, verificado: true });
                    return;
                }
                
                const res = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                
                const regraEst = res.data.find(r => r.nome_modulo === 'rel_estatisticas');
                const regraEstProj = res.data.find(r => r.nome_modulo === 'rel_estatisticas_projetos');
                const regraAud = res.data.find(r => r.nome_modulo === 'rel_auditoria_loc');
                const regraPI  = res.data.find(r => r.nome_modulo === 'rel_presenca_implantador');
                const regraPE  = res.data.find(r => r.nome_modulo === 'rel_presenca_equipe');
                const regraTM  = res.data.find(r => r.nome_modulo === 'rel_tempo_medio');
                
                const temAcessoEst = regraEst && regraEst.pode_acessar;
                const temAcessoEstProj = regraEstProj && regraEstProj.pode_acessar;
                const temAcessoAud = regraAud && regraAud.pode_acessar;
                const temAcessoPI  = regraPI  && regraPI.pode_acessar;
                const temAcessoPE  = regraPE  && regraPE.pode_acessar;
                const temAcessoTM  = regraTM  && regraTM.pode_acessar;
                const regraPA  = res.data.find(r => r.nome_modulo === 'rel_plano_acao');
                const temAcessoPA  = regraPA  && regraPA.pode_acessar;
                const regraPAt = res.data.find(r => r.nome_modulo === 'rel_projetos_ativos');
                const regraMU  = res.data.find(r => r.nome_modulo === 'rel_mapa_unidades');
                const temAcessoPAt = regraPAt && regraPAt.pode_acessar;
                const temAcessoMU  = regraMU  && regraMU.pode_acessar;

                if (!temAcessoEst && !temAcessoEstProj && !temAcessoAud && !temAcessoPI && !temAcessoPE && !temAcessoTM && !temAcessoPA && !temAcessoPAt && !temAcessoMU) {
                    Swal.fire('Acesso Negado', 'Você não tem permissão para acessar relatórios.', 'error')
                        .then(() => aoVoltar());
                } else {
                    setPermissoesGlobais({ 
                        estatisticas: temAcessoEst, 
                        estatisticas_projetos: temAcessoEstProj,
                        auditoria: temAcessoAud, 
                        presenca_implantador: temAcessoPI,
                        presenca_equipe: temAcessoPE,
                        tempo_medio: temAcessoTM,
                        plano_acao: temAcessoPA,
                        projetos_ativos: temAcessoPAt,
                        mapa_unidades: temAcessoMU,
                        verificado: true
                    });
                }
            } catch (error) {
                console.error(error);
                aoVoltar();
            }
        };
        if (usuarioLogado.id_usuario) verificarAcesso();
    }, [usuarioLogado.perfil_acesso, aoVoltar, usuarioLogado.id_usuario]); 

    // --- PROTEÇÃO DE SUBTELA RIGOROSA ---
    useEffect(() => {
        if (permissoesGlobais.verificado && subTela) {
            let acessoPermitido = false;
            
            if (subTela === 'estatistica_atividades' && permissoesGlobais.estatisticas) acessoPermitido = true;
            else if (subTela === 'estatistica_projetos' && permissoesGlobais.estatisticas_projetos) acessoPermitido = true;
            else if (subTela === 'auditoria_localizacao' && permissoesGlobais.auditoria) acessoPermitido = true;
            else if (subTela === 'presenca_implantador' && permissoesGlobais.presenca_implantador) acessoPermitido = true;
            else if (subTela === 'presenca_equipe' && permissoesGlobais.presenca_equipe) acessoPermitido = true;
            else if (subTela === 'tempo_medio_acao' && permissoesGlobais.tempo_medio) acessoPermitido = true;
            else if (subTela === 'plano_acao_status' && permissoesGlobais.plano_acao) acessoPermitido = true;
            else if (subTela === 'projetos_ativos' && permissoesGlobais.projetos_ativos) acessoPermitido = true;
            else if (subTela === 'mapa_unidades' && permissoesGlobais.mapa_unidades) acessoPermitido = true;

            if (!acessoPermitido) {
                aoVoltar();
            }
        }
    }, [subTela, permissoesGlobais, aoVoltar]);

    // --- CARREGAMENTO DOS MENUS DE SELEÇÃO (AUXILIARES) E DADOS INICIAIS ---
    useEffect(() => {
        const carregarAuxiliares = async () => {
            try {
                if (subTela === 'estatistica_atividades' || subTela === 'estatistica_projetos') {
                    const [resProj, resUni] = await Promise.all([
                        api.get('/projetos'),
                        api.get('/unidades/buscar?limite=1000')
                    ]);
                    setProjetos(resProj.data);
                    setUnidades(resUni.data.dados || []);
                } 
                else if (subTela === 'auditoria_localizacao') {
                    setCarregando(true);
                    try {
                        const resAuditoria = await api.get('/relatorios/auditoria-localizacao', { params: {} });
                        const dadosSeguros = Array.isArray(resAuditoria.data) ? resAuditoria.data : [];
                        setDadosAuditoria(dadosSeguros);
                        
                        if (dadosSeguros.length > 0) {
                            const usuariosUnicos = [...new Set(dadosSeguros.map(item => item.usuario))].filter(Boolean);
                            setUsuariosSistema(usuariosUnicos.map(u => ({ id_usuario: u, nome_completo: u, usuario: u })));
                        } else {
                            setUsuariosSistema([]);
                        }
                    } catch (e) {
                        console.error("Erro na auditoria:", e);
                        setDadosAuditoria([]);
                    }
                    setCarregando(false);
                }
                else if (subTela === 'presenca_implantador' || subTela === 'presenca_equipe') {
                    try {
                        const [resProj] = await Promise.all([api.get('/projetos')]);
                        if (subTela === 'presenca_implantador') {
                            setProjetosPresenca(resProj.data);
                            setUnidadesPresenca([]);
                        } else {
                            setProjetosEquipe(resProj.data);
                            setUnidadesEquipe([]);
                        }
                    } catch (e) { console.error(e); }
                }
                else if (subTela === 'tempo_medio_acao') {
                    try {
                        const resProj = await api.get('/projetos');
                        setProjetosTempo(resProj.data);
                    } catch (e) { console.error(e); }
                }
            } catch (err) {
                console.error("Erro ao carregar auxiliares", err);
                setCarregando(false);
            }
        };
        carregarAuxiliares();
    }, [subTela]);

    const unidadesFiltradas = filtros.projeto === 'Todos' 
        ? unidades 
        : unidades.filter(u => {
            const projetoVinculado = u.id_projeto || u.projeto_id || u.idProjeto;
            if (!projetoVinculado) return false;
            return String(projetoVinculado) === String(filtros.projeto);
        });

    // --- BUSCA DE DADOS ---
    const buscarDados = async () => {
        if (!filtros.dataInicio || !filtros.dataFim) {
            return Swal.fire('Atenção', 'Selecione o período de datas.', 'warning');
        }
        if (periodoBloqueado(filtros.dataInicio, filtros.dataFim)) return;
        setCarregando(true);
        try {
            const endpointEstatistica = subTela === 'estatistica_projetos'
                ? '/relatorios/estatisticas-projetos'
                : '/relatorios/estatisticas-atividades';
            const res = await api.get(endpointEstatistica, { params: filtros });
            let dadosFiltrados = res.data;

            dadosFiltrados.sort((a, b) => {
                const parseDateForSort = (dStr) => {
                    if (!dStr) return 0;
                    if (dStr.includes('/')) {
                        const [d, m, y] = dStr.split('/');
                        return new Date(`${y}-${m}-${d}T00:00:00`).getTime();
                    }
                    return new Date(dStr).getTime();
                };
                return parseDateForSort(a.data_inicial) - parseDateForSort(b.data_inicial);
            });

            if (filtros.motivo !== 'Todos') dadosFiltrados = dadosFiltrados.filter(d => d.motivos === filtros.motivo);
            
            if (filtros.projeto !== 'Todos') {
                const projetoSelecionado = projetos.find(p => String(p.id_projeto || p.id) === String(filtros.projeto));
                if (projetoSelecionado) {
                    dadosFiltrados = dadosFiltrados.filter(d => String(d.id_projeto) === String(filtros.projeto) || d.nome_projeto === projetoSelecionado.nome_projeto);
                }
            }

            if (filtros.unidade !== 'Todas') {
                const unidadeSelecionada = unidades.find(u => String(u.id_unidade || u.id) === String(filtros.unidade));
                if (unidadeSelecionada) {
                    dadosFiltrados = dadosFiltrados.filter(d => String(d.id_unidade) === String(filtros.unidade) || d.nome_unidade === unidadeSelecionada.nome_unidade);
                }
            }

            setDados(dadosFiltrados);
            if (dadosFiltrados.length === 0) Swal.fire('Informação', 'Nenhum dado encontrado com os filtros aplicados.', 'info');
        } catch (err) {
            Swal.fire('Erro', 'Falha ao buscar dados.', 'error');
        } finally { setCarregando(false); }
    };

    const buscarDadosAuditoria = async () => {
        if (!filtrosAuditoria.dataInicio !== !filtrosAuditoria.dataFim)
            return Swal.fire('Atenção', 'Informe a data inicial e a data final.', 'warning');
        if (periodoBloqueado(filtrosAuditoria.dataInicio, filtrosAuditoria.dataFim)) return;
        setCarregando(true);
        try {
            const res = await api.get('/relatorios/auditoria-localizacao', { params: filtrosAuditoria });
            const dadosSeguros = Array.isArray(res.data) ? res.data : [];
            setDadosAuditoria(dadosSeguros);
            if (dadosSeguros.length === 0) Swal.fire('Informação', 'Nenhum registro de localização encontrado nesse período/filtro.', 'info');
        } catch (err) {
            Swal.fire('Erro', 'Falha ao buscar dados de auditoria.', 'error');
        } finally { setCarregando(false); }
    };

    const buscarTempoMedio = async () => {
        if (!filtrosTempo.dataInicio || !filtrosTempo.dataFim) {
            return Swal.fire('Atenção', 'Selecione o período de datas.', 'warning');
        }
        if (periodoBloqueado(filtrosTempo.dataInicio, filtrosTempo.dataFim)) return;
        setCarregando(true);
        try {
            const res = await api.get('/relatorios/tempo-medio-acao', { params: filtrosTempo });
            setDadosTempo(res.data);
            if (!res.data || (res.data.itens || []).length === 0) {
                Swal.fire('Informação', 'Nenhum item de plano encontrado com os filtros aplicados.', 'info');
            }
        } catch (err) {
            Swal.fire('Erro', 'Falha ao buscar dados de tempo.', 'error');
        } finally { setCarregando(false); }
    };

    const limparFiltrosAuditoria = async () => {
        const filtrosLimpos = { dataInicio: '', dataFim: '', usuario: 'Todos', tipo_registro: 'Todos' };
        setFiltrosAuditoria(filtrosLimpos);
        setCarregando(true);
        try {
            const res = await api.get('/relatorios/auditoria-localizacao', { params: filtrosLimpos });
            setDadosAuditoria(Array.isArray(res.data) ? res.data : []);
        } catch (err) {
            Swal.fire('Erro', 'Falha ao limpar dados de auditoria.', 'error');
        } finally {
            setCarregando(false);
        }
    };

    const formatarDataBr = (s) => {
        if(!s) return '';
        if (s.includes('T')) {
            const [dataParte, horaParte] = s.split('T');
            const [ano, mes, dia] = dataParte.split('-');
            const hora = horaParte.split('.')[0]; 
            return `${dia}/${mes}/${ano}, ${hora}`;
        }
        if (s.includes('/')) return s; 
        const [a, m, d] = s.split('-');
        return `${d}/${m}/${a}`;
    };

    const formatarApenasDataBr = (s) => {
        if(!s) return '';
        if (s.includes('/')) return s; 
        const dataStr = s.includes('T') ? s.split('T')[0] : s;
        const [a, m, d] = dataStr.split('-');
        return `${d}/${m}/${a}`;
    };

    const voarParaPonto = (lat, lng) => {
        if (mapRef.current && lat && lng) {
            mapRef.current.flyTo([lat, lng], 16, { animate: true, duration: 1.5 });
        }
    };

    // --- FUNÇÕES DE EXPORTAÇÃO ---
    const exportarDoc = (tipo, ref, nomeArquivo, orientacao = 'l') => {
        const node = ref.current;
        if (!node) return;

        const mapControls = document.querySelectorAll('.leaflet-control-container');
        mapControls.forEach(c => (c.style.display = 'none'));

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
            node.style.width = prev.w; node.style.maxWidth = prev.mw;
            node.style.display = prev.disp; node.style.margin = prev.mg;
            mapControls.forEach(c => (c.style.display = ''));
        };

        const W = node.scrollWidth, H = node.scrollHeight;
        html2canvas(node, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', width: W, height: H, windowWidth: W, windowHeight: H })
            .then(canvas => {
                const img = canvas.toDataURL('image/jpeg', 0.9);
                if (tipo === 'jpg') {
                    const a = document.createElement('a');
                    a.href = img; a.download = `${nomeArquivo}.jpg`; a.click(); Swal.close(); return;
                }
                const pdf = new jsPDF(orientacao, 'mm', 'a4');
                const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
                const ratio = pw / canvas.width, h = canvas.height * ratio;
                let left = h, pos = 0;
                pdf.addImage(img, 'JPEG', 0, pos, pw, h); left -= ph;
                while (left > 0) { pos = left - h; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, pw, h); left -= ph; }
                pdf.save(`${nomeArquivo}.pdf`); Swal.close();
            })
            .catch(() => Swal.fire('Erro', `Erro ao gerar ${tipo.toUpperCase()}.`, 'error'))
            .finally(restore);
    };

    const gerarPdfGenerico = async (orientacao, nomeArquivo) => {
        if (subTela !== 'auditoria_localizacao') return exportarDoc('pdf', exportRef, nomeArquivo, orientacao);

        const input = exportRef.current;
        Swal.fire({ title: 'Gerando PDF...', text: 'Processando páginas...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        try {
            const mapControls = document.querySelectorAll('.leaflet-control-container');
            mapControls.forEach(c => c.style.display = 'none');

            const originalWidth = input.style.width;
            const originalMaxWidth = input.style.maxWidth;
            const originalMargin = input.style.margin;

            const isPortrait = orientacao === 'p';
            input.style.width = isPortrait ? '210mm' : '297mm';
            input.style.maxWidth = isPortrait ? '210mm' : '297mm';
            input.style.margin = '0 auto';

            const canvas = await html2canvas(input, {
                scale: 2,
                useCORS: true, 
                logging: false,
                backgroundColor: '#ffffff'
            });

            input.style.width = originalWidth;
            input.style.maxWidth = originalMaxWidth;
            input.style.margin = originalMargin;
            mapControls.forEach(c => c.style.display = '');

            const imgData = canvas.toDataURL('image/jpeg', 0.8); 
            const pdf = new jsPDF(orientacao, 'mm', 'a4');
            
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            
            const imgProps = pdf.getImageProperties(imgData);
            const imgWidth = pdfWidth;
            const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;
            
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pdfHeight;

            while (heightLeft > 0) {
                position -= pdfHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pdfHeight;
            }

            pdf.save(`${nomeArquivo}.pdf`);
            Swal.close();
        } catch (error) { 
            Swal.fire('Erro', 'Erro ao gerar PDF.', 'error'); 
        }
    };

    const handleExportPdf = () => gerarPdfEstatisticas();

    const handleExportPdfAuditoria = () => {
        if (dadosAuditoria.length === 0) return Swal.fire('Atenção', 'Nenhum dado na tela para exportar.', 'warning');
        gerarPdfGenerico('l', `Auditoria_Localizacao`);
    };

    const handleExportJpg = async (ref) => {
        let targetDados = [];
        if (subTela === 'estatistica_atividades' || subTela === 'estatistica_projetos') targetDados = dados;
        else if (subTela === 'auditoria_localizacao') targetDados = dadosAuditoria;
        else if (subTela === 'presenca_implantador') targetDados = dadosPresenca ? Object.keys(dadosPresenca) : [];
        else if (subTela === 'presenca_equipe') targetDados = dadosEquipe ? Object.keys(dadosEquipe) : [];
        else if (subTela === 'tempo_medio_acao') targetDados = dadosTempo ? (dadosTempo.itens || []) : [];

        if (targetDados.length === 0) return Swal.fire('Atenção', 'Nenhum dado na tela para exportar.', 'warning');

        if (subTela !== 'auditoria_localizacao') {
            return exportarDoc('jpg', ref, `Relatorio_${subTela}`, (subTela === 'estatistica_atividades' || subTela === 'estatistica_projetos') ? 'p' : 'l');
        }

        Swal.fire({ title: 'Gerando JPG...', text: 'Capturando visualização...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });

        try {
            const input = ref.current;
            const mapControls = document.querySelectorAll('.leaflet-control-container');
            mapControls.forEach(c => c.style.display = 'none');

            const originalWidth = input.style.width;
            const originalMaxWidth = input.style.maxWidth;
            const originalMargin = input.style.margin;

            const isPortrait = subTela === 'estatistica_atividades' || subTela === 'estatistica_projetos';
            input.style.width = isPortrait ? '210mm' : '297mm';
            input.style.maxWidth = isPortrait ? '210mm' : '297mm';
            input.style.margin = '0 auto';

            const canvas = await html2canvas(input, { 
                scale: 2, 
                useCORS: true, 
                logging: false,
                backgroundColor: "#ffffff" 
            });

            input.style.width = originalWidth;
            input.style.maxWidth = originalMaxWidth;
            input.style.margin = originalMargin;
            mapControls.forEach(c => c.style.display = '');

            const imgData = canvas.toDataURL('image/jpeg', 1.0); 
            const link = document.createElement('a');
            link.download = `Relatorio_${subTela}.jpg`;
            link.href = imgData;
            link.click();
            Swal.close();
        } catch (e) {
            Swal.fire('Erro', 'Falha ao gerar JPG.', 'error');
        }
    };

    if (!permissoesGlobais.verificado) return <div style={{padding: '20px', textAlign: 'center'}}>Carregando permissões...</div>;


    // ==============================================================================
    // RELATÓRIO 2: AUDITORIA DE LOCALIZAÇÃO (MAPA LEAFLET)
    // ==============================================================================
    if (subTela === 'projetos_ativos') {
        return <RelatorioProjetosAtivos aoVoltar={aoVoltar} criarRelatorioPDF={criarRelatorioPDF} exportarDoc={exportarDoc} usuarioLogado={usuarioLogado} podeVerMapa={!!permissoesGlobais.mapa_unidades} />;
    }
    if (subTela === 'mapa_unidades') {
        return <RelatorioMapaUnidades aoVoltar={aoVoltar} criarRelatorioPDF={criarRelatorioPDF} exportarDoc={exportarDoc} usuarioLogado={usuarioLogado} />;
    }

    if (subTela === 'plano_acao_status') {
        return (
            <RelatorioPlanoAcao
                aoVoltar={aoVoltar}
                criarRelatorioPDF={criarRelatorioPDF}
                exportarDoc={exportarDoc}
                usuarioLogado={usuarioLogado}
            />
        );
    }

    if (subTela === 'auditoria_localizacao') {
        const pontoValidoInicial = dadosAuditoria.find(p => p.latitude && p.longitude);
        const mapCenter = pontoValidoInicial 
            ? [pontoValidoInicial.latitude, pontoValidoInicial.longitude] 
            : [-22.9068, -43.1729];

        return (
            <div className="relatorios-page">
                <div className="filtros-container no-print">
                    <div className="relatorio-header-acoes">
                        <h2>Auditoria de Localização (GPS)</h2>
                        <button className="btn-voltar" onClick={() => { aoVoltar(); setDadosAuditoria([]); }}><Icon n="arrow-left"/> Voltar</button>
                    </div>

                    <div className="filtros-grid-rel">
                        <div className="filtro-item"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosAuditoria.dataInicio} onChange={e => setFiltrosAuditoria({...filtrosAuditoria, dataInicio: e.target.value})} /></div>
                        <div className="filtro-item"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosAuditoria.dataFim} onChange={e => setFiltrosAuditoria({...filtrosAuditoria, dataFim: e.target.value})} /></div>
                        
                        <div className="filtro-item">
                            <label>Usuário</label>
                            <select value={filtrosAuditoria.usuario} onChange={e => setFiltrosAuditoria({...filtrosAuditoria, usuario: e.target.value})}>
                                <option value="Todos">Todos os Usuários</option>
                                {usuariosSistema.map(u => (
                                    <option key={u.id_usuario} value={u.usuario}>{u.nome_completo}</option>
                                ))}
                            </select>
                        </div>
                        
                        <div className="filtro-item">
                            <label>Tipo de Registro</label>
                            <select value={filtrosAuditoria.tipo_registro} onChange={e => setFiltrosAuditoria({...filtrosAuditoria, tipo_registro: e.target.value})}>
                                <option value="Todos">Todos os Tipos</option>
                                <option value="CADASTRO_ATIVIDADE">Cadastro de Atividade</option>
                                <option value="LANCAMENTO_HORA_EXTRA">Hora Extra</option>
                                <option value="SEGUNDO_PLANO">Segundo Plano</option>
                            </select>
                        </div>
                    </div>

                    <div className="botoes-rel-row">
                        <button className="btn-gerar" data-busca="1" onClick={buscarDadosAuditoria} disabled={carregando}>{carregando ? 'Buscando...' : 'Pesquisar Dados'}</button>
                        <button className="btn-imprimir" onClick={handleExportPdfAuditoria}><Icon n="printer"/> Exportar PDF</button>
                        <button className="btn-jpg" onClick={() => handleExportJpg(exportRef)}><Icon n="camera"/> Exportar JPG</button>
                        <button className="btn-voltar" style={{ background: '#5A625B', color: '#fff', border: 'none' }} onClick={limparFiltrosAuditoria} disabled={carregando}>Limpar Filtros</button>
                    </div>
                </div>

                <div id="print-area" className="documento-elegante" ref={exportRef} style={{ width: '100%', maxWidth: '297mm', margin: '0 auto', padding: '15px' }}>
                    <header className="header-doc">
                        <img src={logo} alt="Logo" className="logo-doc" style={{ height: '80px', width: 'auto' }} />
                        <div className="info-doc" style={{ textAlign: 'right' }}>
                            <h1 style={{ fontSize: '1.5rem', marginBottom: '5px' }}>Auditoria de Rastreamento (GPS)</h1>
                            <p className="periodo-doc" style={{ fontSize: '0.9rem', margin: '2px 0' }}>
                                Período: {filtrosAuditoria.dataInicio ? `${formatarDataBr(filtrosAuditoria.dataInicio).split(',')[0]} até ${formatarDataBr(filtrosAuditoria.dataFim).split(',')[0]}` : 'Todo o Histórico'}
                            </p>
                            <p style={{ fontSize: '0.8rem', color: '#666', margin: '2px 0' }}>Gerado em: {new Date().toLocaleString()}</p>
                            <p style={{ fontSize: '0.8rem', color: '#666', margin: '0' }}>Gerado por: <strong>{usuarioLogado.nome_completo || usuarioLogado.nome}</strong></p>
                        </div>
                    </header>

                    <main className="conteudo-doc">
                        <div style={{ height: '400px', width: '100%', marginBottom: '20px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #ddd', zIndex: 0 }}>
                            <MapContainer center={mapCenter} zoom={dadosAuditoria.length > 0 ? 10 : 4} style={{ height: '100%', width: '100%' }} ref={mapRef}>
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                    attribution="&copy; OpenStreetMap contributors"
                                />
                                {dadosAuditoria.map(ponto => {
                                    if (!ponto.latitude || !ponto.longitude) return null;
                                    return (
                                        <Marker key={ponto.id_rastreio} position={[ponto.latitude, ponto.longitude]}>
                                            <Popup>
                                                <strong>{ponto.usuario}</strong><br/>
                                                {formatarDataBr(ponto.data_hora)}<br/>
                                                {ponto.tipo_registro}
                                            </Popup>
                                        </Marker>
                                    )
                                })}
                            </MapContainer>
                        </div>

                        <table className="tabela-elegante" style={{ fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th>Data e Hora</th>
                                    <th>Usuário</th>
                                    <th>Tipo de Registro</th>
                                    <th>Latitude</th>
                                    <th>Longitude</th>
                                    <th className="no-print" style={{ textAlign: 'center' }}>Ação</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dadosAuditoria.map(linha => (
                                    <tr key={linha.id_rastreio}>
                                        <td>{formatarDataBr(linha.data_hora)}</td>
                                        <td style={{ fontWeight: 'bold' }}>{linha.usuario}</td>
                                        
                                        <td>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                                                <span style={{ 
                                                    background: linha.tipo_registro.includes('HORA_EXTRA') ? '#E8F5E9' : '#E8F5E9', 
                                                    color: linha.tipo_registro.includes('HORA_EXTRA') ? '#2E7D32' : '#388E3C',
                                                    padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold'
                                                }}>
                                                    {linha.tipo_registro.replace(/_/g, ' ')}
                                                </span>
                                                
                                                {linha.detalhes_registro && (
                                                    <span style={{ fontSize: '0.75rem', color: '#555', marginTop: '2px', lineHeight: '1.2' }}>
                                                        {linha.detalhes_registro}
                                                    </span>
                                                )}
                                            </div>
                                        </td>

                                        <td>{linha.latitude || '-'}</td>
                                        <td>{linha.longitude || '-'}</td>
                                        <td className="no-print" style={{ textAlign: 'center' }}>
                                            {linha.latitude && linha.longitude ? (
                                                <button 
                                                    onClick={() => voarParaPonto(linha.latitude, linha.longitude)}
                                                    style={{
                                                        background: '#388E3C', color: '#fff', border: 'none', 
                                                        padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', 
                                                        fontSize: '0.75rem', fontWeight: 'bold'
                                                    }}
                                                    title="Centralizar no Mapa"
                                                >
                                                    <Icon n="pin"/> Ver
                                                </button>
                                            ) : <span style={{color: '#999', fontSize: '0.8rem'}}>Sem GPS</span>}
                                        </td>
                                    </tr>
                                ))}
                                {dadosAuditoria.length === 0 && (
                                    <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>Nenhum registro encontrado no sistema.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </main>
                </div>
            </div>
        );
    }

    // ==============================================================================
    // RELATÓRIO 3: PRESENÇA POR IMPLANTADOR
    // ==============================================================================
    if (subTela === 'presenca_implantador') {
        const carregarUnidadesPresenca = async (idProjeto) => {
            if (!idProjeto || idProjeto === 'Todos') { setUnidadesPresenca([]); return; }
            try {
                const r = await api.get(`/unidades/buscar?projeto=${idProjeto}&status=true&limite=1000`);
                setUnidadesPresenca(r.data.dados || r.data || []);
            } catch (e) { setUnidadesPresenca([]); }
        };

        const buscarPresencaImplantador = async () => {
            if (!filtrosPresenca.dataInicio || !filtrosPresenca.dataFim)
                return Swal.fire('Atenção', 'Selecione o período de datas.', 'warning');
            if (periodoBloqueado(filtrosPresenca.dataInicio, filtrosPresenca.dataFim)) return;
            setCarregando(true);
            try {
                const res = await api.get('/relatorios/presenca-implantadores', { params: filtrosPresenca });
                
                const agrupadosPorLocal = res.data.reduce((acc, curr) => {
                    const localKey = `${curr.nome_projeto}|${curr.nome_unidade}`;
                    if(!acc[localKey]) acc[localKey] = { projeto: curr.nome_projeto, unidade: curr.nome_unidade, registros: [] };
                    acc[localKey].registros.push(curr);
                    return acc;
                }, {});

                setDadosPresenca(agrupadosPorLocal);
                
                if (Object.keys(agrupadosPorLocal).length === 0)
                    Swal.fire('Informação', 'Nenhuma presença encontrada com esses filtros.', 'info');
            } catch (err) { Swal.fire('Erro', 'Falha ao buscar dados.', 'error'); }
            finally { setCarregando(false); }
        };

        return (
            <div className="relatorios-page">
                <div className="filtros-container no-print">
                    <div className="relatorio-header-acoes">
                        <h2>Presença por Implantador</h2>
                        <button className="btn-voltar" onClick={() => { aoVoltar(); setDadosPresenca(null); }}><Icon n="arrow-left"/> Voltar</button>
                    </div>
                    <div className="filtros-grid-rel">
                        <div className="filtro-item"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosPresenca.dataInicio} onChange={e => setFiltrosPresenca({...filtrosPresenca, dataInicio: e.target.value})} /></div>
                        <div className="filtro-item"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosPresenca.dataFim} onChange={e => setFiltrosPresenca({...filtrosPresenca, dataFim: e.target.value})} /></div>
                        <div className="filtro-item">
                            <label>Motivo</label>
                            <select value={filtrosPresenca.motivo} onChange={e => setFiltrosPresenca({...filtrosPresenca, motivo: e.target.value})}>
                                <option value="Todos">Todos os Motivos</option>
                                <option value="Implantação">Implantação</option>
                                <option value="Treinamento">Treinamento</option>
                                <option value="Visita Técnica">Visita Técnica</option>
                                <option value="Apoio ao Projeto">Apoio ao Projeto</option>
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Projeto</label>
                            <select value={filtrosPresenca.id_projeto} onChange={e => { const v = e.target.value; setFiltrosPresenca({...filtrosPresenca, id_projeto: v, id_unidade: 'Todas'}); carregarUnidadesPresenca(v); }}>
                                <option value="Todos">Todos os Projetos</option>
                                {projetosPresenca.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Unidade</label>
                            <select value={filtrosPresenca.id_unidade} onChange={e => setFiltrosPresenca({...filtrosPresenca, id_unidade: e.target.value})} disabled={filtrosPresenca.id_projeto === 'Todos'}>
                                <option value="Todas">Todas as Unidades</option>
                                {unidadesPresenca.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="botoes-rel-row">
                        <button className="btn-gerar" data-busca="1" onClick={buscarPresencaImplantador} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                        <button className="btn-imprimir" onClick={gerarPdfPresencaImpl}><Icon n="printer"/> Exportar PDF</button>
                        <button className="btn-jpg" onClick={() => { if (!dadosPresenca || Object.keys(dadosPresenca).length === 0) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning'); handleExportJpg(exportRef); }}><Icon n="camera"/> Exportar JPG</button>
                    </div>
                </div>

                <div id="print-area" className="documento-elegante" ref={exportRef}>
                    <header className="header-doc">
                        <img src={logo} alt="Logo" className="logo-doc" style={{ height: '100px', width: 'auto' }} />
                        <div className="info-doc">
                            <h1>Presença por Implantador</h1>
                            <p className="periodo-doc">Período: {formatarApenasDataBr(filtrosPresenca.dataInicio)} até {formatarApenasDataBr(filtrosPresenca.dataFim)}</p>
                            <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                            <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                        </div>
                    </header>
                    <main className="conteudo-doc">
                        {!dadosPresenca && <p className="aviso-vazio">Nenhum filtro aplicado.</p>}
                        {dadosPresenca && Object.keys(dadosPresenca).length === 0 && <p className="aviso-vazio">Nenhum dado encontrado para os filtros selecionados.</p>}
                        
                        {dadosPresenca && Object.entries(dadosPresenca).map(([chave, local]) => {
                            const porImplantador = local.registros.reduce((acc, r) => {
                                if(!acc[r.nome_implantador]) acc[r.nome_implantador] = new Set();
                                acc[r.nome_implantador].add(formatarApenasDataBr(r.data_inicio));
                                return acc;
                            }, {});

                            return (
                                <section key={chave} className="secao-resultado" style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#FBFBF9', borderLeft: '4px solid #3E7C5A', borderBottom: '1px solid #eee' }}>
                                    <h4 style={{ color: '#3E7C5A', margin: '0 0 15px 0', fontSize: '15px' }}>
                                        Projeto {local.projeto} &gt; {local.unidade} &gt; Período de {formatarApenasDataBr(filtrosPresenca.dataInicio)} até {formatarApenasDataBr(filtrosPresenca.dataFim)}
                                    </h4>
                                    
                                    <div style={{ marginLeft: '10px' }}>
                                        {Object.entries(porImplantador).sort().map(([imp, datas]) => {
                                            const datasOrdenadas = Array.from(datas).sort((a,b) => {
                                                return a.split('/').reverse().join('') > b.split('/').reverse().join('') ? 1 : -1;
                                            }).join(', ');

                                            return (
                                                <div key={imp} style={{ marginBottom: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                                                    <strong style={{ color: '#111' }}>{imp}:</strong> {datasOrdenadas}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </main>
                </div>
            </div>
        );
    }

    // ==============================================================================
    // RELATÓRIO 4: PRESENÇA POR EQUIPE
    // ==============================================================================
    if (subTela === 'presenca_equipe') {
        const carregarUnidadesEquipe = async (idProjeto) => {
            if (!idProjeto || idProjeto === 'Todos') { setUnidadesEquipe([]); return; }
            try {
                const r = await api.get(`/unidades/buscar?projeto=${idProjeto}&status=true&limite=1000`);
                setUnidadesEquipe(r.data.dados || r.data || []);
            } catch (e) { setUnidadesEquipe([]); }
        };

        const buscarPresencaEquipe = async () => {
            if (!filtrosEquipe.dataInicio || !filtrosEquipe.dataFim)
                return Swal.fire('Atenção', 'Selecione o período de datas.', 'warning');
            if (periodoBloqueado(filtrosEquipe.dataInicio, filtrosEquipe.dataFim)) return;
            setCarregando(true);
            try {
                const res = await api.get('/relatorios/presenca-implantadores', { params: filtrosEquipe }); 
                
                const agrupadosPorLocal = res.data.reduce((acc, curr) => {
                    const localKey = `${curr.nome_projeto}|${curr.nome_unidade}`;
                    if(!acc[localKey]) acc[localKey] = { projeto: curr.nome_projeto, unidade: curr.nome_unidade, registros: [] };
                    acc[localKey].registros.push(curr);
                    return acc;
                }, {});

                setDadosEquipe(agrupadosPorLocal);
                if (Object.keys(agrupadosPorLocal).length === 0)
                    Swal.fire('Informação', 'Nenhuma escala encontrada com esses filtros.', 'info');
            } catch (err) { Swal.fire('Erro', 'Falha ao buscar dados.', 'error'); }
            finally { setCarregando(false); }
        };

        return (
            <div className="relatorios-page">
                <div className="filtros-container no-print">
                    <div className="relatorio-header-acoes">
                        <h2>Presença por Equipe</h2>
                        <button className="btn-voltar" onClick={() => { aoVoltar(); setDadosEquipe(null); }}><Icon n="arrow-left"/> Voltar</button>
                    </div>
                    <div className="filtros-grid-rel">
                        <div className="filtro-item"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosEquipe.dataInicio} onChange={e => setFiltrosEquipe({...filtrosEquipe, dataInicio: e.target.value})} /></div>
                        <div className="filtro-item"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosEquipe.dataFim} onChange={e => setFiltrosEquipe({...filtrosEquipe, dataFim: e.target.value})} /></div>
                        <div className="filtro-item">
                            <label>Motivo</label>
                            <select value={filtrosEquipe.motivo} onChange={e => setFiltrosEquipe({...filtrosEquipe, motivo: e.target.value})}>
                                <option value="Todos">Todos os Motivos</option>
                                <option value="Implantação">Implantação</option>
                                <option value="Treinamento">Treinamento</option>
                                <option value="Visita Técnica">Visita Técnica</option>
                                <option value="Apoio ao Projeto">Apoio ao Projeto</option>
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Projeto</label>
                            <select value={filtrosEquipe.id_projeto} onChange={e => { const v = e.target.value; setFiltrosEquipe({...filtrosEquipe, id_projeto: v, id_unidade: 'Todas'}); carregarUnidadesEquipe(v); }}>
                                <option value="Todos">Todos os Projetos</option>
                                {projetosEquipe.map(p => <option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>)}
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Unidade</label>
                            <select value={filtrosEquipe.id_unidade} onChange={e => setFiltrosEquipe({...filtrosEquipe, id_unidade: e.target.value})} disabled={filtrosEquipe.id_projeto === 'Todos'}>
                                <option value="Todas">Todas as Unidades</option>
                                {unidadesEquipe.map(u => <option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="botoes-rel-row">
                        <button className="btn-gerar" data-busca="1" onClick={buscarPresencaEquipe} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                        <button className="btn-imprimir" onClick={gerarPdfPresencaEquipe}><Icon n="printer"/> Exportar PDF</button>
                        <button className="btn-jpg" onClick={() => { if (!dadosEquipe || Object.keys(dadosEquipe).length === 0) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning'); handleExportJpg(exportRef); }}><Icon n="camera"/> Exportar JPG</button>
                    </div>
                </div>

                <div id="print-area" className="documento-elegante" ref={exportRef}>
                    <header className="header-doc">
                        <img src={logo} alt="Logo" className="logo-doc" style={{ height: '100px', width: 'auto' }} />
                        <div className="info-doc">
                            <h1>Presença por Equipe</h1>
                            <p className="periodo-doc">Período: {formatarApenasDataBr(filtrosEquipe.dataInicio)} até {formatarApenasDataBr(filtrosEquipe.dataFim)}</p>
                            <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                            <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                        </div>
                    </header>
                    <main className="conteudo-doc">
                        {!dadosEquipe && <p className="aviso-vazio">Nenhum filtro aplicado.</p>}
                        {dadosEquipe && Object.keys(dadosEquipe).length === 0 && <p className="aviso-vazio">Nenhum dado encontrado para os filtros selecionados.</p>}
                        
                        {dadosEquipe && Object.entries(dadosEquipe).map(([chave, local]) => {
                            const porData = local.registros.reduce((acc, r) => {
                                const dataFormatada = formatarApenasDataBr(r.data_inicio);
                                if(!acc[dataFormatada]) acc[dataFormatada] = new Set();
                                acc[dataFormatada].add(r.nome_implantador);
                                return acc;
                            }, {});

                            return (
                                <section key={chave} className="secao-resultado" style={{ marginBottom: '30px', padding: '15px', backgroundColor: '#FBFBF9', borderLeft: '4px solid #388E3C', borderBottom: '1px solid #eee' }}>
                                    <h4 style={{ color: '#388E3C', margin: '0 0 15px 0', fontSize: '15px' }}>
                                        Projeto {local.projeto} &gt; {local.unidade} &gt; Período de {formatarApenasDataBr(filtrosEquipe.dataInicio)} até {formatarApenasDataBr(filtrosEquipe.dataFim)}
                                    </h4>
                                    
                                    <div style={{ marginLeft: '10px' }}>
                                        {Object.entries(porData).sort((a,b) => {
                                            return a[0].split('/').reverse().join('') > b[0].split('/').reverse().join('') ? 1 : -1;
                                        }).map(([data, nomes]) => {
                                            const nomesOrdenados = Array.from(nomes).sort().join(', ');

                                            return (
                                                <div key={data} style={{ marginBottom: '8px', fontSize: '14px', lineHeight: '1.6' }}>
                                                    <strong style={{ color: '#111' }}>{data}:</strong> {nomesOrdenados}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                    </main>
                </div>
            </div>
        );
    }

    // ==============================================================================
    // RELATÓRIO 5: TEMPO MÉDIO DE AÇÃO (PIVÔ: TEMPO)
    // ==============================================================================
    if (subTela === 'tempo_medio_acao') {
        const r = dadosTempo?.resumo;
        const STATUS_OPCOES = ['A Iniciar', 'Em andamento', 'Atrasado', 'Fechado'];
        const CLS = {
            'ESTOURADO': { txt: 'Estourado', cls: 'tm-badge--estourado' },
            'NA MEDIA':  { txt: 'Na média',  cls: 'tm-badge--media' },
            'LEGAL':     { txt: 'No prazo',  cls: 'tm-badge--legal' },
            'SEM DADOS': { txt: 'Sem dados', cls: 'tm-badge--sem' }
        };
        const badge = (c) => <span className={`tm-badge ${CLS[c]?.cls || 'tm-badge--sem'}`}>{CLS[c]?.txt || c}</span>;

        return (
            <div className="relatorios-page">
                <div className="filtros-container no-print">
                    <div className="relatorio-header-acoes">
                        <h2>Tempo Médio de Ação</h2>
                        <button className="btn-voltar" onClick={() => { aoVoltar(); setDadosTempo(null); }}><Icon n="arrow-left"/> Voltar</button>
                    </div>

                    <div className="filtros-grid-rel">
                        <div className="filtro-item"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosTempo.dataInicio} onChange={e => setFiltrosTempo({ ...filtrosTempo, dataInicio: e.target.value })} /></div>
                        <div className="filtro-item"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtrosTempo.dataFim} onChange={e => setFiltrosTempo({ ...filtrosTempo, dataFim: e.target.value })} /></div>
                        <div className="filtro-item">
                            <label>Projeto</label>
                            <select value={filtrosTempo.id_projeto} onChange={e => setFiltrosTempo({ ...filtrosTempo, id_projeto: e.target.value })}>
                                <option value="Todos">Todos os Projetos</option>
                                {projetosTempo.map(p => { const id = p.id_projeto || p.id; return <option key={id} value={id}>{p.nome_projeto}</option>; })}
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Responsável</label>
                            <select value={filtrosTempo.responsavel} onChange={e => setFiltrosTempo({ ...filtrosTempo, responsavel: e.target.value })}>
                                <option value="Todos">Todos</option>
                                {OPCOES_RESPONSAVEL.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <div className="filtro-item">
                            <label>Situação</label>
                            <select value={filtrosTempo.status} onChange={e => setFiltrosTempo({ ...filtrosTempo, status: e.target.value })}>
                                <option value="Todos">Todas</option>
                                {STATUS_OPCOES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="botoes-rel-row">
                        <button className="btn-gerar" data-busca="1" onClick={buscarTempoMedio} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                        <button className="btn-imprimir" onClick={gerarPdfTempoMedio}><Icon n="printer"/> Exportar PDF</button>
                        <button className="btn-jpg" onClick={() => { if (!dadosTempo || (dadosTempo.itens || []).length === 0) return Swal.fire('Atenção', 'Gere o relatório primeiro.', 'warning'); handleExportJpg(exportRef); }}><Icon n="camera"/> Exportar JPG</button>
                    </div>
                </div>

                <div id="print-area" className="documento-elegante" ref={exportRef}>
                    <header className="header-doc">
                        <img src={logo} alt="Logo" className="logo-doc" style={{ height: '120px', width: 'auto' }} />
                        <div className="info-doc">
                            <h1>Tempo Médio de Ação</h1>
                            <p className="periodo-doc">Período: {formatarApenasDataBr(filtrosTempo.dataInicio)} até {formatarApenasDataBr(filtrosTempo.dataFim)}</p>
                            <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                            <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                        </div>
                    </header>

                    {!dadosTempo || (dadosTempo.itens || []).length === 0 ? (
                        <div className="aviso-vazio">Selecione um período e clique em “Filtrar Dados”.</div>
                    ) : (
                        <main className="conteudo-doc">
                            {/* ---------- KPIs ---------- */}
                            <div className="tm-kpis">
                                <div className="tm-kpi"><span className="tm-kpi-num">{r.com_dados}</span><span className="tm-kpi-lbl">Execuções avaliadas</span><small>{r.sem_dados} sem dados de tempo</small></div>
                                <div className="tm-kpi"><span className="tm-kpi-num">{fmtMin(r.media_previsto)}</span><span className="tm-kpi-lbl">Média prevista</span></div>
                                <div className="tm-kpi"><span className="tm-kpi-num">{fmtMin(r.media_gasto)}</span><span className="tm-kpi-lbl">Média gasta</span></div>
                                <div className="tm-kpi"><span className={`tm-kpi-num ${r.media_desvio > 0 ? 'tm-neg' : 'tm-pos'}`}>{fmtDesvio(r.media_desvio)}</span><span className="tm-kpi-lbl">Desvio médio</span></div>
                            </div>

                            {/* ---------- Distribuição ---------- */}
                            <div className="tm-dist">
                                <div className="tm-dist-card tm-dist--estourado"><b>Estourado</b><span>{r.qtd_estourado}</span><small>média {fmtMin(r.media_tempo_estourado)}</small></div>
                                <div className="tm-dist-card tm-dist--media"><b>Na média</b><span>{r.qtd_na_media}</span><small>média {fmtMin(r.media_tempo_na_media)}</small></div>
                                <div className="tm-dist-card tm-dist--legal"><b>No prazo</b><span>{r.qtd_legal}</span><small>média {fmtMin(r.media_tempo_legal)}</small></div>
                            </div>

                            {/* ---------- Ranking por responsável ---------- */}
                            <div className="agrupamento-projeto">
                                <h3>Ranking por Responsável <small>(maior desvio primeiro)</small></h3>
                                <table className="tabela-elegante">
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left' }}>Responsável</th>
                                            <th className="center">Itens</th>
                                            <th className="center">Média prev.</th>
                                            <th className="center">Média gasto</th>
                                            <th className="center">Desvio médio</th>
                                            <th className="center">Estourados</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dadosTempo.porResponsavel.map((x, i) => (
                                            <tr key={i}>
                                                <td>{x.responsavel}</td>
                                                <td className="center">{x.qtd}</td>
                                                <td className="center">{fmtMin(x.media_previsto)}</td>
                                                <td className="center">{fmtMin(x.media_gasto)}</td>
                                                <td className="center" style={{ color: x.media_desvio > 0 ? '#8F332F' : '#2E7D32', fontWeight: 700 }}>{fmtDesvio(x.media_desvio)}</td>
                                                <td className="center">{x.estourados}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* ---------- Ações mais demoradas ---------- */}
                            <div className="agrupamento-projeto">
                                <h3>Ações Mais Demoradas <small>(maior tempo gasto primeiro)</small></h3>
                                <table className="tabela-elegante">
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left' }}>Ação</th>
                                            <th className="center">Ocorr.</th>
                                            <th className="center">Média prev.</th>
                                            <th className="center">Média gasto</th>
                                            <th className="center">Desvio médio</th>
                                            <th className="center">Estourados</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dadosTempo.porAcao.slice(0, 15).map((x, i) => (
                                            <tr key={i}>
                                                <td style={{ fontSize: '0.82rem' }}>{x.descricao}</td>
                                                <td className="center">{x.qtd}</td>
                                                <td className="center">{fmtMin(x.media_previsto)}</td>
                                                <td className="center">{fmtMin(x.media_gasto)}</td>
                                                <td className="center" style={{ color: x.media_desvio > 0 ? '#8F332F' : '#2E7D32', fontWeight: 700 }}>{fmtDesvio(x.media_desvio)}</td>
                                                <td className="center">{x.estourados}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* ---------- Detalhe por execução ---------- */}
                            <div className="agrupamento-projeto">
                                <h3>Detalhe por Execução <small>({dadosTempo.itens.length} itens)</small></h3>
                                <table className="tabela-elegante">
                                    <thead>
                                        <tr>
                                            <th style={{ textAlign: 'left' }}>Projeto</th>
                                            <th style={{ textAlign: 'left' }}>Ação</th>
                                            <th style={{ textAlign: 'left' }}>Responsável</th>
                                            <th className="center">Prev.</th>
                                            <th className="center">Gasto</th>
                                            <th className="center">Desvio</th>
                                            <th className="center">Classificação</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {dadosTempo.itens.map((x, i) => (
                                            <tr key={i}>
                                                <td style={{ fontSize: '0.8rem' }}>{x.nome_projeto || '-'}</td>
                                                <td style={{ fontSize: '0.8rem' }}>{x.descricao}{x.modulo ? <span className="tm-mod">{x.modulo}</span> : null}</td>
                                                <td style={{ fontSize: '0.8rem' }}>{x.responsavel || '-'}</td>
                                                <td className="center">{fmtMin(x.previsto_min)}</td>
                                                <td className="center">{fmtMin(x.gasto_min)}</td>
                                                <td className="center" style={{ color: x.desvio_min > 0 ? '#8F332F' : '#2E7D32', fontWeight: 700 }}>{x.classificacao === 'SEM DADOS' ? '-' : fmtDesvio(x.desvio_min)}</td>
                                                <td className="center">{badge(x.classificacao)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <p className="tm-nota">
                                Base de cálculo: tempo previsto e tempo gasto registrados em horas (hh:mm) na grade do Plano de Ação.
                                “Estourado”, “Na média” e “No prazo” usam tolerância de ±10% sobre o previsto.
                                Itens sem previsto/gasto preenchidos entram como “Sem dados”.
                            </p>
                        </main>
                    )}
                </div>
            </div>
        );
    }

    // ==============================================================================
    // RELATÓRIO 1: ESTATÍSTICAS DA IMPLANTAÇÃO  /  ESTATÍSTICA DOS PROJETOS
    // (mesmo molde - o escopo muda apenas pelo subTela/endpoint)
    // ==============================================================================
    const tituloEstatistica = subTela === 'estatistica_projetos' ? 'Estatística dos Projetos' : 'Estatísticas da Implantação';
    // Relatório de Projetos: a coluna/checkbox passa a representar os
    // Operadores/Analistas do projeto (e não os Implantadores).
    const ehRelProjetos = subTela === 'estatistica_projetos';
    const rotuloEquipe = ehRelProjetos ? 'Operador(es)/Analista(s)' : 'Implantador(es)';
    const motivosUnicos = [...new Set(dados.map(d => d.motivos))];

    return (
        <div className="relatorios-page">
            <div className="filtros-container no-print">
                <div className="relatorio-header-acoes">
                    <h2>{tituloEstatistica}</h2>
                    <button className="btn-voltar" onClick={() => { aoVoltar(); setDados([]); }}><Icon n="arrow-left"/> Voltar</button>
                </div>

                <div className="filtros-grid-rel">
                    <div className="filtro-item"><label>Data Início</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataInicio} onChange={e => setFiltros({...filtros, dataInicio: e.target.value})} /></div>
                    <div className="filtro-item"><label>Data Fim</label><input type="date" min="1900-01-01" max="2100-12-31" value={filtros.dataFim} onChange={e => setFiltros({...filtros, dataFim: e.target.value})} /></div>
                    <div className="filtro-item">
                        <label>Motivo</label>
                        <select value={filtros.motivo} onChange={e => setFiltros({...filtros, motivo: e.target.value})}>
                            <option value="Todos">Todos os Motivos</option>
                            <option value="Implantação">Implantação</option>
                            <option value="Treinamento">Treinamento</option>
                            <option value="Visita Técnica">Visita Técnica</option>
                            <option value="Apoio ao Projeto">Apoio ao Projeto</option>
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Projeto</label>
                        <select value={filtros.projeto} onChange={e => setFiltros({...filtros, projeto: e.target.value, unidade: 'Todas'})}>
                            <option value="Todos">Todos os Projetos</option>
                            {projetos.map(p => {
                                const idProj = p.id_projeto || p.id;
                                return <option key={idProj} value={idProj}>{p.nome_projeto}</option>;
                            })}
                        </select>
                    </div>
                    <div className="filtro-item">
                        <label>Unidade</label>
                        <select value={filtros.unidade} onChange={e => setFiltros({...filtros, unidade: e.target.value})}>
                            <option value="Todas">Todas as Unidades</option>
                            {unidadesFiltradas.map(u => {
                                const idUni = u.id_unidade || u.id;
                                return <option key={idUni} value={idUni}>{u.nome_unidade}</option>;
                            })}
                        </select>
                    </div>
                </div>

                <div className="filtros-grid-rel" style={{ marginTop: '10px' }}>
                    <div className="filtro-item" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" id="chkImplantador" checked={mostrarImplantador} onChange={e => setMostrarImplantador(e.target.checked)} />
                        <label htmlFor="chkImplantador" style={{ margin: 0 }}>{ehRelProjetos ? 'Mostrar Operadores/Analistas' : 'Mostrar Implantador'}</label>
                    </div>
                    <div className="filtro-item" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                        <input type="checkbox" id="chkProfCap" checked={mostrarProfCap} onChange={e => setMostrarProfCap(e.target.checked)} />
                        <label htmlFor="chkProfCap" style={{ margin: 0 }}>Mostrar Profissionais Capacitados</label>
                    </div>
                    {!ehRelProjetos && (
                        <div className="filtro-item" style={{ flexDirection: 'row', alignItems: 'center', gap: '8px' }}>
                            <input type="checkbox" id="chkEquipeProjeto" checked={mostrarEquipeProjeto} onChange={e => setMostrarEquipeProjeto(e.target.checked)} />
                            <label htmlFor="chkEquipeProjeto" style={{ margin: 0 }}>Mostrar Equipe Projeto</label>
                        </div>
                    )}
                </div>

                <div className="botoes-rel-row">
                    <button className="btn-gerar" data-busca="1" onClick={buscarDados} disabled={carregando}>{carregando ? 'Processando...' : 'Filtrar Dados'}</button>
                    <button className="btn-imprimir" onClick={handleExportPdf}><Icon n="printer"/> Exportar PDF</button>
                    <button className="btn-jpg" onClick={() => handleExportJpg(exportRef)}><Icon n="camera"/> Exportar JPG</button>
                </div>
            </div>

            <div id="print-area" className="documento-elegante" ref={exportRef}>
                <header className="header-doc">
                    <img src={logo} alt="Logo" className="logo-doc" style={{ height: '120px', width: 'auto' }} />
                    <div className="info-doc">
                        <h1>{tituloEstatistica}</h1>
                        <p className="periodo-doc">Período: {formatarApenasDataBr(filtros.dataInicio)} até {formatarApenasDataBr(filtros.dataFim)}</p>
                        <p><strong>Gerado em:</strong> {new Date().toLocaleString('pt-BR')}</p>
                        <p><strong>Usuário:</strong> {usuarioLogado.nome_completo || usuarioLogado.nome}</p>
                    </div>
                </header>

                <main className="conteudo-doc">
                    {motivosUnicos.map(mot => {
                        const dadosPorMotivo = dados.filter(d => d.motivos === mot);
                        const projetosNoMotivo = [...new Set(dadosPorMotivo.map(d => d.nome_projeto))];

                        return (
                            <section key={mot} className="secao-resultado">
                                <div className="totalizador-motivo">Total de {mot}: <span>{dadosPorMotivo.length}</span></div>

                                {projetosNoMotivo.map(proj => {
                                    const unidadesNoProj = dadosPorMotivo.filter(d => d.nome_projeto === proj);
                                    return (
                                        <div key={proj} className="agrupamento-projeto">
                                            <h3>Projeto: {proj} <small>(Soma: {unidadesNoProj.length} | Tempo Total: {somarHorasString(unidadesNoProj)})</small></h3>
                                            <table className="tabela-elegante">
                                                <thead>
                                                    <tr>
                                                        <th style={{ width: '30%', textAlign: 'left' }}>Unidade</th>
                                                        <th style={{ width: '25%', textAlign: 'left' }}>Produto(s)</th>
                                                        {mostrarImplantador && <th style={{ textAlign: 'left' }}>{rotuloEquipe}</th>}
                                                        {!ehRelProjetos && mostrarEquipeProjeto && <th style={{ textAlign: 'left' }}>Equipe Projeto</th>}
                                                        {mostrarProfCap && <th style={{ width: '15%', textAlign: 'left' }}>Profissionais Cap.</th>}
                                                        <th style={{ width: '15%', textAlign: 'center' }}>Data Reg.</th>
                                                        <th style={{ width: '15%', textAlign: 'center' }}>Tempo Gasto</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {unidadesNoProj.map((u, i) => (
                                                        <tr key={i}>
                                                            <td>{u.nome_unidade}</td>
                                                            <td style={{ fontSize: '0.8rem', color: '#555' }}>{u.produtos_trabalhados || '---'}</td>
                                                            {mostrarImplantador && <td style={{ fontSize: '0.8rem', color: '#555' }}>{(ehRelProjetos ? u.operadores_analistas : u.implantadores) || '---'}</td>}
                                                            {!ehRelProjetos && mostrarEquipeProjeto && <td style={{ fontSize: '0.8rem', color: '#555' }}>{u.equipe_projeto || '---'}</td>}
                                                            {mostrarProfCap && <td>{u.profissionais_env || '0'}</td>}
                                                            <td style={{ textAlign: 'center' }}>{formatarApenasDataBr(u.data_inicial)}</td>
                                                            <td style={{ textAlign: 'center' }}>{u.tempo_gasto || '00:00'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    );
                                })}
                            </section>
                        );
                    })}

                    {dados.length > 0 && (
                        <section className="totalizador-geral">
                            <div className="tg-titulo">Totais Gerais <small>(todos os motivos da visita)</small></div>
                            <div className="tg-cards">
                                <div className="tg-card">
                                    <span className="tg-num">{dados.length}</span>
                                    <span className="tg-lbl">Total de Registros</span>
                                </div>
                                <div className="tg-card">
                                    <span className="tg-num">{fmtMin(somarMinutosLista(dados))}</span>
                                    <span className="tg-lbl">Tempo Total Geral</span>
                                </div>
                                {mostrarProfCap && (
                                    <div className="tg-card">
                                        <span className="tg-num">{somarProfCapLista(dados)}</span>
                                        <span className="tg-lbl">Profissionais Capacitados</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}
                </main>
            </div>
        </div>
    );
};

export default Relatorios;