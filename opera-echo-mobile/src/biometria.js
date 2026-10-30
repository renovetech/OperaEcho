/* ARQUIVO: src/biometria.js
   Entrada com biometria - armazenamento das credenciais.

   ANTES (vulnerável):
     - a senha era gravada em JSON puro a cada login, sem o usuário pedir;
     - no web ia para o AsyncStorage (localStorage, texto aberto);
     - a leitura não exigia biometria: o prompt do LocalAuthentication era só
       uma tela na frente; qualquer código no app lia a senha direto.
   AGORA:
     - opcional (o usuário ativa após um login com senha);
     - somente nativo, no Keystore/Keychain com requireAuthentication: o
       próprio sistema operacional só libera a leitura após a biometria;
     - preso ao aparelho (THIS_DEVICE_ONLY) e invalidado se a biometria do
       aparelho mudar ou se a senha deixar de funcionar;
     - a chave antiga ("user_credentials") é apagada na primeira execução. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const K_CRED = 'opera_cred_bio_v2';
const K_ATIVA = 'opera_bio_ativa';      // flag não sensível: evita ler o cofre só para saber se existe
const K_LEGADO = 'user_credentials';    // formato antigo (texto puro) - removido

const OPCOES = {
    requireAuthentication: true,
    authenticationPrompt: 'Confirme sua identidade para entrar',
    keychainAccessible: SecureStore.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY
};

export const biometriaSuportada = Platform.OS !== 'web';

/* Remove as credenciais em texto puro gravadas pelas versões anteriores. */
export async function migrarLegado() {
    try { await AsyncStorage.removeItem(K_LEGADO); } catch (e) { /* noop */ }
    if (!biometriaSuportada) return;
    try { await SecureStore.deleteItemAsync(K_LEGADO); } catch (e) { /* noop */ }
}

/* Aparelho tem biometria cadastrada? */
export async function aparelhoTemBiometria() {
    if (!biometriaSuportada) return false;
    try {
        const [hw, cad] = await Promise.all([
            LocalAuthentication.hasHardwareAsync(),
            LocalAuthentication.isEnrolledAsync()
        ]);
        return hw && cad && SecureStore.canUseBiometricAuthentication();
    } catch (e) {
        return false;
    }
}

/* Login (usuário) com biometria ativada neste aparelho, ou null. */
export async function usuarioComBiometria() {
    if (!biometriaSuportada) return null;
    try { return (await AsyncStorage.getItem(K_ATIVA)) || null; } catch (e) { return null; }
}

/* Grava as credenciais protegidas por biometria. O sistema pode pedir a
   digital/rosto já na gravação. Retorna true se ficou ativa. */
export async function ativarBiometria(usuario, senha) {
    if (!(await aparelhoTemBiometria())) return false;
    try {
        await SecureStore.setItemAsync(K_CRED, JSON.stringify({ u: usuario, s: senha }), OPCOES);
        await AsyncStorage.setItem(K_ATIVA, String(usuario));
        return true;
    } catch (e) {
        await desativarBiometria();
        return false;
    }
}

/* Lê as credenciais - o próprio SO exibe o prompt biométrico.
   Retorna { usuario, senha } ou null (cancelado / chave invalidada). */
export async function lerCredenciais() {
    if (!biometriaSuportada) return null;
    try {
        const json = await SecureStore.getItemAsync(K_CRED, OPCOES);
        if (!json) { await desativarBiometria(); return null; }
        const { u, s } = JSON.parse(json);
        return u && s ? { usuario: u, senha: s } : null;
    } catch (e) {
        // Biometria do aparelho alterada => chave invalidada pelo sistema.
        if (/invalidat|KeyPermanentlyInvalidated|not.*found/i.test(String(e?.message))) {
            await desativarBiometria();
        }
        return null;
    }
}

export async function desativarBiometria() {
    try { await AsyncStorage.removeItem(K_ATIVA); } catch (e) { /* noop */ }
    if (!biometriaSuportada) return;
    try { await SecureStore.deleteItemAsync(K_CRED, OPCOES); } catch (e) { /* noop */ }
}
