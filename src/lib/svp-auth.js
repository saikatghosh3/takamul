import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TOKEN_FILE = join(process.cwd(), '.svp-token.json');
const STORAGE_FILE = join(process.cwd(), '.svp-storage.json');

// On Windows, Smart App Control blocks unsigned Chromium builds, so point
// Puppeteer at the signed Microsoft Edge install. Elsewhere (e.g. a Linux VPS)
// EDGE_PATH stays undefined and Puppeteer falls back to its bundled Chromium.
const EDGE_PATH = process.platform === 'win32'
  ? [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ].find((p) => existsSync(p))
  : undefined;

let puppeteer = null;
let authBrowser = null;
let authPage = null;
let authToken = null;
let tokenExpiry = null;

const SVP_LOGIN_URL = 'https://svp-international.pacc.sa/auth/login?role=labor';
const SVP_BASE = 'https://svp-international.pacc.sa';

function saveToken(token, expiry) {
  try {
    writeFileSync(TOKEN_FILE, JSON.stringify({ token, expiry: expiry?.toISOString() || null }), 'utf-8');
  } catch {}
}

function loadToken() {
  try {
    if (!existsSync(TOKEN_FILE)) return;
    const data = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
    if (data.token) {
      authToken = data.token.startsWith('Bearer ') ? data.token.slice(7) : data.token;
      tokenExpiry = data.expiry ? new Date(data.expiry) : null;
      if (tokenExpiry && new Date() >= tokenExpiry) {
        authToken = null;
        tokenExpiry = null;
      }
    }
  } catch {}
}

loadToken();

const MASK_CSS = `
  body, html {
    background: #020617 !important;
    background-color: #020617 !important;
  }
  header, nav, .navbar, [class*="logo"], [class*="Logo"], [class*="brand"], [class*="Brand"] {
    display: none !important;
  }
`;

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import('puppeteer');
  }
  return puppeteer;
}

function extractTokenFromStorage(storage) {
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

function extractTokenFromCookies(cookies) {
  for (const cookie of cookies) {
    if (cookie.value && cookie.value.split('.').length === 3) {
      try {
        const payload = JSON.parse(Buffer.from(cookie.value.split('.')[1], 'base64').toString());
        if (payload.exp || payload.sub || payload.iss) return cookie.value;
      } catch {}
    }
    if (['auth_token', 'token', 'access_token'].includes(cookie.name)) return cookie.value;
  }
  return null;
}

async function tryExtractToken(page) {
  const storageToken = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      result[key] = localStorage.getItem(key);
    }
    return result;
  }).catch(() => ({}));

  const foundStorage = extractTokenFromStorage(storageToken);
  if (foundStorage) return foundStorage;

  const cookies = await page.cookies().catch(() => []);
  return extractTokenFromCookies(cookies);
}

async function closeBrowser() {
  if (authBrowser) {
    try { await authBrowser.close(); } catch {}
    authBrowser = null;
    authPage = null;
  }
}

function storeToken(token) {
  authToken = token.startsWith('Bearer ') ? token.slice(7) : token;
  try {
    const payload = JSON.parse(Buffer.from(authToken.split('.')[1], 'base64').toString());
    tokenExpiry = payload.exp ? new Date(payload.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
  } catch {
    tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  saveToken(authToken, tokenExpiry);
}

export function login() {
  if (authToken && tokenExpiry && new Date() < tokenExpiry) {
    return { success: true, message: 'Already logged in.' };
  }
  return doLogin();
}

async function doLogin() {
  try {
    const pup = await getPuppeteer();

    authBrowser = await pup.default.launch({
      executablePath: EDGE_PATH,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--app=' + SVP_LOGIN_URL,
        '--window-size=480,650',
        '--window-position=400,100'
      ],
      defaultViewport: { width: 480, height: 650 }
    });

    const page = (await authBrowser.pages())[0] || await authBrowser.newPage();
    authPage = page;
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

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

    if (page.url() !== SVP_LOGIN_URL) {
      await page.goto(SVP_LOGIN_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    await new Promise(r => setTimeout(r, 2000));

    await page.evaluate((css) => {
      const style = document.createElement('style');
      style.id = 'site-disguise';
      style.textContent = css;
      document.head.appendChild(style);
      document.title = 'Exam Center Manager';
    }, MASK_CSS);

    const startTime = Date.now();
    const timeout = 5 * 60 * 1000;

    while (Date.now() - startTime < timeout) {
      if (capturedNetworkToken) {
        storeToken(capturedNetworkToken);
        try { await page.goto('https://svp-international.pacc.sa/home', { waitUntil: 'networkidle2', timeout: 20000 }); } catch {}
        return { success: true, message: 'Login successful.' };
      }

      const storageToken = await tryExtractToken(page);
      if (storageToken) {
        storeToken(storageToken);
        try { await page.goto('https://svp-international.pacc.sa/home', { waitUntil: 'networkidle2', timeout: 20000 }); } catch {}
        return { success: true, message: 'Login successful.' };
      }

      const currentUrl = page.url();
      const isDashboard =
        currentUrl.includes('dashboard') ||
        currentUrl.includes('/home') ||
        currentUrl.includes('/profile') ||
        (currentUrl.includes('svp-international') && !currentUrl.includes('/auth/'));

      if (isDashboard) {
        await new Promise(r => setTimeout(r, 2000));
        const retryToken = await tryExtractToken(page);
        if (retryToken || capturedNetworkToken) {
          storeToken(retryToken || capturedNetworkToken);
          try { await page.goto('https://svp-international.pacc.sa/home', { waitUntil: 'networkidle2', timeout: 20000 }); } catch {}
          return { success: true, message: 'Login successful.' };
        }
      }

      await new Promise(r => setTimeout(r, 1500));
    }

    await closeBrowser();
    return { success: false, error: 'Login timed out after 5 minutes.' };

  } catch (error) {
    await closeBrowser();
    return { success: false, error: error.message };
  }
}

export function getToken() {
  if (!authToken) {
    loadToken();
  }
  if (!authToken) return null;
  if (tokenExpiry && new Date() >= tokenExpiry) {
    authToken = null;
    tokenExpiry = null;
    return null;
  }
  return authToken.startsWith('Bearer ') ? authToken.slice(7) : authToken;
}

export function isLoggedIn() {
  return !!getToken();
}

export function logout() {
  authToken = null;
  tokenExpiry = null;
  try { writeFileSync(TOKEN_FILE, '{}', 'utf-8'); } catch {}
  try { writeFileSync(STORAGE_FILE, '{}', 'utf-8'); } catch {}
}

export async function authenticatedFetch(url, options = {}) {
  const token = getToken();
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': 'https://svp-international.pacc.sa',
    'Referer': 'https://svp-international.pacc.sa/',
    ...options.headers
  };
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    if (!headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers });
}

export async function shutdownAuth() {
  await closeBrowser();
  authToken = null;
  tokenExpiry = null;
}

let apiBrowser = null;
let apiPage = null;
let apiPageReady = false;

async function getApiPage() {
  if (apiPageReady && apiPage) {
    try {
      await apiPage.evaluate(() => 1);
      return apiPage;
    } catch {
      apiPageReady = false;
      apiBrowser = null;
      apiPage = null;
    }
  }
  if (apiBrowser) {
    try { await apiBrowser.close(); } catch {}
    apiBrowser = null;
    apiPage = null;
  }
  const pup = await getPuppeteer();
  apiBrowser = await pup.default.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled'
    ]
  });
  apiPage = await apiBrowser.newPage();
  await apiPage.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;
  });
  await apiPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await apiPage.goto('https://svp-international.pacc.sa/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 5000));
  apiPageReady = true;
  return apiPage;
}

async function closeApiBrowser() {
  if (apiBrowser) {
    try { await apiBrowser.close(); } catch {}
    apiBrowser = null;
    apiPage = null;
    apiPageReady = false;
  }
}

export async function browserFetch(url, options = {}) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated');
  const method = (options.method || 'GET').toUpperCase();

  let page;
  try {
    page = await getApiPage();
  } catch (err) {
    console.error('[svp-auth] browserFetch: failed to get page:', err.message);
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
    console.error('[svp-auth] browserFetch: evaluate failed, destroying page:', err.message);
    apiPageReady = false;
    try { await apiBrowser.close(); } catch {}
    apiBrowser = null;
    apiPage = null;
    throw err;
  }
}

async function ensureBrowserForSPA() {
  if (authPage) {
    try {
      await authPage.evaluate(() => 1);
      return { page: authPage, cleanup: async () => {} };
    } catch {
      authPage = null;
      authBrowser = null;
    }
  }

  const token = getToken();
  if (!token) throw new Error('Not authenticated');

  const pup = await getPuppeteer();
  const browser = await pup.default.launch({
    executablePath: EDGE_PATH,
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--window-size=480,650',
      '--window-position=400,100'
    ],
    defaultViewport: { width: 480, height: 650 }
  });

  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument((t) => {
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

  authBrowser = browser;
  authPage = page;

  return {
    page,
    cleanup: async () => {
      if (authBrowser === browser) {
        try { await browser.close(); } catch {}
        authBrowser = null;
        authPage = null;
      }
    }
  };
}

function extractTokenFromPageStorage(storage) {
  for (const key of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'svp_token']) {
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

async function clickByText(page, texts) {
  for (const text of texts) {
    const coords = await page.evaluate((t) => {
      const all = [...document.querySelectorAll('button, a, [role="button"], [type="submit"]')];
      for (const el of all) {
        const txt = (el.textContent || '').trim().toLowerCase();
        if (txt.includes(t.toLowerCase()) && !el.disabled && el.offsetParent !== null) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: el.textContent.trim() };
          }
        }
      }
      return null;
    }, text);
    if (coords) {
      await page.mouse.click(coords.x, coords.y);
      console.log(`[SPA] Clicked "${coords.text}" at (${Math.round(coords.x)}, ${Math.round(coords.y)})`);
      return { found: true, text: coords.text };
    }
  }
  return { found: false };
}

async function selectByText(page, selectIndex, optionTexts) {
  const selInfo = await page.evaluate((idx) => {
    const s = [...document.querySelectorAll('select')][idx];
    if (!s) return null;
    return { id: s.id, name: s.name, options: [...s.options].map(o => ({ v: o.value, t: o.text.trim() })) };
  }, selectIndex);

  if (!selInfo) return { found: false, reason: 'no select at index ' + selectIndex };

  for (const optText of optionTexts) {
    const match = selInfo.options.find(o => o.t.toLowerCase().includes(optText.toLowerCase()));
    if (match) {
      await page.select(`select${selInfo.id ? '#' + selInfo.id : selInfo.name ? `[name="${selInfo.name}"]` : ':nth-of-type(' + (selectIndex + 1) + ')'}`, match.value);
      console.log(`[SPA] Selected "${match.t}" (value="${match.value}") in select #${selectIndex}`);
      return { found: true, text: match.text, value: match.value };
    }
  }
  return { found: false, options: selInfo.options.map(o => o.t) };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function rescheduleViaSPA(sessionId, newDate, categoryId) {
  const { page, cleanup } = await ensureBrowserForSPA();
  let apiResponse = null;
  let capturedToken = null;

  const responseHandler = async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api') && url.includes('/api/v1/') && !url.includes('exam_reservations')) {
      try {
        const headers = response.headers();
        const authHeader = headers['authorization'] || headers['Authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          capturedToken = authHeader.replace('Bearer ', '');
        }
      } catch {}
    }
    if (url.includes('exam_reservations') && url.includes('reschedule') && !url.includes('available')) {
      try {
        const status = response.status();
        const body = await response.text();
        let data;
        try { data = JSON.parse(body); } catch { data = body; }
        apiResponse = { status, ok: status >= 200 && status < 300, data };
        console.log(`[SPA] >>> RESCHEDULE API RESPONSE: ${status} <<<`);
      } catch {}
    }
  };
  page.on('response', responseHandler);

  try {
    const spaUrl = `${SVP_BASE}/labor/reschedule/steps?reservationId=${sessionId}`;
    console.log(`[SPA] Navigating: ${spaUrl}`);
    await page.goto(spaUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    console.log(`[SPA] Landed on: ${page.url()}`);

    if (page.url().includes('/auth/')) {
      console.log('[SPA] Redirected to auth. Attempting token recovery...');
      const storageToken = await page.evaluate(() => {
        const r = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); r[k] = localStorage.getItem(k); }
        return r;
      }).catch(() => ({}));
      const found = extractTokenFromPageStorage(storageToken);
      if (found) storeToken(found);
      if (capturedToken) storeToken(capturedToken);
      if (found || capturedToken) {
        await page.goto(spaUrl, { waitUntil: 'networkidle2', timeout: 45000 });
        console.log(`[SPA] Reloaded to: ${page.url()}`);
      }
      if (page.url().includes('/auth/')) throw new Error('Token expired. Please login again.');
    }

    await sleep(5000);

    let pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`[SPA] === PAGE TEXT (first 1500 chars) ===\n${pageText.substring(0, 1500)}\n[SPA] === END PAGE TEXT ===`);

    let selects = await page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => ({
      i, id: s.id, name: s.name, disabled: s.disabled,
      opts: [...s.options].map(o => o.text.trim()).slice(0, 20)
    })));
    console.log(`[SPA] Found ${selects.length} select elements:`, JSON.stringify(selects));

    let buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
      i, text: b.textContent.trim().substring(0, 50), disabled: b.disabled, visible: b.offsetParent !== null
    })));
    console.log(`[SPA] Found ${buttons.length} buttons:`, JSON.stringify(buttons));

    console.log('[SPA] === STEP 1: Looking for Reschedule Appointment button ===');
    let r = await clickByText(page, ['reschedule appointment', 'reschedule', 'edit appointment', 'change appointment', 'modify appointment']);
    if (!r.found) {
      console.log('[SPA] No reschedule button found. Page might already be on the wizard step. Trying Next...');
      r = await clickByText(page, ['next', 'continue']);
    }
    console.log('[SPA] Step 1 result:', JSON.stringify(r));
    await sleep(5000);

    pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`[SPA] === AFTER STEP 1 (first 1500 chars) ===\n${pageText.substring(0, 1500)}\n[SPA] === END ===`);

    selects = await page.evaluate(() => [...document.querySelectorAll('select')].map((s, i) => ({
      i, id: s.id, name: s.name, disabled: s.disabled,
      opts: [...s.options].map(o => ({ v: o.value, t: o.text.trim() })).slice(0, 30)
    })));
    console.log(`[SPA] Step 2 selects:`, JSON.stringify(selects, null, 2));

    console.log('[SPA] === STEP 2: Select city and language ===');
    const cityTexts = ['cumilla', 'comilla', 'chattogram', 'chittagong', 'dhaka', 'khulna', 'rajshahi', 'sylhet', 'barishal', 'rangpur', 'mymensingh'];
    const langTexts = ['english', 'arabic', 'bangla', 'bengali'];

    for (let i = 0; i < selects.length; i++) {
      const opts = selects[i].opts;
      if (opts.length <= 1 || selects[i].disabled) continue;
      const isCity = opts.some(o => cityTexts.some(ct => o.t.toLowerCase().includes(ct)));
      const isLang = opts.some(o => langTexts.some(lt => o.t.toLowerCase().includes(lt)));
      if (isCity) {
        const res = await selectByText(page, i, cityTexts);
        console.log(`[SPA] City select #${i}:`, JSON.stringify(res));
      } else if (isLang) {
        const res = await selectByText(page, i, langTexts);
        console.log(`[SPA] Language select #${i}:`, JSON.stringify(res));
      }
    }

    await sleep(2000);

    buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
      i, text: b.textContent.trim().substring(0, 50), disabled: b.disabled, visible: b.offsetParent !== null
    })));
    console.log(`[SPA] Buttons after city/lang:`, JSON.stringify(buttons));

    console.log('[SPA] === STEP 2: Click Next ===');
    r = await clickByText(page, ['next', 'continue', 'proceed']);
    console.log('[SPA] Step 2 Next result:', JSON.stringify(r));
    await sleep(5000);

    pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`[SPA] === AFTER STEP 2 (first 1500 chars) ===\n${pageText.substring(0, 1500)}\n[SPA] === END ===`);

    console.log('[SPA] === STEP 3: Pick date ===');
    if (newDate) {
      const [yr, mn, dy] = newDate.split('-');
      const targetDay = parseInt(dy, 10);
      const targetMonth = parseInt(mn, 10);

      const dateClicked = await page.evaluate((day, month) => {
        const allClickable = [...document.querySelectorAll('button, td, div, span, a, li')];
        for (const el of allClickable) {
          const text = el.textContent.trim();
          if (text === String(day) && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text };
            }
          }
        }
        return null;
      }, targetDay, targetMonth);

      if (dateClicked) {
        await page.mouse.click(dateClicked.x, dateClicked.y);
        console.log(`[SPA] Clicked date ${dateClicked.text} at (${Math.round(dateClicked.x)}, ${Math.round(dateClicked.y)})`);
      } else {
        console.log('[SPA] Date element not found. Trying input...');
        await page.evaluate((dv) => {
          const inputs = [...document.querySelectorAll('input')];
          for (const inp of inputs) {
            if (inp.type === 'date' || (inp.placeholder && inp.placeholder.toLowerCase().includes('date'))) {
              const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
              setter.call(inp, dv);
              inp.dispatchEvent(new Event('input', { bubbles: true }));
              inp.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }
        }, newDate);
        console.log(`[SPA] Set date input to ${newDate}`);
      }
    }

    await sleep(2000);

    buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
      i, text: b.textContent.trim().substring(0, 50), disabled: b.disabled, visible: b.offsetParent !== null
    })));
    console.log(`[SPA] Buttons after date:`, JSON.stringify(buttons));

    console.log('[SPA] === STEP 3: Click Next ===');
    r = await clickByText(page, ['next', 'continue', 'proceed']);
    console.log('[SPA] Step 3 Next result:', JSON.stringify(r));
    await sleep(5000);

    pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`[SPA] === AFTER STEP 3 (first 1500 chars) ===\n${pageText.substring(0, 1500)}\n[SPA] === END ===`);

    buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b, i) => ({
      i, text: b.textContent.trim().substring(0, 50), disabled: b.disabled, visible: b.offsetParent !== null
    })));
    console.log(`[SPA] Buttons on confirm page:`, JSON.stringify(buttons));

    console.log('[SPA] === STEP 4: Confirm ===');
    r = await clickByText(page, ['confirm', 'submit', 'yes', 'ok', 'reschedule']);
    console.log('[SPA] Step 4 confirm result:', JSON.stringify(r));
    await sleep(3000);

    const secondConfirm = await clickByText(page, ['confirm', 'yes', 'ok']);
    if (secondConfirm.found) {
      console.log('[SPA] Step 4 second confirm:', JSON.stringify(secondConfirm));
      await sleep(3000);
    }

    console.log('[SPA] Waiting for API response (up to 25s)...');
    for (let i = 0; i < 25 && !apiResponse; i++) {
      await sleep(1000);
    }

    if (capturedToken) storeToken(capturedToken);

    if (!apiResponse) {
      pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
      console.log(`[SPA] === FINAL PAGE (first 2000 chars) ===\n${pageText.substring(0, 2000)}\n[SPA] === END ===`);
      if (pageText.toLowerCase().includes('success') || pageText.toLowerCase().includes('rescheduled')) {
        return { status: 200, ok: true, data: { message: 'Reschedule appears successful (detected from page content)' } };
      }
    }

    return apiResponse || { error: 'No API response captured' };
  } finally {
    page.off('response', responseHandler);
  }
}

export async function cancelViaSPA(sessionId, reason) {
  const { page, cleanup } = await ensureBrowserForSPA();
  let apiResponse = null;
  let capturedToken = null;

  const responseHandler = async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api') && url.includes('/api/v1/') && !url.includes('exam_reservations')) {
      try {
        const headers = response.headers();
        const authHeader = headers['authorization'] || headers['Authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
          capturedToken = authHeader.replace('Bearer ', '');
        }
      } catch {}
    }
    if (url.includes('exam_reservations') && url.includes('cancel')) {
      try {
        const status = response.status();
        const body = await response.text();
        let data;
        try { data = JSON.parse(body); } catch { data = body; }
        apiResponse = { status, ok: status >= 200 && status < 300, data };
        console.log(`[SPA-cancel] Captured: ${status}`);
      } catch {}
    }
  };
  page.on('response', responseHandler);

  try {
    const spaUrl = `${SVP_BASE}/labor/reschedule/steps?reservationId=${sessionId}`;
    console.log(`[SPA-cancel] Navigating: ${spaUrl}`);
    await page.goto(spaUrl, { waitUntil: 'networkidle2', timeout: 45000 });
    console.log(`[SPA-cancel] Landed: ${page.url()}`);

    if (page.url().includes('/auth/')) {
      const storageToken = await page.evaluate(() => {
        const r = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); r[k] = localStorage.getItem(k); }
        return r;
      }).catch(() => ({}));
      const found = extractTokenFromPageStorage(storageToken);
      if (found) storeToken(found);
      if (capturedToken) storeToken(capturedToken);
      if (found || capturedToken) {
        await page.goto(spaUrl, { waitUntil: 'networkidle2', timeout: 45000 });
      }
      if (page.url().includes('/auth/')) throw new Error('Token expired');
    }

    await sleep(5000);

    const pageText = await page.evaluate(() => document.body?.innerText || '').catch(() => '');
    console.log(`[SPA-cancel] Page: ${pageText.substring(0, 1500)}`);

    if (reason) {
      await page.evaluate((r) => {
        const ta = document.querySelector('textarea');
        if (ta) {
          const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
          setter.call(ta, r);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, reason);
    }

    await clickByText(page, ['cancel', 'confirm', 'submit']);
    await sleep(3000);
    await clickByText(page, ['confirm', 'yes', 'ok']);
    await sleep(3000);

    for (let i = 0; i < 25 && !apiResponse; i++) await sleep(1000);
    if (capturedToken) storeToken(capturedToken);
    return apiResponse || { error: 'No API response captured' };
  } finally {
    page.off('response', responseHandler);
  }
}

export async function shutdownBrowserApi() {
  await closeApiBrowser();
}

// Exposes the already-authenticated SPA page (if any) so debug tooling can
// drive the real wizard and capture its network calls.
export function getAuthPage() {
  return authPage || null;
}

export function isAuthPageAlive() {
  if (!authPage) return false;
  return authPage.evaluate(() => 1).then(() => true, () => false);
}

process.on('SIGTERM', () => { shutdownAuth(); shutdownBrowserApi(); });
process.on('SIGINT', () => { shutdownAuth(); shutdownBrowserApi(); });