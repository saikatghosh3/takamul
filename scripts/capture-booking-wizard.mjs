import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const SVP_BASE = 'https://svp-international.pacc.sa';
const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const storage = JSON.parse(readFileSync('.svp-storage.json', 'utf-8'));
const capture = [];
const jsUrls = [];

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: storage,
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    try { delete navigator.__proto__.webdriver; } catch {}
  });
  const page = await context.newPage();

  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('svp-international')) {
      if (/\/js\/.+\.js(\?|$)/.test(u)) jsUrls.push(u);
      if (u.includes(API_BASE) && u.includes('/api/v1/')) {
        capture.push({ t: 'req', method: req.method(), url: u.replace(API_BASE, ''), postData: req.postData() || null, ts: Date.now() });
      }
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes(API_BASE) && u.includes('/api/v1/')) {
      let body = null;
      try { body = await res.text(); } catch {}
      capture.push({ t: 'res', status: res.status(), url: u.replace(API_BASE, ''), body, ts: Date.now() });
    }
  });

  const dump = async (label) => {
    const txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`\n===== ${label} (url=${page.url()}) =====`);
    console.log(txt.replace(/\s+/g, ' ').substring(0, 700));
  };
  const dumpSelects = () =>
    page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => ({
      i, id: s.id, name: s.name, disabled: s.disabled,
      opts: [...s.options].map((o) => o.text.trim())
    })));
  const clickByText = async (texts, tag = 'button, [role="button"], [type="submit"], a') => {
    for (const text of texts) {
      const coords = await page.evaluate(({ t, sel }) => {
        const all = [...document.querySelectorAll(sel)];
        for (const el of all) {
          const txt = (el.textContent || '').trim().toLowerCase();
          if (txt.includes(t.toLowerCase()) && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 60) };
            }
          }
        }
        return null;
      }, { t: text, sel: tag });
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[click] "${text}" -> "${coords.text}"`);
        return { found: true, text: coords.text };
      }
    }
    return { found: false };
  };

  const pickOption = async (idx, re) => {
    await page.evaluate(({ i, pattern }) => {
      const sel = [...document.querySelectorAll('select')][i];
      if (!sel) return;
      const o = [...sel.options].find((x) => pattern.test(x.text));
      if (o) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    }, { i: idx, pattern: re });
    console.log('[pick] select', idx, re);
  };

  try {
    const url = `${SVP_BASE}/labor/booking/steps`;
    console.log('[nav]', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(12000);
    await dump('BOOKING-WIZARD');

    let selects = await dumpSelects();
    console.log('[selects]', JSON.stringify(selects));

    // Occupation/category select (Load and Unload Worker)
    for (const s of selects) {
      const low = (s.opts || []).map((o) => o.toLowerCase()).join(' | ');
      if (/load and unload|unload workers|worker/.test(low)) {
        await pickOption(s.i, /load and unload/i);
      }
    }
    await sleep(4000);
    selects = await dumpSelects();
    console.log('[selects after occ]', JSON.stringify(selects));

    // City + language selects
    for (const s of selects) {
      const low = (s.opts || []).map((o) => o.toLowerCase()).join(' | ');
      if (/khulna/.test(low)) {
        await pickOption(s.i, /khulna/i);
      } else if (/english|arabic|bengali|bangla/.test(low)) {
        await pickOption(s.i, /english/i);
      }
    }
    await sleep(8000);
    await dump('STEP1-PICKED');
    await clickByText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
    await sleep(12000);
    await dump('STEP2-DATE');

    const out = {
      jsUrls: [...new Set(jsUrls)],
      capture
    };
    writeFileSync('debug-booking-wizard.json', JSON.stringify(out, null, 2), 'utf-8');
    console.log(`[written] debug-booking-wizard.json jsUrls=${jsUrls.length} capture=${capture.length}`);

    for (const c of capture) {
      if (/sites_availabilities|slots_availabilities|proctor_slots|exam_sessions|available_dates|temporary_seats/.test(c.url)) {
        console.log(`\n--- ${c.t} ${c.method || ''} ${c.url}`);
        console.log((c.postData || c.body || '').substring(0, 800));
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(3); });
