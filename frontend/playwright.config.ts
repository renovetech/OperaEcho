/* Fluxos críticos no navegador. Exige web (3000) e API (3001) no ar e E2E_USUARIO e E2E_SENHA no ambiente. */
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 60_000,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        channel: 'msedge',
        viewport: { width: 1366, height: 768 },
        acceptDownloads: true
    }
});
