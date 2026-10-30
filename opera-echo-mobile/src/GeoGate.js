/* ARQUIVO: src/GeoGate.js
   Bloqueia o uso do aplicativo enquanto a permissão de localização não for concedida.
   Uso: envolver o conteúdo raiz do app (app/_layout.js) ou uma tela específica.

   <GeoGate>
       <Stack ... />
   </GeoGate>
*/

import { MaterialIcons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Linking,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { STATUS_GEO, verificarPermissaoGeo } from './geo';

const MENSAGENS = {
    [STATUS_GEO.NEGADO]: {
        titulo: 'Localização obrigatória',
        texto: 'O acesso à sua localização é obrigatório para utilizar o aplicativo. Toque em "Permitir acesso" e confirme a permissão para continuar.',
        botao: 'PERMITIR ACESSO'
    },
    [STATUS_GEO.BLOQUEADO]: {
        titulo: 'Permissão bloqueada',
        texto: 'A permissão de localização foi negada permanentemente. Abra as configurações do dispositivo, habilite a localização para este aplicativo e volte para continuar.',
        botao: 'ABRIR CONFIGURAÇÕES'
    },
    [STATUS_GEO.SERVICO_OFF]: {
        titulo: 'Localização desligada',
        texto: 'O serviço de localização (GPS) está desligado ou indisponível. Ative a localização do dispositivo para liberar o uso do aplicativo.',
        botao: 'JÁ ATIVEI, VERIFICAR'
    },
    [STATUS_GEO.ERRO]: {
        titulo: 'Falha ao verificar localização',
        texto: 'Não foi possível validar a permissão de localização neste dispositivo. Tente novamente.',
        botao: 'TENTAR NOVAMENTE'
    }
};

export default function GeoGate({ children }) {
    const [status, setStatus] = useState(STATUS_GEO.VERIFICANDO);
    const [processando, setProcessando] = useState(false);
    const appState = useRef(AppState.currentState);

    const checar = useCallback(async ({ solicitar = true } = {}) => {
        setProcessando(true);
        const r = await verificarPermissaoGeo({ solicitar });
        setStatus(r.status);
        setProcessando(false);
        return r.status;
    }, []);

    useEffect(() => {
        checar({ solicitar: true });
    }, [checar]);

    // Revalida quando o usuário volta das configurações do dispositivo.
    useEffect(() => {
        const sub = AppState.addEventListener('change', (next) => {
            if (appState.current.match(/inactive|background/) && next === 'active') {
                checar({ solicitar: false });
            }
            appState.current = next;
        });
        return () => sub.remove();
    }, [checar]);

    const handleAcao = async () => {
        if (status === STATUS_GEO.BLOQUEADO && Platform.OS !== 'web') {
            try {
                await Linking.openSettings();
            } catch (e) {
                await checar({ solicitar: false });
            }
            return;
        }
        await checar({ solicitar: true });
    };

    if (status === STATUS_GEO.LIBERADO) return children;

    if (status === STATUS_GEO.VERIFICANDO) {
        return (
            <View style={styles.container}>
                <ActivityIndicator size="large" color="#2E8B57" />
                <Text style={styles.carregandoTexto}>Iniciando o aplicativo...</Text>
            </View>
        );
    }

    const msg = MENSAGENS[status] || MENSAGENS[STATUS_GEO.ERRO];

    return (
        <View style={styles.container}>
            <View style={styles.card}>
                <View style={styles.iconBox}>
                    <MaterialIcons name="location-off" size={44} color="#d32f2f" />
                </View>
                <Text style={styles.titulo}>{msg.titulo}</Text>
                <Text style={styles.texto}>{msg.texto}</Text>

                <TouchableOpacity
                    style={[styles.botao, processando && { opacity: 0.6 }]}
                    onPress={handleAcao}
                    disabled={processando}
                    activeOpacity={0.8}
                >
                    {processando
                        ? <ActivityIndicator color="#FFF" />
                        : <Text style={styles.botaoTexto}>{msg.botao}</Text>}
                </TouchableOpacity>

                <TouchableOpacity style={styles.link} onPress={() => checar({ solicitar: false })}>
                    <Text style={styles.linkTexto}>Verificar novamente</Text>
                </TouchableOpacity>

                <Text style={styles.rodape}>
                    O aplicativo permanecerá bloqueado até que a permissão seja concedida.
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4F6F8', justifyContent: 'center', alignItems: 'center', padding: 24 },
    carregandoTexto: { marginTop: 14, color: '#666', fontSize: 15 },
    card: { width: '100%', maxWidth: 420, backgroundColor: '#FFF', borderRadius: 20, padding: 28, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 5 },
    iconBox: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#ffebee', justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
    titulo: { fontSize: 20, fontWeight: 'bold', color: '#1A1A1A', textAlign: 'center', marginBottom: 10 },
    texto: { fontSize: 15, color: '#666', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
    botao: { backgroundColor: '#2E8B57', width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', minHeight: 50 },
    botaoTexto: { color: '#FFF', fontWeight: 'bold', fontSize: 15, letterSpacing: 0.5 },
    link: { marginTop: 16, padding: 8 },
    linkTexto: { color: '#2E8B57', fontWeight: '600', fontSize: 14 },
    rodape: { marginTop: 10, fontSize: 12, color: '#999', textAlign: 'center' }
});