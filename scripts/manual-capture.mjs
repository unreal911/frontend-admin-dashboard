// Captura de pantallas para el manual de usuario.
// Uso: node scripts/manual-capture.mjs
// Requiere: admin (3001) y backend (3000) corriendo. Lee credenciales de ../backend-refactorizado/.env
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.resolve(ROOT, 'manual-usuario', 'img');
fs.mkdirSync(OUT, { recursive: true });

const ADMIN = process.env.ADMIN_BASE || 'http://127.0.0.1:3001';

function readEnv(file, key) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    const m = txt.match(new RegExp('^' + key + '=(.*)$', 'm'));
    return m ? m[1].trim().replace(/^"|"$/g, '') : '';
  } catch { return ''; }
}
const beEnv = path.resolve(ROOT, 'backend-refactorizado', '.env');
const EMAIL = process.env.SEED_ADMIN_EMAIL || readEnv(beEnv, 'SEED_ADMIN_EMAIL');
const PASSWORD = process.env.SEED_ADMIN_PASSWORD || readEnv(beEnv, 'SEED_ADMIN_PASSWORD');

// order ids reales (ajustables)
const ORDER_DELIVERED = process.env.ORDER_DELIVERED || '998';
const ORDER_CANCELLED = process.env.ORDER_CANCELLED || '1000';
const PRODUCT_ID = process.env.PRODUCT_ID || '8';

// Lista de pantallas. zoom = selectores a recortar (opcional).
const SCREENS = [
  { slug: 'login', url: '/login', full: true, noauth: true, zoom: ['form.auth-form-next'] },
  { slug: 'dashboard', url: '/admin/dashboard', zoom: ['.dashboard-sla-text-next'] },
  { slug: 'orders-list', url: '/admin/orders/list' },
  { slug: 'order-detail-delivered', url: `/admin/orders/${ORDER_DELIVERED}` },
  { slug: 'order-detail-cancelled', url: `/admin/orders/${ORDER_CANCELLED}` },
  { slug: 'picking-board', url: '/admin/orders/picking' },
  { slug: 'pos', url: '/admin/orders/pos' },
  { slug: 'product-list', url: '/admin/product' },
  { slug: 'product-create', url: '/admin/product/create' },
  { slug: 'product-detail', url: `/admin/product/${PRODUCT_ID}` },
  { slug: 'product-edit', url: `/admin/product/${PRODUCT_ID}/edit` },
  { slug: 'inventory', url: '/admin/inventory' },
  { slug: 'inventory-movements', url: '/admin/inventory/movements' },
  { slug: 'inventory-traceability', url: '/admin/inventory/traceability' },
  { slug: 'transfers', url: '/admin/transfers' },
  { slug: 'category', url: '/admin/category' },
  { slug: 'color', url: '/admin/color' },
  { slug: 'size', url: '/admin/size' },
  { slug: 'payment-methods', url: '/admin/payment-methods' },
  { slug: 'stores', url: '/admin/stores' },
  { slug: 'sunat', url: '/admin/sunat' },
  { slug: 'sunat-config', url: '/admin/sunat/configuracion' },
  { slug: 'sunat-comprobantes', url: '/admin/sunat/comprobantes' },
  // Administracion
  { slug: 'users', url: '/admin/users' },
  { slug: 'roles', url: '/admin/roles' },
  { slug: 'audit-logs', url: '/admin/audit-logs' },
  { slug: 'user-activities', url: '/admin/user-activities' },
  { slug: 'settings', url: '/admin/settings' },
];

async function login(page) {
  await page.goto(`${ADMIN}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').click();
  await page.locator('input[type="email"]').pressSequentially(EMAIL, { delay: 8 });
  await page.locator('input[type="password"]').click();
  await page.locator('input[type="password"]').pressSequentially(PASSWORD, { delay: 8 });
  await Promise.all([
    page.waitForURL(/\/admin\//, { timeout: 30000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForTimeout(2000);
  if (/\/login/.test(page.url())) throw new Error('Login fallo: sigue en /login');
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  // ocultar scrollbars para captura limpia
  await page.addStyleTag({ content: '*{scrollbar-width:none!important} ::-webkit-scrollbar{display:none!important}' }).catch(() => {});
}

const pad = (n) => String(n).padStart(2, '0');

(async () => {
  if (!EMAIL || !PASSWORD) { console.error('Sin credenciales admin en .env'); process.exit(1); }
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  console.log('Login...');
  await login(page);

  let i = 0;
  for (const s of SCREENS) {
    i++;
    const base = `${pad(i)}-${s.slug}`;
    try {
      await page.goto(`${ADMIN}${s.url}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await settle(page);
      await page.screenshot({ path: path.join(OUT, `${base}.png`), fullPage: true });
      console.log(`OK  ${base}.png`);
      // zoom recortes
      if (s.zoom) {
        let z = 0;
        for (const sel of s.zoom) {
          z++;
          const el = page.locator(sel).first();
          if (await el.count()) {
            await el.screenshot({ path: path.join(OUT, `${base}-zoom${z}.png`) }).catch((e) => console.log(`  zoom fail ${sel}: ${e.message}`));
            console.log(`    zoom ${base}-zoom${z}.png (${sel})`);
          }
        }
      }
    } catch (e) {
      console.log(`ERR ${base}: ${e.message}`);
    }
  }

  await browser.close();
  console.log('\nListo. Imagenes en', OUT);
})();
