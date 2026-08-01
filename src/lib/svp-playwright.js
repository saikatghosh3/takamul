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
    headless: true,
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

  // ─── Network Interceptor for Create Reservation API (rebook) ────
  await managedPage.route('**/individual_labor_space/exam_reservations', async (route) => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.continue();
      return;
    }
    let payload = {};
    try {
      payload = JSON.parse(request.postData() || '{}');
    } catch {}
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════');
    console.log('║  [NETWORK INTERCEPTOR] Create/Rebook Request Intercepted');
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  URL:    ${request.url()}`);
    console.log(`║  Method: ${request.method()}`);
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  PAYLOAD BEFORE SENDING TO SVPI API:`);
    console.log(`║  ${JSON.stringify(payload, null, 2).split('\n').join('\n║  ')}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');
    await route.continue({
      postData: JSON.stringify(payload)
    });
  });

  // ─── Network Interceptor for Reschedule API ─────────────────────
  await managedPage.route('**/exam_reservations/*/reschedule', async (route) => {
    const request = route.request();
    let payload = {};
    try {
      payload = JSON.parse(request.postData() || '{}');
    } catch {}
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════');
    console.log('║  [NETWORK INTERCEPTOR] Reschedule Request Intercepted');
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  URL:    ${request.url()}`);
    console.log(`║  Method: ${request.method()}`);
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  PAYLOAD BEFORE SENDING TO SVPI API:`);
    console.log(`║  ${JSON.stringify(payload, null, 2).split('\n').join('\n║  ')}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');
    await route.continue({
      postData: JSON.stringify(payload)
    });
  });
  // ─────────────────────────────────────────────────────────────────

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
    const result = await page.evaluate(async ({ fetchUrl, fetchMethod, fetchBody, fetchToken }) => {
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
    }, { fetchUrl: url, fetchMethod: method, fetchBody: options.body || null, fetchToken: token });
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

// ─── RESCHEDULE VIA BROWSER FETCH (enables page.route interception) ──

export async function rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations/${sessionId}/reschedule`;
  console.log(`[API RESCHEDULE] POST ${url}`);

  try {
    let body = {};

    if (testCenterId) {
      // ─── NEW CENTER SPECIFIED ─────────────────────────────────
      // The user picked a specific center. Send:
      //  - test_center_id: their explicit center choice (valid center id)
      //  - exam_session_id: the exact session they picked from the
      //    center-filtered list — this is authoritative and pins the
      //    session's center so SVPI cannot auto-assign another one
      //  - city + language: the fields SVPI's own reschedule wizard sends,
      //    required for the backend to place the new booking
      body = {
        test_date: newDate,
        test_center_id: Number(testCenterId) || testCenterId,
        category_id: Number(categoryId) || categoryId
      };
      if (examSessionId) {
        body.exam_session_id = Number(examSessionId) || examSessionId;
      }
      if (cityName) body.city = cityName;
      if (language) body.language = language;
    } else if (examSessionId) {
      // ─── ONLY DATE CHANGE (same center) ───────────────────────
      body = { exam_session_id: Number(examSessionId) || examSessionId };
      if (categoryId) body.category_id = Number(categoryId) || categoryId;
      if (newDate) body.test_date = newDate;
      if (cityName) body.city = cityName;
      if (language) body.language = language;
    } else if (newDate) {
      // ─── DATE ONLY (fallback) ─────────────────────────────────
      body = { test_date: newDate };
      if (categoryId) body.category_id = Number(categoryId) || categoryId;
      if (cityName) body.city = cityName;
      if (language) body.language = language;
    } else {
      return { ok: false, error: 'No valid parameters provided' };
    }

    console.log(`[API RESCHEDULE] Payload to SVPI: ${JSON.stringify(body)}`);

    // Use browserFetch so the request goes through the Playwright browser page.
    // This triggers the page.route() interceptor in ensureManagedBrowser(),
    // which logs and allows inspection of the payload before it reaches SVPI.
    const result = await browserFetch(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    console.log(`[API RESCHEDULE] Response: ${result.status} ${result.ok ? 'OK' : 'FAIL'}`);
    console.log(`[API RESCHEDULE] Response body: ${JSON.stringify(result.data).substring(0, 500)}`);

    return result;
  } catch (err) {
    console.error(`[API RESCHEDULE] Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

export async function rescheduleViaPlaywright(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language) {
  return rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language);
}

// ─── REBOOK VIA BROWSER FETCH (creates new reservation after cancellation) ──

export async function rebookViaAPI({ occupationId, examSessionId, languageCode, methodology, categoryId, cityName, testDate }) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations`;
  console.log(`[API REBOOK] POST ${url}`);

  try {
    const body = {
      occupation_id: Number(occupationId) || occupationId,
      exam_session_id: examSessionId,
      language_code: languageCode || 'en',
      methodology: Number(methodology) || methodology || 1,
      country_id: 78,
      accept_declaration: true,
      info_confirmation: true,
      practical_confirmation: true
    };

    console.log(`[API REBOOK] Payload to SVPI: ${JSON.stringify(body)}`);

    const result = await browserFetch(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    console.log(`[API REBOOK] Response: ${result.status} ${result.ok ? 'OK' : 'FAIL'}`);
    console.log(`[API REBOOK] Response body: ${JSON.stringify(result.data).substring(0, 500)}`);

    return result;
  } catch (err) {
    console.error(`[API REBOOK] Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
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

// ─── PEEK SESSION TIME (trial book + cancel to extract test_time) ──

export async function peekSessionTime({ occupationId, examSessionId, languageCode, methodology }) {
  const token = getAuthToken();
  if (!token) return { ok: false, error: 'Not authenticated' };

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations`;
  const body = {
    occupation_id: Number(occupationId) || occupationId,
    exam_session_id: examSessionId,
    language_code: languageCode || 'en',
    methodology: Number(methodology) || methodology || 1,
    country_id: 78,
    accept_declaration: true,
    info_confirmation: true,
    practical_confirmation: true
  };

  try {
    console.log(`[PEEK] POST ${url}`);

    // Use browserFetch so the request goes through Playwright page context
    // (avoids Cloudflare 529 rate limiting on direct Node.js fetches)
    const result = await browserFetch(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    console.log(`[PEEK] Status: ${result.status}`);
    console.log(`[PEEK] Response body: ${JSON.stringify(result.data).substring(0, 1000)}`);

    if (!result.ok) {
      const errMsg = result.data?.message || result.data?.error || (typeof result.data === 'string' ? result.data : JSON.stringify(result.data)) || 'Peek failed';
      console.log(`[PEEK] Error: ${errMsg}`);
      return { ok: false, status: result.status, error: errMsg };
    }

    const reservation = result.data?.exam_reservation || result.data;
    const testTime = reservation?.exam_session?.test_time || '';
    const reservationId = reservation?.id;
    const testDate = reservation?.exam_session?.test_date || '';
    console.log(`[PEEK] test_time="${testTime}" reservation_id=${reservationId}`);

    let cancelResult = null;
    if (reservationId) {
      try {
        const cancelRes = await fetch(
          `${SVP_API_BASE}/individual_labor_space/exam_reservations/${reservationId}/cancel`,
          {
            method: 'POST',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Origin': SVP_BASE,
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ cancellation_reason: 'Time discovery' })
          }
        );
        const cancelText = await cancelRes.text();
        let cancelData;
        try { cancelData = JSON.parse(cancelText); } catch { cancelData = cancelText; }
        cancelResult = { ok: cancelRes.ok, status: cancelRes.status, data: cancelData };
        console.log(`[PEEK] Cancel: ${cancelRes.status} ${cancelRes.ok ? 'OK' : 'FAIL'}`);
      } catch (cancelErr) {
        cancelResult = { ok: false, error: cancelErr.message };
      }
    }

    return { ok: true, testTime, reservationId, testDate, cancelResult };
  } catch (err) {
    console.error(`[PEEK] Error: ${err.message}`);
    return { ok: false, error: err.message };
  }
}

// ─── Cleanup ────────────────────────────────────────────────────

export async function shutdownAuth() {
  await closeManagedBrowser();
  doLogout();
}

process.on('SIGTERM', shutdownAuth);
process.on('SIGINT', shutdownAuth);
