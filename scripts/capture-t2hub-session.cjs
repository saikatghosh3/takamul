/**
 * Opens t2hub agent login in a VISIBLE browser so the user can log in manually.
 * While the user interacts, this script captures:
 *   - every API response (incl. encrypted {p, iv} payloads)  -> captured/t2hub-session/responses.jsonl
 *   - all loaded JS bundles (for AES key extraction)          -> captured/t2hub-session/js/
 *   - localStorage keys once a token appears                  -> captured/t2hub-session/storage.json
 *   - a live console log                                      -> captured/t2hub-session/log.txt
 *
 * Run: node scripts/capture-t2hub-session.cjs
 * Stop: the browser window stays open; press Ctrl+C in the terminal (or close the browser tab).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const TARGET = 'https://takamol.t2hub.app/';
const OUT_DIR = path.join(__dirname, '..', 'captured', 't2hub-session');
const JS_DIR = path.join(OUT_DIR, 'js');
const TIMEOUT_MS = 30 * 60 * 1000; // 30 min window for the manual login
const POLL_MS = 2000;

fs.mkdirSync(JS_DIR, { recursive: true });

function log(line) {
  const ts = new Date().toISOString();
  const out = `[${ts}] ${line}`;
  console.log(out);
  fs.appendFileSync(path.join(OUT_DIR, 'log.txt'), out + '\n');
}

function looksEncrypted(obj) {
  return obj && typeof obj === 'object' && (obj.p !== undefined || obj.iv !== undefined);
}

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  let respCount = 0;
  let apiCount = 0;

  page.on('response', async (res) => {
    const url = res.url();
    const ct = res.headers()['content-type'] || '';
    try {
      if (ct.includes('javascript')) {
        const name = url.split('/').pop().split('?')[0].slice(0, 120) || `chunk-${Date.now()}.js`;
        const buf = await res.body();
        if (buf.length < 40 * 1024 * 1024) {
          const host = new URL(url).host;
          const safeHost = host.replace(/[^a-z0-9.-]/gi, '_');
          fs.writeFileSync(path.join(JS_DIR, `${respCount}_${safeHost}_${name}`), buf);
          fs.appendFileSync(
            path.join(OUT_DIR, 'js-manifest.jsonl'),
            JSON.stringify({ n: respCount, host, url, name, bytes: buf.length }) + '\n'
          );
          log(`JS ${respCount} host=${host} bytes=${buf.length} ${name}`);
        }
      } else if (ct.includes('json')) {
        const text = await res.text();
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        const line = JSON.stringify({
          t: new Date().toISOString(),
          method: res.request().method(),
          url,
          status: res.status(),
          body: parsed !== null ? parsed : text.substring(0, 2000)
        });
        fs.appendFileSync(path.join(OUT_DIR, 'responses.jsonl'), line + '\n');
        apiCount++;
        if (parsed !== null && looksEncrypted(parsed)) {
          log(`ENCRYPTED ${res.request().method()} ${url} -> status ${res.status()}`);
        } else if (parsed !== null) {
          log(`API ${res.request().method()} ${url.replace('https://takamol.t2hub.app', '').replace('https://t2hub.app', '')} -> ${JSON.stringify(parsed).substring(0, 120)}`);
        }
      }
    } catch (e) {}
    respCount++;
  });

  page.on('console', (msg) => {
    const t = msg.text();
    if (t && t.length < 2000) log(`[console.${msg.type()}] ${t}`);
  });

  log(`Opening ${TARGET} ...`);
  try {
    await page.goto(TARGET, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    log(`goto warning: ${e.message}`);
  }
  log(`Page URL now: ${page.url()}`);
  log('Please log in manually in the browser window. Capturing everything...');

  const start = Date.now();
  let lastDump = 0;
  let lastPageDump = 0;

  while (Date.now() - start < TIMEOUT_MS) {
    await page.waitForTimeout(POLL_MS);
    try {
      if (Date.now() - lastPageDump > 5000) {
        lastPageDump = Date.now();
        const pv = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          text: (document.body?.innerText || '').replace(/\s+/g, ' ').substring(0, 800),
          inputs: [...document.querySelectorAll('input')].map(i => ({ name: i.name, type: i.type, placeholder: i.placeholder })).slice(0, 12)
        })).catch(() => ({}));
        fs.writeFileSync(path.join(OUT_DIR, 'page.txt'), JSON.stringify(pv, null, 2));
      }
      const storage = await page.evaluate(() => {
        const out = {};
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          const v = localStorage.getItem(k);
          out[k] = v && v.length > 4000 ? v.substring(0, 4000) + '...' : v;
        }
        return out;
      });
      fs.writeFileSync(path.join(OUT_DIR, 'storage.json'), JSON.stringify(storage, null, 2));
      const hasToken = Object.entries(storage).some(([k, v]) =>
        /token|auth|session/i.test(k) && typeof v === 'string' && v.length > 20
      );
      if (hasToken && Date.now() - lastDump > 8000) {
        lastDump = Date.now();
        log(`storage keys: ${Object.keys(storage).join(', ')}`);
        log('LOGIN DETECTED (token present in localStorage). Navigate to the center/session page to capture availability data.');
      }
    } catch (e) {}
  }

  log('Capture window finished.');
  await browser.close();
}

main().catch((e) => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
