import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotsDir = path.join(process.cwd(), 'test-artifacts', 'manual');

async function login(page: Page) {
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok(), `login local respondio ${response.status()}`).toBeTruthy();
}

test.beforeAll(() => mkdirSync(screenshotsDir, { recursive: true }));

test('el cliente encuentra el manual desde el menu y busca por palabra clave', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await login(page);
  await page.goto('/admin/manual');

  await expect(page.getByRole('heading', { name: 'Manual de usuario', exact: true })).toBeVisible();
  await expect(page.locator('.admin-sidebar').getByText('Manual de usuario', { exact: true })).toBeVisible();
  await expect(page.locator('.manual-topic-next')).toHaveCount(11);
  await expect(page.getByText('De cuenta nueva a primera venta', { exact: true })).toBeVisible();

  const lightTheme = page.getByRole('button', { name: 'Cambiar a tema claro' });
  if (await lightTheme.isVisible()) await lightTheme.click();
  await page.screenshot({ path: path.join(screenshotsDir, 'manual-desktop.png'), fullPage: false });

  const search = page.getByPlaceholder(/Busca por palabra clave/);
  await search.fill('usuario');
  await expect(page.getByRole('heading', { name: /Resultados para “usuario”/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Invita colaboradores y controla sus permisos' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Realiza una venta en el Punto de venta' })).toHaveCount(0);

  await search.fill('pago revisión');
  await expect(page.getByRole('heading', { name: 'Trial, elección de plan y pago manual' })).toBeVisible();
  await expect(page.getByText('Tu pago está en revisión', { exact: false }).first()).toBeVisible();
});

test('el manual es legible y no desborda en celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto('/admin/manual');
  await expect(page.getByRole('heading', { name: 'Manual de usuario', exact: true })).toBeVisible();

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);

  const search = page.getByPlaceholder(/Busca por palabra clave/);
  await search.fill('stock');
  await expect(page.getByRole('heading', { name: 'Registra stock y controla existencias' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'manual-mobile-busqueda.png'), fullPage: true });
});
