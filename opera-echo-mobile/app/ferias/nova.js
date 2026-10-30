/* ARQUIVO: app/ferias/nova.js
   Solicitação de férias - mesmas regras da tela web (RegistroFerias.js):
     - período aquisitivo padrão = ano anterior; só pode ser solicitado após
       concluído (máximo = ano atual - 1);
     - 30 dias e 20 dias (c/ 10 vendidos) são exclusivos; 1º e 2º períodos de
       15 dias podem ser pedidos juntos, cada um com sua data;
     - "20 dias (c/ 10 vendidos)" consome 30 do saldo;
     - limite legal CLT Art. 134: o gozo deve terminar até 1 ano e 11 meses
       após o início do período aquisitivo (aniversário de admissão). */
import { MaterialIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
    Alert,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../../src/api';
import { dataISOLocal } from '../../src/cadastros';
import { MODULO } from '../../src/escopo';
import { CHAVES, usePermissoes } from '../../src/permissoes';
import { getIdUsuario, getUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, sombra, tipo } from '../../src/tema';
import {
    Botao, Cabecalho, Campo, CampoSeletor, Cartao, RodapeAcoes, SOBREPOSICAO, useEspacoInferior
} from '../../src/ui';

const OPCOES = [
  { id: '30_DIAS',         label: '30 Dias Corridos',         dias: 30, custo: 30, desc: 'Período único' },
  { id: '1_PERIODO_15',    label: '1º Período (15 Dias)',     dias: 15, custo: 15, desc: 'Pode ser combinado com o 2º período' },
  { id: '2_PERIODO_15',    label: '2º Período (15 Dias)',     dias: 15, custo: 15, desc: 'Pode ser combinado com o 1º período' },
  { id: '20_DIAS_VENDIDO', label: '20 Dias (c/ 10 Vendidos)', dias: 20, custo: 30, desc: 'Consome 30 do saldo' }
];
const EXCLUSIVAS = ['30_DIAS', '20_DIAS_VENDIDO'];

const brData = (iso) => iso ? iso.split('-').reverse().join('/') : '';
const somarDias = (iso, n) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return dataISOLocal(d);
};

/* Data limite legal (CLT Art. 134) para o período aquisitivo. */
function limiteCLT(dataAdmissao, periodo) {
    if (!dataAdmissao || !periodo) return null;
    const adm = new Date(String(dataAdmissao).split('T')[0] + 'T12:00:00');
    if (isNaN(adm)) return null;
    const limite = new Date(parseInt(periodo, 10), adm.getMonth(), adm.getDate(), 12);
    limite.setMonth(limite.getMonth() + 23);
    limite.setDate(limite.getDate() - 1);
    return dataISOLocal(limite);
}

export default function NovaFerias() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(110);

  const modulo = params.modulo === MODULO.PROJETOS ? MODULO.PROJETOS : MODULO.IMPLANTACAO;
  const perm = usePermissoes(CHAVES.ferias[modulo]);
  const podeNovo = modulo === MODULO.PROJETOS ? perm.podeNovo : (perm.podeNovo || perm.podeAcessar);

  // Identidade da sessão (nunca dos parâmetros da rota).
  const idUsuarioLogado = getIdUsuario();
  const dataAdmissao = getUsuario()?.data_admissao || null;

  const anoMaximo = new Date().getFullYear() - 1;
  const [loading, setLoading] = useState(false);
  const [periodoAquisitivo, setPeriodoAquisitivo] = useState(String(anoMaximo));
  const [historico, setHistorico] = useState([]);

  // { [id]: 'YYYY-MM-DD' | '' } - opções marcadas e a data de início de cada uma
  const [selecionadas, setSelecionadas] = useState({});
  const [datePicker, setDatePicker] = useState(null); // id da opção

  useEffect(() => { if (logado) carregarHistorico(); }, [logado]);

  async function carregarHistorico() {
    if (!idUsuarioLogado) return;
    try {
        const res = await api.get(`/ferias/historico/${idUsuarioLogado}`);
        setHistorico(Array.isArray(res.data) ? res.data : []);
    } catch (e) { setHistorico([]); }
  }

  // Saldo do período (mesma conta do web)
  const diasRestantes = useMemo(() => {
    let usados = 0;
    historico.forEach(req => {
        if (String(req.periodo_aquisitivo) === String(periodoAquisitivo) && req.status !== 'RECUSADO') {
            const t = String(req.tipo_solicitacao || '');
            if (t.includes('10 Vendidos') || t.includes('20 Dias (c/ 10')) usados += 30;
            else {
                const ini = new Date(req.data_inicio);
                const fim = new Date(req.data_fim);
                usados += Math.ceil(Math.abs(fim - ini) / 86400000) + 1;
            }
        }
    });
    return Math.max(0, 30 - usados);
  }, [historico, periodoAquisitivo]);

  const itens = OPCOES.filter(op => op.id in selecionadas)
      .map(op => ({ ...op, inicio: selecionadas[op.id], fim: selecionadas[op.id] ? somarDias(selecionadas[op.id], op.dias - 1) : '' }));
  const custoTotal = itens.reduce((s, op) => s + op.custo, 0);
  const dataLimite = limiteCLT(dataAdmissao, periodoAquisitivo);
  const excedeCLT = dataLimite ? itens.find(op => op.fim && op.fim > dataLimite) : null;

  function alternarOpcao(id) {
    setSelecionadas(prev => {
        const novo = { ...prev };
        if (id in novo) { delete novo[id]; return novo; }
        if (EXCLUSIVAS.includes(id)) return { [id]: '' };
        EXCLUSIVAS.forEach(e => delete novo[e]);
        novo[id] = '';
        return novo;
    });
  }

  const onChangeDate = (event, data) => {
    const id = datePicker;
    setDatePicker(null);
    if (event?.type !== 'dismissed' && data && id) setSelecionadas(prev => ({ ...prev, [id]: dataISOLocal(data) }));
  };

  const handleSalvar = async () => {
    if (!idUsuarioLogado) return Alert.alert('Sessão', 'Faça login novamente.');
    if (!podeNovo) return Alert.alert('Sem permissão', 'Você não tem permissão para criar solicitações.');
    if (itens.length === 0) return Alert.alert('Atenção', 'Selecione o tipo de férias.');
    if (itens.some(op => !op.inicio)) return Alert.alert('Atenção', 'Informe a data de início de cada período selecionado.');

    const pa = parseInt(periodoAquisitivo, 10);
    if (!pa || String(pa).length !== 4) return Alert.alert('Atenção', 'Informe o período aquisitivo (ano com 4 dígitos).');
    if (pa > anoMaximo) {
        return Alert.alert('Período aquisitivo inválido', `O período aquisitivo só pode ser solicitado após sua conclusão. Ano máximo permitido: ${anoMaximo}.`);
    }
    if (custoTotal > diasRestantes) {
        return Alert.alert('Saldo insuficiente', `A seleção consome ${custoTotal} dias e você tem ${diasRestantes} disponíveis em ${pa}.`);
    }
    if (excedeCLT) {
        return Alert.alert('Prazo legal excedido',
            `"${excedeCLT.label}" ultrapassa o prazo de 1 ano e 11 meses do período aquisitivo de ${pa} (CLT Art. 134). Data limite: ${brData(dataLimite)}.`);
    }

    setLoading(true);
    try {
        for (const op of itens) {
            await api.post('/ferias/salvar', {
                id_usuario: parseInt(idUsuarioLogado, 10),
                periodo_aquisitivo: pa,
                tipo_solicitacao: op.label,
                data_inicio: op.inicio,
                data_fim: op.fim,
                dias_restantes: diasRestantes
            });
        }
        Alert.alert('Solicitação enviada', 'Seu pedido foi registrado e está em análise.', [
            { text: 'OK', onPress: () => router.back() }
        ]);
    } catch (error) {
        Alert.alert('Erro', error?.response?.data?.erro || 'Falha ao enviar solicitação.');
        carregarHistorico();
    } finally {
        setLoading(false);
    }
  };

  if (!logado) return null;

  const proporcao = Math.max(0, Math.min(1, diasRestantes / 30));

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo="Nova solicitação"
        subtitulo="Férias"
        cor={cores.ferias}
        aoVoltar={() => router.back()}
      />

      <ScrollView
        style={est.corpo}
        contentContainerStyle={[est.conteudo, { paddingBottom: espacoInferior }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Cartao style={est.saldo}>
            <Text style={est.saldoRotulo}>Saldo disponível</Text>
            <View style={est.saldoLinha}>
                <Text style={est.saldoValor}>{diasRestantes}</Text>
                <Text style={est.saldoUnidade}>/ 30 dias</Text>
            </View>
            <View style={est.barra}>
                <View style={[est.barraPreenchida, { width: `${proporcao * 100}%` }]} />
            </View>
            <Campo
                rotulo="Período aquisitivo"
                keyboardType="numeric"
                maxLength={4}
                value={periodoAquisitivo}
                onChangeText={t => setPeriodoAquisitivo(t.replace(/\D/g, ''))}
                style={{ marginTop: espaco.lg, marginBottom: 0 }}
            />
            <Text style={est.dica}>
                Máximo permitido: {anoMaximo}{dataLimite ? ` · prazo legal até ${brData(dataLimite)}` : ''}
            </Text>
        </Cartao>

        <Text style={est.secao}>Tipo de solicitação</Text>
        {OPCOES.map(op => {
            const ativo = op.id in selecionadas;
            const indisponivel = !ativo && op.custo > diasRestantes;
            return (
                <View key={op.id} style={[est.opcao, ativo && est.opcaoAtiva, indisponivel && { opacity: 0.45 }]}>
                    <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => alternarOpcao(op.id)}
                        disabled={indisponivel}
                        style={est.opcaoLinha}
                    >
                        <View style={[est.caixa, ativo && est.caixaAtiva]}>
                            {ativo && <MaterialIcons name="check" size={16} color="#FFF" />}
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[est.opcaoTitulo, ativo && { color: cores.ferias }]}>{op.label}</Text>
                            <Text style={est.opcaoDesc}>{indisponivel ? 'Saldo insuficiente' : op.desc}</Text>
                        </View>
                        <View style={[est.opcaoDias, ativo && { backgroundColor: cores.ferias }]}>
                            <Text style={[est.opcaoDiasTexto, ativo && { color: '#FFF' }]}>{op.dias}d</Text>
                        </View>
                    </TouchableOpacity>

                    {ativo && (
                        <View style={est.opcaoData}>
                            <CampoSeletor
                                rotulo="Data de início" obrigatorio
                                valor={brData(selecionadas[op.id])}
                                placeholder="Selecione a data"
                                icone="event"
                                aoTocar={() => setDatePicker(op.id)}
                                style={{ marginBottom: selecionadas[op.id] ? espaco.sm : 0 }}
                            />
                            {selecionadas[op.id] ? (
                                <View style={est.previsao}>
                                    <MaterialIcons name="flag" size={18} color={cores.ferias} />
                                    <Text style={est.previsaoTexto}>
                                        Até {brData(somarDias(selecionadas[op.id], op.dias - 1))} · retorno em {brData(somarDias(selecionadas[op.id], op.dias))}
                                    </Text>
                                </View>
                            ) : null}
                        </View>
                    )}
                </View>
            );
        })}

        {excedeCLT && (
            <View style={est.alertaCLT}>
                <MaterialIcons name="gavel" size={18} color={cores.erro} />
                <Text style={est.alertaCLTTexto}>
                    {`"${excedeCLT.label}" passa do prazo legal de ${brData(dataLimite)} (CLT Art. 134). Ajuste a data.`}
                </Text>
            </View>
        )}
      </ScrollView>

      {datePicker && (
          <DateTimePicker
              value={selecionadas[datePicker] ? new Date(`${selecionadas[datePicker]}T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeDate}
          />
      )}

      {podeNovo && (
        <RodapeAcoes>
          <Botao
              titulo="ENVIAR SOLICITAÇÃO"
              icone="send"
              cor={cores.ferias}
              carregando={loading}
              desabilitado={itens.length === 0}
              aoTocar={handleSalvar}
              larguraTotal={false}
              style={{ flex: 1 }}
          />
        </RodapeAcoes>
      )}
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  corpo: { flex: 1, marginTop: -SOBREPOSICAO },
  conteudo: { paddingHorizontal: espaco.xl },

  saldo: { marginBottom: espaco.xl, ...sombra.media },
  saldoRotulo: { ...tipo.micro, color: cores.textoFraco },
  saldoLinha: { flexDirection: 'row', alignItems: 'baseline', gap: espaco.sm, marginTop: espaco.sm },
  saldoValor: { fontSize: 40, fontWeight: '800', color: cores.ferias, letterSpacing: -1 },
  saldoUnidade: { ...tipo.corpo, color: cores.textoFraco },
  barra: { height: 8, borderRadius: 4, backgroundColor: cores.superficieAlt, marginTop: espaco.md, overflow: 'hidden' },
  barraPreenchida: { height: '100%', borderRadius: 4, backgroundColor: cores.ferias },
  dica: { ...tipo.legenda, color: cores.textoFraco, marginTop: espaco.sm, fontSize: 12 },

  secao: { ...tipo.subtitulo, color: cores.texto, marginBottom: espaco.md, fontSize: 16 },

  opcao: {
    backgroundColor: cores.superficie, borderRadius: raio.lg,
    marginBottom: espaco.md, borderWidth: 1.5, borderColor: cores.borda
  },
  opcaoAtiva: { borderColor: cores.ferias, backgroundColor: cores.feriasClara },
  opcaoLinha: { flexDirection: 'row', alignItems: 'center', gap: espaco.md, padding: espaco.lg, minHeight: 74 },
  caixa: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: cores.bordaForte,
    justifyContent: 'center', alignItems: 'center'
  },
  caixaAtiva: { borderColor: cores.ferias, backgroundColor: cores.ferias },
  opcaoTitulo: { ...tipo.corpoForte, color: cores.texto },
  opcaoDesc: { ...tipo.legenda, color: cores.textoFraco, marginTop: 2 },
  opcaoDias: {
    paddingHorizontal: espaco.md, paddingVertical: 6, borderRadius: raio.pill,
    backgroundColor: cores.superficieAlt
  },
  opcaoDiasTexto: { ...tipo.legenda, fontWeight: '800', color: cores.textoMedio },
  opcaoData: { paddingHorizontal: espaco.lg, paddingBottom: espaco.lg },

  previsao: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    backgroundColor: cores.superficie, borderRadius: raio.md, padding: espaco.md
  },
  previsaoTexto: { ...tipo.legenda, color: cores.ferias, fontWeight: '700', flex: 1 },

  alertaCLT: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    backgroundColor: cores.erroClara, borderRadius: raio.md, padding: espaco.md,
    borderWidth: 1, borderColor: '#F6CFCF'
  },
  alertaCLTTexto: { ...tipo.legenda, color: cores.erro, flex: 1, lineHeight: 19 }
});
