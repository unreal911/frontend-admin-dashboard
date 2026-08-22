import { expect, test } from '@playwright/test';

test('solicita recuperación sin revelar si el correo existe', async ({ page }) => {
  let requestCalls = 0;
  await page.route('**/api/public/password-reset/request', async (route) => {
    requestCalls += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Si existe una cuenta activa con ese correo, recibirás un enlace para crear una nueva contraseña.',
      }),
    });
  });

  await page.goto('/login');
  await page.getByRole('link', { name: 'Olvidé mi contraseña' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.getByLabel('Correo de tu cuenta').fill('ana@example.test');
  await page.getByRole('button', { name: 'Enviar enlace de recuperación' }).click();

  await expect(page.getByRole('status')).toContainText('Si existe una cuenta activa');
  expect(requestCalls).toBe(1);
});

test('valida confirmación y permite guardar una nueva contraseña', async ({ page }) => {
  let confirmCalls = 0;
  await page.route('**/api/public/password-reset/confirm', async (route) => {
    confirmCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Contraseña actualizada.' }),
    });
  });

  await page.goto('/forgot-password/reset?token=valid-reset-token-value-with-more-than-40-chars');
  await page.locator('input[name="password"]').fill('Nueva!Clave2026');
  await page.locator('input[name="confirmPassword"]').fill('Otra!Clave2026');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();

  await expect(page.locator('.auth-error')).toHaveText('Las contrasenas no coinciden.');
  expect(confirmCalls).toBe(0);

  await page.locator('input[name="confirmPassword"]').fill('Nueva!Clave2026');
  await page.getByRole('button', { name: 'Guardar nueva contraseña' }).click();
  await expect(page.getByRole('status')).toContainText('sesiones abiertas dejaron de ser válidas');
  expect(confirmCalls).toBe(1);
});
