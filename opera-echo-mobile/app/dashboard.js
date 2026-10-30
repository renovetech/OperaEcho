/* ARQUIVO: app/dashboard.js */
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    Alert,
    Animated,
    Easing,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { MODULO, useEscopo } from '../src/escopo';
import { getNomeUsuario, limparSessao, useSessaoObrigatoria } from '../src/sessao';
import { cores, espaco, raio, sombra, tipo } from '../src/tema';
import {
    Botao, BotaoCabecalho, Cabecalho, Carregando, Cartao, Segmentado, Seletor, SOBREPOSICAO,
    useEspacoInferior
} from '../src/ui';
import { VERSAO_DO_APP, linkDownloadConfiavel, verificarAtualizacao } from '../src/versao';

const ATALHOS = [
    { rota: '/atividades',   titulo: 'Atividades',   desc: 'Registrar tarefas diárias',  icone: 'assignment-turned-in', cor: cores.atividades, fundo: cores.primariaClara },
    { rota: '/escalas',      titulo: 'Minha Escala', desc: 'Escala semanal de trabalho', icone: 'calendar-month',  cor: cores.escalas,    fundo: cores.escalasClara },
    { rota: '/ferias',       titulo: 'Férias',       desc: 'Solicitações e saldo',       icone: 'beach-access',                   cor: cores.ferias,     fundo: cores.feriasClara },
    { rota: '/horas-extras', titulo: 'Horas Extras', desc: 'Lançamentos e histórico',    icone: 'more-time',      cor: cores.horas,      fundo: cores.horasClara }
];

const getIniciais = (nome) => {
    if (!nome) return 'UR';
    const nomes = String(nome).trim().split(' ').filter(Boolean);
    if (nomes.length === 1) return nomes[0].substring(0, 2).toUpperCase();
    return (nomes[0][0] + nomes[nomes.length - 1][0]).toUpperCase();
};

const getDataFormatada = () => {
    const hoje = new Date();
    const dias = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
    return `${dias[hoje.getDay()]}, ${hoje.getDate()} de ${meses[hoje.getMonth()]}`;
};

const saudacao = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
};

export default function Dashboard() {
  const router = useRouter();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(espaco.xxxl);

  // Identidade SEMPRE da sessão (nunca dos parâmetros da rota).
  const nomeUsuario = getNomeUsuario();

  const [updateInfo, setUpdateInfo] = useState(null);
  const [moduloAtivo, setModuloAtivo] = useState(MODULO.IMPLANTACAO);

  const { lotacoes, global, podeAcessarProjetos, carregando: carregandoEscopo } = useEscopo();
  const [lotacaoSel, setLotacaoSel] = useState(null);
  const [seletorAberto, setSeletorAberto] = useState(false);

  // Entrada dos cartões em cascata
  const entrada = useRef(new Animated.Value(0)).current;
  useEffect(() => {
      Animated.timing(entrada, {
          toValue: 1, duration: 460, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true
      }).start();
  }, [moduloAtivo, entrada]);

  // A checagem completa acontece no login (resultado em cache). Aqui só
  // reexibe se a atualização for OBRIGATÓRIA.
  useEffect(() => {
      verificarAtualizacao().then(info => { if (info?.obrigatorio) setUpdateInfo(info); });
  }, []);

  useEffect(() => {
      if (!lotacaoSel && lotacoes.length === 1) setLotacaoSel(lotacoes[0]);
  }, [lotacoes, lotacaoSel]);

  function handleDownloadUpdate() {
      if (!linkDownloadConfiavel(updateInfo?.link_download)) {
          return Alert.alert('Atualização', 'Link de download inválido. Procure o suporte.');
      }
      Linking.openURL(updateInfo.link_download)
          .catch(() => Alert.alert('Erro', 'Não foi possível abrir o link de atualização.'));
  }

  async function sair() {
      await limparSessao();
      router.replace('/');
  }

  function handleLogout() {
      if (Platform.OS === 'web') {
          if (window.confirm('Deseja sair do sistema?')) sair();
      } else {
          Alert.alert('Sair', 'Deseja sair do sistema?', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Sair', style: 'destructive', onPress: sair }
          ]);
      }
  }

  function alternarModulo(modulo) {
      if (modulo === MODULO.PROJETOS && !carregandoEscopo && !podeAcessarProjetos) {
          return Alert.alert(
              'Sem lotação',
              'Nenhuma lotação vinculada ao seu acesso. Procure um Gerente ou Coordenador de Implantação.'
          );
      }
      entrada.setValue(0);
      setModuloAtivo(modulo);
  }

  function navegarPara(rotaBase) {
    const ehProjetos = moduloAtivo === MODULO.PROJETOS;

    if (ehProjetos && !lotacaoSel) {
        return Alert.alert('Selecione a lotação', 'Escolha a lotação antes de abrir esta tela.');
    }

    // Férias é tela única (não existe /projetos/ferias no backend); o módulo
    // vai nos parâmetros para usar a permissão certa (proj_ferias_solicitacao).
    const rotaFinal = (ehProjetos && rotaBase !== '/ferias') ? `/projetos${rotaBase}` : rotaBase;

    router.push({
        pathname: rotaFinal,
        params: {
            modulo: ehProjetos ? MODULO.PROJETOS : MODULO.IMPLANTACAO,
            lotacao: ehProjetos && lotacaoSel ? String(lotacaoSel.id_projeto) : '',
            nome_lotacao: ehProjetos && lotacaoSel ? lotacaoSel.nome_projeto : ''
        }
    });
  }

  if (!logado) return null;

  const ehProjetos = moduloAtivo === MODULO.PROJETOS;

  return (
    <View style={est.raiz}>
      <Cabecalho
        alinhamento="esquerda"
        titulo={`${saudacao()}, ${String(nomeUsuario).split(' ')[0]}`}
        subtitulo={getDataFormatada()}
        esquerda={
            <View style={est.avatar}>
                <Text style={est.avatarTexto}>{getIniciais(nomeUsuario)}</Text>
            </View>
        }
        direita={<BotaoCabecalho icone="logout" aoTocar={handleLogout} rotuloAcessivel="Sair" />}
      >
        <Segmentado
            opcoes={[
                { valor: MODULO.IMPLANTACAO, rotulo: 'Implantação' },
                { valor: MODULO.PROJETOS, rotulo: 'Projetos' }
            ]}
            valor={moduloAtivo}
            aoMudar={alternarModulo}
        />
      </Cabecalho>

      <ScrollView
        style={est.corpo}
        contentContainerStyle={[est.corpoConteudo, { paddingBottom: espacoInferior }]}
        showsVerticalScrollIndicator={false}
      >
        {ehProjetos && (
            carregandoEscopo ? (
                <Cartao style={est.bloco}><Carregando texto="Carregando lotações..." /></Cartao>
            ) : lotacoes.length === 0 ? (
                <Cartao style={[est.bloco, est.alerta]} elevado={false}>
                    <MaterialIcons name="error-outline" size={22} color={cores.erro} />
                    <Text style={est.alertaTexto}>
                        Nenhuma lotação vinculada ao seu acesso. Procure um Gerente ou Coordenador de Implantação.
                    </Text>
                </Cartao>
            ) : (
                <Cartao
                    style={[est.bloco, est.lotacao]}
                    aoTocar={lotacoes.length > 1 ? () => setSeletorAberto(true) : undefined}
                >
                    <View style={est.lotacaoIcone}>
                        <MaterialIcons name="apartment" size={20} color={cores.primaria} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={est.lotacaoRotulo}>
                            Lotação{global ? ' · visão global' : ''}
                        </Text>
                        <Text style={est.lotacaoValor} numberOfLines={1}>
                            {lotacaoSel ? lotacaoSel.nome_projeto : 'Selecione a lotação'}
                        </Text>
                    </View>
                    {lotacoes.length > 1 && (
                        <MaterialIcons name="unfold-more" size={22} color={cores.textoFraco} />
                    )}
                </Cartao>
            )
        )}

        <Text style={est.secao}>Acesso rápido</Text>

        <View style={est.grade}>
            {ATALHOS.map((a, i) => {
                const deslocamento = entrada.interpolate({
                    inputRange: [0, 1], outputRange: [18 + i * 8, 0]
                });
                return (
                    <Animated.View
                        key={a.rota}
                        style={[est.gradeItem, { opacity: entrada, transform: [{ translateY: deslocamento }] }]}
                    >
                        <TouchableOpacity activeOpacity={0.85} style={[est.tile, { backgroundColor: a.cor }]} onPress={() => navegarPara(a.rota)}>
                            <View style={est.tileBrilho} />
                            <View style={est.tileIcone}>
                                <MaterialIcons name={a.icone} size={26} color={a.cor} />
                            </View>
                            <Text style={est.tileTitulo}>{a.titulo}</Text>
                            <MaterialIcons name="arrow-forward" size={18} color="rgba(255,255,255,0.85)" style={est.tileSeta} />
                        </TouchableOpacity>
                    </Animated.View>
                );
            })}
        </View>

        {/* Consulta SIGTAP: tabela do SUS, em destaque */}
        <Animated.View style={{ opacity: entrada }}>
            <TouchableOpacity activeOpacity={0.88} style={est.sigtap} onPress={() => router.push('/sigtap')}>
                <View style={est.sigtapIcone}>
                    <MaterialIcons name="local-hospital" size={30} color={cores.sigtap} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={est.sigtapTitulo}>Consulta SIGTAP</Text>
                    <Text style={est.sigtapSub}>Tabela de procedimentos do SUS</Text>
                </View>
                <View style={est.sigtapSeta}>
                    <MaterialIcons name="search" size={22} color="#FFF" />
                </View>
            </TouchableOpacity>
        </Animated.View>

        <Text style={est.versao}>BUILD {VERSAO_DO_APP}</Text>
      </ScrollView>

      <Seletor
        visivel={seletorAberto}
        aoFechar={() => setSeletorAberto(false)}
        titulo="Selecione a lotação"
        dados={lotacoes}
        campoTexto="nome_projeto"
        campoId="id_projeto"
        selecionado={lotacaoSel?.id_projeto}
        aoSelecionar={(item) => { setLotacaoSel(item); setSeletorAberto(false); }}
        vazio="Nenhuma lotação vinculada ao seu acesso."
      />

      <Modal visible={!!updateInfo} transparent animationType="fade" onRequestClose={() => {}}>
          <View style={est.updateOverlay}>
              <View style={est.updateCartao}>
                  <View style={est.updateIcone}>
                      <MaterialIcons name="system-update" size={34} color={cores.primaria} />
                  </View>
                  <Text style={est.updateTitulo}>Atualização obrigatória</Text>
                  <Text style={est.updateMensagem}>
                      {updateInfo?.mensagem || 'Uma nova versão do aplicativo está disponível.'}
                  </Text>
                  <Botao titulo="Baixar agora" icone="file-download" aoTocar={handleDownloadUpdate} />
              </View>
          </View>
      </Modal>
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },

  avatar: {
    width: 46, height: 46, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.3)'
  },
  avatarTexto: { color: '#FFF', fontWeight: '800', fontSize: 16 },

  corpo: { flex: 1, marginTop: -SOBREPOSICAO },
  corpoConteudo: { paddingHorizontal: espaco.xl },

  bloco: { marginBottom: espaco.lg },

  status: { flexDirection: 'row', alignItems: 'center' },
  statusIcone: {
    width: 44, height: 44, borderRadius: raio.md, backgroundColor: '#FFF7E0',
    justifyContent: 'center', alignItems: 'center', marginRight: espaco.md
  },
  statusTitulo: { ...tipo.corpoForte, color: cores.texto },
  statusSub: { ...tipo.legenda, color: cores.textoMedio, marginTop: 2 },

  alerta: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: cores.erroClara, borderWidth: 1, borderColor: '#F6CFCF'
  },
  alertaTexto: { flex: 1, marginLeft: espaco.md, ...tipo.legenda, color: cores.erro, lineHeight: 19 },

  lotacao: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: cores.primariaClara
  },
  lotacaoIcone: {
    width: 40, height: 40, borderRadius: raio.sm, backgroundColor: cores.primariaClara,
    justifyContent: 'center', alignItems: 'center', marginRight: espaco.md
  },
  lotacaoRotulo: { ...tipo.micro, color: cores.textoFraco },
  lotacaoValor: { ...tipo.corpoForte, color: cores.texto, marginTop: 2 },

  secao: { ...tipo.subtitulo, color: cores.texto, marginTop: espaco.xl, marginBottom: espaco.md, marginLeft: 2 },

  atalho: { flexDirection: 'row', alignItems: 'center', marginBottom: espaco.md, paddingVertical: espaco.lg },
  atalhoIcone: {
    width: 50, height: 50, borderRadius: raio.md,
    justifyContent: 'center', alignItems: 'center', marginRight: espaco.lg
  },
  atalhoTitulo: { ...tipo.corpoForte, color: cores.texto, fontSize: 16 },
  atalhoDesc: { ...tipo.legenda, color: cores.textoFraco, marginTop: 2 },
  atalhoSeta: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: cores.superficieAlt,
    justifyContent: 'center', alignItems: 'center'
  },

  grade: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -espaco.sm / 2 },
  gradeItem: { width: '50%', padding: espaco.sm / 2 },
  tile: {
    height: 128, borderRadius: raio.lg, padding: espaco.lg, overflow: 'hidden', justifyContent: 'space-between',
    ...sombra.media
  },
  tileBrilho: {
    position: 'absolute', right: -30, top: -30, width: 110, height: 110, borderRadius: 55,
    backgroundColor: 'rgba(255,255,255,0.14)'
  },
  tileIcone: {
    width: 46, height: 46, borderRadius: raio.md, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center'
  },
  tileTitulo: { ...tipo.corpoForte, fontSize: 16, color: '#FFF' },
  tileSeta: { position: 'absolute', right: espaco.lg, bottom: espaco.lg },

  sigtap: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.md, marginTop: espaco.md,
    padding: espaco.lg, borderRadius: raio.lg, backgroundColor: cores.sigtapClara,
    borderWidth: 1.5, borderColor: cores.sigtap
  },
  sigtapIcone: {
    width: 54, height: 54, borderRadius: raio.md, backgroundColor: '#FFF',
    justifyContent: 'center', alignItems: 'center', ...sombra.leve
  },
  sigtapTitulo: { ...tipo.corpoForte, fontSize: 17, color: cores.sigtap },
  sigtapSub: { ...tipo.legenda, color: cores.textoMedio, marginTop: 2 },
  sigtapSeta: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: cores.sigtap,
    justifyContent: 'center', alignItems: 'center'
  },

  versao: { ...tipo.micro, color: cores.textoFraco, textAlign: 'center', marginTop: espaco.xl },

  updateOverlay: { flex: 1, backgroundColor: 'rgba(11,18,27,0.8)', justifyContent: 'center', alignItems: 'center', padding: espaco.xl },
  updateCartao: {
    width: '100%', maxWidth: 400, backgroundColor: cores.superficie,
    borderRadius: raio.xl, padding: espaco.xxl, alignItems: 'center', ...sombra.forte
  },
  updateIcone: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: cores.primariaClara,
    justifyContent: 'center', alignItems: 'center', marginBottom: espaco.lg
  },
  updateTitulo: { ...tipo.titulo, color: cores.texto, textAlign: 'center', marginBottom: espaco.sm },
  updateMensagem: { ...tipo.corpo, color: cores.textoMedio, textAlign: 'center', lineHeight: 22, marginBottom: espaco.xl }
});
