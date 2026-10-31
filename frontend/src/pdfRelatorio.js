/* ARQUIVO: src/pdfRelatorio.js
 * Motor de PDF vetorial padrão dos relatórios (A4 paisagem): logo, título, período,
 * "Gerado em / Usuário", blocos, tabelas zebradas e rodapé com paginação.
 * Usado pelos Relatórios e pelo painel Faturamento Consolidado. */
import jsPDF from 'jspdf';
import logo from './logo.png';

const carregarLogoImg = () => new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = logo;
});

export async function criarRelatorioPDF(titulo, periodoTxt, nomeUsuario) {
    const doc = new jsPDF('l', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 12, CW = W - 2 * M;
    const green = [46, 125, 50], blue = [21, 101, 192], ink = [31, 41, 51], muted = [110, 116, 124], grid = [222, 226, 230];
    const cursor = { y: M };

    const img = await carregarLogoImg();
    const logoH = 18, logoW = img ? logoH * ((img.naturalWidth / img.naturalHeight) || 1) : 0;
    if (img) { try { doc.addImage(img, 'PNG', M, M, logoW, logoH); } catch (e) {} }
    doc.setFont(undefined, 'bold'); doc.setFontSize(18); doc.setTextColor(...green);
    doc.text(titulo, W - M, M + 6, { align: 'right' });
    doc.setFont(undefined, 'normal'); doc.setFontSize(9); doc.setTextColor(...muted);
    if (periodoTxt) doc.text(periodoTxt, W - M, M + 12, { align: 'right' });
    doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}   ·   Usuário: ${nomeUsuario || '-'}`, W - M, M + 17, { align: 'right' });
    cursor.y = M + logoH + 6;
    doc.setDrawColor(...green); doc.setLineWidth(0.6); doc.line(M, cursor.y, W - M, cursor.y); doc.setLineWidth(0.2);
    cursor.y += 7;

    const garantir = (need) => { if (cursor.y + need > H - 12) { doc.addPage(); cursor.y = M; } };

    const bloco = (txt, c = blue) => {
        garantir(9);
        doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.setTextColor(...c);
        const lines = doc.splitTextToSize(txt, CW);
        lines.forEach((ln, i) => doc.text(ln, M, cursor.y + i * 5));
        cursor.y += lines.length * 5 + 1.5; doc.setFont(undefined, 'normal');
    };

    const tabela = (cols, linhas) => {
        const headerH = 7.5, lineH = 4, padX = 2;
        const alinhar = (c, x) => (c.a === 'c' ? { x: x + c.w / 2, align: 'center' } : c.a === 'r' ? { x: x + c.w - padX, align: 'right' } : { x: x + padX, align: 'left' });
        const cabec = () => {
            doc.setFillColor(241, 243, 245); doc.setDrawColor(...grid); doc.rect(M, cursor.y, CW, headerH, 'FD');
            doc.setFont(undefined, 'bold'); doc.setFontSize(8); doc.setTextColor(...ink);
            let x = M;
            cols.forEach(c => { const p = alinhar(c, x); doc.text(c.h, p.x, cursor.y + headerH - 2.3, { align: p.align }); x += c.w; });
            cursor.y += headerH; doc.setFont(undefined, 'normal');
        };
        cabec(); doc.setFontSize(8);
        linhas.forEach((linha, idx) => {
            const cellLines = cols.map((c, ci) => { const cell = linha[ci]; const tx = (cell && typeof cell === 'object') ? (cell.t ?? '') : String(cell ?? ''); return doc.splitTextToSize(tx, c.w - padX * 2); });
            const maxL = Math.max(1, ...cellLines.map(a => a.length));
            const rowH = maxL * lineH + 2.4;
            if (cursor.y + rowH > H - 12) { doc.addPage(); cursor.y = M; cabec(); doc.setFontSize(8); }
            if (idx % 2 === 1) { doc.setFillColor(249, 250, 251); doc.rect(M, cursor.y, CW, rowH, 'F'); }
            let x = M;
            cols.forEach((c, ci) => {
                const cell = linha[ci]; const o = (cell && typeof cell === 'object') ? cell : { t: String(cell ?? '') };
                doc.setTextColor(...(o.color || ink)); doc.setFont(undefined, o.bold ? 'bold' : 'normal');
                const p = alinhar(c, x);
                cellLines[ci].forEach((ln, li) => doc.text(ln, p.x, cursor.y + 3.8 + li * lineH, { align: p.align }));
                x += c.w;
            });
            doc.setFont(undefined, 'normal'); doc.setDrawColor(...grid); doc.line(M, cursor.y + rowH, M + CW, cursor.y + rowH);
            cursor.y += rowH;
        });
        cursor.y += 6;
    };

    const texto = (txt, opts = {}) => {
        garantir(8); doc.setFont(undefined, opts.italic ? 'italic' : 'normal'); doc.setFontSize(opts.size || 8); doc.setTextColor(...(opts.color || muted));
        const lines = doc.splitTextToSize(txt, CW); lines.forEach((ln, i) => doc.text(ln, M, cursor.y + i * 4)); cursor.y += lines.length * 4 + 2; doc.setFont(undefined, 'normal');
    };

    /** Linha de cards de indicador: [{ num, lbl, sub, c }] (mesmo visual do relatório de Tempo Médio). */
    const kpis = (itens) => {
        const gap = 4, kpiW = (CW - (itens.length - 1) * gap) / itens.length, kpiH = 20;
        garantir(kpiH + 6);
        itens.forEach((k, i) => {
            const x = M + i * (kpiW + gap), c = k.c || green;
            doc.setFillColor(248, 249, 250); doc.setDrawColor(...grid);
            doc.roundedRect(x, cursor.y, kpiW, kpiH, 1.5, 1.5, 'FD');
            doc.setFillColor(...c); doc.rect(x, cursor.y, 1.6, kpiH, 'F');
            doc.setFont(undefined, 'bold'); doc.setFontSize(13); doc.setTextColor(...c);
            doc.text(doc.splitTextToSize(String(k.num), kpiW - 7)[0], x + 5, cursor.y + 8.5);
            doc.setFont(undefined, 'bold'); doc.setFontSize(7); doc.setTextColor(90, 90, 90);
            doc.text(doc.splitTextToSize(k.lbl.toUpperCase(), kpiW - 7)[0], x + 5, cursor.y + 13.5);
            if (k.sub) { doc.setFont(undefined, 'normal'); doc.setFontSize(6.8); doc.setTextColor(...(k.subColor || [150, 150, 150])); doc.text(doc.splitTextToSize(k.sub, kpiW - 7)[0], x + 5, cursor.y + 17.5); }
        });
        cursor.y += kpiH + 6;
    };

    /** Gráfico de barras vertical: [{ rot, v, cor? }]. Aceita negativos (linha de zero). */
    const graficoBarras = (serie, { altura = 55, fmt = String, cor = green, x0 = M, largura = CW, titulo } = {}) => {
        garantir(altura + (titulo ? 8 : 2) + 8);
        if (titulo) { doc.setFont(undefined, 'bold'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text(titulo, x0, cursor.y + 3); cursor.y += 6; }
        const eixoW = 18, top = cursor.y + 4, alt = altura - 10;
        const max = Math.max(0, ...serie.map(s => s.v)), min = Math.min(0, ...serie.map(s => s.v));
        const faixa = (max - min) || 1, y = (v) => top + ((max - v) / faixa) * alt;
        const area = largura - eixoW, passo = area / Math.max(1, serie.length), bw = Math.min(14, passo * 0.62);
        // grade e eixo
        doc.setFontSize(6.5); doc.setTextColor(...muted); doc.setDrawColor(...grid);
        [max, (max + min) / 2, min].forEach(v => { doc.line(x0 + eixoW, y(v), x0 + largura, y(v)); doc.text(fmt(v), x0 + eixoW - 1.5, y(v) + 1, { align: 'right' }); });
        doc.setDrawColor(...muted); doc.line(x0 + eixoW, y(0), x0 + largura, y(0));
        // Muitas barras: sem valor sobre a barra e rótulo do eixo a cada N
        const comValor = passo >= 9, cadaN = Math.max(1, Math.ceil(9 / passo));
        serie.forEach((s, i) => {
            const cx = x0 + eixoW + passo * i + passo / 2, y1 = y(Math.max(0, s.v)), y2 = y(Math.min(0, s.v));
            doc.setFillColor(...(s.cor || cor));
            if (y2 - y1 > 0.2) doc.rect(cx - bw / 2, y1, bw, y2 - y1, 'F');
            doc.setFontSize(6.3); doc.setTextColor(...ink);
            if (comValor) doc.text(fmt(s.v), cx, s.v >= 0 ? y1 - 1.2 : y2 + 3, { align: 'center' });
            if (i % cadaN === 0 || i === serie.length - 1) { doc.setTextColor(...muted); doc.text(s.rot, cx, top + alt + 5, { align: 'center' }); }
        });
        cursor.y = top + alt + 9;
    };

    const finalizar = (nomeArquivo) => {
        const total = doc.internal.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i); doc.setFont(undefined, 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
            doc.text('Opera Echo Management System · ' + titulo, M, H - 6);
            doc.text(`Página ${i} de ${total}`, W - M, H - 6, { align: 'right' });
        }
        doc.save(`${nomeArquivo}.pdf`);
    };

    return { doc, W, H, M, CW, cursor, colors: { green, blue, ink, muted, grid }, bloco, tabela, texto, kpis, graficoBarras, garantir, finalizar };
}
