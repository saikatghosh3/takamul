import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1360, height: 900 }
});
const page = await ctx.newPage();

const hosts = ['https://takamol.t2hub.app', 'https://t2hub.app'];
const paths = ['/', '/login', '/agent/login', '/agent', '/dashboard', '/admin/login', '/api', '/api/login', '/sanctum/csrf-cookie', '/takamol', '/app', '/auth/login', '/home'];

for (const host of hosts) {
  for (const path of paths) {
    try {
      const res = await page.goto(host + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const status = res ? res.status() : 'none';
      const url = page.url();
      let sig = (await page.locator('body').innerText().catch(() => '')).trim().replace(/\s+/g, ' ').substring(0, 120);
      console.log(`${host}${path} -> ${status} url=${url} | ${sig}`);
    } catch (e) {
      console.log(`${host}${path} -> ERR ${e.message.substring(0, 60)}`);
    }
  }
}

await browser.close();
