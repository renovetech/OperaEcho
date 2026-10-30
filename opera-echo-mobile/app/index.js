/* ARQUIVO: app/index.js - Login */
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../src/api';
import {
    aparelhoTemBiometria, ativarBiometria, desativarBiometria, lerCredenciais, usuarioComBiometria
} from '../src/biometria';
import { iniciarRastreioBackground, obterPosicaoRapida } from '../src/geo';
import { limparCachePermissoes } from '../src/permissoes';
import { limparSessao, salvarSessao } from '../src/sessao';
import { cores } from '../src/tema';
import { VERSAO_DO_APP, linkDownloadConfiavel, verificarAtualizacao } from '../src/versao';

const LOCATION_TASK_NAME = 'BACKGROUND_LOCATION_TASK';

/* Tarefa de localização em segundo plano. SEGURANÇA: a versão anterior lia a
   SENHA salva a cada disparo e escrevia usuário + coordenadas no log do
   aparelho (logcat). Agora só guarda a última posição em memória. */
if (Platform.OS !== 'web') {
    TaskManager.defineTask(LOCATION_TASK_NAME, async () => { /* posição consumida pelo geo.js */ });
}

/* Mensagem amigável a partir do erro do axios - sem despejar o JSON do servidor. */
function mensagemDeErro(error) {
    if (error?.response) {
        const status = error.response.status;
        if (status === 429) return error.response.data?.erro || 'Muitas tentativas. Aguarde alguns minutos.';
        return error.response.data?.erro || `O servidor recusou a solicitação (HTTP ${status}).`;
    }
    if (error?.code === 'ECONNABORTED') return 'O servidor demorou a responder. Verifique sua conexão e tente novamente.';
    if (error?.request) return 'O celular não conseguiu alcançar o servidor.';
    return 'Ocorreu um erro inesperado.';
}

export default function LoginScreen() {
  const router = useRouter();

  // --- CONTROLE DE TELAS ('LOGIN', 'RECUPERAR', 'PRIMEIRO_ACESSO') ---
  const [telaAtual, setTelaAtual] = useState('LOGIN');

  // --- ESTADOS DE LOGIN ---
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [usuarioBio, setUsuarioBio] = useState(null); // login com biometria ativa neste aparelho

  // --- ESTADOS DE RECUPERAÇÃO / NOVA SENHA ---
  const [recMatricula, setRecMatricula] = useState('');
  const [recUsuario, setRecUsuario] = useState('');
  const [recIdUsuario, setRecIdUsuario] = useState(null);
  const [recEtapa, setRecEtapa] = useState('IDENTIFICAR');
  const [recCanais, setRecCanais] = useState([]);
  const [recCanal, setRecCanal] = useState('');
  const [recDestino, setRecDestino] = useState('');
  const [recCodigo, setRecCodigo] = useState('');
  const [tokenReset, setTokenReset] = useState(null); // autorização curta p/ troca de senha
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [forcaSenha, setForcaSenha] = useState(0);
  const [showNovaSenha, setShowNovaSenha] = useState(false);
  const [showConfirmaSenha, setShowConfirmaSenha] = useState(false);
  const [erro, setErro] = useState('');

  // --- ATUALIZAÇÃO DO APP ---
  // A permissão de localização é OBRIGATÓRIA e já foi validada pelo GeoGate
  // (app/_layout.js) antes desta tela ser montada.
  const [updateInfo, setUpdateInfo] = useState(null);

  useEffect(() => {
    limparSessao();
    limparCachePermissoes();
    verificarAtualizacao().then(info => { if (info) setUpdateInfo(info); });
    iniciarRastreioBackground(LOCATION_TASK_NAME);
    prepararBiometria();
  }, []);

  async function prepararBiometria() {
    const [temBio, login] = await Promise.all([aparelhoTemBiometria(), usuarioComBiometria()]);
    setUsuarioBio(temBio && login ? login : null);
  }

  function handleDownloadUpdate() {
      if (!linkDownloadConfiavel(updateInfo?.link_download)) {
          return Alert.alert('Atualização', 'Link de download inválido. Procure o suporte.');
      }
      Linking.openURL(updateInfo.link_download)
          .catch(() => Alert.alert('Erro', 'Não foi possível abrir o link.'));
  }

  /* Autentica no backend. Retorna 'OK' | 'TROCAR_SENHA'. Lança erro do axios. */
  async function autenticar(login, senhaDigitada) {
      // Não espera o GPS: usa a posição já conhecida (no máximo ~1,5 s).
      const coords = await obterPosicaoRapida(1500);
      const response = await api.post('/login', {
          usuario: login,
          senha: senhaDigitada,
          latitude: coords?.latitude,
          longitude: coords?.longitude
      }, { timeout: 15000 });

      // Se o backend pedir para trocar a senha (senha padrão)
      if (response.data.trocar_senha) {
          setRecIdUsuario(response.data.id_usuario);
          setTokenReset(response.data.token_reset || null);
          return 'TROCAR_SENHA';
      }

      // Guarda o token JWT + usuário. Sem isso as requisições saem sem
      // "Authorization" e o backend bloqueia tudo (listas vazias).
      await salvarSessao({ token: response.data.token, usuario: response.data.usuario || {} });
      limparCachePermissoes();
      return 'OK';
  }

  function irParaPainel() {
      router.replace('/dashboard');
  }

  // --- LÓGICA DE LOGIN ---
  async function handleLogin() {
    const login = usuario.trim();
    if (!login || !senha) return Alert.alert('Atenção', 'Preencha usuário e senha.');
    setLoading(true);
    setErro('');

    try {
      const resultado = await autenticar(login, senha);
      if (resultado === 'TROCAR_SENHA') {
          setTelaAtual('PRIMEIRO_ACESSO');
          Alert.alert('Atualização de Segurança', 'Para sua segurança, é necessário alterar sua senha padrão no primeiro acesso.');
          return;
      }

      // Biometria é OPCIONAL: oferece só se o aparelho suporta e ainda não está ativa para este login.
      const temBio = await aparelhoTemBiometria();
      if (temBio && usuarioBio !== login) {
          const senhaAtual = senha;
          setSenha('');
          Alert.alert(
              'Entrar com biometria?',
              'Nos próximos acessos você poderá entrar com sua digital ou reconhecimento facial. A senha fica protegida no cofre do aparelho.',
              [
                  { text: 'Agora não', style: 'cancel', onPress: irParaPainel },
                  { text: 'Ativar', onPress: async () => { await ativarBiometria(login, senhaAtual); irParaPainel(); } }
              ],
              { cancelable: false }
          );
          return;
      }
      setSenha('');
      irParaPainel();
    } catch (error) {
      setErro(mensagemDeErro(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLoginBiometrico() {
    setErro('');
    // O sistema operacional exibe o prompt biométrico ao ler o cofre.
    const cred = await lerCredenciais();
    if (!cred) {
        await prepararBiometria();
        return; // cancelado ou chave invalidada (biometria do aparelho mudou)
    }
    setLoading(true);
    try {
        const resultado = await autenticar(cred.usuario, cred.senha);
        if (resultado === 'TROCAR_SENHA') {
            await desativarBiometria();
            setUsuarioBio(null);
            setTelaAtual('PRIMEIRO_ACESSO');
            return;
        }
        irParaPainel();
    } catch (error) {
        if (error?.response?.status === 401) {
            // Senha mudou: a credencial guardada não serve mais - apaga.
            await desativarBiometria();
            setUsuarioBio(null);
            setErro('Sua senha mudou. Entre com usuário e senha para reativar a biometria.');
        } else {
            setErro(mensagemDeErro(error));
        }
    } finally {
        setLoading(false);
    }
  }

  // --- LÓGICA DE RECUPERAÇÃO / ALTERAÇÃO DE SENHA ---
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

  // Recuperação por código (WhatsApp ou e-mail): IDENTIFICAR -> CANAL -> CODIGO -> nova senha
  const dadosRec = () => ({ matricula: recMatricula.trim(), usuario: recUsuario.trim() });

  const handleIdentificar = async () => {
    if (!recUsuario || !recMatricula) return setErro('Preencha Usuário e Matrícula.');
    setLoading(true);
    setErro('');
    try {
        const res = await api.post('/recuperar-senha/canais', dadosRec());
        const canais = res.data.canais || [];
        setRecCanais(canais);
        setRecCanal(canais[0]?.canal || '');
        setRecEtapa('CANAL');
    } catch (error) {
        setErro(error?.response?.data?.erro || mensagemDeErro(error));
    } finally {
        setLoading(false);
    }
  };

  const handleEnviarCodigo = async () => {
    setLoading(true);
    setErro('');
    try {
        const res = await api.post('/recuperar-senha/solicitar', { ...dadosRec(), canal: recCanal });
        setRecDestino(res.data.destino);
        setRecCodigo('');
        setRecEtapa('CODIGO');
    } catch (error) {
        setErro(error?.response?.data?.erro || mensagemDeErro(error));
    } finally {
        setLoading(false);
    }
  };

  const handleVerificarCodigo = async () => {
    if (recCodigo.length !== 6) return setErro('Informe o código de 6 dígitos.');
    setLoading(true);
    setErro('');
    try {
        const res = await api.post('/recuperar-senha/verificar', { ...dadosRec(), codigo: recCodigo });
        setRecIdUsuario(res.data.id_usuario);
        setTokenReset(res.data.token_reset || null);
    } catch (error) {
        setErro(error?.response?.data?.erro || mensagemDeErro(error));
    } finally {
        setLoading(false);
    }
  };

  const handleAlterarSenha = async () => {
    if (forcaSenha < 5) return setErro('A senha não atende aos requisitos de segurança.');
    if (novaSenha !== confirmaSenha) return setErro('As senhas não coincidem.');

    setLoading(true);
    setErro('');
    try {
        await api.post('/recuperar-senha/confirmar', { token_reset: tokenReset, nova_senha: novaSenha });
        await desativarBiometria(); // a senha antiga guardada deixa de valer
        setUsuarioBio(null);
        Alert.alert('Senha Atualizada!', 'Sua senha foi alterada com sucesso. Faça login novamente.');
        voltarParaLogin();
    } catch (error) {
        setErro(error?.response?.data?.erro || 'Erro ao alterar senha.');
    } finally {
        setLoading(false);
    }
  };

  const voltarParaLogin = () => {
      setTelaAtual('LOGIN');
      setRecIdUsuario(null);
      setTokenReset(null);
      setNovaSenha('');
      setConfirmaSenha('');
      setForcaSenha(0);
      setRecUsuario('');
      setRecMatricula('');
      setRecEtapa('IDENTIFICAR');
      setRecCanais([]);
      setRecCanal('');
      setRecDestino('');
      setRecCodigo('');
      setErro('');
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

        <View style={styles.logoContainer}>
            <Image source={require('../assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
        </View>

        <View style={styles.card}>

          {telaAtual === 'LOGIN' && (
              <>
                  <Text style={styles.welcomeText}>Bem-vindo</Text>
                  <Text style={styles.subtitleText}>Insira suas credenciais para continuar</Text>

                  {erro ? <Text style={styles.errorText}>{erro}</Text> : null}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Usuário</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Digite seu usuário"
                        placeholderTextColor="#999"
                        value={usuario}
                        onChangeText={setUsuario}
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="username"
                        textContentType="username"
                        editable={!loading}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Senha</Text>
                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.inputPassword}
                            placeholder="********"
                            placeholderTextColor="#999"
                            value={senha}
                            onChangeText={setSenha}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="password"
                            textContentType="password"
                            onSubmitEditing={handleLogin}
                            returnKeyType="go"
                            editable={!loading}
                        />
                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                            <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                    <TouchableOpacity style={styles.forgotPasswordBox} onPress={() => { setTelaAtual('RECUPERAR'); setErro(''); }}>
                        <Text style={styles.forgotPasswordText}>Esqueci minha senha</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                    {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>ACESSAR SISTEMA</Text>}
                  </TouchableOpacity>

                  {usuarioBio && (
                      <TouchableOpacity style={styles.bioButton} onPress={handleLoginBiometrico} disabled={loading}>
                          <MaterialIcons name="fingerprint" size={32} color={cores.primaria} />
                          <Text style={styles.bioText}>Entrar com Biometria</Text>
                      </TouchableOpacity>
                  )}
              </>
          )}

          {telaAtual === 'RECUPERAR' && !recIdUsuario && recEtapa === 'CANAL' && (
              <>
                  <Text style={styles.sectionTitle}>Onde quer receber o código?</Text>
                  {erro ? <Text style={styles.errorText}>{erro}</Text> : null}
                  {recCanais.map(c => (
                      <TouchableOpacity key={c.canal} onPress={() => setRecCanal(c.canal)} disabled={loading}
                          style={[styles.input, { flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderColor: recCanal === c.canal ? cores.primaria : '#ddd', borderWidth: recCanal === c.canal ? 2 : 1 }]}>
                          <MaterialIcons name={recCanal === c.canal ? 'radio-button-checked' : 'radio-button-unchecked'} size={22} color={cores.primaria} />
                          <View style={{ marginLeft: 10 }}>
                              <Text style={{ fontWeight: 'bold', color: '#333' }}>{c.canal === 'WHATSAPP' ? 'WhatsApp' : 'E-mail'}</Text>
                              <Text style={{ color: '#666' }}>{c.destino}</Text>
                          </View>
                      </TouchableOpacity>
                  ))}
                  <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.outlineButton, { flex: 1, marginRight: 10 }]} onPress={() => { setRecEtapa('IDENTIFICAR'); setErro(''); }} disabled={loading}>
                          <Text style={styles.outlineButtonText}>Voltar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { flex: 1, marginTop: 0 }]} onPress={handleEnviarCodigo} disabled={loading || !recCanal}>
                          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Enviar código</Text>}
                      </TouchableOpacity>
                  </View>
              </>
          )}

          {telaAtual === 'RECUPERAR' && !recIdUsuario && recEtapa === 'CODIGO' && (
              <>
                  <Text style={styles.sectionTitle}>Digite o código</Text>
                  <Text style={styles.helperText}>Enviamos um código de 6 dígitos por {recCanal === 'WHATSAPP' ? 'WhatsApp' : 'e-mail'} para {recDestino}. Ele vale por 10 minutos.</Text>
                  {erro ? <Text style={styles.errorText}>{erro}</Text> : null}
                  <View style={styles.inputContainer}>
                    <TextInput
                        style={[styles.input, { fontSize: 24, letterSpacing: 8, textAlign: 'center' }]}
                        value={recCodigo}
                        onChangeText={(t) => setRecCodigo(t.replace(/\D/g, '').slice(0, 6))}
                        keyboardType="number-pad"
                        autoComplete="sms-otp"
                        textContentType="oneTimeCode"
                        maxLength={6}
                        editable={!loading}
                    />
                  </View>
                  <TouchableOpacity style={styles.forgotPasswordBox} onPress={handleEnviarCodigo} disabled={loading}>
                      <Text style={styles.forgotPasswordText}>Não recebi - reenviar código</Text>
                  </TouchableOpacity>
                  <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.outlineButton, { flex: 1, marginRight: 10 }]} onPress={() => { setRecEtapa('CANAL'); setErro(''); }} disabled={loading}>
                          <Text style={styles.outlineButtonText}>Voltar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { flex: 1, marginTop: 0 }]} onPress={handleVerificarCodigo} disabled={loading || recCodigo.length !== 6}>
                          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Confirmar</Text>}
                      </TouchableOpacity>
                  </View>
              </>
          )}

          {telaAtual === 'RECUPERAR' && !recIdUsuario && recEtapa === 'IDENTIFICAR' && (
              <>
                  <Text style={styles.sectionTitle}>Redefinir Senha</Text>
                  <Text style={styles.helperText}>Vamos enviar um código de confirmação para o seu WhatsApp ou e-mail cadastrado.</Text>

                  {erro ? <Text style={styles.errorText}>{erro}</Text> : null}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Usuário (Login)</Text>
                    <TextInput
                        style={styles.input}
                        value={recUsuario}
                        onChangeText={setRecUsuario}
                        autoCapitalize="none"
                        autoCorrect={false}
                        editable={!loading}
                    />
                  </View>
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Matrícula</Text>
                    <TextInput
                        style={styles.input}
                        value={recMatricula}
                        onChangeText={setRecMatricula}
                        keyboardType="numeric"
                        editable={!loading}
                    />
                  </View>
                  <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.outlineButton, { flex: 1, marginRight: 10 }]} onPress={voltarParaLogin} disabled={loading}>
                          <Text style={styles.outlineButtonText}>Voltar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { flex: 1, marginTop: 0 }]} onPress={handleIdentificar} disabled={loading}>
                          {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Continuar</Text>}
                      </TouchableOpacity>
                  </View>
              </>
          )}

          {(telaAtual === 'PRIMEIRO_ACESSO' || (telaAtual === 'RECUPERAR' && recIdUsuario)) && (
              <>
                  <Text style={styles.sectionTitle}>{telaAtual === 'PRIMEIRO_ACESSO' ? 'Atualização Obrigatória' : 'Criar Nova Senha'}</Text>
                  <Text style={styles.helperText}>Mínimo 7 caracteres, 1 Maiúscula, 1 Minúscula, 1 Número, 1 Especial (@#$%).</Text>

                  <View style={styles.strengthBarContainer}>
                      <View style={[styles.strengthFill, { width: `${forcaSenha * 20}%`, backgroundColor: forcaSenha === 5 ? '#2e7d32' : '#d32f2f' }]} />
                  </View>

                  {erro ? <Text style={styles.errorText}>{erro}</Text> : null}

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Nova Senha</Text>
                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.inputPassword}
                            value={novaSenha}
                            onChangeText={(val) => { setNovaSenha(val); validarRequisitosSenha(val); }}
                            secureTextEntry={!showNovaSenha}
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="newPassword"
                            editable={!loading}
                        />
                        <TouchableOpacity onPress={() => setShowNovaSenha(!showNovaSenha)} style={styles.eyeIcon}>
                            <Ionicons name={showNovaSenha ? 'eye-off' : 'eye'} size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Confirmar Senha</Text>
                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.inputPassword}
                            value={confirmaSenha}
                            onChangeText={setConfirmaSenha}
                            secureTextEntry={!showConfirmaSenha}
                            autoCapitalize="none"
                            autoCorrect={false}
                            textContentType="newPassword"
                            editable={!loading}
                        />
                        <TouchableOpacity onPress={() => setShowConfirmaSenha(!showConfirmaSenha)} style={styles.eyeIcon}>
                            <Ionicons name={showConfirmaSenha ? 'eye-off' : 'eye'} size={24} color="#666" />
                        </TouchableOpacity>
                    </View>
                  </View>

                  <View style={styles.btnRow}>
                      <TouchableOpacity style={[styles.outlineButton, { flex: 1, marginRight: 10 }]} onPress={voltarParaLogin} disabled={loading}>
                          <Text style={styles.outlineButtonText}>Cancelar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { flex: 1, marginTop: 0 }, forcaSenha < 5 && { backgroundColor: '#ccc' }]} onPress={handleAlterarSenha} disabled={loading || forcaSenha < 5}>
                           {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.buttonText}>Alterar</Text>}
                      </TouchableOpacity>
                  </View>
              </>
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>OPERA ECHO MANAGEMENT SYSTEM</Text>
            <Text style={styles.versionText}>BUILD: {VERSAO_DO_APP}</Text>
          </View>
        </View>
      </ScrollView>

      {/* MODAL DE ATUALIZAÇÃO */}
      <Modal
          visible={!!updateInfo}
          transparent
          animationType="fade"
          onRequestClose={() => { if (!updateInfo?.obrigatorio) setUpdateInfo(null); }}
      >
          <View style={styles.updateOverlay}>
              <View style={styles.updateCard}>
                  <MaterialIcons name="system-update" size={60} color={cores.primaria} />
                  <Text style={styles.updateTitle}>Atualização Disponível!</Text>
                  <Text style={styles.updateMessage}>{updateInfo?.mensagem || 'Uma nova versão do app está disponível.'}</Text>
                  <TouchableOpacity style={styles.button} onPress={handleDownloadUpdate}>
                      <Text style={styles.buttonText}>BAIXAR NOVA VERSÃO</Text>
                  </TouchableOpacity>
                  {!updateInfo?.obrigatorio && (
                      <TouchableOpacity style={{ marginTop: 15, padding: 10 }} onPress={() => setUpdateInfo(null)}>
                          <Text style={{ color: '#999', fontWeight: 'bold' }}>Lembrar mais tarde</Text>
                      </TouchableOpacity>
                  )}
              </View>
          </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20, paddingTop: 48 },

  logoContainer: { alignItems: 'center', marginBottom: 10, width: '100%' },
  logoImage: { width: 280, height: 140 },

  card: { width: '100%', maxWidth: 400, backgroundColor: '#FFFFFF', paddingHorizontal: 15 },
  welcomeText: { fontSize: 28, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center', marginBottom: 5 },
  subtitleText: { fontSize: 14, color: '#777', textAlign: 'center', marginBottom: 20 },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center', marginBottom: 15 },

  inputContainer: { marginBottom: 15 },
  label: { fontSize: 13, color: '#333', marginBottom: 8, fontWeight: '600' },
  input: { backgroundColor: '#FAFAFA', height: 50, borderRadius: 10, paddingHorizontal: 15, borderWidth: 1, borderColor: '#EBEBEB', fontSize: 15, color: '#333' },

  passwordContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#EBEBEB' },
  inputPassword: { flex: 1, paddingHorizontal: 15, fontSize: 15, color: '#333', height: '100%' },
  eyeIcon: { padding: 10 },

  forgotPasswordBox: { alignSelf: 'flex-end', marginTop: 8 },
  forgotPasswordText: { color: cores.primaria, fontSize: 13, fontWeight: '600' },

  button: { backgroundColor: cores.primaria, height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 10, width: '100%' },
  buttonText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },

  btnRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  outlineButton: { backgroundColor: '#FFF', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ccc' },
  outlineButtonText: { color: '#555', fontSize: 15, fontWeight: 'bold' },

  bioButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 15, gap: 10, marginTop: 10 },
  bioText: { color: cores.primaria, fontWeight: 'bold', fontSize: 14 },

  errorText: { color: '#d32f2f', fontSize: 14, textAlign: 'center', marginBottom: 15, backgroundColor: '#ffebee', padding: 10, borderRadius: 8, overflow: 'hidden' },
  helperText: { fontSize: 11, color: '#666', textAlign: 'center', marginBottom: 5 },
  strengthBarContainer: { height: 6, backgroundColor: '#e0e0e0', borderRadius: 3, marginBottom: 15, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 3 },

  footer: { alignItems: 'center', marginTop: 40, paddingTop: 15 },
  footerText: { fontSize: 10, color: '#999', fontWeight: '600', letterSpacing: 0.5 },
  versionText: { fontSize: 10, color: '#AAA', marginTop: 4, letterSpacing: 0.5 },

  updateOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  updateCard: { width: '85%', backgroundColor: '#FFF', borderRadius: 16, padding: 25, alignItems: 'center', elevation: 10 },
  updateTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginTop: 15, marginBottom: 10, textAlign: 'center' },
  updateMessage: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 25, lineHeight: 22 }
});
