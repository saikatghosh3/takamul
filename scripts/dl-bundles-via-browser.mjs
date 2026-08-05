import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const files = [
  'https://svp-international.pacc.sa/js/6533.0a3f422e.js',
  'https://svp-international.pacc.sa/js/1869.6f6a1a11.js',
];

const storage = JSON.parse(readFileSync('.svp-storage.json', 'utf-8'));
const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({ storageState: storage, viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
try {
  for (const url of files) {
    const name = url.split('/').pop();
    try {
      const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const txt = await page.evaluate(() => document.documentElement.outerHTML || document.body?.innerText || '');
      writeFileSync(`.svp-bundles/${name}`, txt);
      console.log(`saved ${name} ${txt.length} bytes (HTTP ${resp.status()})`);
    } catch (e) { console.log(`FAIL ${name}: ${e.message}`); }
  }
} finally {
  await browser.close().catch(() => {});
}
