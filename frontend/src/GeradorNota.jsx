/* ARQUIVO: src/GeradorNota.js */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import './GeradorNota.css';

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const PDFLIB_CDN = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
const FONTKIT_CDN = 'https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';

const carregarScript = (src) => new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return setTimeout(() => resolve(), 50);
    const s = document.createElement('script'); s.src = src; s.async = true;
    s.onload = () => resolve(); s.onerror = reject;
    document.body.appendChild(s);
});
const carregarPdfJs = async () => {
    if (window.pdfjsLib) return window.pdfjsLib;
    await carregarScript(PDFJS_CDN);
    if (window.pdfjsLib) window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
    return window.pdfjsLib;
};
const carregarPdfLib = async () => {
    if (window.PDFLib) return window.PDFLib;
    await carregarScript(PDFLIB_CDN);
    await carregarScript(FONTKIT_CDN);
    return window.PDFLib;
};

const FONTES_DISPONIVEIS = {
    'Sem Serifa (Moderna)': ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'Nunito', 'Raleway', 'PT Sans', 'Inter', 'DM Sans', 'Outfit', 'Noto Sans', 'Fira Sans', 'Work Sans', 'Rubik', 'Oxygen', 'Cabin', 'Mulish', 'Quicksand', 'Barlow'],
    'Serifada (Clássica)': ['Georgia', 'Times New Roman', 'Palatino', 'Merriweather', 'Playfair Display', 'Lora', 'PT Serif', 'Noto Serif', 'Libre Baskerville', 'EB Garamond', 'Crimson Text', 'Cormorant Garamond', 'Bitter', 'Bree Serif'],
    'Monospace': ['Courier New', 'Consolas', 'Lucida Console', 'Monaco', 'Roboto Mono', 'Source Code Pro', 'IBM Plex Mono', 'Space Mono', 'Fira Mono', 'JetBrains Mono', 'Ubuntu Mono', 'Inconsolata'],
    'Decorativa / Display': ['Oswald', 'Bebas Neue', 'Anton', 'Righteous', 'Permanent Marker', 'Satisfy', 'Dancing Script', 'Pacifico', 'Lobster', 'Great Vibes', 'Caveat', 'Shadows Into Light', 'Indie Flower', 'Kalam', 'Sacramento']
};

const GOOGLE_FONTS_URL = "https://fonts.googleapis.com/css2?family=" + [
    'Roboto+Mono', 'Source+Code+Pro', 'IBM+Plex+Mono', 'Space+Mono', 'Fira+Mono', 'JetBrains+Mono', 'Ubuntu+Mono', 'Inconsolata',
    'Roboto', 'Open+Sans', 'Lato', 'Poppins', 'Montserrat', 'Nunito', 'Raleway', 'PT+Sans', 'Inter', 'DM+Sans', 'Outfit',
    'Noto+Sans', 'Fira+Sans', 'Work+Sans', 'Rubik', 'Oxygen', 'Cabin', 'Mulish', 'Quicksand', 'Barlow',
    'Merriweather', 'Playfair+Display', 'Lora', 'PT+Serif', 'Noto+Serif', 'Libre+Baskerville', 'EB+Garamond', 'Crimson+Text', 'Cormorant+Garamond', 'Bitter', 'Bree+Serif',
    'Oswald', 'Bebas+Neue', 'Anton', 'Righteous', 'Permanent+Marker', 'Satisfy', 'Dancing+Script', 'Pacifico', 'Lobster', 'Great+Vibes', 'Caveat', 'Shadows+Into+Light', 'Indie+Flower', 'Kalam', 'Sacramento'
].join('&family=') + '&display=swap';

function FontSelect({ value, onChange, label, fontesCustom = [] }) {
    return (
        <div className="gn-campo">
            <label>{label}</label>
            <select value={value} onChange={onChange} style={{ fontFamily: value }}>
                {fontesCustom.length > 0 && (
                    <optgroup label="Fontes do seu PC">
                        {fontesCustom.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                    </optgroup>
                )}
                {Object.entries(FONTES_DISPONIVEIS).map(([grupo, fontes]) => (
                    <optgroup key={grupo} label={grupo}>
                        {fontes.map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                    </optgroup>
                ))}
            </select>
        </div>
    );
}

export default function GeradorNota() {
    const [autenticado, setAutenticado] = useState(false);
    const [loginForm, setLoginForm] = useState({ usuario: '', senha: '' });
    const [dadosUsuario, setDadosUsuario] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [abaAtiva, setAbaAtiva] = useState('gerador');
    const [tipoGerador, setTipoGerador] = useState('NOTA');

    const [templates, setTemplates] = useState([]);
    const [templateSelecionado, setTemplateSelecionado] = useState(null);
    const [itensCatalogo, setItensCatalogo] = useState([]);
    const [estabelecimento, setEstabelecimento] = useState({ nome_fantasia: '', razao_social: '', cnpj_cpf: '', endereco: '', telefone: '' });
    const [dataHora, setDataHora] = useState({ data: '', hora: '', usar_atual: false });
    const [numeroPedido, setNumeroPedido] = useState('');
    const [itensNota, setItensNota] = useState([]);
    const [operador, setOperador] = useState('');
    const [pagamentos, setPagamentos] = useState([{ id: Date.now(), metodo: '', valor: '' }]);

    const [configAba, setConfigAba] = useState('usuarios');
    const [usuariosLiberados, setUsuariosLiberados] = useState([]);
    const [todosUsuarios, setTodosUsuarios] = useState([]);
    const [todosTemplates, setTodosTemplates] = useState([]);
    const [todosItens, setTodosItens] = useState([]);
    const [formTemplate, setFormTemplate] = useState(null);
    const [formItem, setFormItem] = useState(null);
    const printRef = useRef();

    // EDITOR PDF
    const [pdfDoc, setPdfDoc] = useState(null);
    const [pdfOriginalBytes, setPdfOriginalBytes] = useState(null);
    const [paginaAtiva, setPaginaAtiva] = useState(1);
    const [totalPaginas, setTotalPaginas] = useState(0);
    const [zoom, setZoom] = useState(1.2);
    const [ferramenta, setFerramenta] = useState('select');
    const [anotacoes, setAnotacoes] = useState({});
    const [historico, setHistorico] = useState([]);
    const [historicoFuturo, setHistoricoFuturo] = useState([]);
    const [propriedades, setPropriedades] = useState({ fonte: 'Inter', tamanho: 14, cor: '#000000', negrito: false, italico: false, sublinhado: false, larguraLinha: 2, corBorda: '#000000', corPreenchimento: '#C7A96A' });
    const [fontesCustom, setFontesCustom] = useState([]);
    const [fontesCustomData, setFontesCustomData] = useState({});
    const [elementoSelecionado, setElementoSelecionado] = useState(null);
    const [assinaturas, setAssinaturas] = useState([]);
    const [arrastando, setArrastando] = useState(null);
    const [desenhando, setDesenhando] = useState(null);
    const [dimensoesPagina, setDimensoesPagina] = useState({ w: 595, h: 842 });
    const [assinaturaModalAberto, setAssinaturaModalAberto] = useState(false);
    const [assinaturaDesenhando, setAssinaturaDesenhando] = useState(false);
    const [assinaturaAba, setAssinaturaAba] = useState('desenhar');
    const [assinaturaTexto, setAssinaturaTexto] = useState('');
    const [assinaturaFonteEstilo, setAssinaturaFonteEstilo] = useState('Dancing Script');
    const [textosOriginais, setTextosOriginais] = useState({}); // { [pagina]: [{id,str,x,y,w,h,fonte,tamanho,cor,editado}] }
    const [textoEditandoId, setTextoEditandoId] = useState(null);
    const [fontesFaltando, setFontesFaltando] = useState([]); // [{nome, nomeLimpo}]
    const [fontesEmbarcadas, setFontesEmbarcadas] = useState({}); // { loadedName: { family, registered } }

    const canvasRef = useRef(null);
    const overlayRef = useRef(null);
    const assinaturaCanvasRef = useRef(null);
    const inputPdfRef = useRef(null);
    const inputImgRef = useRef(null);
    const inputFontRef = useRef(null);

    const totalGeralNota = itensNota.reduce((acc, i) => acc + (Number(i.qtd) * Number(i.valor)), 0);

    const handleLogin = async () => {
        if (!loginForm.usuario || !loginForm.senha) return;
        setCarregando(true);
        try {
            const res = await api.post('/login', { usuario: loginForm.usuario, senha: loginForm.senha });
            const user = res.data.usuario || res.data;
            if (res.data.token) sessionStorage.setItem('token_opera', res.data.token);
            const acesso = await api.post('/gerador/validar-acesso', { id_usuario: user.id_usuario });
            if (!acesso.data.autorizado) { Swal.fire('Acesso Negado', 'Você não tem permissão.', 'error'); setCarregando(false); return; }
            setDadosUsuario(user); setAutenticado(true); setLoginForm({ usuario: '', senha: '' }); carregarDados();
        } catch (e) { Swal.fire('Erro', e.response?.data?.erro || 'Credenciais inválidas.', 'error'); }
        finally { setCarregando(false); }
    };

    const handleSair = () => {
        setAutenticado(false); sessionStorage.removeItem('token_opera');
        setLoginForm({ usuario: '', senha: '' }); setAbaAtiva('gerador'); setTipoGerador('NOTA');
        setTemplateSelecionado(null); setDadosUsuario(null);
        setEstabelecimento({ nome_fantasia: '', razao_social: '', cnpj_cpf: '', endereco: '', telefone: '' });
        setDataHora({ data: '', hora: '', usar_atual: false }); setNumeroPedido(''); setItensNota([]); setOperador('');
        setPagamentos([{ id: Date.now(), metodo: '', valor: '' }]);
        setPdfDoc(null); setPdfOriginalBytes(null); setAnotacoes({}); setHistorico([]); setHistoricoFuturo([]);
        setAssinaturas([]); setFontesCustom([]); setFontesCustomData({});
        setTextosOriginais({}); setFontesFaltando([]); setTextoEditandoId(null);
        setFontesEmbarcadas({});
    };

    const carregarDados = async () => {
        try {
            const [tpl, itens] = await Promise.all([api.get('/gerador/templates'), api.get('/gerador/itens')]);
            setTemplates(tpl.data); setItensCatalogo(itens.data);
            if (tpl.data.length > 0) setTemplateSelecionado(tpl.data[0]);
        } catch (e) { console.error(e); }
    };

    const adicionarItem = () => setItensNota([...itensNota, { codigo: '', descricao: '', qtd: 1, valor: 0 }]);
    const adicionarItemCatalogo = (ic) => setItensNota([...itensNota, { codigo: ic.codigo, descricao: ic.descricao, qtd: 1, valor: ic.valor_unitario }]);
    const atualizarItem = (idx, c, v) => setItensNota(itensNota.map((it, i) => i === idx ? { ...it, [c]: (c === 'qtd' || c === 'valor' ? Number(v) : v) } : it));
    const removerItem = (idx) => setItensNota(itensNota.filter((_, i) => i !== idx));
    const adicionarPagamento = () => setPagamentos([...pagamentos, { id: Date.now(), metodo: '', valor: '' }]);
    const removerPagamento = (id) => { if (pagamentos.length > 1) setPagamentos(pagamentos.filter(p => p.id !== id)); };
    const atualizarPagamento = (id, c, v) => setPagamentos(pagamentos.map(p => p.id === id ? { ...p, [c]: v } : p));

    const configExportacao = { scale: 3, useCORS: true, logging: false, backgroundColor: "#ffffff" };

    const exportarJPGNota = async () => {
        const element = printRef.current; if (!element) return;
        Swal.fire({ title: 'Gerando JPG...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const canvas = await html2canvas(element, configExportacao);
            const link = document.createElement('a');
            link.href = canvas.toDataURL('image/jpeg', 0.9);
            link.download = `Comprovante_NOTA_${Date.now()}.jpg`; link.click();
            Swal.close();
        } catch (e) { Swal.fire('Erro', 'Falha ao exportar JPG.', 'error'); }
    };

    const exportarPDFNota = async () => {
        const element = printRef.current; if (!element) return;
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const canvas = await html2canvas(element, configExportacao);
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', [80, (canvas.height * 80) / canvas.width]);
            pdf.addImage(imgData, 'PNG', 0, 0, 80, (canvas.height * 80) / canvas.width);
            pdf.save(`Comprovante_NOTA_${Date.now()}.pdf`);
            Swal.close();
        } catch (e) { Swal.fire('Erro', 'Falha ao exportar PDF.', 'error'); }
    };

    // EDITOR PDF
    const salvarSnapshot = useCallback(() => {
        setHistorico(h => [...h.slice(-30), JSON.stringify({ anotacoes, textosOriginais })]);
        setHistoricoFuturo([]);
    }, [anotacoes, textosOriginais]);

    const desfazer = () => {
        if (historico.length === 0) return;
        const anterior = historico[historico.length - 1];
        setHistoricoFuturo(f => [JSON.stringify({ anotacoes, textosOriginais }), ...f]);
        const estado = JSON.parse(anterior);
        setAnotacoes(estado.anotacoes || {});
        setTextosOriginais(estado.textosOriginais || {});
        setHistorico(h => h.slice(0, -1));
        setTextoEditandoId(null);
        setElementoSelecionado(null);
    };
    const refazer = () => {
        if (historicoFuturo.length === 0) return;
        const proximo = historicoFuturo[0];
        setHistorico(h => [...h, JSON.stringify({ anotacoes, textosOriginais })]);
        const estado = JSON.parse(proximo);
        setAnotacoes(estado.anotacoes || {});
        setTextosOriginais(estado.textosOriginais || {});
        setHistoricoFuturo(f => f.slice(1));
        setTextoEditandoId(null);
        setElementoSelecionado(null);
    };

    const abrirPDF = async (file) => {
        Swal.fire({ title: 'Carregando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const bytes = new Uint8Array(await file.arrayBuffer());
            setPdfOriginalBytes(bytes);
            const pdfjs = await carregarPdfJs();
            const doc = await pdfjs.getDocument({
                data: bytes.slice(0),
                useSystemFonts: true,
                disableFontFace: false,
                standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
            }).promise;
            setPdfDoc(doc); setTotalPaginas(doc.numPages); setPaginaAtiva(1);
            setAnotacoes({}); setHistorico([]); setHistoricoFuturo([]);
            setTextosOriginais({}); setFontesFaltando([]); setFontesEmbarcadas({});
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Não foi possível abrir o PDF.', 'error'); }
    };

    const criarPDFBranco = async () => {
        const PDFLib = await carregarPdfLib();
        const doc = await PDFLib.PDFDocument.create();
        doc.addPage([595, 842]);
        const bytes = await doc.save();
        setPdfOriginalBytes(bytes);
        const pdfjs = await carregarPdfJs();
        const d = await pdfjs.getDocument({
            data: bytes.slice(0),
            useSystemFonts: true,
            disableFontFace: false,
            standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
        }).promise;
        setPdfDoc(d); setTotalPaginas(1); setPaginaAtiva(1);
        setAnotacoes({}); setHistorico([]); setHistoricoFuturo([]);
        setTextosOriginais({}); setFontesFaltando([]); setFontesEmbarcadas({});
    };

    useEffect(() => {
        if (!pdfDoc || !canvasRef.current) return;
        let cancelado = false;
        (async () => {
            try {
                const page = await pdfDoc.getPage(paginaAtiva);
                const viewport = page.getViewport({ scale: zoom });
                const canvas = canvasRef.current;
                if (!canvas || cancelado) return;
                const ctx = canvas.getContext('2d');
                canvas.width = viewport.width; canvas.height = viewport.height;
                setDimensoesPagina({ w: viewport.width, h: viewport.height });
                await page.render({ canvasContext: ctx, viewport }).promise;

                // Extrai textos da página com posições reais (fiel ao que foi renderizado)
                if (!textosOriginais[paginaAtiva]) {
                    const content = await page.getTextContent();

                    // Registra fontes embarcadas do PDF. IMPORTANTE: o pdf.js fornece
                    // fontObj.data como ArrayBuffer/Uint8Array que é CONSUMIDO quando usado.
                    // Precisamos clonar para poder usar tanto no FontFace quanto no pdf-lib depois.
                    const novasFontes = { ...fontesEmbarcadas };
                    for (const key in (content.styles || {})) {
                        if (novasFontes[key]?.registered) continue;
                        const estilo = content.styles[key];
                        try {
                            let fontObj = null;
                            try { fontObj = pdfDoc.commonObjs.get(key); } catch (e) {}

                            let fontData = null;
                            if (fontObj) {
                                // Tenta extrair o binário em múltiplos lugares (varia entre versões)
                                const raw = fontObj.data || fontObj._data ||
                                    (fontObj.file && fontObj.file.data) ||
                                    (fontObj.font && fontObj.font.data);

                                if (raw) {
                                    // Clona o buffer para ter uma cópia independente
                                    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
                                    fontData = bytes.slice().buffer;
                                } else if (fontObj.url) {
                                    const resp = await fetch(fontObj.url);
                                    fontData = await resp.arrayBuffer();
                                }
                            }

                            if (fontData) {
                                // Carrega no navegador com DUAS chaves: loadedName e fontFamily real
                                const face1 = new FontFace(key, fontData.slice(0));
                                await face1.load();
                                document.fonts.add(face1);

                                const realName = (estilo.fontFamily || '').replace(/[,'"]/g, '').split(',')[0].trim();
                                if (realName && realName !== key) {
                                    try {
                                        const face2 = new FontFace(realName, fontData.slice(0));
                                        await face2.load();
                                        document.fonts.add(face2);
                                    } catch (e) {}
                                }

                                novasFontes[key] = {
                                    family: key, registered: true,
                                    data: fontData, // <-- guardado para embedFont depois
                                    fontFamily: estilo.fontFamily,
                                    realName
                                };
                                continue;
                            }

                            // Fallback: pdf.js já injetou @font-face automaticamente
                            await document.fonts.ready;
                            const jaCarregada = document.fonts.check(`12px "${key}"`);
                            novasFontes[key] = {
                                family: key, registered: jaCarregada,
                                fontFamily: estilo.fontFamily,
                                realName: (estilo.fontFamily || '').replace(/[,'"]/g, '').split(',')[0].trim()
                            };
                        } catch (err) {
                            novasFontes[key] = { family: key, registered: false, fontFamily: estilo.fontFamily };
                        }
                    }
                    setFontesEmbarcadas(novasFontes);

                    const fontesNecessarias = new Set();
                    const pageViewportPdf = page.getViewport({ scale: 1 });
                    const pdfPageHeight = pageViewportPdf.height;
                    const pdfPageWidth = pageViewportPdf.width;

                    const itens = content.items.map((it, idx) => {
                        // Transformação em escala 1:1 (PDF units) - independe de zoom
                        const txPdf = window.pdfjsLib.Util.transform(pageViewportPdf.transform, it.transform);
                        const fontSizePdf = Math.hypot(txPdf[2], txPdf[3]);
                        const xPdf = txPdf[4];
                        const yPdf = txPdf[5] - fontSizePdf;

                        const estilo = content.styles?.[it.fontName] || {};
                        const nomeFonteFamily = estilo.fontFamily || it.fontName || 'Helvetica';
                        const loadedName = it.fontName;
                        const ascent = estilo.ascent || 0.8;
                        const descent = estilo.descent || -0.2;
                        fontesNecessarias.add(JSON.stringify({ family: nomeFonteFamily, loadedName }));
                        return {
                            id: `orig-${paginaAtiva}-${idx}`,
                            str: it.str,
                            // Coords em PDF units (fonte da verdade)
                            xPdf, yPdf, wPdf: it.width, hPdf: fontSizePdf,
                            fonte: nomeFonteFamily, loadedName,
                            tamanhoPdf: fontSizePdf, cor: '#000000',
                            ascent, descent,
                            italico: /italic|oblique/i.test(nomeFonteFamily),
                            negrito: /bold|black|heavy/i.test(nomeFonteFamily),
                            editado: false,
                            pageHeightPdf: pdfPageHeight,
                            pageWidthPdf: pdfPageWidth
                        };
                    }).filter(t => t.str.trim().length > 0);
                    setTextosOriginais(prev => ({ ...prev, [paginaAtiva]: itens }));

                    // Só avisa sobre fontes faltando se realmente não temos a fonte
                    const faltando = [];
                    for (const fStr of fontesNecessarias) {
                        const f = JSON.parse(fStr);
                        const nomeLimpo = (f.family || '').replace(/[,'"]/g, '').split('-')[0].trim();
                        const temEmbarcada = novasFontes[f.loadedName]?.registered;
                        if (temEmbarcada) continue;
                        const carregada = document.fonts.check(`12px "${nomeLimpo}"`);
                        if (!carregada && !fontesCustom.includes(nomeLimpo)) {
                            if (!faltando.find(x => x.nomeLimpo === nomeLimpo)) {
                                faltando.push({ nome: f.family, nomeLimpo, loadedName: f.loadedName });
                            }
                        }
                    }
                    if (faltando.length > 0) setFontesFaltando(faltando);
                    else setFontesFaltando([]);
                }
            } catch (e) { console.warn('Render abortado:', e.message); }
        })();
        return () => { cancelado = true; };
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, paginaAtiva, zoom]);

    // Converte coords em PDF units para pixels de tela (aplica zoom)
    const tScreen = (t) => ({
        x: (t.xPdf ?? t.x ?? 0) * zoom,
        y: (t.yPdf ?? t.y ?? 0) * zoom,
        w: (t.wPdf ?? t.w ?? 0) * zoom,
        h: (t.hPdf ?? t.h ?? 0) * zoom,
        tamanho: (t.tamanhoPdf ?? t.tamanho ?? 14) * zoom
    });

    const adicionarAnotacao = (pagina, nova) => {
        salvarSnapshot();
        setAnotacoes(prev => ({ ...prev, [pagina]: [...(prev[pagina] || []), { id: Date.now() + Math.random(), ...nova }] }));
    };
    const atualizarAnotacao = (pagina, id, campos) => {
        setAnotacoes(prev => ({ ...prev, [pagina]: (prev[pagina] || []).map(a => a.id === id ? { ...a, ...campos } : a) }));
    };
    const removerAnotacao = (pagina, id) => {
        salvarSnapshot();
        setAnotacoes(prev => ({ ...prev, [pagina]: (prev[pagina] || []).filter(a => a.id !== id) }));
        setElementoSelecionado(null);
    };

    const salvarEdicaoTextoOriginal = (textoId, novoTexto) => {
        salvarSnapshot();
        setTextosOriginais(prev => {
            const lista = (prev[paginaAtiva] || []).map(t =>
                t.id === textoId
                    ? { ...t, str: novoTexto, editado: true, strOriginal: t.strOriginal || t.str }
                    : t
            );
            return { ...prev, [paginaAtiva]: lista };
        });
        setTextoEditandoId(null);
    };

    const atualizarTextoOriginal = (textoId, campos) => {
        salvarSnapshot();
        setTextosOriginais(prev => ({
            ...prev,
            [paginaAtiva]: (prev[paginaAtiva] || []).map(t =>
                t.id === textoId
                    ? { ...t, ...campos, editado: true, strOriginal: t.strOriginal || t.str }
                    : t
            )
        }));
    };

    // Detecta se a fonte atual suporta todos os caracteres digitados
    const checarCharsFonte = (texto, fonte) => {
        if (!texto || !fonte) return true;
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.font = `16px "${fonte}"`;
            const larguraFonte = ctx.measureText(texto).width;
            ctx.font = `16px "AdobeInvisibleFont", "NonExistentFallback"`;
            const larguraFallback = ctx.measureText(texto).width;
            // Se largura com fonte = largura com fallback invisível, provavelmente não tem glifo
            return Math.abs(larguraFonte - larguraFallback) > 0.5;
        } catch (e) { return true; }
    };

    const dismissFonteFaltando = (nomeLimpo) => {
        setFontesFaltando(prev => prev.filter(f => f.nomeLimpo !== nomeLimpo));
    };

    const onOverlayMouseDown = (e) => {
        if (!pdfDoc) return;
        const rect = overlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        if (ferramenta === 'text') {
            adicionarAnotacao(paginaAtiva, { tipo: 'text', x, y, w: 200, h: 30, texto: 'Digite aqui', fonte: propriedades.fonte, tamanho: propriedades.tamanho, cor: propriedades.cor, negrito: propriedades.negrito, italico: propriedades.italico, sublinhado: propriedades.sublinhado });
            setFerramenta('select');
        } else if (ferramenta === 'image' && inputImgRef.current) {
            inputImgRef.current.dataset.dropX = x; inputImgRef.current.dataset.dropY = y;
            inputImgRef.current.click();
        } else if (ferramenta === 'signature') {
            if (assinaturas.length === 0) setAssinaturaModalAberto(true);
            else { adicionarAnotacao(paginaAtiva, { tipo: 'image', x, y, w: 180, h: 60, src: assinaturas[assinaturas.length - 1] }); setFerramenta('select'); }
        } else if (['rect', 'ellipse', 'line', 'arrow', 'whiteout', 'highlight'].includes(ferramenta)) {
            setDesenhando({ tipo: ferramenta, x0: x, y0: y, x, y });
        } else { setElementoSelecionado(null); }
    };

    const onOverlayMouseMove = (e) => {
        const rect = overlayRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left; const y = e.clientY - rect.top;
        if (desenhando) setDesenhando(d => ({ ...d, x, y }));
        else if (arrastando) atualizarAnotacao(paginaAtiva, arrastando.id, { x: x - arrastando.offsetX, y: y - arrastando.offsetY });
    };

    const onOverlayMouseUp = () => {
        if (desenhando) {
            const { tipo, x0, y0, x, y } = desenhando;
            const minX = Math.min(x0, x), minY = Math.min(y0, y);
            const w = Math.abs(x - x0), h = Math.abs(y - y0);
            if (w > 3 || h > 3) {
                if (tipo === 'rect' || tipo === 'ellipse') adicionarAnotacao(paginaAtiva, { tipo, x: minX, y: minY, w, h, corBorda: propriedades.corBorda, larguraLinha: propriedades.larguraLinha, corPreenchimento: 'transparent' });
                else if (tipo === 'line' || tipo === 'arrow') adicionarAnotacao(paginaAtiva, { tipo, x1: x0, y1: y0, x2: x, y2: y, corBorda: propriedades.corBorda, larguraLinha: propriedades.larguraLinha });
                else if (tipo === 'whiteout') adicionarAnotacao(paginaAtiva, { tipo: 'rect', x: minX, y: minY, w, h, corPreenchimento: '#ffffff', corBorda: '#ffffff' });
                else if (tipo === 'highlight') adicionarAnotacao(paginaAtiva, { tipo: 'rect', x: minX, y: minY, w, h, corPreenchimento: propriedades.corPreenchimento, corBorda: 'transparent', opacidade: 0.35 });
            }
            setDesenhando(null); setFerramenta('select');
        }
        setArrastando(null);
    };

    const onUploadImagem = (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const x = Number(inputImgRef.current.dataset.dropX || 100);
            const y = Number(inputImgRef.current.dataset.dropY || 100);
            adicionarAnotacao(paginaAtiva, { tipo: 'image', x, y, w: 200, h: 150, src: ev.target.result });
            setFerramenta('select');
        };
        reader.readAsDataURL(file); e.target.value = '';
    };

    const onUploadFonte = async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
            const nomeCompleto = file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/, '');
            const buffer = await file.arrayBuffer();
            try {
                // Registra com o nome completo (ex: "UberMove-Medium")
                const face1 = new FontFace(nomeCompleto, buffer.slice(0));
                await face1.load();
                document.fonts.add(face1);

                // Registra também com o nome da família (ex: "UberMove") para matching flexível
                const familia = nomeCompleto.split(/[-_]/)[0];
                if (familia && familia !== nomeCompleto) {
                    try {
                        const peso = /bold|black|heavy/i.test(nomeCompleto) ? 'bold' : 'normal';
                        const estilo = /italic|oblique/i.test(nomeCompleto) ? 'italic' : 'normal';
                        const face2 = new FontFace(familia, buffer.slice(0), { weight: peso, style: estilo });
                        await face2.load();
                        document.fonts.add(face2);
                        setFontesCustom(prev => prev.includes(familia) ? prev : [...prev, familia]);
                        setFontesCustomData(prev => ({ ...prev, [familia]: buffer, [nomeCompleto]: buffer }));
                    } catch (e) {}
                } else {
                    setFontesCustomData(prev => ({ ...prev, [nomeCompleto]: buffer }));
                }

                setFontesCustom(prev => prev.includes(nomeCompleto) ? prev : [...prev, nomeCompleto]);
            } catch (err) { console.warn('Falha ao carregar fonte:', nomeCompleto, err); }
        }
        e.target.value = '';
        Swal.fire({ icon: 'success', title: 'Fonte(s) carregada(s)!', timer: 1500, showConfirmButton: false });
        setFontesFaltando(prev => prev.filter(f => !document.fonts.check(`12px "${f.nomeLimpo}"`)));
    };

    const iniciarDesenhoAssinatura = (e) => {
        setAssinaturaDesenhando(true);
        const canvas = assinaturaCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    };
    const desenharAssinatura = (e) => {
        if (!assinaturaDesenhando) return;
        const canvas = assinaturaCanvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const ctx = canvas.getContext('2d');
        ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.strokeStyle = '#000';
        ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top); ctx.stroke();
    };
    const limparCanvasAssinatura = () => {
        const canvas = assinaturaCanvasRef.current;
        if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
    };
    const salvarAssinatura = () => {
        let dataUrl = null;
        if (assinaturaAba === 'desenhar') dataUrl = assinaturaCanvasRef.current.toDataURL('image/png');
        else if (assinaturaAba === 'digitar' && assinaturaTexto) {
            const canvas = document.createElement('canvas');
            canvas.width = 500; canvas.height = 150;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#000'; ctx.font = `48px ${assinaturaFonteEstilo}`;
            ctx.textBaseline = 'middle'; ctx.fillText(assinaturaTexto, 20, 75);
            dataUrl = canvas.toDataURL('image/png');
        }
        if (dataUrl) {
            setAssinaturas(prev => [...prev, dataUrl]);
            setAssinaturaModalAberto(false);
            limparCanvasAssinatura(); setAssinaturaTexto('');
        }
    };

    const exportarPDFEditado = async () => {
        if (!pdfOriginalBytes) return;
        Swal.fire({ title: 'Gerando PDF...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const PDFLib = await carregarPdfLib();
            const pdf = await PDFLib.PDFDocument.load(pdfOriginalBytes);
            if (window.fontkit) pdf.registerFontkit(window.fontkit);

            const fontesRegistradas = {};
            const pegarFonte = async (nome, loadedName) => {
                const chave = loadedName || nome;
                if (fontesRegistradas[chave]) return fontesRegistradas[chave];

                // 1º: fonte embarcada extraída do próprio PDF (prioridade máxima)
                if (loadedName && fontesEmbarcadas[loadedName]?.data && window.fontkit) {
                    try {
                        const clone = fontesEmbarcadas[loadedName].data.slice(0);
                        fontesRegistradas[chave] = await pdf.embedFont(clone, { subset: true });
                        return fontesRegistradas[chave];
                    } catch (e) { console.warn('Falha embed embarcada', loadedName, e); }
                }

                // 2º: fonte do usuário carregada com o NOME REAL (ex: "UberMove")
                const nomeLimpo = (nome || '').replace(/[,'"]/g, '').split('-')[0].trim();
                const realName = fontesEmbarcadas[loadedName]?.realName;

                for (const tentativa of [nomeLimpo, realName, nome]) {
                    if (tentativa && fontesCustomData[tentativa] && window.fontkit) {
                        try {
                            fontesRegistradas[chave] = await pdf.embedFont(fontesCustomData[tentativa].slice(0));
                            return fontesRegistradas[chave];
                        } catch (e) {}
                    }
                }

                // 3º: tenta qualquer fonte custom que contenha o nome no início
                if (window.fontkit) {
                    for (const [n, buf] of Object.entries(fontesCustomData)) {
                        if (n.toLowerCase().includes(nomeLimpo.toLowerCase()) ||
                            nomeLimpo.toLowerCase().includes(n.toLowerCase())) {
                            try {
                                fontesRegistradas[chave] = await pdf.embedFont(buf.slice(0));
                                return fontesRegistradas[chave];
                            } catch (e) {}
                        }
                    }
                }

                // Fallback: Helvetica
                fontesRegistradas[chave] = await pdf.embedFont(PDFLib.StandardFonts.Helvetica);
                return fontesRegistradas[chave];
            };
            const hexParaRgb = (hex) => {
                if (!hex || hex === 'transparent') return null;
                return PDFLib.rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
            };

            const paginas = pdf.getPages();
            const pdfjs = await carregarPdfJs();
            const d = await pdfjs.getDocument({ data: pdfOriginalBytes.slice(0) }).promise;

            for (let i = 0; i < paginas.length; i++) {
                const lista = anotacoes[i + 1] || [];
                const textosEd = (textosOriginais[i + 1] || []).filter(t => t.editado);
                const page = paginas[i];
                const pageH = page.getHeight();
                // Para anotações (que têm coords em screen pixels do zoom atual), calculamos escala.
                // Para textos originais (coords em PDF units), usamos direto.
                const p = await d.getPage(i + 1);
                const vp = p.getViewport({ scale: zoom });
                const escalaX = page.getWidth() / vp.width;
                const escalaY = pageH / vp.height;

                // ===== TEXTOS ORIGINAIS EDITADOS =====
                // Coords já estão em PDF units - usar direto sem conversão de zoom
                for (const t of textosEd) {
                    const fonte = await pegarFonte(t.fonte, t.loadedName);
                    const size = t.tamanhoPdf || 14;

                    // Mede largura real do texto ORIGINAL e do NOVO para whiteout preciso
                    let larguraOriginal;
                    try { larguraOriginal = fonte.widthOfTextAtSize(t.strOriginal || t.str, size); }
                    catch (e) { larguraOriginal = t.wPdf || size * (t.str?.length || 1) * 0.5; }
                    larguraOriginal = Math.max(larguraOriginal, t.wPdf || 0);

                    // Whiteout: cobre exatamente o texto original
                    const px = t.xPdf;
                    const pyBaseline = pageH - (t.yPdf + size); // baseline em PDF coords
                    const whiteoutH = size * 1.25;
                    page.drawRectangle({
                        x: px - 1,
                        y: pyBaseline - size * 0.25,
                        width: larguraOriginal + 2,
                        height: whiteoutH,
                        color: PDFLib.rgb(1, 1, 1)
                    });

                    // Desenha o novo texto na mesma baseline
                    if (t.str) {
                        page.drawText(t.str, {
                            x: px,
                            y: pyBaseline,
                            size,
                            font: fonte,
                            color: hexParaRgb(t.cor || '#000000')
                        });
                    }
                }

                // ===== ANOTAÇÕES CUSTOMIZADAS (coords em screen pixels) =====
                for (const a of lista) {
                    const px = a.x * escalaX;
                    const py = pageH - (a.y * escalaY);
                    if (a.tipo === 'text') {
                        const fonte = await pegarFonte(a.fonte);
                        const cor = hexParaRgb(a.cor || '#000000');
                        const size = (a.tamanho || 14) * escalaY;
                        page.drawText(a.texto || '', { x: px, y: py - size, size, font: fonte, color: cor });
                    } else if (a.tipo === 'rect') {
                        const w = a.w * escalaX, h = a.h * escalaY;
                        const opts = { x: px, y: py - h, width: w, height: h, opacity: a.opacidade || 1 };
                        const cb = hexParaRgb(a.corBorda); if (cb) { opts.borderColor = cb; opts.borderWidth = a.larguraLinha || 1; }
                        const cp = hexParaRgb(a.corPreenchimento); if (cp) { opts.color = cp; }
                        page.drawRectangle(opts);
                    } else if (a.tipo === 'ellipse') {
                        const w = a.w * escalaX, h = a.h * escalaY;
                        const opts = { x: px + w / 2, y: py - h / 2, xScale: w / 2, yScale: h / 2 };
                        const cb = hexParaRgb(a.corBorda); if (cb) { opts.borderColor = cb; opts.borderWidth = a.larguraLinha || 1; }
                        const cp = hexParaRgb(a.corPreenchimento); if (cp) { opts.color = cp; }
                        page.drawEllipse(opts);
                    } else if (a.tipo === 'line' || a.tipo === 'arrow') {
                        const start = { x: a.x1 * escalaX, y: pageH - a.y1 * escalaY };
                        const end = { x: a.x2 * escalaX, y: pageH - a.y2 * escalaY };
                        const cor = hexParaRgb(a.corBorda || '#000000');
                        page.drawLine({ start, end, thickness: a.larguraLinha || 1, color: cor });
                        if (a.tipo === 'arrow') {
                            const angle = Math.atan2(end.y - start.y, end.x - start.x);
                            const head = 8;
                            page.drawLine({ start: end, end: { x: end.x - head * Math.cos(angle - Math.PI / 6), y: end.y - head * Math.sin(angle - Math.PI / 6) }, thickness: a.larguraLinha || 1, color: cor });
                            page.drawLine({ start: end, end: { x: end.x - head * Math.cos(angle + Math.PI / 6), y: end.y - head * Math.sin(angle + Math.PI / 6) }, thickness: a.larguraLinha || 1, color: cor });
                        }
                    } else if (a.tipo === 'image') {
                        const base64 = a.src.split(',')[1];
                        const bin = atob(base64);
                        const bytes = new Uint8Array(bin.length);
                        for (let j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
                        const img = a.src.startsWith('data:image/png') ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
                        const w = a.w * escalaX, h = a.h * escalaY;
                        page.drawImage(img, { x: px, y: py - h, width: w, height: h });
                    }
                }
            }
            const bytesFinais = await pdf.save();
            const blob = new Blob([bytesFinais], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url; link.download = `PDF_Editado_${Date.now()}.pdf`; link.click();
            URL.revokeObjectURL(url);
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao exportar PDF: ' + e.message, 'error'); }
    };

    const exportarJPGEditado = async () => {
        if (!canvasRef.current) return;
        Swal.fire({ title: 'Gerando JPG...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
        try {
            const base = canvasRef.current;
            const combined = document.createElement('canvas');
            combined.width = base.width; combined.height = base.height;
            const ctx = combined.getContext('2d');
            ctx.drawImage(base, 0, 0);

            // Desenha anotações diretamente no canvas (mais fiel que html2canvas)
            const lista = anotacoes[paginaAtiva] || [];
            for (const a of lista) {
                if (a.tipo === 'text') {
                    const nomeLimpo = (a.fonte || 'Helvetica').replace(/[,'"]/g, '').split('-')[0].trim();
                    ctx.fillStyle = a.cor || '#000';
                    let fs = ''; if (a.italico) fs += 'italic '; if (a.negrito) fs += 'bold ';
                    ctx.font = `${fs}${a.tamanho}px "${nomeLimpo}", Helvetica, Arial`;
                    ctx.textBaseline = 'top';
                    ctx.fillText(a.texto || '', a.x + 2, a.y + 2);
                } else if (a.tipo === 'rect') {
                    ctx.globalAlpha = a.opacidade || 1;
                    if (a.corPreenchimento && a.corPreenchimento !== 'transparent') { ctx.fillStyle = a.corPreenchimento; ctx.fillRect(a.x, a.y, a.w, a.h); }
                    if (a.corBorda && a.corBorda !== 'transparent') { ctx.strokeStyle = a.corBorda; ctx.lineWidth = a.larguraLinha || 1; ctx.strokeRect(a.x, a.y, a.w, a.h); }
                    ctx.globalAlpha = 1;
                } else if (a.tipo === 'ellipse') {
                    ctx.beginPath();
                    ctx.ellipse(a.x + a.w / 2, a.y + a.h / 2, a.w / 2, a.h / 2, 0, 0, 2 * Math.PI);
                    if (a.corPreenchimento && a.corPreenchimento !== 'transparent') { ctx.fillStyle = a.corPreenchimento; ctx.fill(); }
                    if (a.corBorda && a.corBorda !== 'transparent') { ctx.strokeStyle = a.corBorda; ctx.lineWidth = a.larguraLinha || 1; ctx.stroke(); }
                } else if (a.tipo === 'line' || a.tipo === 'arrow') {
                    ctx.strokeStyle = a.corBorda || '#000'; ctx.lineWidth = a.larguraLinha || 1;
                    ctx.beginPath(); ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.stroke();
                    if (a.tipo === 'arrow') {
                        const ang = Math.atan2(a.y2 - a.y1, a.x2 - a.x1); const hd = 10;
                        ctx.beginPath();
                        ctx.moveTo(a.x2, a.y2); ctx.lineTo(a.x2 - hd * Math.cos(ang - Math.PI / 6), a.y2 - hd * Math.sin(ang - Math.PI / 6));
                        ctx.moveTo(a.x2, a.y2); ctx.lineTo(a.x2 - hd * Math.cos(ang + Math.PI / 6), a.y2 - hd * Math.sin(ang + Math.PI / 6));
                        ctx.stroke();
                    }
                } else if (a.tipo === 'image') {
                    await new Promise(res => {
                        const img = new Image();
                        img.onload = () => { ctx.drawImage(img, a.x, a.y, a.w, a.h); res(); };
                        img.onerror = res; img.src = a.src;
                    });
                }
            }

            // Textos originais editados: whiteout + redesenho com fonte embarcada
            const textosEd = (textosOriginais[paginaAtiva] || []).filter(t => t.editado);
            for (const t of textosEd) {
                const scr = tScreen(t);
                const h = scr.tamanho * 1.25;
                // Whiteout proporcional à largura real do texto ORIGINAL
                const wOriginal = Math.max(scr.w, 20);
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(scr.x - 1, scr.y - scr.tamanho * 0.25, wOriginal + 2, h);
                if (t.str) {
                    const temEmb = t.loadedName && fontesEmbarcadas[t.loadedName]?.registered;
                    const nomeLimpo = t.fonte.replace(/[,'"]/g, '').split('-')[0].trim();
                    const fonteCanvas = temEmb ? `"${t.loadedName}"` : `"${nomeLimpo}"`;
                    let fs = ''; if (t.italico) fs += 'italic '; if (t.negrito) fs += 'bold ';
                    ctx.font = `${fs}${scr.tamanho}px ${fonteCanvas}, Helvetica, Arial`;
                    ctx.fillStyle = t.cor || '#000';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(t.str, scr.x, scr.y + scr.tamanho);
                }
            }

            const link = document.createElement('a');
            link.href = combined.toDataURL('image/jpeg', 0.92);
            link.download = `PDF_Pagina_${paginaAtiva}_${Date.now()}.jpg`; link.click();
            Swal.close();
        } catch (e) { console.error(e); Swal.fire('Erro', 'Falha ao exportar JPG: ' + e.message, 'error'); }
    };

    const carregarConfig = async (aba) => {
        // Só admin pode acessar a aba "usuarios" (liberação de acesso); demais perfis vão para "templates"
        const ehAdminLocal = dadosUsuario && ['Administrador', 'Gestor'].includes(dadosUsuario.perfil_acesso);
        if (aba === 'usuarios' && !ehAdminLocal) aba = 'templates';
        setConfigAba(aba);
        try {
            if (aba === 'usuarios') { const [lib, todos] = await Promise.all([api.get('/gerador/usuarios'), api.get('/usuarios/buscar?limite=500')]); setUsuariosLiberados(lib.data); setTodosUsuarios((todos.data.dados || todos.data).filter(u => u.ativo)); }
            else if (aba === 'templates') { const r = await api.get('/gerador/templates/todos'); setTodosTemplates(r.data); }
            else if (aba === 'itens') { const r = await api.get('/gerador/itens/todos'); setTodosItens(r.data); }
        } catch (e) { }
    };
    const salvarTemplate = async () => { if (!formTemplate?.nome) return Swal.fire('Atenção', 'Nome é obrigatório.', 'warning'); try { await api.post('/gerador/templates/salvar', formTemplate); Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false }); setFormTemplate(null); carregarConfig('templates'); carregarDados(); } catch (e) { } };
    const salvarItem = async () => { if (!formItem?.codigo || !formItem?.descricao) return Swal.fire('Atenção', 'Obrigatório.', 'warning'); try { await api.post('/gerador/itens/salvar', formItem); Swal.fire({ icon: 'success', title: 'Salvo!', timer: 1500, showConfirmButton: false }); setFormItem(null); carregarConfig('itens'); carregarDados(); } catch (e) { } };
    const liberarAcesso = async (id_usuario) => { try { await api.post('/gerador/usuarios/salvar', { id_usuario, ativo: true }); carregarConfig('usuarios'); } catch (e) { } };
    const revogarAcesso = async (id_usuario) => { const r = await Swal.fire({ title: 'Revogar?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (r.isConfirmed) { try { await api.delete(`/gerador/usuarios/${id_usuario}`); carregarConfig('usuarios'); } catch (e) { } } };
    const excluirTemplate = async (id) => { const r = await Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (r.isConfirmed) { try { await api.delete(`/gerador/templates/${id}`); carregarConfig('templates'); carregarDados(); } catch (e) { } } };
    const excluirItem = async (id) => { const r = await Swal.fire({ title: 'Excluir?', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33' }); if (r.isConfirmed) { try { await api.delete(`/gerador/itens/${id}`); carregarConfig('itens'); carregarDados(); } catch (e) { } } };

    const isAdmin = dadosUsuario && ['Administrador', 'Gestor'].includes(dadosUsuario.perfil_acesso);
    const renderSeparador = (tpl) => { const sep = tpl?.separador || '-'; return sep.repeat(Math.floor(42 / sep.length)); };

    const renderCupomNota = () => {
        const tpl = templateSelecionado || { fonte_cabecalho: 'Courier New', fonte_corpo: 'Courier New', tamanho_fonte: 12, tamanho_cabecalho: 14, separador: '-', alinhamento_cabecalho: 'center', mensagem_rodape: '', negrito_cabecalho: true, uppercase_cabecalho: true, mostrar_operador: true, mostrar_num_pedido: true, texto_titulo: 'COMPROVANTE DE VENDA', texto_nota_legal: 'NÃO É DOCUMENTO FISCAL', espacamento_linhas: 1.4 };
        let dataStr = '--/--/---- --:--';
        if (dataHora.usar_atual) dataStr = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        else if (dataHora.data && dataHora.hora) dataStr = `${dataHora.data.split('-').reverse().join('/')} ${dataHora.hora}`;
        const nomeFantasia = estabelecimento.nome_fantasia || 'ESTABELECIMENTO';

        return (
            <div className="cupom-papel" style={{ fontFamily: tpl.fonte_corpo, fontSize: `${tpl.tamanho_fonte}px`, lineHeight: tpl.espacamento_linhas || 1.4 }}>
                <div className="cupom-cabecalho" style={{ fontFamily: tpl.fonte_cabecalho, textAlign: tpl.alinhamento_cabecalho }}>
                    <div className="cupom-nome-fantasia" style={{ fontSize: `${tpl.tamanho_cabecalho || 14}px`, fontWeight: tpl.negrito_cabecalho !== false ? 900 : 400, textTransform: tpl.uppercase_cabecalho !== false ? 'uppercase' : 'none' }}>{nomeFantasia}</div>
                    {estabelecimento.razao_social && <div className="cupom-razao">{estabelecimento.razao_social}</div>}
                    {estabelecimento.cnpj_cpf && <div className="cupom-cnpj">CNPJ: {estabelecimento.cnpj_cpf}</div>}
                    {estabelecimento.endereco && <div className="cupom-endereco">{estabelecimento.endereco}</div>}
                </div>
                <div className="cupom-separador">{renderSeparador(tpl)}</div>
                <div className="cupom-info-emissao">
                    <div>{tpl.texto_titulo || 'COMPROVANTE'}</div>
                    {(tpl.mostrar_num_pedido !== false) && <div>N° {numeroPedido || '------'}</div>}
                    <div>{dataStr}</div>
                </div>
                <div className="cupom-separador">{renderSeparador(tpl)}</div>
                <div className="cupom-itens">
                    <div className="cupom-item-header"><span className="cupom-col-cod">CÓD</span><span className="cupom-col-desc">DESC</span><span className="cupom-col-qtd">QTD</span><span className="cupom-col-val">VALOR</span></div>
                    <div className="cupom-separador-fino">{renderSeparador(tpl)}</div>
                    {itensNota.length === 0 ? <div className="cupom-vazio">Vazio</div> : itensNota.map((item, idx) => (
                        <div key={idx} className="cupom-item-linha"><span className="cupom-col-cod">{item.codigo}</span><span className="cupom-col-desc">{item.descricao}</span><span className="cupom-col-qtd">{item.qtd}</span><span className="cupom-col-val">{(item.qtd * item.valor).toFixed(2)}</span></div>
                    ))}
                </div>
                <div className="cupom-separador">{renderSeparador(tpl)}</div>
                <div className="cupom-totais">
                    <div className="cupom-total-linha cupom-total-destaque"><span>TOTAL R$</span><span>{totalGeralNota.toFixed(2)}</span></div>
                </div>
                <div style={{ marginTop: '10px' }}>
                    {pagamentos.map((pg, idx) => (
                        <div key={idx} className="cupom-total-linha" style={{ fontSize: '0.9em' }}><span>{pg.metodo || 'PGTO'}</span><span>R$ {Number(pg.valor).toFixed(2)}</span></div>
                    ))}
                </div>
                <div className="cupom-separador">{renderSeparador(tpl)}</div>
                <div className="cupom-rodape" style={{ textAlign: tpl.alinhamento_cabecalho }}>
                    {tpl.mensagem_rodape && <div className="cupom-mensagem-rodape">{tpl.mensagem_rodape}</div>}
                    <div className="cupom-nota-legal">{tpl.texto_nota_legal}</div>
                </div>
            </div>
        );
    };

    const renderElemento = (a) => {
        const selecionado = elementoSelecionado === a.id;
        const baseStyle = { position: 'absolute', left: a.x + 'px', top: a.y + 'px', cursor: ferramenta === 'select' ? 'move' : 'crosshair', outline: selecionado ? '2px dashed #3A5D50' : 'none' };
        const handleMouseDownItem = (e) => {
            if (ferramenta !== 'select') return;
            e.stopPropagation(); setElementoSelecionado(a.id);
            const rect = overlayRef.current.getBoundingClientRect();
            setArrastando({ id: a.id, offsetX: e.clientX - rect.left - a.x, offsetY: e.clientY - rect.top - a.y });
        };

        if (a.tipo === 'text') return (
            <div key={a.id} style={{ ...baseStyle, minWidth: a.w, minHeight: a.h }} onMouseDown={handleMouseDownItem}>
                <div contentEditable={selecionado} suppressContentEditableWarning onBlur={(e) => atualizarAnotacao(paginaAtiva, a.id, { texto: e.currentTarget.innerText })}
                    style={{ fontFamily: a.fonte, fontSize: a.tamanho + 'px', color: a.cor, fontWeight: a.negrito ? 'bold' : 'normal', fontStyle: a.italico ? 'italic' : 'normal', textDecoration: a.sublinhado ? 'underline' : 'none', outline: 'none', minWidth: '30px', whiteSpace: 'pre-wrap', padding: '2px 4px', lineHeight: 1.2 }}>{a.texto}</div>
            </div>
        );
        if (a.tipo === 'rect') return (
            <div key={a.id} onMouseDown={handleMouseDownItem} style={{ ...baseStyle, width: a.w, height: a.h, border: a.corBorda !== 'transparent' ? `${a.larguraLinha || 1}px solid ${a.corBorda}` : 'none', background: a.corPreenchimento !== 'transparent' ? a.corPreenchimento : 'transparent', opacity: a.opacidade || 1 }} />
        );
        if (a.tipo === 'ellipse') return (
            <div key={a.id} onMouseDown={handleMouseDownItem} style={{ ...baseStyle, width: a.w, height: a.h, borderRadius: '50%', border: a.corBorda !== 'transparent' ? `${a.larguraLinha || 1}px solid ${a.corBorda}` : 'none', background: a.corPreenchimento !== 'transparent' ? a.corPreenchimento : 'transparent' }} />
        );
        if (a.tipo === 'line' || a.tipo === 'arrow') {
            const minX = Math.min(a.x1, a.x2), minY = Math.min(a.y1, a.y2);
            const w = Math.abs(a.x2 - a.x1), h = Math.abs(a.y2 - a.y1);
            return (
                <svg key={a.id} onMouseDown={handleMouseDownItem} style={{ position: 'absolute', left: minX - 10, top: minY - 10, width: w + 20, height: h + 20, pointerEvents: 'all', outline: selecionado ? '2px dashed #3A5D50' : 'none' }}>
                    {a.tipo === 'arrow' && (<defs><marker id={`arrow-${a.id}`} markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill={a.corBorda} /></marker></defs>)}
                    <line x1={a.x1 - minX + 10} y1={a.y1 - minY + 10} x2={a.x2 - minX + 10} y2={a.y2 - minY + 10} stroke={a.corBorda} strokeWidth={a.larguraLinha} markerEnd={a.tipo === 'arrow' ? `url(#arrow-${a.id})` : ''} />
                </svg>
            );
        }
        if (a.tipo === 'image') return (
            <img key={a.id} src={a.src} alt="" onMouseDown={handleMouseDownItem} style={{ ...baseStyle, width: a.w, height: a.h, userSelect: 'none', pointerEvents: 'all' }} draggable={false} />
        );
        return null;
    };

    const elSel = (anotacoes[paginaAtiva] || []).find(a => a.id === elementoSelecionado);
    const isTextoSelOuFerram = ferramenta === 'text' || (elSel && elSel.tipo === 'text');

    const renderEditorPDF = () => (
        <div className="pdf-editor">
            {fontesFaltando.length > 0 && (
                <div className="pdf-fontes-alert">
                    <div className="pdf-fontes-alert-title"><Icon n="alert"/> Fonte(s) do PDF não instalada(s):</div>
                    <div className="pdf-fontes-alert-list">
                        {fontesFaltando.map(f => (
                            <span key={f.nomeLimpo} className="pdf-fonte-chip">
                                <strong>{f.nomeLimpo}</strong>
                                <button onClick={() => dismissFonteFaltando(f.nomeLimpo)}>×</button>
                            </span>
                        ))}
                    </div>
                    <div className="pdf-fontes-alert-actions">
                        <span className="pdf-hint" style={{ margin: 0 }}>Carregue os arquivos <code>.ttf/.otf</code> para manter a tipografia original:</span>
                        <button className="pdf-btn" onClick={() => inputFontRef.current?.click()}><Icon n="arrow-up"/> Carregar fontes</button>
                    </div>
                </div>
            )}
            <div className="pdf-toolbar-top">
                <button className="pdf-btn" onClick={() => inputPdfRef.current?.click()}><Icon n="folder"/> Abrir PDF</button>
                <button className="pdf-btn" onClick={criarPDFBranco}><Icon n="file"/> Novo em branco</button>
                <input ref={inputPdfRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && abrirPDF(e.target.files[0])} />
                <div className="pdf-toolbar-divider" />
                <button className="pdf-btn" onClick={desfazer} disabled={historico.length === 0}><Icon n="undo"/> Desfazer</button>
                <button className="pdf-btn" onClick={refazer} disabled={historicoFuturo.length === 0}><Icon n="redo"/> Refazer</button>
                <div className="pdf-toolbar-divider" />
                <button className="pdf-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}>−</button>
                <span className="pdf-zoom">{Math.round(zoom * 100)}%</span>
                <button className="pdf-btn" onClick={() => setZoom(z => Math.min(3, z + 0.1))}>+</button>
                <div className="pdf-toolbar-spacer" />
                <button className="pdf-btn primary" onClick={exportarJPGEditado} disabled={!pdfDoc}><Icon n="save"/> Baixar JPG</button>
                <button className="pdf-btn primary" onClick={exportarPDFEditado} disabled={!pdfDoc}><Icon n="save"/> Baixar PDF</button>
            </div>

            <div className="pdf-editor-body">
                <div className="pdf-toolbox">
                    <button className={`pdf-tool ${ferramenta === 'select' ? 'ativo' : ''}`} onClick={() => setFerramenta('select')} title="Selecionar"><Icon n="arrow-left"/></button>
                    <button className={`pdf-tool ${ferramenta === 'text' ? 'ativo' : ''}`} onClick={() => setFerramenta('text')} title="Texto">T</button>
                    <button className={`pdf-tool ${ferramenta === 'image' ? 'ativo' : ''}`} onClick={() => setFerramenta('image')} title="Imagem"><Icon n="image"/></button>
                    <button className={`pdf-tool ${ferramenta === 'signature' ? 'ativo' : ''}`} onClick={() => { setFerramenta('signature'); if (assinaturas.length === 0) setAssinaturaModalAberto(true); }} title="Assinatura"><Icon n="edit"/></button>
                    <div className="pdf-tool-sep" />
                    <button className={`pdf-tool ${ferramenta === 'rect' ? 'ativo' : ''}`} onClick={() => setFerramenta('rect')} title="Retângulo">▭</button>
                    <button className={`pdf-tool ${ferramenta === 'ellipse' ? 'ativo' : ''}`} onClick={() => setFerramenta('ellipse')} title="Elipse">◯</button>
                    <button className={`pdf-tool ${ferramenta === 'line' ? 'ativo' : ''}`} onClick={() => setFerramenta('line')} title="Linha">╱</button>
                    <button className={`pdf-tool ${ferramenta === 'arrow' ? 'ativo' : ''}`} onClick={() => setFerramenta('arrow')} title="Seta"><Icon n="arrow-right"/></button>
                    <div className="pdf-tool-sep" />
                    <button className={`pdf-tool ${ferramenta === 'highlight' ? 'ativo' : ''}`} onClick={() => setFerramenta('highlight')} title="Destaque"><Icon n="edit"/></button>
                    <button className={`pdf-tool ${ferramenta === 'whiteout' ? 'ativo' : ''}`} onClick={() => setFerramenta('whiteout')} title="Apagar"><Icon n="dot"/></button>
                </div>

                <div className="pdf-canvas-wrap">
                    {!pdfDoc ? (
                        <div className="pdf-placeholder">
                            <div className="pdf-placeholder-icon"><Icon n="file"/></div>
                            <div className="pdf-placeholder-title">Nenhum documento aberto</div>
                            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                                <button className="pdf-btn primary" onClick={() => inputPdfRef.current?.click()}>Abrir PDF</button>
                                <button className="pdf-btn" onClick={criarPDFBranco}>Novo em branco</button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="pdf-pagination">
                                <button className="pdf-btn" onClick={() => setPaginaAtiva(p => Math.max(1, p - 1))} disabled={paginaAtiva === 1}>‹</button>
                                <span>Página <strong>{paginaAtiva}</strong> de {totalPaginas}</span>
                                <button className="pdf-btn" onClick={() => setPaginaAtiva(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtiva === totalPaginas}>›</button>
                            </div>
                            <div className="pdf-canvas-area">
                                <div className="pdf-page-wrapper" style={{ width: dimensoesPagina.w, height: dimensoesPagina.h }}>
                                    <canvas ref={canvasRef} className="pdf-canvas" />
                                    <div ref={overlayRef} className="pdf-overlay" onMouseDown={onOverlayMouseDown} onMouseMove={onOverlayMouseMove} onMouseUp={onOverlayMouseUp} onMouseLeave={onOverlayMouseUp}>
                                        {/* Textos originais clicáveis (edição inline estilo Sejda) */}
                                        {ferramenta === 'select' && (textosOriginais[paginaAtiva] || []).map(t => {
                                            const editando = textoEditandoId === t.id;
                                            const scr = tScreen(t); // converte PDF units para pixels
                                            const nomeLimpo = t.fonte.replace(/[,'"]/g, '').split('-')[0].trim();
                                            const temEmbarcada = t.loadedName && fontesEmbarcadas[t.loadedName]?.registered;
                                            const temSistema = document.fonts.check(`${Math.round(scr.tamanho)}px "${nomeLimpo}"`);
                                            const fontFamily = temEmbarcada
                                                ? `"${t.loadedName}"`
                                                : temSistema
                                                    ? `"${nomeLimpo}"`
                                                    : `"${t.loadedName}", "${nomeLimpo}"`;
                                            const fonteIndisponivel = !temEmbarcada && !temSistema;
                                            const charsFaltando = t.editado && !checarCharsFonte(t.str, temEmbarcada ? t.loadedName : nomeLimpo);

                                            if (editando || t.editado) {
                                                return (
                                                    <React.Fragment key={t.id}>
                                                        <div
                                                            contentEditable={editando && !fonteIndisponivel}
                                                            suppressContentEditableWarning
                                                            data-font-face={t.fonte}
                                                            data-loaded-name={t.loadedName}
                                                            data-user-font-size={scr.tamanho}
                                                            data-ascent={t.ascent}
                                                            data-descent={t.descent}
                                                            data-changed={t.editado ? 'true' : 'false'}
                                                            className={`text-editable ${t.editado ? 'edited' : ''} ${fonteIndisponivel ? 'font-missing' : ''}`}
                                                            onClick={(e) => {
                                                                if (!editando) {
                                                                    e.stopPropagation();
                                                                    if (fonteIndisponivel) {
                                                                        Swal.fire({
                                                                            icon: 'warning',
                                                                            title: 'Fonte original não disponível',
                                                                            html: `Para editar mantendo o layout idêntico ao PDF, carregue a fonte <strong>${nomeLimpo}</strong> ou escolha substituir.`,
                                                                            showCancelButton: true,
                                                                            confirmButtonText: 'Carregar fonte do PC',
                                                                            cancelButtonText: 'Substituir por Helvetica',
                                                                            reverseButtons: true
                                                                        }).then(r => {
                                                                            if (r.isConfirmed) inputFontRef.current?.click();
                                                                            else if (r.dismiss === Swal.DismissReason.cancel) {
                                                                                atualizarTextoOriginal(t.id, { fonte: 'Helvetica', loadedName: null });
                                                                                setTextoEditandoId(t.id);
                                                                            }
                                                                        });
                                                                        return;
                                                                    }
                                                                    setTextoEditandoId(t.id);
                                                                }
                                                            }}
                                                            onBlur={(e) => salvarEdicaoTextoOriginal(t.id, e.currentTarget.innerText)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Escape') { e.preventDefault(); setTextoEditandoId(null); }
                                                            }}
                                                            style={{
                                                                position: 'absolute', left: scr.x, top: scr.y,
                                                                minWidth: Math.max(scr.w, 30),
                                                                fontFamily, fontSize: scr.tamanho + 'px',
                                                                color: t.cor,
                                                                fontWeight: t.negrito ? 'bold' : 'normal',
                                                                fontStyle: t.italico ? 'italic' : 'normal',
                                                                lineHeight: 1.1,
                                                                background: '#fff',
                                                                padding: '0 2px', margin: 0,
                                                                border: editando ? '2px solid #3A5D50' : '1px dashed transparent',
                                                                outline: 'none', whiteSpace: 'pre',
                                                                cursor: editando ? 'text' : 'pointer',
                                                                zIndex: editando ? 10 : 2
                                                            }}
                                                        >{t.str}</div>

                                                        {editando && (
                                                            <div className="text-editable-menu" style={{ left: scr.x, top: Math.max(0, scr.y - 44) }}>
                                                                <button title="Negrito" className={t.negrito ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); atualizarTextoOriginal(t.id, { negrito: !t.negrito }); }}><b>B</b></button>
                                                                <button title="Itálico" className={t.italico ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); atualizarTextoOriginal(t.id, { italico: !t.italico }); }}><i>I</i></button>
                                                                <input type="number" title="Tamanho" value={Math.round(scr.tamanho)} min="6" max="144"
                                                                    onChange={(e) => atualizarTextoOriginal(t.id, { tamanhoPdf: Number(e.target.value) / zoom })}
                                                                    onMouseDown={(e) => e.stopPropagation()} />
                                                                <input type="color" title="Cor" value={t.cor}
                                                                    onChange={(e) => atualizarTextoOriginal(t.id, { cor: e.target.value })}
                                                                    onMouseDown={(e) => e.stopPropagation()} />
                                                                <button title="Remover texto original" onMouseDown={(e) => {
                                                                    e.preventDefault();
                                                                    atualizarTextoOriginal(t.id, { str: '' });
                                                                    setTextoEditandoId(null);
                                                                }}><Icon n="trash"/></button>
                                                            </div>
                                                        )}

                                                        {charsFaltando && editando && (
                                                            <div className="text-editable-warning" style={{ left: scr.x, top: scr.y + scr.tamanho + 6 }}>
                                                                <Icon n="alert"/> A fonte original não suporta alguns caracteres digitados
                                                            </div>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            }

                                            return (
                                                <div key={t.id} onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (fonteIndisponivel) {
                                                        Swal.fire({
                                                            icon: 'warning',
                                                            title: 'Fonte original não disponível',
                                                            html: `Este texto usa a fonte <strong>${nomeLimpo}</strong>, que não está embarcada nem instalada.<br><br>Carregue o arquivo <code>.ttf/.otf</code> para editar mantendo o layout, ou substitua por uma fonte padrão.`,
                                                            showCancelButton: true,
                                                            confirmButtonText: 'Carregar fonte do PC',
                                                            cancelButtonText: 'Substituir por Helvetica',
                                                            reverseButtons: true
                                                        }).then(r => {
                                                            if (r.isConfirmed) inputFontRef.current?.click();
                                                            else if (r.dismiss === Swal.DismissReason.cancel) {
                                                                atualizarTextoOriginal(t.id, { fonte: 'Helvetica', loadedName: null });
                                                                setTextoEditandoId(t.id);
                                                            }
                                                        });
                                                        return;
                                                    }
                                                    setTextoEditandoId(t.id);
                                                }}
                                                    title={fonteIndisponivel ? `Fonte "${nomeLimpo}" não disponível` : "Clique para editar este texto"}
                                                    className={`pdf-texto-original ${fonteIndisponivel ? 'font-missing' : ''}`}
                                                    style={{ position: 'absolute', left: scr.x, top: scr.y, width: Math.max(scr.w, 20), height: scr.tamanho * 1.2, cursor: 'text' }} />
                                            );
                                        })}
                                        {(anotacoes[paginaAtiva] || []).map(renderElemento)}
                                        {desenhando && (() => {
                                            const minX = Math.min(desenhando.x0, desenhando.x);
                                            const minY = Math.min(desenhando.y0, desenhando.y);
                                            const w = Math.abs(desenhando.x - desenhando.x0);
                                            const h = Math.abs(desenhando.y - desenhando.y0);
                                            if (desenhando.tipo === 'line' || desenhando.tipo === 'arrow') return <svg style={{ position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' }}><line x1={desenhando.x0} y1={desenhando.y0} x2={desenhando.x} y2={desenhando.y} stroke={propriedades.corBorda} strokeWidth={propriedades.larguraLinha} /></svg>;
                                            return <div style={{ position: 'absolute', left: minX, top: minY, width: w, height: h, border: desenhando.tipo === 'highlight' ? 'none' : `${propriedades.larguraLinha}px dashed ${propriedades.corBorda}`, background: desenhando.tipo === 'highlight' ? propriedades.corPreenchimento : desenhando.tipo === 'whiteout' ? '#fff' : 'transparent', borderRadius: desenhando.tipo === 'ellipse' ? '50%' : 0, opacity: desenhando.tipo === 'highlight' ? 0.35 : 1, pointerEvents: 'none' }} />;
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="pdf-props">
                    <h4>Propriedades</h4>
                    {isTextoSelOuFerram ? (
                        <>
                            <FontSelect label="Fonte" fontesCustom={fontesCustom} value={propriedades.fonte} onChange={(e) => { setPropriedades(p => ({ ...p, fonte: e.target.value })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { fonte: e.target.value }); }} />
                            <button className="pdf-btn-sm" onClick={() => inputFontRef.current?.click()}><Icon n="arrow-up"/> Carregar fonte do meu PC</button>
                            <input ref={inputFontRef} type="file" accept=".ttf,.otf,.woff,.woff2" multiple style={{ display: 'none' }} onChange={onUploadFonte} />
                            <div className="pdf-prop-row"><label>Tamanho</label><input type="number" min="6" max="144" value={propriedades.tamanho} onChange={(e) => { const v = Number(e.target.value); setPropriedades(p => ({ ...p, tamanho: v })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { tamanho: v }); }} /></div>
                            <div className="pdf-prop-row"><label>Cor</label><input type="color" value={propriedades.cor} onChange={(e) => { setPropriedades(p => ({ ...p, cor: e.target.value })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { cor: e.target.value }); }} /></div>
                            <div className="pdf-style-btns">
                                <button className={propriedades.negrito ? 'ativo' : ''} onClick={() => { const v = !propriedades.negrito; setPropriedades(p => ({ ...p, negrito: v })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { negrito: v }); }}><b>B</b></button>
                                <button className={propriedades.italico ? 'ativo' : ''} onClick={() => { const v = !propriedades.italico; setPropriedades(p => ({ ...p, italico: v })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { italico: v }); }}><i>I</i></button>
                                <button className={propriedades.sublinhado ? 'ativo' : ''} onClick={() => { const v = !propriedades.sublinhado; setPropriedades(p => ({ ...p, sublinhado: v })); if (elementoSelecionado) atualizarAnotacao(paginaAtiva, elementoSelecionado, { sublinhado: v }); }}><u>U</u></button>
                            </div>
                        </>
                    ) : ['rect', 'ellipse', 'line', 'arrow'].includes(ferramenta) ? (
                        <>
                            <div className="pdf-prop-row"><label>Cor da borda</label><input type="color" value={propriedades.corBorda} onChange={(e) => setPropriedades(p => ({ ...p, corBorda: e.target.value }))} /></div>
                            <div className="pdf-prop-row"><label>Espessura</label><input type="number" min="1" max="20" value={propriedades.larguraLinha} onChange={(e) => setPropriedades(p => ({ ...p, larguraLinha: Number(e.target.value) }))} /></div>
                        </>
                    ) : ferramenta === 'highlight' ? (
                        <div className="pdf-prop-row"><label>Cor do destaque</label><input type="color" value={propriedades.corPreenchimento} onChange={(e) => setPropriedades(p => ({ ...p, corPreenchimento: e.target.value }))} /></div>
                    ) : (<p className="pdf-hint">Selecione uma ferramenta ou elemento para editar.</p>)}

                    {elementoSelecionado && <button className="pdf-btn-sm danger" onClick={() => removerAnotacao(paginaAtiva, elementoSelecionado)}><Icon n="trash"/> Excluir selecionado</button>}

                    {assinaturas.length > 0 && (
                        <>
                            <h4 style={{ marginTop: 20 }}>Suas assinaturas</h4>
                            <div className="pdf-assinaturas-lista">
                                {assinaturas.map((src, i) => (
                                    <div key={i} className="pdf-assinatura-item">
                                        <img src={src} alt="assinatura" />
                                        <button className="pdf-btn-sm" onClick={() => setAssinaturas(prev => prev.filter((_, j) => j !== i))}>×</button>
                                    </div>
                                ))}
                                <button className="pdf-btn-sm" onClick={() => setAssinaturaModalAberto(true)}>+ Nova assinatura</button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            <input ref={inputImgRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onUploadImagem} />

            {assinaturaModalAberto && (
                <div className="pdf-modal-overlay" onClick={() => setAssinaturaModalAberto(false)}>
                    <div className="pdf-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Criar assinatura</h3>
                        <div className="pdf-modal-tabs">
                            <button className={assinaturaAba === 'desenhar' ? 'ativo' : ''} onClick={() => setAssinaturaAba('desenhar')}>Desenhar</button>
                            <button className={assinaturaAba === 'digitar' ? 'ativo' : ''} onClick={() => setAssinaturaAba('digitar')}>Digitar</button>
                        </div>
                        {assinaturaAba === 'desenhar' ? (
                            <>
                                <canvas ref={assinaturaCanvasRef} width="500" height="150" className="pdf-assinatura-canvas" onMouseDown={iniciarDesenhoAssinatura} onMouseMove={desenharAssinatura} onMouseUp={() => setAssinaturaDesenhando(false)} onMouseLeave={() => setAssinaturaDesenhando(false)} />
                                <button className="pdf-btn-sm" onClick={limparCanvasAssinatura}>Limpar</button>
                            </>
                        ) : (
                            <>
                                <input type="text" placeholder="Digite seu nome" value={assinaturaTexto} onChange={(e) => setAssinaturaTexto(e.target.value)} className="pdf-modal-input" />
                                <select value={assinaturaFonteEstilo} onChange={(e) => setAssinaturaFonteEstilo(e.target.value)} className="pdf-modal-input" style={{ fontFamily: assinaturaFonteEstilo }}>
                                    {['Dancing Script', 'Great Vibes', 'Sacramento', 'Caveat', 'Pacifico', 'Satisfy', 'Shadows Into Light'].map(f => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
                                </select>
                                {assinaturaTexto && <div className="pdf-assinatura-preview" style={{ fontFamily: assinaturaFonteEstilo }}>{assinaturaTexto}</div>}
                            </>
                        )}
                        <div className="pdf-modal-actions">
                            <button className="pdf-btn" onClick={() => setAssinaturaModalAberto(false)}>Cancelar</button>
                            <button className="pdf-btn primary" onClick={salvarAssinatura}>Salvar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    if (!autenticado) {
        return (
            <div className="gn-login-page">
                <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
                <div className="gn-login-card">
                    <div className="gn-login-logo"><img src="/logo.png" alt="Opera Echo" style={{ height: '70px' }} onError={(e) => { e.target.style.display = 'none'; }} /></div>
                    <h2 className="gn-login-titulo">Gerador de Notas</h2>
                    <p className="gn-login-subtitulo">Insira suas credenciais corporativas</p>
                    <div className="gn-login-campo"><label>Usuário</label><input type="text" placeholder="Seu CPF ou login" value={loginForm.usuario} onChange={e => setLoginForm({ ...loginForm, usuario: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
                    <div className="gn-login-campo"><label>Senha</label><input type="password" placeholder="••••••••" value={loginForm.senha} onChange={e => setLoginForm({ ...loginForm, senha: e.target.value })} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
                    <button className="gn-login-btn" onClick={handleLogin} disabled={carregando}>{carregando ? 'Autenticando...' : 'ACESSAR PLATAFORMA'}</button>
                    <div className="gn-login-footer">OPERA ECHO MANAGEMENT SYSTEM</div>
                </div>
            </div>
        );
    }

    return (
        <div className="gn-container">
            <link rel="stylesheet" href={GOOGLE_FONTS_URL} />
            <header className="gn-header">
                <div className="gn-header-left">
                    <img src="/logo.png" alt="Opera Echo" style={{ height: '36px' }} onError={(e) => { e.target.style.display = 'none'; }} />
                    <h1>Gerador de Comprovantes</h1>
                </div>
                <div className="gn-header-right">
                    <div className="gn-header-abas">
                        <button className={`gn-aba ${abaAtiva === 'gerador' ? 'ativa' : ''}`} onClick={() => setAbaAtiva('gerador')}>Gerador</button>
                        <button className={`gn-aba ${abaAtiva === 'config' ? 'ativa' : ''}`} onClick={() => { setAbaAtiva('config'); carregarConfig(isAdmin ? 'usuarios' : 'templates'); }}>Configurações</button>
                    </div>
                    <div className="gn-user-badge">
                        <span className="gn-header-user">{dadosUsuario?.nome_completo}</span>
                        <button className="gn-btn-sair" onClick={handleSair}>Sair</button>
                    </div>
                </div>
            </header>

            {abaAtiva === 'gerador' && (
                <div className="gn-gerador-layout" style={tipoGerador === 'PDF_EDITOR' ? { gridTemplateColumns: '1fr' } : {}}>
                    {tipoGerador === 'PDF_EDITOR' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div className="gn-module-selector" style={{ margin: '12px 16px' }}>
                                <button className={`gn-module-btn ${tipoGerador === 'NOTA' ? 'ativo comum' : ''}`} onClick={() => setTipoGerador('NOTA')}><Icon n="clipboard"/> Nota Padrão</button>
                                <button className={`gn-module-btn ${tipoGerador === 'PDF_EDITOR' ? 'ativo uber' : ''}`} onClick={() => setTipoGerador('PDF_EDITOR')}><Icon n="file"/> Editor de PDF</button>
                            </div>
                            {renderEditorPDF()}
                        </div>
                    ) : (
                        <>
                            <div className="gn-formulario">
                                <div className="gn-module-selector">
                                    <button className={`gn-module-btn ${tipoGerador === 'NOTA' ? 'ativo comum' : ''}`} onClick={() => setTipoGerador('NOTA')}><Icon n="clipboard"/> Nota Padrão</button>
                                    <button className={`gn-module-btn ${tipoGerador === 'PDF_EDITOR' ? 'ativo uber' : ''}`} onClick={() => setTipoGerador('PDF_EDITOR')}><Icon n="file"/> Editor de PDF</button>
                                </div>
                                <div className="gn-section">
                                    <h3>Modelo do Cupom</h3>
                                    <div className="gn-campo">
                                        <select value={templateSelecionado?.id_template || ''} onChange={e => setTemplateSelecionado(templates.find(t => t.id_template === Number(e.target.value)))}>
                                            {templates.map(t => <option key={t.id_template} value={t.id_template}>{t.nome}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="gn-section">
                                    <h3>Dados do Estabelecimento</h3>
                                    <div className="gn-form-grid">
                                        <div className="gn-campo"><label>Nome Fantasia</label><input value={estabelecimento.nome_fantasia} onChange={e => setEstabelecimento({ ...estabelecimento, nome_fantasia: e.target.value })} /></div>
                                        <div className="gn-campo"><label>Razão Social</label><input value={estabelecimento.razao_social} onChange={e => setEstabelecimento({ ...estabelecimento, razao_social: e.target.value })} /></div>
                                        <div className="gn-campo"><label>CNPJ / CPF</label><input value={estabelecimento.cnpj_cpf} onChange={e => setEstabelecimento({ ...estabelecimento, cnpj_cpf: e.target.value })} /></div>
                                        <div className="gn-campo"><label>Telefone</label><input value={estabelecimento.telefone} onChange={e => setEstabelecimento({ ...estabelecimento, telefone: e.target.value })} /></div>
                                        <div className="gn-campo gn-campo-full"><label>Endereço</label><input value={estabelecimento.endereco} onChange={e => setEstabelecimento({ ...estabelecimento, endereco: e.target.value })} /></div>
                                    </div>
                                </div>
                                <div className="gn-section">
                                    <h3>Detalhes da Emissão</h3>
                                    <div className="gn-form-grid">
                                        <div className="gn-campo"><label>Data</label><input type="date" min="1900-01-01" max="2100-12-31" value={dataHora.data} onChange={e => setDataHora({ ...dataHora, data: e.target.value, usar_atual: false })} /></div>
                                        <div className="gn-campo"><label>Hora</label><input type="time" value={dataHora.hora} onChange={e => setDataHora({ ...dataHora, hora: e.target.value, usar_atual: false })} /></div>
                                        <div className="gn-campo"><label>N° Pedido / Controle</label><input value={numeroPedido} onChange={e => setNumeroPedido(e.target.value)} /></div>
                                        <div className="gn-campo"><label>Responsável / Operador</label><input value={operador} onChange={e => setOperador(e.target.value)} /></div>
                                    </div>
                                </div>
                                <div className="gn-section">
                                    <h3>Itens Consumidos</h3>
                                    {itensCatalogo.length > 0 && (
                                        <div className="gn-catalogo-rapido">
                                            <span className="gn-catalogo-label">Inclusão Rápida:</span>
                                            <div className="gn-catalogo-chips">
                                                {itensCatalogo.map(ic => (
                                                    <button key={ic.id_item} className="gn-chip" onClick={() => adicionarItemCatalogo(ic)} title={`R$ ${Number(ic.valor_unitario).toFixed(2)}`}>+ {ic.descricao}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    <div style={{ overflowX: 'auto' }}>
                                        <table className="gn-tabela-itens">
                                            <thead><tr><th>Cód</th><th>Descrição do Item</th><th>Qtd</th><th>Valor Un.</th><th>Subtotal</th><th></th></tr></thead>
                                            <tbody>
                                                {itensNota.map((item, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ width: '80px' }}><input value={item.codigo} onChange={e => atualizarItem(idx, 'codigo', e.target.value)} /></td>
                                                        <td><input value={item.descricao} onChange={e => atualizarItem(idx, 'descricao', e.target.value)} /></td>
                                                        <td style={{ width: '70px' }}><input type="number" min="1" value={item.qtd} onChange={e => atualizarItem(idx, 'qtd', e.target.value)} /></td>
                                                        <td style={{ width: '110px' }}><input type="number" step="0.01" value={item.valor} onChange={e => atualizarItem(idx, 'valor', e.target.value)} /></td>
                                                        <td style={{ width: '100px', fontWeight: 'bold', color: 'var(--text-dark)' }}>R$ {(item.qtd * item.valor).toFixed(2)}</td>
                                                        <td style={{ width: '50px' }}><button className="gn-btn-remover" onClick={() => removerItem(idx)}>×</button></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="gn-itens-footer">
                                        <button className="gn-btn-add-item" onClick={adicionarItem}>+ Adicionar Linha Manual</button>
                                        <div className="gn-total-geral">TOTAL: R$ {totalGeralNota.toFixed(2)}</div>
                                    </div>
                                </div>
                                <div className="gn-section">
                                    <h3>Formas de Pagamento</h3>
                                    {pagamentos.map(pg => (
                                        <div key={pg.id} className="gn-pgto-item">
                                            <select value={pg.metodo} onChange={(e) => atualizarPagamento(pg.id, 'metodo', e.target.value)}>
                                                <option value="">Selecione...</option><option>Dinheiro</option><option>Cartão de Crédito</option><option>Cartão de Débito</option><option>PIX</option><option>Transferência</option>
                                            </select>
                                            <input type="number" placeholder="Valor" value={pg.valor} onChange={(e) => atualizarPagamento(pg.id, 'valor', e.target.value)} />
                                            <button className="gn-btn-remover" onClick={() => removerPagamento(pg.id)}>×</button>
                                        </div>
                                    ))}
                                    <div style={{ marginTop: '16px' }}>
                                        <button className="gn-btn-add-item" onClick={adicionarPagamento}>+ Adicionar Pagamento Parcial</button>
                                    </div>
                                </div>
                            </div>
                            <div className="gn-preview-area">
                                <div className="gn-preview-header">
                                    <h3>Pré-visualização (80mm)</h3>
                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button className="gn-btn-imprimir" style={{ background: '#3A5D50' }} onClick={exportarJPGNota}>Baixar JPG</button>
                                        <button className="gn-btn-imprimir" onClick={exportarPDFNota}>Baixar PDF</button>
                                    </div>
                                </div>
                                <div className="gn-preview-container">
                                    <div ref={printRef}>{renderCupomNota()}</div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {abaAtiva === 'config' && (
                <div className="gn-config-container">
                    <div className="gn-config-tabs">
                        {isAdmin && <button className={configAba === 'usuarios' ? 'ativa' : ''} onClick={() => carregarConfig('usuarios')}>Usuários com Acesso</button>}
                        <button className={configAba === 'templates' ? 'ativa' : ''} onClick={() => carregarConfig('templates')}>Templates</button>
                        <button className={configAba === 'itens' ? 'ativa' : ''} onClick={() => carregarConfig('itens')}>Catálogo de Itens</button>
                    </div>

                    {configAba === 'usuarios' && isAdmin && (
                        <div className="gn-config-panel">
                            <h3>Liberar Acesso</h3>
                            <div className="gn-liberar-area">
                                <select id="selUsuario">
                                    <option value="">Selecione um usuário...</option>
                                    {todosUsuarios.filter(u => !usuariosLiberados.find(l => l.id_usuario === u.id_usuario)).map(u => (
                                        <option key={u.id_usuario} value={u.id_usuario}>{u.nome_completo} ({u.perfil_acesso})</option>
                                    ))}
                                </select>
                                <button className="gn-btn-liberar" onClick={() => { const sel = document.getElementById('selUsuario').value; if (sel) liberarAcesso(Number(sel)); }}>Liberar</button>
                            </div>
                            <table className="gn-config-tabela">
                                <thead><tr><th>Nome</th><th>Login</th><th>Perfil</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {usuariosLiberados.map(u => (
                                        <tr key={u.id_usuario}>
                                            <td>{u.nome_completo}</td><td>{u.usuario}</td><td>{u.perfil_acesso}</td>
                                            <td><span className={`gn-badge ${u.ativo ? 'ativo' : 'inativo'}`}>{u.ativo ? 'Ativo' : 'Inativo'}</span></td>
                                            <td><button className="gn-btn-revogar" onClick={() => revogarAcesso(u.id_usuario)}>Revogar</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {configAba === 'templates' && (
                        <div className="gn-config-panel">
                            <div className="gn-config-header-row">
                                <h3>Templates de Cupom</h3>
                                <button className="gn-btn-novo" onClick={() => setFormTemplate({ nome: '', fonte_cabecalho: 'Courier New', fonte_corpo: 'Courier New', tamanho_fonte: 12, tamanho_cabecalho: 14, separador: '-', alinhamento_cabecalho: 'center', mostrar_logo: false, negrito_cabecalho: true, uppercase_cabecalho: true, mostrar_operador: true, mostrar_num_pedido: true, texto_titulo: 'COMPROVANTE DE VENDA', texto_nota_legal: 'NÃO É DOCUMENTO FISCAL', mensagem_rodape: 'Obrigado pela preferência!', espacamento_linhas: 1.4, ativo: true })}>+ Novo Template</button>
                            </div>
                            {formTemplate && (
                                <div className="gn-form-card">
                                    <h4 style={{ margin: '0 0 16px', color: '#1a1a2e', fontSize: '0.95rem' }}>Configuração do Template</h4>
                                    <div className="gn-form-section-label">Identificação</div>
                                    <div className="gn-form-grid">
                                        <div className="gn-campo gn-campo-full"><label>Nome do Template</label><input value={formTemplate.nome} onChange={e => setFormTemplate({ ...formTemplate, nome: e.target.value })} placeholder="Ex: Padrão Supermercado" /></div>
                                    </div>
                                    <div className="gn-form-section-label">Tipografia</div>
                                    <div className="gn-form-grid">
                                        <FontSelect label="Fonte do Cabeçalho" value={formTemplate.fonte_cabecalho} onChange={e => setFormTemplate({ ...formTemplate, fonte_cabecalho: e.target.value })} />
                                        <FontSelect label="Fonte do Corpo" value={formTemplate.fonte_corpo} onChange={e => setFormTemplate({ ...formTemplate, fonte_corpo: e.target.value })} />
                                        <div className="gn-campo"><label>Tamanho Cabeçalho (px)</label><input type="number" min="8" max="24" value={formTemplate.tamanho_cabecalho || 14} onChange={e => setFormTemplate({ ...formTemplate, tamanho_cabecalho: Number(e.target.value) })} /></div>
                                        <div className="gn-campo"><label>Tamanho Corpo (px)</label><input type="number" min="8" max="20" value={formTemplate.tamanho_fonte} onChange={e => setFormTemplate({ ...formTemplate, tamanho_fonte: Number(e.target.value) })} /></div>
                                        <div className="gn-campo"><label>Espaçamento entre linhas</label>
                                            <select value={formTemplate.espacamento_linhas || 1.4} onChange={e => setFormTemplate({ ...formTemplate, espacamento_linhas: Number(e.target.value) })}>
                                                <option value={1.0}>Compacto (1.0)</option><option value={1.2}>Reduzido (1.2)</option><option value={1.4}>Normal (1.4)</option><option value={1.6}>Confortável (1.6)</option><option value={1.8}>Espaçoso (1.8)</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="gn-form-section-label">Layout e Aparência</div>
                                    <div className="gn-form-grid">
                                        <div className="gn-campo"><label>Separador de Seções</label>
                                            <select value={formTemplate.separador} onChange={e => setFormTemplate({ ...formTemplate, separador: e.target.value })}>
                                                <option value="-">Traço (---)</option><option value="─">Linha (───)</option><option value="·">Ponto (···)</option><option value="=">Igual (===)</option><option value="*">Asterisco (***)</option><option value="~">Til (~~~)</option><option value="▬">Bloco (▬▬▬)</option><option value=" ">Nenhum</option>
                                            </select>
                                        </div>
                                        <div className="gn-campo"><label>Alinhamento Cabeçalho</label>
                                            <select value={formTemplate.alinhamento_cabecalho} onChange={e => setFormTemplate({ ...formTemplate, alinhamento_cabecalho: e.target.value })}>
                                                <option value="center">Centralizado</option><option value="left">Esquerda</option><option value="right">Direita</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="gn-form-checks">
                                        <label className="gn-checkbox"><input type="checkbox" checked={formTemplate.negrito_cabecalho !== false} onChange={e => setFormTemplate({ ...formTemplate, negrito_cabecalho: e.target.checked })} /> Nome do estabelecimento em negrito</label>
                                        <label className="gn-checkbox"><input type="checkbox" checked={formTemplate.uppercase_cabecalho !== false} onChange={e => setFormTemplate({ ...formTemplate, uppercase_cabecalho: e.target.checked })} /> Nome em letras maiúsculas</label>
                                        <label className="gn-checkbox"><input type="checkbox" checked={formTemplate.mostrar_operador !== false} onChange={e => setFormTemplate({ ...formTemplate, mostrar_operador: e.target.checked })} /> Exibir nome do operador</label>
                                        <label className="gn-checkbox"><input type="checkbox" checked={formTemplate.mostrar_num_pedido !== false} onChange={e => setFormTemplate({ ...formTemplate, mostrar_num_pedido: e.target.checked })} /> Exibir número do pedido</label>
                                    </div>
                                    <div className="gn-form-section-label">Textos Personalizáveis</div>
                                    <div className="gn-form-grid">
                                        <div className="gn-campo"><label>Título do Comprovante</label><input value={formTemplate.texto_titulo || 'COMPROVANTE DE VENDA'} onChange={e => setFormTemplate({ ...formTemplate, texto_titulo: e.target.value })} /></div>
                                        <div className="gn-campo"><label>Nota Legal (rodapé)</label><input value={formTemplate.texto_nota_legal || 'NÃO É DOCUMENTO FISCAL'} onChange={e => setFormTemplate({ ...formTemplate, texto_nota_legal: e.target.value })} /></div>
                                        <div className="gn-campo gn-campo-full"><label>Mensagem de Rodapé</label><input value={formTemplate.mensagem_rodape} onChange={e => setFormTemplate({ ...formTemplate, mensagem_rodape: e.target.value })} placeholder="Ex: Obrigado pela preferência!" /></div>
                                    </div>
                                    <div className="gn-form-actions">
                                        <button className="gn-btn-salvar" onClick={salvarTemplate}>Salvar</button>
                                        <button className="gn-btn-cancelar" onClick={() => setFormTemplate(null)}>Cancelar</button>
                                    </div>
                                </div>
                            )}
                            <table className="gn-config-tabela">
                                <thead><tr><th>Nome</th><th>Fonte</th><th>Tamanho</th><th>Separador</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {todosTemplates.map(t => (
                                        <tr key={t.id_template}>
                                            <td style={{ fontWeight: 'bold' }}>{t.nome}</td>
                                            <td style={{ fontFamily: t.fonte_corpo }}>{t.fonte_corpo}</td>
                                            <td>{t.tamanho_fonte}px</td>
                                            <td>{t.separador.repeat(5)}</td>
                                            <td><span className={`gn-badge ${t.ativo ? 'ativo' : 'inativo'}`}>{t.ativo ? 'Ativo' : 'Inativo'}</span></td>
                                            <td><button className="gn-btn-editar" onClick={() => setFormTemplate(t)}><Icon n="edit"/></button><button className="gn-btn-excluir" onClick={() => excluirTemplate(t.id_template)}><Icon n="trash"/></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {configAba === 'itens' && (
                        <div className="gn-config-panel">
                            <div className="gn-config-header-row">
                                <h3>Catálogo de Itens</h3>
                                <button className="gn-btn-novo" onClick={() => setFormItem({ codigo: '', descricao: '', valor_unitario: 0, ativo: true })}>+ Novo Item</button>
                            </div>
                            {formItem && (
                                <div className="gn-form-card">
                                    <div className="gn-form-grid">
                                        <div className="gn-campo"><label>Código</label><input value={formItem.codigo} onChange={e => setFormItem({ ...formItem, codigo: e.target.value })} placeholder="001" /></div>
                                        <div className="gn-campo"><label>Descrição</label><input value={formItem.descricao} onChange={e => setFormItem({ ...formItem, descricao: e.target.value })} placeholder="Café Expresso" /></div>
                                        <div className="gn-campo"><label>Valor Unitário</label><input type="number" step="0.01" value={formItem.valor_unitario} onChange={e => setFormItem({ ...formItem, valor_unitario: Number(e.target.value) })} /></div>
                                    </div>
                                    <div className="gn-form-actions">
                                        <button className="gn-btn-salvar" onClick={salvarItem}>Salvar</button>
                                        <button className="gn-btn-cancelar" onClick={() => setFormItem(null)}>Cancelar</button>
                                    </div>
                                </div>
                            )}
                            <table className="gn-config-tabela">
                                <thead><tr><th>Código</th><th>Descrição</th><th>Valor</th><th>Status</th><th></th></tr></thead>
                                <tbody>
                                    {todosItens.map(i => (
                                        <tr key={i.id_item}>
                                            <td><strong>{i.codigo}</strong></td><td>{i.descricao}</td><td>R$ {Number(i.valor_unitario).toFixed(2)}</td>
                                            <td><span className={`gn-badge ${i.ativo ? 'ativo' : 'inativo'}`}>{i.ativo ? 'Ativo' : 'Inativo'}</span></td>
                                            <td><button className="gn-btn-editar" onClick={() => setFormItem(i)}><Icon n="edit"/></button><button className="gn-btn-excluir" onClick={() => excluirItem(i.id_item)}><Icon n="trash"/></button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
