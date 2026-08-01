/**
 * CAPTURE the EXACT reschedule request body the SVP frontend sends.
 * SAFE: the final POST to exam_reservations/{id}/reschedule is ABORTED
 * (never reaches the server), so nothing is actually changed.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SVP_BASE = 'https://svp-international.pacc.sa';
const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const RESERVATION_ID = process.argv[2] || '4878771';
const TARGET_DATE = process.argv[3] || '2026-08-20';

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
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
  const requests = [];
  const rescheduleBodies = [];

  page.on('request', (req) => {
    if (req.url().includes('svp-international-api') && req.method() !== 'GET') {
      requests.push({ url: req.url().replace(API_BASE, ''), method: req.method(), body: req.postData() });
      if (req.url().includes('reschedule')) {
        rescheduleBodies.push({ url: req.url().replace(API_BASE, ''), body: req.postData() });
        console.log(`\n[CAPTURED RESCHEDULE BODY] ${req.method()} ${req.url().replace(API_BASE, '')}`);
        console.log(JSON.stringify(req.postData()));
      }
    }
  });

  // ABORT any actual reschedule so nothing is changed
  await page.route('**/exam_reservations/*/reschedule', async (route) => {
    const body = route.request().postData();
    console.log(`\n[ABORTED RESCHEDULE POST]\n${body}`);
    await route.abort();
  });

  // Log all GET calls related to sessions/dates too
  page.on('request', (req) => {
    if (req.url().includes('svp-international-api') && req.method() === 'GET' &&
        (req.url().includes('exam_sessions') || req.url().includes('test_center') || req.url().includes('cities'))) {
      console.log(`[API GET] ${req.url().replace(API_BASE, '')}`);
    }
  });

  console.log(`Navigating to reschedule wizard for reservation ${RESERVATION_ID}...`);
  await page.goto(`${SVP_BASE}/labor/reschedule/steps?reservationId=${RESERVATION_ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(6000);
  console.log('URL now:', page.url());

  if (page.url().includes('/auth/')) {
    console.log('Redirected to auth — trying reload with token...');
    await page.goto(`${SVP_BASE}/labor/reschedule/steps?reservationId=${RESERVATION_ID}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(6000);
    console.log('URL now:', page.url());
  }

  const dump = async (label) => {
    const info = await page.evaluate(() => ({
      url: location.href,
      text: (document.body?.innerText || '').substring(0, 1200),
      selects: [...document.querySelectorAll('select')].map((s, i) => ({
        i, id: s.id, name: s.name, opts: [...s.options].map(o => o.text.trim()).slice(0, 25)
      })),
      buttons: [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map((b, i) => ({ i, text: b.textContent.trim().substring(0, 40), disabled: b.disabled }))
    })).catch(() => ({}));
    console.log(`\n===== ${label} =====`);
    console.log('URL:', info.url);
    console.log('TEXT:', (info.text || '').replace(/\s+/g, ' ').substring(0, 600));
    console.log('SELECTS:', JSON.stringify(info.selects, null, 2));
    console.log('BUTTONS:', JSON.stringify(info.buttons));
  };

  await dump('WIZARD INITIAL');

  // Helper to click by text
  const clickText = async (texts) => {
    for (const t of texts) {
      const clicked = await page.evaluate((tt) => {
        const els = [...document.querySelectorAll('button, a, [role="button"], label')];
        for (const el of els) {
          const txt = (el.textContent || '').trim();
          if (txt.toLowerCase().includes(tt.toLowerCase()) && !el.disabled && el.offsetParent !== null) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) { el.click(); return true; }
          }
        }
        return false;
      }, t);
      if (clicked) { console.log(`CLICKED "${t}"`); return true; }
    }
    return false;
  };

  // STEP: pick city if present
  const cityPick = await page.evaluate(() => {
    const sel = [...document.querySelectorAll('select')].find(s => s.offsetParent !== null);
    if (!sel) return 'no-select';
    const opts = [...sel.options];
    const target = opts.find(o => o.text.trim().toLowerCase().includes('cumilla'));
    if (target) { sel.value = target.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return 'cumilla'; }
    return 'no-match';
  });
  console.log('City pick:', cityPick);
  await page.waitForTimeout(2500);

  const secondSel = await page.evaluate(() => {
    const sels = [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null);
    if (sels.length >= 2) {
      const sel = sels[1];
      const opts = [...sel.options];
      const target = opts.find(o => o.text.trim().toLowerCase().includes('english'));
      if (target) { sel.value = target.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return sel.name + ' -> ' + target.text.trim(); }
    }
    return 'no-lang-select';
  });
  console.log('Lang pick:', secondSel);
  await page.waitForTimeout(1500);

  await clickText(['next', 'continue', 'proceed', 'Next']);
  await page.waitForTimeout(3500);
  await dump('AFTER NEXT 1');

  // pick date
  const datePicked = await page.evaluate((dv) => {
    const day = String(parseInt(dv.split('-')[2], 10));
    const els = [...document.querySelectorAll('button, td, div, span')];
    for (const el of els) {
      const txt = (el.textContent || '').trim();
      if (txt === day && el.offsetParent !== null && !el.disabled) {
        el.click();
        return true;
      }
    }
    return false;
  }, TARGET_DATE);
  console.log('Date picked:', datePicked);
  await page.waitForTimeout(2500);

  await clickText(['next', 'continue', 'proceed', 'Next']);
  await page.waitForTimeout(3500);
  await dump('AFTER NEXT 2');

  await clickText(['confirm', 'submit', 'yes', 'reschedule']);
  await page.waitForTimeout(3000);

  console.log('\n===== FINAL CAPTURED RESCHEDULE BODIES =====');
  console.log(JSON.stringify(rescheduleBodies, null, 2));
  console.log('\n===== ALL NON-GET REQUESTS =====');
  console.log(JSON.stringify(requests, null, 2));

  fs.writeFileSync(path.join(__dirname, '..', 'captured-reschedule.json'), JSON.stringify({ requests, rescheduleBodies }, null, 2));
  await browser.close();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });


