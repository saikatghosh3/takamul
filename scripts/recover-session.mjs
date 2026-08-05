import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TOKEN_FILE = join(process.cwd(), '.svp-token.json');
const STORAGE_FILE = join(process.cwd(), '.svp-storage.json');
const API = 'https://svp-international-api.pacc.sa/api/v1';

function decodeToken(t) {
  try {
    const p = JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString());
    return { exp: p.exp, sub: p.sub, iss: p.iss };
  } catch {
    return null;
  }
}

async function main() {
  if (!existsSync(STORAGE_FILE)) { console.log('NO STORAGE'); process.exit(1); }
  let storage;
  try { storage = JSON.parse(readFileSync(STORAGE_FILE, 'utf-8')); } catch (e) { console.log('BAD STORAGE', e.message); process.exit(1); }
  const cookieCount = storage?.cookies?.length || 0;
  const originCount = storage?.origins?.length || 0;
  console.log(`storage: cookies=${cookieCount} origins=${originCount}`);

  let oldToken = null;
  try {
    const f = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    oldToken = f.token || null;
  } catch {}
  console.log('old token on disk:', oldToken ? `present (exp ${decodeToken(oldToken)?.exp ? new Date(decodeToken(oldToken).exp * 1000).toISOString() : '?'})` : 'none');

  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: storage,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  // 1) Try the refresh endpoint over the session cookies.
  try {
    const res = await context.request.post(`${API}/refresh`, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant-Name': 'svp-international',
        ...(oldToken ? { 'Authorization': `Bearer ${oldToken}` } : {})
      },
      data: '{}'
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    console.log(`[refresh] status=${res.status()} body=${JSON.stringify(data).substring(0, 400)}`);
    const t = data?.access || data?.token || data?.access_token || null;
    if (t && !t.startsWith('Bearer ')) {
      const info = decodeToken(t);
      const expiry = info?.exp ? new Date(info.exp * 1000).toISOString() : null;
      console.log(`[refresh] GOT TOKEN exp=${expiry}`);
      writeFileSync(TOKEN_FILE, JSON.stringify({ token: t, expiry }), 'utf-8');
      console.log('[refresh] wrote .svp-token.json');
      await browser.close();
      process.exit(0);
    }
    console.log('[refresh] no usable token in response');
  } catch (e) {
    console.log('[refresh] failed:', e.message);
  }

  // 2) Fallback: load the SPA and read the live localStorage token after it boots.
  try {
    const page = await context.newPage();
    await page.goto('https://svp-international.pacc.sa', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(8000);
    const tokens = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (v && v.split('.').length === 3) out[k] = v;
      }
      return out;
    }).catch((e) => ({ __err: e.message }));
    console.log('[spa] localStorage jwt keys:', JSON.stringify(tokens).substring(0, 500));
    for (const [k, v] of Object.entries(tokens)) {
      if (v.startsWith('Bearer ')) continue;
      const info = decodeToken(v);
      const expiry = info?.exp ? new Date(info.exp * 1000).toISOString() : null;
      console.log(`[spa] ${k}: exp=${expiry}`);
      if (expiry && new Date(expiry) > new Date()) {
        writeFileSync(TOKEN_FILE, JSON.stringify({ token: v, expiry }), 'utf-8');
        console.log(`[spa] wrote fresh token from ${k}`);
        await browser.close();
        process.exit(0);
      }
    }
    console.log('[spa] no fresh token in localStorage');
  } catch (e) {
    console.log('[spa] failed:', e.message);
  }

  await browser.close();
  process.exit(2);
}

main().catch((e) => { console.error('FATAL', e); process.exit(3); });
