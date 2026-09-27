import { expect, test } from '@playwright/test';

test('verifica el registro con OTP ligado al número de WhatsApp', async ({ page }) => {
  let verifyPayload: Record<string, unknown> | null = null;
  await page.route('**/api/public/signup/verify', async (route) => {
    verifyPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ trialToken: 'trial-token', expiresAt: new Date().toISOString() }),
    });
  });
  await page.route('**/api/public/signup/trial', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        tenant: { name: 'Tienda OTP', trialEndsAt: '2026-09-25T00:00:00.000Z' },
      }),
    });
  });

  await page.goto('/signup/verify');
  await page.getByLabel('Número de WhatsApp').fill('999888777');
  await page.getByLabel('Código de verificación').fill('428193');
  await page.getByRole('button', { name: 'Verificar y crear mi empresa' }).click();

  await expect(page.getByRole('heading', { name: 'Tienda OTP' })).toBeVisible();
  expect(verifyPayload).toEqual({ token: '428193', identifier: '999888777' });
});

test('recupera la contraseña con OTP sin exponerlo en una URL', async ({ page }) => {
  let confirmPayload: Record<string, unknown> | null = null;
  await page.route('**/api/public/auth/policy', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          signupEmailEnabled: false,
          signupWhatsappEnabled: true,
          loginEmailEnabled: false,
          loginWhatsappEnabled: true,
          passwordResetEmailEnabled: false,
          passwordResetWhatsappEnabled: true,
          invitationEmailEnabled: false,
          invitationWhatsappEnabled: true,
        },
      }),
    });
  });
  await page.route('**/api/public/password-reset/request', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Si la cuenta existe, recibirás un código.' }),
    });
  });
  await page.route('**/api/public/password-reset/confirm', async (route) => {
    confirmPayload = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Contraseña actualizada.' }),
    });
  });

  await page.goto('/forgot-password');
  await page.getByLabel('Número de WhatsApp de tu cuenta').fill('999888777');
  await page.getByRole('button', { name: 'Enviar código de recuperación' }).click();
  await page.getByLabel('Código de recuperación').fill('428193');
  await page.locator('input[name="password"]').fill('Nueva!Clave2026');
  await page.locator('input[name="confirmPassword"]').fill('Nueva!Clave2026');
  await page.getByRole('button', { name: 'Validar código y guardar contraseña' }).click();

  await expect(page.getByRole('status')).toContainText('sesiones abiertas dejaron de ser válidas');
  expect(confirmPayload).toEqual({
    token: '428193',
    password: 'Nueva!Clave2026',
    identifier: '999888777',
  });
  await expect(page).toHaveURL(/\/forgot-password$/);
});
