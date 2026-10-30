/* ARQUIVO: src/geo.js
   Camada única de geolocalização do aplicativo.
   Regra: a permissão de localização é OBRIGATÓRIA. Sem ela o app não libera uso.
   Funciona em nativo (expo-location) e no web (expo-location -> navigator.geolocation).

   DESEMPENHO: getCurrentPositionAsync pode levar de 5 a 30 s em ambiente
   fechado. Antes o app ESPERAVA essa leitura para abrir, para logar e para
   salvar/excluir hora extra - era a principal causa do "app travado".
   Agora: última posição conhecida (instantânea) + leitura nova com tempo
   máximo, e a abertura do app não espera o GPS. */

import * as Location from 'expo-location';
import { Platform } from 'react-native';

export const STATUS_GEO = {
    VERIFICANDO: 'VERIFICANDO',
    LIBERADO: 'LIBERADO',
    NEGADO: 'NEGADO',            // usuário recusou a permissão
    BLOQUEADO: 'BLOQUEADO',      // recusou e marcou "não perguntar novamente"
    SERVICO_OFF: 'SERVICO_OFF',  // GPS / serviço de localização desligado
    ERRO: 'ERRO'
};

const IDADE_MAXIMA_MS = 2 * 60 * 1000;   // posição "recente" aceitável
const TEMPO_LIMITE_MS = 4000;            // espera máxima por uma leitura nova

let ultimaPosicao = null;   // { latitude, longitude, precisao, em }
let leituraEmCurso = null;  // evita várias leituras simultâneas do GPS

const comTempoLimite = (promessa, ms) => Promise.race([
    promessa,
    new Promise(resolve => setTimeout(() => resolve(null), ms))
]);

const guardar = (pos) => {
    if (!pos?.coords) return null;
    ultimaPosicao = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        precisao: pos.coords.accuracy,
        em: pos.timestamp || Date.now()
    };
    return ultimaPosicao;
};

/* Verifica serviço + permissão. Solicita ao usuário quando ainda não decidido.
   Não espera fixar o GPS: libera assim que a permissão está concedida e já
   dispara o aquecimento da posição em segundo plano. */
export async function verificarPermissaoGeo({ solicitar = true } = {}) {
    try {
        if (Platform.OS !== 'web') {
            const servicoAtivo = await Location.hasServicesEnabledAsync();
            if (!servicoAtivo) return { status: STATUS_GEO.SERVICO_OFF };
        }

        let perm = await Location.getForegroundPermissionsAsync();

        if (perm.status !== 'granted' && solicitar && perm.canAskAgain !== false) {
            perm = await Location.requestForegroundPermissionsAsync();
        }

        if (perm.status === 'granted') {
            obterPosicaoAtual(); // aquece em segundo plano, sem bloquear
            return { status: STATUS_GEO.LIBERADO };
        }

        if (perm.canAskAgain === false) return { status: STATUS_GEO.BLOQUEADO };
        return { status: STATUS_GEO.NEGADO };
    } catch (e) {
        return { status: STATUS_GEO.ERRO, mensagem: e?.message };
    }
}

async function lerGps() {
    try {
        const perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') return null;

        // 1) Última posição conhecida do sistema: instantânea.
        if (Platform.OS !== 'web') {
            const conhecida = await Location.getLastKnownPositionAsync({ maxAge: IDADE_MAXIMA_MS })
                .catch(() => null);
            if (conhecida) {
                guardar(conhecida);
                // Atualiza em segundo plano para a próxima chamada.
                Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
                    .then(guardar).catch(() => {});
                return ultimaPosicao;
            }
        }

        // 2) Leitura nova, limitada no tempo.
        const pos = await comTempoLimite(
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
            TEMPO_LIMITE_MS
        );
        return guardar(pos) || ultimaPosicao;
    } catch (e) {
        return ultimaPosicao;
    }
}

/* Retorna { latitude, longitude, precisao } ou null. Nunca lança exceção e
   nunca demora mais que ~4 s. */
export async function obterPosicaoAtual() {
    if (ultimaPosicao && Date.now() - ultimaPosicao.em < IDADE_MAXIMA_MS) return ultimaPosicao;
    if (!leituraEmCurso) {
        leituraEmCurso = lerGps().finally(() => { leituraEmCurso = null; });
    }
    return leituraEmCurso;
}

/* Versão rápida para fluxos interativos (login): usa o que houver em até `ms`. */
export async function obterPosicaoRapida(ms = 1500) {
    if (ultimaPosicao) return ultimaPosicao;
    return (await comTempoLimite(obterPosicaoAtual(), ms)) || ultimaPosicao;
}

export function getUltimaPosicao() {
    return ultimaPosicao;
}

/* Inicia o rastreio em segundo plano (tarefa definida com TaskManager na tela
   de login). Só roda em nativo e só se o usuário conceder a permissão de
   background - a ausência dela NÃO bloqueia o app. Não volta a pedir a
   permissão quando o sistema já informou que não pode perguntar de novo. */
export async function iniciarRastreioBackground(taskName) {
    if (Platform.OS === 'web' || !taskName) return false;
    try {
        const fg = await Location.getForegroundPermissionsAsync();
        if (fg.status !== 'granted') return false;

        const jaAtivo = await Location.hasStartedLocationUpdatesAsync(taskName);
        if (jaAtivo) return true;

        let bg = await Location.getBackgroundPermissionsAsync();
        if (bg.status !== 'granted') {
            if (bg.canAskAgain === false) return false;
            bg = await Location.requestBackgroundPermissionsAsync();
            if (bg.status !== 'granted') return false;
        }

        await Location.startLocationUpdatesAsync(taskName, {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: 900000,
            distanceInterval: 100,
            showsBackgroundLocationIndicator: true,
            foregroundService: {
                notificationTitle: 'Opera Echo',
                notificationBody: 'Sua localização está sendo atualizada.',
                notificationColor: '#2E8B57'
            }
        });
        return true;
    } catch (e) {
        return false;
    }
}

/* Envia o rastreio para o backend no mesmo contrato do sistema web.
   "Dispara e esquece": nunca segura a tela do usuário esperando GPS/rede.
   O backend identifica o autor pelo token (o campo usuario é ignorado lá). */
export function registrarRastreio(api, { usuario, tipo_registro, detalhes_registro }) {
    (async () => {
        try {
            const coords = await obterPosicaoAtual();
            if (!coords) return; // backend recusa registro sem coordenada
            await api.post('/rastreio-background', {
                usuario: usuario || 'Usuario',
                latitude: coords.latitude,
                longitude: coords.longitude,
                tipo_registro,
                detalhes_registro
            });
        } catch (e) { /* auditoria nunca interrompe o fluxo */ }
    })();
}
