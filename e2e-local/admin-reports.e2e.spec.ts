import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const screenshotsDir = path.join(process.cwd(), 'test-artifacts', 'reports');

test.beforeAll(() => { mkdirSync(screenshotsDir, { recursive: true }); });

async function login(page: import('@playwright/test').Page) {
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok(), `login respondio ${response.status()}`).toBeTruthy();
}

test('crea, filtra y exporta un reporte personalizado en escritorio y movil', async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/admin/reports');
  await expect(page.getByRole('heading', { name: 'Constructor de reportes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fuente del reporte' })).toContainText('Ventas y pedidos');
  await expect(page.locator('.admin-report-table-next')).toBeVisible();

  const sourcesResult = await page.evaluate(async () => {
    const response = await fetch('/api/admin/reports/sources');
    return { status: response.status, body: await response.json() };
  });
  expect(sourcesResult.status, `sources respondio ${sourcesResult.status}`).toBe(200);
  const sources = sourcesResult.body.data as Array<{ id: string; defaultColumns: string[]; fields: Array<{ key: string }> }>;
  expect(sources.map((source) => source.id)).toEqual(['sales', 'products', 'customers', 'inventory']);
  for (const source of sources) {
    const result = await page.evaluate(async (data) => {
      const response = await fetch('/api/admin/reports/preview', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
      });
      return { status: response.status, body: await response.json() };
    }, {
        source: source.id, columns: source.defaultColumns, filters: [],
        sort: { field: source.defaultColumns[0] || source.fields[0].key, direction: 'asc' }, limit: 10,
    });
    expect(result.status, `la fuente ${source.id} respondio ${result.status}: ${JSON.stringify(result.body)}`).toBe(200);
  }

  const availableDocument = page.locator('.admin-report-field-chip-next').filter({ hasText: 'Documento' });
  await expect(availableDocument).toHaveCount(1);
  await availableDocument.dragTo(page.getByTestId('report-columns-dropzone'));
  await expect(page.getByRole('button', { name: 'Quitar Documento' })).toBeVisible();

  await page.getByRole('button', { name: '+ Agregar filtro' }).click();
  await page.getByRole('button', { name: 'Campo del filtro 1' }).click();
  await page.getByRole('option', { name: 'Total', exact: true }).click();
  await page.getByRole('button', { name: 'Condicion del filtro 1' }).click();
  await page.getByRole('option', { name: 'Mayor que' }).click();
  await page.locator('.admin-report-filter-row-next input[type="number"]').fill('0');
  await page.getByRole('button', { name: 'Generar vista previa' }).click();
  await expect(page.locator('.admin-report-preview-next header p')).toContainText('registros coinciden');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar a Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^reporte-sales-\d{4}-\d{2}-\d{2}\.xlsx$/);
  const downloadedPath = await download.path();
  expect(downloadedPath).toBeTruthy();
  expect(readFileSync(downloadedPath!).subarray(0, 2).toString()).toBe('PK');
  await page.screenshot({ path: path.join(screenshotsDir, 'report-builder-1280.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Constructor de reportes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fuente del reporte' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await page.screenshot({ path: path.join(screenshotsDir, 'report-builder-390.png'), fullPage: true });
});
