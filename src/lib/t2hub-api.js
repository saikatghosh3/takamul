import { decryptPayload } from './svpi-crypto.js';
import {
  ensureSession,
  hasCookies,
  canAutoLogin,
  getBaseUrl,
  getEncryptionKey,
  buildCookieHeader
} from './t2hub-session.js';

// ─────────────────────────────────────────────────────────────────────────
//  t2hub.app "SVP Exam Center Finder" API client
//
//  The t2hub proxy exposes the SVP exam-session data that the official SVP API
//  hides (center names + per-session available seats). It returns every payload
//  wrapped as { "p": "<ciphertext>", "iv": "<iv>" } encrypted with the app key
//  that ships in the page's window.__sk (the "SVP Exam Center Finder" app shell
//  at https://t2hub.app/takamol, only served to authenticated sessions):
//      const API_BASE = '/takamol/api';   // -> https://t2hub.app/takamol/api
//      window.__sk = '<rotating AES-GCM key>'
//
//  The key rotates on t2hub's side. When decryption starts failing (or the
//  cookies expire), t2hubFetch transparently re-authenticates via the session
//  manager (t2hub-session.js) — which drives the login page with the stored
//  credentials, captures the fresh cookies + window.__sk, and persists them to
//  .env.t2hub — then retries the request once. No manual re-login / key re-copy
//  is needed.
//
//  Auth is cookie-based: t2_hub_session (Laravel session), takamol_access_key
//  (the app's own access-key cookie) and XSRF-TOKEN. These live in .env.t2hub
//  (gitignored) and are managed at runtime by t2hub-session.js.
// ─────────────────────────────────────────────────────────────────────────

export const T2HUB_BASE_URL = getBaseUrl();
export const T2HUB_ENCRYPTION_KEY = getEncryptionKey();

export function t2hubCookieHeader() {
  return buildCookieHeader();
}

// True when t2hub can be used right now: either a working cookie set is stored
// or credentials are configured so the session manager can obtain one on demand.
export function hasT2hubAuth() {
  return hasCookies() || canAutoLogin();
}

const cache = new Map();

function getCached(key, ttlMs) {
  const e = cache.get(key);
  if (e && Date.now() - e.time < ttlMs) return e.data;
  if (e) cache.delete(key);
  return null;
}

function setCache(key, data, ttlMs) {
  cache.set(key, { data, time: Date.now() });
  // lightweight cleanup
  for (const [k, v] of cache) {
    if (Date.now() - v.time > ttlMs * 2) cache.delete(k);
  }
}

const BASE_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36',
  'Referer': 'https://t2hub.app/takamol',
  'Origin': 'https://t2hub.app',
};

// Core fetch: GET/POST to `${base}/${path}`, auto-decrypt { p, iv }. On auth
// errors or decryption failures it refreshes the t2hub session automatically
// (drives the login page with the stored credentials) and retries once.
export async function t2hubFetch(path, options = {}) {
  const doRequest = async () => {
    // No stored cookies yet — obtain a session first (auto-login when possible).
    if (!buildCookieHeader()) {
      const s = await ensureSession();
      if (!s.ok) throw new Error(`t2hub credentials not configured and auto-login failed: ${s.error || 'unknown'}`);
    }

    const base = getBaseUrl();
    const key = getEncryptionKey();
    const url = `${base}/${path.replace(/^\//, '')}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: { ...BASE_HEADERS, Cookie: buildCookieHeader(), ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal
    });

    let body = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { /* non-JSON (e.g. HTML error page) */ }

    if (!res.ok) {
      const msg = parsed?.message || parsed?.error || `t2hub API ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.retry_after = parsed?.retry_after || null;
      err.parsed = parsed;
      throw err;
    }

    // Not encrypted -> pass through as-is
    if (!parsed || !parsed.p || !parsed.iv) {
      return { status: res.status, data: parsed };
    }

    let decrypted;
    try {
      decrypted = await decryptPayload(key, parsed);
    } catch (e) {
      const err = new Error(`t2hub payload decryption failed: ${e.message}`);
      err.status = res.status;
      err.decrypt = true;
      throw err;
    }
    return { status: res.status, data: decrypted };
  };

  try {
    return await doRequest();
  } catch (err) {
    const needsRefresh = isT2hubAuthError(err) || err?.decrypt || /credentials not configured/i.test(err?.message || '');
    if (needsRefresh) {
      const s = await ensureSession({ force: true });
      if (s.ok) {
        // Retry once with the fresh session; if it still fails, surface the error.
        return await doRequest();
      }
      console.warn('[t2hub-api] session refresh failed, using stale session:', s.error);
    }
    throw err;
  }
}

// Session list for a category+city+date. This is the endpoint the t2hub search
// page uses (GET pacc-exam-sessions) and it returns center_name per session,
// which the raw SVP API never exposes.
export async function fetchT2hubExamSessions({ categoryId, city, examDate, ttlMs = 20 * 1000 }) {
  const q = new URLSearchParams();
  if (categoryId != null) q.set('category_id', String(categoryId));
  if (city) q.set('city', city);
  if (examDate) q.set('exam_date', examDate);

  const cacheKey = `sessions:${categoryId}:${city || ''}:${examDate || ''}`;
  const cached = getCached(cacheKey, ttlMs);
  if (cached) return cached;

  const { data } = await t2hubFetch(`pacc-exam-sessions?${q.toString()}`);
  const sessions = Array.isArray(data?.sessions) ? data.sessions : [];
  const result = { sessions, total: data?.total ?? sessions.length, raw: data };
  setCache(cacheKey, result, ttlMs);
  return result;
}

// Group sessions by center_name (t2hub's own search page does exactly this) so
// each center gets one row with: name, city, resolved session count, available.
export function groupSessionsByCenter(sessions) {
  const byCenter = {};
  for (const s of sessions || []) {
    const key = s.center_name || s.center_city || 'Unknown Center';
    if (!byCenter[key]) byCenter[key] = [];
    byCenter[key].push(s);
  }

  return Object.entries(byCenter).map(([name, centerSessions]) => {
    const resolved = centerSessions.filter(s => s.resolved);
    const isAvailable = centerSessions.some(s => s.resolved && (s.available_seats || 0) > 0);
    const hasPending = centerSessions.some(s => !s.resolved);
    const sessionCount = resolved.length || centerSessions.length;
    return {
      center_name: name,
      city: centerSessions[0]?.center_city || '',
      exam_date: centerSessions[0]?.exam_date || '',
      available: isAvailable,
      pending: hasPending,
      sessionsCount: sessionCount,
      totalSeats: centerSessions.reduce((sum, s) => sum + (s.available_seats || 0), 0),
      sessions: centerSessions.map(s => ({
        id: s.session_id ?? s.encrypted_session_id ?? null,
        session_id: s.session_id ?? null,
        encrypted_session_id: s.encrypted_session_id ?? null,
        available_seats: s.available_seats ?? null,
        status: s.status ?? null,
        resolved: s.resolved ?? null
      }))
    };
  });
}

// Available dates + cities for a category (and optional city). Mirrors the
// t2hub page's exam-available-dates endpoint.
export async function fetchT2hubAvailableDates({ categoryId, city, ttlMs = 5 * 60 * 1000 }) {
  const q = new URLSearchParams();
  if (categoryId != null) q.set('category_id', String(categoryId));
  if (city) q.set('city', city);

  const cacheKey = `dates:${categoryId}:${city || ''}`;
  const cached = getCached(cacheKey, ttlMs);
  if (cached) return cached;

  const { data } = await t2hubFetch(`exam-available-dates?${q.toString()}`);
  const availableDates = Array.isArray(data?.available_dates) ? data.available_dates : [];
  const result = { available_dates: availableDates };
  setCache(cacheKey, result, ttlMs);
  return result;
}

// Occupation list (categories) from t2hub.
export async function fetchT2hubOccupations({ ttlMs = 10 * 60 * 1000 } = {}) {
  const cacheKey = 'occupations';
  const cached = getCached(cacheKey, ttlMs);
  if (cached) return cached;

  const { data } = await t2hubFetch('pacc/occupations?exclude_ignored=1');
  const result = { occupations: Array.isArray(data?.occupations) ? data.occupations : [] };
  setCache(cacheKey, result, ttlMs);
  return result;
}

// Test centers (sites) for a city, with the short-name map the t2hub page builds.
export async function fetchT2hubTestCenters({ city, ttlMs = 10 * 60 * 1000 }) {
  const q = new URLSearchParams();
  if (city) q.set('city', city);

  const cacheKey = `centers:${city || ''}`;
  const cached = getCached(cacheKey, ttlMs);
  if (cached) return cached;

  const { data } = await t2hubFetch(`test-centers?${q.toString()}`);
  const sites = Array.isArray(data?.sites) ? data.sites : [];
  const result = { sites };
  setCache(cacheKey, result, ttlMs);
  return result;
}

// True if the t2hub session/access-key cookies are present but the API still
// rejects them (e.g. expired session). Used by the search route to decide
// whether to fall back to the SVP path.
export function isT2hubAuthError(err) {
  return Boolean(
    err?.status === 401 ||
    err?.status === 403 ||
    /access key|unauthorized|invalid.*token|login/i.test(err?.message || '')
  );
}
