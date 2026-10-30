/* ARQUIVO: src/Dashboard.js */
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Icon from './components/Icon';
import Contador from './components/Contador';
import { useNavigate } from 'react-router-dom';
import api from './api'; 
import Swal from 'sweetalert2'; 
import './Dashboard.css';
import { mascaraCelular, celularValido, soDigitos, emailValido } from './celular';

import CadastroUsuario from './CadastroUsuario'; 
import CadastroProdutos from './CadastroProdutos';
import CadastroProjetos from './CadastroProjetos';
import CadastroUnidades from './CadastroUnidades';
import CadastroPerfil from './CadastroPerfil';
import GeradorEscalas from './GeradorEscalas';
import RegistroAtividades from './RegistroAtividades';
import PlanoAcao from './PlanoAcao'; 
import PlanoAcaoDetalhes from './PlanoAcaoDetalhes';
import PainelPlanoAcao from './PainelPlanoAcao';
import Paineis from './Paineis'; 
import RegistroFerias from './RegistroFerias'; 
import AprovacaoFerias from './AprovacaoFerias'; 
import LinksExternos from './LinksExternos'; 
import Relatorios from './Relatorios'; 
import LancamentoHoraExtra from './LancamentoHoraExtra'; 
import Projetos from './Projetos'; 
import Parametros from './Parametros';
import SigtapConsulta from './SigtapConsulta';
import CadastroRegioes from './CadastroRegioes';

// Imagens servidas a partir da pasta /public
const logoWatermark = `/logo.png`;

/* Data de HOJE no fuso LOCAL, no formato YYYY-MM-DD.
 * Evita o bug do toISOString(), que converte p/ UTC e, à noite (BRT = UTC-3),
 * "pula" para o dia seguinte. Use SEMPRE este helper para a data corrente. */
const hojeLocal = () => {
    const d = new Date();
    const off = d.getTimezoneOffset() * 60000;          
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
};

function Dashboard({ telaInicial = 'home' }) {
  const navigate = useNavigate();
  
  // --- Leitura segura do usuário ---
  const usuario = useMemo(() => {
      try {
          const stored = sessionStorage.getItem('usuario_opera');
          if (stored && stored !== "undefined" && stored !== "null") {
              return JSON.parse(stored);
          }
      } catch (e) { console.error("Erro ao ler usuário", e); }
      return { nome: 'Admin', perfil_acesso: 'Administrador', id_usuario: 0 };
  }, []);

  const nomeExibicao = usuario.nome || usuario.nome_completo || 'Usuário';

  const [telaAtual, setTelaInterna] = useState(telaInicial);
  const [abaParametros, setAbaParametros] = useState(null);
  const [lotacaoProjSel, setLotacaoProjSel] = useState('');
  const [relatorioInicial, setRelatorioInicial] = useState('menu');

  // Histórico de navegação: "Voltar" leva à tela anterior (não sempre à principal).
  const telaRef = useRef(telaInicial);
  const relRef = useRef(relatorioInicial); relRef.current = relatorioInicial;
  const abaRef = useRef(abaParametros); abaRef.current = abaParametros;
  const historico = useRef([]);
  const setTelaAtual = useCallback((prox, forcar = false) => {
    if (prox === telaRef.current && !forcar) return;
    if (prox === 'home') historico.current = [];
    else historico.current = [...historico.current.slice(-29), { tela: telaRef.current, rel: relRef.current, aba: abaRef.current }];
    telaRef.current = prox;
    setTelaInterna(prox);
  }, []);
  const voltar = useCallback(() => {
    const ant = historico.current.pop() || { tela: 'home', rel: 'menu', aba: null };
    setRelatorioInicial(ant.rel);
    setAbaParametros(ant.aba);
    telaRef.current = ant.tela;
    setTelaInterna(ant.tela);
  }, []);

  // Telas com endereço próprio (operaecho.com/sigtap): a barra de endereço acompanha a tela atual.
  useEffect(() => {
    const destino = telaAtual === 'sigtap' ? '/sigtap' : '/dashboard';
    if (window.location.pathname !== destino) window.history.replaceState(window.history.state, '', destino);
  }, [telaAtual]);
  // Celular com WhatsApp é obrigatório (escala, férias e código de senha saem por ele):
  // quem ainda não confirmou o número completa o cadastro logo após o login.
  useEffect(() => {
    let vivo = true;
    api.get('/meu-cadastro/contato').then(async ({ data }) => {
      if (!vivo || data.completo) return;
      const { value } = await Swal.fire({
        title: 'Atualize seu contato',
        icon: 'info',
        html: `<p style="margin:0 0 12px;font-size:.95rem">Agora a escala da semana, as alterações de escala, a aprovação de férias e o código para redefinir a senha chegam pelo <b>WhatsApp</b>. Informe o seu celular para continuar.</p>
          <input id="ctt-cel" class="swal2-input" type="tel" placeholder="Celular com WhatsApp *" style="display:block;width:85%;margin:8px auto">
          <input id="ctt-email" class="swal2-input" type="email" placeholder="E-mail (opcional)" style="display:block;width:85%;margin:8px auto">`,
        confirmButtonText: 'Salvar', confirmButtonColor: '#2e7d32',
        allowOutsideClick: false, allowEscapeKey: false, showLoaderOnConfirm: true,
        didOpen: () => {
          const cel = document.getElementById('ctt-cel');
          cel.value = mascaraCelular(data.celular);
          cel.addEventListener('input', () => { cel.value = mascaraCelular(cel.value); });
          document.getElementById('ctt-email').value = data.email || '';
        },
        preConfirm: async () => {
          const celular = document.getElementById('ctt-cel').value;
          const email = document.getElementById('ctt-email').value.trim();
          if (!celularValido(celular)) return Swal.showValidationMessage('Celular inválido: DDD + 9 dígitos, ex.: (21) 98765-4321.');
          if (!emailValido(email)) return Swal.showValidationMessage('E-mail inválido.');
          try {
            const r = await api.put('/meu-cadastro/contato', { celular: soDigitos(celular), celular_whatsapp: true, email });
            return r.data;
          } catch (e) { return Swal.showValidationMessage(e.response?.data?.erro || 'Não foi possível salvar.'); }
        }
      });
      if (value) {
        try { sessionStorage.setItem('usuario_opera', JSON.stringify({ ...usuario, celular: value.celular, celular_whatsapp: true, email: value.email })); } catch (e) { /* ignora */ }
        Swal.fire({ icon: 'success', title: 'Contato atualizado!', timer: 1500, showConfirmButton: false });
      }
    }).catch(() => { /* sem conexão: tenta no próximo login */ });
    return () => { vivo = false; };
  }, [usuario]);

  // Camada visual da área logada (design.css)
  useEffect(() => {
    document.body.classList.add('oe-app');
    return () => document.body.classList.remove('oe-app');
  }, []);

  const [dataLogin] = useState(new Date());
    
  // Alterado para suportar operadores também
  const [totais, setTotais] = useState({ implantadores: 0, operadores: 0, projetos: 0, unidades: 0, produtos: 0 });
  const [proximasFerias, setProximasFerias] = useState([]);
  const [progressoPlanos, setProgressoPlanos] = useState([]);
  const [atividadesHoje, setAtividadesHoje] = useState({ total: 0, por_equipe: [] });
  const [atividadesHojeProjetos, setAtividadesHojeProjetos] = useState({ total: 0, por_equipe: [] });
  const [indiceFerias, setIndiceFerias] = useState(0); 

  const [ultimaAtualizacao, setUltimaAtualizacao] = useState(new Date());
  const [agora, setAgora] = useState(Date.now());

  const [, setCarregando] = useState(false);
  const [tipoPainelSelecionado, setTipoPainelSelecionado] = useState(null);
  const [idPlanoSelecionado, setIdPlanoSelecionado] = useState(null); 

  const [permissoes, setPermissoes] = useState([]);
  const [permissoesCarregadas, setPermissoesCarregadas] = useState(false);

  const [showUserMenu, setShowUserMenu] = useState(false);
  const dropdownRef = useRef(null);

  // Notificações de Aprovação
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificacoes, setNotificacoes] = useState([]);
  const notificationRef = useRef(null);
  const [dadosAprovacao, setDadosAprovacao] = useState(null); 
  const [perfilAprovacao, setPerfilAprovacao] = useState(''); 
  const [listaPerfis, setListaPerfis] = useState([]); 

  // Alteração de Senha
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [forcaSenha, setForcaSenha] = useState(0);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
      function handleClickOutside(event) {
          if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
              setShowUserMenu(false);
          }
          if (notificationRef.current && !notificationRef.current.contains(event.target)) {
              setShowNotifications(false);
          }
      }
      document.addEventListener("mousedown", handleClickOutside);
      return () => { document.removeEventListener("mousedown", handleClickOutside); };
  }, [dropdownRef, notificationRef]);

  // Carregar perfis para o dropdown de aprovação
  useEffect(() => {
      const loadPerfis = async () => {
          try {
              const res = await api.get('/perfis'); 
              setListaPerfis(res.data || []);
          } catch (e) {
              console.error("Erro ao carregar perfis:", e);
              setListaPerfis([{ id_perfil: 1, nome_perfil: 'Administrador' }]);
          }
      };
      loadPerfis();
  }, []);

  const carregarNotificacoes = useCallback(async () => {
      const perfisAprovadores = ['LÍDER DE PROJETO', 'COORDENADOR DE IMPLANTAÇÃO', 'GERENTE', 'ADMINISTRADOR', 'Líder de Projeto', 'Coordenador de Implantação', 'Gerente', 'Administrador'];
      const podeAprovar = perfisAprovadores.some(p => usuario.perfil_acesso?.toUpperCase().includes(p.toUpperCase()) || usuario.funcao?.toUpperCase().includes(p.toUpperCase()));

      if (!podeAprovar) return;

      try {
          const res = await api.get(`/dashboard/notificacoes?id_usuario=${usuario.id_usuario}`);
          setNotificacoes(Array.isArray(res.data) ? res.data : []);
      } catch (error) {
          console.error("Erro ao buscar notificações", error);
          setNotificacoes([]);
      }
  }, [usuario]);

  useEffect(() => {
    carregarNotificacoes();
    const interval = setInterval(carregarNotificacoes, 30000); 
    return () => clearInterval(interval);
  }, [carregarNotificacoes]);

  useEffect(() => {
    const carregarRegrasAcesso = async () => {
        try {
            const res = await api.get(`/regras/${usuario.perfil_acesso}`);
            setPermissoes(res.data);
        } catch (error) {
            console.error("Erro ao carregar permissões:", error);
        } finally {
            setPermissoesCarregadas(true);
        }
    };
    carregarRegrasAcesso();
  }, [usuario.perfil_acesso]);

  const podeAcessar = (moduloKey) => {
      if (usuario.perfil_acesso === 'Administrador') return true;
      if (!permissoesCarregadas) return false;
      const regra = permissoes.find(r => r.nome_modulo === moduloKey);
      return regra ? regra.pode_acessar : false;
  };

  const temAcessoMenuCadastro = () => podeAcessar('usuarios') || podeAcessar('produtos') || podeAcessar('projetos') || podeAcessar('unidades') || podeAcessar('regioes') || podeAcessar('perfis');
  const temAcessoMenuPaineis = () => podeAcessar('painel_consolidado') || podeAcessar('painel_prod_ind') || podeAcessar('painel_prod_uni') || podeAcessar('painel_metricas') || podeAcessar('painel_plano_acao');
  const temAcessoMenuImplantacao = () => podeAcessar('registro_atividades') || podeAcessar('hora_extra') || podeAcessar('escala') || podeAcessar('ferias_solicitacao');
  const temAcessoMenuProjetos = () => podeAcessar('proj_registro_atividades') || podeAcessar('proj_hora_extra') || podeAcessar('proj_escala') || podeAcessar('proj_ferias_solicitacao');
  const temAcessoMenuGestao = () => podeAcessar('ferias_gestao');
  const temAcessoMenuOperacoes = () => temAcessoMenuImplantacao() || temAcessoMenuProjetos() || temAcessoMenuPaineis() || temAcessoMenuGestao() || podeAcessar('links_externos') || podeAcessar('sigtap');
  const temAcessoMenuFerias = () => podeAcessar('ferias_solicitacao') || podeAcessar('proj_ferias_solicitacao') || podeAcessar('ferias_gestao');
  const temAcessoMenuRelatorios = () => podeAcessar('rel_estatisticas') || podeAcessar('rel_estatisticas_projetos') || podeAcessar('rel_tempo_medio') || podeAcessar('rel_auditoria_loc') || podeAcessar('rel_presenca_implantador') || podeAcessar('rel_presenca_equipe') || podeAcessar('rel_plano_acao') || podeAcessar('rel_projetos_ativos') || podeAcessar('rel_mapa_unidades');

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('token_opera');
    sessionStorage.removeItem('usuario_opera');
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    const TEMPO_LIMITE = 30 * 60 * 1000; 
    let temporizadorInatividade;
    const resetar = () => { 
        clearTimeout(temporizadorInatividade); 
        temporizadorInatividade = setTimeout(() => { 
            Swal.fire({
                title: 'Sessão expirada', text: 'Sua sessão foi encerrada devido à inatividade.', icon: 'warning', confirmButtonColor: 'var(--pine)'
            }).then(() => handleLogout()); 
        }, TEMPO_LIMITE); 
    };
    const eventos = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    eventos.forEach(e => document.addEventListener(e, resetar));
    resetar();
    return () => { clearTimeout(temporizadorInatividade); eventos.forEach(e => document.removeEventListener(e, resetar)); };
  }, [handleLogout]); 

  const atualizarDados = useCallback(async () => {
    if (totais.projetos === 0) setCarregando(true); 
    try {
        const [resTotais, resFerias, resPlanos] = await Promise.all([
            api.get(`/dashboard/totais?id_usuario=${usuario.id_usuario}`),
            api.get(`/dashboard/proximas-ferias?id_usuario=${usuario.id_usuario}`),
            api.get(`/dashboard/progresso-planos?id_usuario=${usuario.id_usuario}`)
        ]);
        setTotais(resTotais.data);
        setProximasFerias(Array.isArray(resFerias.data) ? resFerias.data : []);
        setProgressoPlanos(Array.isArray(resPlanos.data) ? resPlanos.data : []);
        setUltimaAtualizacao(new Date());
    } catch (error) { console.error(error); } finally { setCarregando(false); }

    try {
        const resAtiv = await api.get(`/dashboard/atividades-hoje?id_usuario=${usuario.id_usuario}&data=${hojeLocal()}`);
        setAtividadesHoje({
            total: resAtiv.data?.total || 0,
            por_equipe: Array.isArray(resAtiv.data?.por_equipe) ? resAtiv.data.por_equipe : []
        });
    } catch (e) { console.error("Erro ao buscar atividades do dia", e); }

    // Atividades de PROJETOS do dia - visão consolidada (todos os projetos,
    // sem isolamento por lotação), mesma lógica da barra de implantação.
    try {
        const resAtivProj = await api.get(`/dashboard/atividades-hoje-projetos?id_usuario=${usuario.id_usuario}&data=${hojeLocal()}`);
        setAtividadesHojeProjetos({
            total: resAtivProj.data?.total || 0,
            por_equipe: Array.isArray(resAtivProj.data?.por_equipe) ? resAtivProj.data.por_equipe : []
        });
    } catch (e) { console.error("Erro ao buscar atividades de projetos do dia", e); }

    carregarNotificacoes();

  }, [totais.projetos, usuario.id_usuario, carregarNotificacoes]);

  useEffect(() => {
    const d = setInterval(() => { if (telaAtual === 'home') atualizarDados(); }, 30000); 
    return () => { clearInterval(d); };
  }, [telaAtual, atualizarDados]);

  useEffect(() => { if (telaAtual === 'home') { atualizarDados(); } }, [telaAtual, atualizarDados]);

  useEffect(() => {
    if (telaAtual !== 'home') return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [telaAtual]);

  const abrirDetalhesPlano = (id) => { setIdPlanoSelecionado(id); setTelaAtual('plano_acao_detalhes'); };
  const abrirPainelEspecifico = (tipo) => { setTipoPainelSelecionado(tipo); setTelaAtual('visualizar_painel'); };
  const abrirRelatorio = (rel) => { setTelaAtual('relatorios', rel !== relRef.current); setRelatorioInicial(rel); };

  const handleAbrirAprovacao = async (notificacao) => {
      setShowNotifications(false);

      // Solicitação de Férias -> abre a tela de Aprovação de Férias (mesma regra de notificação)
      if (notificacao.tipo === 'ferias') {
          setTelaAtual('ferias_aprovacao');
          return;
      }

      setDadosAprovacao(notificacao);
      setPerfilAprovacao(''); 
      
      try {
          const termo = notificacao.cpf || notificacao.nome_completo;
          const res = await api.get(`/usuarios/buscar?termo=${termo}`);
          if (res.data && res.data.length > 0) {
              const userDetalhes = res.data.find(u => u.id_usuario === notificacao.id_usuario);
              if (userDetalhes) {
                  setDadosAprovacao(userDetalhes);
              }
          }
      } catch (e) {
          console.error("Erro ao buscar detalhes do usuário", e);
      }

      setTelaAtual('aprovacao_acesso');
  };

  const handleConfirmarAprovacao = async (e) => {
      e.preventDefault();
      if (!perfilAprovacao) return Swal.fire('Atenção', 'Selecione um perfil de acesso.', 'warning');
      
      try {
          const payload = { 
              id_usuario: dadosAprovacao.id_usuario, 
              perfil: perfilAprovacao 
          };
          await api.post('/usuarios/ativar', payload);
          
          Swal.fire('Sucesso', 'Acesso ativado com sucesso!', 'success');
          setNotificacoes(prev => prev.filter(n => n.id_usuario !== dadosAprovacao.id_usuario));
          setTelaAtual('home');
      } catch (error) {
          console.error(error);
          Swal.fire('Erro', 'Não foi possível ativar o acesso.', 'error');
      }
  };

  const handleRecusarAcesso = async () => {
      const result = await Swal.fire({
          title: 'Recusar Solicitação?',
          text: `Tem certeza que deseja recusar e EXCLUIR o cadastro de ${dadosAprovacao.nome_completo}? Essa ação não pode ser desfeita.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#d32f2f', 
          cancelButtonColor: '#3085d6',
          confirmButtonText: 'Sim, Recusar e Excluir',
          cancelButtonText: 'Cancelar'
      });

      if (result.isConfirmed) {
          try {
              await api.delete(`/usuarios/${dadosAprovacao.id_usuario}`);
              
              Swal.fire('Recusado!', 'A solicitação foi removida do sistema.', 'success');
              
              setNotificacoes(prev => prev.filter(n => n.id_usuario !== dadosAprovacao.id_usuario));
              setTelaAtual('home');
          } catch (error) {
              console.error(error);
              Swal.fire('Erro', 'Erro ao excluir a solicitação. Tente novamente.', 'error');
          }
      }
  };

  const validarRequisitosSenha = (pass) => {
      let score = 0;
      if (pass.length >= 7) score++;
      if (/[A-Z]/.test(pass)) score++;
      if (/[a-z]/.test(pass)) score++;
      if (/[0-9]/.test(pass)) score++;
      if (/[^A-Za-z0-9]/.test(pass)) score++;
      setForcaSenha(score);
      return score === 5;
  };

  const handleSalvarNovaSenha = async (e) => {
      e.preventDefault();
      if (forcaSenha < 5) return Swal.fire('Atenção', 'Senha fraca.', 'warning');
      if (novaSenha !== confirmaSenha) return Swal.fire('Atenção', 'Senhas não conferem.', 'warning');

      try {
          await api.post('/recuperar-senha/confirmar', { id_usuario: usuario.id_usuario, nova_senha: novaSenha });
          Swal.fire('Sucesso', 'Senha alterada!', 'success');
          setNovaSenha(''); setConfirmaSenha(''); setTelaAtual('home');
      } catch (error) {
          Swal.fire('Erro', 'Erro ao alterar a senha.', 'error');
      }
  };

  const formContainerStyle = { width: '100%', flex: 1, padding: 0, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'visible' };
  const formatarNomeCurto = (nome) => { if(!nome) return ''; const partes = nome.split(' '); return partes.length === 1 ? partes[0] : `${partes[0]} ${partes[partes.length - 1]}`; };
  const formatarData = (dataStr) => { if(!dataStr) return ''; const data = new Date(dataStr.split('T')[0] + 'T12:00:00'); return data.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'}); };

  const saudacao = () => { const h = new Date().getHours(); if (h < 12) return 'bom dia'; if (h < 18) return 'boa tarde'; return 'boa noite'; };
  const dataPorExtenso = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const textoAtualizacao = () => {
      const seg = Math.max(0, Math.round((agora - ultimaAtualizacao.getTime()) / 1000));
      if (seg < 60) return `atualizado há ${seg}s`;
      const min = Math.round(seg / 60);
      return `atualizado há ${min}min`;
  };

  const renderHome = () => (
    <div className="oe-home">
      <div className="greeting-bar oe-hero">
          <div className="oe-hero-texto">
              <span className="oe-hero-data">{dataPorExtenso}</span>
              <h1 className="oe-hero-titulo">{saudacao()}, <strong>{nomeExibicao}</strong></h1>
          </div>
          <div className="greeting-status"><span className="status-dot"></span>{textoAtualizacao()}</div>
      </div>

      <div className="big-cards-grid" style={{ marginBottom: '40px' }}>
        
        {/* Determina os dados do primeiro Card com base na função do usuário */}
        {(() => {
            const nomeFuncao = (usuario.nome_funcao || usuario.funcao || usuario.perfil_acesso || '').toUpperCase();
            
            // Regras definidas:
            const isGestor = nomeFuncao.includes('GERENTE') || nomeFuncao.includes('ASSISTENTE') || nomeFuncao.includes('ADMINISTRADOR');
            const isOperador = nomeFuncao.includes('OPERADOR') || nomeFuncao.includes('ANALISTA') || nomeFuncao.includes('LÍDER');
            
            let titulo = 'Implantadores';
            let conteudo = <p className="big-number" style={{ color: 'var(--pine)' }}><Contador valor={totais.implantadores} /></p>;

            if (isGestor) {
                titulo = 'Implantadores / Operadores';
                conteudo = (
                    <div style={{ display: 'flex', gap: '20px', marginTop: '10px' }}>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--pine)', lineHeight: '1' }}><Contador valor={totais.implantadores} /></span>
                            <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', marginTop: '4px' }}>Imp.</div>
                        </div>
                        <div style={{ width: '2px', backgroundColor: '#eee', borderRadius: '2px' }}></div>
                        <div style={{ textAlign: 'center' }}>
                            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--pine-700)', lineHeight: '1' }}><Contador valor={totais.operadores} /></span>
                            <div style={{ fontSize: '0.75rem', color: '#666', textTransform: 'uppercase', marginTop: '4px' }}>Op.</div>
                        </div>
                    </div>
                );
            } else if (isOperador) {
                titulo = 'Operadores';
                conteudo = <p className="big-number" style={{ color: 'var(--pine-700)' }}><Contador valor={totais.operadores} /></p>;
            }

            return (
                <div className="big-card" style={{ borderLeft: `5px solid ${isOperador && !isGestor ? 'var(--pine-700)' : 'var(--pine)'}`, minHeight: '110px' }}>
                    <h3><span className="big-card-icon"><Icon n="hardhat"/></span> {titulo}</h3>
                    {conteudo}
                </div>
            );
        })()}

        <div className="big-card" style={{ borderLeft: '5px solid var(--pine-700)' }}><h3><span className="big-card-icon"><Icon n="folder"/></span> Projetos Ativos</h3><p className="big-number" style={{ color: 'var(--pine-700)' }}><Contador valor={totais.projetos} /></p></div>
        <div className="big-card" style={{ borderLeft: '5px solid var(--brass)' }}><h3><span className="big-card-icon"><Icon n="building"/></span> Unidades Ativas</h3><p className="big-number" style={{ color: 'var(--brass)' }}><Contador valor={totais.unidades} /></p></div>
        <div className="big-card" style={{ borderLeft: '5px solid var(--slate)' }}><h3><span className="big-card-icon"><Icon n="box"/></span> Produtos Vinculados</h3><p className="big-number" style={{ color: 'var(--slate)' }}><Contador valor={totais.produtos} /></p></div>
      </div>

      {/* Barra IMPLANTAÇÃO - visível para todas as funções (quantitativo: só IMPLANTADOR) */}
      <div className="resumo-dia">
            <div className="resumo-dia-main">
                <span className="rd-icon"><Icon n="check"/></span>
                <div>
                    <div className="rd-total"><Contador valor={atividadesHoje.total} /></div>
                    <div className="rd-label">atividades hoje · implantação</div>
                </div>
            </div>
            <div className="resumo-dia-equipes">
                {atividadesHoje.por_equipe.length > 0 ? (
                    atividadesHoje.por_equipe.map((e, idx) => (
                        <div 
                            key={idx} 
                            className="rd-equipe"
                            title={`Implantador: ${e.implantador || 'Não informado'}\nUnidade: ${e.unidade || 'Não informada'}\nMotivo: ${e.motivo || 'Não informado'}`}
                            style={{ cursor: 'help' }}
                        >
                            <span className="rd-equipe-nome">{e.nome}</span>
                            <span className="rd-equipe-num">{e.total}</span>
                        </div>
                    ))
                ) : (
                    <span className="rd-vazio">Nenhuma atividade registrada hoje.</span>
                )}
            </div>
        </div>

      {/* Barra PROJETOS - visível para todas as funções (quantitativo: só OPERADOR/ANALISTA) */}
      <div className="resumo-dia">
            <div className="resumo-dia-main">
                <span className="rd-icon"><Icon n="check"/></span>
                <div>
                    <div className="rd-total"><Contador valor={atividadesHojeProjetos.total} /></div>
                    <div className="rd-label">atividades hoje · projetos</div>
                </div>
            </div>
            <div className="resumo-dia-equipes">
                {atividadesHojeProjetos.por_equipe.length > 0 ? (
                    atividadesHojeProjetos.por_equipe.map((e, idx) => (
                        <div 
                            key={idx} 
                            className="rd-equipe"
                            title={`Implantador: ${e.implantador || 'Não informado'}\nUnidade: ${e.unidade || 'Não informada'}\nMotivo: ${e.motivo || 'Não informado'}`}
                            style={{ cursor: 'help' }}
                        >
                            <span className="rd-equipe-nome">{e.nome}</span>
                            <span className="rd-equipe-num">{e.total}</span>
                        </div>
                    ))
                ) : (
                    <span className="rd-vazio">Nenhuma atividade registrada hoje.</span>
                )}
            </div>
        </div>

      <div className="stats-grid-container">
          {temAcessoMenuFerias() && (
            <div className="stat-column ferias-column">
                <div className="stat-header"><h3><Icon n="umbrella"/> Próximas Férias</h3><span className="stat-badge">{proximasFerias?.length || 0} agendadas</span></div>
                {Array.isArray(proximasFerias) && proximasFerias.length > 0 ? (
                    <div className="ferias-content">
                        <div className="ferias-card-destaque">
                            <div className="ferias-avatar">{formatarNomeCurto(proximasFerias[indiceFerias]?.nome_completo || 'U').charAt(0)}</div>
                            <div className="ferias-info-destaque">
                                <span className="nome">{formatarNomeCurto(proximasFerias[indiceFerias]?.nome_completo || '')}</span>
                                <span className="datas">{formatarData(proximasFerias[indiceFerias]?.data_inicio)} até {formatarData(proximasFerias[indiceFerias]?.data_fim)}</span>
                            </div>
                        </div>
                        <div className="ferias-controls">
                            <button onClick={() => setIndiceFerias(prev => prev > 0 ? prev - 1 : proximasFerias.length - 1)} className="btn-nav-ferias">◀</button>
                            <span className="ferias-contador">Colaborador {indiceFerias + 1} de {proximasFerias.length}</span>
                            <button onClick={() => setIndiceFerias(prev => prev < proximasFerias.length - 1 ? prev + 1 : 0)} className="btn-nav-ferias">▶</button>
                        </div>
                        <div className="ferias-lista-proximos">
                            <p className="lista-titulo">Próximos</p>
                            {proximasFerias?.slice(indiceFerias + 1, indiceFerias + 4).map((f, idx) => (
                                <div key={idx} className="ferias-item-row">
                                    <span className="nome-mini">{formatarNomeCurto(f.nome_completo)}</span><span className="data-mini">{formatarData(f.data_inicio)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (<div className="empty-state">Nenhuma férias programada.</div>)}
            </div>
          )}

          {podeAcessar('plano_acao') && (
            <div className="stat-column planos-column">
                <div className="stat-header"><h3><Icon n="target"/> Status Planos de Ação</h3><span className="stat-badge">{progressoPlanos?.length || 0} em andamento</span></div>
                <div className="planos-list-container">
                    {Array.isArray(progressoPlanos) && progressoPlanos.length > 0 ? (
                        progressoPlanos.map((plano) => (
                            <div key={plano.id_plano} className="plano-card-item">
                                <div className="plano-header-row"><span className="plano-projeto-tag">{plano.nome_projeto}</span><span className="plano-total-tag">Total: {plano.total_unidades} ações.</span></div>
                                <h4 className="plano-titulo-main">{plano.titulo}</h4>
                                <div className="progress-track">
                                    <div className="progress-fill green" style={{width: `${plano.perc_concluido}%`}} title={`${plano.perc_concluido}% Fechado`}></div>
                                    <div className="progress-fill yellow" style={{width: `${plano.perc_andamento}%`}} title={`${plano.perc_andamento}% Em Andamento`}></div>
                                    <div className="progress-fill" style={{width: `${plano.perc_atrasado}%`, backgroundColor: '#d32f2f'}} title={`${plano.perc_atrasado}% Em Atraso`}></div>
                                </div>
                                <div className="plano-stats-row">
                                    <div className="stat-pill green"><span className="dot"></span><strong>{plano.unidades_concluidas}</strong> Fechados ({plano.perc_concluido}%)</div>
                                    <div className="stat-pill yellow"><span className="dot"></span><strong>{plano.unidades_andamento}</strong> Em Andamento ({plano.perc_andamento}%)</div>
                                    <div className="stat-pill" style={{color: '#d32f2f'}}><span className="dot" style={{backgroundColor: '#d32f2f'}}></span><strong>{plano.unidades_atrasadas}</strong> Em Atraso ({plano.perc_atrasado}%)</div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="empty-state-rich">
                            <span className="empty-icon"><Icon n="target"/></span>
                            <p className="empty-title">Nenhum plano ativo</p>
                        </div>
                    )}
                </div>
            </div>
          )}
      </div>
    </div>
  );

  const renderAprovacaoAcesso = () => (
      <div className="oe-tela-form">
          <h2>Aprovação de Acesso</h2>

          <div className="oe-linha">
              <div className="oe-campo" style={{flex: 2}}>
                  <label>Solicitante</label>
                  <input type="text" className="form-control" value={dadosAprovacao?.nome_completo || ''} disabled />
              </div>
              <div className="oe-campo">
                  <label>Data Solicitação</label>
                  <input type="text" className="form-control" value={formatarData(dadosAprovacao?.data_criacao)} disabled />
              </div>
          </div>

          <div className="oe-linha">
              <div className="oe-campo">
                  <label>CPF</label>
                  <input type="text" className="form-control" value={dadosAprovacao?.cpf || ''} disabled />
              </div>
              <div className="oe-campo">
                  <label>Matrícula</label>
                  <input type="text" className="form-control" value={dadosAprovacao?.matricula || ''} disabled />
              </div>
          </div>

          <div className="oe-campo">
              <label>Setor / Função</label>
              <input type="text" className="form-control" value={`${dadosAprovacao?.nome_setor || dadosAprovacao?.setor || ''} - ${dadosAprovacao?.nome_funcao || dadosAprovacao?.funcao || ''}`} disabled />
          </div>

          <div className="oe-campo">
              <label>Perfil de Acesso *</label>
              <select className="form-control" value={perfilAprovacao} onChange={(e) => setPerfilAprovacao(e.target.value)}>
                  <option value="">Selecione...</option>
                  {listaPerfis.map(perfil => (
                      <option key={perfil.id_perfil || perfil.id} value={perfil.nome_perfil || perfil.nome}>{perfil.nome_perfil || perfil.nome}</option>
                  ))}
              </select>
          </div>

          <div className="oe-acoes">
              <button type="button" className="btn-voltar" onClick={voltar}>Cancelar</button>
              <div style={{display:'flex', gap:'10px'}}>
                  <button type="button" className="btn-voltar" onClick={handleRecusarAcesso} style={{color: '#C62828'}}>Recusar</button>
                  <button type="button" className="btn-salvar" onClick={handleConfirmarAprovacao}>Ativar Acesso</button>
              </div>
          </div>
      </div>
  );

  const renderAlterarSenha = () => (
    <form className="oe-tela-form" onSubmit={handleSalvarNovaSenha} style={{maxWidth: '520px'}}>
        <h2>Alterar Senha</h2>
        <div className="oe-campo">
            <label>Nova Senha</label>
            <input type="password" className="form-control" value={novaSenha} onChange={(e) => { setNovaSenha(e.target.value); validarRequisitosSenha(e.target.value); }} required />
            <div className="strength-bar"><div className="strength-fill" style={{ width: `${forcaSenha * 20}%`, backgroundColor: forcaSenha === 5 ? 'var(--pine)' : 'var(--danger)' }}></div></div>
            <small>Mínimo 7 caracteres, com maiúscula, minúscula, número e caractere especial.</small>
        </div>
        <div className="oe-campo">
            <label>Confirmar Senha</label>
            <input type="password" className="form-control" value={confirmaSenha} onChange={(e) => setConfirmaSenha(e.target.value)} required />
        </div>
        <div className="oe-acoes">
            <button type="button" className="btn-voltar" onClick={voltar}>Cancelar</button>
            <button type="submit" className="btn-salvar" disabled={forcaSenha < 5}>Salvar</button>
        </div>
    </form>
  );

  const isCadastroActive = ['form_usuario', 'form_produto', 'form_projeto', 'form_unidade', 'form_regioes', 'form_perfil'].includes(telaAtual);
  const isImplantacaoActive = ['registro_atividades', 'hora_extra', 'escala', 'visualizar_painel', 'ferias_solic_impl'].includes(telaAtual); 
  const isProjetosActive = ['proj_registro', 'proj_hora', 'proj_escala', 'ferias_solic_proj'].includes(telaAtual);
  const isGestaoActive = ['ferias_aprovacao'].includes(telaAtual);
  const isOperacoesActive = isImplantacaoActive || isProjetosActive || isGestaoActive || telaAtual === 'links_externos' || telaAtual === 'sigtap' || telaAtual === 'plano_acao' || telaAtual === 'plano_acao_detalhes' || telaAtual === 'painel_plano_acao';

  const podeAprovarAcesso = ['LÍDER DE PROJETO', 'COORDENADOR DE IMPLANTAÇÃO', 'GERENTE', 'ADMINISTRADOR', 'Líder de Projeto', 'Coordenador de Implantação', 'Gerente', 'Administrador'].some(p => usuario.perfil_acesso?.includes(p) || usuario.funcao?.includes(p));

  return (
    <div className="app-shell">

      {/* BARRA DE NAVEGAÇÃO SUPERIOR */}
      <header className="topbar">
        {/* Logo completa = link para a página principal (Ctrl+clique abre em nova aba) */}
        <a href="/dashboard" className="topbar-brand" title="Página inicial"
          onClick={(e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setTelaAtual('home'); }}>
          <img src={logoWatermark} alt="Opera Echo - página inicial" className="brand-logo-full" />
        </a>

        <nav className="topnav"
          onClick={(e) => { const item = e.target.closest('.dd-link:not(.dd-link-parent)'); const menu = item && item.closest('.topnav-dropdown'); if (menu) { menu.classList.add('recolhido'); menu.addEventListener('mouseleave', () => menu.classList.remove('recolhido'), { once: true }); } }}>
          {temAcessoMenuCadastro() && (
            <div className={`topnav-dropdown ${isCadastroActive ? 'active' : ''}`}>
              <button className="topnav-item"><span className="ti-icon"><Icon n="file"/></span> Cadastro <span className="caret">▾</span></button>
              <div className="dropdown-panel">
                {podeAcessar('usuarios') && <div className="dd-link" onClick={() => setTelaAtual('form_usuario')}><Icon n="users"/> Usuários</div>}
                {podeAcessar('produtos') && <div className="dd-link" onClick={() => setTelaAtual('form_produto')}><Icon n="box"/> Produtos</div>}
                {podeAcessar('projetos') && <div className="dd-link" onClick={() => setTelaAtual('form_projeto')}><Icon n="folder"/> Projetos</div>}
                {podeAcessar('unidades') && <div className="dd-link" onClick={() => setTelaAtual('form_unidade')}><Icon n="building"/> Unidades</div>}
                {podeAcessar('regioes') && <div className="dd-link" onClick={() => setTelaAtual('form_regioes')}><Icon n="map"/> Macro e Micro Regiões</div>}
                {podeAcessar('perfis') && <div className="dd-link" onClick={() => setTelaAtual('form_perfil')}><Icon n="key"/> Perfil de Acesso</div>}
              </div>
            </div>
          )}

          {temAcessoMenuOperacoes() && (
            <div className={`topnav-dropdown ${isOperacoesActive ? 'active' : ''}`}>
              <button className="topnav-item"><span className="ti-icon"><Icon n="tool"/></span> Operações <span className="caret">▾</span></button>
              <div className="dropdown-panel">

                {temAcessoMenuImplantacao() && (
                  <div className="dd-parent">
                    <div className="dd-link dd-link-parent"><span><Icon n="build"/> Implantação</span><span className="dd-caret">›</span></div>
                    <div className="dd-flyout">
                      {podeAcessar('registro_atividades') && <div className="dd-link" onClick={() => setTelaAtual('registro_atividades')}><Icon n="check"/> Registro de Atividades</div>}
                      {podeAcessar('hora_extra') && <div className="dd-link" onClick={() => setTelaAtual('hora_extra')}><Icon n="clock"/> Lançar Hora Extra</div>}
                      {podeAcessar('escala') && <div className="dd-link" onClick={() => setTelaAtual('escala')}><Icon n="calendar"/> Gerador de Escalas</div>}
                      {podeAcessar('ferias_solicitacao') && <div className="dd-link" onClick={() => setTelaAtual('ferias_solic_impl')}><Icon n="umbrella"/> Solicitação de Férias</div>}
                    </div>
                  </div>
                )}

                {temAcessoMenuPaineis() && (
                  <div className="dd-parent">
                    <div className="dd-link dd-link-parent"><span><Icon n="bar-chart"/> Painéis</span><span className="dd-caret">›</span></div>
                    <div className="dd-flyout">
                      {podeAcessar('painel_consolidado') && <div className="dd-link" onClick={() => abrirPainelEspecifico('implatacao_consolidada')}><Icon n="globe"/> Implantações Consolidadas</div>}
                      {podeAcessar('painel_prod_ind') && <div className="dd-link" onClick={() => abrirPainelEspecifico('produtividade')}><Icon n="trend"/> Produtividade Individual</div>}
                      {podeAcessar('painel_prod_uni') && <div className="dd-link" onClick={() => abrirPainelEspecifico('produtos_detalhado')}><Icon n="box"/> Produtividade Por Unidade</div>}
                      {podeAcessar('painel_metricas') && <div className="dd-link" onClick={() => abrirPainelEspecifico('metricas_implantacao')}><Icon n="target"/> Métricas da Implantação</div>}
                      {podeAcessar('painel_plano_acao') && <div className="dd-link" onClick={() => setTelaAtual('painel_plano_acao')}><Icon n="bar-chart"/> Plano de Ação</div>}
                    </div>
                  </div>
                )}

                {temAcessoMenuProjetos() && (
                  <div className="dd-parent">
                    <div className="dd-link dd-link-parent"><span><Icon n="folder"/> Projetos</span><span className="dd-caret">›</span></div>
                    <div className="dd-flyout">
                      {podeAcessar('proj_registro_atividades') && <div className="dd-link" onClick={() => setTelaAtual('proj_registro')}><Icon n="check"/> Registro de Atividades</div>}
                      {podeAcessar('proj_hora_extra') && <div className="dd-link" onClick={() => setTelaAtual('proj_hora')}><Icon n="clock"/> Lançar Hora Extra</div>}
                      {podeAcessar('proj_escala') && <div className="dd-link" onClick={() => setTelaAtual('proj_escala')}><Icon n="calendar"/> Gerador de Escalas</div>}
                      {podeAcessar('proj_ferias_solicitacao') && <div className="dd-link" onClick={() => setTelaAtual('ferias_solic_proj')}><Icon n="umbrella"/> Solicitação de Férias</div>}
                    </div>
                  </div>
                )}

                {temAcessoMenuGestao() && (
                  <div className="dd-parent">
                    <div className="dd-link dd-link-parent"><span><Icon n="folder"/> Gestão</span><span className="dd-caret">›</span></div>
                    <div className="dd-flyout">
                      {podeAcessar('ferias_gestao') && <div className="dd-link" onClick={() => setTelaAtual('ferias_aprovacao')}><Icon n="check"/> Aprovação de Férias</div>}
                    </div>
                  </div>
                )}

                {podeAcessar('plano_acao') && (
                  <div className="dd-parent">
                    <div className="dd-link" onClick={() => setTelaAtual('plano_acao')}><span><Icon n="target"/> Plano de Ação</span></div>
                  </div>
                )}

                {podeAcessar('links_externos') && (
                  <div className="dd-parent">
                    <div className="dd-link" onClick={() => setTelaAtual('links_externos')}><span><Icon n="link"/> Links Externos</span></div>
                  </div>
                )}

                {podeAcessar('sigtap') && (
                  <div className="dd-parent">
                    <div className="dd-link" onClick={() => setTelaAtual('sigtap')}><span><Icon n="stethoscope"/> Consulta SIGTAP</span></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {temAcessoMenuRelatorios() && (
            <div className={`topnav-dropdown ${telaAtual === 'relatorios' ? 'active' : ''}`}>
              <button className="topnav-item"><span className="ti-icon"><Icon n="file"/></span> Relatórios <span className="caret">▾</span></button>
              <div className="dropdown-panel">
                {(podeAcessar('rel_estatisticas') || podeAcessar('rel_estatisticas_projetos') || podeAcessar('rel_tempo_medio') || podeAcessar('rel_plano_acao')) &&<div className="dd-sep">Operação</div>}
                {podeAcessar('rel_estatisticas') && <div className="dd-link" onClick={() => abrirRelatorio('estatistica_atividades')}><Icon n="bar-chart"/> Estatísticas da Implantação</div>}
                {podeAcessar('rel_estatisticas_projetos') && <div className="dd-link" onClick={() => abrirRelatorio('estatistica_projetos')}><Icon n="trend"/> Estatística dos Projetos</div>}
                {podeAcessar('rel_tempo_medio') && <div className="dd-link" onClick={() => abrirRelatorio('tempo_medio_acao')}><Icon n="clock"/> Tempo Médio de Ação</div>}
                {podeAcessar('rel_plano_acao') && <div className="dd-link" onClick={() => abrirRelatorio('plano_acao_status')}><Icon n="target"/> Plano de Ação - Status e Execução</div>}
                {(podeAcessar('rel_auditoria_loc') || podeAcessar('rel_presenca_implantador') || podeAcessar('rel_presenca_equipe')) && <div className="dd-sep">Localização & Presença</div>}
                {podeAcessar('rel_auditoria_loc') && <div className="dd-link" onClick={() => abrirRelatorio('auditoria_localizacao')}><Icon n="pin"/> Auditoria de Localização</div>}
                {podeAcessar('rel_presenca_implantador') && <div className="dd-link" onClick={() => abrirRelatorio('presenca_implantador')}><Icon n="user"/> Presença por Implantador</div>}
                {podeAcessar('rel_presenca_equipe') && <div className="dd-link" onClick={() => abrirRelatorio('presenca_equipe')}><Icon n="users"/> Presença por Equipe</div>}
                {(podeAcessar('rel_projetos_ativos') || podeAcessar('rel_mapa_unidades')) && <div className="dd-sep">Projetos & Unidades</div>}
                {podeAcessar('rel_projetos_ativos') && <div className="dd-link" onClick={() => abrirRelatorio('projetos_ativos')}><Icon n="folder"/> Projetos Ativos</div>}
                {podeAcessar('rel_mapa_unidades') && <div className="dd-link" onClick={() => abrirRelatorio('mapa_unidades')}><Icon n="map"/> Mapa de Unidades</div>}
              </div>
            </div>
          )}

          {podeAcessar('parametros') && (
            <div className={`topnav-dropdown ${telaAtual === 'parametros' ? 'active' : ''}`}>
              <button className="topnav-item" onClick={() => { setAbaParametros(null); setTelaAtual('parametros'); }}><span className="ti-icon"><Icon n="settings"/></span> Parâmetros</button>
            </div>
          )}
        </nav>

        <div className="topbar-right">

          {podeAprovarAcesso && (
            <div style={{position: 'relative'}} ref={notificationRef}>
              <div className="oe-sino" role="button" aria-label="Solicitações" onClick={() => setShowNotifications(!showNotifications)}>
                <Icon n="bell"/>
                {notificacoes.length > 0 && <span className="oe-sino-qtd">{notificacoes.length > 99 ? '99+' : notificacoes.length}</span>}
              </div>
              {showNotifications && (
                <div className="oe-menu-flutuante notif">
                  <div className="oe-menu-titulo">Solicitações ({notificacoes.length})</div>
                  {notificacoes.length > 0 ? (
                    <>
                      {notificacoes.slice(0, 5).map((notif, idx) => (
                        <div key={`${notif.tipo || 'acesso'}-${notif.id_usuario || idx}`} className="oe-menu-item oe-notif" onClick={() => handleAbrirAprovacao(notif)}>
                          <b>{notif.nome_completo}</b>
                          <span>{notif.titulo}</span>
                        </div>
                      ))}
                      {notificacoes.length > 5 && <div className="oe-menu-vazio">+ {notificacoes.length - 5}</div>}
                    </>
                  ) : (
                    <div className="oe-menu-vazio">Nenhuma solicitação.</div>
                  )}
                </div>
              )}
            </div>
          )}

          <div style={{position: 'relative'}} ref={dropdownRef}>
            <div className="oe-usuario" role="button" onClick={() => setShowUserMenu(!showUserMenu)}>
              <div className="oe-usuario-txt">
                <div className="oe-usuario-nome">{nomeExibicao}</div>
                <div className="oe-usuario-perfil">{usuario.perfil_acesso}</div>
              </div>
              <div className="oe-avatar">{nomeExibicao.charAt(0)}</div>
            </div>
            {showUserMenu && (
              <div className="oe-menu-flutuante">
                <div className="oe-menu-item" onClick={() => { setTelaAtual('alterar_senha'); setShowUserMenu(false); }}><Icon n="lock"/> Alterar Senha</div>
                <div className="oe-menu-item info"><Icon n="clock"/> {dataLogin.toLocaleDateString()} {dataLogin.toLocaleTimeString()}</div>
                <div className="oe-menu-div" />
                <div className="oe-menu-item sair" onClick={handleLogout}><Icon n="logout"/> Sair</div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ÁREA DE CONTEÚDO */}
      <main className="app-content">
        {telaAtual === 'home' && renderHome()}
        {telaAtual === 'visualizar_painel' && (<Paineis tipoPainel={tipoPainelSelecionado} usuario={usuario} aoVoltar={voltar} />)}

        {telaAtual === 'form_usuario' && podeAcessar('usuarios') && <CadastroUsuario aoVoltar={voltar} />}
        {telaAtual === 'form_produto' && podeAcessar('produtos') && <CadastroProdutos aoVoltar={voltar} />}
        {telaAtual === 'form_projeto' && podeAcessar('projetos') && <CadastroProjetos aoVoltar={voltar} />}
        {telaAtual === 'form_unidade' && podeAcessar('unidades') && <CadastroUnidades aoVoltar={voltar} />}
        {telaAtual === 'form_regioes' && podeAcessar('regioes') && <CadastroRegioes aoVoltar={voltar} />}
        {telaAtual === 'form_perfil' && podeAcessar('perfis') && <CadastroPerfil aoVoltar={voltar} />}
        {telaAtual === 'parametros' && podeAcessar('parametros') && <Parametros key={abaParametros || 'padrao'} abaInicial={abaParametros} aoVoltar={voltar} />}

        {telaAtual === 'escala' && podeAcessar('escala') && <div style={formContainerStyle}><GeradorEscalas aoVoltar={voltar} /></div>}
        {telaAtual === 'registro_atividades' && podeAcessar('registro_atividades') && <div style={formContainerStyle}><RegistroAtividades aoVoltar={voltar} /></div>}
        {telaAtual === 'hora_extra' && podeAcessar('hora_extra') && <div style={formContainerStyle}><LancamentoHoraExtra aoVoltar={voltar} /></div>}

        {telaAtual === 'proj_registro' && podeAcessar('proj_registro_atividades') && <div style={formContainerStyle}><Projetos tela="proj_registro" lotacaoSel={lotacaoProjSel} setLotacaoSel={setLotacaoProjSel} aoVoltar={voltar} /></div>}
        {telaAtual === 'proj_hora' && podeAcessar('proj_hora_extra') && <div style={formContainerStyle}><Projetos tela="proj_hora" lotacaoSel={lotacaoProjSel} setLotacaoSel={setLotacaoProjSel} aoVoltar={voltar} /></div>}
        {telaAtual === 'proj_escala' && podeAcessar('proj_escala') && <div style={formContainerStyle}><Projetos tela="proj_escala" lotacaoSel={lotacaoProjSel} setLotacaoSel={setLotacaoProjSel} aoVoltar={voltar} /></div>}

        {telaAtual === 'plano_acao' && podeAcessar('plano_acao') && <div style={formContainerStyle}><PlanoAcao aoVoltar={voltar} aoAbrirDetalhes={abrirDetalhesPlano} aoAbrirPainel={() => setTelaAtual('painel_plano_acao')} /></div>}
        {telaAtual === 'painel_plano_acao' && (podeAcessar('painel_plano_acao') || podeAcessar('plano_acao')) && <PainelPlanoAcao modo="interno" aoVoltar={voltar} />}
        {telaAtual === 'plano_acao_detalhes' && podeAcessar('plano_acao') && <div style={formContainerStyle}><PlanoAcaoDetalhes idPlano={idPlanoSelecionado} aoVoltar={voltar} /></div>}

        {telaAtual === 'ferias_solic_impl' && podeAcessar('ferias_solicitacao') && <div style={formContainerStyle}><RegistroFerias modulo="implantacao" aoVoltar={voltar} /></div>}
        {telaAtual === 'ferias_solic_proj' && podeAcessar('proj_ferias_solicitacao') && <div style={formContainerStyle}><Projetos tela="proj_ferias" lotacaoSel={lotacaoProjSel} setLotacaoSel={setLotacaoProjSel} aoVoltar={voltar} /></div>}
        {telaAtual === 'ferias_aprovacao' && podeAcessar('ferias_gestao') && <div style={formContainerStyle}><AprovacaoFerias aoVoltar={voltar} /></div>}
        {telaAtual === 'links_externos' && podeAcessar('links_externos') && <div style={formContainerStyle}><LinksExternos aoVoltar={voltar} /></div>}
        {telaAtual === 'sigtap' && podeAcessar('sigtap') && (
          <div style={formContainerStyle} className="sg-container">
            <SigtapConsulta aoVoltar={voltar}
              aoAbrirImportacao={podeAcessar('parametros') ? () => { setAbaParametros('sigtap'); setTelaAtual('parametros'); } : null} />
          </div>
        )}
        {telaAtual === 'sigtap' && permissoesCarregadas && !podeAcessar('sigtap') && (
          <div style={formContainerStyle}><div className="form-card" style={{ textAlign: 'center', color: '#777' }}>Seu perfil não tem acesso à Consulta SIGTAP. Solicite a liberação em Perfil de Acesso.</div></div>
        )}

        {telaAtual === 'relatorios' && temAcessoMenuRelatorios() && <div style={formContainerStyle}><Relatorios key={relatorioInicial} inicial={relatorioInicial} aoVoltar={voltar} /></div>}

        {/* TELA DE ALTERAR SENHA */}
        {telaAtual === 'alterar_senha' && renderAlterarSenha()}

        {/* TELA DE APROVAÇÃO DE ACESSO */}
        {telaAtual === 'aprovacao_acesso' && renderAprovacaoAcesso()}

      </main>
    </div>
  );
}

export default Dashboard;