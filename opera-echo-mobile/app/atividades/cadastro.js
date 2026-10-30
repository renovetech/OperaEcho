/* ARQUIVO: app/atividades/cadastro.js */
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as DocumentPicker from 'expo-document-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../../src/api';
import { dataISOLocal, useMotivos } from '../../src/cadastros';
import { MODULO, apiBaseDoModulo } from '../../src/escopo';
import { CHAVES, usePermissoes } from '../../src/permissoes';
import { getNomeUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, tipo } from '../../src/tema';
import {
    Botao, Cabecalho, Campo, CampoSeletor, Cartao, Chip, RodapeAcoes, Seletor, SOBREPOSICAO,
    useEspacoInferior
} from '../../src/ui';

const brParaISO = (iso) => {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
};

export default function CadastroAtividade({ modulo: moduloProp }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(110);

  // MÓDULO pela prop do wrapper ou pelos params - sem window.location.
  const modulo = moduloProp || params.modulo || MODULO.IMPLANTACAO;
  const isProjetos = modulo === MODULO.PROJETOS;
  const apiBase = apiBaseDoModulo(modulo);

  // Permissões do módulo (iguais ao web) e motivos cadastrados (/motivos).
  const { podeNovo, podeEditar } = usePermissoes(CHAVES.atividades[modulo]);
  const motivosOpcoes = useMotivos();

  // Lotação escolhida no painel: é ela que trava a tela no módulo Projetos.
  const lotacaoFixa = params.lotacao ? String(params.lotacao) : null;
  const nomeLotacao = params.nome_lotacao || '';

  const formInicial = {
    id_atividade: '',
    data_inicio: dataISOLocal(new Date()),
    data_fim: '',
    redmine: '',
    profissionais_env: '',
    tempo_gasto: '',
    id_projeto: '',
    id_unidade: '',
    motivos_selecionados: [],
    implantadores_ids: [],
    equipe_projeto_ids: [],
    produtos_selecionados: [],
    arquivosNovos: [],
    arquivosAntigos: []
  };

  const [form, setForm] = useState(formInicial);
  const [isEditing, setIsEditing] = useState(false);

  const [datePicker, setDatePicker] = useState({ visivel: false, campo: '' });

  const [projetos, setProjetos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [implantadores, setImplantadores] = useState([]);
  const [profissionaisProjeto, setProfissionaisProjeto] = useState([]);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState([]);

  const [loading, setLoading] = useState(false);
  const [carregandoEquipe, setCarregandoEquipe] = useState(true);
  const [seletor, setSeletor] = useState(null); // 'projeto'|'unidade'|'equipe'|'equipeProjeto'

  const isMotivoApoio = form.motivos_selecionados.includes('Apoio ao Projeto');
  // PARÂMETROS (web > Parâmetros), independentes por módulo: anexo, horas e equipe do Apoio.
  const [regras, setRegras] = useState({ anexo: true, horas: true, equipeApoio: true });
  const isAnexoObrigatorio = regras.anexo && !isMotivoApoio;
  const isHorasObrigatorias = regras.horas;
  const isEquipeApoioObrigatoria = regras.equipeApoio && isMotivoApoio;

  useEffect(() => {
    const sufixo = isProjetos ? 'projetos' : 'implantacao';
    api.get('/parametros')
      .then(r => {
        const ligado = (k) => { const v = r.data?.[`${k}_${sufixo}`]; return v === undefined ? true : (v === '1' || v === 'true'); };
        setRegras({ anexo: ligado('anexo_obrigatorio'), horas: ligado('horas_obrigatorias'), equipeApoio: ligado('equipe_apoio_obrigatoria') });
      })
      .catch(() => {}); // sem resposta: mantém a regra padrão (obrigatório)
  }, [isProjetos]);
  const isMotivoSemProfissionais = form.motivos_selecionados.some(m => ['Visita Técnica'].includes(m));
  const isObrigatorioProfissionais =
      form.motivos_selecionados.some(m => ['Implantação', 'Treinamento'].includes(m)) && !isMotivoSemProfissionais;

  useEffect(() => { if (logado) carregarListasIniciais(); }, [modulo, lotacaoFixa, logado]);

  useEffect(() => {
    if (!params.atividade_json) return;
    try {
      const dados = JSON.parse(params.atividade_json);
      setIsEditing(true);

      const idsEquipe = dados.lista_implantadores?.length
        ? dados.lista_implantadores.map(u => u.id_usuario)
        : (dados.id_implantador ? [dados.id_implantador] : []);

      const idsEquipeProj = dados.lista_equipe_projeto?.length
        ? dados.lista_equipe_projeto.map(u => u.id_usuario) : [];

      let oldFiles = [];
      if (dados.caminho_arquivo) {
        oldFiles = typeof dados.caminho_arquivo === 'string'
          ? dados.caminho_arquivo.split(',').map(c => c.trim()).filter(Boolean)
          : (Array.isArray(dados.caminho_arquivo) ? dados.caminho_arquivo : []);
      }

      const motivosRecuperados = dados.motivos ? dados.motivos.split(', ') : [];

      setForm(prev => ({
        ...prev,
        id_atividade: dados.id_atividade,
        data_inicio: dados.data_inicio ? dados.data_inicio.split('T')[0] : '',
        data_fim: dados.data_fim ? dados.data_fim.split('T')[0] : '',
        redmine: String(dados.redmine || ''),
        profissionais_env: dados.profissionais_env ? String(dados.profissionais_env) : '',
        tempo_gasto: dados.tempo_gasto || '',
        id_projeto: dados.id_projeto ? parseInt(dados.id_projeto) : '',
        id_unidade: dados.id_unidade ? parseInt(dados.id_unidade) : '',
        motivos_selecionados: motivosRecuperados,
        implantadores_ids: idsEquipe,
        equipe_projeto_ids: idsEquipeProj,
        produtos_selecionados: dados.produtos_trabalhados ? dados.produtos_trabalhados.split(', ') : [],
        arquivosAntigos: oldFiles
      }));

      if (dados.id_projeto) {
        carregarUnidadesDoProjeto(dados.id_projeto);
        if (motivosRecuperados.includes('Apoio ao Projeto')) carregarProfissionaisProjeto(dados.id_projeto);
      }
      if (dados.id_unidade) carregarProdutosDaUnidade(dados.id_unidade);
    } catch (e) {
      console.log('Erro ao carregar dados de edição', e?.message);
    }
  }, [params.atividade_json]);

  async function carregarListasIniciais() {
    setCarregandoEquipe(true);

    // Projetos e equipe em PARALELO.
    //    PROJETOS    -> equipe da lotação selecionada
    //    IMPLANTAÇÃO -> o backend decide pela função do usuário logado
    const urlEquipe = (isProjetos && lotacaoFixa) ? `/implantadores?id_projeto=${lotacaoFixa}` : '/implantadores';
    const [pProj, pImp] = [api.get('/projetos'), api.get(urlEquipe)];
    pImp.catch(() => {}); // tratado abaixo; evita aviso de rejeição "não tratada"

    // 1) PROJETOS
    try {
      const resProj = await pProj;
      const bruta = Array.isArray(resProj.data) ? resProj.data : (resProj.data?.dados || []);
      let lista = bruta.filter(p => p.ativo || p.ativo === 1);

      if (isProjetos && lotacaoFixa) {
        lista = lista.filter(p => String(p.id_projeto) === lotacaoFixa);
        if (!params.atividade_json && lista.length > 0) {
          setForm(prev => ({ ...prev, id_projeto: lista[0].id_projeto }));
          carregarUnidadesDoProjeto(lista[0].id_projeto);
        }
      }
      setProjetos(lista);
    } catch (error) { /* lista vazia: o seletor mostra o aviso */ }

    // 2) EQUIPE DA AÇÃO
    try {
      const resImp = await pImp;
      const bruta = Array.isArray(resImp.data) ? resImp.data : (resImp.data?.dados || resImp.data?.usuarios || []);
      const ativos = Array.isArray(bruta)
        ? bruta.filter(u => u.ativo === true || u.ativo === 1 || u.ativo === '1')
        : [];
      setImplantadores(ativos);
      if (isProjetos && lotacaoFixa) setProfissionaisProjeto(ativos);
    } catch (error) {
      setImplantadores([]);
    } finally {
      setCarregandoEquipe(false);
    }
  }

  async function carregarUnidadesDoProjeto(idProjeto) {
    try {
      const res = await api.get(`/unidades/buscar?projeto=${idProjeto}&status=true&limite=1000`);
      const lista = res.data?.dados || res.data || [];
      setUnidades(Array.isArray(lista) ? lista : []);
    } catch (e) { setUnidades([]); }
  }

  async function carregarProdutosDaUnidade(idUnidade) {
    try {
      const res = await api.get(`/unidades/${idUnidade}/produtos`);
      setProdutosDisponiveis(Array.isArray(res.data) ? res.data.filter(p => p.ativo) : []);
    } catch (e) { setProdutosDisponiveis([]); }
  }

  async function carregarProfissionaisProjeto(idProjeto) {
    if (!idProjeto) { setProfissionaisProjeto([]); return; }
    try {
      const res = await api.get(`/implantadores?id_projeto=${idProjeto}`);
      setProfissionaisProjeto(Array.isArray(res.data) ? res.data.filter(u => u.ativo) : []);
    } catch (e) { setProfissionaisProjeto([]); }
  }

  const onChangeDate = (event, selectedDate) => {
    const campo = datePicker.campo;
    setDatePicker({ visivel: false, campo: '' });
    if (event?.type !== 'dismissed' && selectedDate) setForm(prev => ({ ...prev, [campo]: dataISOLocal(selectedDate) }));
  };

  const handleTempoGasto = (text) => {
    // Até 4 dígitos de hora (9999:59); os 2 últimos dígitos são os minutos.
    let v = text.replace(/\D/g, '').slice(0, 6);
    if (v.length >= 3) v = v.slice(0, -2) + ':' + v.slice(-2);
    setForm(prev => ({ ...prev, tempo_gasto: v }));
  };
  // Ao sair do campo completa a hora com zero à esquerda ("8:30" -> "08:30").
  const handleTempoGastoBlur = () => {
    setForm(prev => {
      const t = (prev.tempo_gasto || '').trim();
      return /^\d:\d{2}$/.test(t) ? { ...prev, tempo_gasto: '0' + t } : prev;
    });
  };

  async function selecionarProjeto(proj) {
    setForm(prev => ({
      ...prev, id_projeto: proj.id_projeto, id_unidade: '',
      produtos_selecionados: [], equipe_projeto_ids: []
    }));
    setProdutosDisponiveis([]);
    setUnidades([]);
    setSeletor(null);
    await carregarUnidadesDoProjeto(proj.id_projeto);
    if (isMotivoApoio) await carregarProfissionaisProjeto(proj.id_projeto);
  }

  async function selecionarUnidade(uni) {
    setForm(prev => ({ ...prev, id_unidade: uni.id_unidade, produtos_selecionados: [] }));
    setSeletor(null);
    await carregarProdutosDaUnidade(uni.id_unidade);
  }

  function toggleProduto(nome) {
    setForm(prev => ({
      ...prev,
      produtos_selecionados: prev.produtos_selecionados.includes(nome)
        ? prev.produtos_selecionados.filter(p => p !== nome)
        : [...prev.produtos_selecionados, nome]
    }));
  }

  function toggleMotivo(motivo) {
    setForm(prev => {
      const sel = prev.motivos_selecionados.includes(motivo) ? [] : [motivo];
      return {
        ...prev,
        motivos_selecionados: sel,
        profissionais_env: motivo === 'Visita Técnica' ? '' : prev.profissionais_env,
        equipe_projeto_ids: motivo === 'Apoio ao Projeto' ? prev.equipe_projeto_ids : []
      };
    });
    if (motivo === 'Apoio ao Projeto') {
      if (form.id_projeto) carregarProfissionaisProjeto(form.id_projeto);
    } else if (!isProjetos) {
      setProfissionaisProjeto([]);
    }
  }

  function toggleEquipe(id) {
    setForm(prev => ({
      ...prev,
      implantadores_ids: prev.implantadores_ids.includes(id)
        ? prev.implantadores_ids.filter(x => x !== id)
        : [...prev.implantadores_ids, id]
    }));
  }

  function toggleEquipeProjeto(id) {
    setForm(prev => ({
      ...prev,
      equipe_projeto_ids: prev.equipe_projeto_ids.includes(id)
        ? prev.equipe_projeto_ids.filter(x => x !== id)
        : [...prev.equipe_projeto_ids, id]
    }));
  }

  const selecionarAnexo = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
      if (!result.canceled && result.assets) {
        setForm(prev => ({ ...prev, arquivosNovos: [...prev.arquivosNovos, ...result.assets] }));
      }
    } catch (err) { Alert.alert('Anexos', 'Não foi possível abrir o seletor de arquivos.'); }
  };

  const removerAnexoNovo = (index) => {
    setForm(prev => {
      const nov = [...prev.arquivosNovos];
      nov.splice(index, 1);
      return { ...prev, arquivosNovos: nov };
    });
  };

  const removerAnexoAntigo = (caminho) => {
    setForm(prev => ({ ...prev, arquivosAntigos: prev.arquivosAntigos.filter(c => c !== caminho) }));
  };

  async function handleSalvar() {
    // Mesma trava do web: permissão de criar / editar do módulo.
    if (form.id_atividade && !podeEditar) return Alert.alert('Sem permissão', 'Você não tem permissão para editar atividades.');
    if (!form.id_atividade && !podeNovo) return Alert.alert('Sem permissão', 'Você não tem permissão para criar atividades.');
    if (!form.id_projeto || !form.id_unidade) return Alert.alert('Atenção', 'Selecione Projeto e Unidade.');
    if (form.motivos_selecionados.length === 0) return Alert.alert('Atenção', 'Selecione o motivo.');
    if (form.implantadores_ids.length === 0) return Alert.alert('Atenção', 'Adicione ao menos um membro na Equipe da ação.');

    let tempo = (form.tempo_gasto || '').trim();
    if (/^\d:\d{2}$/.test(tempo)) tempo = '0' + tempo;
    if ((isHorasObrigatorias && !tempo) || (tempo && !/^\d{2,4}:[0-5]\d$/.test(tempo))) return Alert.alert('Atenção', 'Informe o Tempo Gasto válido (hh:mm, minutos de 00 a 59).');
    if (isObrigatorioProfissionais && !form.profissionais_env) return Alert.alert('Atenção', 'Informe a quantidade de profissionais.');
    if (isEquipeApoioObrigatoria && form.equipe_projeto_ids.length === 0) return Alert.alert('Atenção', 'Selecione ao menos um membro na Equipe do Projeto.');
    if (produtosDisponiveis.length > 0 && form.produtos_selecionados.length === 0) {
      return Alert.alert('Atenção', 'Selecione pelo menos um Produto Trabalhado.');
    }
    if (isAnexoObrigatorio && form.arquivosNovos.length === 0 && form.arquivosAntigos.length === 0) {
      return Alert.alert('Atenção', 'É obrigatório anexar ou manter pelo menos um arquivo para este motivo.');
    }
    if (form.data_fim && form.data_fim < form.data_inicio) {
      return Alert.alert('Atenção', 'A Data Fim não pode ser menor que a Data Início.');
    }

    setLoading(true);
    try {
      const formData = new FormData();

      if (form.id_atividade) formData.append('id_atividade', String(form.id_atividade));
      formData.append('data_inicio', form.data_inicio);
      formData.append('data_fim', form.data_fim || form.data_inicio);
      formData.append('implantadores_ids', JSON.stringify(form.implantadores_ids));
      formData.append('equipe_projeto_ids', JSON.stringify(isMotivoApoio ? form.equipe_projeto_ids : []));
      formData.append('motivos', form.motivos_selecionados.join(', '));
      formData.append('produtos_trabalhados', form.produtos_selecionados.join(', '));
      formData.append('redmine', String(form.redmine || ''));
      formData.append('profissionais_env', String(form.profissionais_env || ''));
      formData.append('tempo_gasto', tempo);
      formData.append('id_projeto', String(form.id_projeto));
      formData.append('id_unidade', String(form.id_unidade));
      formData.append('arquivos_antigos_mantidos', form.arquivosAntigos.join(','));
      formData.append('nome_usuario_upload', getNomeUsuario());

      form.arquivosNovos.forEach((file, index) => {
        formData.append('anexos', {
          uri: file.uri,
          type: file.mimeType || 'application/octet-stream',
          name: file.name || `anexo_${index}.bin`
        });
      });

      // Usa a instância do axios: o interceptor injeta o token JWT.
      // (O fetch manual anterior lia api.defaults.headers, onde o token nunca
      //  está - a requisição saía sem Authorization e o backend devolvia 401.)
      // Upload pode ser lento em rede móvel: tempo maior só nesta chamada.
      await api.post(`${apiBase}/atividades/salvar`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: form.arquivosNovos.length ? 120000 : 30000
      });

      Alert.alert('Sucesso', isEditing ? 'Atividade atualizada!' : 'Atividade registrada!', [
        { text: 'OK', onPress: () => router.back() }
      ]);
    } catch (error) {
      let msg;
      if (error?.response) {
        msg = error.response.data?.erro || `O servidor recusou (HTTP ${error.response.status}).`;
      } else if (error?.code === 'ECONNABORTED') {
        msg = 'Tempo esgotado. Verifique sua conexão e tente novamente.';
      } else {
        msg = `Sem resposta do servidor: ${error?.message || 'rede indisponível'}.`;
      }
      Alert.alert('Erro ao salvar', msg);
    } finally {
      setLoading(false);
    }
  }

  const nomeProjeto = projetos.find(p => String(p.id_projeto) === String(form.id_projeto))?.nome_projeto || '';
  const nomeUnidade = unidades.find(u => String(u.id_unidade) === String(form.id_unidade))?.nome_unidade || '';

  const Marcador = ({ id, lista, aoRemover }) => {
    const u = lista.find(x => x.id_usuario === id);
    if (!u) return null;
    return (
      <View style={est.marcador}>
        <View style={est.marcadorAvatar}>
          <Text style={est.marcadorInicial}>{String(u.nome_completo || '?')[0].toUpperCase()}</Text>
        </View>
        <Text style={est.marcadorTexto} numberOfLines={1}>
          {String(u.nome_completo).split(' ')[0]}
        </Text>
        <TouchableOpacity onPress={() => aoRemover(id)} hitSlop={8}>
          <MaterialIcons name="close" size={16} color={cores.erro} />
        </TouchableOpacity>
      </View>
    );
  };

  if (!logado) return null;

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo={isEditing ? 'Editar atividade' : 'Novo registro'}
        subtitulo={isProjetos ? (nomeLotacao || 'Projetos') : 'Implantação'}
        aoVoltar={() => router.back()}
      />

      <KeyboardAvoidingView
        style={est.corpo}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[est.conteudo, { paddingBottom: espacoInferior }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Cartao style={est.bloco}>
            <Text style={est.blocoTitulo}>Período</Text>
            <View style={est.linha}>
              <CampoSeletor
                style={{ flex: 1, marginRight: espaco.sm }}
                rotulo="Data início" obrigatorio
                valor={brParaISO(form.data_inicio)}
                icone="event"
                aoTocar={() => setDatePicker({ visivel: true, campo: 'data_inicio' })}
              />
              <CampoSeletor
                style={{ flex: 1, marginLeft: espaco.sm }}
                rotulo="Data fim"
                valor={brParaISO(form.data_fim)}
                placeholder="Mesmo dia"
                icone="event"
                aoTocar={() => setDatePicker({ visivel: true, campo: 'data_fim' })}
              />
            </View>
          </Cartao>

          <Cartao style={est.bloco}>
            <Text style={est.blocoTitulo}>Local</Text>
            <CampoSeletor
              rotulo="Projeto" obrigatorio
              valor={nomeProjeto}
              placeholder={isProjetos ? (nomeLotacao || 'Lotação') : 'Selecione...'}
              desabilitado={isProjetos && !!lotacaoFixa}
              aoTocar={() => setSeletor('projeto')}
            />
            <CampoSeletor
              rotulo="Unidade" obrigatorio
              valor={nomeUnidade}
              placeholder={form.id_projeto ? 'Selecione...' : 'Selecione o projeto primeiro'}
              desabilitado={!form.id_projeto}
              aoTocar={() => setSeletor('unidade')}
            />

            {produtosDisponiveis.length > 0 && (
              <>
                <Text style={est.rotulo}>Produtos trabalhados <Text style={{ color: cores.erro }}>*</Text></Text>
                <View style={est.chips}>
                  {produtosDisponiveis.map(prod => (
                    <Chip
                      key={prod.id_produto}
                      texto={prod.nome_produto}
                      ativo={form.produtos_selecionados.includes(prod.nome_produto)}
                      aoTocar={() => toggleProduto(prod.nome_produto)}
                      cor={cores.horas}
                      corClara={cores.horasClara}
                    />
                  ))}
                </View>
              </>
            )}
          </Cartao>

          <Cartao style={est.bloco}>
            <Text style={est.blocoTitulo}>Detalhes</Text>
            <Text style={est.rotulo}>Motivo <Text style={{ color: cores.erro }}>*</Text></Text>
            <View style={est.chips}>
              {motivosOpcoes.map(m => (
                <Chip
                  key={m}
                  texto={m}
                  ativo={form.motivos_selecionados.includes(m)}
                  aoTocar={() => toggleMotivo(m)}
                />
              ))}
            </View>

            <View style={est.linha}>
              <Campo
                style={{ flex: 1, marginRight: espaco.sm }}
                rotulo="Tempo gasto" obrigatorio={isHorasObrigatorias}
                keyboardType="numeric" placeholder="hh:mm" maxLength={7}
                value={form.tempo_gasto} onChangeText={handleTempoGasto} onBlur={handleTempoGastoBlur}
              />
              <Campo
                style={{ flex: 1, marginLeft: espaco.sm }}
                rotulo="Redmine"
                keyboardType="numeric" placeholder="Nº"
                value={form.redmine}
                onChangeText={t => setForm(prev => ({ ...prev, redmine: t }))}
              />
            </View>

            <Campo
              rotulo="Profissionais envolvidos"
              obrigatorio={isObrigatorioProfissionais}
              keyboardType="numeric"
              placeholder={isMotivoSemProfissionais ? 'Não se aplica' : 'Quantidade'}
              editable={!isMotivoSemProfissionais}
              value={form.profissionais_env}
              onChangeText={t => setForm(prev => ({ ...prev, profissionais_env: t }))}
              style={{ marginBottom: 0 }}
            />
          </Cartao>

          <Cartao style={est.bloco}>
            <View style={est.blocoLinha}>
              <Text style={est.blocoTitulo}>Equipe da ação <Text style={{ color: cores.erro }}>*</Text></Text>
              <TouchableOpacity style={est.adicionar} onPress={() => setSeletor('equipe')}>
                <MaterialIcons name="person-add-alt" size={18} color={cores.primaria} />
                <Text style={est.adicionarTexto}>Adicionar</Text>
              </TouchableOpacity>
            </View>

            {carregandoEquipe ? (
              <Text style={est.aviso}>Carregando equipe...</Text>
            ) : implantadores.length === 0 ? (
              <Text style={est.aviso}>
                Nenhum membro ativo disponível no seu escopo.
                {isProjetos ? ' Confirme a lotação selecionada no painel.' : ''}
              </Text>
            ) : form.implantadores_ids.length === 0 ? (
              <Text style={est.aviso}>Nenhum membro adicionado. O sistema não inclui você automaticamente.</Text>
            ) : (
              <View style={est.marcadores}>
                {form.implantadores_ids.map(id => (
                  <Marcador key={id} id={id} lista={implantadores} aoRemover={toggleEquipe} />
                ))}
              </View>
            )}
          </Cartao>

          {isMotivoApoio && (
            <Cartao style={est.bloco}>
              <View style={est.blocoLinha}>
                <Text style={est.blocoTitulo}>Equipe do projeto {isEquipeApoioObrigatoria ? <Text style={{ color: cores.erro }}>*</Text> : <Text style={est.opcional}>(opcional)</Text>}</Text>
                <TouchableOpacity
                  style={[est.adicionar, !form.id_projeto && { opacity: 0.4 }]}
                  onPress={() => form.id_projeto && setSeletor('equipeProjeto')}
                  disabled={!form.id_projeto}
                >
                  <MaterialIcons name="engineering" size={18} color={cores.primaria} />
                  <Text style={est.adicionarTexto}>Adicionar</Text>
                </TouchableOpacity>
              </View>

              {form.equipe_projeto_ids.length === 0 ? (
                <Text style={est.aviso}>
                  {!form.id_projeto
                    ? 'Selecione o projeto primeiro.'
                    : (isEquipeApoioObrigatoria ? 'Obrigatório para o motivo "Apoio ao Projeto".' : 'Nenhum membro adicionado.')}
                </Text>
              ) : (
                <View style={est.marcadores}>
                  {form.equipe_projeto_ids.map(id => (
                    <Marcador key={`eqp-${id}`} id={id} lista={profissionaisProjeto} aoRemover={toggleEquipeProjeto} />
                  ))}
                </View>
              )}
            </Cartao>
          )}

          <Cartao style={est.bloco}>
            <Text style={est.blocoTitulo}>
              Anexos {isAnexoObrigatorio ? <Text style={{ color: cores.erro }}>*</Text> : <Text style={est.opcional}>(opcional)</Text>}
            </Text>

            {form.arquivosAntigos.map((arq, i) => (
              <View key={`old-${i}`} style={est.arquivo}>
                <MaterialIcons name="description" size={18} color={cores.textoMedio} />
                <Text style={est.arquivoNome} numberOfLines={1} ellipsizeMode="middle">
                  {String(arq).split('?')[0].split('/').pop()}
                </Text>
                <TouchableOpacity onPress={() => removerAnexoAntigo(arq)} hitSlop={8}>
                  <MaterialIcons name="delete-outline" size={20} color={cores.erro} />
                </TouchableOpacity>
              </View>
            ))}

            {form.arquivosNovos.map((arq, i) => (
              <View key={`new-${i}`} style={[est.arquivo, est.arquivoNovo]}>
                <MaterialIcons name="upload-file" size={18} color={cores.alerta} />
                <Text style={[est.arquivoNome, { color: cores.alerta }]} numberOfLines={1} ellipsizeMode="middle">
                  {arq.name}
                </Text>
                <TouchableOpacity onPress={() => removerAnexoNovo(i)} hitSlop={8}>
                  <MaterialIcons name="close" size={20} color={cores.erro} />
                </TouchableOpacity>
              </View>
            ))}

            <TouchableOpacity style={est.anexar} onPress={selecionarAnexo} activeOpacity={0.75}>
              <MaterialIcons name="attach-file" size={20} color={cores.info} />
              <Text style={est.anexarTexto}>Anexar arquivos</Text>
            </TouchableOpacity>
          </Cartao>
        </ScrollView>
      </KeyboardAvoidingView>

      {(isEditing ? podeEditar : podeNovo) && (
        <RodapeAcoes>
          <Botao
            titulo={isEditing ? 'SALVAR ALTERAÇÕES' : 'SALVAR REGISTRO'}
            icone="check"
            carregando={loading}
            aoTocar={handleSalvar}
            larguraTotal={false}
            style={{ flex: 1 }}
          />
        </RodapeAcoes>
      )}

      {/* SELETORES */}
      <Seletor
        visivel={seletor === 'projeto'} aoFechar={() => setSeletor(null)}
        titulo="Selecione o projeto" dados={projetos}
        campoTexto="nome_projeto" campoId="id_projeto"
        selecionado={form.id_projeto} aoSelecionar={selecionarProjeto}
      />

      <Seletor
        visivel={seletor === 'unidade'} aoFechar={() => setSeletor(null)}
        titulo="Selecione a unidade" dados={unidades}
        campoTexto="nome_unidade" campoId="id_unidade"
        selecionado={form.id_unidade} aoSelecionar={selecionarUnidade}
        vazio="Nenhuma unidade ativa neste projeto."
      />

      <Seletor
        visivel={seletor === 'equipe'} aoFechar={() => setSeletor(null)}
        titulo="Equipe da ação" dados={implantadores}
        campoTexto="nome_completo" campoId="id_usuario"
        multiplo selecionados={form.implantadores_ids}
        aoSelecionar={(item) => toggleEquipe(item.id_usuario)}
        vazio="Nenhum membro ativo encontrado para o seu escopo."
      />

      <Seletor
        visivel={seletor === 'equipeProjeto'} aoFechar={() => setSeletor(null)}
        titulo="Equipe do projeto" dados={profissionaisProjeto}
        campoTexto="nome_completo" campoId="id_usuario"
        multiplo selecionados={form.equipe_projeto_ids}
        aoSelecionar={(item) => toggleEquipeProjeto(item.id_usuario)}
        vazio="Nenhum profissional vinculado a esta lotação."
      />

      {datePicker.visivel && (
        <DateTimePicker
          value={form[datePicker.campo] ? new Date(`${form[datePicker.campo]}T12:00:00`) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onChangeDate}
        />
      )}
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  // O primeiro cartão sobe SOBREPOSICAO px sobre o cabeçalho (padrão de todas as telas).
  corpo: { flex: 1, marginTop: -SOBREPOSICAO },
  conteudo: { paddingHorizontal: espaco.xl, paddingTop: 0 },

  bloco: { marginBottom: espaco.lg },
  blocoTitulo: { ...tipo.subtitulo, color: cores.texto, marginBottom: espaco.lg, fontSize: 16 },
  blocoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.md },
  opcional: { ...tipo.legenda, color: cores.textoFraco, fontWeight: '500' },

  linha: { flexDirection: 'row' },
  rotulo: { ...tipo.legenda, color: cores.textoMedio, fontWeight: '700', marginBottom: espaco.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: espaco.md },

  adicionar: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: espaco.md, paddingVertical: espaco.sm,
    borderRadius: raio.pill, backgroundColor: cores.primariaClara
  },
  adicionarTexto: { ...tipo.legenda, color: cores.primaria, fontWeight: '800' },

  aviso: { ...tipo.legenda, color: cores.textoFraco, lineHeight: 19 },

  marcadores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm },
  marcador: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    backgroundColor: cores.superficieAlt, borderRadius: raio.pill,
    paddingLeft: 4, paddingRight: espaco.md, paddingVertical: 4,
    borderWidth: 1, borderColor: cores.borda, maxWidth: '100%'
  },
  marcadorAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: cores.primaria,
    justifyContent: 'center', alignItems: 'center'
  },
  marcadorInicial: { color: '#FFF', fontWeight: '800', fontSize: 12 },
  marcadorTexto: { ...tipo.legenda, color: cores.texto, fontWeight: '600', flexShrink: 1 },

  arquivo: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    backgroundColor: cores.superficieAlt, borderRadius: raio.md,
    paddingHorizontal: espaco.md, paddingVertical: espaco.md, marginBottom: espaco.sm,
    borderWidth: 1, borderColor: cores.borda
  },
  arquivoNovo: { backgroundColor: cores.alertaClara, borderColor: '#F3DFB8' },
  arquivoNome: { flex: 1, ...tipo.legenda, color: cores.texto },

  anexar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaco.sm,
    height: 52, borderRadius: raio.md, borderWidth: 1.5, borderStyle: 'dashed',
    borderColor: cores.info, backgroundColor: cores.infoClara, marginTop: espaco.sm
  },
  anexarTexto: { ...tipo.corpoForte, color: cores.info }
});