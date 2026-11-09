/* Fluxos críticos da área logada. Nada aqui grava no banco. */
import { expect, test, type Page } from '@playwright/test';

const USUARIO = process.env.E2E_USUARIO ?? '';
const SENHA = process.env.E2E_SENHA ?? '';

async function entrar(page: Page) {
    await page.goto('/');
    await page.getByPlaceholder('Digite seu usuário').fill(USUARIO);
    await page.getByPlaceholder('••••••••').fill(SENHA);
    await page.locator('button[type="submit"]').click();
    await expect(page).toHaveURL(/\/system/);
}

test.describe('sem sessão', () => {
    test('rota protegida volta ao login', async ({ page }) => {
        await page.goto('/system/implantacao/hora-extra');
        await expect(page.getByPlaceholder('Digite seu usuário')).toBeVisible();
    });

    test('consulta SIGTAP pública abre sem login', async ({ page }) => {
        await page.goto('/sigtap');
        await expect(page.getByPlaceholder('Digite seu usuário')).toHaveCount(0);
        await expect(page.locator('body')).toContainText(/SIGTAP/i);
    });

    test('rota removida do gerador não expõe tela nem API', async ({ page, request }) => {
        await page.goto('/dark');
        await expect(page.locator('body')).not.toContainText('Gerador de Comprovantes');
        const resposta = await request.get('http://localhost:3001/api/v1/gerador/templates');
        expect(resposta.status()).toBe(401);
    });
});

test.describe('com sessão', () => {
    test.skip(!USUARIO || !SENHA, 'Defina E2E_USUARIO e E2E_SENHA.');

    test.beforeEach(async ({ page }) => {
        const falhas: string[] = [];
        page.on('pageerror', (falha) => falhas.push(falha.message));
        await entrar(page);
        expect(falhas).toEqual([]);
    });

    test('toda chamada da tela usa /api/v1', async ({ page }) => {
        const naRaiz: string[] = [];
        page.on('request', (pedido) => {
            const url = new URL(pedido.url());
            if (url.port === '3001' && !url.pathname.startsWith('/api/v1') && !url.pathname.startsWith('/uploads')) naRaiz.push(url.pathname);
        });
        await page.goto('/system/implantacao/atividades');
        await page.waitForLoadState('networkidle');
        await page.goto('/system/plano-acao');
        await page.waitForLoadState('networkidle');
        expect(naRaiz).toEqual([]);
    });

    test('hora extra calcula a folha e exporta sem salvar', async ({ page }) => {
        const gravacoes: string[] = [];
        page.on('request', (pedido) => { if (pedido.method() !== 'GET' && /hora-extra/.test(pedido.url())) gravacoes.push(pedido.url()); });

        await page.goto('/system/implantacao/hora-extra');
        await page.getByRole('button', { name: 'Novo lançamento' }).click();
        await expect(page.getByRole('heading', { name: 'Novo lançamento' })).toBeVisible();

        const colaborador = page.locator('#he-colaborador');
        await expect(colaborador.locator('option').nth(1)).toBeAttached();
        await colaborador.selectOption({ index: 1 });
        await page.locator('#he-mes').fill('2026-10');
        await expect(page.locator('tbody tr')).toHaveCount(31);

        // Quinta-feira, 01/10/2026: duas horas além da jornada viram 02:00 a 50%.
        await page.getByLabel('Saída do dia 1', { exact: true }).fill('19:00');
        const linha = page.locator('tbody tr').first();
        await expect(linha).toContainText('10:00');
        await expect(linha).toContainText('02:00');
        await expect(page.getByText('Resumo mensal')).toBeVisible();

        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: 'PDF', exact: true }).click();
        expect((await download).suggestedFilename()).toMatch(/^HE_.*_2026-10\.pdf$/);

        await expect(page.locator('.swal2-container')).toHaveCount(0);
        const imagem = page.waitForEvent('download', { timeout: 45_000 });
        await page.getByRole('button', { name: 'JPG', exact: true }).click();
        expect((await imagem).suggestedFilename()).toMatch(/.jpg$/);
        await expect(page.locator('.swal2-container')).toHaveCount(0);

        await page.getByRole('button', { name: 'Calculadora' }).click();
        await expect(page.getByRole('dialog')).toContainText('Líquido estimado');
        await page.getByRole('button', { name: 'Fechar' }).first().click();

        await page.getByRole('button', { name: 'Cancelar' }).click();
        await expect(page.getByRole('heading', { name: 'Horas Extras' })).toBeVisible();
        expect(gravacoes).toEqual([]);
    });

    test('relatório sem dados avisa em vez de exportar', async ({ page }) => {
        await page.goto('/system/relatorios/estatistica-atividades');
        await expect(page.getByRole('heading', { name: 'Estatísticas da Implantação' }).first()).toBeVisible();
        await page.getByRole('button', { name: 'JPG', exact: true }).click();
        await expect(page.getByRole('dialog', { name: 'Atenção' })).toBeVisible();
    });

    test('abas de parâmetros mudam a URL', async ({ page }) => {
        await page.goto('/system/parametros/implantacao');
        await page.getByRole('tab', { name: 'SIGTAP' }).click();
        await expect(page).toHaveURL(/\/system\/parametros\/sigtap/);
        await expect(page.getByRole('tab', { name: 'SIGTAP' })).toHaveAttribute('aria-selected', 'true');
    });

    test('sair encerra a sessão', async ({ page }) => {
        await page.getByText('Administrador', { exact: true }).first().click();
        await page.getByRole('button', { name: /Sair/ }).click();
        await expect(page.getByPlaceholder('Digite seu usuário')).toBeVisible();
    });
});
