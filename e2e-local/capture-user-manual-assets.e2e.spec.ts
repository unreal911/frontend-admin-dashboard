import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const assetsDir = path.join(process.cwd(), 'public', 'manual');

async function login(page: Page) {
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok(), `login local respondio ${response.status()}`).toBeTruthy();
}

const captures = [
  { route: '/admin/dashboard', file: 'inicio-dashboard.png', readyText: 'Dashboard principal' },
  { route: '/admin/empresa', file: 'empresa-plan.png', readyText: 'Planes y facturación' },
  { route: '/admin/product/create', file: 'producto-crear.png', readyText: 'Crear producto' },
  { route: '/admin/inventory', file: 'inventario.png', readyText: 'Inventario' },
  { route: '/admin/orders/pos', file: 'punto-venta.png', readyText: 'Punto de venta' },
  { route: '/admin/customers', file: 'clientes.png', readyText: 'Clientes' },
  { route: '/admin/orders/picking', file: 'picking.png', readyText: 'Tablero de picking' },
  { route: '/admin/sunat/comprobantes', file: 'comprobantes.png', readyText: 'Comprobantes emitidos' },
  { route: '/admin/invitations', file: 'equipo.png', readyText: 'Invitaciones' },
];

test('genera capturas actuales para el manual de clientes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto('/admin/dashboard');

  const lightTheme = page.getByRole('button', { name: 'Cambiar a tema claro' });
  if (await lightTheme.isVisible()) await lightTheme.click();

  for (const capture of captures) {
    await page.goto(capture.route);
    await expect(page.getByText(capture.readyText, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1_200);
    await page.screenshot({ path: path.join(assetsDir, capture.file), fullPage: false });
  }
});
