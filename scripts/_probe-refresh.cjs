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
    return { status: r.status, body: text.substring(0, 2000) };
  }, { url, method, body, token, extraHeaders });

  const hdr = { 'X-Tenant-Name': 'svp-international' };

  console.log('=== GET auth/refresh ===');
  let r = await doFetch(`${API_BASE}/auth/refresh`, 'GET', null, hdr);
  console.log('status', r.status, '\nbody:', r.body.substring(0, 800));

  console.log('\n=== GET auth/refresh (no tenant header) ===');
  r = await doFetch(`${API_BASE}/auth/refresh`, 'GET', null, {});
  console.log('status', r.status, '\nbody:', r.body.substring(0, 800));

  console.log('\n=== POST auth/refresh ===');
  r = await doFetch(`${API_BASE}/auth/refresh`, 'POST', JSON.stringify({ refresh_token: token }), hdr);
  console.log('status', r.status, '\nbody:', r.body.substring(0, 800));

  console.log('\n=== GET auth/user ===');
  r = await doFetch(`${API_BASE}/auth/user`, 'GET', null, hdr);
  console.log('status', r.status, '\nbody:', r.body.substring(0, 800));

  await browser.close();
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
