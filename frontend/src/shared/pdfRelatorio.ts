/* Motor de PDF vetorial padrão dos relatórios (A4 paisagem): logo, título, período,
 * "Gerado em / Usuário", blocos, tabelas zebradas e rodapé com paginação.
 * Usado pelos Relatórios e pelo painel Faturamento Consolidado. */
import jsPDF from 'jspdf';

const logo = '/logo.png';

export type Rgb = [number, number, number];
export interface CelulaRica { t: string; color?: Rgb; bold?: boolean }
export type Celula = string | number | null | undefined | CelulaRica;
export interface ColunaPdf { h: string; w: number; a?: 'l' | 'c' | 'r' }
export interface IndicadorPdf { num: string | number; lbl: string; sub?: string; c?: Rgb; subColor?: Rgb }
export interface BarraPdf { rot: string; v: number; cor?: Rgb }
export interface OpcoesGraficoPdf { altura?: number; fmt?: (valor: number) => string; cor?: Rgb; x0?: number; largura?: number; titulo?: string }

const ALTURA_TITULO_MM = 4;
const FOLGA_ROTULO_MM = 2;

const carregarLogoImg = () => new Promise<HTMLImageElement | null>((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = logo;
});

export async function criarRelatorioPDF(titulo: string, periodoTxt: string, nomeUsuario?: string) {
    const doc = new jsPDF('l', 'mm', 'a4');
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    const M = 12, CW = W - 2 * M;
    const green: Rgb = [27, 94, 32], blue: Rgb = [27, 94, 32], brass: Rgb = [156, 122, 60], fio: Rgb = [203, 213, 225], ink: Rgb = [31, 41, 51], muted: Rgb = [110, 116, 124], grid: Rgb = [222, 226, 230];
    const cursor = { y: M };

    const img = await carregarLogoImg();
    const logoH = 18, logoW = img ? logoH * ((img.naturalWidth / img.naturalHeight) || 1) : 0;
    if (img) doc.addImage(img, 'PNG', M, M, logoW, logoH);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...brass);
    doc.text('R E L A T Ó R I O', W - M, M + 1, { align: 'right' });
    doc.setFont('times', 'bold'); doc.setFontSize(17); doc.setTextColor(...green);
    doc.text(titulo, W - M, M + 7.5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(51, 65, 85);
    if (periodoTxt) doc.text(periodoTxt, W - M, M + 12.5, { align: 'right' });
    doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(`Emitido em ${new Date().toLocaleString('pt-BR')} por ${nomeUsuario || '-'}`, W - M, M + 17, { align: 'right' });
    cursor.y = M + logoH + 6;
    doc.setDrawColor(...green); doc.setLineWidth(0.6); doc.line(M, cursor.y, W - M, cursor.y); doc.setLineWidth(0.2);
    cursor.y += 7;

    const garantir = (need: number) => { if (cursor.y + need > H - 12) { doc.addPage(); cursor.y = M; } };

    const bloco = (txt: string, c: Rgb = blue) => {
        garantir(12);
        doc.setFont('times', 'bold'); doc.setFontSize(12); doc.setTextColor(...c);
        const lines = doc.splitTextToSize(txt, CW);
        // A linha de base desce a altura da letra: dois títulos seguidos não se sobrepõem.
        const topo = cursor.y + ALTURA_TITULO_MM;
        lines.forEach((ln: string, i: number) => doc.text(ln, M, topo + i * 5));
        const base = topo + (lines.length - 1) * 5 + 1.6;
        doc.setDrawColor(...fio); doc.line(M, base, W - M, base);
        cursor.y = base + 1.2; doc.setFont('helvetica', 'normal');
    };

    const tabela = (cols: ColunaPdf[], linhas: Celula[][]) => {
        const headerH = 7.5, lineH = 4, padX = 2;
        const alinhar = (c: ColunaPdf, x: number): { x: number; align: 'center' | 'right' | 'left' } => (c.a === 'c' ? { x: x + c.w / 2, align: 'center' } : c.a === 'r' ? { x: x + c.w - padX, align: 'right' } : { x: x + padX, align: 'left' });
        const cabec = () => {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(51, 65, 85);
            let x = M;
            cols.forEach(c => { const p = alinhar(c, x); doc.text(c.h.toUpperCase(), p.x, cursor.y + headerH - 2.3, { align: p.align }); x += c.w; });
            doc.setDrawColor(...green); doc.setLineWidth(0.35); doc.line(M, cursor.y + headerH, W - M, cursor.y + headerH); doc.setLineWidth(0.2);
            cursor.y += headerH; doc.setFont('helvetica', 'normal');
        };
        cabec(); doc.setFontSize(8);
        linhas.forEach((linha) => {
            const cellLines = cols.map((c, ci) => { const cell = linha[ci]; const tx = (cell && typeof cell === 'object') ? (cell.t ?? '') : String(cell ?? ''); return doc.splitTextToSize(tx, c.w - padX * 2); });
            const maxL = Math.max(1, ...cellLines.map((a: string[]) => a.length));
            const rowH = maxL * lineH + 2.4;
            if (cursor.y + rowH > H - 12) { doc.addPage(); cursor.y = M; cabec(); doc.setFontSize(8); }
            let x = M;
            cols.forEach((c, ci) => {
                const cell = linha[ci]; const o: CelulaRica = (cell && typeof cell === 'object') ? cell : { t: String(cell ?? '') };
                doc.setTextColor(...(o.color || ink)); doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
                const p = alinhar(c, x);
                cellLines[ci]?.forEach((ln: string, li: number) => doc.text(ln, p.x, cursor.y + 3.8 + li * lineH, { align: p.align }));
                x += c.w;
            });
            doc.setFont('helvetica', 'normal'); doc.setDrawColor(...grid); doc.line(M, cursor.y + rowH, M + CW, cursor.y + rowH);
            cursor.y += rowH;
        });
        cursor.y += 6;
    };

    const texto = (txt: string, opts: { italic?: boolean; size?: number; color?: Rgb } = {}) => {
        garantir(8); doc.setFont('helvetica', opts.italic ? 'italic' : 'normal'); doc.setFontSize(opts.size || 8); doc.setTextColor(...(opts.color || muted));
        const lines = doc.splitTextToSize(txt, CW); lines.forEach((ln: string, i: number) => doc.text(ln, M, cursor.y + i * 4)); cursor.y += lines.length * 4 + 2; doc.setFont('helvetica', 'normal');
    };

    /** Faixa de indicadores: [{ num, lbl, sub, c }], separada por fios, como na tela. */
    const kpis = (itens: IndicadorPdf[]) => {
        const kpiW = CW / itens.length, kpiH = 18;
        garantir(kpiH + 6);
        doc.setDrawColor(...fio); doc.line(M, cursor.y, W - M, cursor.y); doc.line(M, cursor.y + kpiH, W - M, cursor.y + kpiH);
        itens.forEach((k, i) => {
            const x = M + i * kpiW;
            if (i > 0) { doc.setDrawColor(...grid); doc.line(x, cursor.y + 1.5, x, cursor.y + kpiH - 1.5); }
            doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...muted);
            doc.text(doc.splitTextToSize(k.lbl.toUpperCase(), kpiW - 6)[0], x + 3, cursor.y + 4.8);
            doc.setFont('times', 'bold'); doc.setFontSize(13); doc.setTextColor(...(k.c || ink));
            doc.text(doc.splitTextToSize(String(k.num), kpiW - 6)[0], x + 3, cursor.y + 10.5);
            if (k.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); doc.setTextColor(...(k.subColor || muted)); doc.text(doc.splitTextToSize(k.sub, kpiW - 6)[0], x + 3, cursor.y + 15); }
        });
        doc.setFont('helvetica', 'normal');
        cursor.y += kpiH + 6;
    };

    /** Gráfico de barras vertical: [{ rot, v, cor? }]. Aceita negativos (linha de zero). */
    const graficoBarras = (serie: BarraPdf[], { altura = 55, fmt = String, cor = green, x0 = M, largura = CW, titulo }: OpcoesGraficoPdf = {}) => {
        garantir(altura + (titulo ? 8 : 2) + 8);
        if (titulo) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...ink); doc.text(titulo, x0, cursor.y + 3); cursor.y += 6; }
        const eixoW = 18, top = cursor.y + 4, alt = altura - 10;
        const max = Math.max(0, ...serie.map(s => s.v)), min = Math.min(0, ...serie.map(s => s.v));
        const faixa = (max - min) || 1, y = (v: number) => top + ((max - v) / faixa) * alt;
        const area = largura - eixoW, passo = area / Math.max(1, serie.length), bw = Math.min(14, passo * 0.62);
        // grade e eixo
        doc.setFontSize(6.5); doc.setTextColor(...muted); doc.setDrawColor(...grid);
        [max, (max + min) / 2, min].forEach(v => { doc.line(x0 + eixoW, y(v), x0 + largura, y(v)); doc.text(fmt(v), x0 + eixoW - 1.5, y(v) + 1, { align: 'right' }); });
        doc.setDrawColor(...muted); doc.line(x0 + eixoW, y(0), x0 + largura, y(0));
        // Muitas barras: sem valor sobre a barra e rótulo do eixo a cada N
        doc.setFontSize(6.3);
        const larguraRotulo = Math.max(0, ...serie.map(s => doc.getTextWidth(s.rot))) + FOLGA_ROTULO_MM;
        const comValor = passo >= 9, cadaN = Math.max(1, Math.ceil(larguraRotulo / passo));
        serie.forEach((s, i) => {
            const cx = x0 + eixoW + passo * i + passo / 2, y1 = y(Math.max(0, s.v)), y2 = y(Math.min(0, s.v));
            doc.setFillColor(...(s.cor || cor));
            if (y2 - y1 > 0.2) doc.rect(cx - bw / 2, y1, bw, y2 - y1, 'F');
            doc.setFontSize(6.3); doc.setTextColor(...ink);
            if (comValor) doc.text(fmt(s.v), cx, s.v >= 0 ? y1 - 1.2 : y2 + 3, { align: 'center' });
            // Conta a partir do fim: o último mês sempre aparece e nenhum rótulo encosta no vizinho.
            if ((serie.length - 1 - i) % cadaN === 0) { doc.setTextColor(...muted); doc.text(s.rot, cx, top + alt + 5, { align: 'center' }); }
        });
        cursor.y = top + alt + 9;
    };

    const finalizar = (nomeArquivo: string) => {
        const total = doc.getNumberOfPages();
        for (let i = 1; i <= total; i++) {
            doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...muted);
            doc.text('Opera Echo Management System · ' + titulo, M, H - 6);
            doc.text(`Página ${i} de ${total}`, W - M, H - 6, { align: 'right' });
        }
        doc.save(`${nomeArquivo}.pdf`);
    };

    return { doc, W, H, M, CW, cursor, colors: { green, blue, ink, muted, grid }, bloco, tabela, texto, kpis, graficoBarras, garantir, finalizar };
}

export type RelatorioPdf = Awaited<ReturnType<typeof criarRelatorioPDF>>;

/** "#2e7d32" vira [46, 125, 50]. */
export function hexParaRgb(hex: string): Rgb {
    const canal = (inicio: number) => Number.parseInt(hex.slice(inicio, inicio + 2), 16);
    return [canal(1), canal(3), canal(5)];
}
