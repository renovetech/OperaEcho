/* ARQUIVO: app/horas-extras/index.js - Lançamento de Hora Extra (mobile)
   Mesma lógica de cálculo do web (LancamentoHoraExtra.js).
   DESEMPENHO: cada dia é um componente memorizado - digitar um horário
   redesenha só aquele dia (antes redesenhava os 31 a cada tecla); salvar e
   excluir não esperam mais o GPS; as unidades dos projetos do mês carregam
   em paralelo; a jornada padrão é gravada com atraso (não a cada tecla). */
import { MaterialIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    FlatList,
    Platform,
    RefreshControl,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import api from '../../src/api';
import { MODULO, apiBaseDoModulo } from '../../src/escopo';
import { registrarRastreio } from '../../src/geo';
import { CHAVES, ehGestorHE, usePermissoes } from '../../src/permissoes';
import { getIdUsuario, getNomeUsuario, useSessaoObrigatoria } from '../../src/sessao';
import { cores, espaco, raio, tipo } from '../../src/tema';
import {
    Botao, BotaoFlutuante, Cabecalho, CampoSeletor, Carregando, Cartao, Etiqueta,
    Seletor, SOBREPOSICAO, useEspacoInferior, Vazio
} from '../../src/ui';

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/* ===== TABELAS CLT 2026 (ESTIMATIVA - ajuste aqui quando mudarem) ===== */
// INSS progressivo 2026 (Portaria MPS/MF nº 13/2026). Mín. R$ 1.621,00 · teto R$ 8.475,55 · desc. máx. R$ 988,09.
const INSS_FAIXAS = [
    { ate: 1621.00, aliq: 0.075 },
    { ate: 2902.84, aliq: 0.09 },
    { ate: 4354.27, aliq: 0.12 },
    { ate: 8475.55, aliq: 0.14 },
];
// IRRF mensal 2026 - Tabela Progressiva (Lei 15.191/2025), inalterada pela 15.270.
const IRRF_FAIXAS = [
    { ate: 2428.80, aliq: 0.0,   deduz: 0.0 },
    { ate: 2826.65, aliq: 0.075, deduz: 182.16 },
    { ate: 3751.05, aliq: 0.15,  deduz: 394.16 },
    { ate: 4664.68, aliq: 0.225, deduz: 675.49 },
    { ate: Infinity, aliq: 0.275, deduz: 908.73 },
];
const IRRF_DEDUCAO_DEPENDENTE = 189.59;
const IRRF_DESCONTO_SIMPLIFICADO = 607.20;
const VT_ALIQUOTA = 0.06;

const calcularINSS = (base) => {
    if (base <= 0) return 0;
    let inss = 0, anterior = 0;
    for (const f of INSS_FAIXAS) {
        if (base > anterior) { inss += (Math.min(base, f.ate) - anterior) * f.aliq; anterior = f.ate; }
        else break;
    }
    return inss;
};
// Redutor da Lei 15.270/2025 (jan/2026): isenta até R$ 5.000 e reduz até R$ 7.350.
const irrfRedutor = (rend) => rend > 7350 ? 0 : Math.min(312.89, Math.max(0, 978.62 - 0.133145 * rend));
const calcularIRRF = (rend, inss, dependentes) => {
    if (rend <= 0) return 0;
    const descLegal = inss + (dependentes * IRRF_DEDUCAO_DEPENDENTE);
    const base = Math.max(0, rend - Math.max(descLegal, IRRF_DESCONTO_SIMPLIFICADO));
    const faixa = IRRF_FAIXAS.find(f => base <= f.ate) || IRRF_FAIXAS[IRRF_FAIXAS.length - 1];
    const impostoTabela = Math.max(0, base * faixa.aliq - faixa.deduz);
    return Math.max(0, impostoTabela - Math.min(impostoTabela, irrfRedutor(rend)));
};

const timeToMin = (time) => { if (!time) return 0; const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const minToTime = (min) => { if (isNaN(min) || min < 0) return ''; const h = Math.floor(min / 60); const m = Math.round(min % 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const applyTimeMask = (text) => {
    let v = text.replace(/\D/g, '');
    if (v.length > 2) v = v.replace(/^(\d{2})(\d)/, '$1:$2');
    return v.substring(0, 5);
};
const mesAtual = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const nomeMes = (ym) => { if (!ym) return ''; const [a, m] = ym.split('-').map(Number); return `${MESES[m - 1]} / ${a}`; };

/* Status exibido - mesma regra do web: PENDENTE vira PAGO a partir do dia 5
   do segundo mês seguinte ao de referência. */
const calcularStatusVisual = (item) => {
    if (item.status === 'PAGO' || item.status === 'RECUSADO') return item.status;
    if (item.status === 'PENDENTE' && item.mes_referencia) {
        const [anoRef, mesRef] = item.mes_referencia.split('-').map(Number);
        const dataPagamento = new Date(anoRef, (mesRef - 1) + 2, 5);
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        if (hoje >= dataPagamento) return 'PAGO';
    }
    return item.status || 'PENDENTE';
};
const ESTILO_STATUS = {
    PAGO:     { rotulo: 'Pago',       cor: cores.sucesso, fundo: cores.sucessoClara },
    RECUSADO: { rotulo: 'Recusado',   cor: cores.erro,    fundo: cores.erroClara },
    PENDENTE: { rotulo: 'Em Análise', cor: cores.alerta,  fundo: cores.alertaClara }
};

const LinhaValor = ({ rotulo, valor, cor }) => (
    <View style={est.linhaValor}>
        <Text style={est.linhaValorRotulo}>{rotulo}</Text>
        <Text style={[est.linhaValorValor, cor && { color: cor }]}>{valor}</Text>
    </View>
);

/* ===== Cartão de um dia (memorizado) ===== */
const CampoHora = ({ rotulo, valor, desabilitado, aoMudar }) => (
    <View style={est.horaCaixa}>
        <Text style={est.horaRotulo}>{rotulo}</Text>
        <TextInput
            style={[est.horaInput, desabilitado && est.horaInputOff]}
            keyboardType="numeric" maxLength={5} placeholder="00:00" placeholderTextColor={cores.textoFraco}
            value={valor || ''} editable={!desabilitado}
            onChangeText={t => aoMudar(applyTimeMask(t))}
        />
    </View>
);

const DiaCard = memo(function DiaCard({ item, index, rotuloUnidade, aoMudar, aoEscolherUnidade }) {
    return (
        <View style={[est.dia, item.isFDS && est.diaFDS, item.isFolga && est.diaFolga]}>
            <View style={est.diaTopo}>
                <View style={{ flex: 1 }}>
                    <Text style={est.diaTitulo}>Dia {String(item.dia).padStart(2, '0')}</Text>
                    <Text style={est.diaSemana}>{item.diaSemanaStr}</Text>
                </View>
                <View style={est.chave}>
                    <Text style={est.chaveRotulo}>Feriado</Text>
                    <Switch value={!!item.isFeriado} onValueChange={v => aoMudar(index, 'isFeriado', v)}
                        trackColor={{ true: cores.alerta, false: cores.bordaForte }} thumbColor="#FFF" />
                </View>
                <View style={est.chave}>
                    <Text style={est.chaveRotulo}>Folga</Text>
                    <Switch value={!!item.isFolga} onValueChange={v => aoMudar(index, 'isFolga', v)}
                        trackColor={{ true: cores.erro, false: cores.bordaForte }} thumbColor="#FFF" />
                </View>
            </View>

            <View style={est.horas}>
                <CampoHora rotulo="Entrada" valor={item.entrada} desabilitado={item.isFolga} aoMudar={v => aoMudar(index, 'entrada', v)} />
                <CampoHora rotulo="Saída" valor={item.saida} desabilitado={item.isFolga} aoMudar={v => aoMudar(index, 'saida', v)} />
                <CampoHora rotulo="Intervalo" valor={item.intervalo} desabilitado={item.isFolga} aoMudar={v => aoMudar(index, 'intervalo', v)} />
            </View>

            <TouchableOpacity
                style={[est.uniDia, item.isFolga && { opacity: 0.5 }]}
                disabled={item.isFolga}
                onPress={() => aoEscolherUnidade(index)}
                activeOpacity={0.75}
            >
                <MaterialIcons name="place" size={16} color={cores.info} />
                <Text style={est.uniDiaTexto} numberOfLines={1}>{rotuloUnidade}</Text>
                <MaterialIcons name="expand-more" size={20} color={cores.info} />
            </TouchableOpacity>

            <View style={est.resultado}>
                <Text style={est.resultadoTexto}>Efetivas <Text style={est.forte}>{item.displayEfetivas || '-'}</Text></Text>
                <Text style={est.resultadoTexto}>HE 50% <Text style={est.forteAzul}>{item.he50 > 0 ? minToTime(item.he50) : '-'}</Text></Text>
                <Text style={est.resultadoTexto}>HE 100% <Text style={est.forteAzul}>{item.he100 > 0 ? minToTime(item.he100) : '-'}</Text></Text>
                <Text style={est.resultadoTexto}>Noturno <Text style={est.forteLaranja}>{item.adNoturno > 0 ? minToTime(item.adNoturno) : '-'}</Text></Text>
            </View>
        </View>
    );
});

export default function LancamentoHoraExtraMobile({ modulo: moduloProp }) {
  const router = useRouter();
  const params = useLocalSearchParams();
  const logado = useSessaoObrigatoria();
  const espacoInferior = useEspacoInferior(110);

  // Identidade da sessão (nunca dos parâmetros da rota).
  const idUsuarioLogado = getIdUsuario();

  // MÓDULO: vem da prop (wrapper /projetos) ou dos params.
  //   IMPLANTACAO -> /hora-extra/*           (tab_hora_extra_*)
  //   PROJETOS    -> /projetos/hora-extra/*  (tab_proj_hora_extra_*, isolado)
  const modulo = moduloProp || params.modulo || MODULO.IMPLANTACAO;
  const isProjetos = modulo === MODULO.PROJETOS;
  const apiBase = apiBaseDoModulo(modulo);
  const lotacaoFixa = params.lotacao ? String(params.lotacao) : null;
  const nomeLotacao = params.nome_lotacao || '';
  const isAdminOrGestor = ehGestorHE();

  // Permissões iguais ao web: Implantação -> Admin/Gestor ou regra 'hora_extra';
  // Projetos -> Admin ou regra 'proj_hora_extra'.
  const perm = usePermissoes(CHAVES.horaExtra[modulo]);
  const podeNovo = (!isProjetos && isAdminOrGestor) || perm.podeNovo;
  const podeEditar = (!isProjetos && isAdminOrGestor) || perm.podeEditar;

  const [modoLista, setModoLista] = useState(true);
  const [mesAno, setMesAno] = useState(mesAtual());

  const [colaboradores, setColaboradores] = useState([]);
  const [projetos, setProjetos] = useState([]);
  const [unidades, setUnidades] = useState([]);
  // Catálogo ACUMULADO de unidades de todos os projetos visitados no mês (id_unidade -> {nome_unidade, id_projeto}).
  const [catUnidades, setCatUnidades] = useState({});
  const [historico, setHistorico] = useState([]);

  const [idLancamentoAtual, setIdLancamentoAtual] = useState(null);

  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [projetoSelecionado, setProjetoSelecionado] = useState('');
  const [unidadeSelecionada, setUnidadeSelecionada] = useState('');
  const [rangeUnidade, setRangeUnidade] = useState({ de: '', ate: '' });
  const [diaUniAlvo, setDiaUniAlvo] = useState(null);

  const [configJornada, setConfigJornada] = useState({ entrada: '08:00', saida: '17:00', intervalo: '01:00' });
  const [showConfig, setShowConfig] = useState(false);
  const [showCalc, setShowCalc] = useState(false);

  const [calcHE, setCalcHE] = useState({
      salario: '', cargaHoraria: '200', horas50: '00:00', horas100: '00:00',
      horasNoturnas: '00:00', diasUteis: '25', diasDsr: '5', dependentes: '0'
  });

  const [linhas, setLinhas] = useState([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ocupado, setOcupado] = useState(false); // abrindo / salvando / excluindo

  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [seletor, setSeletor] = useState(null); // 'colab' | 'proj' | 'uni' | 'uniDia'

  // Jornada padrão: o cálculo lê sempre a versão atual por ref (DiaCard estável).
  const jornadaRef = useRef(configJornada);
  useEffect(() => { jornadaRef.current = configJornada; }, [configJornada]);

  useEffect(() => {
      if (!logado) return;
      carregarAuxiliares();
      carregarHistorico();
      AsyncStorage.getItem('configJornada')
          .then(s => { if (s) setConfigJornada(prev => ({ ...prev, ...JSON.parse(s) })); })
          .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logado]);

  // Grava a jornada padrão 600 ms depois da última tecla.
  useEffect(() => {
      const t = setTimeout(() => { AsyncStorage.setItem('configJornada', JSON.stringify(configJornada)).catch(() => {}); }, 600);
      return () => clearTimeout(t);
  }, [configJornada]);

  useEffect(() => {
      if (!modoLista && usuarioSelecionado && mesAno && !idLancamentoAtual) gerarGradeDias();
      if (modoLista) setCalcHE(prev => ({ ...prev, salario: '' }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesAno, usuarioSelecionado, modoLista, idLancamentoAtual]);

  const carregarAuxiliares = async () => {
      const [resProj, resUsers] = await Promise.allSettled([
          api.get('/projetos'),
          api.get(isProjetos && lotacaoFixa ? `/implantadores?id_projeto=${lotacaoFixa}` : '/implantadores')
      ]);
      if (resProj.status === 'fulfilled') {
          const lista = (Array.isArray(resProj.value.data) ? resProj.value.data : []).filter(p => p.ativo);
          // Projetos: travado na lotação escolhida no painel (igual ao web).
          setProjetos(isProjetos && lotacaoFixa ? lista.filter(p => String(p.id_projeto) === lotacaoFixa) : lista);
      }
      if (resUsers.status === 'fulfilled') {
          setColaboradores((Array.isArray(resUsers.value.data) ? resUsers.value.data : []).filter(u => u.ativo !== false && u.ativo !== 0));
      }
      if (!isAdminOrGestor) setUsuarioSelecionado(String(idUsuarioLogado));
  };

  const carregarHistorico = async () => {
      try {
          // O backend define pelo token quem vê o quê (perfil não vai mais na URL).
          const res = await api.get(`${apiBase}/hora-extra/buscar`);
          const ordenado = (Array.isArray(res.data) ? res.data : []).sort((a, b) => {
              if (a.mes_referencia > b.mes_referencia) return -1;
              if (a.mes_referencia < b.mes_referencia) return 1;
              return (a.colaborador || '').localeCompare(b.colaborador || '');
          });
          setHistorico(ordenado);
      } catch (error) { setHistorico([]); }
      finally { setCarregandoLista(false); setRefreshing(false); }
  };

  // Acumula unidades no catálogo sem perder as de projetos anteriores.
  const mergeCatalogo = (lista, idProjeto) => {
      setCatUnidades(prev => {
          const novo = { ...prev };
          (lista || []).forEach(u => { novo[u.id_unidade] = { nome_unidade: u.nome_unidade, id_projeto: idProjeto ?? u.id_projeto ?? null }; });
          return novo;
      });
  };

  const buscarUnidades = async (idProj) => {
      const r = await api.get(`/unidades/buscar?projeto=${idProj}&status=true&limite=1000`);
      const lista = r.data?.dados || r.data;
      return Array.isArray(lista) ? lista : [];
  };

  const calcularLinha = useCallback((dia, entrada, saida, intervalo, isFeriado, isFolga) => {
      if (isFolga) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: 'FOLGA' };
      if (!entrada || !saida || entrada.length < 5 || saida.length < 5) return { horasEfetivas: 0, he50: 0, he100: 0, adNoturno: 0, displayEfetivas: '' };

      let mEntrada = timeToMin(entrada); let mSaida = timeToMin(saida); const mIntervalo = timeToMin(intervalo);
      if (mSaida < mEntrada) mSaida += 1440;
      let totalMinutos = mSaida - mEntrada - mIntervalo; if (totalMinutos < 0) totalMinutos = 0;

      let minutosNoturnos = 0; const inicioNoturno = 1320; const fimNoturno = 1740;
      const startOverlap = Math.max(mEntrada, inicioNoturno); const endOverlap = Math.min(mSaida, fimNoturno);
      if (startOverlap < endOverlap) minutosNoturnos = endOverlap - startOverlap;
      if (mEntrada < 300) { const fimMadrugada = Math.min(mSaida, 300); if (mEntrada < fimMadrugada) minutosNoturnos += (fimMadrugada - mEntrada); }

      let he50 = 0; let he100 = 0;
      const diaSemana = dia.getDay();
      const isVirada = mSaida > 1440;
      const diaSemana2 = (diaSemana + 1) % 7;

      // Abate o intervalo do maior período para evitar horas quebradas.
      let efetivoDia1 = totalMinutos;
      let efetivoDia2 = 0;
      if (isVirada) {
          const minDia1 = 1440 - mEntrada;
          const minDia2 = mSaida - 1440;
          if (minDia1 >= minDia2) { efetivoDia1 = minDia1 - mIntervalo; efetivoDia2 = minDia2; }
          else { efetivoDia1 = minDia1; efetivoDia2 = minDia2 - mIntervalo; }
          if (efetivoDia1 < 0) { efetivoDia2 += efetivoDia1; efetivoDia1 = 0; }
          if (efetivoDia2 < 0) { efetivoDia1 += efetivoDia2; efetivoDia2 = 0; }
      }

      const addHE = (mins, dSem, isFer) => { if (dSem === 0 || isFer) he100 += mins; else he50 += mins; };

      if (diaSemana === 0 || isFeriado || diaSemana === 6) {
          addHE(efetivoDia1, diaSemana, isFeriado);
          if (efetivoDia2 > 0) addHE(efetivoDia2, diaSemana2, false);
      } else {
          const j = jornadaRef.current;
          const jornadaPadraoMin = (timeToMin(j.saida) - timeToMin(j.entrada)) - timeToMin(j.intervalo);
          if (totalMinutos > jornadaPadraoMin) {
              const totalExcedente = totalMinutos - jornadaPadraoMin;
              if (isVirada && diaSemana === 5) {
                  const heNoSabado = Math.min(totalExcedente, efetivoDia2);
                  addHE(totalExcedente - heNoSabado, diaSemana, isFeriado);
                  addHE(heNoSabado, diaSemana2, false);
              } else {
                  addHE(totalExcedente, diaSemana, isFeriado);
              }
          }
      }

      return { horasEfetivas: totalMinutos, he50, he100, adNoturno: minutosNoturnos, displayEfetivas: minToTime(totalMinutos) };
  }, []);

  const gerarGradeDias = (ym = mesAno) => {
      if (!ym) return;
      const [ano, mes] = ym.split('-').map(Number);
      const diasNoMes = new Date(ano, mes, 0).getDate();
      const j = jornadaRef.current;
      const novaLista = [];
      for (let i = 1; i <= diasNoMes; i++) {
          const dataObj = new Date(ano, mes - 1, i);
          const diaSemana = dataObj.getDay();
          const isFDS = diaSemana === 0 || diaSemana === 6;
          const isFolga = isFDS;
          const _entrada = isFolga ? '' : j.entrada;
          const _saida = isFolga ? '' : j.saida;
          const _intervalo = isFolga ? '' : j.intervalo;
          novaLista.push({
              dia: i, dataObj, diaSemanaStr: DIAS_SEMANA[diaSemana],
              isFeriado: false, isFolga, isFDS,
              entrada: _entrada, saida: _saida, intervalo: _intervalo,
              ...calcularLinha(dataObj, _entrada, _saida, _intervalo, false, isFolga),
              id_unidade: unidadeSelecionada ? parseInt(unidadeSelecionada) : null,
              id_projeto: projetoSelecionado ? parseInt(projetoSelecionado) : null,
              modificado: false
          });
      }
      setLinhas(novaLista);
  };

  const handleVerLancamento = async (lancamento) => {
      if (!podeEditar) return Alert.alert('Aviso', 'Sem permissão para edição.');
      setOcupado(true);
      try {
          const res = await api.get(`${apiBase}/hora-extra/detalhes/${lancamento.id_lancamento}`);
          const detalhes = res.data?.detalhes || [];

          setIdLancamentoAtual(lancamento.id_lancamento);
          setMesAno(lancamento.mes_referencia);
          setUsuarioSelecionado(String(lancamento.id_usuario));
          setCalcHE(prev => ({ ...prev, salario: '' }));

          // Unidades de TODOS os projetos do mês (+ principal), em PARALELO.
          const projetosDoMes = new Set(detalhes.map(d => d.id_projeto).filter(Boolean).map(Number));
          const idProj = lancamento.id_projeto ? parseInt(lancamento.id_projeto) : null;
          if (idProj) projetosDoMes.add(idProj);
          const ids = [...projetosDoMes];
          const resultados = await Promise.allSettled(ids.map(buscarUnidades));
          resultados.forEach((r, i) => {
              if (r.status !== 'fulfilled') return;
              mergeCatalogo(r.value, ids[i]);
              if (ids[i] === idProj) setUnidades(r.value);
          });

          setProjetoSelecionado(idProj || '');
          setUnidadeSelecionada(idProj && lancamento.id_unidade ? parseInt(lancamento.id_unidade) : '');

          if (detalhes.length > 0) {
              const [anoRef, mesRef] = lancamento.mes_referencia.split('-').map(Number);
              setLinhas(detalhes.map(d => {
                  const dataObj = new Date(anoRef, mesRef - 1, d.dia_numero);
                  const diaSemana = dataObj.getDay();
                  return {
                      dia: d.dia_numero, dataObj, diaSemanaStr: DIAS_SEMANA[diaSemana],
                      isFeriado: d.is_feriado, isFolga: d.is_folga, isFDS: diaSemana === 0 || diaSemana === 6,
                      entrada: d.entrada, saida: d.saida, intervalo: d.intervalo,
                      ...calcularLinha(dataObj, d.entrada, d.saida, d.intervalo, d.is_feriado, d.is_folga),
                      id_unidade: d.id_unidade ?? null,
                      id_projeto: d.id_projeto ?? idProj,
                      modificado: false
                  };
              }));
              setModoLista(false);
          } else {
              setModoLista(false);
              gerarGradeDias(lancamento.mes_referencia); // lançamento sem dias: monta a grade (igual ao web)
          }
      } catch (error) {
          Alert.alert('Erro', error?.response?.status === 403 ? 'Sem permissão para este lançamento.' : 'Falha ao carregar detalhes.');
      } finally { setOcupado(false); }
  };

  const selecionarProjeto = async (item) => {
      const id = parseInt(item.id_projeto);
      setProjetoSelecionado(id);
      setUnidadeSelecionada('');
      setSeletor(null);
      if (!id) { setUnidades([]); return; }
      try {
          const lista = await buscarUnidades(id);
          setUnidades(lista);
          mergeCatalogo(lista, id);
      } catch (e) { setUnidades([]); }
  };

  const handleNovoLancamento = () => {
      if (!podeNovo) return Alert.alert('Sem permissão', 'Você não tem permissão para criar lançamentos.');
      setIdLancamentoAtual(null);
      setMesAno(mesAtual());
      setProjetoSelecionado('');
      setUnidadeSelecionada('');
      setLinhas([]);
      setCalcHE(prev => ({ ...prev, salario: '' }));
      setUsuarioSelecionado(isAdminOrGestor ? '' : String(idUsuarioLogado));
      setModoLista(false);
      // Projetos: já entra com a lotação do painel selecionada.
      if (isProjetos && lotacaoFixa) selecionarProjeto({ id_projeto: lotacaoFixa });
  };

  const handleExcluir = (id) => {
      if (!podeEditar) return;
      Alert.alert('Atenção', 'Deseja realmente excluir este lançamento?', [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Excluir', style: 'destructive', onPress: async () => {
              setOcupado(true);
              try {
                  await api.delete(`${apiBase}/hora-extra/${id}`);
                  const nomeColab = colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || getNomeUsuario();
                  registrarRastreio(api, {
                      usuario: getNomeUsuario(),
                      tipo_registro: 'EXCLUSAO_HORA_EXTRA',
                      detalhes_registro: `[EXCLUÍDO] Ref: ${mesAno} | Colab: ${nomeColab} | Proj: ${nomeProjetoPorId(projetoSelecionado)} | Uni: ${nomeUnidadePorId(unidadeSelecionada)}`
                  });
                  Alert.alert('Sucesso', 'Registro apagado.');
                  setModoLista(true);
                  carregarHistorico();
              } catch (error) { Alert.alert('Erro', error?.response?.data?.erro || 'Falha ao excluir.'); }
              finally { setOcupado(false); }
          }}
      ]);
  };

  const onChangeMonth = (event, data) => {
      setShowMonthPicker(false);
      if (event?.type !== 'dismissed' && data) {
          setMesAno(`${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}`);
      }
  };

  // Estável: DiaCard só redesenha o dia alterado.
  const atualizarLinha = useCallback((index, campo, valor) => {
      setLinhas(prev => {
          const nova = [...prev];
          const item = { ...nova[index], [campo]: valor, modificado: true };
          if (['entrada', 'saida', 'intervalo', 'isFeriado', 'isFolga'].includes(campo)) {
              if (campo === 'isFolga' && valor === true) { item.entrada = ''; item.saida = ''; item.intervalo = ''; }
              Object.assign(item, calcularLinha(item.dataObj, item.entrada, item.saida, item.intervalo, item.isFeriado, item.isFolga));
          }
          nova[index] = item;
          return nova;
      });
  }, [calcularLinha]);

  const escolherUnidadeDia = useCallback((index) => { setDiaUniAlvo(index); setSeletor('uniDia'); }, []);

  const totais = useMemo(() => linhas.reduce((acc, l) => ({
      he50: acc.he50 + l.he50, he100: acc.he100 + l.he100,
      adNoturno: acc.adNoturno + l.adNoturno, horasEfetivas: acc.horasEfetivas + l.horasEfetivas
  }), { he50: 0, he100: 0, adNoturno: 0, horasEfetivas: 0 }), [linhas]);

  // Quebra das horas extras POR UNIDADE (só dias que geraram HE).
  const totaisPorUnidade = useMemo(() => {
      const map = {};
      for (const l of linhas) {
          if (!l.he50 && !l.he100 && !l.adNoturno) continue;
          const key = l.id_unidade || 'SEM';
          if (!map[key]) map[key] = { id_unidade: l.id_unidade || null, id_projeto: l.id_projeto || null, he50: 0, he100: 0, adNoturno: 0 };
          map[key].he50 += l.he50; map[key].he100 += l.he100; map[key].adNoturno += l.adNoturno;
      }
      return Object.values(map).sort((a, b) => (b.he50 + b.he100 + b.adNoturno) - (a.he50 + a.he100 + a.adNoturno));
  }, [linhas]);

  const projetosNoMes = useMemo(() => [...new Set(totaisPorUnidade.map(t => t.id_projeto).filter(Boolean))], [totaisPorUnidade]);

  const nomeUnidadePorId = (id) => {
      if (!id) return 'Sem unidade';
      return catUnidades[id]?.nome_unidade || unidades.find(u => String(u.id_unidade) === String(id))?.nome_unidade || `Unidade ${id}`;
  };
  const nomeProjetoPorId = (id) => {
      if (!id) return 'Sem projeto';
      return projetos.find(p => String(p.id_projeto) === String(id))?.nome_projeto || `Projeto ${id}`;
  };

  // Lista plana do catálogo para o seletor do dia ("Projeto · Unidade" quando há vários projetos).
  const catUnidadesLista = useMemo(() => {
      const projs = new Set(Object.values(catUnidades).map(v => v.id_projeto));
      const multi = projetosNoMes.length > 1 || projs.size > 1;
      return Object.entries(catUnidades).map(([id, info]) => ({
          id_unidade: Number(id),
          id_projeto: info.id_projeto,
          label: multi ? `${nomeProjetoPorId(info.id_projeto)} · ${info.nome_unidade}` : info.nome_unidade
      }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catUnidades, projetosNoMes, projetos]);

  const setUnidadeLinha = (idx, idUni) => {
      const id = idUni ? parseInt(idUni) : null;
      const idProj = id ? (catUnidades[id]?.id_projeto ?? null) : null;
      setLinhas(prev => { const nova = [...prev]; nova[idx] = { ...nova[idx], id_unidade: id, id_projeto: idProj, modificado: true }; return nova; });
  };

  // Unidade padrão do topo: preenche só dias úteis SEM unidade.
  const aplicarUnidadePadrao = (idUni) => {
      const id = idUni ? parseInt(idUni) : null;
      const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
      setLinhas(prev => prev.map(l => (l.isFolga || l.id_unidade) ? l : { ...l, id_unidade: id, id_projeto: idProj, modificado: true }));
  };
  const aplicarUnidadeTodos = () => {
      const id = unidadeSelecionada ? parseInt(unidadeSelecionada) : null;
      const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
      setLinhas(prev => prev.map(l => l.isFolga ? l : { ...l, id_unidade: id, id_projeto: idProj, modificado: true }));
  };
  const aplicarUnidadeIntervalo = () => {
      const de = parseInt(rangeUnidade.de), ate = parseInt(rangeUnidade.ate);
      const id = unidadeSelecionada ? parseInt(unidadeSelecionada) : null;
      const idProj = projetoSelecionado ? parseInt(projetoSelecionado) : null;
      if (!de || !ate || de > ate) return Alert.alert('Atenção', 'Informe um intervalo de dias válido (De ≤ Até).');
      if (!id) return Alert.alert('Atenção', 'Selecione a unidade padrão para aplicar no período.');
      setLinhas(prev => prev.map(l => (l.dia >= de && l.dia <= ate && !l.isFolga) ? { ...l, id_unidade: id, id_projeto: idProj, modificado: true } : l));
  };

  useEffect(() => {
      setCalcHE(prev => ({
          ...prev,
          horas50: minToTime(totais.he50),
          horas100: minToTime(totais.he100),
          horasNoturnas: minToTime(totais.adNoturno)
      }));
  }, [totais]);

  function handleSalvar() {
      if (idLancamentoAtual && !podeEditar) return Alert.alert('Erro', 'Sem permissão para editar.');
      if (!idLancamentoAtual && !podeNovo) return Alert.alert('Erro', 'Sem permissão para criar.');
      if (!mesAno) return Alert.alert('Atenção', 'Selecione o mês de referência.');
      if (!usuarioSelecionado || !projetoSelecionado) return Alert.alert('Atenção', 'Selecione o Colaborador e o Projeto.');
      const semUnidade = linhas.some(l => (l.he50 || l.he100 || l.adNoturno) && !l.id_unidade);
      if (semUnidade) {
          return Alert.alert('Dias sem unidade', 'Há dias com hora extra sem unidade atribuída. Salvar mesmo assim?', [
              { text: 'Voltar e ajustar', style: 'cancel' },
              { text: 'Salvar assim mesmo', onPress: () => executarSalvar() }
          ]);
      }
      executarSalvar();
  }

  async function executarSalvar() {
      setOcupado(true);
      const principal = totaisPorUnidade[0] || null;
      const payload = {
          id_lancamento: idLancamentoAtual,
          id_usuario: parseInt(usuarioSelecionado),
          id_projeto: principal?.id_projeto || (projetoSelecionado ? parseInt(projetoSelecionado) : null),
          id_unidade: principal?.id_unidade || (unidadeSelecionada ? parseInt(unidadeSelecionada) : null),
          mes_referencia: mesAno,
          detalhes_dias: linhas,
          totais
      };

      try {
          await api.post(`${apiBase}/hora-extra/salvar`, payload);

          // Auditoria com GPS depois de salvar, sem bloquear a tela.
          const [ano, mes] = mesAno.split('-');
          const alterados = linhas.filter(l => l.modificado).map(l =>
              (l.isFolga || (!l.entrada && !l.saida))
                  ? `${String(l.dia).padStart(2, '0')}/${mes}/${ano} (Limpo/Folga)`
                  : `${String(l.dia).padStart(2, '0')}/${mes}/${ano} ${l.entrada} - ${l.saida}`);
          registrarRastreio(api, {
              usuario: getNomeUsuario(),
              tipo_registro: 'LANCAMENTO_HORA_EXTRA',
              detalhes_registro: alterados.length === 0 ? `Ref: ${mesAno}`
                  : alterados.length > 4 ? `${alterados.slice(0, 4).join('\n')}\n... (+${alterados.length - 4} dias)`
                  : alterados.join('\n')
          });

          Alert.alert('Sucesso', 'Lançamento salvo.');
          setModoLista(true);
          carregarHistorico();
      } catch (error) {
          Alert.alert('Erro', error?.response?.data?.erro || 'Falha ao salvar dados.');
      } finally { setOcupado(false); }
  }

  const handleSalarioChange = (text) => {
      const v = text.replace(/\D/g, '');
      if (v === '') return setCalcHE(prev => ({ ...prev, salario: '' }));
      const fmt = (parseInt(v, 10) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      setCalcHE(prev => ({ ...prev, salario: fmt }));
  };

  const timeStrToDecimal = (timeStr) => {
      if (!timeStr) return 0;
      if (timeStr.includes(':')) { const [h, m] = timeStr.split(':'); return (Number(h) || 0) + (Number(m) || 0) / 60; }
      return Number(timeStr) || 0;
  };

  const resultadosCalc = useMemo(() => {
      const sal = parseFloat(calcHE.salario.replace(/\./g, '').replace(',', '.')) || 0;
      const ch = parseFloat(calcHE.cargaHoraria) || 220;
      const h50 = timeStrToDecimal(calcHE.horas50);
      const h100 = timeStrToDecimal(calcHE.horas100);
      const hNot = timeStrToDecimal(calcHE.horasNoturnas);
      const du = parseFloat(calcHE.diasUteis) || 25;
      const dsr = parseFloat(calcHE.diasDsr) || 5;

      const horaBase = ch > 0 ? sal / ch : 0;
      const valorHE50 = horaBase * 1.5 * h50;
      const valorHE100 = horaBase * 2.0 * h100;
      const valorNoturno = horaBase * 1.5 * 0.3 * hNot;
      const totalExtras = valorHE50 + valorHE100 + valorNoturno;
      const valorDSR = du > 0 ? (totalExtras / du) * dsr : 0;
      const totalReceber = sal + totalExtras + valorDSR;

      // ---- Descontos estimados (CLT 2026) ----
      const dependentes = parseInt(calcHE.dependentes) || 0;
      const inss = calcularINSS(totalReceber);
      const vt = sal * VT_ALIQUOTA;
      const irrf = calcularIRRF(totalReceber, inss, dependentes);
      const totalDescontos = inss + vt + irrf;

      const moeda = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
      return {
          horaBase: moeda(horaBase), valorHE50: moeda(valorHE50), valorHE100: moeda(valorHE100),
          valorNoturno: moeda(valorNoturno), valorDSR: moeda(valorDSR), totalReceber: moeda(totalReceber),
          inss: moeda(inss), vt: moeda(vt), irrf: moeda(irrf),
          totalDescontos: moeda(totalDescontos), liquido: moeda(totalReceber - totalDescontos)
      };
  }, [calcHE]);

  /* ===================== RENDER ===================== */
  const renderHistoricoItem = ({ item }) => {
    const st = ESTILO_STATUS[String(calcularStatusVisual(item)).trim().toUpperCase()] || ESTILO_STATUS.PENDENTE;
    return (
        <Cartao style={est.hist} aoTocar={podeEditar ? () => handleVerLancamento(item) : undefined}>
            <View style={est.histTopo}>
                <View style={est.histMes}>
                    <MaterialIcons name="event-note" size={16} color={cores.horas} />
                    <Text style={est.histMesTexto}>{nomeMes(item.mes_referencia)}</Text>
                </View>
                <Etiqueta texto={st.rotulo} cor={st.cor} fundo={st.fundo} />
            </View>
            <Text style={est.histColab} numberOfLines={1}>{item.colaborador}</Text>
            <View style={est.histLinha}>
                <MaterialIcons name="folder-open" size={14} color={cores.textoFraco} />
                <Text style={est.histInfo} numberOfLines={1}>{item.nome_projeto}{item.qtd_projetos > 1 ? ` (+${item.qtd_projetos - 1})` : ''}</Text>
            </View>
            <View style={est.histLinha}>
                <MaterialIcons name="place" size={14} color={cores.textoFraco} />
                <Text style={est.histInfo} numberOfLines={1}>{item.nome_unidade}{item.qtd_unidades > 1 ? ` (+${item.qtd_unidades - 1})` : ''}</Text>
            </View>
        </Cartao>
    );
  };

  const renderDia = ({ item, index }) => {
      const rotulo = (item.id_unidade ? nomeUnidadePorId(item.id_unidade) : 'Unidade -')
          + (projetosNoMes.length > 1 && item.id_projeto ? `  ·  ${nomeProjetoPorId(item.id_projeto)}` : '');
      return <DiaCard item={item} index={index} rotuloUnidade={rotulo} aoMudar={atualizarLinha} aoEscolherUnidade={escolherUnidadeDia} />;
  };

  const campoCalc = (rotulo, chave, extra = {}) => (
      <View style={[est.calcCampo, extra.largura && { width: extra.largura }]}>
          <Text style={est.horaRotulo}>{rotulo}</Text>
          <TextInput
              style={est.horaInput} keyboardType="numeric" placeholderTextColor={cores.textoFraco}
              value={calcHE[chave]} placeholder={extra.placeholder}
              maxLength={extra.mascaraHora ? 5 : undefined}
              onChangeText={extra.aoMudar || (t => setCalcHE(prev => ({ ...prev, [chave]: extra.mascaraHora ? applyTimeMask(t) : t.replace(/[^\d.,]/g, '') })))}
          />
      </View>
  );

  const cabecalhoFormulario = (
    <View style={est.formulario}>
        <Cartao style={est.bloco}>
            <Text style={est.blocoTitulo}>Lançamento</Text>
            <CampoSeletor
                rotulo="Mês de referência" obrigatorio
                valor={nomeMes(mesAno)}
                icone="calendar-today"
                desabilitado={!!idLancamentoAtual}
                aoTocar={() => setShowMonthPicker(true)}
            />
            {isAdminOrGestor && (
                <CampoSeletor
                    rotulo="Colaborador" obrigatorio
                    valor={colaboradores.find(c => String(c.id_usuario) === String(usuarioSelecionado))?.nome_completo || ''}
                    aoTocar={() => setSeletor('colab')}
                />
            )}
            <CampoSeletor
                rotulo="Projeto" obrigatorio
                valor={projetos.find(p => String(p.id_projeto) === String(projetoSelecionado))?.nome_projeto || ''}
                placeholder={isProjetos ? (nomeLotacao || 'Lotação') : 'Selecione...'}
                desabilitado={isProjetos && !!lotacaoFixa}
                aoTocar={() => setSeletor('proj')}
            />
            <CampoSeletor
                rotulo="Unidade padrão"
                valor={unidades.find(u => String(u.id_unidade) === String(unidadeSelecionada))?.nome_unidade || ''}
                placeholder={projetoSelecionado ? 'Selecione...' : 'Selecione o projeto primeiro'}
                desabilitado={!projetoSelecionado}
                aoTocar={() => setSeletor('uni')}
                style={{ marginBottom: espaco.sm }}
            />
            {!isProjetos && (
                <Text style={est.dica}>Troque o projeto para lançar outro período - os dias já marcados não se perdem.</Text>
            )}

            {linhas.length > 0 && unidadeSelecionada ? (
                <View style={est.periodo}>
                    <Text style={est.periodoTitulo}>Aplicar a unidade padrão por período</Text>
                    <View style={est.periodoLinha}>
                        <TextInput style={est.periodoInput} keyboardType="numeric" maxLength={2} placeholder="De" placeholderTextColor={cores.textoFraco}
                            value={rangeUnidade.de} onChangeText={t => setRangeUnidade(prev => ({ ...prev, de: t.replace(/\D/g, '') }))} />
                        <TextInput style={est.periodoInput} keyboardType="numeric" maxLength={2} placeholder="Até" placeholderTextColor={cores.textoFraco}
                            value={rangeUnidade.ate} onChangeText={t => setRangeUnidade(prev => ({ ...prev, ate: t.replace(/\D/g, '') }))} />
                        <Botao titulo="Aplicar" cor={cores.info} aoTocar={aplicarUnidadeIntervalo} larguraTotal={false} style={{ flex: 1 }} />
                    </View>
                    <Botao titulo="Aplicar a todos os dias úteis" variante="fantasma" cor={cores.info} aoTocar={aplicarUnidadeTodos} />
                </View>
            ) : null}
        </Cartao>

        <TouchableOpacity style={est.secaoToggle} onPress={() => setShowConfig(v => !v)} activeOpacity={0.8}>
            <MaterialIcons name="settings" size={20} color={cores.info} />
            <Text style={[est.secaoToggleTexto, { color: cores.info }]}>Jornada padrão</Text>
            <MaterialIcons name={showConfig ? 'expand-less' : 'expand-more'} size={22} color={cores.info} />
        </TouchableOpacity>
        {showConfig && (
            <Cartao style={est.bloco}>
                <View style={est.horas}>
                    <CampoHora rotulo="Entrada" valor={configJornada.entrada} aoMudar={v => setConfigJornada(p => ({ ...p, entrada: v }))} />
                    <CampoHora rotulo="Saída" valor={configJornada.saida} aoMudar={v => setConfigJornada(p => ({ ...p, saida: v }))} />
                    <CampoHora rotulo="Intervalo" valor={configJornada.intervalo} aoMudar={v => setConfigJornada(p => ({ ...p, intervalo: v }))} />
                </View>
                <Botao titulo="Aplicar horários na tabela" icone="refresh" cor={cores.info} aoTocar={() => gerarGradeDias()} />
            </Cartao>
        )}

        <TouchableOpacity style={est.secaoToggle} onPress={() => setShowCalc(v => !v)} activeOpacity={0.8}>
            <MaterialIcons name="calculate" size={20} color={cores.sucesso} />
            <Text style={[est.secaoToggleTexto, { color: cores.sucesso }]}>Calculadora CLT</Text>
            <MaterialIcons name={showCalc ? 'expand-less' : 'expand-more'} size={22} color={cores.sucesso} />
        </TouchableOpacity>
        {showCalc && (
            <Cartao style={est.bloco}>
                <View style={est.calcGrade}>
                    {campoCalc('Salário (R$)', 'salario', { largura: '48%', placeholder: '0,00', aoMudar: handleSalarioChange })}
                    {campoCalc('Carga mensal', 'cargaHoraria', { largura: '48%' })}
                    {campoCalc('HE 50%', 'horas50', { largura: '31%', mascaraHora: true, placeholder: '00:00' })}
                    {campoCalc('HE 100%', 'horas100', { largura: '31%', mascaraHora: true, placeholder: '00:00' })}
                    {campoCalc('Ad. noturno', 'horasNoturnas', { largura: '31%', mascaraHora: true, placeholder: '00:00' })}
                    {campoCalc('Dias úteis', 'diasUteis', { largura: '31%' })}
                    {campoCalc('DSR', 'diasDsr', { largura: '31%' })}
                    {campoCalc('Dependentes', 'dependentes', { largura: '31%' })}
                </View>

                <View style={est.calcResultado}>
                    <LinhaValor rotulo="Hora base" valor={resultadosCalc.horaBase} />
                    <LinhaValor rotulo="HE 50%" valor={resultadosCalc.valorHE50} />
                    <LinhaValor rotulo="HE 100%" valor={resultadosCalc.valorHE100} />
                    <LinhaValor rotulo="Noturno (50%+30%)" valor={resultadosCalc.valorNoturno} />
                    <LinhaValor rotulo="DSR" valor={resultadosCalc.valorDSR} />
                    <View style={est.divisor} />
                    <LinhaValor rotulo="TOTAL BRUTO (MÊS)" valor={resultadosCalc.totalReceber} cor={cores.sucesso} />
                </View>
                <View style={[est.calcResultado, { backgroundColor: cores.erroClara }]}>
                    <LinhaValor rotulo="INSS" valor={`- ${resultadosCalc.inss}`} cor={cores.erro} />
                    <LinhaValor rotulo="Vale-transporte (6%)" valor={`- ${resultadosCalc.vt}`} cor={cores.erro} />
                    <LinhaValor rotulo="IRRF" valor={`- ${resultadosCalc.irrf}`} cor={cores.erro} />
                    <View style={est.divisor} />
                    <LinhaValor rotulo="LÍQUIDO ESTIMADO" valor={resultadosCalc.liquido} cor={cores.info} />
                </View>
                <Text style={est.aviso}>
                    *Estimativa CLT 2026: INSS (Portaria MPS/MF 13/2026), IRRF pela Lei 15.270/2025 (isenção até R$ 5.000, redução até R$ 7.350) e VT de 6%. Não substitui o contracheque oficial do DP; convenções e outros descontos podem variar.
                </Text>
            </Cartao>
        )}

        {linhas.length > 0 && <Text style={est.secao}>Dias do mês</Text>}
    </View>
  );

  const rodapeFormulario = (
    <View style={est.formulario}>
        {linhas.length > 0 && (
            <Cartao style={est.bloco}>
                <Text style={est.blocoTitulo}>Resumo mensal</Text>
                <LinhaValor rotulo="Carga base" valor="200:00" />
                <LinhaValor rotulo="Trabalhadas" valor={minToTime(totais.horasEfetivas)} />
                <View style={est.divisor} />
                <LinhaValor rotulo="Horas extras 50%" valor={minToTime(totais.he50)} cor={cores.info} />
                <LinhaValor rotulo="Horas extras 100%" valor={minToTime(totais.he100)} cor={cores.info} />
                <LinhaValor rotulo="Adicional noturno" valor={minToTime(totais.adNoturno)} cor={cores.horas} />
                {totaisPorUnidade.length > 0 && (
                    <>
                        <View style={est.divisor} />
                        <Text style={est.porUnidadeTitulo}>Horas extras por unidade</Text>
                        {totaisPorUnidade.map((t, i) => (
                            <View key={i} style={est.porUnidade}>
                                {projetosNoMes.length > 1 && <Text style={est.porUnidadeProj}>{nomeProjetoPorId(t.id_projeto)}</Text>}
                                <Text style={est.porUnidadeNome}>{nomeUnidadePorId(t.id_unidade)}</Text>
                                <LinhaValor rotulo="50% / 100% / Not." valor={`${minToTime(t.he50)} / ${minToTime(t.he100)} / ${minToTime(t.adNoturno)}`} cor={cores.info} />
                            </View>
                        ))}
                    </>
                )}
            </Cartao>
        )}

        <View style={est.acoes}>
            <Botao titulo="Voltar" variante="secundario" aoTocar={() => setModoLista(true)} larguraTotal={false} style={{ flex: 1 }} />
            {((!idLancamentoAtual && podeNovo) || (idLancamentoAtual && podeEditar)) && (
                <Botao titulo="Salvar" icone="check" cor={cores.horas} carregando={ocupado} aoTocar={handleSalvar} larguraTotal={false} style={{ flex: 1 }} />
            )}
        </View>
        {idLancamentoAtual && podeEditar ? (
            <Botao titulo="Excluir lançamento" icone="delete-outline" variante="perigo" aoTocar={() => handleExcluir(idLancamentoAtual)} style={{ marginTop: espaco.md }} />
        ) : null}
    </View>
  );

  if (!logado) return null;

  return (
    <View style={est.raiz}>
      <Stack.Screen options={{ headerShown: false }} />

      <Cabecalho
        titulo="Horas Extras"
        subtitulo={isProjetos ? (nomeLotacao || 'Projetos') : 'Implantação'}
        cor={cores.horas}
        aoVoltar={() => (modoLista ? router.back() : setModoLista(true))}
      />

      <View style={est.corpo}>
        {modoLista ? (
            carregandoLista ? (
                <Cartao style={est.blocoLista}><Carregando cor={cores.horas} texto="Carregando lançamentos..." /></Cartao>
            ) : (
                <FlatList
                    data={historico}
                    keyExtractor={(item) => String(item.id_lancamento)}
                    renderItem={renderHistoricoItem}
                    contentContainerStyle={[est.lista, { paddingBottom: espacoInferior }]}
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} colors={[cores.horas]} tintColor={cores.horas}
                            onRefresh={() => { setRefreshing(true); carregarHistorico(); }} />
                    }
                    ListEmptyComponent={
                        <Cartao><Vazio icone="schedule" texto="Nenhum lançamento encontrado"
                            sub={podeNovo ? 'Toque em + para lançar suas horas extras.' : undefined} /></Cartao>
                    }
                />
            )
        ) : (
            <FlatList
                data={linhas}
                keyExtractor={(item) => String(item.dia)}
                renderItem={renderDia}
                ListHeaderComponent={cabecalhoFormulario}
                ListFooterComponent={rodapeFormulario}
                contentContainerStyle={{ paddingBottom: espacoInferior - 60 }}
                keyboardShouldPersistTaps="handled"
                initialNumToRender={6}
                windowSize={9}
                removeClippedSubviews={false}
                showsVerticalScrollIndicator={false}
            />
        )}
      </View>

      {modoLista && podeNovo && !carregandoLista && (
          <BotaoFlutuante icone="add" rotulo="Lançar" cor={cores.horas} aoTocar={handleNovoLancamento} />
      )}

      {ocupado && modoLista && (
          <View style={est.sobreposto}><Carregando cor={cores.horas} texto="Abrindo lançamento..." /></View>
      )}

      {showMonthPicker && (
          <DateTimePicker
              value={mesAno ? new Date(`${mesAno}-01T12:00:00`) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeMonth}
          />
      )}

      <Seletor
        visivel={seletor === 'colab'} aoFechar={() => setSeletor(null)} titulo="Colaborador"
        dados={colaboradores} campoTexto="nome_completo" campoId="id_usuario" cor={cores.horas}
        selecionado={usuarioSelecionado}
        aoSelecionar={(u) => { setUsuarioSelecionado(String(u.id_usuario)); setSeletor(null); }}
        vazio="Nenhum colaborador no seu escopo."
      />
      <Seletor
        visivel={seletor === 'proj'} aoFechar={() => setSeletor(null)} titulo="Projeto"
        dados={projetos} campoTexto="nome_projeto" campoId="id_projeto" cor={cores.horas}
        selecionado={projetoSelecionado} aoSelecionar={selecionarProjeto}
      />
      <Seletor
        visivel={seletor === 'uni'} aoFechar={() => setSeletor(null)} titulo="Unidade padrão"
        dados={unidades} campoTexto="nome_unidade" campoId="id_unidade" cor={cores.horas}
        selecionado={unidadeSelecionada}
        aoSelecionar={(u) => { setUnidadeSelecionada(u.id_unidade); aplicarUnidadePadrao(u.id_unidade); setSeletor(null); }}
        vazio="Nenhuma unidade ativa neste projeto."
      />
      <Seletor
        visivel={seletor === 'uniDia'} aoFechar={() => setSeletor(null)} titulo="Unidade do dia"
        dados={catUnidadesLista} campoTexto="label" campoId="id_unidade" cor={cores.horas}
        selecionado={diaUniAlvo !== null ? linhas[diaUniAlvo]?.id_unidade : null}
        aoSelecionar={(u) => { if (diaUniAlvo !== null) setUnidadeLinha(diaUniAlvo, u.id_unidade); setSeletor(null); }}
        vazio="Selecione um projeto no topo para carregar as unidades."
      />
    </View>
  );
}

const est = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.fundo },
  corpo: { flex: 1, marginTop: -SOBREPOSICAO },
  lista: { paddingHorizontal: espaco.xl },
  blocoLista: { marginHorizontal: espaco.xl },
  sobreposto: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(244,246,249,0.75)', justifyContent: 'center' },

  hist: { marginBottom: espaco.md },
  histTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaco.sm },
  histMes: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  histMesTexto: { ...tipo.corpoForte, color: cores.texto },
  histColab: { ...tipo.subtitulo, fontSize: 16, color: cores.texto, marginBottom: 4 },
  histLinha: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  histInfo: { ...tipo.legenda, color: cores.textoMedio, flexShrink: 1 },

  formulario: { paddingHorizontal: espaco.xl },
  bloco: { marginBottom: espaco.lg },
  blocoTitulo: { ...tipo.subtitulo, color: cores.texto, marginBottom: espaco.lg, fontSize: 16 },
  secao: { ...tipo.subtitulo, color: cores.texto, marginBottom: espaco.md, fontSize: 16 },
  dica: { ...tipo.legenda, color: cores.textoFraco, fontSize: 12, marginBottom: espaco.sm },

  secaoToggle: {
    flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
    backgroundColor: cores.superficie, borderRadius: raio.md,
    paddingHorizontal: espaco.lg, minHeight: 52, marginBottom: espaco.md,
    borderWidth: 1, borderColor: cores.borda
  },
  secaoToggleTexto: { ...tipo.corpoForte, flex: 1 },

  periodo: {
    backgroundColor: cores.infoClara, borderRadius: raio.md, padding: espaco.md, marginTop: espaco.md
  },
  periodoTitulo: { ...tipo.legenda, fontWeight: '800', color: cores.info, marginBottom: espaco.sm },
  periodoLinha: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
  periodoInput: {
    width: 64, height: 54, borderRadius: raio.md, borderWidth: 1.5, borderColor: cores.borda,
    backgroundColor: cores.superficie, textAlign: 'center', ...tipo.corpo, color: cores.texto
  },

  horas: { flexDirection: 'row', gap: espaco.sm, marginBottom: espaco.md },
  horaCaixa: { flex: 1 },
  horaRotulo: { ...tipo.legenda, fontSize: 12, color: cores.textoMedio, fontWeight: '700', marginBottom: 4, textAlign: 'center' },
  horaInput: {
    height: 46, borderRadius: raio.sm, borderWidth: 1.5, borderColor: cores.borda,
    backgroundColor: cores.superficieAlt, textAlign: 'center', fontSize: 16, fontWeight: '600', color: cores.texto
  },
  horaInputOff: { backgroundColor: cores.borda, color: cores.textoFraco },

  dia: {
    backgroundColor: cores.superficie, marginHorizontal: espaco.xl, marginBottom: espaco.md,
    borderRadius: raio.lg, padding: espaco.lg, borderLeftWidth: 5, borderLeftColor: cores.primaria
  },
  diaFDS: { borderLeftColor: cores.alerta, backgroundColor: '#FFFBF3' },
  diaFolga: { borderLeftColor: cores.bordaForte },
  diaTopo: { flexDirection: 'row', alignItems: 'center', marginBottom: espaco.md, gap: espaco.sm },
  diaTitulo: { ...tipo.corpoForte, color: cores.texto },
  diaSemana: { ...tipo.legenda, color: cores.textoFraco },
  chave: { alignItems: 'center' },
  chaveRotulo: { fontSize: 10, color: cores.textoMedio, fontWeight: '700' },

  uniDia: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: cores.infoClara,
    borderRadius: raio.sm, paddingHorizontal: espaco.md, minHeight: 44, marginBottom: espaco.md
  },
  uniDiaTexto: { flex: 1, marginLeft: 6, color: cores.info, fontWeight: '700', fontSize: 13 },

  resultado: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between',
    backgroundColor: cores.superficieAlt, padding: espaco.md, borderRadius: raio.sm
  },
  resultadoTexto: { fontSize: 12, color: cores.textoMedio, width: '48%', marginBottom: 4 },
  forte: { fontWeight: '800', color: cores.texto },
  forteAzul: { fontWeight: '800', color: cores.info },
  forteLaranja: { fontWeight: '800', color: cores.horas },

  calcGrade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  calcCampo: { marginBottom: espaco.md },
  calcResultado: { backgroundColor: cores.sucessoClara, borderRadius: raio.md, padding: espaco.md, marginTop: espaco.sm },
  aviso: { fontSize: 11, color: cores.textoFraco, fontStyle: 'italic', textAlign: 'center', marginTop: espaco.md, lineHeight: 15 },

  linhaValor: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4, gap: espaco.sm },
  linhaValorRotulo: { ...tipo.legenda, color: cores.textoMedio, flexShrink: 1 },
  linhaValorValor: { ...tipo.corpoForte, color: cores.texto },
  divisor: { height: 1, backgroundColor: cores.borda, marginVertical: espaco.sm },

  porUnidadeTitulo: { ...tipo.legenda, fontWeight: '800', color: cores.info, marginBottom: espaco.sm },
  porUnidade: { backgroundColor: cores.infoClara, borderRadius: raio.sm, padding: espaco.md, marginBottom: espaco.sm },
  porUnidadeProj: { ...tipo.micro, color: cores.textoFraco },
  porUnidadeNome: { ...tipo.corpoForte, color: cores.info, fontSize: 14 },

  acoes: { flexDirection: 'row', gap: espaco.md }
});
