import { expect, test } from '@playwright/test';

test('la raíz lleva al login sin sesión', async ({ context, page }) => {
  await context.clearCookies();
  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Ingresa a tu tienda' })).toBeVisible();
});

test('la raíz elimina una sesión inválida y lleva al login', async ({ context, page }) => {
  await context.addCookies([{
    name: 'admin_session',
    value: 'token-invalido',
    url: 'http://127.0.0.1:3001',
  }]);

  await page.goto('/');

  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((cookie) => cookie.name === 'admin_session')).toBeUndefined();
});
