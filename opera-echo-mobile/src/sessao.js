/* ARQUIVO: src/sessao.js
   Sessão do aplicativo (token JWT + usuário logado).
   Segue o padrão já usado na tela de login: SecureStore no nativo e
   AsyncStorage no web. O token vai no SecureStore; os dados do usuário, por
   serem maiores, ficam no AsyncStorage.

   CAUSA RAIZ CORRIGIDA AQUI: o app nunca guardava o token devolvido pelo
   /login. Sem "Authorization", o backend não define req.usuario, o
   carregarEscopo deixa req.escopo = null e o filtro de lotação vira
   " AND 1=0 " - por isso /implantadores voltava vazio ("Nenhum membro ativo
   encontrado") e nenhum isolamento funcionava. */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useEffect } from 'react';
import { Platform } from 'react-native';

const K_TOKEN = 'opera_token';
const K_USUARIO = 'opera_usuario';

let _token = null;
let _usuario = null;
let _carregada = false;

async function guardarToken(valor) {
    if (Platform.OS === 'web') {
        if (valor) await AsyncStorage.setItem(K_TOKEN, valor);
        else await AsyncStorage.removeItem(K_TOKEN);
    } else {
        if (valor) await SecureStore.setItemAsync(K_TOKEN, valor);
        else await SecureStore.deleteItemAsync(K_TOKEN);
    }
}

async function lerToken() {
    return Platform.OS === 'web'
        ? await AsyncStorage.getItem(K_TOKEN)
        : await SecureStore.getItemAsync(K_TOKEN);
}

/* Reidrata a sessão no boot do app (app/_layout.js). */
export async function carregarSessao() {
    try {
        const [t, u] = await Promise.all([lerToken(), AsyncStorage.getItem(K_USUARIO)]);
        _token = t && t !== 'undefined' ? t : null;
        _usuario = u ? JSON.parse(u) : null;
    } catch (e) {
        _token = null;
        _usuario = null;
    } finally {
        _carregada = true;
    }
    return { token: _token, usuario: _usuario };
}

/* Chamada logo após o POST /login bem-sucedido. */
export async function salvarSessao({ token, usuario }) {
    _token = token || null;
    _usuario = usuario || null;
    _carregada = true;
    try {
        await guardarToken(_token);
        if (_usuario) await AsyncStorage.setItem(K_USUARIO, JSON.stringify(_usuario));
    } catch (e) { /* silencioso */ }
    return { token: _token, usuario: _usuario };
}

export async function limparSessao() {
    _token = null;
    _usuario = null;
    _carregada = true;
    try {
        await guardarToken(null);
        await AsyncStorage.removeItem(K_USUARIO);
    } catch (e) { /* silencioso */ }
}

export function getToken() {
    return _token;
}

export async function getTokenAsync() {
    if (!_carregada) await carregarSessao();
    return _token;
}

export function getUsuario() {
    return _usuario;
}

export function getIdUsuario() {
    return _usuario?.id_usuario || null;
}

export function getNomeUsuario() {
    return _usuario?.nome_completo || _usuario?.nome || 'Colaborador';
}

export function getPerfil() {
    return _usuario?.perfil_acesso || '';
}

export function estaLogado() {
    return !!_token;
}

/* SEGURANÇA: as telas usam a identidade da SESSÃO (token/usuário do login),
   nunca os parâmetros da rota. Antes id_usuario/perfil_acesso vinham da URL -
   um link "operaechomobile://dashboard?perfil_acesso=Administrador" abria o
   painel sem login e mudava o que a tela exibia. */
export function useSessaoObrigatoria() {
    const router = useRouter();
    const logado = estaLogado();
    useEffect(() => {
        if (!logado) router.replace('/');
    }, [logado, router]);
    return logado;
}