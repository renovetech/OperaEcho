/* ARQUIVO: src/versao.js
   Versão do app (fonte única: "version" do app.json) e checagem de
   atualização. Antes a versão estava fixa em 3 arquivos e a checagem rodava
   duas vezes (login + painel), abrindo o aviso duas vezes. */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import api from './api';

export const VERSAO_DO_APP = Constants.expoConfig?.version || '0.0.0';

const numero = (v) => parseInt(String(v || '').replace(/\D/g, ''), 10) || 0;

let _resultado = null; // cache da sessão do app

/* Retorna { link_download, obrigatorio, mensagem } quando há versão nova, senão null. */
export async function verificarAtualizacao() {
    if (Platform.OS === 'web') return null;
    if (_resultado !== null) return _resultado;
    try {
        const res = await api.get('/app-version', { timeout: 8000 });
        const { versao_atual, link_download, obrigatorio, mensagem } = res.data || {};
        _resultado = versao_atual && numero(VERSAO_DO_APP) < numero(versao_atual)
            ? { link_download, obrigatorio: !!obrigatorio, mensagem }
            : false;
    } catch (e) {
        return null; // sem rede: tenta de novo na próxima chamada
    }
    return _resultado || null;
}

/* Só abre links de download do próprio domínio do sistema. */
export function linkDownloadConfiavel(link) {
    return typeof link === 'string' && /^https:\/\/(www\.)?operaecho\.com\//i.test(link);
}
