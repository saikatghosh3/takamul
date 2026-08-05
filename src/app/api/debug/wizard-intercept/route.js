import { NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getAuthPage, isAuthPageAlive } from '@/lib/svp-auth';

export const dynamic = 'force-dynamic';

const SVP_BASE = 'https://svp-international.pacc.sa';
const CAPTURE_FILE = join(process.cwd(), 'debug-wizard-capture.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function POST(request) {
  let body = {};
  try { body = await request.json(); } catch {}

  const reservationId = String(body.reservationId || '');
  const targetCity = String(body.city || 'Cumilla');
  const targetDate = String(body.date || '2026-08-20');
  const maxDepth = Number(body.maxDepth ?? 99);

  if (!reservationId) {
    return NextResponse.json({ success: false, error: 'reservationId required' }, { status: 400 });
  }

  const alive = await isAuthPageAlive();
  const page = alive ? getAuthPage() : null;
  if (!page) {
    return NextResponse.json({ success: false, error: 'No authenticated SPA page. Run POST /api/auth/login first.' }, { status: 400 });
  }

  const capture = [];
  const onRequest = (req) => {
    const u = req.url();
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      capture.push({ t: 'req', method: req.method(), url: u, postData: req.postData() || null, ts: Date.now() });
    }
  };
  const onResponse = async (res) => {
    const u = res.url();
    if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
      let bodyText = null;
      try { bodyText = await res.text(); } catch {}
      capture.push({ t: 'res', status: res.status(), url: u, body: bodyText, ts: Date.now() });
    }
  };
  page.on('request', onRequest);
  page.on('response', onResponse);

  const log = [];
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
        log.push({ click: text, matched: coords.text });
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
    if (!info) return { found: false, reason: 'no select' };
    for (const c of candidates) {
      const m = info.options.find((o) => o.t.toLowerCase().includes(c.toLowerCase()));
      if (m) {
        await page.select(`select${info.id ? '#' + info.id : ''}`, m.v);
        log.push({ select: idx, picked: m.t, value: m.v });
        return { found: true, text: m.t, value: m.v };
      }
    }
    return { found: false, options: info.options.map((o) => o.t) };
  };

  try {
    const url = `${SVP_BASE}/labor/reschedule/steps?reservationId=${reservationId}`;
    log.push({ nav: url });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await sleep(6000);

    if (page.url().includes('/auth/')) {
      await dump('AUTH-REDIRECT');
      await sleep(15000);
      if (page.url().includes('/auth/')) throw new Error('SPA bounced to auth');
    }

    await dump('START');

    // ---- STEP 1: city + language ----
    if (maxDepth >= 1) {
      const selects = await dumpSelects();
      log.push({ selectsStep1: selects });
      const cityRe = /cumilla|comilla|كميلا|كوميلا/i;
      const langRe = /english|انجليزي|انجليزيه|الانجليزية|الانجليزيه|arabic|العربية|العربيه|bangla|bengali/i;
      for (const s of selects) {
        const low = (s.opts || []).map((o) => o.toLowerCase()).join(' | ');
        if (cityRe.test(low)) {
          await pickSelect(s.i, [targetCity, 'cumilla', 'comilla', 'كميلا', 'كوميلا']);
        } else if (langRe.test(low)) {
          await pickSelect(s.i, ['english', 'الانجليزية', 'الانجليزي', 'العربية', 'عربي', 'bangla', 'bengali']);
        }
      }
      await sleep(2000);
      await clickButtonByText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
      await sleep(6000);
      await dump('AFTER-STEP1');
    }

    // ---- STEP 2: date ----
    if (maxDepth >= 2) {
      const [, mn, dy] = targetDate.split('-');
      const targetDay = parseInt(dy, 10);
      // If calendar month isn't the target month, try clicking prev/next month arrows
      const monthOk = await page.evaluate(() => {
        const h = document.body?.innerText || '';
        return /august|أغسطس|اغسطس|أغسطس/i.test(h);
      }).catch(() => false);
      if (!monthOk) {
        log.push({ monthNav: 'no August text found on page' });
      }
      const dayClicked = await page.evaluate((day) => {
        const all = [...document.querySelectorAll('button, td, span, div, a')];
        for (const el of all) {
          const t = el.textContent.trim();
          if (t === String(day) && el.childElementCount === 0 && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: t };
            }
          }
        }
        return null;
      }, targetDay);
      if (dayClicked) {
        await page.mouse.click(dayClicked.x, dayClicked.y);
        log.push({ dateClicked: dayClicked });
      } else {
        log.push({ dateClicked: null, note: `day ${targetDay} not found` });
      }
      await sleep(7000);
      await dump('AFTER-DATE');
    }

    // ---- STEP 3: session ----
    if (maxDepth >= 3) {
      const buttons = await dumpButtons();
      log.push({ buttonsAfterDate: buttons });
      const sessions = await page.evaluate(() =>
        [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"]')].map((el) => ({
          text: el.textContent.trim().substring(0, 160)
        }))
      );
      log.push({ sessionItems: sessions });
      if (sessions.length > 0) {
        const coords = await page.evaluate(() => {
          const els = [...document.querySelectorAll('.session-item, [class*="session-item"], [class*="SessionItem"]')];
          if (!els.length) return null;
          const el = els[0];
          const rect = el.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim().substring(0, 160) };
        });
        if (coords) {
          await page.mouse.click(coords.x, coords.y);
          log.push({ sessionSelected: coords });
        }
        await sleep(2000);
      } else {
        log.push({ sessionSelected: null, note: 'no session items (auto-selected)' });
      }
      await clickButtonByText(['next', 'continue', 'التالي', 'متابعة', 'proceed']);
      await sleep(5000);
      await dump('AFTER-SESSION');
    }

    // ---- STEP 4: confirm ----
    if (maxDepth >= 4) {
      await dump('CONFIRM-PAGE');
      await clickButtonByText(['confirm appointment', 'confirm', 'submit', 'تأكيد الحجز', 'تأكيد', 'yes']);
      await sleep(5000);
      await dump('AFTER-CONFIRM-1');
      await clickButtonByText(['confirm', 'yes', 'ok', 'نعم', 'تأكيد']);
      await sleep(3000);
      await dump('AFTER-CONFIRM-2');
    }

    // wait for the reschedule POST response
    const started = Date.now();
    const hasRescheduleRes = () => capture.some((c) => c.t === 'res' && /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    while (Date.now() - started < 30000 && !hasRescheduleRes()) {
      await sleep(1000);
    }
    await sleep(4000);
    await dump('FINAL');

    try { writeFileSync(CAPTURE_FILE, JSON.stringify(capture, null, 2), 'utf-8'); } catch {}

    const rescheduleCalls = capture.filter((c) => /\/exam_reservations\/\d+\/reschedule/.test(c.url));
    const holdCalls = capture.filter((c) => /temporary_seats/.test(c.url));
    const detailCalls = capture.filter((c) => c.t === 'res' && /\/exam_sessions\/[\w%]/.test(c.url) && !/available_dates/.test(c.url));
    const listCalls = capture.filter((c) => c.t === 'res' && /\/exam_sessions(\?|$)/.test(c.url));
    const reservationsCalls = capture.filter((c) => /\/exam_reservations(\?|$|\/\d+$)/.test(c.url));

    return NextResponse.json({
      success: true,
      data: {
        finalUrl: page.url(),
        rescheduleCalls,
        holdCalls,
        detailCalls,
        listCalls,
        reservationsCalls,
        allCalls: capture,
        log,
        captureFile: CAPTURE_FILE
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message, log, capture }, { status: 500 });
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
  }
}
