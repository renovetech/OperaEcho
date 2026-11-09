// Dev: http://localhost:3000 (origem liberada no CORS da API em :3001).
// O build sai em build/ — mesmo caminho que o backend serve (FRONT_BUILD_PATH).
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const caminho = (relativo: string): string => fileURLToPath(new URL(relativo, import.meta.url));

export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: [
            { find: /^@\//, replacement: `${caminho('./src')}/` },
        ]
    },
    server: { port: 3000, strictPort: true, host: true },
    preview: { port: 3000, strictPort: true, host: true },
    build: {
        outDir: 'build',
        sourcemap: false,
        chunkSizeWarningLimit: 2500
    }
});
