// Dev: http://localhost:3000 (origem liberada no CORS da API em :3001).
// O build sai em build/ — mesmo caminho que o backend serve (FRONT_BUILD_PATH).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
    plugins: [react()],
    resolve: {
        // html2canvas passa pelo src/captura.js (desliga animações na captura)
        alias: [{ find: /^html2canvas$/, replacement: fileURLToPath(new URL('./src/captura.js', import.meta.url)) }]
    },
    server: { port: 3000, strictPort: true, host: true },
    preview: { port: 3000, strictPort: true, host: true },
    build: {
        outDir: 'build',
        sourcemap: false,
        chunkSizeWarningLimit: 2500
    }
});
