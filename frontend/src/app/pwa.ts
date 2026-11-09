/* Registro do service worker e atualização automática ao abrir o app: se "versao_pwa" do servidor for diferente da
   versão deste build, limpa o cache e recarrega uma única vez para a versão nova. */
import api from '@/shared/api';
import { VERSAO_PWA } from '@/shared/versao';

const CHAVE = 'oe_pwa_recarregado';
const LIMITE_CONSULTA_MS = 8000;

async function verificarVersao(registro: ServiceWorkerRegistration | null): Promise<void> {
    try {
        const { data } = await api.get<{ versao_pwa?: string }>('/app-version', { timeout: LIMITE_CONSULTA_MS, params: { t: Date.now() } });
        const remota = data.versao_pwa;
        if (!remota || remota === VERSAO_PWA) {
            sessionStorage.removeItem(CHAVE);
            return;
        }
        if (sessionStorage.getItem(CHAVE) === remota) return;
        sessionStorage.setItem(CHAVE, remota);
        if ('caches' in window) await Promise.all((await caches.keys()).map((chave) => caches.delete(chave)));
        if (registro) await registro.update().catch(() => null);
        window.location.reload();
    } catch {
        // Sem rede: tenta de novo na próxima abertura.
    }
}

export function iniciarPwa(): void {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
        void verificarVersao(null);
        return;
    }
    window.addEventListener('load', () => {
        void navigator.serviceWorker.register('/sw.js').catch(() => null).then((registro) => {
            void verificarVersao(registro);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') void verificarVersao(registro);
            });
        });
    });
}
