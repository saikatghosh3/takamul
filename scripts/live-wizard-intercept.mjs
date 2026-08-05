import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TOKEN_FILE = 'D:/pacc-scraper-api_latest/pacc-scraper-api-latest/.svp-token.json';
const OUT_FILE = 'C:/Users/HP/AppData/Local/Temp/opencode/wizard-capture.json';
const SHOT_DIR = 'C:/Users/HP/AppData/Local/Temp/opencode/shots';
const EDGE_PATH = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].find(p => existsSync(p));

const SVP_BASE = 'https://svp-international.pacc.sa';
const RESERVATION_ID = '5037880';

const token = readFileSync(TOKEN_FILE, 'utf-8');
const { token: jwt } = JSON.parse(token);

const capture = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function shot(page, name) {
  try { await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) }); console.log(`[shot] ${name}`); } catch {}
}

async function main() {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1280, height: 800 }
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument((t) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    try {
      for (const k of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'svp_token']) localStorage.setItem(k, t);
    } catch {}
  }, jwt);

  // capture ALL svp api traffic
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      capture.push({
        t: 'req',
        url: u,
        method: req.method(),
        postData: req.postData() || null,
        ts: Date.now()
      });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      let body = null;
      try { body = await res.text(); } catch {}
      capture.push({ t: 'res', url: u, status: res.status(), body, ts: Date.now() });
    }
  });

  const dump = async (label) => {
    const txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`\n===== ${label} (url=${page.url()}) =====`);
    console.log(txt.substring(0, 1800));
    console.log('----- end -----');
    return txt;
  };

  const dumpSelects = async () => page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => ({
    i, id: s.id, name: s.name, disabled: s.disabled,
    opts: [...s.options].map(o => o.text.trim())
  })));

  const dumpButtons = async () => page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
    i, text: (b.textContent || '').trim().substring(0, 60), disabled: b.disabled, visible: b.offsetParent !== null
  })));

  const clickByText = async (texts) => {
    for (const text of texts) {
      const coords = await page.evaluate((t) => {
        const all = [...document.querySelectorAll('button, a, [role="button"], [type="submit"], span, div')];
        for (const el of all) {
          const txt = (el.textContent || '').trim().toLowerCase();
          const own = (el.childElementCount === 0);
          if (own && txt === t.toLowerCase() && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim() };
          }
        }
        return null;
      }, text);
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[click] "${text}" -> ${coords.text} @ (${Math.round(coords.x)},${Math.round(coords.y)})`);
        return { found: true, text: coords.text };
      }
    }
    return { found: false };
  };

  const clickButtonByText = async (texts) => {
    for (const text of texts) {
      const coords = await page.evaluate((t) => {
        const all = [...document.querySelectorAll('button, [role="button"], [type="submit"]')];
        for (const el of all) {
          const txt = (el.textContent || '').trim().toLowerCase();
          if (txt.includes(t.toLowerCase()) && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim() };
          }
        }
        return null;
      }, text);
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[btn-click] "${text}" -> "${coords.text}"`);
        return { found: true, text: coords.text };
      }
    }
    return { found: false };
  };

  const pickSelect = async (idx, candidates) => {
    const info = await page.evaluate((i) => {
      const s = [...document.querySelectorAll('select')][i];
      if (!s) return null;
      return { id: s.id, name: s.name, options: [...s.options].map(o => ({ v: o.value, t: o.text.trim() })) };
    }, idx);
    if (!info) return { found: false, reason: 'no select' };
    for (const c of candidates) {
      const m = info.options.find(o => o.t.toLowerCase().includes(c.toLowerCase()));
      if (m) {
        await page.select(`select${info.id ? '#' + info.id : ''}`, m.v);
        console.log(`[select #${idx}] "${m.t}" value=${m.v}`);
        return { found: true, text: m.t, value: m.v };
      }
    }
    console.log(`[select #${idx}] no match for ${JSON.stringify(candidates)}; options=${JSON.stringify(info.options.map(o => o.t).slice(0, 30))}`);
    return { found: false, options: info.options };
  };

  try {
    const url = `${SVP_BASE}/labor/reschedule/steps?reservationId=${RESERVATION_ID}`;
    console.log(`[nav] ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(6000);

    if (page.url().includes('/auth/')) {
      console.log('[!] redirected to auth');
      await dump('AUTH-REDIRECT');
      await sleep(20000);
      if (page.url().includes('/auth/')) throw new Error('still on auth');
    }

    await dump('START');
    await shot(page, '01-start');

    // ---- STEP 1: city + language ----
    let selects = await dumpSelects();
    console.log('[selects step1]', JSON.stringify(selects));
    for (const s of selects) {
      const opts = s.opts || [];
      const low = opts.map(o => o.toLowerCase()).join(' | ');
      if (/cumilla|comilla|كميلا|كوميلا/.test(low)) {
        await pickSelect(s.i, ['cumilla', 'comilla', 'كميلا', 'كوميلا']);
      } else if (/english|arabic|انجليزي|انجليزيه|العربيه|العربية|bangla|bengali/.test(low)) {
        await pickSelect(s.i, ['english', 'الانجليزي', 'الانجليزية', 'العربية', 'عربي', 'arabic', 'bangla', 'bengali']);
      }
    }
    await sleep(1500);
    let buttons = await dumpButtons();
    console.log('[buttons step1]', JSON.stringify(buttons));
    let r = await clickButtonByText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
    await sleep(6000);
    await dump('AFTER-STEP1');
    await shot(page, '02-after-step1');

    // ---- STEP 2: date (20 August) ----
    selects = await dumpSelects();
    console.log('[selects step2]', JSON.stringify(selects));
    // ensure August is the shown month; click "20"
    const dayClicked = await page.evaluate(() => {
      const all = [...document.querySelectorAll('button, td, span, div, a')];
      for (const el of all) {
        const t = el.textContent.trim();
        if (t === '20' && el.childElementCount === 0 && !el.disabled && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: t };
          }
        }
      }
      return null;
    });
    if (dayClicked) {
      await page.mouse.click(dayClicked.x, dayClicked.y);
      console.log(`[date] clicked "20" @ (${Math.round(dayClicked.x)},${Math.round(dayClicked.y)})`);
    } else {
      console.log('[date] "20" not found - will try month nav later');
    }
    await sleep(7000);
    await dump('AFTER-DATE');
    await shot(page, '03-after-date');

    // ---- STEP 3: session ----
    buttons = await dumpButtons();
    console.log('[buttons session-step]', JSON.stringify(buttons));
    const sessions = await page.evaluate(() => [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"]')].map(el => ({
      text: el.textContent.trim().substring(0, 120)
    })));
    console.log('[session items]', JSON.stringify(sessions));
    if (sessions.length > 0) {
      const coords = await page.evaluate(() => {
        const els = [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"]')];
        if (!els.length) return null;
        const el = els[0];
        const rect = el.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 120) };
      });
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[session] selected: "${coords.text}"`);
      }
    } else {
      console.log('[session] no session items found (auto-selected?)');
    }
    await sleep(3000);
    r = await clickButtonByText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
    console.log('[after session select, clicked]', JSON.stringify(r));
    await sleep(5000);
    await dump('AFTER-SESSION');
    await shot(page, '04-after-session');

    // ---- STEP 4: confirm ----
    buttons = await dumpButtons();
    console.log('[buttons confirm]', JSON.stringify(buttons));
    r = await clickButtonByText(['confirm', 'submit', 'confirm appointment', 'تأكيد', 'تأكيد الحجز', 'yes']);
    console.log('[confirm click]', JSON.stringify(r));
    await sleep(5000);
    await dump('AFTER-CONFIRM-1');
    await shot(page, '05-after-confirm-1');
    r = await clickButtonByText(['confirm', 'yes', 'ok', 'تأكيد', 'نعم']);
    console.log('[second confirm]', JSON.stringify(r));
    await shot(page, '06-after-confirm-2');

    // wait for the reschedule POST to land
    console.log('[waiting for reschedule response...]');
    const started = Date.now();
    const hasRescheduleRes = () => capture.some(c => c.t === 'res' && /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    while (Date.now() - started < 30000 && !hasRescheduleRes()) {
      await sleep(1000);
    }
    await sleep(5000);
    await dump('FINAL');
    await shot(page, '07-final');

    // write capture
    writeFileSync(OUT_FILE, JSON.stringify(capture, null, 2), 'utf-8');
    console.log(`\n[written] ${OUT_FILE} with ${capture.length} events`);
    const resched = capture.filter(c => c.t === 'res' && /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    for (const c of resched) {
      console.log(`\n===== RESCHEDULE RESPONSE ${c.status} =====`);
      console.log((c.body || '').substring(0, 3000));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch(e => { console.error('FATAL', e); process.exit(3); });
