const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SVP_BASE = 'https://svp-international.pacc.sa';
const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const RESERVATION_ID = process.argv[2] || '4964415';

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 900 }
  });

  await context.addInitScript((t) => {
    try {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('token', t);
      localStorage.setItem('access_token', t);
      localStorage.setItem('vue-auth.token', t);
      localStorage.setItem('svp_token', t);
    } catch {}
  }, token);

  const page = await context.newPage();
  const api = [];
  page.on('response', async (r) => {
    const url = r.url();
    if (url.includes('svp-international-api')) {
      let body = '';
      try { body = (await r.text()).substring(0, 400); } catch {}
      api.push({ m: r.request().method(), s: r.status(), u: url.replace(API_BASE, ''), b: body });
      console.log(`[API] ${r.request().method()} ${r.status()} ${url.replace(API_BASE, '')}`);
    }
  });
  page.on('request', (req) => {
    if (req.url().includes('svp-international-api') && req.method() !== 'GET') {
      console.log(`[REQ] ${req.method()} ${req.url().replace(API_BASE, '')} BODY=${req.postData()}`);
    }
  });

  const url = `${SVP_BASE}/labor/reschedule/steps?reservationId=${RESERVATION_ID}`;
  console.log('GOTO', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(9000);
  console.log('FINAL URL:', page.url());

  const info = await page.evaluate(() => ({
    text: (document.body?.innerText || '').replace(/\s+/g, ' ').substring(0, 1400),
    selects: [...document.querySelectorAll('select')].map((s, i) => ({
      i, id: s.id, name: s.name, disabled: s.disabled,
      opts: [...s.options].map(o => o.text.trim()).slice(0, 30)
    })),
    buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map((b, i) => ({ i, text: b.textContent.trim().substring(0, 50), disabled: b.disabled })),
    sessionBlocks: [...document.querySelectorAll('[class*="session"],[class*="Session"]')].map(x => (x.textContent || '').trim().substring(0, 120)).slice(0, 20)
  })).catch(() => ({}));

  console.log('\n===== TEXT =====\n', info.text);
  console.log('\n===== SELECTS =====\n', JSON.stringify(info.selects, null, 1));
  console.log('\n===== BUTTONS =====\n', JSON.stringify(info.buttons, null, 1));
  console.log('\n===== SESSION BLOCKS =====\n', JSON.stringify(info.sessionBlocks, null, 1));
  console.log('\n===== API CALLS =====\n', JSON.stringify(api, null, 1));

  fs.writeFileSync(path.join(__dirname, 'probe-wizard.json'), JSON.stringify({ url: page.url(), info, api }, null, 1));
  await browser.close();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
