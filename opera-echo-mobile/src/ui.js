/* ARQUIVO: src/ui.js
   Componentes visuais compartilhados do aplicativo.
   Sem dependências novas: só react-native + @expo/vector-icons. */

import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Easing,
    FlatList,
    Modal,
    PanResponder,
    Pressable,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cores, espaco, fonte, raio, sombra, tipo, toque } from './tema';

/* ========================================================================
   PADRÃO DE CABEÇALHO
   Todas as telas usam o MESMO cabeçalho (inclusive o painel inicial) e o
   primeiro bloco de conteúdo sobe exatamente SOBREPOSICAO px sobre ele.
   Antes cada tela tinha um recuo diferente (-12, -16, -20 ou nenhum) e o
   painel tinha cabeçalho próprio - por isso as alturas não batiam.
   O topo respeita a área segura (notch / barra de status): no SDK 54 o
   Android desenha atrás da barra de status (edge-to-edge) e o recuo fixo
   antigo (30/52 px) deixava o título por baixo dela em vários aparelhos.
   ======================================================================== */
export const SOBREPOSICAO = 0;
const LARGURA_ACAO = 42;

/* Container padrão com fundo. */
export function Tela({ children, style }) {
    return <View style={[{ flex: 1, backgroundColor: cores.fundo }, style]}>{children}</View>;
}

/* ========================================================================
   CABEÇALHO - curvo, com título, subtítulo e ações
   - aoVoltar: mostra a seta à esquerda
   - esquerda: conteúdo próprio à esquerda (ex.: avatar do painel)
   - direita: ação à direita (use BotaoCabecalho)
   - alinhamento: 'centro' (padrão) | 'esquerda'
   - children: conteúdo extra abaixo do título (ex.: seletor de módulo)
   ======================================================================== */
export function Cabecalho({
    titulo, subtitulo, cor = cores.primaria, aoVoltar, esquerda, direita,
    alinhamento = 'centro', children
}) {
    const insets = useSafeAreaInsets();
    const centro = alinhamento === 'centro';

    const slotEsquerdo = esquerda
        ? esquerda
        : aoVoltar
            ? <BotaoCabecalho icone="arrow-back" aoTocar={aoVoltar} rotuloAcessivel="Voltar" />
            : (centro ? <View style={{ width: LARGURA_ACAO }} /> : null);

    return (
        <View style={[est.cabecalho, { backgroundColor: cor, paddingTop: insets.top + espaco.md }]}>
            <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
            <View style={est.cabecalhoLinha}>
                {slotEsquerdo}

                <View style={[est.cabecalhoCentro, !centro && est.cabecalhoCentroEsquerda]}>
                    <Text style={est.cabecalhoTitulo} numberOfLines={1}>{titulo}</Text>
                    {subtitulo ? (
                        <Text style={est.cabecalhoSub} numberOfLines={1}>{subtitulo}</Text>
                    ) : null}
                </View>

                <View style={{ minWidth: centro ? LARGURA_ACAO : 0, alignItems: 'flex-end' }}>{direita}</View>
            </View>
            {children ? <View style={{ marginTop: espaco.lg }}>{children}</View> : null}
        </View>
    );
}

/* Botão quadrado do cabeçalho - mesmo tamanho/estilo em todas as telas.
   variante 'translucido' (padrão, ícone branco) | 'solido' (fundo branco, ícone na cor do módulo). */
export function BotaoCabecalho({ icone, aoTocar, variante = 'translucido', cor = cores.primaria, rotuloAcessivel }) {
    const solido = variante === 'solido';
    return (
        <TouchableOpacity
            onPress={aoTocar}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={rotuloAcessivel}
            style={[est.cabecalhoBotao, solido && { backgroundColor: '#FFF' }]}
        >
            <MaterialIcons name={icone} size={22} color={solido ? cor : '#FFF'} />
        </TouchableOpacity>
    );
}

/* ========================================================================
   RODAPÉ FIXO DE AÇÕES - respeita a barra de navegação do Android/iOS
   ======================================================================== */
export function RodapeAcoes({ children }) {
    const insets = useSafeAreaInsets();
    return (
        <View style={[est.rodapeAcoes, { paddingBottom: Math.max(insets.bottom, espaco.md) + espaco.sm }]}>
            {children}
        </View>
    );
}

/* Espaço a reservar no fim das listas para o rodapé fixo / botão flutuante. */
export function useEspacoInferior(extra = 0) {
    const insets = useSafeAreaInsets();
    return insets.bottom + extra;
}

/* ========================================================================
   CARTÃO
   ======================================================================== */
export function Cartao({ children, style, aoTocar, elevado = true }) {
    const Comp = aoTocar ? TouchableOpacity : View;
    return (
        <Comp
            activeOpacity={0.85}
            onPress={aoTocar}
            style={[est.cartao, style]}
        >
            {children}
        </Comp>
    );
}

/* ========================================================================
   BOTÃO - alvo grande, com feedback de escala
   ======================================================================== */
export function Botao({
    titulo, aoTocar, variante = 'primario', cor = cores.primaria,
    icone, carregando = false, desabilitado = false, style, larguraTotal = true
}) {
    const escala = useRef(new Animated.Value(1)).current;

    const anima = (para) => Animated.spring(escala, {
        toValue: para, useNativeDriver: true, speed: 40, bounciness: 4
    }).start();

    const estilos = {
        primario:   { backgroundColor: cor, borderWidth: 0 },
        secundario: { backgroundColor: cores.superficie, borderWidth: 1.5, borderColor: cores.bordaForte },
        perigo:     { backgroundColor: cores.erro, borderWidth: 0 },
        fantasma:   { backgroundColor: 'transparent', borderWidth: 0 }
    };
    const corTexto = variante === 'primario' || variante === 'perigo'
        ? '#FFF'
        : (variante === 'fantasma' ? cor : cores.texto);

    const inativo = desabilitado || carregando;

    return (
        <Animated.View style={[{ transform: [{ scale: escala }] }, larguraTotal && { width: '100%' }, style]}>
            <TouchableOpacity
                activeOpacity={0.9}
                onPressIn={() => anima(0.97)}
                onPressOut={() => anima(1)}
                onPress={aoTocar}
                disabled={inativo}
                style={[
                    est.botao,
                    estilos[variante],
                    variante === 'primario' && !inativo && sombra.leve,
                    inativo && { opacity: 0.5 }
                ]}
            >
                {carregando ? (
                    <ActivityIndicator color={corTexto} />
                ) : (
                    <View style={est.botaoConteudo}>
                        {icone ? <MaterialIcons name={icone} size={20} color={corTexto} style={{ marginRight: 8 }} /> : null}
                        <Text style={[est.botaoTexto, { color: corTexto }]}>{titulo}</Text>
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
}

/* ========================================================================
   CHIP - seleção por toque, alvo confortável
   ======================================================================== */
export function Chip({ texto, ativo, aoTocar, cor = cores.primaria, corClara = cores.primariaClara }) {
    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={aoTocar}
            style={[
                est.chip,
                ativo && { backgroundColor: corClara, borderColor: cor }
            ]}
        >
            {ativo ? <MaterialIcons name="check" size={16} color={cor} style={{ marginRight: 6 }} /> : null}
            <Text style={[est.chipTexto, ativo && { color: cor, fontWeight: '700' }]}>{texto}</Text>
        </TouchableOpacity>
    );
}

/* ========================================================================
   SEGMENTADO - indicador deslizante animado
   ======================================================================== */
export function Segmentado({ opcoes, valor, aoMudar, corAtiva = cores.primaria, style }) {
    const indice = Math.max(0, opcoes.findIndex(o => o.valor === valor));
    const anim = useRef(new Animated.Value(indice)).current;

    useEffect(() => {
        Animated.timing(anim, {
            toValue: indice, duration: 260,
            easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: false
        }).start();
    }, [indice]);

    const larguraPct = 100 / opcoes.length;
    const posicao = anim.interpolate({
        inputRange: opcoes.map((_, i) => i),
        outputRange: opcoes.map((_, i) => `${i * larguraPct}%`)
    });

    return (
        <View style={[est.segmento, style]}>
            <Animated.View style={[est.segmentoIndicador, { left: posicao, width: `${larguraPct}%` }]} />
            {opcoes.map(op => {
                const ativo = op.valor === valor;
                return (
                    <TouchableOpacity
                        key={op.valor}
                        activeOpacity={0.7}
                        style={est.segmentoBotao}
                        onPress={() => aoMudar(op.valor)}
                    >
                        <Text style={[est.segmentoTexto, ativo && { color: corAtiva, fontWeight: '800' }]}>
                            {op.rotulo}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

/* ========================================================================
   FOLHA INFERIOR (bottom sheet) - substitui os modais centrais
   ======================================================================== */
export function FolhaInferior({ visivel, aoFechar, titulo, children, altura = '72%' }) {
    const desliza = useRef(new Animated.Value(0)).current;
    const insets = useSafeAreaInsets();

    useEffect(() => {
        Animated.timing(desliza, {
            toValue: visivel ? 1 : 0, duration: 240,
            easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true
        }).start();
    }, [visivel]);

    const y = desliza.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

    return (
        <Modal visible={visivel} transparent animationType="fade" onRequestClose={aoFechar}>
            <Pressable style={est.folhaOverlay} onPress={aoFechar}>
                <Animated.View
                    style={[est.folha, { maxHeight: altura, paddingBottom: espaco.xl + insets.bottom, transform: [{ translateY: y }] }]}
                    onStartShouldSetResponder={() => true}
                >
                    <View style={est.folhaPuxador} />
                    <View style={est.folhaCabecalho}>
                        <Text style={est.folhaTitulo}>{titulo}</Text>
                        <TouchableOpacity onPress={aoFechar} hitSlop={12} style={est.folhaFechar}>
                            <MaterialIcons name="close" size={20} color={cores.textoMedio} />
                        </TouchableOpacity>
                    </View>
                    {children}
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

/* ========================================================================
   SELETOR - folha inferior com busca embutida
   ======================================================================== */
export function Seletor({
    visivel, aoFechar, titulo, dados = [], campoTexto, campoId,
    selecionado, aoSelecionar, multiplo = false, selecionados = [],
    cor = cores.primaria, vazio = 'Nenhum item disponível.'
}) {
    const [busca, setBusca] = useState('');
    const lista = dados.filter(i =>
        String(i?.[campoTexto] ?? '').toLowerCase().includes(busca.toLowerCase())
    );

    return (
        <FolhaInferior visivel={visivel} aoFechar={aoFechar} titulo={titulo}>
            {dados.length > 6 && (
                <View style={est.buscaCaixa}>
                    <MaterialIcons name="search" size={20} color={cores.textoFraco} />
                    <TextInput
                        style={est.buscaInput}
                        placeholder="Buscar..."
                        placeholderTextColor={cores.textoFraco}
                        value={busca}
                        onChangeText={setBusca}
                    />
                </View>
            )}
            <FlatList
                data={lista}
                keyExtractor={(item, i) => String(item?.[campoId] ?? i)}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ paddingBottom: espaco.xxl }}
                ListEmptyComponent={<Vazio icone="inbox" texto={vazio} />}
                renderItem={({ item }) => {
                    const id = item?.[campoId];
                    const ativo = multiplo
                        ? selecionados.includes(id)
                        : String(selecionado) === String(id);
                    return (
                        <TouchableOpacity
                            activeOpacity={0.7}
                            style={[est.seletorItem, ativo && { backgroundColor: cores.superficieAlt }]}
                            onPress={() => aoSelecionar(item)}
                        >
                            {multiplo && (
                                <View style={[est.caixa, ativo && { backgroundColor: cor, borderColor: cor }]}>
                                    {ativo && <MaterialIcons name="check" size={15} color="#FFF" />}
                                </View>
                            )}
                            <Text style={[est.seletorTexto, ativo && { color: cor, fontWeight: '700' }]} numberOfLines={2}>
                                {item?.[campoTexto]}
                            </Text>
                            {!multiplo && ativo && <MaterialIcons name="check" size={20} color={cor} />}
                        </TouchableOpacity>
                    );
                }}
            />
        </FolhaInferior>
    );
}

/* ========================================================================
   CAMPO DE TEXTO
   ======================================================================== */
export function Campo({ rotulo, obrigatorio, style, ...props }) {
    const [focado, setFocado] = useState(false);
    return (
        <View style={[{ marginBottom: espaco.lg }, style]}>
            {rotulo ? (
                <Text style={est.rotulo}>
                    {rotulo}{obrigatorio ? <Text style={{ color: cores.erro }}> *</Text> : null}
                </Text>
            ) : null}
            <TextInput
                {...props}
                onFocus={(e) => { setFocado(true); props.onFocus?.(e); }}
                onBlur={(e) => { setFocado(false); props.onBlur?.(e); }}
                placeholderTextColor={cores.textoFraco}
                style={[est.campo, focado && { borderColor: cores.primaria, backgroundColor: '#FFF' }]}
            />
        </View>
    );
}

/* ========================================================================
   CAMPO SELETOR - abre uma folha inferior
   ======================================================================== */
export function CampoSeletor({ rotulo, obrigatorio, valor, placeholder = 'Selecione...', aoTocar, desabilitado, icone = 'expand-more', style }) {
    return (
        <View style={[{ marginBottom: espaco.lg }, style]}>
            {rotulo ? (
                <Text style={est.rotulo}>
                    {rotulo}{obrigatorio ? <Text style={{ color: cores.erro }}> *</Text> : null}
                </Text>
            ) : null}
            <TouchableOpacity
                activeOpacity={0.75}
                onPress={aoTocar}
                disabled={desabilitado}
                style={[est.campo, est.campoSeletor, desabilitado && { backgroundColor: cores.superficieAlt, opacity: 0.7 }]}
            >
                <Text style={[est.campoSeletorTexto, !valor && { color: cores.textoFraco }]} numberOfLines={1}>
                    {valor || placeholder}
                </Text>
                <MaterialIcons name={icone} size={22} color={cores.textoFraco} />
            </TouchableOpacity>
        </View>
    );
}

/* ========================================================================
   LINHA DESLIZÁVEL - arrasta para a esquerda e revela ações
   ======================================================================== */
export function LinhaDeslizavel({ children, acoes = [], larguraAcao = 78, style }) {
    const x = useRef(new Animated.Value(0)).current;
    const aberto = useRef(false);
    const total = acoes.length * larguraAcao;

    const anima = (para) => {
        aberto.current = para !== 0;
        Animated.spring(x, {
            toValue: para, useNativeDriver: true, speed: 18, bounciness: 6
        }).start();
    };

    const pan = useRef(PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) =>
            Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderMove: (_, g) => {
            const base = aberto.current ? -total : 0;
            const novo = Math.min(0, Math.max(-total - 20, base + g.dx));
            x.setValue(novo);
        },
        onPanResponderRelease: (_, g) => {
            const base = aberto.current ? -total : 0;
            const fim = base + g.dx;
            anima(fim < -total / 2 ? -total : 0);
        }
    })).current;

    return (
        <View style={[est.deslizavelRaiz, style]}>
            <View style={[est.deslizavelAcoes, { width: total }]}>
                {acoes.map((a, i) => (
                    <TouchableOpacity
                        key={i}
                        activeOpacity={0.85}
                        style={[est.deslizavelAcao, { width: larguraAcao, backgroundColor: a.cor }]}
                        onPress={() => { anima(0); a.aoTocar?.(); }}
                    >
                        <MaterialIcons name={a.icone} size={22} color="#FFF" />
                        <Text style={est.deslizavelAcaoTexto}>{a.rotulo}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }] }}>
                {children}
            </Animated.View>
        </View>
    );
}

/* ========================================================================
   BOTÃO FLUTUANTE
   ======================================================================== */
export function BotaoFlutuante({ icone = 'add', aoTocar, cor = cores.primaria, rotulo }) {
    const escala = useRef(new Animated.Value(1)).current;
    const insets = useSafeAreaInsets();
    return (
        <Animated.View style={[est.fab, { bottom: espaco.xl + insets.bottom, transform: [{ scale: escala }] }, sombra.forte]}>
            <TouchableOpacity
                activeOpacity={0.9}
                onPressIn={() => Animated.spring(escala, { toValue: 0.93, useNativeDriver: true, speed: 40 }).start()}
                onPressOut={() => Animated.spring(escala, { toValue: 1, useNativeDriver: true, speed: 40 }).start()}
                onPress={aoTocar}
                style={[est.fabBotao, { backgroundColor: cor }, rotulo && { paddingHorizontal: espaco.xl, width: 'auto' }]}
            >
                <MaterialIcons name={icone} size={26} color="#FFF" />
                {rotulo ? <Text style={est.fabTexto}>{rotulo}</Text> : null}
            </TouchableOpacity>
        </Animated.View>
    );
}

/* ========================================================================
   ESTADO VAZIO / CARREGANDO
   ======================================================================== */
export function Vazio({ icone = 'inbox', texto, sub }) {
    return (
        <View style={est.vazio}>
            <View style={est.vazioIcone}>
                <MaterialIcons name={icone} size={30} color={cores.textoFraco} />
            </View>
            <Text style={est.vazioTexto}>{texto}</Text>
        </View>
    );
}

export function Carregando({ cor = cores.primaria, texto }) {
    return (
        <View style={est.carregando}>
            <ActivityIndicator size="large" color={cor} />
            {texto ? <Text style={est.carregandoTexto}>{texto}</Text> : null}
        </View>
    );
}

/* ========================================================================
   ETIQUETA (badge)
   ======================================================================== */
export function Etiqueta({ texto, cor = cores.primaria, fundo = cores.primariaClara, style }) {
    return (
        <View style={[est.etiqueta, { backgroundColor: fundo }, style]}>
            <Text style={[est.etiquetaTexto, { color: cor }]} numberOfLines={1}>{texto}</Text>
        </View>
    );
}

/* ======================================================================== */
const est = StyleSheet.create({
    cabecalho: {
        paddingHorizontal: espaco.lg,
        paddingBottom: espaco.lg + SOBREPOSICAO,
        borderBottomWidth: 3,
        borderBottomColor: cores.destaque
    },
    cabecalhoLinha: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    cabecalhoBotao: {
        width: LARGURA_ACAO, height: LARGURA_ACAO, borderRadius: raio.md,
        backgroundColor: 'rgba(255,255,255,0.18)',
        justifyContent: 'center', alignItems: 'center'
    },
    cabecalhoCentro: { flex: 1, alignItems: 'center', paddingHorizontal: espaco.sm },
    cabecalhoCentroEsquerda: { alignItems: 'flex-start', paddingHorizontal: espaco.md },
    cabecalhoTitulo: { fontFamily: fonte, color: '#FFF', fontSize: 18, fontWeight: '700' },
    cabecalhoSub: { fontFamily: fonte, color: 'rgba(255,255,255,0.82)', fontSize: 12, marginTop: 2 },

    rodapeAcoes: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', gap: espaco.md,
        paddingHorizontal: espaco.xl, paddingTop: espaco.md,
        backgroundColor: cores.superficie,
        borderTopWidth: 1, borderTopColor: cores.borda,
        ...sombra.media
    },

    // Conteúdo direto na tela: sem caixa e sem sombra, separado por filete.
    cartao: {
        backgroundColor: cores.superficie,
        borderRadius: 0,
        paddingVertical: espaco.lg,
        paddingHorizontal: 0,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: cores.borda
    },

    botao: {
        height: toque.botao, borderRadius: raio.md,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaco.xl
    },
    botaoConteudo: { flexDirection: 'row', alignItems: 'center' },
    botaoTexto: { fontFamily: fonte, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

    chip: {
        flexDirection: 'row', alignItems: 'center',
        minHeight: 44, paddingHorizontal: espaco.lg, paddingVertical: espaco.sm,
        borderRadius: raio.pill, borderWidth: 1.5,
        borderColor: cores.borda, backgroundColor: cores.superficie,
        marginRight: espaco.sm, marginBottom: espaco.sm
    },
    chipTexto: { ...tipo.corpo, color: cores.textoMedio, fontSize: 14 },

    segmento: {
        flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.22)',
        borderRadius: raio.pill, height: 50, padding: 4, position: 'relative'
    },
    segmentoIndicador: {
        position: 'absolute', top: 4, bottom: 4, marginHorizontal: 4,
        backgroundColor: '#FFF', borderRadius: raio.pill, ...sombra.leve
    },
    segmentoBotao: { flex: 1, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
    segmentoTexto: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: '600' },

    folhaOverlay: { flex: 1, backgroundColor: cores.overlay, justifyContent: 'flex-end' },
    folha: {
        backgroundColor: cores.superficie,
        borderTopLeftRadius: raio.xl, borderTopRightRadius: raio.xl,
        paddingHorizontal: espaco.lg, paddingBottom: espaco.xl, paddingTop: espaco.sm
    },
    folhaPuxador: {
        width: 44, height: 5, borderRadius: 3, backgroundColor: cores.bordaForte,
        alignSelf: 'center', marginBottom: espaco.md
    },
    folhaCabecalho: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: espaco.md
    },
    folhaTitulo: { ...tipo.subtitulo, color: cores.texto, flex: 1 },
    folhaFechar: {
        width: 34, height: 34, borderRadius: 17, backgroundColor: cores.superficieAlt,
        justifyContent: 'center', alignItems: 'center'
    },

    buscaCaixa: {
        flexDirection: 'row', alignItems: 'center', gap: espaco.sm,
        backgroundColor: cores.superficieAlt, borderRadius: raio.md,
        paddingHorizontal: espaco.md, height: 48, marginBottom: espaco.md
    },
    buscaInput: { flex: 1, ...tipo.corpo, color: cores.texto, paddingVertical: 0 },

    seletorItem: {
        flexDirection: 'row', alignItems: 'center', gap: espaco.md,
        minHeight: toque.item, paddingHorizontal: espaco.md,
        borderRadius: raio.md, marginBottom: 4
    },
    seletorTexto: { flex: 1, ...tipo.corpo, color: cores.texto },
    caixa: {
        width: 22, height: 22, borderRadius: 6, borderWidth: 2,
        borderColor: cores.bordaForte, justifyContent: 'center', alignItems: 'center'
    },

    rotulo: { ...tipo.legenda, color: cores.textoMedio, fontWeight: '700', marginBottom: espaco.sm },
    campo: {
        minHeight: toque.campo, borderRadius: raio.md, borderWidth: 1.5,
        borderColor: cores.borda, backgroundColor: cores.superficieAlt,
        paddingHorizontal: espaco.lg, ...tipo.corpo, color: cores.texto
    },
    campoSeletor: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    campoSeletorTexto: { flex: 1, ...tipo.corpo, color: cores.texto, marginRight: espaco.sm },

    deslizavelRaiz: { position: 'relative', borderRadius: raio.lg, overflow: 'hidden', marginBottom: espaco.md },
    deslizavelAcoes: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
    deslizavelAcao: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 4 },
    deslizavelAcaoTexto: { color: '#FFF', fontSize: 11, fontWeight: '700' },

    fab: { position: 'absolute', right: espaco.xl, bottom: espaco.xxl },
    fabBotao: {
        height: 58, minWidth: 58, borderRadius: 29,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8
    },
    fabTexto: { color: '#FFF', fontWeight: '800', fontSize: 15 },

    vazio: { alignItems: 'center', paddingVertical: espaco.xxxl, paddingHorizontal: espaco.xl },
    vazioIcone: {
        width: 64, height: 64, borderRadius: 32, backgroundColor: cores.superficieAlt,
        justifyContent: 'center', alignItems: 'center', marginBottom: espaco.md
    },
    vazioTexto: { ...tipo.corpoForte, color: cores.textoMedio, textAlign: 'center' },
    vazioSub: { ...tipo.legenda, color: cores.textoFraco, textAlign: 'center', marginTop: 6, lineHeight: 19 },

    carregando: { paddingVertical: espaco.xxxl, alignItems: 'center' },
    carregandoTexto: { ...tipo.legenda, color: cores.textoMedio, marginTop: espaco.md },

    etiqueta: {
        paddingHorizontal: espaco.md, paddingVertical: 5, borderRadius: raio.pill,
        alignSelf: 'flex-start'
    },
    etiquetaTexto: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }
});

export default {
    Tela, Cabecalho, BotaoCabecalho, RodapeAcoes, Cartao, Botao, Chip, Segmentado, FolhaInferior,
    Seletor, Campo, CampoSeletor, LinhaDeslizavel, BotaoFlutuante,
    Vazio, Carregando, Etiqueta
};
