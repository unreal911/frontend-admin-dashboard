import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotsDir = path.join(process.cwd(), 'test-artifacts', 'company-plan-ux');

async function login(page: Page) {
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok()).toBeTruthy();
}

async function mockCompanyPlan(page: Page) {
  await page.route('**/api/admin/tenant/lifecycle', (route) => route.fulfill({ json: {
    tenant: { name: 'Comercial Andina', status: 'TRIAL', kind: 'TRIAL', planCode: 'TRIAL', trialEndsAt: new Date(Date.now() + 4 * 86_400_000).toISOString(), sunatProductionEnabled: false, maxUsers: 5, maxProducts: 100, maxOrders: 300, maxStores: 2, maxVariantsPerProduct: 50, maxPosSalesPerMonth: 300, maxMainImagesPerProduct: 5, maxImagesPerVariant: 1, maxStorageBytes: '21474836480' },
    plan: { code: 'TRIAL', name: 'Prueba gratuita', monthlyPricePen: null, features: [], effectiveMaxStores: 2, welcomeStorePromotion: { active: false, warning: false } },
    usage: { users: 2, products: 34, stores: 1, activeVariants: 50, posSales: 86, posSalesToday: 4, posSalesPeriodEnd: new Date().toISOString(), storageBytes: '10485760' },
    conflicts: { hasConflicts: false, users: { used: 2, limit: 5, excess: 0 }, products: { used: 34, limit: 100, excess: 0 }, stores: { used: 1, limit: 2, excess: 0 }, productsOverVariantLimit: 0, productsOverMainImageLimit: 0, variantsWithImagesNotAllowed: 0 },
    readOnly: false,
  } }));
  await page.route('**/api/admin/subscription/catalog', (route) => route.fulfill({ json: {
    plans: [
      { code: 'STARTER', displayName: 'Económico', planVersionId: 'starter', currency: 'PEN', monthlyPrice: '30.00', annualPrice: '300.00', limits: { maxProducts: 25, maxUsers: 2, maxStores: 1, maxPosSalesPerMonth: 70 } },
      { code: 'GROWTH', displayName: 'Negocio', planVersionId: 'growth', currency: 'PEN', monthlyPrice: '70.00', annualPrice: '700.00', limits: { maxProducts: 50, maxUsers: 5, maxStores: 2, maxPosSalesPerMonth: 300 } },
      { code: 'PREMIUM', displayName: 'Pro', planVersionId: 'premium', currency: 'PEN', monthlyPrice: '130.00', annualPrice: '1300.00', limits: { maxProducts: 200, maxUsers: 15, maxStores: 5, maxPosSalesPerMonth: 1500 } },
    ],
    paymentMethods: [{ id: 'bank', type: 'BANK_TRANSFER', name: 'Cuenta BCP', bankName: 'BCP', accountHolder: 'Tienda SaaS', accountNumber: '000-0000000-0', cci: '002-000-000000000000-00', currency: 'PEN', instructions: 'Transfiere el monto exacto y conserva tu comprobante.' }],
  } }));
  await page.route('**/api/admin/subscription/payment-requests', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/admin/subscription/downgrade-preview/*', (route) => route.fulfill({ json: { isDowngrade: false, requiresSelection: false, limits: { users: 2, products: 25, stores: 1 }, conflicts: { users: 0, products: 0, stores: 0 }, users: [], products: [], stores: [], suggested: { userIds: [], productIds: [], storeIds: [] } } }));
}

for (const viewport of [{ name: 'desktop', width: 1366, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`Empresa y plan mantiene jerarquía y controles visibles en ${viewport.name}`, async ({ page }) => {
    mkdirSync(screenshotsDir, { recursive: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);
    await mockCompanyPlan(page);
    await page.goto('/admin/empresa');
    await expect(page.getByRole('heading', { name: 'Comercial Andina' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Selecciona un plan' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Negocio/ })).toBeVisible();
    await expect(page.getByText('Sube tu comprobante')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: path.join(screenshotsDir, `empresa-plan-${viewport.name}.png`), fullPage: true });
  });
}
