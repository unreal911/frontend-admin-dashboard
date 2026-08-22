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

test('Turnstile reaparece al volver al registro sin refrescar la pagina', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js**', async (route) => {
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.turnstile = {
        render: function (_element, options) {
          var widget = document.createElement('div');
          var token = document.createElement('input');
          widget.dataset.testid = 'turnstile-rendered';
          token.type = 'hidden';
          token.name = 'cf-turnstile-response';
          token.value = 'e2e-turnstile-token';
          widget.appendChild(token);
          setTimeout(function () { _element.appendChild(widget); }, 0);
          return 'e2e-widget-' + Date.now();
        },
        reset: function () {},
        remove: function () {}
      };`,
    });
  });

  await page.goto('/signup');
  await expect(page.locator('[data-testid="turnstile-rendered"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Iniciar prueba de 15 días' })).toBeEnabled();

  await page.getByRole('link', { name: 'Ya tengo una cuenta' }).click();
  await page.getByRole('link', { name: 'Crear una prueba de 15 días' }).click();

  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.locator('[data-testid="turnstile-rendered"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Iniciar prueba de 15 días' })).toBeEnabled();
});

test('login avisa cuenta pendiente y permite reenviar activacion', async ({ page }) => {
  let resendCalls = 0;
  await page.route('**/api/admin/session', async (route) => {
    await route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        action: 'RESEND_VERIFICATION',
        message: 'Tu correo todavia no esta verificado.',
      }),
    });
  });
  await page.route('**/api/public/signup/resend', async (route) => {
    resendCalls += 1;
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Si la cuenta esta pendiente, recibiras un enlace nuevo.' }),
    });
  });

  await page.goto('/login');
  await page.getByLabel('Correo', { exact: true }).fill('pendiente@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('Clave-segura-123!');
  await page.getByRole('button', { name: 'Ingresar' }).click();

  await expect(page.getByText('Cuenta pendiente de activar')).toBeVisible();
  await page.getByRole('button', { name: 'Reenviar correo de activación' }).click();
  await expect(page.getByRole('status')).toContainText('recibiras un enlace nuevo');
  expect(resendCalls).toBe(1);
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
