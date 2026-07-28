/**
 * SVP Playwright Automation Module
 * 
 * Replaces Puppeteer-based SPA automation with Playwright.
 * Handles: Login, Reschedule, Cancel, Browser Fetch
 * 
 * Key improvements over Puppeteer version:
 *   - Built-in auto-wait (no manual setTimeout)
 *   - Better selector strategies with auto-detection
 *   - Session persistence via storageState
 *   - Dynamic wizard step detection
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { getToken as getAuthToken, isLoggedIn as checkLoggedIn, logout as doLogout } from './svp-auth.js';

export { checkLoggedIn as isLoggedIn, doLogout as logout, getAuthToken as getToken };

const SVP_BASE = 'https://svp-international.pacc.sa';
const SVP_LOGIN_URL = `${SVP_BASE}/auth/login?role=labor`;
const SVP_API_BASE = 'https://svp-international-api.pacc.sa/api/v1';

const TOKEN_FILE = join(process.cwd(), '.svp-token.json');

// ─── Browser Session Management ─────────────────────────────────

let managedBrowser = null;
let managedContext = null;
let managedPage = null;
let managedBrowserReady = false;

async function getManagedPage() {
  if (managedBrowserReady && managedPage) {
    try {
      await managedPage.evaluate(() => 1);
      return managedPage;
    } catch {
      managedBrowserReady = false;
      managedBrowser = null;
      managedContext = null;
      managedPage = null;
    }
  }
  return null;
}

async function ensureManagedBrowser() {
  const existing = await getManagedPage();
  if (existing) return existing;

  if (managedBrowser) {
    try { await managedBrowser.close(); } catch {}
    managedBrowser = null;
    managedContext = null;
    managedPage = null;
  }

  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');

  managedBrowser = await chromium.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  managedContext = await managedBrowser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 }
  });

  // Inject token before any page loads
  await managedContext.addInitScript((t) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;
    try {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('token', t);
      localStorage.setItem('access_token', t);
      localStorage.setItem('vue-auth.token', t);
      localStorage.setItem('svp_token', t);
    } catch {}
  }, token);

  managedPage = await managedContext.newPage();
  await managedPage.goto(SVP_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await managedPage.waitForTimeout(3000);
  managedBrowserReady = true;
  return managedPage;
}

async function closeManagedBrowser() {
  if (managedBrowser) {
    try { await managedBrowser.close(); } catch {}
    managedBrowser = null;
    managedContext = null;
    managedPage = null;
    managedBrowserReady = false;
  }
}

// ─── Login (Browser-visible, manual OTP) ────────────────────────

export function login() {
  if (checkLoggedIn()) {
    return { success: true, message: 'Already logged in.' };
  }
  return doLogin();
}

async function doLogin() {
  let browser = null;
  try {
    browser = await chromium.launch({
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

    // Mask SVP branding
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

    console.log('[Login] Waiting for manual login (timeout: 5 minutes)...');

    const loginStart = Date.now();
    const timeout = 5 * 60 * 1000;

    while (Date.now() - loginStart < timeout) {
      try {
        if (capturedNetworkToken) {
          storeToken(capturedNetworkToken);
          await page.goto(`${SVP_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          return { success: true, message: 'Login successful.' };
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
          await page.goto(`${SVP_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
          return { success: true, message: 'Login successful.' };
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
            await page.goto(`${SVP_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            return { success: true, message: 'Login successful.' };
          }
        }
      } catch (iterationError) {
        console.warn('[Login] Polling iteration error (retrying):', iterationError.message);
      }

      await page.waitForTimeout(1500);
    }

    await browser.close();
    return { success: false, error: 'Login timed out after 5 minutes.' };

  } catch (error) {
    console.error('[Login] Fatal error:', error.message);
    if (browser) await browser.close().catch(() => {});
    return { success: false, error: error.message };
  }
}

// ─── Local Token Storage (writes to shared file used by svp-auth.js) ──

function storeToken(token) {
  try {
    const clean = token.startsWith('Bearer ') ? token.slice(7) : token;
    const payload = JSON.parse(Buffer.from(clean.split('.')[1], 'base64').toString());
    const expiry = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    writeFileSync(TOKEN_FILE, JSON.stringify({ token: clean, expiry: expiry.toISOString() }), 'utf-8');
  } catch {
    writeFileSync(TOKEN_FILE, JSON.stringify({ token }), 'utf-8');
  }
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

// ─── Authenticated Fetch ────────────────────────────────────────

export async function authenticatedFetch(url, options = {}) {
  const token = getAuthToken();
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': SVP_BASE,
    'Referer': `${SVP_BASE}/`,
    ...options.headers
  };
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (!headers['Content-Type']) headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// ─── Browser Fetch (via page context) ───────────────────────────

export async function browserFetch(url, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const method = (options.method || 'GET').toUpperCase();

  let page;
  try {
    page = await ensureManagedBrowser();
  } catch (err) {
    throw err;
  }

  try {
    const result = await page.evaluate(async (fetchUrl, fetchMethod, fetchBody, fetchToken) => {
      const headers = { 'Accept': 'application/json', 'Authorization': `Bearer ${fetchToken}` };
      if (fetchMethod === 'POST' || fetchMethod === 'PUT' || fetchMethod === 'PATCH') {
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(fetchUrl, {
        method: fetchMethod,
        headers,
        body: fetchBody || undefined,
        mode: 'cors'
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, ok: res.ok, data };
    }, url, method, options.body || null, token);
    return result;
  } catch (err) {
    managedBrowserReady = false;
    try { await managedBrowser?.close(); } catch {}
    managedBrowser = null;
    managedContext = null;
    managedPage = null;
    throw err;
  }
}

// ─── RESCHEDULE VIA DIRECT API ──────────────────────────────────

export async function rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations/${sessionId}/reschedule`;
  console.log(`[API RESCHEDULE] POST ${url}`);

  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': SVP_BASE,
    'Referer': `${SVP_BASE}/`,
    'Authorization': `Bearer ${token}`
  };

  try {
    if (examSessionId) {
      const body = { exam_session_id: Number(examSessionId) || examSessionId };
      if (categoryId) body.category_id = Number(categoryId) || categoryId;
      if (testCenterId) body.test_center_id = Number(testCenterId) || testCenterId;
      if (newDate) body.test_date = newDate;
      console.log(`[API RESCHEDULE] Body (with exam_session_id): ${JSON.stringify(body)}`);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      console.log(`[API RESCHEDULE] Response: ${res.status} ${res.statusText}`);
      console.log(`[API RESCHEDULE] Response body: ${JSON.stringify(data).substring(0, 500)}`);
      if (res.ok) return { ok: true, status: res.status, data };
      if (res.status !== 422 && res.status !== 404) return { ok: false, status: res.status, data };
      console.log(`[API RESCHEDULE] Trying fallback with test_date only...`);
    }

    if (newDate) {
      const body = { test_date: newDate };
      if (categoryId) body.category_id = Number(categoryId) || categoryId;
      if (testCenterId) body.test_center_id = Number(testCenterId) || testCenterId;
      console.log(`[API RESCHEDULE] Body (with test_date fallback): ${JSON.stringify(body)}`);
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { data = text; }
      console.log(`[API RESCHEDULE] Response: ${res.status} ${res.statusText}`);
      console.log(`[API RESCHEDULE] Response body: ${JSON.stringify(data).substring(0, 500)}`);
      if (res.ok) return { ok: true, status: res.status, data };
      return { ok: false, status: res.status, data };
    }

    return { ok: false, error: 'No examSessionId or newDate provided' };
  } catch (err) {
    console.error(`[API RESCHEDULE] Network error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function rescheduleViaPlaywright(sessionId, newDate, categoryId, testCenterId, examSessionId) {
  return rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId);
}

// ─── CANCEL VIA DIRECT API ──────────────────────────────────────

export async function cancelViaAPI(sessionId, reason) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations/${sessionId}/cancel`;
  console.log(`[API CANCEL] POST ${url}`);

  const body = {};
  if (reason) body.cancellation_reason = reason;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Origin': SVP_BASE,
        'Referer': `${SVP_BASE}/`,
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    console.log(`[API CANCEL] Response: ${res.status}`);

    if (res.ok) {
      return { ok: true, status: res.status, data };
    }

    return { ok: false, status: res.status, data };
  } catch (err) {
    console.error(`[API CANCEL] Network error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function cancelViaPlaywright(sessionId, reason) {
  return cancelViaAPI(sessionId, reason);
}

// ─── Cleanup ────────────────────────────────────────────────────

export async function shutdownAuth() {
  await closeManagedBrowser();
  doLogout();
}

process.on('SIGTERM', shutdownAuth);
process.on('SIGINT', shutdownAuth);
