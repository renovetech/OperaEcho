/* ARQUIVO: src/InstalarApp.js
   Aviso para instalar o aplicativo web (app.operaecho.com) na tela inicial.
   - Android/Chrome/Edge: botão "Instalar" usa o pedido nativo do navegador.
   - iPhone/iPad (Safari): o navegador não tem botão; mostra o passo a passo
     (Compartilhar > Adicionar à Tela de Início).
   Não aparece no APK, quando já está instalado, nem por 7 dias após "Agora não". */

import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { cores, espaco, raio, sombra, tipo } from './tema';

const CHAVE = 'oe_instalar_adiado_ate';
const ADIAR_MS = 7 * 24 * 60 * 60 * 1000;

const lerAdiado = () => { try { return Number(window.localStorage.getItem(CHAVE)) || 0; } catch (e) { return 0; } };
const gravarAdiado = () => { try { window.localStorage.setItem(CHAVE, String(Date.now() + ADIAR_MS)); } catch (e) { /* sem armazenamento */ } };

function jaInstalado() {
    try {
        return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    } catch (e) { return false; }
}

function ehIOS() {
    const ua = window.navigator.userAgent || '';
    const iPadDesktop = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || iPadDesktop;
}

export default function InstalarApp() {
    const [modo, setModo] = useState(null); // null | 'nativo' | 'ios'
    const [passos, setPassos] = useState(false);

    useEffect(() => {
        if (Platform.OS !== 'web' || jaInstalado() || lerAdiado() > Date.now()) return undefined;
        if (ehIOS()) { setModo('ios'); return undefined; }
        const disponivel = () => { if (window.__oePedidoInstalacao) setModo('nativo'); };
        disponivel();
        const instalado = () => setModo(null);
        window.addEventListener('oe-instalavel', disponivel);
        window.addEventListener('appinstalled', instalado);
        return () => {
            window.removeEventListener('oe-instalavel', disponivel);
            window.removeEventListener('appinstalled', instalado);
        };
    }, []);

    if (!modo) return null;

    const instalar = async () => {
        if (modo === 'ios') { setPassos(p => !p); return; }
        const pedido = window.__oePedidoInstalacao;
        if (!pedido) return;
        pedido.prompt();
        try { await pedido.userChoice; } catch (e) { /* ignorado */ }
        window.__oePedidoInstalacao = null;
        setModo(null);
    };

    const adiar = () => { gravarAdiado(); setModo(null); };

    return (
        <View style={est.posicao} pointerEvents="box-none">
            <View style={est.cartao}>
                <View style={est.linha}>
                    <View style={est.icone}>
                        <MaterialIcons name="install-mobile" size={24} color={cores.primaria} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={est.titulo}>Instale o Opera Echo</Text>
                        <Text style={est.texto}>Acesso direto pela tela inicial, em tela cheia.</Text>
                    </View>
                    <TouchableOpacity onPress={adiar} hitSlop={10} accessibilityLabel="Fechar">
                        <MaterialIcons name="close" size={20} color={cores.textoFraco} />
                    </TouchableOpacity>
                </View>

                {passos && (
                    <View style={est.passos}>
                        <Passo n="1" icone="ios-share" texto="Toque em Compartilhar, na barra do Safari" />
                        <Passo n="2" icone="add-box" texto="Escolha Adicionar à Tela de Início" />
                        <Passo n="3" icone="check-circle" texto="Confirme em Adicionar" />
                    </View>
                )}

                <View style={est.acoes}>
                    <TouchableOpacity onPress={adiar} style={est.botaoSecundario}>
                        <Text style={est.botaoSecundarioTexto}>Agora não</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={instalar} style={est.botao}>
                        <MaterialIcons name={modo === 'ios' && passos ? 'expand-less' : 'add-to-home-screen'} size={18} color="#FFF" />
                        <Text style={est.botaoTexto}>{modo === 'ios' ? (passos ? 'Entendi' : 'Como instalar') : 'Instalar'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
}

function Passo({ n, icone, texto }) {
    return (
        <View style={est.passo}>
            <Text style={est.passoNumero}>{n}</Text>
            <MaterialIcons name={icone} size={18} color={cores.primaria} />
            <Text style={est.passoTexto}>{texto}</Text>
        </View>
    );
}

const est = StyleSheet.create({
    posicao: { position: 'fixed', left: 0, right: 0, bottom: 0, padding: espaco.md, alignItems: 'center', zIndex: 9999 },
    cartao: {
        width: '100%', maxWidth: 480, backgroundColor: cores.superficie, borderRadius: raio.lg, padding: espaco.lg,
        borderTopWidth: 3, borderTopColor: cores.destaque, ...sombra.forte
    },
    linha: { flexDirection: 'row', alignItems: 'center', gap: espaco.md },
    icone: { width: 44, height: 44, borderRadius: raio.md, backgroundColor: cores.primariaClara, alignItems: 'center', justifyContent: 'center' },
    titulo: { ...tipo.corpoForte, color: cores.texto },
    texto: { ...tipo.legenda, color: cores.textoMedio, marginTop: 2 },
    passos: { marginTop: espaco.md, gap: espaco.sm, paddingLeft: espaco.xs },
    passo: { flexDirection: 'row', alignItems: 'center', gap: espaco.sm },
    passoNumero: { ...tipo.micro, color: '#FFF', backgroundColor: cores.primaria, width: 20, height: 20, borderRadius: 10, textAlign: 'center', lineHeight: 20 },
    passoTexto: { ...tipo.legenda, color: cores.texto, flex: 1 },
    acoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: espaco.sm, marginTop: espaco.md },
    botaoSecundario: { height: 40, paddingHorizontal: espaco.lg, borderRadius: raio.sm, justifyContent: 'center' },
    botaoSecundarioTexto: { ...tipo.corpoForte, fontSize: 14, color: cores.textoMedio },
    botao: { height: 40, paddingHorizontal: espaco.lg, borderRadius: raio.sm, backgroundColor: cores.primaria, flexDirection: 'row', alignItems: 'center', gap: 6 },
    botaoTexto: { ...tipo.corpoForte, fontSize: 14, color: '#FFF' }
});
