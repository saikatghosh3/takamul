const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SVP_BASE = 'https://svp-international.pacc.sa';
const SVP_LOGIN_URL = `${SVP_BASE}/auth/login?role=labor`;
const ROOT = path.join(__dirname, '..');
const TOKEN_FILE = path.join(ROOT, '.svp-token.json');
const STORAGE_FILE = path.join(ROOT, '.svp-storage.json');

function storeToken(token) {
  const clean = token.startsWith('Bearer ') ? token.slice(7) : token;
  try {
    const payload = JSON.parse(Buffer.from(clean.split('.')[1], 'base64').toString());
    const expiry = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: clean, expiry: expiry.toISOString() }), 'utf-8');
    console.log('[Login] Stored token, expiry:', expiry.toISOString());
  } catch {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({ token: clean }), 'utf-8');
    console.log('[Login] Stored token (no exp claim)');
  }
}

async function saveStorageState(context) {
  const state = await context.storageState();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(state), 'utf-8');
  console.log('[Login] Saved SPA session state to .svp-storage.json');
}

function extractToken(storage) {
  for (const key of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'vue_auth_token', 'svp_token']) {
    if (storage[key]) return storage[key];
  }
  for (const [key, value] of Object.entries(storage)) {
    if (typeof value === 'string' && value.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(value.split('.')[1], 'base64').toString());
        if (payload.exp || payload.sub || payload.iss) return value;
      } catch {}
    }
  }
  return null;
}

async function main() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=480,650',
      '--window-position=400,100'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 480, height: 650 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  let capturedNetworkToken = null;

  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api') && url.includes('/api/v1/')) {
      try {
        const headers = response.headers();
        const authHeader = headers['authorization'] || headers['Authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          capturedNetworkToken = authHeader.replace('Bearer ', '');
        }
      } catch {}
    }
  });

  await page.goto(SVP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  await page.evaluate(() => {
    const style = document.createElement('style');
    style.id = 'site-disguise';
    style.textContent = `
      body, html { background: #020617 !important; background-color: #020617 !important; }
      header, nav, .navbar, [class*="logo"], [class*="Logo"], [class*="brand"], [class*="Brand"] { display: none !important; }
    `;
    document.head.appendChild(style);
    document.title = 'Exam Center Manager';
  });

  console.log('[Login] Browser opened. Complete the OTP login in the window.');
  console.log('[Login] Waiting for manual login (timeout: 5 minutes)...');

  const loginStart = Date.now();
  const timeout = 5 * 60 * 1000;

  while (Date.now() - loginStart < timeout) {
    try {
      if (capturedNetworkToken) {
        storeToken(capturedNetworkToken);
        await saveStorageState(context);
        await browser.close().catch(() => {});
        console.log('[Login] SUCCESS');
        return;
      }

      const storageToken = await page.evaluate(() => {
        const result = {};
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          result[key] = localStorage.getItem(key);
        }
        return result;
      }).catch(() => ({}));

      const found = extractToken(storageToken);
      if (found) {
        storeToken(found);
        await saveStorageState(context);
        await browser.close().catch(() => {});
        console.log('[Login] SUCCESS (localStorage token)');
        return;
      }

      const currentUrl = typeof page.url === 'function' ? page.url() : '';
      const isDashboard = currentUrl.includes('dashboard') || currentUrl.includes('/home') ||
        currentUrl.includes('/profile') || (currentUrl.includes('svp-international') && !currentUrl.includes('/auth/'));

      if (isDashboard) {
        await page.waitForTimeout(3000);
        const retryToken = await page.evaluate(() => {
          const result = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            result[key] = localStorage.getItem(key);
          }
          return result;
        }).catch(() => ({}));

        const retryFound = extractToken(retryToken);
        if (retryFound || capturedNetworkToken) {
          storeToken(retryFound || capturedNetworkToken);
          await saveStorageState(context);
          await browser.close().catch(() => {});
          console.log('[Login] SUCCESS (dashboard token)');
          return;
        }
      }
    } catch (iterationError) {
      console.warn('[Login] Polling iteration error (retrying):', iterationError.message);
    }

    await page.waitForTimeout(1500);
  }

  await browser.close();
  console.log('[Login] TIMED OUT after 5 minutes.');
}

main().catch((e) => { console.error('[Login] Fatal error:', e.message); process.exit(1); });
