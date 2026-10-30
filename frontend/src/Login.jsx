/* ARQUIVO: src/Login.js */
import React, { useState, useEffect } from 'react';
import api from './api'; 
import { useNavigate } from 'react-router-dom';
import Swal from 'sweetalert2';
import './Login.css';
import { FiEye, FiEyeOff } from 'react-icons/fi';
import { mascaraCelular, celularValido, soDigitos, emailValido } from './celular';
import { VERSAO_SISTEMA } from './versao';

// Imagens servidas a partir da pasta /public
const logo = `/logo.png`;
const imagemTopo = `/imagem_topo.png`;

function Login() {
  const navigate = useNavigate();
  
  // Controle de Telas: 'LOGIN', 'RECUPERAR', 'SOLICITAR', 'PRIMEIRO_ACESSO'
  const [telaAtual, setTelaAtual] = useState('LOGIN');
  
  // --- ESTADOS GERAIS ---
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  // --- ESTADOS LOGIN ---
  const [usuario, setUsuario] = useState(''); 
  const [senha, setSenha] = useState('');

  // --- ESTADOS RECUPERAÇÃO / PRIMEIRO ACESSO ---
  const [recMatricula, setRecMatricula] = useState('');
  const [recUsuario, setRecUsuario] = useState('');
  const [recIdUsuario, setRecIdUsuario] = useState(null);
  // Recuperação por código: 'IDENTIFICAR' -> 'CANAL' -> 'CODIGO' -> nova senha
  const [recEtapa, setRecEtapa] = useState('IDENTIFICAR');
  const [recCanais, setRecCanais] = useState([]);
  const [recCanal, setRecCanal] = useState('');
  const [recDestino, setRecDestino] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [tokenReset, setTokenReset] = useState(null); // autorização curta emitida pelo backend p/ troca de senha
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [forcaSenha, setForcaSenha] = useState(0);

  // --- ESTADOS DE VISIBILIDADE DAS SENHAS ---
  const [visibilidadeSenhas, setVisibilidadeSenhas] = useState({
    login: false,
    novaSenha: false,
    confirmaSenha: false,
  });

  // --- ESTADOS CADASTRO (SOLICITAÇÃO) ---
  const formInicial = {
      nome_completo: '', cpf: '', data_nascimento: '', data_admissao: '',
      sexo: '', celular: '', celular_whatsapp: false, email: '', matricula: '',
      id_setor: '', id_funcao: '',
      id_lotacao: '',
      usuario: '', perfil_acesso: 'Solicitante', ativo: false
  };
  const [formCadastro, setFormCadastro] = useState(formInicial);
  
  const [listaFuncoes, setListaFuncoes] = useState([]);
  const [listaSetores, setListaSetores] = useState([]);
  const [listaLotacoes, setListaLotacoes] = useState([]);

  useEffect(() => {
      if (telaAtual === 'SOLICITAR') {
          carregarListasSolicitacao();
      }
  }, [telaAtual]);

  const carregarListasSolicitacao = async () => {
      try {
          const [resSet, resFun, resProj] = await Promise.all([
              api.get('/setores'),
              api.get('/funcoes'),
              api.get('/projetos')
          ]);
          setListaSetores(resSet.data);
          setListaFuncoes(resFun.data);
          const lotacoes = resProj.data.filter(p => p.ativo && p.gera_lotacao);
          setListaLotacoes(lotacoes);
      } catch (error) {
          console.error("Erro ao carregar listas:", error);
          setErro("Não foi possível carregar as listas de cadastro.");
      }
  };

  // --- LÓGICA DE LOGIN (INTEGRAÇÃO JWT) ---
  const handleLogin = async (e) => {
    e.preventDefault();
    setErro('');
    setCarregando(true);

    try {
      const response = await api.post('/login', { usuario, senha });

      // Backend retorna { trocar_senha: true } se senha é padrão
      if (response.data.trocar_senha) {
          setRecIdUsuario(response.data.id_usuario); 
          setTokenReset(response.data.token_reset || null);
          setTelaAtual('PRIMEIRO_ACESSO'); 
          setCarregando(false);
          
          Swal.fire({
              icon: 'info',
              title: 'Atualização de Segurança',
              text: 'Para sua segurança, é necessário alterar sua senha padrão no primeiro acesso.',
              confirmButtonColor: '#2e7d32'
          });
          return; 
      }

      // Login com sucesso: salva TOKEN + dados do usuário (sem senha)
      const { token, usuario: dadosUsuario } = response.data;
      
      sessionStorage.setItem('token_opera', token);
      sessionStorage.setItem('usuario_opera', JSON.stringify(dadosUsuario));
      navigate('/dashboard');

    } catch (error) {
      setCarregando(false);
      if (error.response) setErro(error.response.data.erro);
      else if (error.code === "ERR_NETWORK") setErro("Erro de Conexão.");
      else setErro("Erro ao tentar realizar login.");
    }
  };

  // --- LÓGICA DE RECUPERAÇÃO E ALTERAÇÃO DE SENHA ---
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

  const reiniciarRecuperacao = () => {
      setRecEtapa('IDENTIFICAR'); setRecCanais([]); setRecCanal(''); setRecDestino(''); setRecCodigo('');
      setRecIdUsuario(null); setTokenReset(null);
  };

  // 1) Login + matrícula -> canais disponíveis (WhatsApp / e-mail, mascarados)
  const handleIdentificar = async (e) => {
      e.preventDefault();
      setCarregando(true);
      setErro('');
      try {
          const res = await api.post('/recuperar-senha/canais', { matricula: recMatricula.trim(), usuario: recUsuario.trim() });
          const canais = res.data.canais || [];
          setRecCanais(canais);
          setRecCanal(canais[0]?.canal || '');
          setRecEtapa('CANAL');
      } catch (error) {
          setErro(error.response?.data?.erro || 'Dados não conferem ou usuário inativo.');
      } finally { setCarregando(false); }
  };

  // 2) Envia o código pelo canal escolhido
  const handleEnviarCodigo = async (e) => {
      if (e) e.preventDefault();
      setCarregando(true);
      setErro('');
      try {
          const res = await api.post('/recuperar-senha/solicitar', { matricula: recMatricula.trim(), usuario: recUsuario.trim(), canal: recCanal });
          setRecDestino(res.data.destino);
          setRecCodigo('');
          setRecEtapa('CODIGO');
      } catch (error) {
          setErro(error.response?.data?.erro || 'Não foi possível enviar o código.');
      } finally { setCarregando(false); }
  };

  // 3) Confere o código -> autorização curta para criar a nova senha
  const handleVerificarCodigo = async (e) => {
      e.preventDefault();
      setCarregando(true);
      setErro('');
      try {
          const res = await api.post('/recuperar-senha/verificar', { matricula: recMatricula.trim(), usuario: recUsuario.trim(), codigo: recCodigo });
          setRecIdUsuario(res.data.id_usuario);
          setTokenReset(res.data.token_reset || null);
      } catch (error) {
          setErro(error.response?.data?.erro || 'Código inválido.');
      } finally { setCarregando(false); }
  };

  const handleAlterarSenha = async (e) => {
      e.preventDefault();
      if (forcaSenha < 5) {
          setErro('A senha não atende aos requisitos de segurança.');
          return;
      }
      if (novaSenha !== confirmaSenha) {
          setErro('As senhas não coincidem.');
          return;
      }

      setCarregando(true);
      try {
          await api.post('/recuperar-senha/confirmar', { token_reset: tokenReset, nova_senha: novaSenha });
          
          Swal.fire({
              icon: 'success',
              title: 'Senha Atualizada!',
              text: 'Sua senha foi alterada com sucesso. Faça login novamente.',
              confirmButtonColor: '#2e7d32'
          });

          setTelaAtual('LOGIN');
          reiniciarRecuperacao();
          setNovaSenha('');
          setConfirmaSenha('');
          setUsuario(''); 
          setSenha('');
      } catch (error) {
          setErro(error.response?.data?.erro || 'Erro ao alterar senha.');
      } finally {
          setCarregando(false);
      }
  };

  // --- LÓGICA DE SOLICITAÇÃO DE ACESSO ---
  const handleChangeCadastro = (e) => {
      const { name, value, type, checked } = e.target;

      if (type === 'checkbox') {
          setFormCadastro(prev => ({ ...prev, [name]: checked }));
      } else if (name === 'celular') {
          setFormCadastro(prev => ({ ...prev, celular: mascaraCelular(value) }));
      } else if (name === 'cpf') {
          const cpfLimpo = value.replace(/\D/g, '');
          setFormCadastro(prev => ({ ...prev, [name]: value, usuario: cpfLimpo }));
      } else if (name === 'nome_completo') {
          setFormCadastro(prev => ({ ...prev, [name]: value.toUpperCase() }));
      } else {
          setFormCadastro(prev => ({ ...prev, [name]: value }));
      }
  };

  const handleSolicitarAcesso = async (e) => {
      e.preventDefault();
      
      if (!formCadastro.nome_completo || !formCadastro.cpf || !formCadastro.matricula || !formCadastro.id_setor || !formCadastro.id_funcao || !formCadastro.data_admissao || formCadastro.id_lotacao === '') {
          setErro("Preencha todos os campos obrigatórios (*)");
          return;
      }
      if (!celularValido(formCadastro.celular)) {
          setErro('Informe um celular válido com DDD e 9 dígitos (ex.: (21) 98765-4321).');
          return;
      }
      if (!emailValido(formCadastro.email)) {
          setErro('E-mail inválido.');
          return;
      }

      setCarregando(true);
      try {
          const idLotacaoFinal = formCadastro.id_lotacao === '0' ? null : parseInt(formCadastro.id_lotacao);

          const payload = { 
              ...formCadastro,
              celular: soDigitos(formCadastro.celular),
              id_setor: parseInt(formCadastro.id_setor),
              id_funcao: parseInt(formCadastro.id_funcao),
              id_lotacao: idLotacaoFinal, 
              senha_hash: 'Eco123', 
              ativo: false, 
              perfil_acesso: 'Solicitante' 
          };

          await api.post('/usuarios/salvar', payload);
          
          Swal.fire({
              icon: 'success',
              title: 'Solicitação Enviada',
              text: 'Seu cadastro foi realizado e está aguardando aprovação na lotação selecionada. Sua senha padrão será "Eco123".',
              confirmButtonColor: '#2e7d32'
          });
          setTelaAtual('LOGIN');
          setFormCadastro(formInicial); 
      } catch (error) {
          console.error("Erro solicitação:", error);
          setErro(error.response?.data?.erro || "Erro ao solicitar acesso. Verifique se o CPF ou Matrícula já existem.");
      } finally {
          setCarregando(false);
      }
  };

  // --- FUNÇÃO PARA ALTERAR A VISIBILIDADE DE UMA SENHA ---
  const toggleVisibilidadeSenha = (campo) => {
    setVisibilidadeSenhas((prev) => ({ ...prev, [campo]: !prev[campo] }));
  };

  // --- RENDERIZADOR DO ÍCONE DO OLHINHO ---
  const renderIconeOlhinho = (visible, onClickHandler) => (
    <div
      onClick={onClickHandler}
      style={{
        position: 'absolute',
        top: '50%',
        right: '10px',
        transform: 'translateY(-50%)',
        cursor: 'pointer',
        color: '#adb5bd',
        fontSize: '1.2rem',
        display: 'flex',
        alignItems: 'center',
        userSelect: 'none'
      }}
    >
      {visible ? <FiEyeOff /> : <FiEye />}
    </div>
  );

  // --- RENDERIZADORES ---

  const renderFormLogin = () => (
    <form onSubmit={handleLogin} className="fade-in">
        <div className="input-group">
            <label>Usuário</label>
            <input type="text" placeholder="Digite seu usuário" value={usuario} onChange={(e) => setUsuario(e.target.value)} disabled={carregando} />
        </div>
        
        {/* Campo de Senha com Olhinho */}
        <div className="input-group">
            <label>Senha</label>
            <div style={{ position: 'relative' }}>
                <input 
                    type={visibilidadeSenhas.login ? 'text' : 'password'} 
                    placeholder="••••••••" 
                    value={senha} 
                    onChange={(e) => setSenha(e.target.value)} 
                    disabled={carregando} 
                    style={{ paddingRight: '40px' }}
                />
                {renderIconeOlhinho(visibilidadeSenhas.login, () => toggleVisibilidadeSenha('login'))}
            </div>
        </div>
        
        <div className="login-actions">
            <span className="link-action" onClick={() => { reiniciarRecuperacao(); setTelaAtual('RECUPERAR'); setErro(''); }}>Esqueci minha senha</span>
        </div>

        <button type="submit" className="btn-login" disabled={carregando}>
            {carregando ? 'AUTENTICANDO...' : 'ACESSAR SISTEMA'}
        </button>

        <div className="divider">ou</div>

        <button type="button" className="btn-secondary" onClick={() => { setTelaAtual('SOLICITAR'); setErro(''); }}>
            Solicitar Acesso (Primeiro Acesso)
        </button>
    </form>
  );

  const voltarAoLogin = () => { reiniciarRecuperacao(); setErro(''); setTelaAtual('LOGIN'); };
  const NOME_CANAL = { WHATSAPP: 'WhatsApp', EMAIL: 'E-mail' };

  const renderFormRecuperar = () => (
    <div className="fade-in">
        {recIdUsuario ? renderFormNovaSenha("Criar Nova Senha") : recEtapa === 'IDENTIFICAR' ? (
            <form onSubmit={handleIdentificar}>
                <h3 className="section-title">Redefinir Senha</h3>
                <p className="sub-text" style={{ marginTop: 0 }}>Vamos enviar um código de confirmação para o seu WhatsApp ou e-mail cadastrado.</p>
                <div className="input-group">
                    <label>Usuário (Login)</label>
                    <input type="text" value={recUsuario} onChange={(e) => setRecUsuario(e.target.value)} required autoComplete="username" />
                </div>
                <div className="input-group">
                    <label>Matrícula</label>
                    <input type="text" value={recMatricula} onChange={(e) => setRecMatricula(e.target.value)} required />
                </div>
                <div className="btn-row">
                    <button type="button" className="btn-secondary" onClick={voltarAoLogin}>Voltar</button>
                    <button type="submit" className="btn-login" disabled={carregando}>{carregando ? 'Verificando...' : 'Continuar'}</button>
                </div>
            </form>
        ) : recEtapa === 'CANAL' ? (
            <form onSubmit={handleEnviarCodigo}>
                <h3 className="section-title">Onde quer receber o código?</h3>
                {recCanais.map(c => (
                    <label key={c.canal} className="input-group" style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 12px', border: `1px solid ${recCanal === c.canal ? '#2e7d32' : '#ced4da'}`, borderRadius: 6, background: recCanal === c.canal ? '#eef6ef' : '#fff' }}>
                        <input type="radio" name="canal" value={c.canal} checked={recCanal === c.canal} onChange={() => setRecCanal(c.canal)} style={{ width: 'auto' }} />
                        <span><strong>{NOME_CANAL[c.canal] || c.canal}</strong><br /><small>{c.destino}</small></span>
                    </label>
                ))}
                <div className="btn-row">
                    <button type="button" className="btn-secondary" onClick={() => { setRecEtapa('IDENTIFICAR'); setErro(''); }}>Voltar</button>
                    <button type="submit" className="btn-login" disabled={carregando || !recCanal}>{carregando ? 'Enviando...' : 'Enviar código'}</button>
                </div>
            </form>
        ) : (
            <form onSubmit={handleVerificarCodigo}>
                <h3 className="section-title">Digite o código</h3>
                <p className="sub-text" style={{ marginTop: 0 }}>
                    Enviamos um código de 6 dígitos por {NOME_CANAL[recCanal] || recCanal} para <strong>{recDestino}</strong>. Ele vale por 10 minutos.
                </p>
                <div className="input-group">
                    <label>Código</label>
                    <input type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={recCodigo}
                        onChange={(e) => setRecCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))} required
                        style={{ letterSpacing: 8, fontSize: '1.4rem', textAlign: 'center' }} />
                </div>
                <div className="login-actions">
                    <span className="link-action" onClick={() => !carregando && handleEnviarCodigo()}>Não recebi - reenviar código</span>
                </div>
                <div className="btn-row">
                    <button type="button" className="btn-secondary" onClick={() => { setRecEtapa('CANAL'); setErro(''); }}>Voltar</button>
                    <button type="submit" className="btn-login" disabled={carregando || recCodigo.length !== 6}>{carregando ? 'Conferindo...' : 'Confirmar'}</button>
                </div>
            </form>
        )}
    </div>
  );

  const renderFormNovaSenha = (titulo) => (
    <form onSubmit={handleAlterarSenha} className="fade-in">
        <h3 className="section-title">{titulo}</h3>
        <div className="requisitos-senha">
            <small>Mínimo 7 caracteres, 1 Maiúscula, 1 Minúscula, 1 Número, 1 Especial (@#$%).</small>
            <div className="strength-bar">
                <div className="strength-fill" style={{ width: `${forcaSenha * 20}%`, backgroundColor: forcaSenha === 5 ? '#2e7d32' : '#d32f2f' }}></div>
            </div>
        </div>
        
        {/* Campo Nova Senha com Olhinho */}
        <div className="input-group">
            <label>Nova Senha</label>
            <div style={{ position: 'relative' }}>
                <input 
                    type={visibilidadeSenhas.novaSenha ? 'text' : 'password'} 
                    value={novaSenha} 
                    onChange={(e) => { setNovaSenha(e.target.value); validarRequisitosSenha(e.target.value); }} 
                    required 
                    style={{ paddingRight: '40px' }}
                />
                {renderIconeOlhinho(visibilidadeSenhas.novaSenha, () => toggleVisibilidadeSenha('novaSenha'))}
            </div>
        </div>
        
        {/* Campo Confirmar Senha com Olhinho */}
        <div className="input-group">
            <label>Confirmar Senha</label>
            <div style={{ position: 'relative' }}>
                <input 
                    type={visibilidadeSenhas.confirmaSenha ? 'text' : 'password'} 
                    value={confirmaSenha} 
                    onChange={(e) => setConfirmaSenha(e.target.value)} 
                    required 
                    style={{ paddingRight: '40px' }}
                />
                {renderIconeOlhinho(visibilidadeSenhas.confirmaSenha, () => toggleVisibilidadeSenha('confirmaSenha'))}
            </div>
        </div>
        
        <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={voltarAoLogin}>Cancelar</button>
            <button type="submit" className="btn-login" disabled={forcaSenha < 5}>Alterar Senha</button>
        </div>
    </form>
  );

  const renderFormSolicitar = () => (
    <form onSubmit={handleSolicitarAcesso} className="fade-in form-scroll">
        <h3 className="section-title">Solicitar Acesso</h3>
        
        <div className="input-group">
            <label>Nome Completo *</label>
            <input type="text" name="nome_completo" value={formCadastro.nome_completo} onChange={handleChangeCadastro} required />
        </div>
        
        <div className="row-inputs">
            <div className="input-group">
                <label>CPF *</label>
                <input type="text" name="cpf" value={formCadastro.cpf} onChange={handleChangeCadastro} placeholder="Apenas números" required />
            </div>
            <div className="input-group">
                <label>Matrícula *</label>
                <input type="text" name="matricula" value={formCadastro.matricula} onChange={handleChangeCadastro} required />
            </div>
        </div>

        <div className="row-inputs">
            <div className="input-group">
                <label>Celular (WhatsApp) *</label>
                <input type="tel" name="celular" value={formCadastro.celular} onChange={handleChangeCadastro} placeholder="(21) 98765-4321" required />
            </div>
            <div className="input-group">
                <label>Data Nasc.</label>
                <input type="date" min="1900-01-01" max="2100-12-31" name="data_nascimento" value={formCadastro.data_nascimento} onChange={handleChangeCadastro} />
            </div>
        </div>


        <div className="row-inputs">
            <div className="input-group">
                <label>Data Admissão *</label>
                <input type="date" min="1900-01-01" max="2100-12-31" name="data_admissao" value={formCadastro.data_admissao} onChange={handleChangeCadastro} required />
            </div>
            <div className="input-group">
                <label>E-mail</label>
                <input type="email" name="email" value={formCadastro.email} onChange={handleChangeCadastro} placeholder="opcional" />
            </div>
        </div>

        <div className="row-inputs">
            <div className="input-group">
                <label>Setor *</label>
                <select 
                    name="id_setor" 
                    className="form-control-select" 
                    value={formCadastro.id_setor} 
                    onChange={handleChangeCadastro} 
                    required 
                    style={{width: '100%', padding: '12px', border: '1px solid #ced4da', borderRadius: '6px', background:'#f8f9fa'}}
                >
                    <option value="">Selecione...</option>
                    {listaSetores.map((s) => (
                        <option key={s.id_setor} value={s.id_setor}>{s.nome_setor}</option>
                    ))}
                </select>
            </div>
            <div className="input-group">
                <label>Função *</label>
                <select 
                    name="id_funcao" 
                    className="form-control-select" 
                    value={formCadastro.id_funcao} 
                    onChange={handleChangeCadastro} 
                    required 
                    style={{width: '100%', padding: '12px', border: '1px solid #ced4da', borderRadius: '6px', background:'#f8f9fa'}}
                >
                    <option value="">Selecione...</option>
                    {listaFuncoes.map((f) => (
                        <option key={f.id_funcao} value={f.id_funcao}>{f.nome_funcao}</option>
                    ))}
                </select>
            </div>
        </div>

        <div className="input-group" style={{marginTop:'5px'}}>
            <label>Lotação (Acesso a Dados) *</label>
            <select 
                name="id_lotacao" 
                className="form-control-select" 
                value={formCadastro.id_lotacao} 
                onChange={handleChangeCadastro} 
                required 
                style={{
                    width: '100%', 
                    padding: '12px', 
                    border: '1px solid #ced4da', 
                    borderRadius: '6px', 
                    backgroundColor: formCadastro.id_lotacao === '0' ? '#e8f5e9' : '#f8f9fa',
                    fontWeight: formCadastro.id_lotacao === '0' ? 'bold' : 'normal',
                    color: formCadastro.id_lotacao === '0' ? '#2e7d32' : '#333'
                }}
            >
                <option value="">Selecione...</option>
                <option value="0">SEDE - GD (Acesso Total)</option>
                {listaLotacoes.map((l) => (
                    <option key={l.id_projeto} value={l.id_projeto}>{l.nome_projeto}</option>
                ))}
            </select>
        </div>

        <div className="input-group">
            <label>Usuário (Automático)</label>
            <input type="text" value={formCadastro.usuario} disabled style={{background: '#eee'}} />
        </div>
        
        <div className="btn-row">
            <button type="button" className="btn-secondary" onClick={() => setTelaAtual('LOGIN')}>Cancelar</button>
            <button type="submit" className="btn-login">Enviar Solicitação</button>
        </div>
    </form>
  );

  return (
    <div className="login-wrapper">
      <div className="login-container">
        <div className="logo-area">
          <img src={logo} alt="Logo Opera Echo" className="login-logo" />
        </div>

        {telaAtual === 'LOGIN' && (
            <>
                <h2 className="welcome-text">Bem-vindo</h2>
                <p className="sub-text">Insira suas credenciais para continuar</p>
            </>
        )}

        {erro && <div className="error-msg">{erro}</div>}
        
        {telaAtual === 'LOGIN' && renderFormLogin()}
        {telaAtual === 'RECUPERAR' && renderFormRecuperar()}
        {telaAtual === 'PRIMEIRO_ACESSO' && renderFormNovaSenha("Atualização Obrigatória")}
        {telaAtual === 'SOLICITAR' && renderFormSolicitar()}

        <div className="login-footer">
            <p>OPERA ECHO MANAGEMENT SYSTEM</p>
            <p className="version-tag">BUILD: {VERSAO_SISTEMA}</p>
        </div>
      </div>

      <div className="login-showcase">
        <img src={imagemTopo} alt="ECO Sistemas - Soluções para Gestão em Saúde" className="showcase-img" />
        {/* Adição da Marca D'água */}
        <img src={logo} alt="Marca D'água" className="showcase-watermark" />
      </div>
    </div>
  );
}

export default Login;