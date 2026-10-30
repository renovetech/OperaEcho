/* ARQUIVO: app/ferias/index.js */
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    FlatList,
    RefreshControl,
    StyleSheet,
    Text,
    View
} from 'react-native';
import api from '../../src/api';
import { MODULO } from '../../src/escopo';
import { CHAVES, usePermissoes } from '../../src/permissoes';
import { getIdUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, sombra, tipo } from '../../src/tema';
import {
    BotaoFlutuante, Cabecalho, Carregando, Cartao, Etiqueta, SOBREPOSICAO,
    useEspacoInferior, Vazio
} from '../../src/ui';

const STATUS = {
    APROVADO: { rotulo: 'Aprovado',   cor: cores.sucesso, fundo: cores.sucessoClara, icone: 'check-circle' },
    RECUSADO: { rotulo: 'Recusado',   cor: cores.erro,    fundo: cores.erroClara,    icone: 'cancel' },
    PENDENTE: { rotulo: 'Em Análise', cor: cores.alerta,  fundo: cores.alertaClara,  icone: 'schedule' }
};

const formatarBr = (dt) => dt ? dt.split('T')[0].split('-').reverse().join('/') : '-';

const diasEntre = (ini, fim) => {
    if (!ini || !fim) return null;
    const a = new Date(ini.split('T')[0]);
    const b = new Date(fim.split('T')[0]);
    return Math.round((b - a) / 86400000) + 1;
};

export default function ListaFerias() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(110);

  // Tela pessoal (não existe /projetos/ferias). O módulo só define a
  // permissão, igual ao web: ferias_solicitacao / proj_ferias_solicitacao.
  const modulo = params.modulo === MODULO.PROJETOS ? MODULO.PROJETOS : MODULO.IMPLANTACAO;
  const idUsuarioLogado = getIdUsuario();
  const perm = usePermissoes(CHAVES.ferias[modulo]);
  const podeNovo = modulo === MODULO.PROJETOS ? perm.podeNovo : (perm.podeNovo || perm.podeAcessar);

  const [lista, setLista] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => { if (logado) carregarHistorico(); // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idUsuarioLogado, logado])
  );

  async function carregarHistorico() {
    if (!idUsuarioLogado) { setLoading(false); return; }
    setLoading(true);
    try {
        const res = await api.get(`/ferias/historico/${idUsuarioLogado}`);
        const dados = Array.isArray(res.data) ? res.data : [];
        setLista(dados.sort((a, b) => new Date(b.data_solicitacao) - new Date(a.data_solicitacao)));
    } catch (error) {
        setLista([]);
    } finally {
        setLoading(false);
        setRefreshing(false);
    }
  }

  function handleNovo() {
      router.push({ pathname: '/ferias/nova', params: { modulo } });
  }

  const totalAprovado = lista
      .filter(i => i.status === 'APROVADO')
      .reduce((soma, i) => soma + (diasEntre(i.data_inicio, i.data_fim) || 0), 0);

  const renderItem = ({ item }) => {
    const st = STATUS[item.status] || STATUS.PENDENTE;
    const dias = diasEntre(item.data_inicio, item.data_fim);

    return (
      <Cartao style={est.card}>
        <View style={est.cardTopo}>
            <Text style={est.tipo} numberOfLines={2}>{item.tipo_solicitacao}</Text>
            <Etiqueta texto={st.rotulo} cor={st.cor} fundo={st.fundo} />
        </View>

        <View style={est.periodoLinha}>
            <MaterialIcons name="event-note" size={14} color={cores.textoFraco} />
            <Text style={est.periodoTexto}>Aquisitivo {item.periodo_aquisitivo}</Text>
            {dias ? (
                <>
                    <View style={est.ponto} />
                    <Text style={est.periodoTexto}>{dias} {dias === 1 ? 'dia' : 'dias'}</Text>
                </>
            ) : null}
        </View>

        <View style={est.datas}>
            <View style={est.dataBloco}>
                <Text style={est.dataRotulo}>Início</Text>
                <Text style={est.dataValor}>{formatarBr(item.data_inicio)}</Text>
            </View>
            <View style={est.dataSeta}>
                <MaterialIcons name="arrow-forward" size={16} color={cores.textoFraco} />
            </View>
            <View style={[est.dataBloco, { alignItems: 'flex-end' }]}>
                <Text style={est.dataRotulo}>Fim</Text>
                <Text style={est.dataValor}>{formatarBr(item.data_fim)}</Text>
            </View>
        </View>
      </Cartao>
    );
  };

  if (!logado) return null;

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo="Minhas Férias"
        subtitulo={lista.length ? `${lista.length} solicitação(ões)` : 'Solicitações e saldo'}
        cor={cores.ferias}
        aoVoltar={() => router.back()}
      />

      <View style={est.resumoLinha}>
          <Cartao style={est.resumo}>
              <View style={[est.resumoIcone, { backgroundColor: cores.feriasClara }]}>
                  <MaterialIcons name="beach-access" size={20} color={cores.ferias} />
              </View>
              <View style={{ flex: 1 }}>
                  <Text style={est.resumoRotulo}>Dias aprovados</Text>
                  <Text style={est.resumoValor}>{totalAprovado}</Text>
              </View>
              <View style={[est.resumoIcone, { backgroundColor: cores.alertaClara }]}>
                  <MaterialIcons name="schedule" size={20} color={cores.alerta} />
              </View>
              <View>
                  <Text style={est.resumoRotulo}>Em análise</Text>
                  <Text style={est.resumoValor}>{lista.filter(i => i.status === 'PENDENTE').length}</Text>
              </View>
          </Cartao>
      </View>

      {loading && !refreshing ? (
          <Carregando cor={cores.ferias} texto="Carregando solicitações..." />
      ) : (
          <FlatList
              data={lista}
              keyExtractor={item => String(item.id_ferias)}
              renderItem={renderItem}
              contentContainerStyle={[est.lista, { paddingBottom: espacoInferior }]}
              showsVerticalScrollIndicator={false}
              refreshControl={
                  <RefreshControl
                      refreshing={refreshing}
                      onRefresh={() => { setRefreshing(true); carregarHistorico(); }}
                      colors={[cores.ferias]}
                      tintColor={cores.ferias}
                  />
              }
              ListEmptyComponent={
                  <Vazio
                      icone="beach-access"
                      texto="Nenhuma solicitação encontrada"
                      sub={podeNovo ? 'Toque no botão abaixo para solicitar suas férias.' : undefined}
                  />
              }
          />
      )}

      {podeNovo && (
          <BotaoFlutuante icone="add" rotulo="Solicitar" cor={cores.ferias} aoTocar={handleNovo} />
      )}
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },

  resumoLinha: { paddingHorizontal: espaco.xl, marginTop: -SOBREPOSICAO, marginBottom: espaco.sm },
  resumo: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, ...sombra.media },
  resumoIcone: {
    width: 40, height: 40, borderRadius: raio.sm,
    justifyContent: 'center', alignItems: 'center'
  },
  resumoRotulo: { ...tipo.micro, color: cores.textoFraco },
  resumoValor: { ...tipo.subtitulo, color: cores.texto, marginTop: 2 },

  lista: { paddingHorizontal: espaco.xl, paddingTop: espaco.md },

  card: { marginBottom: espaco.md },
  cardTopo: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: espaco.md },
  tipo: { ...tipo.subtitulo, color: cores.texto, flex: 1, fontSize: 16 },

  periodoLinha: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: espaco.sm },
  periodoTexto: { ...tipo.legenda, color: cores.textoMedio },
  ponto: { width: 3, height: 3, borderRadius: 2, backgroundColor: cores.bordaForte, marginHorizontal: espaco.sm },

  datas: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: cores.superficieAlt, borderRadius: raio.md,
    padding: espaco.md, marginTop: espaco.md
  },
  dataBloco: { flex: 1 },
  dataRotulo: { ...tipo.micro, color: cores.textoFraco },
  dataValor: { ...tipo.corpoForte, color: cores.texto, marginTop: 3 },
  dataSeta: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: cores.superficie,
    justifyContent: 'center', alignItems: 'center'
  }
});
