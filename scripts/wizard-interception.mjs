import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const STORAGE_FILE = join(process.cwd(), '.svp-storage.json');
const CAPTURE_FILE = join(process.cwd(), 'debug-wizard-capture.json');
const RESERVATION_ID = '5037880';
const TARGET_CITY = 'Cumilla';
const TARGET_DATE = '2026-08-20';
const SHOT_DIR = join(process.cwd(), 'debug-shots');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  try { await page.screenshot({ path: join(SHOT_DIR, `${name}.png`) }); console.log(`[shot] ${name}`); } catch {}
}

const capture = [];
const log = [];

async function main() {
  const storage = JSON.parse(readFileSync(STORAGE_FILE, 'utf-8'));
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
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
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      capture.push({ t: 'req', method: req.method(), url: u, postData: req.postData() || null, ts: Date.now() });
    }
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      let body = null;
      try { body = await res.text(); } catch {}
      capture.push({ t: 'res', status: res.status(), url: u, body, ts: Date.now() });
    }
  });

  const dump = async (label) => {
    const txt = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    log.push({ step: label, url: page.url(), text: txt });
    return txt;
  };
  const dumpSelects = () =>
    page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => ({
      i, id: s.id, name: s.name, disabled: s.disabled,
      opts: [...s.options].map((o) => o.text.trim())
    })));
  const dumpButtons = () =>
    page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
      i, text: (b.textContent || '').trim().substring(0, 60), disabled: b.disabled, visible: b.offsetParent !== null
    })));

  const clickText = async (texts, tag = 'button, [role="button"], [type="submit"], a, [class*="select"]') => {
    for (const text of texts) {
      const coords = await page.evaluate(({ t, sel }) => {
        const all = [...document.querySelectorAll(sel)];
        for (const el of all) {
          const txt = (el.textContent || '').trim().toLowerCase();
          if (txt.includes(t.toLowerCase()) && !el.disabled && el.offsetParent !== null && el.getAttribute('aria-disabled') !== 'true') {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 80) };
            }
          }
        }
        return null;
      }, { t: text, sel: tag });
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[click] "${text}" -> "${coords.text}"`);
        log.push({ click: text, matched: coords.text });
        return { found: true, text: coords.text };
      }
    }
    log.push({ clickFailed: texts });
    return { found: false };
  };

  const clickVisibleText = async (texts) => {
    for (const text of texts) {
      const coords = await page.evaluate((t) => {
        const all = [...document.querySelectorAll('div, span, label, li, td, button')];
        let best = null;
        for (const el of all) {
          const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
          const txt = (el.textContent || '').trim().toLowerCase();
          if (own && own.toLowerCase() === t.toLowerCase() && txt === t.toLowerCase()) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && el.offsetParent !== null) {
              el.scrollIntoView({ block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 80) };
            }
          }
        }
        return null;
      }, text);
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[click-visible] "${text}" -> "${coords.text}"`);
        log.push({ clickVisible: text, matched: coords.text });
        return { found: true, text: coords.text };
      }
    }
    return { found: false };
  };

  const pickSelect = async (idx, candidates) => {
    const info = await page.evaluate((i) => {
      const s = [...document.querySelectorAll('select')][i];
      if (!s) return null;
      return { id: s.id, name: s.name, options: [...s.options].map((o) => ({ v: o.value, t: o.text.trim() })) };
    }, idx);
    if (!info) return { found: false };
    for (const c of candidates) {
      const m = info.options.find((o) => o.t.toLowerCase().includes(c.toLowerCase()));
      if (m) {
        await page.select(`select${info.id ? '#' + info.id : ''}`, m.v);
        console.log(`[select#${idx}] "${m.t}" value=${m.v}`);
        log.push({ select: idx, picked: m.t, value: m.v });
        return { found: true, text: m.t, value: m.v };
      }
    }
    log.push({ select: idx, noMatchFor: candidates, options: info.options.map((o) => o.t) });
    return { found: false };
  };

  const dumpStore = () =>
    page.evaluate(() => {
      const app = document.querySelector('#app');
      const v = app && app.__vue__;
      const st = v && v.$store && v.$store.state;
      const g = v && v.$store && v.$store.getters;
      const pick = (o) => (o && typeof o === 'object' ? JSON.stringify(o).substring(0, 400) : String(o));
      return {
        isTargeted: st?.user?.isTargeted,
        isLoadBalancer: st?.user?.isLoadBalancer,
        isLabor: st?.user?.isLabor,
        userKeys: st?.user ? Object.keys(st.user) : null,
        featureFlags: st?.featureFlags ? Object.keys(st.featureFlags) : null,
        flagsRaw: st?.featureFlags,
        getters: g ? Object.keys(g).slice(0, 60) : null
      };
    }).catch((e) => ({ err: String(e) }));

  const storeLog = [];
  try {
    const dashUrl = 'https://svp-international.pacc.sa/labor/account-dashboard';
    console.log(`[nav] ${dashUrl}`);
    await page.goto(dashUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await sleep(10000);
    await dump('DASHBOARD');
    await shot(page, '01-dashboard');
    const st = await dumpStore();
    storeLog.push({ afterDashboard: st });
    console.log('[store]', JSON.stringify(st));

    const resDetails = await page.evaluate((rid) => {
      const all = [...document.querySelectorAll('a, button, [role="button"]')];
      for (const el of all) {
        const card = el.closest('.booking-item, [class*="booking-item"]');
        if (card && card.textContent.includes(rid) && (el.textContent || '').trim().toLowerCase().includes('view details')) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.scrollIntoView({ block: 'center' });
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 60) };
          }
        }
      }
      return null;
    }, RESERVATION_ID);
    if (resDetails) {
      await page.mouse.click(resDetails.x, resDetails.y);
      console.log(`[click] View details for ${RESERVATION_ID}`);
      log.push({ clickedViewDetails: true });
      await sleep(8000);
      await dump('BOOKING-DETAILS');
      await shot(page, '02-booking-details');
    } else {
      log.push({ clickedViewDetails: false, note: 'no view-details link found for reservation' });
    }

    const resch = await clickText(['reschedule appointment', 'reschedule', 'edit appointment', 'change appointment', 'modify appointment', 're-schedule', 'إعادة جدولة', 'rebooking']);
    if (!resch.found) {
      log.push({ rescheduleButtonMissing: true, buttons: await dumpButtons() });
      await dump('NO-RESCHEDULE-BTN');
    }
    await sleep(8000);
    await dump('WIZARD-STEP1');
    await shot(page, '03-wizard-step1');

    // STEP 1: city + language
    const selects = await dumpSelects();
    log.push({ selectsStep1: selects });
    const buttons1 = await dumpButtons();
    log.push({ buttonsStep1: buttons1 });

    const cityRe = /cumilla|comilla|كميلا|كوميلا/i;
    const langRe = /english|انجليزي|انجليزيه|الانجليزية|الانجليزيه|arabic|العربية|العربيه|bangla|bengali|bengali/i;
    for (const s of selects) {
      const low = (s.opts || []).map((o) => o.toLowerCase()).join(' | ');
      if (cityRe.test(low)) await pickSelect(s.i, [TARGET_CITY, 'cumilla', 'comilla', 'كميلا', 'كوميلا']);
      else if (langRe.test(low)) await pickSelect(s.i, ['english', 'الانجليزية', 'الانجليزي', 'العربية', 'عربي', 'bangla', 'bengali']);
    }
    if (!selects.some((s) => cityRe.test((s.opts || []).map((o) => o.toLowerCase()).join(' | ')))) {
      await clickVisibleText([TARGET_CITY, 'Cumilla', 'كميلا', 'كوميلا']);
    }
    await clickVisibleText(['English', 'EN', 'الانجليزية', 'انجليزي']);
    await sleep(3000);
    const selectsAfter = await dumpSelects();
    log.push({ selectsAfterCity: selectsAfter });
    await dump('STEP1-AFTER-PICK');
    await shot(page, '04-step1-picked');

    await clickText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
    await sleep(8000);
    await dump('WIZARD-STEP2');
    await shot(page, '05-wizard-step2');

    // STEP 2: date + session
    const buttons2 = await dumpButtons();
    log.push({ buttonsStep2: buttons2 });
    const [, , dy] = TARGET_DATE.split('-');
    const day = parseInt(dy, 10);
    const dayClicked = await page.evaluate((d) => {
      const all = [...document.querySelectorAll('button, td, span, div, a')];
      for (const el of all) {
        const t = el.textContent.trim();
        if (t === String(d) && el.childElementCount === 0 && !el.disabled && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: t };
          }
        }
      }
      return null;
    }, day);
    if (dayClicked) {
      await page.mouse.click(dayClicked.x, dayClicked.y);
      console.log(`[date] clicked "20"`);
      log.push({ dateClicked: dayClicked });
    } else {
      log.push({ dateClicked: null, note: 'day 20 not found' });
    }
    await sleep(10000);
    await dump('AFTER-DATE');
    await shot(page, '06-after-date');

    const sessionItems = await page.evaluate(() =>
      [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"], [class*="session-card"], [class*="SessionCard"]')].map((el) => ({
        text: el.textContent.trim().substring(0, 200)
      }))
    );
    log.push({ sessionItems });
    if (sessionItems.length > 0) {
      const pick = sessionItems.find((s) => /10:30|10:30|10 30/i.test(s.text)) || sessionItems[0];
      const coords = await page.evaluate((target) => {
        const els = [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"], [class*="session-card"], [class*="SessionCard"]')];
        const el = els.find((e) => e.textContent.trim() === target.text) || els[0];
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        el.scrollIntoView({ block: 'center' });
        return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 200) };
      }, pick);
      if (coords) {
        await page.mouse.click(coords.x, coords.y);
        console.log(`[session] "${coords.text}"`);
        log.push({ sessionSelected: coords });
      }
      await sleep(3000);
    } else {
      log.push({ sessionSelected: null, note: 'no session items; maybe load-balancer date-only step' });
    }
    await dump('AFTER-SESSION');
    await shot(page, '07-after-session');

    await clickText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
    await sleep(8000);
    await dump('WIZARD-STEP3-SUMMARY');
    await shot(page, '08-step3-summary');

    const holdsBefore = capture.filter((c) => /temporary_seats/.test(c.url));
    log.push({ holdEventsBeforeConfirm: holdsBefore.map((c) => `${c.method || ''} ${c.url}`) });

    await clickText(['confirm appointment', 'confirm', 'submit', 'تأكيد الحجز', 'تأكيد']);
    await sleep(6000);
    await dump('AFTER-CONFIRM-1');
    await shot(page, '09-confirm1');
    await clickText(['confirm', 'yes', 'ok', 'نعم', 'تأكيد']);
    await sleep(6000);
    await dump('AFTER-CONFIRM-2');
    await shot(page, '10-confirm2');

    const started = Date.now();
    const hasResched = () => capture.some((c) => c.t === 'res' && /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    while (Date.now() - started < 45000 && !hasResched()) await sleep(1500);
    await sleep(5000);
    await dump('FINAL');
    await shot(page, '11-final');

    writeFileSync(CAPTURE_FILE, JSON.stringify(capture, null, 2), 'utf-8');
    writeFileSync(join(process.cwd(), 'debug-wizard-log.json'), JSON.stringify({ storeLog, log }, null, 2), 'utf-8');
    console.log(`[written] ${CAPTURE_FILE} (${capture.length} events)`);

    const resched = capture.filter((c) => /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    for (const c of resched) {
      console.log(`\n===== RESCHEDULE ${c.t.toUpperCase()} =====`);
      console.log(`${c.method || ''} ${c.url}`);
      console.log((c.postData || c.body || '').substring(0, 3000));
    }
    const holds = capture.filter((c) => /temporary_seats/.test(c.url));
    console.log(`\n[hold events] ${holds.length}`);
    for (const c of holds) {
      console.log(`--- ${c.method || ''} ${c.url}`);
      console.log((c.postData || c.body || '').substring(0, 1500));
    }
    const sessions = capture.filter((c) => c.t === 'res' && /\/exam_sessions/.test(c.url) && !/available_dates/.test(c.url));
    console.log(`\n[session events] ${sessions.length}`);
    for (const c of sessions) {
      console.log(`--- ${c.url}`);
      console.log((c.body || '').substring(0, 1500));
    }
    const det = capture.filter((c) => c.t === 'res' && /\/exam_reservations\//.test(c.url));
    console.log(`\n[reservation events] ${det.length}`);
    for (const c of det) {
      console.log(`--- ${c.url}`);
      console.log((c.body || '').substring(0, 1500));
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

main().catch((e) => { console.error('FATAL', e); process.exit(3); });
