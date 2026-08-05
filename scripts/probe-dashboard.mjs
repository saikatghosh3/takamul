import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const storage = JSON.parse(readFileSync(join(process.cwd(), '.svp-storage.json'), 'utf-8'));
  const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ storageState: storage, viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  const page = await context.newPage();
  await page.goto('https://svp-international.pacc.sa/labor/account-dashboard', { waitUntil: 'domcontentloaded', timeout: 60000 });
  for (let i = 0; i < 4; i++) {
    await sleep(4000);
    const probe = await page.evaluate((rid) => {
      const textNodes = [...document.querySelectorAll('body *')].filter((el) => el.childElementCount === 0 && el.textContent.includes(rid));
      const chains = textNodes.slice(0, 4).map((el) => {
        let chain = [];
        let cur = el;
        while (cur && cur !== document.body && chain.length < 10) {
          chain.unshift(`${cur.tagName.toLowerCase()}.${(cur.className || '').toString().trim().replace(/\s+/g, '.') || '#' + cur.id}`);
          cur = cur.parentElement;
        }
        return chain.join(' < ');
      });
      const bodyText = (document.body?.innerText || '').substring(0, 400);
      const has = (document.body?.innerText || '').includes(rid);
      const links = [...document.querySelectorAll('a')].map((a) => ({ text: (a.textContent || '').trim().substring(0, 40), href: a.getAttribute('href'), cls: (a.className || '').toString().substring(0, 40) })).filter((a) => a.text).slice(0, 25);
      const btns = [...document.querySelectorAll('button')].map((b) => ({ text: (b.textContent || '').trim().substring(0, 40), cls: (b.className || '').toString().substring(0, 40) })).filter((b) => b.text).slice(0, 25);
      return { url: location.href, bodyText, hasRid: has, chains, links, btns, appLen: document.querySelector('#app')?.innerHTML.length || 0 };
    }, '5037880');
    console.log('=== probe', i, '===');
    console.log(JSON.stringify(probe, null, 2));
    if (probe.hasRid) break;
  }
  await browser.close();
}
main().catch((e) => { console.error('FATAL', e); process.exit(3); });
