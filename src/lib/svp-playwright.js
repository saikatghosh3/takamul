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
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getToken as getAuthToken, isLoggedIn as checkLoggedIn, logout as doLogout } from './svp-auth.js';

export { checkLoggedIn as isLoggedIn, doLogout as logout, getAuthToken as getToken };

const SVP_BASE = 'https://svp-international.pacc.sa';
const SVP_LOGIN_URL = `${SVP_BASE}/auth/login?role=labor`;
const SVP_API_BASE = 'https://svp-international-api.pacc.sa/api/v1';

const TOKEN_FILE = join(process.cwd(), '.svp-token.json');
const STORAGE_FILE = join(process.cwd(), '.svp-storage.json');

// ─── Browser Session Management ─────────────────────────────────

// On Windows, Smart App Control blocks Playwright's unsigned bundled Chromium,
// so launch via the signed Microsoft Edge instead. Other platforms (e.g. a Linux
// VPS) keep using Playwright's bundled Chromium, which works fine there.
const BROWSER_LAUNCH_OPTS = process.platform === 'win32' ? { channel: 'msedge' } : {};

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
    ...BROWSER_LAUNCH_OPTS,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });

  // Reuse the SPA session captured at login (cookies incl. the HTTP-only
  // refresh cookie + localStorage tokens) so the managed context can keep the
  // session alive and refresh the access token itself. Without the cookies the
  // stored access token gets rejected once SVP rotates it server-side.
  let storageState = null;
  try {
    if (existsSync(STORAGE_FILE)) {
      storageState = JSON.parse(readFileSync(STORAGE_FILE, 'utf-8'));
    }
  } catch (err) {
    console.warn('[svp-playwright] Failed to load storage state:', err.message);
  }
  const hasStorageState = !!(storageState &&
    ((storageState.cookies && storageState.cookies.length > 0) ||
     (storageState.origins && storageState.origins.length > 0)));

  managedContext = await managedBrowser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    ...(hasStorageState ? { storageState } : {})
  });

  if (!hasStorageState) {
    // Fallback: no captured session — inject just the access token.
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
  }

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
      ...BROWSER_LAUNCH_OPTS,
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
          await saveStorageState(context);
          await browser.close().catch(() => {});
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
          await saveStorageState(context);
          await browser.close().catch(() => {});
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
            await saveStorageState(context);
            await browser.close().catch(() => {});
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

// Persist the full SPA session (cookies incl. the HTTP-only refresh cookie +
// localStorage) so later browser-context API calls can keep the session alive
// and refresh the access token. Also stop the SPA from rotating the token:
// the login browser is closed right after this is saved.
async function saveStorageState(context) {
  try {
    const state = await context.storageState();
    writeFileSync(STORAGE_FILE, JSON.stringify(state), 'utf-8');
    console.log('[Login] Saved SPA session state to .svp-storage.json');
  } catch (err) {
    console.warn('[Login] Could not save storage state:', err.message);
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
  if (!token) {
    return {
      ok: false,
      status: 401,
      json: async () => ({ error: 'Not authenticated' })
    };
  }

  // Route through the managed browser context so the access token can be
  // refreshed automatically when SVP rotates it server-side.
  try {
    const result = await browserFetch(url, options);
    return {
      ok: result.ok,
      status: result.status,
      json: async () => result.data
    };
  } catch (err) {
    console.warn('[svp-playwright] authenticatedFetch fell back to direct fetch:', err.message);
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
    const res = await fetch(url, { ...options, headers });
    return {
      ok: res.ok,
      status: res.status,
      json: async () => res.json()
    };
  }
}

// ─── Browser Fetch (via page context) ───────────────────────────

// Reads the current access token the SPA actually uses (it keeps refreshing it
// in localStorage as long as its session cookies are valid).
async function getLiveTokenFromPage(page) {
  try {
    const tokens = await page.evaluate(() => {
      const out = [];
      for (const key of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'svp_token', 'auth._token.local']) {
        const v = localStorage.getItem(key);
        if (v && v.split('.').length === 3) out.push(v);
      }
      return out;
    });
    return tokens.find((t) => t && !t.startsWith('Bearer ')) || tokens[0] || null;
  } catch {
    return null;
  }
}

// Attempts a token refresh over the managed browser's network stack. The
// context holds SVP's session cookies (incl. the HTTP-only refresh cookie)
// which are sent automatically, so POST /refresh succeeds from there. Using
// context.request avoids the page-context CORS restrictions entirely.
async function refreshTokenInPage() {
  if (!managedContext) return null;
  try {
    const current = getAuthToken();
    const res = await managedContext.request.post('https://svp-international-api.pacc.sa/api/v1/refresh', {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'X-Tenant-Name': 'svp-international',
        ...(current ? { 'Authorization': `Bearer ${current}` } : {})
      },
      data: '{}'
    });
    if (res.status() !== 200) return null;
    const data = await res.json();
    const t = data.access || null;
    if (!t) return null;
    if (managedPage) {
      await managedPage.evaluate((tok) => {
        for (const key of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'svp_token', 'auth._token.local']) {
          localStorage.setItem(key, tok);
        }
      }, t).catch(() => {});
    }
    return t;
  } catch {
    return null;
  }
}

function persistToken(t) {
  try {
    const clean = t.startsWith('Bearer ') ? t.slice(7) : t;
    const payload = JSON.parse(Buffer.from(clean.split('.')[1], 'base64').toString());
    const expiry = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 60 * 60 * 1000);
    writeFileSync(TOKEN_FILE, JSON.stringify({ token: clean, expiry: expiry.toISOString() }), 'utf-8');
  } catch {
    try { writeFileSync(TOKEN_FILE, JSON.stringify({ token: t }), 'utf-8'); } catch {}
  }
}

export async function browserFetch(url, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated');
  const method = (options.method || 'GET').toUpperCase();

  let page;
  try {
    page = await ensureManagedBrowser();
  } catch (err) {
    console.warn('[svp-playwright] browser launch failed, falling back to direct fetch:', err.message);
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Origin': SVP_BASE,
      'Referer': `${SVP_BASE}/`,
      'Authorization': `Bearer ${token}`
    };
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') headers['Content-Type'] = 'application/json';
    const res = await fetch(url, { method, headers, body: options.body || undefined });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, data };
  }

  const doFetch = async (fetchToken) => {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Origin': SVP_BASE,
      'Referer': `${SVP_BASE}/`,
      'Authorization': `Bearer ${fetchToken}`
    };
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
      headers['Content-Type'] = 'application/json';
    }
    // Send through the managed browser's network stack (shares the context's
    // cookies, no CORS) instead of page-context fetch, which rejects with
    // "TypeError: Failed to fetch" on cross-origin credentialed requests.
    const res = await managedContext.request.fetch(url, {
      method,
      headers,
      data: options.body || undefined
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status(), ok: res.ok(), data };
  };

  let result;
  try {
    result = await doFetch(token);
  } catch (err) {
    managedBrowserReady = false;
    try { await managedBrowser?.close(); } catch {}
    managedBrowser = null;
    managedContext = null;
    managedPage = null;
    throw err;
  }

  // Token was rotated server-side (SPA session keeps refreshing). Try to obtain
  // the live token and retry once.
  if (result.status === 401) {
    let live = await getLiveTokenFromPage(page);
    if (!live || live === token) {
      live = await refreshTokenInPage();
    }
    if (live && live !== token) {
      persistToken(live);
      console.log('[svp-playwright] Refreshed access token after 401');
      result = await doFetch(live);
    }
  }

  return result;
}

// ─── RESCHEDULE VIA BROWSER FETCH (enables page.route interception) ──

export async function rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${SVP_API_BASE}/individual_labor_space/exam_reservations/${sessionId}/reschedule`;
  console.log(`[API RESCHEDULE] POST ${url}`);

  try {
    if (!examSessionId) {
      return { ok: false, error: 'An exam session is required for reschedule. The selected session determines the test center that gets assigned.' };
    }
    if (!language) {
      return { ok: false, error: 'A language is required for reschedule. Send the SVPI prometric code (e.g. LOABB), not the ISO code (e.g. bn).' };
    }

    // Exact SVPI wizard payload (reschedule-appointment chunk 7083 / RPL 4823):
    //   rescheduleAppointment() {
    //     const t = { id: this.reservation.id,
    //                 exam_session_id: this.selectedSession.id,
    //                 language_code: this.formData.language.code }
    //     this.recheduleReservation(t)
    //   }
    // and the Vuex action posts POST exam_reservations/{id}/reschedule with
    // that body. So:
    //   - id:             reservation id (also in the URL)
    //   - exam_session_id: the exact session the user picked. THIS is what pins
    //                      the test center — each session token belongs to one
    //                      center, so passing the session of the chosen center
    //                      is how the picked center gets assigned. Send it as a
    //                      string (SVPI session ids are opaque tokens).
    //   - language_code:  the PROMETRIC code (LOABB etc.), NOT the ISO code and
    //                      NOT the field name `language`.
    // NOTE: do NOT send test_date / test_center_id / category_id / city here —
    // SVPI's reschedule API does not use them; the session id fully determines
    // date + time + center, and language_code determines the language.
    const body = {
      id: Number(sessionId) || sessionId,
      exam_session_id: String(examSessionId),
      language_code: language
    };

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

export async function rebookViaAPI({ occupationId, examSessionId, languageCode, methodology, categoryId, cityName, testDate, siteId, siteCity, duration, startAt }) {
  const token = getAuthToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const base = `${SVP_API_BASE}/individual_labor_space`;

  try {
    if (!examSessionId) {
      return { ok: false, error: 'An exam session is required. SVPI assigns the test center of the session you pick, so select one.' };
    }
    if (!occupationId) {
      return { ok: false, error: 'An occupation is required. Rebook under the reservation\'s occupation.' };
    }
    if (!languageCode) {
      return { ok: false, error: 'A language (prometric code, e.g. LOABB) is required. It is sent to SVPI as language_code.' };
    }

    // Step 1 — hold the slot exactly like SVPI's booking wizard (chunk 8189
    // createSlotHold -> POST /prometric_scheduling/slots_availabilities with
    // { slot_id, site_id }). The hold is best-effort: if it fails we still try
    // createReservation without hold_id, matching the wizard's optional hold.
    let holdId = null;
    try {
      const holdBody = { slot_id: String(examSessionId) };
      if (siteId) holdBody.site_id = String(siteId);
      const holdRes = await browserFetch(`${base}/prometric_scheduling/slots_availabilities`, {
        method: 'POST',
        body: JSON.stringify(holdBody)
      });
      if (holdRes.ok && holdRes.data?.id) {
        holdId = holdRes.data.id;
      }
      console.log(`[API REBOOK] Slot hold: ${holdRes.status} holdId=${holdId}`);
    } catch (e) {
      console.warn('[API REBOOK] Slot hold failed, continuing without hold:', e.message);
    }

    // Step 2 — create the reservation with the SVPI booking-wizard payload
    // (chunk 8189 handleCreateSession) PLUS the declaration/country fields the
    // original working rebook sent. language_code is the PROMETRIC code (e.g.
    // LOABB), NOT the ISO code; methodology is the string 'in_person'
    // (E.sq.IN_PERSON), NOT a number. country_id + the *_confirmation flags are
    // kept so SVPI actually persists the reservation (the bookings list is
    // country-scoped via country_id, and without the declarations SVPI echoes a
    // 200 but drops the reservation).
    const body = {
      exam_session_id: String(examSessionId),
      occupation_id: Number(occupationId) || occupationId,
      language_code: languageCode,
      methodology: methodology || 'in_person',
      site_id: siteId || null,
      site_city: siteCity || null,
      hold_id: holdId,
      duration: duration ?? null,
      start_at: startAt || null,
      country_id: 78,
      accept_declaration: true,
      info_confirmation: true,
      practical_confirmation: true
    };

    console.log(`[API REBOOK] Payload to SVPI: ${JSON.stringify(body)}`);

    const result = await browserFetch(`${base}/exam_reservations`, {
      method: 'POST',
      body: JSON.stringify(body)
    });

    console.log(`[API REBOOK] Response: ${result.status} ${result.ok ? 'OK' : 'FAIL'}`);
    console.log(`[API REBOOK] Response body: ${JSON.stringify(result.data).substring(0, 500)}`);

    if (!result.ok) {
      return result;
    }

    // Step 3 — complete the booking with the wallet/credits payment, exactly
    // like the SVPI wizard (chunk 8189 createSessionWithCredits ->
    // payWithUserCredits). createReservation alone only makes a temporary
    // reservation that SVPI discards within seconds; the reservation persists
    // only after payWithUserCredits confirms it.
    const created = result.data?.exam_reservation || result.data;
    const reservationId = created?.id || created?.reservation_id || created?.reservationId;
    if (!reservationId) {
      return { ok: false, status: result.status, data: result.data, error: 'createReservation returned 2xx but no reservation id.' };
    }

    const payBody = {
      methodology_type: methodology || 'in_person',
      reservation_id: String(reservationId),
      occupation_id: Number(occupationId) || occupationId
    };
    console.log(`[API REBOOK] Paying for reservation ${reservationId}: ${JSON.stringify(payBody)}`);

    const payRes = await browserFetch(`${base}/reservation_credits/use`, {
      method: 'POST',
      body: JSON.stringify(payBody)
    });

    console.log(`[API REBOOK] Payment: ${payRes.status} ${payRes.ok ? 'OK' : 'FAIL'}`);
    console.log(`[API REBOOK] Payment body: ${JSON.stringify(payRes.data).substring(0, 500)}`);

    const paidReservation = payRes.data?.reservation || payRes.data?.exam_reservation || payRes.data;
    const paidId = paidReservation?.id || paidReservation?.reservation_id || paidReservation?.reservationId;

    if (payRes.ok && paidId) {
      const mergedReservation = { ...(created || {}), ...(paidReservation || {}) };
      if (!mergedReservation.id && paidId) mergedReservation.id = paidId;
      return {
        ...result,
        ok: true,
        data: { ...result.data, exam_reservation: mergedReservation }
      };
    }

    const payError = (payRes.data?.message || payRes.data?.error || payRes.error) ||
      `Payment step returned HTTP ${payRes.status}. The reservation exists but needs payment to persist.`;
    console.error(`[API REBOOK] Payment failed: ${payError}`);
    return {
      ok: false,
      status: payRes.status || result.status,
      data: result.data,
      error: payError,
      reservationId
    };
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
