import { chromium } from 'playwright';

const BASE = 'https://t2hub.app';
const PHONE = '01751332322';
const PASSWORD = 'test@1234';

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1360, height: 900 }
});
const page = await ctx.newPage();

const log = [];
page.on('request', req => {
  const u = req.url();
  if (!u.includes('t2hub.app')) return;
  log.push({ type: 'REQ', method: req.method(), url: u, post: req.postData()?.substring(0, 500) });
});
page.on('response', async res => {
  const u = res.url();
  if (!u.includes('t2hub.app')) return;
  let body = '';
  try {
    const ct = res.headers()['content-type'] || '';
    if (ct.includes('json')) {
      const text = await res.text();
      body = text.substring(0, 800);
    }
  } catch {}
  log.push({ type: 'RES', status: res.status(), url: u, body });
});

async function dump(label) {
  console.log(`\n════════ ${label} ════════`);
  for (const entry of log) {
    if (entry.type === 'REQ') {
      console.log(`REQ  ${entry.method} ${entry.url}`);
      if (entry.post) console.log(`     body: ${entry.post}`);
    } else {
      console.log(`RES  ${entry.status} ${entry.url}`);
      if (entry.body) console.log(`     body: ${entry.body.substring(0, 400)}`);
    }
  }
  log.length = 0;
}

try {
  console.log('Navigating to login...');
  await page.goto(`${BASE}/takamol/agent/login`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/opencode/t2hub-login.png' });
  await dump('LOGIN PAGE LOAD');

  const html = await page.content();
  console.log('\nPAGE TITLE:', await page.title());
  const inputs = await page.locator('input').count();
  console.log('INPUT COUNT:', inputs);
  for (let i = 0; i < inputs; i++) {
    const el = page.locator('input').nth(i);
    console.log('  input', i, 'type=', await el.getAttribute('type'), 'name=', await el.getAttribute('name'), 'placeholder=', await el.getAttribute('placeholder'));
  }

  // Try to find phone & password fields
  const phoneInputs = page.locator('input[type="tel"], input[name*="phone" i], input[placeholder*="phone" i], input[placeholder*="mobile" i], input[placeholder*="01"]');
  console.log('PHONE CANDIDATES:', await phoneInputs.count());
  const passInputs = page.locator('input[type="password"]');
  console.log('PASS CANDIDATES:', await passInputs.count());

  // Fill by heuristics
  let filledPhone = false;
  for (const sel of ['input[type="tel"]', 'input[name*="phone" i]', 'input[placeholder*="phone" i]', 'input[placeholder*="mobile" i]']) {
    if (await page.locator(sel).count() > 0) {
      await page.locator(sel).first().fill(PHONE);
      filledPhone = true;
      console.log('FILLED PHONE via', sel);
      break;
    }
  }
  if (!filledPhone) {
    // Try any visible text input
    const visible = page.locator('input:visible');
    for (let i = 0; i < Math.min(await visible.count(), 5); i++) {
      const el = visible.nth(i);
      const type = await el.getAttribute('type');
      if (type && type !== 'password') {
        await el.fill(PHONE);
        console.log('FILLED PHONE via generic input', i);
        break;
      }
    }
  }
  if (await passInputs.count() > 0) {
    await passInputs.first().fill(PASSWORD);
    console.log('FILLED PASSWORD');
  }

  await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/opencode/t2hub-filled.png' });

  // Find and click a submit/login button
  const buttons = page.locator('button:visible');
  console.log('\nBUTTONS:');
  for (let i = 0; i < await buttons.count(); i++) {
    console.log('  btn', i, JSON.stringify(await buttons.nth(i).innerText().catch(() => '')));
  }
  const loginBtn = page.locator('button:visible', { hasText: /log in|sign in|login|submit/i }).first();
  if (await loginBtn.count() > 0) {
    await loginBtn.click();
    console.log('\nCLICKED LOGIN BUTTON');
  } else {
    console.log('NO LOGIN BUTTON FOUND, trying Enter');
    await passInputs.first().press('Enter');
  }

  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/opencode/t2hub-after-login.png' });
  await dump('AFTER LOGIN');

  console.log('\nCURRENT URL:', page.url());
  const bodyText = (await page.locator('body').innerText().catch(() => '')).substring(0, 1500);
  console.log('BODY TEXT:', bodyText);

  // Save storage state for reuse
  const state = await ctx.storageState();
  const fs = await import('fs');
  fs.writeFileSync('C:/Users/HP/AppData/Local/Temp/opencode/t2hub-storage.json', JSON.stringify(state));
  console.log('\nSAVED STORAGE STATE');

  // localStorage
  const ls = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
  console.log('\nLOCALSTORAGE KEYS:', Object.keys(ls));
  for (const [k, v] of Object.entries(ls)) {
    console.log('  ', k, '=', typeof v === 'string' ? v.substring(0, 200) : JSON.stringify(v).substring(0, 200));
  }
} catch (e) {
  console.error('ERROR:', e.message);
  try { await page.screenshot({ path: 'C:/Users/HP/AppData/Local/Temp/opencode/t2hub-error.png' }); } catch {}
  await dump('ERROR STATE');
} finally {
  await browser.close();
}
