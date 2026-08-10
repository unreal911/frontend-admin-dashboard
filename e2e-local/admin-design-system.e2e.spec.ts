import { expect, test, type Page } from '@playwright/test';

async function prepareAdmin(page: Page) {
  await page.context().addCookies([{
    name: 'admin_session',
    value: 'visual-test-session',
    url: 'http://127.0.0.1:3001',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  await page.route('**/api/admin/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/admin/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: 1,
            firstName: 'Milton',
            lastName: 'Cañari',
            email: 'admin@example.com',
            role: 'OWNER',
            permissions: ['*'],
            tenant: { id: '1', slug: 'empresa-principal', name: 'Empresa principal', status: 'ACTIVE' },
            membership: { id: '1', role: 'OWNER', status: 'ACTIVE' },
          },
        }),
      });
      return;
    }
    if (url.pathname === '/api/admin/orders') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [], pagination: { page: 1, limit: 100, total: 0, totalPages: 1 } }),
      });
      return;
    }
    if (url.pathname === '/api/admin/stores') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) });
      return;
    }
    if (url.pathname === '/api/admin/sunat/informe-dia') {
      const grupo = { total: 0, declaradas: 0, pendientes: 0, monto: 0, montoPendiente: 0 };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fecha: '2026-08-10', boletas: grupo, facturas: grupo, notas: grupo }),
      });
      return;
    }
    if (url.pathname === '/api/admin/sunat/comprobantes') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [], total: 0 }) });
      return;
    }
    if (url.pathname === '/api/admin/tenant/lifecycle') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tenant: {
            name: 'Empresa principal', status: 'ACTIVE', kind: 'BUSINESS', planCode: 'TRIAL',
            sunatProductionEnabled: false, maxUsers: 5, maxProducts: 100, maxOrders: 500,
            maxStorageBytes: '104857600',
          },
          usage: { users: 1, products: 0, orders: 0, storageBytes: '0' },
          readOnly: false,
        }),
      });
      return;
    }
    if (url.pathname === '/api/admin/reports/sources') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: [{
          id: 'products', label: 'Productos', description: 'Catalogo', defaultColumns: ['name'],
          fields: [{ key: 'name', label: 'Nombre', type: 'text' }],
        }] }),
      });
      return;
    }
    if (url.pathname === '/api/admin/reports/preview') {
      const source = {
        id: 'products', label: 'Productos', description: 'Catalogo', defaultColumns: ['name'],
        fields: [{ key: 'name', label: 'Nombre', type: 'text' }],
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ source, columns: source.fields, rows: [], total: 0, truncated: false }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) });
  });
}

test('dashboard consume el sistema visual normalizado en escritorio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareAdmin(page);
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard principal' })).toBeVisible();

  const visualContract = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const header = document.querySelector('.ds-page-header');
    const button = document.querySelector('.ds-button-primary');
    const card = document.querySelector('.dashboard-kpi-card-next');
    if (!header || !button || !card) return null;
    const headerStyle = getComputedStyle(header);
    const buttonStyle = getComputedStyle(button);
    const cardStyle = getComputedStyle(card);
    return {
      brand: root.getPropertyValue('--ds-brand-600').trim(),
      headerRadius: Number.parseFloat(headerStyle.borderRadius),
      buttonHeight: button.getBoundingClientRect().height,
      buttonRadius: Number.parseFloat(buttonStyle.borderRadius),
      cardRadius: Number.parseFloat(cardStyle.borderRadius),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  expect(visualContract).not.toBeNull();
  expect(visualContract?.brand).toBe('#5b3fd6');
  expect(visualContract?.headerRadius).toBe(14);
  expect(visualContract?.buttonHeight).toBeGreaterThanOrEqual(44);
  expect(visualContract?.buttonRadius).toBe(12);
  expect(visualContract?.cardRadius).toBe(14);
  expect(visualContract?.overflow).toBeLessThanOrEqual(1);
});

for (const width of [390, 320]) {
  test(`dashboard mantiene controles tactiles y sin desborde a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await prepareAdmin(page);
    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard principal' })).toBeVisible();

    const metrics = await page.evaluate(() => {
      const visible = (element: Element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const controls = Array.from(document.querySelectorAll('.admin-content button, .admin-content input, .admin-content select, .admin-content textarea'))
        .filter(visible)
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, left: rect.left, right: rect.right };
        });
      return {
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        controls,
      };
    });

    expect(metrics.overflow).toBeLessThanOrEqual(1);
    expect(metrics.controls.length).toBeGreaterThan(0);
    expect(metrics.controls.every((control) => control.height >= 44)).toBeTruthy();
    expect(metrics.controls.every((control) => control.left >= -1 && control.right <= width + 1)).toBeTruthy();

    const topbarMetrics = await page.locator('.admin-topbar').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width, scrollWidth: element.scrollWidth };
    });
    expect(topbarMetrics.height).toBeLessThanOrEqual(68);
    expect(topbarMetrics.scrollWidth).toBeLessThanOrEqual(topbarMetrics.width + 1);

    const accountButton = page.getByRole('button', { name: 'Abrir menú de cuenta' });
    await expect(accountButton).toBeVisible();
    await accountButton.click();
    await expect(page.getByRole('dialog', { name: 'Cuenta y preferencias' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Cambiar a tema/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
  });
}

test('el cambio de tema conserva tokens, superficies y contraste', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareAdmin(page);
  await page.goto('/admin/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard principal' })).toBeVisible();

  const toggle = page.getByRole('button', { name: /Cambiar a tema/ });
  const before = await page.locator('.admin-content').evaluate((element) => getComputedStyle(element).backgroundColor);
  await toggle.click();
  const after = await page.locator('.admin-content').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(after).not.toBe(before);
  await expect(page.locator('.ds-page-header')).toBeVisible();
});

test('pedidos usa acción secundaria y filtros segmentados normalizados', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await prepareAdmin(page);
  await page.goto('/admin/orders/list');
  await expect(page.getByRole('heading', { name: 'Gestion de ordenes' })).toBeVisible();

  const filtersButton = page.getByRole('button', { name: /^Filtros/ });
  const pendingButton = page.getByRole('button', { name: /^Pendiente/ });
  const metrics = await Promise.all([
    filtersButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, radius: style.borderRadius };
    }),
    pendingButton.evaluate((element) => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, radius: style.borderRadius };
    }),
  ]);

  expect(metrics[0]).toEqual({ height: 44, radius: '12px' });
  expect(metrics[1].height).toBeGreaterThanOrEqual(38);
  expect(metrics[1].radius).toBe('10px');
  await expect(pendingButton).toHaveAttribute('aria-pressed', 'false');
  await pendingButton.click();
  await expect(pendingButton).toHaveAttribute('aria-pressed', 'true');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const group = page.getByRole('group', { name: 'Filtrar rápidamente por estado' });
  await expect(group).toBeVisible();
  const mobileLayout = await group.evaluate((element) => ({
    columns: getComputedStyle(element).gridTemplateColumns.split(' ').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(mobileLayout.columns).toBe(2);
  expect(mobileLayout.overflow).toBeLessThanOrEqual(1);
});

test('los selectores despliegan opciones legibles dentro del viewport movil', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await prepareAdmin(page);
  await page.goto('/admin/roles');
  await expect(page.getByRole('heading', { name: 'Gestion de roles' })).toBeVisible();

  await page.getByLabel('Filtrar roles por estado', { exact: true }).click();
  const listbox = page.getByRole('listbox', { name: 'Filtrar roles por estado' });
  await expect(listbox).toBeVisible();
  const menu = await listbox.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const clippedOptions = Array.from(element.querySelectorAll<HTMLElement>('[role="option"]'))
      .filter((option) => option.scrollWidth > option.clientWidth + 2 || option.scrollHeight > option.clientHeight + 2)
      .map((option) => option.textContent?.trim() || '');
    return { left: rect.left, right: rect.right, width: rect.width, clippedOptions };
  });

  expect(menu.left).toBeGreaterThanOrEqual(11);
  expect(menu.right).toBeLessThanOrEqual(309);
  expect(menu.width).toBeGreaterThanOrEqual(190);
  expect(menu.clippedOptions).toEqual([]);
});

test('inventario respeta la jerarquia movil de titulo, herramientas y navegacion', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await prepareAdmin(page);
  await page.goto('/admin/inventory');
  await expect(page.getByRole('heading', { name: 'Inventario', exact: true })).toBeVisible();

  const hierarchy = await page.locator('.admin-dashboard-grid').first().evaluate((grid) => {
    const top = (selector: string) => grid.querySelector<HTMLElement>(selector)?.getBoundingClientRect().top ?? -1;
    return {
      title: top('.inventory-header-card'),
      tools: top('.inventory-mobile-toolbar-next'),
      navigation: top('.inventory-mobile-actions-next'),
    };
  });

  expect(hierarchy.title).toBeGreaterThanOrEqual(0);
  expect(hierarchy.tools).toBeGreaterThan(hierarchy.title);
  expect(hierarchy.navigation).toBeGreaterThan(hierarchy.tools);
});

const compactTitleRoutes = [
  '/admin/dashboard',
  '/admin/product',
  '/admin/category',
  '/admin/color',
  '/admin/size',
  '/admin/payment-methods',
  '/admin/customers',
  '/admin/inventory',
  '/admin/inventory/movements',
  '/admin/inventory/traceability',
  '/admin/transfers',
  '/admin/stores',
  '/admin/orders/list',
  '/admin/orders/pos',
  '/admin/orders/picking',
  '/admin/sunat',
  '/admin/sunat/comprobantes',
  '/admin/sunat/configuracion',
  '/admin/users',
  '/admin/roles',
  '/admin/invitations',
  '/admin/settings',
  '/admin/audit-logs',
  '/admin/user-activities',
  '/admin/reports',
  '/admin/empresa',
];

for (const route of compactTitleRoutes) {
  test(`titulo compacto en ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await prepareAdmin(page);
    await page.goto(route);
    await expect(page.getByRole('heading', { name: 'Validando sesion...' })).toHaveCount(0);
    const title = page.locator('.admin-content h1').first();
    await expect(title, `${route} debe mostrar titulo`).toBeVisible();
    const metrics = await title.evaluate((element) => {
      const card = element.closest('.ds-page-header, .admin-card, .admin-page-header, .admin-report-title-next');
      if (!card) return null;
      const rect = card.getBoundingClientRect();
      const style = getComputedStyle(card);
      return {
        height: rect.height,
        left: rect.left,
        right: rect.right,
        hasBorder: style.borderTopStyle !== 'none' && style.borderTopWidth !== '0px',
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(metrics, `${route} debe envolver el titulo en una tarjeta`).not.toBeNull();
    expect(metrics?.height, `${route} tiene un titulo demasiado alto`).toBeLessThanOrEqual(90);
    expect(metrics?.hasBorder).toBeTruthy();
    expect(metrics?.left).toBeGreaterThanOrEqual(-1);
    expect(metrics?.right).toBeLessThanOrEqual(321);
    expect(metrics?.overflow).toBeLessThanOrEqual(1);

    const brokenControls = await page.locator('.admin-content').evaluate((content) => {
      const viewportWidth = document.documentElement.clientWidth;
      return Array.from(content.querySelectorAll<HTMLElement>(
        'button, a.admin-primary-btn, a.admin-ghost-btn, a.ds-button',
      )).flatMap((control) => {
        const style = getComputedStyle(control);
        const rect = control.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) return [];
        const text = (control.textContent || '').replace(/\s+/g, ' ').trim();
        const horizontalOverflow = rect.left < -1 || rect.right > viewportWidth + 1;
        const clippedText = Boolean(text) && (
          control.scrollWidth > control.clientWidth + 2 || control.scrollHeight > control.clientHeight + 2
        );
        return horizontalOverflow || clippedText
          ? [{ text, left: rect.left, right: rect.right, width: rect.width, clippedText }]
          : [];
      });
    });
    expect(brokenControls, `${route} tiene botones cortados o fuera de pantalla`).toEqual([]);
  });
}
