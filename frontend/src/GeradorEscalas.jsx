/* ARQUIVO: src/GeradorEscalas.js */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Icon from './components/Icon';
import api from './api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import './GeradorEscalas.css';
import Swal from 'sweetalert2';

function GeradorEscalas({ aoVoltar, lotacaoFixa, apiBase = '', moduloAcesso, permissaoNovo, permissaoEditar }) {
  // --- LÓGICA DE USUÁRIO SIMPLIFICADA ---
  const getNomeUsuario = () => {
    try {
      const saved = sessionStorage.getItem('usuario_opera');

      if (saved) {
        const usuario = JSON.parse(saved);
        return usuario.nome_completo || usuario.nome || 'Administrador';
      }
    } catch (e) {
      console.error("Erro ao ler usuário", e);
    }
    return 'Administrador';
  };

  const nomeUsuario = getNomeUsuario();

  const [implantadores, setImplantadores] = useState([]);
  const [escalaDados, setEscalaDados] = useState([]);
  const [dataInicio, setDataInicio] = useState(getMonday(new Date()));
  const exportRef = useRef(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [celulaSelecionada, setCelulaSelecionada] = useState(null);
  
  const [listaProjetos, setListaProjetos] = useState([]);
  const [listaUnidades, setListaUnidades] = useState([]);
  const [listaProdutos, setListaProdutos] = useState([]); 
  
  // [MODIFICADO] Estado do formulário agora possui a chave 'turno'
  const [formEscala, setFormEscala] = useState({ tipo: 'TRABALHO', id_projeto: '', id_unidade: '', produtos: [], turno: 'NORMAL', redmine: '' });
  const [clipboard, setClipboard] = useState(null); 

  const [modoReplicacao, setModoReplicacao] = useState(false);
  const [usersReplicar, setUsersReplicar] = useState([]);
  const [diasReplicar, setDiasReplicar] = useState([]);

  const [dataGeracao, setDataGeracao] = useState(new Date());

  // --- PERMISSÕES ---
  const [permissoes, setPermissoes] = useState({ pode_acessar: false, pode_novo: false, pode_editar: false });

  // ... (Funções de data) ...
  function formatarDataISO(data) { const a = data.getFullYear(), m = String(data.getMonth() + 1).padStart(2, '0'), d = String(data.getDate()).padStart(2, '0'); return `${a}-${m}-${d}`; }
  function criarDataLocal(s) { const [a, m, d] = s.split('-').map(Number); return new Date(a, m - 1, d); }
  function getMonday(d) { d = new Date(d); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); d.setDate(diff); return formatarDataISO(d); }
  function formatarDataBr(s) { const p = s.split('-'); return `${p[2]}/${p[1]}`; }
  
  const mudarSemana = (dias) => { const d = criarDataLocal(dataInicio); d.setDate(d.getDate() + dias); setDataInicio(formatarDataISO(d)); };
  const getDataColuna = useCallback((extra) => { const d = criarDataLocal(dataInicio); d.setDate(d.getDate() + extra); return formatarDataISO(d); }, [dataInicio]);

  // --- VIGÊNCIA DO COLABORADOR NA ESCALA ---
  // Regra: aparece a partir da data de ativação e permanece até a data de
  // inativação (registros anteriores preservados). Fora dessa janela a célula
  // fica bloqueada (não editável e sem lançar registro).
  const soDataISO = (v) => v ? String(v).split('T')[0] : null;
  const foraDaVigencia = (u, dISO) => {
    const ini = soDataISO(u.data_ativacao);
    const fim = soDataISO(u.data_inativacao);
    if (ini && dISO < ini) return true;   // antes da ativação
    if (fim && dISO > fim) return true;    // após a inativação
    return false;
  };

  // --- Carregamentos Iniciais ---
  const carregarImplantadores = useCallback(async () => {
    try {
      // Janela de vigência = semana exibida. O backend devolve quem estava
      // vigente nesse intervalo (inclui inativados cuja data de inativação
      // ainda alcança a semana e exclui quem ainda não foi ativado).
      const fimSemanaDt = criarDataLocal(dataInicio); fimSemanaDt.setDate(fimSemanaDt.getDate() + 6);
      const fimSemana = formatarDataISO(fimSemanaDt);
      // escala=1 -> no submenu Projetos a escala lista apenas operadores e analistas.
      const base = lotacaoFixa ? `id_projeto=${lotacaoFixa}&escala=1&` : '';
      const r = await api.get(`/implantadores?${base}escala_inicio=${dataInicio}&escala_fim=${fimSemana}`);
      setImplantadores(r.data);
    } catch (e){}
  }, [lotacaoFixa, dataInicio]);
  const carregarProjetos = useCallback(async () => { try { const r = await api.get('/projetos'); const _lp = r.data.filter(p => p.ativo); setListaProjetos(lotacaoFixa ? _lp.filter(p => String(p.id_projeto) === String(lotacaoFixa)) : _lp); } catch (e){} }, [lotacaoFixa]);
  const carregarEscalaDaSemana = useCallback(async () => { const f = criarDataLocal(dataInicio); f.setDate(f.getDate() + 6); try { const r = await api.get(`${apiBase}/escalas?inicio=${dataInicio}&fim=${formatarDataISO(f)}`); setEscalaDados(r.data); } catch (e){} }, [dataInicio, apiBase]);

  // --- CARREGAR PERMISSÕES ---
  useEffect(() => {
      // Modo Projetos: permissões resolvidas pelo componente pai (módulo proj_*).
      if (typeof permissaoNovo === 'boolean' || typeof permissaoEditar === 'boolean') {
          setPermissoes({ pode_acessar: true, pode_novo: !!permissaoNovo, pode_editar: !!permissaoEditar });
          return;
      }
      const carregarPermissoes = async () => {
          try {
              const session = sessionStorage.getItem('usuario_opera');
              const usuarioLogado = session ? JSON.parse(session) : null;

              if (usuarioLogado && usuarioLogado.perfil_acesso) {
                  if (usuarioLogado.perfil_acesso === 'Administrador') {
                      setPermissoes({ pode_acessar: true, pode_novo: true, pode_editar: true });
                  } else {
                      const resRegras = await api.get(`/regras/${usuarioLogado.perfil_acesso}`);
                      const regra = resRegras.data.find(r => r.nome_modulo === (moduloAcesso || 'escala'));
                      if (regra) {
                          setPermissoes({ 
                              pode_acessar: regra.pode_acessar, 
                              pode_novo: regra.pode_novo, 
                              pode_editar: regra.pode_editar 
                          });
                      }
                  }
              }
          } catch (error) { console.error("Erro ao carregar permissões", error); }
      };
      carregarPermissoes();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permissaoNovo, permissaoEditar]);

  useEffect(() => { carregarImplantadores(); carregarProjetos(); }, [carregarImplantadores, carregarProjetos]);
  useEffect(() => { carregarEscalaDaSemana(); }, [carregarEscalaDaSemana]);

  const carregarUnidadesDoProjeto = async (id) => { 
    if (!id) { setListaUnidades([]); return; } 
    try { 
        const r = await api.get(`/unidades/buscar?projeto=${id}&status=true&limite=1000`); 
        if (r.data && Array.isArray(r.data.dados)) {
            setListaUnidades(r.data.dados);
        } else if (Array.isArray(r.data)) {
            setListaUnidades(r.data);
        } else {
            setListaUnidades([]);
        }
    } catch (e) { 
        console.error(e);
        setListaUnidades([]); 
    } 
  };
  
  const carregarProdutosDaUnidade = async (idUnidade) => { 
    if (!idUnidade) { setListaProdutos([]); return; } 
    try { 
      const rIds = await api.get(`/unidades/${idUnidade}/produtos`); 
      const idsVinculados = Array.isArray(rIds.data) ? rIds.data.map(p => Number(p.id_produto)) : []; 
      const rTodos = await api.get('/produtos'); 
      const produtosFinais = rTodos.data.filter(p => idsVinculados.includes(Number(p.id_produto)) && (p.ativo === true || p.ativo === 1)); 
      setListaProdutos(produtosFinais); 
    } catch (e) { setListaProdutos([]); } 
  };

  // --- HANDLERS ---
  const handleProjetoChange = (e) => { const np = e.target.value; setFormEscala({ ...formEscala, id_projeto: np, id_unidade: '', produtos: [] }); setListaUnidades([]); setListaProdutos([]); if (np) carregarUnidadesDoProjeto(np); };
  const handleUnidadeChange = (e) => { const nu = e.target.value; setFormEscala({ ...formEscala, id_unidade: nu, produtos: [] }); if (nu) { carregarProdutosDaUnidade(nu); } else { setListaProdutos([]); } };
  const handleProdutoCheck = (id) => { const s = [...formEscala.produtos]; const idNum = Number(id); setFormEscala({ ...formEscala, produtos: s.includes(idNum) ? s.filter(x => x !== idNum) : [...s, idNum] }); };

  const handleCopiar = () => { 
      setClipboard({ ...formEscala }); 
      Swal.fire({ icon: 'success', title: 'Copiado!', text: 'Informações copiadas com sucesso.', timer: 1500, showConfirmButton: false });
  };
  const handleColar = () => { if (!clipboard) return; setFormEscala({ ...clipboard }); if (['TRABALHO', 'APOIO'].includes(clipboard.tipo)) { if (clipboard.id_projeto) { carregarUnidadesDoProjeto(clipboard.id_projeto); if (clipboard.id_unidade) carregarProdutosDaUnidade(clipboard.id_unidade); } } };

  // --- REPLICAÇÃO ---
  const toggleModoReplicacao = () => { if (!modoReplicacao) { setUsersReplicar([]); setDiasReplicar([]); } setModoReplicacao(!modoReplicacao); };
  const handleCheckUserRep = (id) => { setUsersReplicar(prev => prev.includes(id) ? prev.filter(u => u !== id) : [...prev, id]); };
  const handleCheckDiaRep = (dataISO) => { setDiasReplicar(prev => prev.includes(dataISO) ? prev.filter(d => d !== dataISO) : [...prev, dataISO]); };

  const confirmarReplicacao = async () => {
      if (usersReplicar.length === 0 || diasReplicar.length === 0) return Swal.fire('Atenção', 'Selecione pelo menos 1 colaborador e 1 dia.', 'warning');
      
      const confirmacao = await Swal.fire({
          title: 'Confirmar Replicação?',
          text: `Deseja replicar para ${usersReplicar.length} colaboradores em ${diasReplicar.length} dias?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#3A5D50',
          cancelButtonColor: '#d33',
          confirmButtonText: 'Sim, replicar!'
      });

      if (!confirmacao.isConfirmed) return;

      const mapUsers = new Map(implantadores.map(u => [u.id_usuario, u]));
      const pacoteDados = [];
      for (const userId of usersReplicar) {
          const uObj = mapUsers.get(userId);
          for (const diaISO of diasReplicar) {
              if (uObj && foraDaVigencia(uObj, diaISO)) continue; // respeita a vigência
              pacoteDados.push({
                  ...formEscala,
                  id_usuario: userId,
                  data_escala: diaISO,
                  id_projeto: ['TRABALHO', 'APOIO'].includes(formEscala.tipo) ? formEscala.id_projeto : null,
                  id_unidade: formEscala.tipo === 'TRABALHO' ? formEscala.id_unidade : null,
                  produtos: formEscala.tipo === 'TRABALHO' ? formEscala.produtos : [],
                  turno: formEscala.tipo === 'TRABALHO' ? formEscala.turno : 'NORMAL', // [MODIFICADO] Adicionando o turno na replicação
                  redmine: formEscala.tipo === 'TRABALHO' ? formEscala.redmine : ''
              });
          }
      }

      if (pacoteDados.length === 0) return Swal.fire('Atenção', 'Os colaboradores/dias selecionados estão fora do período de atividade.', 'warning');

      try {
          await api.post(`${apiBase}/escalas/salvar-lote`, pacoteDados);
          Swal.fire('Sucesso!', 'Replicação concluída!', 'success');
          setModalAberto(false);
          setModoReplicacao(false);
          setUsersReplicar([]);
          setDiasReplicar([]);
          carregarEscalaDaSemana(); 
      } catch (error) { console.error("Erro na replicação:", error); Swal.fire('Erro', 'Erro ao replicar escalas.', 'error'); }
  };

  const encontrarItemEscala = (idUsuario, dataISO) => { return escalaDados.find(e => { const dataString = e.data_escala ? String(e.data_escala) : ''; return Number(e.id_usuario) === Number(idUsuario) && dataString.split('T')[0] === dataISO; }); };
  
  const abrirModal = (u, dISO, idx) => {
    if (!permissoes.pode_editar) {
        return Swal.fire('Acesso Restrito', 'Você não tem permissão para editar a escala.', 'info');
    }
    if (foraDaVigencia(u, dISO)) {
        return Swal.fire('Fora de Vigência', 'Este dia está fora do período de atividade do colaborador na escala.', 'info');
    }

    const ex = encontrarItemEscala(u.id_usuario, dISO);
    setCelulaSelecionada({ id_usuario: u.id_usuario, nome: u.nome_completo, data: dISO, diaSemana: ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'][idx] });
    setModoReplicacao(false);
    
    if (ex) { 
        setFormEscala({ 
            tipo: ex.tipo, 
            id_projeto: ex.id_projeto || '', 
            id_unidade: ex.id_unidade || '', 
            produtos: Array.isArray(ex.ids_produtos) ? ex.ids_produtos.map(Number) : [],
            turno: ex.turno || 'NORMAL', // [MODIFICADO] Lendo o turno do banco
            redmine: ex.redmine || ''
        }); 
        
        if (ex.id_projeto) { 
            carregarUnidadesDoProjeto(ex.id_projeto); 
            if (ex.id_unidade) carregarProdutosDaUnidade(ex.id_unidade);
        } 
    } else { 
        setFormEscala({ tipo: 'TRABALHO', id_projeto: '', id_unidade: '', produtos: [], turno: 'NORMAL', redmine: '' }); 
        setListaUnidades([]); setListaProdutos([]); 
    }
    setModalAberto(true);
  };

  const handleSalvarModal = async () => { 
      if (formEscala.tipo === 'TRABALHO' && (!formEscala.id_projeto || !formEscala.id_unidade)) return Swal.fire('Atenção', 'Selecione Projeto e Unidade.', 'warning');
      if (formEscala.tipo === 'APOIO' && !formEscala.id_projeto) return Swal.fire('Atenção', 'Selecione o Projeto.', 'warning');

      const payload = {
          ...formEscala,
          id_usuario: celulaSelecionada.id_usuario,
          data_escala: celulaSelecionada.data,
          id_projeto: ['TRABALHO', 'APOIO'].includes(formEscala.tipo) ? formEscala.id_projeto : null,
          id_unidade: formEscala.tipo === 'TRABALHO' ? formEscala.id_unidade : null,
          produtos: formEscala.tipo === 'TRABALHO' ? formEscala.produtos : [],
          turno: formEscala.tipo === 'TRABALHO' ? formEscala.turno : 'NORMAL', // [MODIFICADO] Enviando o turno
          redmine: formEscala.tipo === 'TRABALHO' ? formEscala.redmine : ''
      };

      try { 
          await api.post(`${apiBase}/escalas/salvar`, payload); 
          setModalAberto(false); 
          carregarEscalaDaSemana(); 
          Swal.fire({ icon: 'success', title: 'Salvo!', showConfirmButton: false, timer: 1000 });
      } catch (e) { Swal.fire('Erro', 'Erro ao salvar.', 'error'); } 
  };

  const handleLimparModal = async () => { 
      try { 
          await api.post(`${apiBase}/escalas/salvar`, { id_usuario: celulaSelecionada.id_usuario, data_escala: celulaSelecionada.data, tipo: null }); 
          setModalAberto(false); 
          carregarEscalaDaSemana(); 
          Swal.fire({ icon: 'success', title: 'Limpo!', showConfirmButton: false, timer: 1000 });
      } catch (e) { Swal.fire('Erro', 'Erro ao limpar.', 'error'); } 
  };
  
  // --- RENDERIZAÇÃO DA CÉLULA ---
  const renderCelula = (idU, dISO) => { 
    const it = encontrarItemEscala(idU, dISO);
    if (!it) return <div className="celula-vazia">+</div>; 
    
    if (it.tipo === 'SEDE') return <div style={{ backgroundColor: '#ebfaefff', color: '#085815ff', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.0rem' }}>SEDE</div>;
    if (it.tipo === 'SEDE_TREINAMENTO') return <div style={{ backgroundColor: '#d5f1efff', color: '#046572ff', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.0rem', textAlign: 'center', lineHeight: '1.1' }}><span>SEDE</span><span style={{fontSize: '0.85rem'}}>TREINAMENTO</span></div>;
    if (it.tipo === 'HOME_OFFICE') return <div style={{ backgroundColor: '#EDECE5', color: '#7b1fa2', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.0rem' }}>HOME OFFICE</div>;
    
    if (it.tipo === 'APOIO') return <div className="celula-trabalho" style={{borderLeft: '4px solid #3A5D50'}}><span className="proj" style={{color: '#3A5D50', fontSize:'0.65rem'}}>APOIO AO PROJETO</span><span className="uni" style={{fontWeight:'bold', fontSize:'0.75rem', marginTop:'2px'}}>{it.nome_projeto}</span></div>;
    if (it.tipo === 'ATESTADO') return <div className="celula-atestado">ATESTADO</div>;
    if (it.tipo === 'FALTA') return <div style={{ backgroundColor: '#000000', color: '#ffffff', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', fontWeight: 'bold', fontSize: '1.0rem' }}>FALTA</div>;
    if (it.tipo === 'FERIAS') return <div className="celula-ferias">FÉRIAS</div>;
    if (it.tipo === 'FERIADO') return <div className="celula-feriado">FERIADO</div>; 
    if (it.tipo === 'FOLGA') return <div className="celula-folga">FOLGA</div>; 
    
    // [MODIFICADO] Aplicação do estilo de acordo com o Turno
    let containerStyle = {};
    let tagPlantao = null;

    if (it.turno === 'DIURNO') {
        containerStyle = { backgroundColor: '#F6F1E6', borderLeftColor: '#C7A96A' };
        tagPlantao = <span style={{fontSize: '0.65rem', fontWeight: 'bold', color: '#9C7A3C', marginBottom: '4px'}}><Icon n="sun"/> PLANTÃO DIURNO</span>;
    } else if (it.turno === 'NOTURNO') {
        containerStyle = { backgroundColor: '#EDECE5', borderLeftColor: '#ab47bc' };
        tagPlantao = <span style={{fontSize: '0.65rem', fontWeight: 'bold', color: '#5A625B', marginBottom: '4px'}}><Icon n="moon"/> PLANTÃO NOTURNO</span>;
    }

    return (
        <div className="celula-trabalho" style={containerStyle}>
            {tagPlantao}
            <span className="proj">{it.nome_projeto}</span>
            <span className="uni">{it.nome_unidade}</span>
            
            {it.nomes_produtos && (
              <span className="prods-lista" style={{ color: '#e91e63' }}>
                {it.nomes_produtos}
              </span>
            )}
        </div>
    ); 
  };

  // --- EXPORTAÇÃO ---
  // opts só afeta o JPG. Sem opts (PDF) mantém EXATAMENTE o comportamento original.
  const gerarImagemCanvas = async (opts = {}) => {
    const ajustarLargura = opts.width != null;   // só o JPG passa width
    const larguraExport = opts.width || 1200;    // PDF: 1200 (inalterado)
    const logoAltura    = opts.logoH || 80;      // PDF: 80   (inalterado)
    const escala        = opts.scale || 2;       // PDF: 2    (inalterado)
    const linhaPad      = opts.headerMinH || 0;  // altura mínima do cabeçalho (desce a linha) - só JPG
    setDataGeracao(new Date()); 
    const el = exportRef.current;
    if (!el) return null;
    
    Swal.fire({
        title: 'Gerando Exportação...',
        text: 'Aguarde enquanto processamos a imagem.',
        didOpen: () => { Swal.showLoading(); }
    });

    el.classList.add('exporting-jpg');
    try {
      const canvas = await html2canvas(el, {
        scale: escala, backgroundColor: '#ffffff', useCORS: true, scrollY: -window.scrollY,
        // PDF: viewport = largura real (inalterado). JPG: força o viewport estreito.
        windowWidth: ajustarLargura ? larguraExport : el.scrollWidth,
        ...(ajustarLargura ? { width: larguraExport } : {}),
        ignoreElements: (n) => n.classList.contains('controles-data'),
        onclone: (clonedDoc) => {
            const clonedEl = clonedDoc.querySelector('.escala-container');
            if(clonedEl) { clonedEl.classList.add('exporting-jpg'); clonedEl.style.width = `${larguraExport}px`; clonedEl.style.maxWidth = `${larguraExport}px`; clonedEl.style.height = 'auto'; clonedEl.style.position = 'relative'; }
            if (ajustarLargura) {
                const wrap = clonedDoc.querySelector('.tabela-wrapper');
                if (wrap) { wrap.style.width = '100%'; wrap.style.overflow = 'visible'; }
                const tab = clonedDoc.querySelector('.tabela-escala');
                if (tab) { tab.style.width = '100%'; tab.style.minWidth = '0'; }
                // Força o cabeçalho a ficar mais alto  a linha (borda) cai ABAIXO da logo.
                // Robusto mesmo quando o .header-escala tem altura fixa no CSS.
                const hdr = clonedDoc.querySelector('.header-escala');
                if (hdr && linhaPad) { hdr.style.boxSizing = 'border-box'; hdr.style.height = 'auto'; hdr.style.minHeight = `${linhaPad}px`; }
            }
            const logo = clonedDoc.querySelector('.logo-sistema');
            const headerEscala = clonedDoc.querySelector('.header-escala');
            const acoesTopo = clonedDoc.querySelector('.acoes-topo');
            if (logo && headerEscala && acoesTopo && clonedEl) {
                clonedEl.insertBefore(logo, headerEscala);
                logo.style.position = 'absolute'; logo.style.top = '20px'; logo.style.right = '20px'; logo.style.height = `${logoAltura}px`; logo.style.width = 'auto'; logo.style.zIndex = '999';
                acoesTopo.style.display = 'none';
            }
        }
      });
      el.classList.remove('exporting-jpg');
      return canvas;
    } catch (e) { 
        el.classList.remove('exporting-jpg'); 
        console.error("Erro export:", e); 
        Swal.fire('Erro', 'Falha ao gerar a exportação.', 'error');
        return null; 
    }
  };

  // Recorta as bordas brancas do canvas (remove a sobra à direita/abaixo),
  // deixando margem mínima uniforme. Usado SÓ no JPG.
  const recortarBordasBrancas = (canvas, margem = 16) => {
    try {
      const ctx = canvas.getContext('2d');
      const w = canvas.width, h = canvas.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      const branco = (i) => data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244;
      const passo = 2;
      const linhaTemConteudo = (y) => { for (let x = 0; x < w; x += passo) { if (!branco((y * w + x) * 4)) return true; } return false; };
      const colTemConteudo = (x) => { for (let y = 0; y < h; y += passo) { if (!branco((y * w + x) * 4)) return true; } return false; };
      let top = 0, bottom = h - 1, left = 0, right = w - 1;
      while (top < bottom && !linhaTemConteudo(top)) top++;
      while (bottom > top && !linhaTemConteudo(bottom)) bottom--;
      while (left < right && !colTemConteudo(left)) left++;
      while (right > left && !colTemConteudo(right)) right--;
      const x0 = Math.max(0, left - margem), y0 = Math.max(0, top - margem);
      const x1 = Math.min(w - 1, right + margem), y1 = Math.min(h - 1, bottom + margem);
      const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
      if (nw <= 0 || nh <= 0 || (nw === w && nh === h)) return canvas;
      const out = document.createElement('canvas');
      out.width = nw; out.height = nh;
      const octx = out.getContext('2d');
      octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, nw, nh);
      octx.drawImage(canvas, x0, y0, nw, nh, 0, 0, nw, nh);
      return out;
    } catch (e) { console.error('crop falhou', e); return canvas; }
  };

  const handleExportJpg = async () => { 
      // JPG mais elegante: largura 1150 (cards quadrados), logo maior, qualidade maior
      // e recorte das bordas brancas (margem mínima, sem sobra à direita).
      let canvas = await gerarImagemCanvas({ width: 1150, logoH: 104, scale: 2, headerMinH: 53 }); 
      if(canvas) { 
          canvas = recortarBordasBrancas(canvas, 16); 
          const img = canvas.toDataURL("image/jpeg", 0.94); 
          const l = document.createElement("a"); 
          l.href = img; 
          l.download = `Escala_${dataInicio}.jpg`; 
          l.click(); 
          Swal.close(); 
      } 
  };
  
  const handleExportPdf = async () => { 
      const canvas = await gerarImagemCanvas(); 
      if(canvas) { 
          const imgData = canvas.toDataURL('image/png'); 
          const pdf = new jsPDF('l', 'mm', 'a4'); 
          const pdfWidth = pdf.internal.pageSize.getWidth(); 
          const pdfHeight = pdf.internal.pageSize.getHeight(); 
          const margin = 10; 
          const maxImgWidth = pdfWidth - (margin * 2); 
          const maxImgHeight = pdfHeight - (margin * 2); 
          const imgProps = pdf.getImageProperties(imgData); 
          const ratio = imgProps.width / imgProps.height; 
          let finalWidth = maxImgWidth; 
          let finalHeight = finalWidth / ratio; 
          if (finalHeight > maxImgHeight) { finalHeight = maxImgHeight; finalWidth = finalHeight * ratio; } 
          const x = (pdfWidth - finalWidth) / 2; 
          const y = (pdfHeight - finalHeight) / 2; 
          pdf.addImage(imgData, 'PNG', x, y, finalWidth, finalHeight); 
          pdf.save(`Escala_${dataInicio}.pdf`); 
          Swal.close(); 
      } 
  };

  return (
    <div className="escala-container" ref={exportRef}>
      <div className="header-escala">
        <div className="titulo-area">
          <h2><Icon n="calendar"/> Gerador de Escalas</h2>
          <div className="controles-data no-export">
              <button onClick={() => mudarSemana(-7)}>◀ Ant</button>
              <span>Semana: {formatarDataBr(dataInicio)}</span>
              <button onClick={() => mudarSemana(7)}>Prox ▶</button>
          </div>
        </div>
        <div className="acoes-topo">
          <img src="/logo.png" alt="Opera Echo" className="logo-sistema" />
          <button className="btn-voltar" onClick={aoVoltar}>Voltar</button>
          <button className="btn-exportar btn-jpg" onClick={handleExportJpg}><Icon n="camera"/> Salvar JPG</button>
          <button className="btn-exportar" onClick={handleExportPdf}><Icon n="printer"/> Gerar PDF</button>
        </div>
      </div>
      <div className="aviso-fixo"><p><strong>Observação:</strong> Durante esta semana, a escala poderá sofrer alterações a qualquer momento, dependendo do surgimento de novas frentes de trabalho.</p></div>
      <div className="tabela-wrapper">
        <table className="tabela-escala">
          <thead>
            <tr>
              <th className="col-colaborador">COLABORADORES</th>
              {[0, 1, 2, 3, 4, 5, 6].map(i => {
                const d = getDataColuna(i);
                return ( <th key={i}> <div className="th-dia">{['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB', 'DOM'][i]}</div> <div className="th-data">{formatarDataBr(d)}</div> </th> );
              })}
            </tr>
          </thead>
          <tbody>
            {implantadores.map(u => (
              <tr key={u.id_usuario}>
                <td className="td-nome">{u.nome_completo}</td>
                {[0, 1, 2, 3, 4, 5, 6].map(i => {
                  const d = getDataColuna(i);
                  const bloqueado = foraDaVigencia(u, d);
                  if (bloqueado) {
                    return (
                      <td key={i} style={{ backgroundColor: '#F1F0EA', cursor: 'not-allowed' }} title="Fora do período de atividade do colaborador">
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#A7ABA3', fontWeight: 'bold' }}>-</div>
                      </td>
                    );
                  }
                  return ( <td key={i} onClick={() => abrirModal(u, d, i)}> {renderCelula(u.id_usuario, d)} </td> );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="footer-info"><p>Opera Echo Management System</p><p><strong>Escala gerada por:</strong> {nomeUsuario} | <strong>Data:</strong> {dataGeracao.toLocaleString()}</p></div>

      {modalAberto && (
        <div className="modal-overlay no-print">
          <div className="modal-content modal-escala">
            <div className="me-cabecalho">
                <h3>Agendar: {celulaSelecionada.nome}</h3>
                <div className="me-acoes-topo">
                    <button type="button" onClick={handleCopiar} className="btn-acao-sm btn-copiar" title="Copiar"><Icon n="clipboard"/> Copiar</button>
                    {clipboard && <button type="button" onClick={handleColar} className="btn-acao-sm btn-colar" title="Colar"><Icon n="inbox"/> Colar</button>}
                    <button type="button" onClick={toggleModoReplicacao} className={`btn-acao-sm btn-replicar ${modoReplicacao ? 'ativo' : ''}`}>{modoReplicacao ? 'Cancelar' : 'Replicar...'}</button>
                </div>
            </div>
            {!modoReplicacao ? (
                <div className={`form-modal me-grade ${formEscala.tipo === 'TRABALHO' ? 'me-grade--dupla' : ''}`}>
                    <div className="me-coluna">
                        <div className="me-linha">
                            <div className="me-campo">
                                <label>Tipo</label>
                                <select value={formEscala.tipo} onChange={e => setFormEscala({ ...formEscala, tipo: e.target.value })}>
                                    <option value="APOIO">Apoio ao Projeto</option>
                                    <option value="ATESTADO">Atestado Médico</option>
                                    <option value="FALTA">Falta</option>
                                    <option value="FERIADO">Feriado</option>
                                    <option value="FERIAS">Férias</option>
                                    <option value="FOLGA">Folga</option>
                                    <option value="HOME_OFFICE">Home Office</option>
                                    <option value="SEDE">Sede</option>
                                    <option value="SEDE_TREINAMENTO">Sede - Treinamento</option>
                                    <option value="TRABALHO">Trabalho</option>
                                </select>
                            </div>
                            {formEscala.tipo === 'TRABALHO' && (
                                <div className="me-campo">
                                    <label>Turno</label>
                                    <div className="me-turnos" role="radiogroup">
                                        {[['NORMAL', 'Normal'], ['DIURNO', 'Plantão Diurno'], ['NOTURNO', 'Plantão Noturno']].map(([v, r]) => (
                                            <label key={v} className={formEscala.turno === v ? 'ativo' : ''}>
                                                <input type="radio" name="turno" checked={formEscala.turno === v} onChange={() => setFormEscala({...formEscala, turno: v})} />
                                                {r}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        {['TRABALHO', 'APOIO'].includes(formEscala.tipo) && (
                            <div className="me-campo">
                                <label>Projeto</label>
                                <select value={formEscala.id_projeto} onChange={handleProjetoChange}><option value="">Selecione...</option>{listaProjetos.map(p => (<option key={p.id_projeto} value={p.id_projeto}>{p.nome_projeto}</option>))}</select>
                            </div>
                        )}
                        {formEscala.tipo === 'TRABALHO' && (
                            <div className="me-linha">
                                <div className="me-campo me-campo--largo">
                                    <label>Unidade</label>
                                    <select value={formEscala.id_unidade} onChange={handleUnidadeChange} disabled={!formEscala.id_projeto}><option value="">Selecione...</option>{listaUnidades.map(u => (<option key={u.id_unidade} value={u.id_unidade}>{u.nome_unidade}</option>))}</select>
                                </div>
                                {/* Redmine: opcional; não aparece na escala nem em relatórios, só nas mensagens do WhatsApp */}
                                <div className="me-campo me-campo--curto">
                                    <label>Redmine <small>(opcional)</small></label>
                                    <input type="text" value={formEscala.redmine || ''} maxLength={30} placeholder="Nº do chamado" onChange={e => setFormEscala({ ...formEscala, redmine: e.target.value })} />
                                </div>
                            </div>
                        )}
                    </div>
                    {formEscala.tipo === 'TRABALHO' && (
                        <div className="me-coluna me-produtos">
                            <label>Produtos</label>
                            {formEscala.id_unidade && listaProdutos.length > 0 ? (
                                <div className="lista-checks-modal">{listaProdutos.map(p => (<label key={p.id_produto} className="check-item-modal"><input type="checkbox" checked={formEscala.produtos.includes(Number(p.id_produto))} onChange={() => handleProdutoCheck(p.id_produto)} />{p.nome_produto}</label>))}</div>
                            ) : (
                                <p className="aviso-sm">{formEscala.id_unidade ? 'Nenhum produto vinculado.' : 'Selecione a unidade.'}</p>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="area-replicacao">
                    <p className="info-replicacao">Selecione quem receberá (<strong>{formEscala.tipo}</strong>) e os dias.</p>
                    <div className="cols-replicacao">
                        <div className="col-rep"><label>1. Para quem?</label><div className="lista-rep">{implantadores.map(imp => (<label key={imp.id_usuario} className="item-rep"><input type="checkbox" checked={usersReplicar.includes(imp.id_usuario)} onChange={() => handleCheckUserRep(imp.id_usuario)} />{imp.nome_completo}</label>))}</div></div>
                        <div className="col-rep"><label>2. Para quais dias?</label><div className="lista-rep">{[0, 1, 2, 3, 4, 5, 6].map(i => { const dISO = getDataColuna(i); return (<label key={dISO} className="item-rep"><input type="checkbox" checked={diasReplicar.includes(dISO)} onChange={() => handleCheckDiaRep(dISO)} />{['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'][i]} ({formatarDataBr(dISO)})</label>); })}</div></div>
                    </div>
                </div>
            )}
            <div className="modal-botoes">
              {!modoReplicacao ? (
                  <>
                    <button onClick={() => setModalAberto(false)} className="btn-cancelar">Cancelar</button>
                    {/* Botões protegidos */}
                    {permissoes.pode_editar && (
                        <>
                            <button onClick={handleLimparModal} className="btn-limpar">Limpar Dia</button>
                            <button onClick={handleSalvarModal} className="btn-salvar-modal">Salvar</button>
                        </>
                    )}
                  </>
              ) : (
                  <>
                    <button onClick={toggleModoReplicacao} className="btn-cancelar">Voltar</button>
                    <button onClick={confirmarReplicacao} className="btn-salvar-modal btn-confirmar-rep"><Icon n="check"/> Confirmar</button>
                  </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
export default GeradorEscalas;