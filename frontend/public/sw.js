/* Service worker do Opera Echo (PWA).
   Navegação: rede primeiro (cai no cache só sem conexão).
   /assets/*: arquivos com hash do Vite, cache primeiro.
   Chamadas da API nunca passam pelo cache. */
const VERSAO = '2026.12.01';
const CACHE = `opera-echo-${VERSAO}`;
const ESTATICOS = ['/', '/manifest.json', '/logo.png', '/logo192.png', '/logo512.png', '/favicon.ico'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ESTATICOS)).catch(() => null));
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then((chaves) => Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (e) => {
    if (e.data === 'limpar') e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
});

self.addEventListener('fetch', (e) => {
    const req = e.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    if (req.mode === 'navigate') {
        e.respondWith(
            fetch(req)
                .then((resp) => { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put('/', copia)); return resp; })
                .catch(() => caches.match('/'))
        );
        return;
    }

    if (url.pathname.startsWith('/assets/') || ESTATICOS.includes(url.pathname)) {
        e.respondWith(
            caches.match(req).then((cache) => cache || fetch(req).then((resp) => {
                if (resp.ok) { const copia = resp.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
                return resp;
            }))
        );
    }
});
