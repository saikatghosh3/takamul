const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));

  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' });
  await context.addInitScript((t) => {
    try { localStorage.setItem('auth_token_default', 'Bearer ' + t); localStorage.setItem('auth_token', t); localStorage.setItem('token', t); localStorage.setItem('svp_token', t); } catch {}
  }, token);

  const page = await context.newPage();
  await page.goto('https://svp-international.pacc.sa/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);

  const doFetch = (url, method, body, extraHeaders) => page.evaluate(async ({ url, method, body, token, extraHeaders }) => {
    const headers = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, ...extraHeaders };
    if (method !== 'GET') headers['Content-Type'] = 'application/json';
    const r = await fetch(url, { method, headers, body: body || undefined, mode: 'cors' });
    const text = await r.text();
    return { status: r.status, body: text.substring(0, 1800) };
  }, { url, method, body, token, extraHeaders });

  const hdr = { 'X-Tenant-Name': 'svp-international' };

  const catId = 159;
  const noFilter = await doFetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=78&per_page=10000`, 'GET', null, hdr);
  console.log('=== GET exam_sessions (tenant header, no filter) ===');
  console.log('status', noFilter.status);
  let s = [];
  try { s = JSON.parse(noFilter.body).exam_sessions || []; } catch {}
  const cities = {};
  for (const x of s) { const c = x.test_center?.city || '?'; cities[c] = (cities[c] || 0) + 1; }
  console.log('count:', s.length, 'cities:', JSON.stringify(cities));

  const tcFilter = await doFetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=78&test_center_id=174&per_page=10000`, 'GET', null, hdr);
  console.log('=== GET exam_sessions (tenant header, test_center_id=174) ===');
  console.log('status', tcFilter.status);
  let s2 = [];
  try { s2 = JSON.parse(tcFilter.body).exam_sessions || []; } catch {}
  const cities2 = {};
  for (const x of s2) { const c = x.test_center?.city || '?'; cities2[c] = (cities2[c] || 0) + 1; }
  console.log('count:', s2.length, 'cities:', JSON.stringify(cities2));

  // also test the reservations list to make sure auth fully works
  const resv = await doFetch(`${API_BASE}/individual_labor_space/exam_reservations?country_id=78`, 'GET', null, hdr);
  console.log('=== GET exam_reservations (tenant header) ===');
  console.log('status', resv.status);
  try { const r = JSON.parse(resv.body).exam_reservations || []; console.log('reservations:', r.length, '| ids:', r.map(x => x.id).join(',')); } catch { console.log('body:', resv.body.substring(0, 300)); }

  // reschedule probes (canceled 4878771, safe)
  const hashedSession = s[0]?.id;
  console.log('\nHashed session:', hashedSession);
  const payloads = [
    { label: 'empty', body: {} },
    { label: 'only test_date', body: { test_date: '2026-08-20' } },
    { label: 'test_date+tc', body: { test_date: '2026-08-20', test_center_id: 174 } },
    { label: 'tc+cat+city', body: { test_date: '2026-08-20', test_center_id: 174, category_id: 159, city: 'Dhaka' } },
    { label: 'session+lang', body: { exam_session_id: hashedSession, language: 'bn', test_date: '2026-08-20' } },
    { label: 'session+lang_code', body: { exam_session_id: hashedSession, language_code: 'bn' } },
    { label: 'session+date+tc+cat+city', body: { exam_session_id: hashedSession, test_date: '2026-08-20', test_center_id: 174, category_id: 159, city: 'Dhaka', language: 'bn' } },
  ];
  for (const p of payloads) {
    console.log(`\n=== POST reschedule ${p.label}: ${JSON.stringify(p.body).substring(0, 140)} ===`);
    const r = await doFetch(`${API_BASE}/individual_labor_space/exam_reservations/4878771/reschedule`, 'POST', JSON.stringify(p.body), hdr);
    console.log('status', r.status, '\nbody:', r.body.substring(0, 1000));
  }

  await browser.close();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
