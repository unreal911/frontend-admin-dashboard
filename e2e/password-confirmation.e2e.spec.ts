import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const artifactsDir = path.join(process.cwd(), 'test-artifacts');

test.beforeAll(() => {
  mkdirSync(artifactsDir, { recursive: true });
});

test('registro exige repetir la contrasena antes de enviar', async ({ page }) => {
  let signupCalls = 0;

  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render: function (_element, options) {
          setTimeout(function () { options.callback('e2e-turnstile-token'); }, 0);
          return 'e2e-widget';
        },
        reset: function () {},
        remove: function () {}
      };`,
    });
  });
  await page.route('**/api/public/signup', async (route) => {
    signupCalls += 1;
    await route.fulfill({
      status: 429,
      contentType: 'application/json',
      headers: { 'retry-after': '121' },
      body: JSON.stringify({ message: 'Respuesta generica del backend.' }),
    });
  });

  await page.goto('/signup');
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido', { exact: true }).fill('Prueba');
  await page.getByLabel('Empresa', { exact: true }).fill('Empresa Prueba');
  await page.getByLabel('Correo', { exact: true }).fill('ana@example.com');
  await page.locator('input[name="password"]').fill('Clave-segura-123!');
  await page.locator('input[name="confirmPassword"]').fill('Clave-diferente-456!');
  await page.locator('input[name="termsAccepted"]').check();

  const submitButton = page.getByRole('button', { name: 'Iniciar prueba de 15 días' });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await expect(page.locator('.auth-error')).toHaveText('Las contrasenas no coinciden.');
  expect(signupCalls).toBe(0);
  await page.screenshot({
    path: path.join(artifactsDir, 'password-confirmation-signup.png'),
    fullPage: true,
  });

  await page.locator('input[name="confirmPassword"]').fill('Clave-segura-123!');
  await submitButton.click();
  await expect(page.locator('.auth-error')).toHaveText('Demasiados intentos. Intenta nuevamente en 3 minutos.');
  expect(signupCalls).toBe(1);
  await page.screenshot({
    path: path.join(artifactsDir, 'signup-rate-limit-message.png'),
    fullPage: true,
  });
});

test('invitacion de cuenta nueva muestra repetir contrasena', async ({ page }) => {
  let acceptCalls = 0;

  await page.route('**/api/public/invitations/inspect', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        invitation: {
          email: 'invitada@example.com',
          role: 'SELLER',
          status: 'PENDING',
          existingAccount: false,
          tenant: { name: 'Empresa Prueba', slug: 'empresa-prueba' },
        },
      }),
    });
  });
  await page.route('**/api/public/invitations/accept', async (route) => {
    acceptCalls += 1;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.goto('/accept-invitation?token=e2e-token');
  await page.getByLabel('Nombre', { exact: true }).fill('Ana');
  await page.getByLabel('Apellido', { exact: true }).fill('Invitada');
  await page.locator('input[name="password"]').fill('Clave-segura-123!');
  await page.locator('input[name="confirmPassword"]').fill('Clave-diferente-456!');
  await page.getByRole('button', { name: 'Aceptar invitación' }).click();

  await expect(page.locator('.auth-error')).toHaveText('Las contrasenas no coinciden.');
  expect(acceptCalls).toBe(0);
  await page.screenshot({
    path: path.join(artifactsDir, 'password-confirmation-invitation.png'),
    fullPage: true,
  });
});
