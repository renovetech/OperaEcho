/* ARQUIVO: src/api.js
   Mantida a baseURL original do app (domínio HTTPS de produção).
   O que foi acrescentado: os dois interceptors que faltavam.

   Sem o header "Authorization", o backend não define req.usuario, o
   middleware carregarEscopo deixa req.escopo = null e o filtro de lotação
   vira " AND 1=0 " - por isso /implantadores voltava vazio ("Nenhum membro
   ativo encontrado") e o isolamento por projeto não funcionava. */

import axios from 'axios';
import { router } from 'expo-router';
import { Alert } from 'react-native';
import { getTokenAsync, limparSessao } from './sessao';

// Produção por padrão. Para apontar a um servidor local durante o
// desenvolvimento, defina EXPO_PUBLIC_API_URL no .env (ex.: http://192.168.0.10:3001).
// SEGURANÇA: fora do modo de desenvolvimento só aceita HTTPS - um build de
// produção nunca envia senha/token em texto aberto, mesmo com .env errado.
const URL_PADRAO = 'https://operaecho.com';
const urlEnv = process.env.EXPO_PUBLIC_API_URL;
const baseURL = urlEnv && (__DEV__ || /^https:\/\//i.test(urlEnv)) ? urlEnv : URL_PADRAO;

// 20 s: numa rede ruim o usuário fica menos tempo olhando um
// carregando infinito. Uploads definem o próprio timeout.
const api = axios.create({ baseURL, timeout: 20000 });

// ============================================================
// REQUEST: injeta o token JWT em toda requisição
// ============================================================
api.interceptors.request.use(async (config) => {
    try {
        const token = await getTokenAsync();
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
    } catch (e) { /* silencioso */ }

    // FormData: detecção robusta (no APK "instanceof FormData" FALHA, e o axios
    // acaba enviando o corpo como application/x-www-form-urlencoded - foi isso
    // que quebrou o salvar com "Network Error"). Aqui forçamos multipart/form-data
    // para que o backend (multer) reconheça o corpo e os anexos.
    const corpo = config.data;
    const ehFormData = corpo && (
        (typeof FormData !== 'undefined' && corpo instanceof FormData) ||
        corpo._parts !== undefined ||
        typeof corpo.getParts === 'function' ||
        (typeof corpo.append === 'function' && typeof corpo.entries !== 'function')
    );
    if (ehFormData && config.headers) {
        config.headers['Content-Type'] = 'multipart/form-data';
    }
    return config;
});

// ============================================================
// RESPONSE: trata 401 (token expirado/inválido)
// ============================================================
let _avisando = false;

api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const status = error?.response?.status;
        const url = error?.config?.url || '';
        const isRotaLivre = url.includes('/login')
            || url.includes('/recuperar-senha')
            || url.includes('/gerador/');

        if (status === 401 && !isRotaLivre) {
            await limparSessao();
            if (!_avisando) {
                _avisando = true;
                Alert.alert(
                    'Sessão expirada',
                    'Sua sessão foi encerrada. Faça login novamente.',
                    [{
                        text: 'OK',
                        onPress: () => {
                            _avisando = false;
                            try { router.replace('/'); } catch (e) { /* noop */ }
                        }
                    }]
                );
            }
        }
        return Promise.reject(error);
    }
);

export default api;