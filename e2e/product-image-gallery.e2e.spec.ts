import path from 'node:path';
import { expect, test } from '@playwright/test';

test('galeria de producto mobile: carga, portada, orden, vista previa y deshacer', async ({ context, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await context.addCookies([{
    name: 'admin_session',
    value: 'e2e-product-gallery-session',
    domain: '127.0.0.1',
    path: '/',
  }]);

  // El shell consulta otros endpoints administrativos; se aislan para que
  // ningun 401 ajeno a la galeria fuerce una redireccion durante esta prueba.
  await page.route('**/api/admin/**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({}),
  }));

  await page.route('**/api/admin/auth/me', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      user: {
        id: 1,
        firstName: 'Prueba',
        lastName: 'Visual',
        email: 'visual@example.test',
        role: 'OWNER',
        permissions: ['*'],
        tenant: { id: 'tenant-e2e', slug: 'tenant-e2e', name: 'Tienda E2E', status: 'ACTIVE' },
        membership: { id: 'membership-e2e', role: 'OWNER', status: 'ACTIVE' },
        plan: { code: 'PRO', features: ['*'] },
      },
    }),
  }));

  await page.route('**/api/admin/categories?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 1, name: 'Polos' }] }),
  }));
  await page.route('**/api/admin/colors?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 1, name: 'Negro', hex: '#111111' }] }),
  }));
  await page.route('**/api/admin/sizes?**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ data: [{ id: 1, name: 'M' }] }),
  }));

  await page.goto('/admin/product/create');
  await expect(page.getByText('Identificacion del producto')).toBeVisible();
  await page.locator('[role="tab"]').nth(2).click();

  const upload = page.locator('.admin-product-upload-zone input[type="file"]');
  await upload.setInputFiles([
    path.join(process.cwd(), 'public', 'auth-fashion-illustration.png'),
    path.join(process.cwd(), 'public', 'manual', 'producto-crear.png'),
  ]);

  await expect(page.getByText('2 fotos', { exact: true })).toBeVisible();
  await expect(page.getByText('Portada', { exact: true })).toBeVisible();
  await expect(page.getByText('Foto 2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Mover foto antes' }).nth(1).click();
  await expect(page.getByText('Nueva foto de portada seleccionada.')).toBeVisible();

  await page.getByRole('button', { name: 'Ampliar foto 1' }).click();
  await expect(page.getByRole('dialog', { name: 'Vista previa de imagen' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Vista previa de imagen' })).toBeHidden();

  await page.getByRole('button', { name: 'Quitar' }).first().click();
  await expect(page.getByText('Quitaste una foto. Aun no se ha eliminado.')).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer' }).click();
  await expect(page.getByText('2 fotos', { exact: true })).toBeVisible();

  await page.screenshot({ path: path.join('test-results', 'product-image-gallery-mobile.png') });
});
