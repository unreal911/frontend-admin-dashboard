import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const screenshotsDir = path.join(process.cwd(), 'test-artifacts', 'responsive-after');

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
});

const criticalRoutes = [
  '/admin/dashboard',
  '/admin/product',
  '/admin/inventory',
  '/admin/inventory/movements',
  '/admin/transfers',
  '/admin/stores',
  '/admin/orders/list',
  '/admin/customers',
  '/admin/orders/pos',
  '/admin/orders/picking',
  '/admin/sunat',
  '/admin/sunat/comprobantes',
  '/admin/users',
];

async function login(page: Page) {
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok(), `login local respondio ${response.status()}`).toBeTruthy();
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/admin\/dashboard/);
}

test('el estado inicial del admin no se descuadra en movil', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const response = await page.request.post('/api/admin/session', {
    data: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@example.com',
      password: process.env.E2E_ADMIN_PASSWORD || 'password123',
    },
  });
  expect(response.ok()).toBeTruthy();

  await page.route('**/api/admin/auth/me', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page.goto('/admin/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Validando sesion...' })).toBeVisible();

  const loadingLayout = await page.evaluate(() => {
    const shell = document.querySelector('.admin-shell');
    const sidebar = document.querySelector('.admin-shell > .admin-sidebar');
    const content = document.querySelector('.admin-content');
    return {
      sidebarPosition: sidebar ? getComputedStyle(sidebar).position : '',
      contentOffset: shell && content
        ? Math.round(content.getBoundingClientRect().left - shell.getBoundingClientRect().left)
        : -1,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(loadingLayout).toEqual({
    sidebarPosition: 'fixed',
    contentOffset: 0,
    documentOverflow: 0,
  });
  await page.screenshot({
    path: path.join(screenshotsDir, 'login-validating-360.png'),
    fullPage: true,
  });
});

test('los selects nuevos usan el componente normalizado en escritorio y movil', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.goto('/admin/invitations');
  await expect(page.getByRole('heading', { name: 'Invitaciones' })).toBeVisible();
  await expect(page.locator('.admin-content select')).toHaveCount(0);
  const invitationRole = page.getByRole('button', { name: 'Rol de la invitacion' });
  await expect(invitationRole).toBeVisible();
  await invitationRole.click();
  await expect(page.getByRole('listbox', { name: 'Rol de la invitacion' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'invitations-select-390.png'), fullPage: true });

  await page.goto('/admin/customers');
  await expect(page.locator('.admin-filters-legend-next')).toHaveText('Clientes');
  await expect(page.locator('.admin-content select')).toHaveCount(0);
  const customerStatus = page.getByRole('button', { name: 'Estado de clientes' });
  await expect(customerStatus).toBeVisible();
  await customerStatus.click();
  await expect(page.getByRole('listbox', { name: 'Estado de clientes' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'customers-filter-select-390.png'), fullPage: true });

  await customerStatus.click();
  const newCustomer = page.getByRole('button', { name: 'Nuevo cliente' });
  await newCustomer.click();
  const documentType = page.getByRole('button', { name: 'Tipo de documento del cliente' });
  await expect(documentType).toBeVisible();
  await documentType.click();
  await expect(page.getByRole('listbox', { name: 'Tipo de documento del cliente' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'customers-document-select-390.png'), fullPage: true });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/admin/invitations');
  await expect(page.getByRole('heading', { name: 'Invitaciones' })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();
  const desktopInvitationRole = page.getByRole('button', { name: 'Rol de la invitacion' });
  await desktopInvitationRole.click();
  await expect(page.getByRole('listbox', { name: 'Rol de la invitacion' })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'invitations-select-1280.png'), fullPage: true });
});

test('los inputs nuevos estan normalizados en Invitaciones, Clientes y Empresa', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();

  await page.goto('/admin/invitations');
  await expect(page.getByRole('heading', { name: 'Invitaciones' })).toBeVisible();
  const invitationEmail = page.getByPlaceholder('persona@empresa.com');
  await expect(invitationEmail).toBeVisible();
  const invitationStyle = await invitationEmail.evaluate((element) => {
    const style = getComputedStyle(element);
    return { borderRadius: style.borderRadius, minHeight: Number.parseFloat(style.minHeight) };
  });
  expect(invitationStyle.borderRadius).toBe('10px');
  expect(invitationStyle.minHeight).toBeGreaterThanOrEqual(42);
  await page.screenshot({ path: path.join(screenshotsDir, 'invitations-input-1280.png'), fullPage: true });

  await page.goto('/admin/customers');
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const customerInputs = page.locator(".admin-customer-form-next input:not([type='checkbox']):not([type='radio'])");
  await expect(customerInputs).toHaveCount(5);
  const customerMetrics = await customerInputs.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return { radius: style.borderRadius, height: element.getBoundingClientRect().height };
  }));
  expect(customerMetrics.every((metric) => metric.radius === '10px' && metric.height >= 42)).toBeTruthy();

  await page.goto('/admin/empresa');
  await expect(page.getByRole('heading', { name: 'Perfil legal' })).toBeVisible();
  const legalInputs = page.locator(".tenant-legal-profile-form-next input:not([type='checkbox']):not([type='radio'])");
  await expect(legalInputs).toHaveCount(5);
  const desktopMetrics = await legalInputs.evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return { radius: style.borderRadius, height: rect.height, right: rect.right };
  }));
  expect(desktopMetrics.every((metric) => metric.radius === '10px' && metric.height >= 42 && metric.right <= 1281)).toBeTruthy();
  const desktopCardGaps = await page.locator('.admin-company-page-next > .admin-card').evaluateAll((cards) => cards.slice(1).map((card, index) => {
    const previous = cards[index].getBoundingClientRect();
    return card.getBoundingClientRect().top - previous.bottom;
  }));
  expect(desktopCardGaps.every((gap) => gap >= 12)).toBeTruthy();
  await page.screenshot({ path: path.join(screenshotsDir, 'empresa-inputs-1280.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Perfil legal' })).toBeVisible();
  const mobileMetrics = await legalInputs.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, left: rect.left, right: rect.right };
  }));
  expect(mobileMetrics.every((metric) => metric.height >= 44 && metric.left >= -1 && metric.right <= 391)).toBeTruthy();
  const mobileCardGaps = await page.locator('.admin-company-page-next > .admin-card').evaluateAll((cards) => cards.slice(1).map((card, index) => {
    const previous = cards[index].getBoundingClientRect();
    return card.getBoundingClientRect().top - previous.bottom;
  }));
  expect(mobileCardGaps.every((gap) => gap >= 10)).toBeTruthy();
  await page.screenshot({ path: path.join(screenshotsDir, 'empresa-inputs-390.png'), fullPage: true });
});

test('el sidebar distribuye las opciones por secciones en escritorio y movil', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await login(page);
  await page.getByRole('button', { name: 'Cambiar a tema claro' }).click();

  const groups = page.locator('.admin-sidebar-group');
  await expect(groups).toHaveCount(7);
  await expect(page.getByRole('button', { name: 'Seccion Inicio' })).toHaveAttribute('aria-expanded', 'true');
  const desktopSalesGroup = page.getByRole('button', { name: 'Seccion Ventas y atencion' });
  await expect(desktopSalesGroup).toHaveAttribute('aria-expanded', 'false');
  await desktopSalesGroup.click();
  await expect(desktopSalesGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.admin-sidebar').getByText('Punto de venta', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'sidebar-sections-1280.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const openMenu = page.getByRole('button', { name: 'Abrir menu lateral' });
  await openMenu.click();
  await expect(page.getByText('Menu principal', { exact: true })).toBeVisible();

  const catalogGroup = page.getByRole('button', { name: 'Seccion Catalogo' });
  await expect(catalogGroup).toHaveAttribute('aria-expanded', 'false');
  await catalogGroup.click();
  await expect(catalogGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.admin-sidebar').getByText('Productos', { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(screenshotsDir, 'sidebar-sections-390.png'), fullPage: true });
});

for (const viewport of [
  { name: 'mobile', width: 360, height: 800 },
  { name: 'tablet-portrait', width: 820, height: 1180 },
]) {
  test(`admin no desborda en ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await login(page);

    for (const route of criticalRoutes) {
      await page.goto(route);
      await page.waitForLoadState('domcontentloaded');

      const initialShell = await page.evaluate(() => {
        const shell = document.querySelector('.admin-shell');
        const sidebar = document.querySelector('.admin-shell > .admin-sidebar');
        const content = document.querySelector('.admin-content');
        return {
          sidebarPosition: sidebar ? getComputedStyle(sidebar).position : '',
          contentOffset: shell && content
            ? Math.round(content.getBoundingClientRect().left - shell.getBoundingClientRect().left)
            : -1,
        };
      });
      expect(initialShell.sidebarPosition, `${route}: el lateral inicial debe ser drawer`).toBe('fixed');
      expect(initialShell.contentOffset, `${route}: el contenido inicial se desplaza`).toBeLessThanOrEqual(1);

      await expect(page.getByRole('heading', { name: 'Validando sesion...' })).toHaveCount(0);

      const layout = await page.evaluate(() => {
        const root = document.documentElement;
        const visible = (element: Element) => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const controlsOutsideViewport = Array.from(
          document.querySelectorAll('.admin-content input, .admin-content select, .admin-content textarea, .admin-content button, [role="dialog"] input, [role="dialog"] select, [role="dialog"] textarea, [role="dialog"] button'),
        )
          .filter(visible)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tag: element.tagName.toLowerCase(),
              text: (element.textContent || element.getAttribute('aria-label') || '').trim().slice(0, 50),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
            };
          })
          .filter(({ left, right }) => left < -1 || right > window.innerWidth + 1);

        const overflowingResponsiveTables = Array.from(document.querySelectorAll('.admin-table-wrap'))
          .filter(visible)
          .filter((wrapper) => wrapper.querySelector('table.mobile-card-table'))
          .filter((wrapper) => wrapper.scrollWidth > wrapper.clientWidth + 1)
          .map((wrapper) => ({ clientWidth: wrapper.clientWidth, scrollWidth: wrapper.scrollWidth }));

        return {
          documentClientWidth: root.clientWidth,
          documentScrollWidth: root.scrollWidth,
          controlsOutsideViewport,
          overflowingResponsiveTables,
        };
      });

      expect(layout.documentScrollWidth, `${route}: el documento desborda`).toBeLessThanOrEqual(
        layout.documentClientWidth + 1,
      );
      expect(layout.controlsOutsideViewport, `${route}: controles fuera del viewport`).toEqual([]);
      expect(layout.overflowingResponsiveTables, `${route}: tabla responsive desborda su contenedor`).toEqual([]);

      if (route === '/admin/inventory' || route === '/admin/customers' || route === '/admin/orders/pos') {
        await page.screenshot({
          path: path.join(screenshotsDir, `${route.split('/').pop()}-${viewport.width}.png`),
          fullPage: true,
        });
      }
    }
  });
}
