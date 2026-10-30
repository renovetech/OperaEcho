/* ARQUIVO: app/escalas/index.js */
import { MaterialIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../../src/api';
import { dataISOLocal } from '../../src/cadastros';
import { MODULO, apiBaseDoModulo } from '../../src/escopo';
import { getIdUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, sombra, tipo } from '../../src/tema';
import { Cabecalho, Carregando, Cartao, Etiqueta, SOBREPOSICAO, useEspacoInferior, Vazio } from '../../src/ui';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

// Mesmos tipos do Gerador de Escalas do web (inclui Home Office e Feriado).
const TIPOS = {
    TRABALHO:          { rotulo: null,                 cor: '#17864B', fundo: '#E6F5EC', icone: 'work-outline' },
    APOIO:             { rotulo: 'Apoio ao Projeto',   cor: '#0F6FCF', fundo: '#E7F1FC', icone: 'handshake' },
    SEDE:              { rotulo: 'SEDE',               cor: '#0B5D2A', fundo: '#E6F5EC', icone: 'business' },
    SEDE_TREINAMENTO:  { rotulo: 'SEDE · Treinamento', cor: '#046572', fundo: '#E3F5F7', icone: 'school' },
    HOME_OFFICE:       { rotulo: 'Home Office',        cor: '#7B1FA2', fundo: '#F3E8FB', icone: 'home-work' },
    FERIADO:           { rotulo: 'Feriado',            cor: '#0F6FCF', fundo: '#E7F1FC', icone: 'celebration' },
    FOLGA:             { rotulo: 'Folga',              cor: '#5A6675', fundo: '#EFF2F6', icone: 'weekend' },
    FERIAS:            { rotulo: 'Férias',             cor: '#C77700', fundo: '#FFF6E5', icone: 'beach-access' },
    ATESTADO:          { rotulo: 'Atestado',           cor: '#C62828', fundo: '#FDECEC', icone: 'local-hospital' },
    FALTA:             { rotulo: 'Falta',              cor: '#131A22', fundo: '#EFF2F6', icone: 'event-busy' }
};

const TURNOS = {
    DIURNO:  { rotulo: 'Diurno',  icone: 'wb-sunny' },
    NOTURNO: { rotulo: 'Noturno', icone: 'nightlight-round' }
};

export default function MinhaEscala({ modulo: moduloProp }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(espaco.xl);

  const modulo = moduloProp || params.modulo || MODULO.IMPLANTACAO;
  const ehProjetos = modulo === MODULO.PROJETOS;
  const lotacaoFixa = params.lotacao ? String(params.lotacao) : null;
  const nomeLotacao = params.nome_lotacao || '';

  // Identidade da sessão (não dos parâmetros da rota).
  const idUsuarioLogado = getIdUsuario();

  function segundaFeira(d) {
    const data = new Date(d);
    const dia = data.getDay();
    data.setDate(data.getDate() - dia + (dia === 0 ? -6 : 1));
    return data;
  }

  const formatarBr = (iso) => {
    if (!iso) return '';
    const [, mes, dia] = iso.split('-');
    return `${dia}/${mes}`;
  };

  const [inicioSemana, setInicioSemana] = useState(segundaFeira(new Date()));
  const [escala, setEscala] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aviso, setAviso] = useState('');

  useEffect(() => { if (logado) carregarEscala(); }, [inicioSemana, modulo, lotacaoFixa, logado]);

  const carregarEscala = async () => {
    if (ehProjetos && !lotacaoFixa) {
      setEscala([]);
      setAviso('Selecione a lotação no painel inicial para visualizar a escala.');
      setLoading(false); setRefreshing(false);
      return;
    }

    setLoading(true);
    setAviso('');
    try {
      const ini = dataISOLocal(inicioSemana);
      const fimObj = new Date(inicioSemana);
      fimObj.setDate(fimObj.getDate() + 6);
      const fim = dataISOLocal(fimObj);

      // id_usuario: o servidor devolve só a escala do colaborador.
      const res = await api.get(`${apiBaseDoModulo(modulo)}/escalas?inicio=${ini}&fim=${fim}&id_usuario=${idUsuarioLogado}`);
      const todos = Array.isArray(res.data) ? res.data : [];
      let meus = todos.filter(i => String(i.id_usuario) === String(idUsuarioLogado));

      if (ehProjetos) {
        meus = meus.filter(i => !i.id_projeto || String(i.id_projeto) === lotacaoFixa);
      }
      setEscala(meus);
    } catch (error) {
      setAviso(error?.response?.status === 403
        ? 'Escala fora da sua lotação.'
        : 'Não foi possível carregar a escala.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  function mudarSemana(dias) {
    const nova = new Date(inicioSemana);
    nova.setDate(nova.getDate() + dias);
    setInicioSemana(nova);
  }

  function itemDoDia(indice) {
    const d = new Date(inicioSemana);
    d.setDate(d.getDate() + indice);
    const iso = dataISOLocal(d);
    const item = escala.find(e => (e.data_escala ? String(e.data_escala).split('T')[0] : '') === iso);
    return { iso, item, hoje: iso === dataISOLocal(new Date()) };
  }

  const periodo = () => {
    const fim = new Date(inicioSemana);
    fim.setDate(fim.getDate() + 6);
    return `${formatarBr(dataISOLocal(inicioSemana))} - ${formatarBr(dataISOLocal(fim))}`;
  };

  const renderDia = (indice, nomeDia) => {
    const { iso, item, hoje } = itemDoDia(indice);
    const cfg = item ? (TIPOS[item.tipo] || { cor: cores.textoMedio, fundo: cores.superficieAlt, icone: 'event' }) : null;

    const titulo = item
      ? (item.tipo === 'TRABALHO' ? (item.nome_projeto || 'Trabalho') : (cfg.rotulo || item.tipo))
      : 'Sem agendamento';

    const detalhe = item
      ? (item.tipo === 'TRABALHO' ? item.nome_unidade : (item.tipo === 'APOIO' ? item.nome_projeto : ''))
      : '';
    const turno = item?.tipo === 'TRABALHO' ? TURNOS[item.turno] : null;

    return (
      <Cartao key={indice} style={[est.dia, hoje && est.diaHoje]} elevado={!!item}>
        <View style={[est.faixa, { backgroundColor: item ? cfg.cor : cores.borda }]} />

        <View style={est.diaCaixa}>
          <Text style={[est.diaNome, hoje && { color: cores.escalas }]}>{nomeDia.slice(0, 3)}</Text>
          <Text style={[est.diaData, hoje && { color: cores.escalas }]}>{formatarBr(iso)}</Text>
          {hoje && <View style={est.pontoHoje} />}
        </View>

        <View style={est.diaInfo}>
          <View style={est.diaTopo}>
            {item && (
              <View style={[est.diaIcone, { backgroundColor: cfg.fundo }]}>
                <MaterialIcons name={cfg.icone} size={16} color={cfg.cor} />
              </View>
            )}
            <Text style={[est.diaTitulo, !item && est.diaTituloVazio]} numberOfLines={1}>
              {titulo}
            </Text>
          </View>
          {detalhe ? <Text style={est.diaDetalhe} numberOfLines={2}>{detalhe}</Text> : null}
          {(item?.nomes_produtos || turno) ? (
            <View style={est.etiquetas}>
              {turno ? (
                <View style={est.turno}>
                  <MaterialIcons name={turno.icone} size={13} color={cores.textoMedio} />
                  <Text style={est.turnoTexto}>{turno.rotulo}</Text>
                </View>
              ) : null}
              {item?.nomes_produtos ? (
                <Etiqueta texto={item.nomes_produtos} cor={cores.escalas} fundo={cores.escalasClara} style={{ flexShrink: 1 }} />
              ) : null}
            </View>
          ) : null}
        </View>
      </Cartao>
    );
  };

  if (!logado) return null;

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo="Minha Escala"
        subtitulo={ehProjetos ? (nomeLotacao || 'Projetos') : 'Implantação'}
        cor={cores.escalas}
        aoVoltar={() => router.back()}
      />

      <View style={est.navegador}>
        <TouchableOpacity onPress={() => mudarSemana(-7)} style={est.navBotao} activeOpacity={0.7}>
          <MaterialIcons name="chevron-left" size={26} color={cores.escalas} />
        </TouchableOpacity>

        <TouchableOpacity
          style={est.navCentro}
          onPress={() => setInicioSemana(segundaFeira(new Date()))}
          activeOpacity={0.7}
        >
          <Text style={est.navRotulo}>Semana</Text>
          <Text style={est.navPeriodo}>{periodo()}</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => mudarSemana(7)} style={est.navBotao} activeOpacity={0.7}>
          <MaterialIcons name="chevron-right" size={26} color={cores.escalas} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[est.lista, { paddingBottom: espacoInferior }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); carregarEscala(); }}
            colors={[cores.escalas]}
            tintColor={cores.escalas}
          />
        }
      >
        {loading && !refreshing ? (
          <Carregando cor={cores.escalas} texto="Carregando escala..." />
        ) : aviso ? (
          <Vazio icone="event-busy" texto={aviso} />
        ) : (
          DIAS.map((dia, i) => renderDia(i, dia))
        )}
      </ScrollView>
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },

  navegador: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: cores.superficie, marginHorizontal: espaco.xl, marginTop: -SOBREPOSICAO,
    borderRadius: raio.lg, paddingHorizontal: espaco.sm, height: 62, ...sombra.media
  },
  navBotao: {
    width: 46, height: 46, borderRadius: raio.md, backgroundColor: cores.escalasClara,
    justifyContent: 'center', alignItems: 'center'
  },
  navCentro: { alignItems: 'center', flex: 1 },
  navRotulo: { ...tipo.micro, color: cores.textoFraco },
  navPeriodo: { ...tipo.corpoForte, color: cores.texto, marginTop: 2 },

  lista: { padding: espaco.xl, paddingTop: espaco.xl },

  dia: {
    flexDirection: 'row', alignItems: 'center', marginBottom: espaco.md,
    paddingLeft: espaco.lg, paddingVertical: espaco.md, overflow: 'hidden', minHeight: 78
  },
  diaHoje: { borderWidth: 1.5, borderColor: cores.escalas },
  faixa: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 5 },

  diaCaixa: {
    width: 64, alignItems: 'center', justifyContent: 'center',
    borderRightWidth: 1, borderRightColor: cores.borda, paddingRight: espaco.md, marginRight: espaco.lg
  },
  diaNome: { ...tipo.micro, color: cores.textoMedio },
  diaData: { ...tipo.corpoForte, color: cores.texto, marginTop: 3 },
  pontoHoje: { width: 5, height: 5, borderRadius: 3, backgroundColor: cores.escalas, marginTop: 5 },

  diaInfo: { flex: 1 },
  diaTopo: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  diaIcone: { width: 26, height: 26, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  diaTitulo: { ...tipo.corpoForte, color: cores.texto, flex: 1 },
  diaTituloVazio: { color: cores.textoFraco, fontWeight: '500' },
  diaDetalhe: { ...tipo.legenda, color: cores.textoMedio, marginTop: 4, lineHeight: 19 },
  etiquetas: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: espaco.sm, marginTop: espaco.sm },
  turno: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: espaco.sm, paddingVertical: 4, borderRadius: raio.pill,
    backgroundColor: cores.superficieAlt, borderWidth: 1, borderColor: cores.borda
  },
  turnoTexto: { fontSize: 11, fontWeight: '700', color: cores.textoMedio }
});
