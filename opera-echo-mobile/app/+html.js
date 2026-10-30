/* ARQUIVO: app/+html.js
   HTML base da versão web (PWA em app.operaecho.com). Só vale no export web;
   o APK não usa este arquivo. Traz a prévia ao compartilhar o link
   (WhatsApp, Teams, e-mail) com título, descrição e imagem. */

import { ScrollViewStyleReset } from 'expo-router/html';

const URL_APP = 'https://app.operaecho.com';
const TITULO = 'Opera Echo | Aplicativo';
const DESCRICAO = 'Atividades, escala, férias, horas extras e consulta SIGTAP na palma da mão.';
const IMAGEM = `${URL_APP}/og-image.png`;

/* Registra o service worker e guarda o pedido de instalação do navegador,
   que chega antes de o React montar (usado por src/InstalarApp.js). */
const REGISTRO_PWA = `
window.addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__oePedidoInstalacao = e;
  window.dispatchEvent(new Event('oe-instalavel'));
});
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
}`;

export default function Root({ children }) {
    return (
        <html lang="pt-BR">
            <head>
                <meta charSet="utf-8" />
                <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
                <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
                <meta name="theme-color" content="#2E8B57" />
                <meta name="description" content={DESCRICAO} />

                <meta property="og:type" content="website" />
                <meta property="og:site_name" content="Opera Echo" />
                <meta property="og:locale" content="pt_BR" />
                <meta property="og:url" content={URL_APP} />
                <meta property="og:title" content={TITULO} />
                <meta property="og:description" content={DESCRICAO} />
                <meta property="og:image" content={IMAGEM} />
                <meta property="og:image:secure_url" content={IMAGEM} />
                <meta property="og:image:type" content="image/png" />
                <meta property="og:image:width" content="1200" />
                <meta property="og:image:height" content="630" />
                <meta property="og:image:alt" content="Opera Echo - Aplicativo" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content={TITULO} />
                <meta name="twitter:description" content={DESCRICAO} />
                <meta name="twitter:image" content={IMAGEM} />

                {/* Instalação (PWA): manifesto, ícones e modo tela cheia no iPhone */}
                <link rel="manifest" href="/manifest.json" />
                <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
                <meta name="mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-title" content="Opera Echo" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <script dangerouslySetInnerHTML={{ __html: REGISTRO_PWA }} />

                <ScrollViewStyleReset />
            </head>
            <body>{children}</body>
        </html>
    );
}
