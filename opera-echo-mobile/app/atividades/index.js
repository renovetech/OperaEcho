/* ARQUIVO: app/atividades/index.js */
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../../src/api';
import { dataISOLocal, formatarPeriodo, useMotivos } from '../../src/cadastros';
import { MODULO, apiBaseDoModulo } from '../../src/escopo';
import { registrarRastreio } from '../../src/geo';
import { CHAVES, usePermissoes } from '../../src/permissoes';
import { getNomeUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, sombra, tipo } from '../../src/tema';
import {
    Botao, BotaoFlutuante, Cabecalho, Carregando, Cartao,
    CampoSeletor, Etiqueta, FolhaInferior, LinhaDeslizavel, Seletor, SOBREPOSICAO,
    useEspacoInferior, Vazio
} from '../../src/ui';

const LIMITE = 20;

const CORES_MOTIVO = {
    'Implantação':      { cor: '#17864B', fundo: '#E6F5EC' },
    'Treinamento':      { cor: '#0F6FCF', fundo: '#E7F1FC' },
    'Visita Técnica':   { cor: '#C77700', fundo: '#FFF6E5' },
    'Apoio ao Projeto': { cor: '#7B2FBE', fundo: '#F3E8FB' }
};

const formatarBr = (iso) => iso ? iso.split('T')[0].split('-').reverse().join('/') : '';

const FILTROS_VAZIOS = { dataInicio: '', dataFim: '', id_projeto: '', id_unidade: '', motivo: '', id_implantador: '' };

export default function ListaAtividades({ modulo: moduloProp }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(110);

  // MÓDULO: vem da prop (wrapper de /projetos) ou dos params.
  const modulo = moduloProp || params.modulo || MODULO.IMPLANTACAO;
  const isProjetos = modulo === MODULO.PROJETOS;
  const apiBase = apiBaseDoModulo(modulo);

  // Lotação escolhida no painel - é ela que isola a tela no módulo Projetos.
  const lotacaoFixa = params.lotacao ? String(params.lotacao) : null;
  const nomeLotacao = params.nome_lotacao || '';

  // Permissões do módulo (iguais às do web): registro_atividades / proj_registro_atividades.
  const { podeNovo, podeEditar } = usePermissoes(CHAVES.atividades[modulo]);
  const motivos = useMotivos();

  const [atividades, setAtividades] = useState([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [totalPaginas, setTotalPaginas] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [filtroTexto, setFiltroTexto] = useState('');
  const [filtros, setFiltros] = useState({ ...FILTROS_VAZIOS, id_projeto: isProjetos && lotacaoFixa ? lotacaoFixa : '' });

  // Refs: a busca sempre lê os filtros atuais e descarta respostas atrasadas.
  const filtrosRef = useRef(filtros);
  const textoRef = useRef(filtroTexto);
  const reqId = useRef(0);
  useEffect(() => { filtrosRef.current = filtros; }, [filtros]);
  useEffect(() => { textoRef.current = filtroTexto; }, [filtroTexto]);

  const [painelFiltro, setPainelFiltro] = useState(false);
  const [seletor, setSeletor] = useState(null); // 'projeto' | 'unidade' | 'motivo' | 'implantador'

  const [projetos, setProjetos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [implantadores, setImplantadores] = useState([]);

  const [datePicker, setDatePicker] = useState({ visivel: false, campo: '' });

  useEffect(() => { if (logado) carregarListas(); }, [modulo, lotacaoFixa, logado]);

  // Recarrega ao entrar e ao voltar da tela de cadastro/edição.
  //
  useFocusEffect(
    useCallback(() => {
      if (logado) buscarAtividades(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [modulo, lotacaoFixa, logado])
  );

  async function carregarListas() {
    const [resProj, resImp] = await Promise.allSettled([
        api.get('/projetos'),
        api.get(isProjetos && lotacaoFixa ? `/implantadores?id_projeto=${lotacaoFixa}` : '/implantadores')
    ]);
    if (resProj.status === 'fulfilled') {
        const bruta = Array.isArray(resProj.value.data) ? resProj.value.data : (resProj.value.data?.dados || []);
        let lista = bruta.filter(p => p.ativo);
        if (isProjetos && lotacaoFixa) lista = lista.filter(p => String(p.id_projeto) === lotacaoFixa);
        setProjetos(lista);
    }
    if (resImp.status === 'fulfilled') {
        const bruta = Array.isArray(resImp.value.data) ? resImp.value.data : (resImp.value.data?.dados || []);
        setImplantadores(bruta.filter(u => u.ativo));
    }
    if (isProjetos && lotacaoFixa) carregarUnidades(lotacaoFixa);
  }

  async function carregarUnidades(idProj) {
      if (!idProj) { setUnidades([]); return; }
      try {
          const res = await api.get(`/unidades/buscar?projeto=${idProj}&status=true&limite=1000`);
          const lista = res.data?.dados || res.data || [];
          setUnidades(Array.isArray(lista) ? lista : []);
      } catch (e) { setUnidades([]); }
  }

  async function buscarAtividades(novaPagina = 1) {
    const meuId = ++reqId.current;
    if (novaPagina === 1) { if (!refreshing) setCarregando(true); }
    else setCarregandoMais(true);

    try {
      const f = filtrosRef.current;
      const texto = (textoRef.current || '').trim();

      const q = { pagina: novaPagina, limite: LIMITE };
      if (f.dataInicio) q.dataInicio = f.dataInicio;
      if (f.dataFim) q.dataFim = f.dataFim;
      if (f.id_unidade) q.id_unidade = f.id_unidade;
      if (f.motivo) q.motivo = f.motivo;
      // MÓDULO IMPLANTAÇÃO: visão consolidada, igual ao web (o backend aplica
      // a restrição por lotação para Analista/Líder/Operador). O filtro por
      // colaborador é opcional e disponível a todos.
      if (f.id_implantador) q.id_implantador = f.id_implantador;
      // Trava o projeto na lotação quando estiver no módulo Projetos.
      const proj = (isProjetos && lotacaoFixa) ? lotacaoFixa : f.id_projeto;
      if (proj) q.id_projeto = proj;
      if (texto) q.termo = texto;

      const query = new URLSearchParams(q).toString();
      const res = await api.get(`${apiBase}/atividades/buscar?${query}`);
      if (meuId !== reqId.current) return; // resposta atrasada de uma busca anterior

      const dados = res.data?.dados || [];
      setTotal(res.data?.total || 0);
      setTotalPaginas(res.data?.totalPaginas || 1);
      setPagina(novaPagina);
      setAtividades(prev => novaPagina === 1 ? dados : [...prev, ...dados]);
    } catch (error) {
      if (meuId === reqId.current && novaPagina === 1 && error?.response?.status !== 401) {
          Alert.alert('Atividades', 'Não foi possível carregar os registros. Puxe para atualizar.');
      }
    } finally {
      if (meuId === reqId.current) {
          setCarregando(false);
          setCarregandoMais(false);
          setRefreshing(false);
      }
    }
  }

  // Só pede a próxima página se ela existir.
  function carregarMais() {
      if (carregando || carregandoMais || pagina >= totalPaginas) return;
      buscarAtividades(pagina + 1);
  }

  function aplicarFiltros() { setPainelFiltro(false); buscarAtividades(1); }

  function limparFiltros() {
      const vazio = { ...FILTROS_VAZIOS, id_projeto: isProjetos && lotacaoFixa ? lotacaoFixa : '' };
      setFiltroTexto(''); textoRef.current = '';
      setFiltros(vazio); filtrosRef.current = vazio;
      if (!isProjetos) setUnidades([]);
      setPainelFiltro(false);
      buscarAtividades(1);
  }

  const rotaCadastro = isProjetos ? '/projetos/atividades/cadastro' : '/atividades/cadastro';
  const paramsBase = { modulo, lotacao: lotacaoFixa || '', nome_lotacao: nomeLotacao };

  function handleNovo() {
      if (!podeNovo) return Alert.alert('Sem permissão', 'Você não tem permissão para criar atividades.');
      router.push({ pathname: rotaCadastro, params: paramsBase });
  }

  function handleEditar(item) {
      if (!podeEditar) return Alert.alert('Sem permissão', 'Você não tem permissão para editar atividades.');
      router.push({ pathname: rotaCadastro, params: { ...paramsBase, atividade_json: JSON.stringify(item) } });
  }

  function handleExcluir(item) {
      if (!podeEditar) return Alert.alert('Sem permissão', 'Você não tem permissão para excluir atividades.');
      Alert.alert('Excluir registro', 'Esta ação não pode ser desfeita. Confirma?', [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Excluir', style: 'destructive',
            onPress: async () => {
                try {
                    await api.delete(`${apiBase}/atividades/${item.id_atividade}`);
                    // Auditoria igual ao web (não segura a tela esperando GPS).
                    registrarRastreio(api, {
                        usuario: getNomeUsuario(),
                        tipo_registro: 'EXCLUSAO_ATIVIDADE',
                        detalhes_registro: `[EXCLUÍDO] Data: ${formatarPeriodo(item.data_inicio, item.data_fim)} | Proj: ${item.nome_projeto} | Uni: ${item.nome_unidade} | Motivo: ${item.motivos}`
                    });
                    setAtividades(prev => prev.filter(a => a.id_atividade !== item.id_atividade));
                    setTotal(t => Math.max(0, t - 1));
                } catch (e) {
                    Alert.alert('Erro', e?.response?.data?.erro || 'Falha ao excluir.');
                }
            }
          }
      ]);
  }

  const onDateChange = (event, selectedDate) => {
    const campo = datePicker.campo;
    setDatePicker({ visivel: false, campo: '' });
    if (event?.type !== 'dismissed' && selectedDate) setFiltros(prev => ({ ...prev, [campo]: dataISOLocal(selectedDate) }));
  };

  const baixarAnexo = (caminho) => {
      const base = api.defaults.baseURL || '';
      const link = caminho.startsWith('http') ? caminho : `${base}/${caminho}`;
      Linking.openURL(link).catch(() => Alert.alert('Erro', 'Não foi possível abrir o anexo.'));
  };

  const filtrosAtivos = Object.entries(filtros)
      .filter(([k, v]) => v && !(isProjetos && k === 'id_projeto')).length;

  const renderItem = ({ item }) => {
    const motivo = item.motivos?.split(', ')[0] || 'Geral';
    const paleta = CORES_MOTIVO[motivo] || { cor: cores.textoMedio, fundo: cores.superficieAlt };

    let anexos = [];
    if (item.caminho_arquivo) {
        anexos = typeof item.caminho_arquivo === 'string'
            ? item.caminho_arquivo.split(',').map(c => c.trim()).filter(Boolean)
            : (Array.isArray(item.caminho_arquivo) ? item.caminho_arquivo : []);
    }

    const equipe = item.lista_implantadores?.length
        ? item.lista_implantadores.map(u => String(u.nome_completo).split(' ')[0]).join(', ')
        : (item.nome_implantador ? String(item.nome_implantador).split(' ')[0] : '-');

    const cartao = (
        <Cartao style={est.card} aoTocar={podeEditar ? () => handleEditar(item) : undefined}>
            <View style={[est.faixa, { backgroundColor: paleta.cor }]} />

            <View style={est.cardTopo}>
                <View style={est.dataCaixa}>
                    <MaterialIcons name="event" size={14} color={cores.textoFraco} />
                    <Text style={est.dataTexto}>{formatarPeriodo(item.data_inicio, item.data_fim)}</Text>
                </View>
                <Etiqueta texto={motivo} cor={paleta.cor} fundo={paleta.fundo} />
            </View>

            <Text style={est.projeto} numberOfLines={1}>{item.nome_projeto || '-'}</Text>
            <Text style={est.unidade} numberOfLines={2}>{item.nome_unidade || '-'}</Text>

            {anexos.length > 0 && (
                <View style={est.anexos}>
                    {anexos.map((c, i) => (
                        <TouchableOpacity key={i} style={est.anexo} onPress={() => baixarAnexo(c)}>
                            <MaterialIcons name="attach-file" size={14} color={cores.info} />
                            <Text style={est.anexoTexto}>Anexo {i + 1}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <View style={est.rodape}>
                <MaterialIcons name="group" size={15} color={cores.textoFraco} />
                <Text style={est.rodapeTexto} numberOfLines={1}>{equipe}</Text>
                {item.tempo_gasto ? (
                    <>
                        <View style={est.ponto} />
                        <MaterialIcons name="schedule" size={15} color={cores.textoFraco} />
                        <Text style={est.rodapeTexto}>{item.tempo_gasto}</Text>
                    </>
                ) : null}
            </View>
        </Cartao>
    );

    if (!podeEditar) return <View style={{ marginBottom: espaco.md }}>{cartao}</View>;

    return (
      <LinhaDeslizavel
        acoes={[
            { icone: 'edit', rotulo: 'Editar', cor: cores.info, aoTocar: () => handleEditar(item) },
            { icone: 'delete', rotulo: 'Excluir', cor: cores.erro, aoTocar: () => handleExcluir(item) }
        ]}
      >
        {cartao}
      </LinhaDeslizavel>
    );
  };

  if (!logado) return null;

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo="Atividades"
        subtitulo={isProjetos ? (nomeLotacao || 'Projetos') : 'Implantação'}
        aoVoltar={() => router.back()}
      />

      <View style={est.buscaLinha}>
          <View style={est.busca}>
              <MaterialIcons name="search" size={20} color={cores.textoFraco} />
              <TextInput
                  style={est.buscaInput}
                  placeholder="Buscar colaborador, unidade, motivo..."
                  placeholderTextColor={cores.textoFraco}
                  value={filtroTexto}
                  onChangeText={setFiltroTexto}
                  onSubmitEditing={() => buscarAtividades(1)}
                  returnKeyType="search"
              />
              {filtroTexto.length > 0 && (
                  <TouchableOpacity onPress={() => { setFiltroTexto(''); textoRef.current = ''; buscarAtividades(1); }} hitSlop={8}>
                      <MaterialIcons name="close" size={18} color={cores.textoFraco} />
                  </TouchableOpacity>
              )}
          </View>
          <TouchableOpacity style={est.filtroBtn} onPress={() => setPainelFiltro(true)}>
              <MaterialIcons name="tune" size={22} color="#FFF" />
              {filtrosAtivos > 0 && (
                  <View style={est.filtroBadge}>
                      <Text style={est.filtroBadgeTexto}>{filtrosAtivos}</Text>
                  </View>
              )}
          </TouchableOpacity>
      </View>

      {carregando && !refreshing ? (
          <Carregando texto="Carregando atividades..." />
      ) : (
          <FlatList
              data={atividades}
              keyExtractor={(item) => String(item.id_atividade)}
              renderItem={renderItem}
              contentContainerStyle={[est.lista, { paddingBottom: espacoInferior }]}
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); buscarAtividades(1); }}
              onEndReached={carregarMais}
              onEndReachedThreshold={0.3}
              initialNumToRender={8}
              windowSize={7}
              removeClippedSubviews={Platform.OS === 'android'}
              showsVerticalScrollIndicator={false}
              ListHeaderComponent={
                  atividades.length > 0 ? (
                      <Text style={est.dica}>
                          {total} registro{total === 1 ? '' : 's'}
                          {podeEditar ? ' · deslize para a esquerda para editar ou excluir' : ''}
                      </Text>
                  ) : null
              }
              ListFooterComponent={carregandoMais ? <ActivityIndicator color={cores.primaria} style={{ marginVertical: espaco.lg }} /> : null}
              ListEmptyComponent={
                  <Vazio
                      icone="assignment"
                      texto="Nenhuma atividade encontrada"
                      sub={podeNovo ? 'Ajuste os filtros ou toque em + para criar um novo registro.' : 'Ajuste os filtros de busca.'}
                  />
              }
          />
      )}

      {podeNovo && <BotaoFlutuante icone="add" rotulo="Novo" aoTocar={handleNovo} />}

      {/* PAINEL DE FILTROS */}
      <FolhaInferior visivel={painelFiltro} aoFechar={() => setPainelFiltro(false)} titulo="Filtros" altura="86%">
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={est.linhaDupla}>
                  <CampoSeletor
                      style={{ flex: 1, marginRight: espaco.sm }}
                      rotulo="Data início"
                      valor={filtros.dataInicio ? formatarBr(filtros.dataInicio) : ''}
                      placeholder="dd/mm/aaaa"
                      icone="event"
                      aoTocar={() => setDatePicker({ visivel: true, campo: 'dataInicio' })}
                  />
                  <CampoSeletor
                      style={{ flex: 1, marginLeft: espaco.sm }}
                      rotulo="Data fim"
                      valor={filtros.dataFim ? formatarBr(filtros.dataFim) : ''}
                      placeholder="dd/mm/aaaa"
                      icone="event"
                      aoTocar={() => setDatePicker({ visivel: true, campo: 'dataFim' })}
                  />
              </View>

              <CampoSeletor
                  rotulo="Projeto"
                  valor={projetos.find(p => String(p.id_projeto) === String(filtros.id_projeto))?.nome_projeto || ''}
                  placeholder={isProjetos ? nomeLotacao || 'Lotação fixa' : 'Todos'}
                  desabilitado={isProjetos}
                  aoTocar={() => setSeletor('projeto')}
              />

              <CampoSeletor
                  rotulo="Unidade"
                  valor={unidades.find(u => String(u.id_unidade) === String(filtros.id_unidade))?.nome_unidade || ''}
                  placeholder={filtros.id_projeto ? 'Todas' : 'Selecione o projeto primeiro'}
                  desabilitado={!filtros.id_projeto}
                  aoTocar={() => setSeletor('unidade')}
              />

              <CampoSeletor
                  rotulo="Motivo"
                  valor={filtros.motivo}
                  placeholder="Todos"
                  aoTocar={() => setSeletor('motivo')}
              />

              <CampoSeletor
                  rotulo="Colaborador"
                  valor={implantadores.find(u => String(u.id_usuario) === String(filtros.id_implantador))?.nome_completo || ''}
                  placeholder="Todos"
                  aoTocar={() => setSeletor('implantador')}
              />

              <View style={est.acoesFiltro}>
                  <Botao titulo="Limpar" variante="secundario" aoTocar={limparFiltros} style={{ flex: 1, marginRight: espaco.sm }} larguraTotal={false} />
                  <Botao titulo="Aplicar" aoTocar={aplicarFiltros} style={{ flex: 1, marginLeft: espaco.sm }} larguraTotal={false} />
              </View>
          </ScrollView>
      </FolhaInferior>

      <Seletor
        visivel={seletor === 'projeto'}
        aoFechar={() => setSeletor(null)}
        titulo="Selecione o projeto"
        dados={projetos}
        campoTexto="nome_projeto"
        campoId="id_projeto"
        selecionado={filtros.id_projeto}
        aoSelecionar={(item) => {
            setFiltros(prev => ({ ...prev, id_projeto: String(item.id_projeto), id_unidade: '' }));
            carregarUnidades(item.id_projeto);
            setSeletor(null);
        }}
      />

      <Seletor
        visivel={seletor === 'unidade'}
        aoFechar={() => setSeletor(null)}
        titulo="Selecione a unidade"
        dados={unidades}
        campoTexto="nome_unidade"
        campoId="id_unidade"
        selecionado={filtros.id_unidade}
        aoSelecionar={(item) => {
            setFiltros(prev => ({ ...prev, id_unidade: String(item.id_unidade) }));
            setSeletor(null);
        }}
      />

      <Seletor
        visivel={seletor === 'motivo'}
        aoFechar={() => setSeletor(null)}
        titulo="Selecione o motivo"
        dados={motivos.map(m => ({ id: m, nome: m }))}
        campoTexto="nome"
        campoId="id"
        selecionado={filtros.motivo}
        aoSelecionar={(item) => {
            setFiltros(prev => ({ ...prev, motivo: item.nome }));
            setSeletor(null);
        }}
      />

      <Seletor
        visivel={seletor === 'implantador'}
        aoFechar={() => setSeletor(null)}
        titulo="Selecione o colaborador"
        dados={implantadores}
        campoTexto="nome_completo"
        campoId="id_usuario"
        selecionado={filtros.id_implantador}
        aoSelecionar={(item) => {
            setFiltros(prev => ({ ...prev, id_implantador: String(item.id_usuario) }));
            setSeletor(null);
        }}
        vazio="Nenhum colaborador no seu escopo."
      />

      {datePicker.visivel && (
          <DateTimePicker
              value={filtros[datePicker.campo] ? new Date(`${filtros[datePicker.campo]}T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onDateChange}
          />
      )}
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },

  buscaLinha: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.md,
    paddingHorizontal: espaco.xl, marginTop: -SOBREPOSICAO, marginBottom: espaco.md
  },
  busca: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    height: 52, borderRadius: raio.md, backgroundColor: cores.superficie,
    paddingHorizontal: espaco.lg, ...sombra.leve
  },
  buscaInput: { flex: 1, ...tipo.corpo, color: cores.texto, paddingVertical: 0 },
  filtroBtn: {
    width: 52, height: 52, borderRadius: raio.md, backgroundColor: cores.primaria,
    justifyContent: 'center', alignItems: 'center', ...sombra.leve
  },
  filtroBadge: {
    position: 'absolute', top: -3, right: -3, minWidth: 20, height: 20, borderRadius: 10,
    backgroundColor: cores.erro, justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: cores.fundo, paddingHorizontal: 4
  },
  filtroBadgeTexto: { color: '#FFF', fontSize: 10, fontWeight: '800' },

  lista: { paddingHorizontal: espaco.xl, paddingTop: espaco.sm },
  dica: { ...tipo.legenda, color: cores.textoFraco, textAlign: 'center', marginBottom: espaco.md, fontSize: 12 },

  card: { paddingLeft: espaco.xl, overflow: 'hidden' },
  faixa: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },
  cardTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.sm, gap: espaco.sm },
  dataCaixa: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
  dataTexto: { ...tipo.legenda, color: cores.textoMedio, fontWeight: '700' },

  projeto: { ...tipo.subtitulo, color: cores.texto, fontSize: 16 },
  unidade: { ...tipo.legenda, color: cores.textoMedio, marginTop: 2, lineHeight: 19 },

  anexos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.md },
  anexo: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: cores.infoClara, paddingHorizontal: espaco.md, paddingVertical: 6,
    borderRadius: raio.pill
  },
  anexoTexto: { fontSize: 12, color: cores.info, fontWeight: '700' },

  rodape: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: espaco.md,
    paddingTop: espaco.md, borderTopWidth: 1, borderTopColor: cores.borda
  },
  rodapeTexto: { ...tipo.legenda, color: cores.textoMedio, flexShrink: 1 },
  ponto: { width: 3, height: 3, borderRadius: 2, backgroundColor: cores.bordaForte, marginHorizontal: espaco.sm },

  linhaDupla: { flexDirection: 'row' },
  acoesFiltro: { flexDirection: 'row', marginTop: espaco.sm, marginBottom: espaco.xl }
});
