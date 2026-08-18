import { chromium } from 'playwright';
import {
  getEnv,
  reloadEnv,
  updateEnv,
  T2HUB_SITE_URL_DEFAULT,
  T2HUB_LOGIN_URL_DEFAULT,
  T2HUB_APP_URL_DEFAULT,
  T2HUB_BASE_URL_DEFAULT
} from './t2hub-config.js';
import { decryptPayload } from './svpi-crypto.js';

/**
 * t2hub.app session manager.
 *
 * The t2hub proxy is cookie-authenticated (t2_hub_session, takamol_access_key,
 * XSRF-TOKEN) and encrypts every API payload with AES-GCM using the app key that
 * the page embeds as `window.__sk`. That key rotates on t2hub's side, which is
 * why a hand-copied key goes stale after a while and the old flow required a
 * manual re-login + re-copy every time.
 *
 * This module removes the manual step entirely:
 *   1. validateSession()  probes the live API with the stored cookies+key.
 *   2. If stale, login()   drives the Filament/Livewire login page with the
 *                          T2HUB_PHONE/T2HUB_PASSWORD credentials, reads the
 *                          freshly served window.__sk + session cookies, and
 *                          persists them to .env.t2hub automatically.
 *   3. ensureSession()     orchestrates the above behind a single-flight lock so
 *                          concurrent requests never trigger duplicate logins.
 *
 * If the account uses MFA, the automated (headless) login fails gracefully and
 * the interactive fallback (login({ interactive: true })) opens a visible browser
 * for a one-time OTP entry. Everything after that is automatic again.
 */

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36';

// On Windows, Smart App Control blocks unsigned Chromium builds, so launch via
// the signed Microsoft Edge instead (same pattern as svp-playwright.js).
const BROWSER_LAUNCH_OPTS = process.platform === 'win32' ? { channel: 'msedge' } : {};

const PROBE_TIMEOUT_MS = 15000;
const VALIDATE_TTL_MS = 2 * 60 * 1000;
const HEADLESS_LOGIN_TIMEOUT_MS = 60 * 1000;
const INTERACTIVE_LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
// After a failed login, don't retry for a while so a broken account state does
// not launch a browser on every single request.
const FAIL_COOLDOWN_MS = 60 * 1000;

let lastValidatedAt = 0;
let lastValidatedOk = false;
let lastLoginAttemptAt = 0;
let lastLoginOk = false;
let refreshPromise = null;

// ─── Config helpers ────────────────────────────────────────────────────────

export function hasCookies(env = getEnv()) {
  return Boolean(env.T2HUB_COOKIE_T2_HUB_SESSION && env.T2HUB_COOKIE_TAKAMOL_ACCESS_KEY);
}

export function hasCredentials(env = getEnv()) {
  return Boolean(env.T2HUB_PHONE && env.T2HUB_PASSWORD);
}

export function canAutoLogin() {
  return hasCredentials();
}

export function getBaseUrl(env = getEnv()) {
  return env.T2HUB_BASE_URL || T2HUB_BASE_URL_DEFAULT;
}

export function getEncryptionKey(env = getEnv()) {
  return env.T2HUB_ENCRYPTION_KEY || null;
}

// The server stores cookies raw (Set-Cookie) and expects them raw on the wire.
// Older .env.t2hub snapshots may hold URL-encoded values, so decode on read only
// when the value actually looks encoded (%xx present).
function rawCookieValue(v) {
  if (typeof v !== 'string' || !v.includes('%')) return v;
  try { return decodeURIComponent(v); } catch { return v; }
}

export function buildCookieHeader(env = getEnv()) {
  const parts = [];
  if (env.T2HUB_COOKIE_T2_HUB_SESSION) parts.push(`t2_hub_session=${rawCookieValue(env.T2HUB_COOKIE_T2_HUB_SESSION)}`);
  if (env.T2HUB_COOKIE_TAKAMOL_ACCESS_KEY) parts.push(`takamol_access_key=${rawCookieValue(env.T2HUB_COOKIE_TAKAMOL_ACCESS_KEY)}`);
  if (env.T2HUB_COOKIE_XSRF_TOKEN) parts.push(`XSRF-TOKEN=${rawCookieValue(env.T2HUB_COOKIE_XSRF_TOKEN)}`);
  return parts.join('; ');
}

export function t2hubAuthHeader() {
  return hasCookies() ? { Cookie: buildCookieHeader() } : {};
}

// ─── Validation probe ──────────────────────────────────────────────────────

// Calls the same encrypted endpoint the app itself calls on load and tries to
// decrypt it with the current key. This verifies cookies AND the key in one shot.
async function probeSession(env) {
  const key = getEncryptionKey(env);
  if (!hasCookies(env)) return { ok: false, reason: 'no-cookies' };
  if (!key) return { ok: false, reason: 'missing-key' };

  const url = `${getBaseUrl(env)}/exam-available-dates?category_id=159`;
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': UA_MOBILE,
        'Referer': 'https://t2hub.app/takamol',
        'Origin': 'https://t2hub.app',
        'Cookie': buildCookieHeader(env)
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)
    });
  } catch (e) {
    return { ok: false, reason: `probe-network: ${e.message}` };
  }

  if (res.status === 401 || res.status === 403) return { ok: false, reason: `auth-http-${res.status}` };
  if (!res.ok) return { ok: false, reason: `http-${res.status}` };

  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { return { ok: false, reason: 'non-json-response' }; }

  if (!parsed || !parsed.p || !parsed.iv) return { ok: false, reason: 'not-encrypted-response' };

  try {
    await decryptPayload(key, parsed);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `decrypt-failed: ${e.message}` };
  }
}

export async function validateSession({ force = false } = {}) {
  if (!force && lastValidatedOk && Date.now() - lastValidatedAt < VALIDATE_TTL_MS) {
    return { ok: true, reason: 'cached' };
  }
  const result = await probeSession(getEnv());
  if (result.ok) {
    lastValidatedAt = Date.now();
    lastValidatedOk = true;
  } else {
    lastValidatedOk = false;
  }
  return result;
}

// ─── Login (Playwright) ────────────────────────────────────────────────────

function loginPageText(page) {
  return page.evaluate(() => (document.body?.innerText || '').replace(/\s+/g, ' ').substring(0, 400)).catch(() => '');
}

// The Filament login page is only served when the long-lived takamol_access_key
// cookie is present (it 404s otherwise). That key lives in .env.t2hub and stays
// valid across session/key rotations, so we seed it into the fresh browser
// context along with a fresh t2_hub_session + XSRF-TOKEN before rendering the
// login form. Returns the page positioned on the (rendered) login page.
async function seedPanelSession(context, env) {
  const accessKeyEncoded = env.T2HUB_COOKIE_TAKAMOL_ACCESS_KEY;
  if (!accessKeyEncoded) {
    throw new Error('takamol_access_key cookie not configured — required to render the t2hub login page');
  }
  const page = await context.newPage();

  // /takamol/login 302s to the login page and issues a fresh session cookie.
  await page.goto(`${T2HUB_SITE_URL_DEFAULT}/takamol/login`, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

  await context.addCookies([{
    name: 'takamol_access_key',
    value: rawCookieValue(accessKeyEncoded),
    domain: 't2hub.app',
    path: '/'
  }]);

  await page.goto(T2HUB_LOGIN_URL_DEFAULT, { waitUntil: 'domcontentloaded', timeout: 45000 });

  const formVisible = await page.locator('#form\\.mobile, input[autocomplete="tel"], input[placeholder*="mobile" i]').count().catch(() => 0);
  if (formVisible === 0) {
    const title = await page.title().catch(() => '');
    throw new Error(
      `t2hub login page did not render (title="${title}"). The stored takamol_access_key is invalid or expired — `
      + `run "node scripts/refresh-t2hub-session.mjs --interactive" with a fresh access key, or update T2HUB_COOKIE_TAKAMOL_ACCESS_KEY in .env.t2hub.`
    );
  }

  return page;
}

async function fillLoginForm(page, env) {
  const phone = env.T2HUB_PHONE;
  const password = env.T2HUB_PASSWORD;

  const mobileField = page.locator('#form\\.mobile, input[autocomplete="tel"], input[placeholder*="mobile" i]').first();
  await mobileField.waitFor({ state: 'visible', timeout: 15000 });
  await mobileField.fill(phone);

  const passField = page.locator('#form\\.password, input[autocomplete="current-password"], input[type="password"]').first();
  await passField.waitFor({ state: 'visible', timeout: 10000 });
  await passField.fill(password);

  const submit = page.locator('button[type="submit"]');
  if (await submit.count() > 0) {
    await submit.first().click();
  } else {
    await page.getByRole('button', { name: /sign in|log in|login/i }).first().click();
  }
}

// Reads window.__sk + the session cookies from the authenticated app page.
async function captureSession(context, page) {
  await page.goto(T2HUB_APP_URL_DEFAULT, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});

  let key = null;
  try {
    key = await page.evaluate(() => (window.__sk && window.__sk.length > 10 ? window.__sk : null)).catch(() => null);
  } catch {}

  if (!key) {
    // window.__sk is injected in the served HTML; check the raw markup too.
    const html = await page.content().catch(() => '');
    const m = html.match(/window\.__sk\s*=\s*['"]([^'"]+)['"]/);
    if (m && m[1]) key = m[1];
  }

  if (!key) {
    const url = page.url();
    if (url.includes('/login')) throw new Error(`Not authenticated after login (redirected to ${url})`);
    throw new Error(`window.__sk not found on app page (${url}) — session may be blocked or MFA required`);
  }

  const cookies = await context.cookies();
  const pick = (name) => {
    const c = cookies.find((ck) => ck.name === name && ck.value);
    return c ? c.value : null;
  };

  const sessionCookie = pick('t2_hub_session');
  const accessKey = pick('takamol_access_key');
  if (!sessionCookie || !accessKey) {
    throw new Error(`Required cookies missing after login (t2_hub_session=${!!sessionCookie}, takamol_access_key=${!!accessKey})`);
  }

  const updates = {
    T2HUB_ENCRYPTION_KEY: key,
    T2HUB_COOKIE_T2_HUB_SESSION: sessionCookie,
    T2HUB_COOKIE_TAKAMOL_ACCESS_KEY: accessKey,
    T2HUB_COOKIE_XSRF_TOKEN: pick('XSRF-TOKEN') || undefined
  };
  for (const k of Object.keys(updates)) {
    if (updates[k] === undefined) delete updates[k];
  }

  updateEnv(updates);
  reloadEnv();

  console.log('[t2hub-session] Fresh session captured: key=' + key.slice(0, 8) + '… cookies='
    + [sessionCookie.slice(0, 8), accessKey.slice(0, 8)].join('/'));

  return { key, t2_hub_session: sessionCookie, takamol_access_key: accessKey };
}

async function loginHeadless() {
  const env = getEnv();
  if (!hasCredentials(env)) throw new Error('T2HUB_PHONE / T2HUB_PASSWORD not configured');

  const browser = await chromium.launch({
    ...BROWSER_LAUNCH_OPTS,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  const context = await browser.newContext({
    userAgent: UA_DESKTOP,
    viewport: { width: 1366, height: 900 }
  });

  try {
    const page = await seedPanelSession(context, env);
    await fillLoginForm(page, env);

    const start = Date.now();
    while (Date.now() - start < HEADLESS_LOGIN_TIMEOUT_MS) {
      if (!page.url().includes('/login')) break;
      await page.waitForTimeout(2000);
    }

    if (page.url().includes('/login')) {
      const text = await loginPageText(page);
      const err = /(credentials do not match|invalid|incorrect|failed)/i.test(text)
        ? `Login rejected by t2hub: ${text}`
        : `Login did not complete (still on login page).${text ? ` Page says: ${text}` : ''} MFA may be required — use --interactive to log in once in a visible browser.`;
      throw new Error(err);
    }

    return await captureSession(context, page);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function loginInteractive() {
  const env = getEnv();
  const browser = await chromium.launch({
    ...BROWSER_LAUNCH_OPTS,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1200,900'
    ]
  });
  const context = await browser.newContext({
    userAgent: UA_DESKTOP,
    viewport: { width: 1200, height: 900 }
  });

  try {
    const page = await seedPanelSession(context, env);
    if (hasCredentials(env)) {
      try {
        await fillLoginForm(page, env);
        // Best-effort auto-submit; if MFA kicks in the user completes it here.
        try { await page.locator('button[type="submit"]').first().click(); } catch {}
      } catch {}
    }
    console.log('[t2hub-session] Interactive login window open — finish logging in (OTP if any), then wait. Capturing automatically...');

    const start = Date.now();
    while (Date.now() - start < INTERACTIVE_LOGIN_TIMEOUT_MS) {
      if (!page.url().includes('/login')) {
        try {
          return await captureSession(context, page);
        } catch {}
      }
      await page.waitForTimeout(3000);
    }

    throw new Error('Interactive login timed out after 5 minutes.');
  } finally {
    await browser.close().catch(() => {});
  }
}

// ─── Orchestration ─────────────────────────────────────────────────────────

// Performs a browser login (headless by default) and persists the fresh session.
export async function login({ interactive = false } = {}) {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    lastLoginAttemptAt = Date.now();
    try {
      await (interactive ? loginInteractive() : loginHeadless());
      const validation = await validateSession({ force: true });
      if (!validation.ok) {
        throw new Error(`Login completed but the session is still invalid (${validation.reason})`);
      }
      lastLoginOk = true;
      return { ok: true, reason: 'fresh-login', interactive };
    } catch (e) {
      lastLoginOk = false;
      return { ok: false, error: e.message, interactive };
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// Ensures a working session exists, auto-logging in when the stored session has
// expired or the window.__sk key has rotated.
export async function ensureSession({ force = false } = {}) {
  if (!force) {
    const v = await validateSession();
    if (v.ok) return { ok: true, reason: 'valid' };
  }

  if (!canAutoLogin()) {
    return { ok: false, error: 't2hub auto-login not possible: T2HUB_PHONE/T2HUB_PASSWORD not configured', hasCredentials: false };
  }

  if (!force && Date.now() - lastLoginAttemptAt < FAIL_COOLDOWN_MS) {
    return { ok: false, error: 'A recent auto-login attempt failed; not retrying yet.', hasCredentials: true };
  }

  return login({ interactive: false });
}

// ─── Diagnostics ───────────────────────────────────────────────────────────

export function getSessionStatus() {
  const env = getEnv();
  return {
    hasCookies: hasCookies(env),
    hasCredentials: hasCredentials(env),
    canAutoLogin: canAutoLogin(),
    lastValidatedOk,
    lastValidatedAt: lastValidatedAt ? new Date(lastValidatedAt).toISOString() : null,
    lastLoginOk,
    lastLoginAttemptAt: lastLoginAttemptAt ? new Date(lastLoginAttemptAt).toISOString() : null,
    encryptionKey: env.T2HUB_ENCRYPTION_KEY ? `${env.T2HUB_ENCRYPTION_KEY.slice(0, 8)}…` : null,
    baseUrl: getBaseUrl(env)
  };
}
