import { expect, test } from '@playwright/test';

test('login ubica la ilustración a la izquierda y el formulario a la derecha', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/login');

  const visual = page.locator('.auth-fashion-visual-next');
  const formPanel = page.locator('.auth-fashion-form-panel-next');
  await expect(visual).toBeVisible();
  await expect(page.getByAltText('Ropa, calzado y herramientas para gestionar una tienda de moda')).toBeVisible();

  const visualBox = await visual.boundingBox();
  const formBox = await formPanel.boundingBox();
  expect(visualBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(visualBox!.x).toBeLessThan(formBox!.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
});

test('login móvil prioriza el formulario sin desbordamiento horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');

  const visualBox = await page.locator('.auth-fashion-visual-next').boundingBox();
  const formBox = await page.locator('.auth-fashion-form-panel-next').boundingBox();
  expect(visualBox).not.toBeNull();
  expect(formBox).not.toBeNull();
  expect(visualBox!.y).toBeLessThan(formBox!.y);
  expect(formBox!.width).toBeLessThanOrEqual(390);

  const inputHeights = await page.locator('.auth-form-next input').evaluateAll(
    (inputs) => inputs.map((input) => input.getBoundingClientRect().height),
  );
  expect(inputHeights.every((height) => height >= 48)).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('registro compacto usa una columna y controles táctiles', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/signup');

  const nameGridColumns = await page.locator('.public-flow-name-grid-next').evaluate(
    (element) => getComputedStyle(element).gridTemplateColumns.split(' ').length,
  );
  const fieldHeights = await page.locator('.auth-form-next input:not([type="checkbox"])').evaluateAll(
    (inputs) => inputs.map((input) => input.getBoundingClientRect().height),
  );

  expect(nameGridColumns).toBe(1);
  expect(fieldHeights.every((height) => height >= 48)).toBeTruthy();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});
