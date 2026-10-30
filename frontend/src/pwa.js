/* ARQUIVO: src/pwa.js
   Registro do service worker e atualização automática ao abrir o app:
   se "versao_pwa" do backend (/app-version) for diferente da versão deste build,
   limpa o cache e recarrega uma única vez para a versão nova. */
import api from './api';
import { VERSAO_PWA } from './versao';

const CHAVE = 'oe_pwa_recarregado';

async function verificarVersao(registro) {
    try {
        const { data } = await api.get('/app-version', { timeout: 8000, params: { t: Date.now() } });
        const remota = data?.versao_pwa;
        if (!remota || remota === VERSAO_PWA) { sessionStorage.removeItem(CHAVE); return; }
        if (sessionStorage.getItem(CHAVE) === remota) return; // já recarregou para esta versão
        sessionStorage.setItem(CHAVE, remota);
        if ('caches' in window) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
        if (registro) await registro.update().catch(() => null);
        window.location.reload();
    } catch (e) { /* sem rede: tenta na próxima abertura */ }
}

export function iniciarPwa() {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) { verificarVersao(null); return; }
    window.addEventListener('load', async () => {
        const registro = await navigator.serviceWorker.register('/sw.js').catch(() => null);
        verificarVersao(registro);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificarVersao(registro); });
    });
}
