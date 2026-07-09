import { chromium } from 'playwright';

const url = 'file:///C:/Users/diego/AppData/Local/Temp/claude/C--Users-diego-Desktop-proyecto-tienda/1fba2fd1-6dee-48ca-b4c1-0f1cadeb13b6/scratchpad/mock.html';
const out = 'C:/Users/diego/AppData/Local/Temp/claude/C--Users-diego-Desktop-proyecto-tienda/1fba2fd1-6dee-48ca-b4c1-0f1cadeb13b6/scratchpad/mock.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 900 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle' });

// Medir geometrias: card1 (tr) vs sus botones y card2
const data = await page.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('tbody tr'));
  const r0 = rows[0].getBoundingClientRect();
  const r1 = rows[1].getBoundingClientRect();
  const btns = rows[0].querySelector('.inventory-quick-move-btns-next');
  const b = btns.getBoundingClientRect();
  const qm = rows[0].querySelector('.inventory-quick-move-next').getBoundingClientRect();
  const cs = getComputedStyle(rows[0]);
  return {
    row0: { top: r0.top, bottom: r0.bottom, height: r0.height },
    row1_top: r1.top,
    gap_between: r1.top - r0.bottom,
    btns: { top: b.top, bottom: b.bottom },
    btns_overflow_below_card: b.bottom - r0.bottom,
    quickmove_bottom: qm.bottom,
    row0_marginBottom: cs.marginBottom,
    row0_display: cs.display,
    row0_overflow: cs.overflow,
  };
});
console.log(JSON.stringify(data, null, 2));

await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('shot:', out);
