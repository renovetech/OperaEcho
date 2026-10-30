/* ARQUIVO: app/_layout.js
   Layout raiz. Responsabilidades:
     1) Reidratar a sessão (token JWT) antes de qualquer requisição.
     2) Apagar credenciais em texto puro gravadas por versões antigas.
     3) TRAVAR o app atrás da permissão de localização (GeoGate).
     4) Prover a área segura (notch / barras do sistema) para os cabeçalhos. */

import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import GeoGate from '../src/GeoGate';
import InstalarApp from '../src/InstalarApp';
import { migrarLegado } from '../src/biometria';
import { carregarSessao } from '../src/sessao';
import { cores } from '../src/tema';

export default function RootLayout() {
    const [pronto, setPronto] = useState(false);

    useEffect(() => {
        (async () => {
            await Promise.all([carregarSessao(), migrarLegado()]);
            setPronto(true);
        })();
    }, []);

    return (
        <SafeAreaProvider>
            {/* Padrão escuro (login / bloqueio de GPS têm fundo claro); o Cabecalho troca para claro. */}
            <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
            {!pronto ? (
                <View style={styles.boot}>
                    <ActivityIndicator size="large" color={cores.primaria} />
                </View>
            ) : (
                <GeoGate>
                    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
                </GeoGate>
            )}
            {/* Só na versão web (PWA): convite para instalar na tela inicial */}
            <InstalarApp />
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    boot: { flex: 1, backgroundColor: cores.fundo, justifyContent: 'center', alignItems: 'center' }
});
