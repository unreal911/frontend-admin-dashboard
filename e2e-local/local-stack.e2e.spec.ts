import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const artifactsDir = path.join(process.cwd(), 'test-artifacts');

test.beforeAll(() => {
  mkdirSync(artifactsDir, { recursive: true });
});

test('autentica el admin y carga marketplace y Mailpit reales', async ({ page }) => {
  const adminEmail = process.env.E2E_ADMIN_EMAIL || 'admin@example.com';
  const adminPassword = process.env.E2E_ADMIN_PASSWORD || 'password123';

  await page.goto('/login');
  await page.getByLabel('Correo').fill(adminEmail);
  await page.getByLabel('Contrasena').fill(adminPassword);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();

  await expect(page).toHaveURL(/\/admin\/dashboard/);
  await expect(page.getByRole('heading', { name: 'Dashboard principal' })).toBeVisible();
  await page.screenshot({
    path: path.join(artifactsDir, 'local-admin-dashboard.png'),
    fullPage: true,
  });

  await page.goto('http://127.0.0.1:3003/marketplace');
  await expect(page.getByRole('heading', { name: /Encuentra polos por color y talla/i })).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(7);
  await page.screenshot({
    path: path.join(artifactsDir, 'local-marketplace.png'),
    fullPage: true,
  });

  await page.goto('http://127.0.0.1:8025');
  await expect(page).toHaveTitle(/Mailpit/i);
  await page.screenshot({
    path: path.join(artifactsDir, 'local-mailpit.png'),
    fullPage: true,
  });
});
