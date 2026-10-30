/* Service worker do aplicativo web (app.operaecho.com).
   Necessário para o navegador permitir "Instalar" / "Adicionar à tela inicial".
   Páginas: rede primeiro (cache só sem conexão). Arquivos /_expo e /assets: cache primeiro.
   A API (operaecho.com) é outro domínio e nunca passa por aqui. */
const VERSAO = '2026.12.01';
const CACHE = `opera-echo-app-${VERSAO}`;
const BASE = ['/', '/manifest.json', '/icon-192.png', '/icon-512.png', '/favicon.ico'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).catch(() => null));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        e.respondWith(fetch(req).catch(() => caches.match(req).then((r) => r || caches.match('/'))));
        return;
    }
    if (url.pathname.startsWith('/_expo/') || url.pathname.startsWith('/assets/') || BASE.includes(url.pathname)) {
        e.respondWith(
            caches.match(req).then((c) => c || fetch(req).then((resp) => {
                if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((cc) => cc.put(req, copia)); }
                return resp;
            }))
        );
    }
});
