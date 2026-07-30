/**
 * Explore where session TIME info comes from in the SVP API.
 *
 * Two approaches:
 *  1. Direct API calls to various endpoints (using the saved token)
 *  2. Managed browser → navigate SVP booking page → intercept ALL API responses
 */

const fs = require('fs');
const path = require('path');

const SVP_BASE = 'https://svp-international.pacc.sa';
const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

// ─── Helpers ──────────────────────────────────────────────────────

function loadToken() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const data = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
  return data.token;
}

function authHeaders(token) {
  return {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': SVP_BASE,
    'Referer': `${SVP_BASE}/`
  };
}

function findTime(s) {
  const fields = [
    'test_time', 'start_time', 'time', 'time_slot',
    'start_time_in_tc_time_zone', 'start_time_in_browser_time_zone',
    'test_time_in_tc_time_zone',
    'exam_session.test_time', 'exam_session.start_time',
    'exam_session.test_time_in_tc_time_zone',
    'exam_session.start_date_in_tc_time_zone',
    'schedule.test_time', 'schedule.test_time_in_tc_time_zone',
    'schedule.start_date_in_tc_time_zone'
  ];
  for (const f of fields) {
    const val = f.split('.').reduce((o, k) => o?.[k], s);
    if (val) return { field: f, value: val };
  }
  // Check datetime strings for embedded time
  const dtFields = [
    'start_date_in_tc_time_zone', 'start_date_in_browser_time_zone',
    'end_date_in_tc_time_zone', 'exam_date_time',
    'exam_session.start_date_in_tc_time_zone', 'exam_session.end_date_in_tc_time_zone',
    'schedule.start_date_in_tc_time_zone'
  ];
  for (const f of dtFields) {
    const val = f.split('.').reduce((o, k) => o?.[k], s);
    if (val && String(val).includes('T')) {
      const m = String(val).match(/T(\d{2}:\d{2})/);
      if (m) return { field: `${f} (extracted)`, value: m[1] };
    }
  }
  return null;
}

function deepFindTime(obj, path_ = '', depth = 0) {
  if (depth > 8) return null;
  if (!obj || typeof obj !== 'object') return null;
  
  const timeKeys = ['test_time', 'start_time', 'time', 'time_slot', 
    'test_time_in_tc_time_zone', 'start_time_in_tc_time_zone',
    'start_time_in_browser_time_zone', 'end_time', 'exam_time',
    'appointment_time'];
  
  for (const key of timeKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return { path: path_ ? `${path_}.${key}` : key, value: obj[key] };
    }
  }
  
  // Also check for datetime strings
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string' && value.includes('T') && /\d{2}:\d{2}/.test(value)) {
      const m = value.match(/T(\d{2}:\d{2})/);
      if (m) return { path: path_ ? `${path_}.${key} (extracted)` : `${key} (extracted)`, value: m[1] };
    }
  }
  
  // Recursively search
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      const result = deepFindTime(value, path_ ? `${path_}.${key}` : key, depth + 1);
      if (result) return result;
    }
  }
  
  return null;
}

// ─── Approach 1: Direct API calls ────────────────────────────────

async function tryDirectAPI(token) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  APPROACH 1: DIRECT API CALLS');
  console.log('═══════════════════════════════════════════════════\n');

  const categoryId = process.argv[2] || '1';
  const testDate = process.argv[3] || '';
  const city = process.argv[4] || '';
  const headers = authHeaders(token);

  // 1a. available_dates endpoint (this is what the SPA uses for calendar)
  console.log('─── 1a. available_dates ───');
  {
    let url = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=10000`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    console.log('GET', url);
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log('Status:', res.status, 'Top-level keys:', Object.keys(data));
    const items = data.available_dates || data.dates || data.data || [];
    console.log(`Items: ${items.length}`);
    
    if (items.length > 0) {
      const first = items[0];
      console.log('First item keys:', Object.keys(first));
      const time = findTime(first);
      console.log('First item time:', time ? JSON.stringify(time) : 'NONE FOUND');
      const deepTime = deepFindTime(first);
      console.log('First item deep time search:', deepTime ? JSON.stringify(deepTime) : 'NONE FOUND');
      
      // Count items with times
      let withTime = 0;
      for (const item of items) {
        if (findTime(item)) withTime++;
      }
      console.log(`Items with time info: ${withTime}/${items.length}`);
      
      // Show first 3 items with time info
      let shown = 0;
      for (const item of items) {
        const t = findTime(item);
        if (t) {
          console.log(`  Item ${shown}: time=${JSON.stringify(t.value)}, id=${item.id || item.exam_session_id || '?'}, center=${item.test_center?.test_center_name || item.test_center?.name || '?'}`);
          shown++;
          if (shown >= 3) break;
        }
      }
      
      // Show raw first item
      console.log('\nFirst item (truncated):', JSON.stringify(first).substring(0, 1500));
    }
    
    fs.writeFileSync('debug-available-dates.json', JSON.stringify(data, null, 2));
    console.log('Saved to debug-available-dates.json\n');
  }

  // 1b. exam_sessions with date+city (this is what the booking page shows)
  console.log('─── 1b. exam_sessions (with date+city) ───');
  {
    let url = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=10000`;
    if (testDate) url += `&date=${encodeURIComponent(testDate)}`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    console.log('GET', url);
    const res = await fetch(url, { headers });
    const data = await res.json();
    console.log('Status:', res.status, 'Top-level keys:', Object.keys(data));
    const sessions = data.exam_sessions || data.sessions || data.data || [];
    console.log(`Sessions: ${sessions.length}`);
    
    if (sessions.length > 0) {
      const first = sessions[0];
      console.log('First session keys:', Object.keys(first));
      const time = findTime(first);
      console.log('First session time:', time ? JSON.stringify(time) : 'NONE FOUND');
      const deepTime = deepFindTime(first);
      console.log('First session deep time search:', deepTime ? JSON.stringify(deepTime) : 'NONE FOUND');
      
      let withTime = 0;
      for (const s of sessions) { if (findTime(s)) withTime++; }
      console.log(`Sessions with time info: ${withTime}/${sessions.length}`);
    }
    
    fs.writeFileSync('debug-exam-sessions.json', JSON.stringify(data, null, 2));
    console.log('Saved to debug-exam-sessions.json\n');
  }

  // 1c. Try individual session endpoint
  console.log('─── 1c. exam_sessions/{id} (individual) ───');
  {
    // First get a session ID from the list
    const listUrl = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=1`;
    const listRes = await fetch(listUrl, { headers });
    const listData = await listRes.json();
    const listSessions = listData.exam_sessions || listData.sessions || listData.data || [];
    
    if (listSessions.length > 0) {
      const sessionId = listSessions[0].id || listSessions[0].exam_session_id;
      if (sessionId) {
        const url = `${API_BASE}/individual_labor_space/exam_sessions/${sessionId}`;
        console.log('GET', url);
        const res = await fetch(url, { headers });
        console.log('Status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('Top-level keys:', Object.keys(data));
          const time = deepFindTime(data);
          console.log('Time found:', time ? JSON.stringify(time) : 'NONE');
          console.log('Full response:', JSON.stringify(data).substring(0, 2000));
        } else {
          const text = await res.text();
          console.log('Response:', text.substring(0, 500));
        }
      }
    } else {
      console.log('No sessions found to get individual');
    }
    console.log('');
  }

  // 1d. exam_sessions with test_center_id (if available)
  console.log('─── 1d. exam_sessions with test_center_id ───');
  {
    // Try to get a test center first
    const centersUrl = `${API_BASE}/individual_labor_space/test_centers/cities?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=1`;
    const centersRes = await fetch(centersUrl, { headers });
    const centersData = await centersRes.json();
    const cities = centersData.cities || centersData.data || [];
    
    if (cities.length > 0) {
      const firstCity = typeof cities[0] === 'string' ? cities[0] : (cities[0].city || cities[0].name || cities[0].english_name);
      
      // Try with city and test_center_id
      const tcUrl = `${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&category_id=${categoryId}&per_page=1`;
      const tcRes = await fetch(tcUrl, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } });
      const tcData = await tcRes.json();
      const tCenters = tcData.test_centers || [];
      
      if (tCenters.length > 0) {
        const tcId = tCenters[0].id;
        let url = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}&test_center_id=${tcId}`;
        if (testDate) url += `&date=${encodeURIComponent(testDate)}`;
        console.log('GET', url);
        const res = await fetch(url, { headers });
        console.log('Status:', res.status);
        if (res.ok) {
          const data = await res.json();
          console.log('Top-level keys:', Object.keys(data));
          const sessions = data.exam_sessions || data.sessions || data.data || [];
          console.log(`Sessions: ${sessions.length}`);
          if (sessions.length > 0) {
            const time = findTime(sessions[0]);
            console.log('First session time:', time ? JSON.stringify(time) : 'NONE');
          }
        } else {
          console.log('Response:', (await res.text()).substring(0, 500));
        }
      }
    }
    console.log('');
  }

  // 1e. Try browserFetch from the Playwright module (goes through browser)
  console.log('─── 1e. Try browserFetch (Playwright context) ───');
  try {
    const { browserFetch } = await import('../src/lib/svp-playwright.js');
    let url = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=5`;
    if (testDate) url += `&date=${encodeURIComponent(testDate)}`;
    console.log('GET (via browser)', url);
    const result = await browserFetch(url, { method: 'GET' });
    console.log('Status:', result.status, 'OK:', result.ok);
    if (result.data) {
      const sessions = result.data.exam_sessions || result.data.sessions || result.data.data || [];
      console.log(`Sessions: ${Array.isArray(sessions) ? sessions.length : '?'}`);
      if (Array.isArray(sessions) && sessions.length > 0) {
        console.log('First session keys:', Object.keys(sessions[0]));
        const time = findTime(sessions[0]);
        console.log('Time:', time ? JSON.stringify(time) : 'NONE FOUND');
      }
    }
  } catch (e) {
    console.log('browserFetch failed:', e.message);
    console.log('(Token may be expired - need to re-login)');
  }
  console.log('');

  // 1f. Also check the available_dates response for embedded time in datetime fields
  console.log('─── 1f. available_dates - detailed datetime field analysis ───');
  {
    let url = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${categoryId}&country_id=${BANGLADESH_ID}&per_page=10000`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    const res = await fetch(url, { headers });
    const data = await res.json();
    const items = data.available_dates || data.dates || data.data || [];
    
    // Check ALL possible datetime fields
    const dateTimeFields = [
      'start_date_in_tc_time_zone', 'start_date_in_browser_time_zone',
      'end_date_in_tc_time_zone', 'end_date_in_browser_time_zone',
      'start_date', 'end_date', 'exam_date_time', 'exam_session_date',
      'exam_session.start_date_in_tc_time_zone',
      'exam_session.start_date', 'exam_session.end_date_in_tc_time_zone',
      'exam_session.date', 'exam_session.test_date',
      'schedule.start_date_in_tc_time_zone', 'schedule.start_date',
      'schedule.test_date',
      'test_center.start_time', 'test_center.end_time',
      'test_center.operating_hours'
    ];
    
    if (items.length > 0) {
      console.log(`Analyzing ${Math.min(items.length, 5)} items for datetime fields with time component:`);
      for (let i = 0; i < Math.min(items.length, 5); i++) {
        const item = items[i];
        console.log(`\nItem ${i} (id=${item.id || item.exam_session_id || '?'}):`);
        for (const f of dateTimeFields) {
          const val = f.split('.').reduce((o, k) => o?.[k], item);
          if (val !== undefined && val !== null) {
            const hasTime = String(val).includes('T');
            console.log(`  ${f} = "${String(val).substring(0, 80)}"${hasTime ? ' ← HAS TIME' : ''}`);
          }
        }
      }
    }
  }
}

// ─── Approach 2: Managed browser interception ────────────────────

async function tryBrowserInterception(token) {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  APPROACH 2: MANAGED BROWSER + INTERCEPTION');
  console.log('═══════════════════════════════════════════════════\n');

  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,900']
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 900 }
    });

    // Inject token
    await context.addInitScript((t) => {
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

    const page = await context.newPage();
    const apiResponses = [];
    const timeResponses = [];

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('svp-international-api') || url.includes('pacc.sa/api')) {
        const status = response.status();
        const method = response.request().method();
        let body = null;
        try { 
          body = await response.text();
        } catch {}
        
        const entry = {
          url, method, status,
          bodyLength: body ? body.length : 0,
          bodySnippet: body ? body.substring(0, 500) : null
        };
        apiResponses.push(entry);
        
        // Check if response contains time info
        if (body && (body.includes('test_time') || body.includes('start_time') || body.includes('"time"'))) {
          timeResponses.push(entry);
          console.log(`\n>>> TIME INFO FOUND in ${method} ${status} ${url}`);
          console.log(`Body (first 800): ${body.substring(0, 800)}`);
        }
        
        console.log(`[API] ${method} ${status} ${url.replace('https://svp-international-api.pacc.sa', '')} (${(body||'').length}B)`);
      }
    });

    // Navigate to home page first (like ensureManagedBrowser does)
    console.log('Navigating to SVP home...');
    await page.goto(SVP_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(3000);
    console.log(`Landed: ${page.url()}`);

    // If redirected to auth, try reloading
    if (page.url().includes('/auth/')) {
      console.log('Redirected to auth page. Token might be expired.');
      console.log('Trying to reload with token...');
      await page.goto(`${SVP_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      console.log(`After reload: ${page.url()}`);
    }

    // Now navigate to a booking page to trigger API calls
    // The SVP booking URL pattern: /labor/booking/steps (or similar)
    const categoryId = process.argv[2] || '1';

    // Try navigating to the booking wizard directly
    // First, let's try the general labor booking page
    console.log(`\nNavigating to booking page (category=${categoryId})...`);
    
    const bookingUrls = [
      `${SVP_BASE}/labor/booking/steps?categoryId=${categoryId}`,
      `${SVP_BASE}/labor/booking/steps`,
      `${SVP_BASE}/labor/booking`,
      `${SVP_BASE}/labor/exam`,
      `${SVP_BASE}/labor/dashboard`,
    ];

    for (const url of bookingUrls) {
      console.log(`\nTrying: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      console.log(`URL: ${page.url()}`);
      
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || '').catch(() => '');
      console.log(`Body text: ${bodyText.substring(0, 300)}`);
      
      // Check if we landed on a non-auth page
      if (!page.url().includes('/auth/') && !page.url().includes('login')) {
        // Wait for network to settle and capture API calls
        await page.waitForTimeout(5000);
        
        // Try to interact with the page - find dropdowns and select values
        const selects = await page.evaluate(() => {
          return [...document.querySelectorAll('select')].map((s, i) => ({
            index: i, id: s.id, name: s.name, disabled: s.disabled,
            optionCount: s.options.length,
            firstOptions: [...s.options].slice(0, 5).map(o => o.text.trim())
          }));
        });
        console.log(`Selects: ${JSON.stringify(selects)}`);
        
        // Try to find and click any "Search" or "Find" button
        const buttons = await page.evaluate(() => {
          return [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
            text: b.textContent.trim().substring(0, 50),
            disabled: b.disabled,
            className: (b.className || '').substring(0, 60)
          }));
        });
        console.log(`Visible buttons: ${JSON.stringify(buttons)}`);
        
        if (page.url().includes('booking') || page.url().includes('steps')) {
          // This is the booking page - let's try interacting with it
          // Select first non-disabled select option to trigger data load
          for (const sel of selects) {
            if (!sel.disabled && sel.optionCount > 1) {
              const optionValue = await page.evaluate((idx) => {
                const s = document.querySelectorAll('select')[idx];
                if (!s || s.options.length < 2) return null;
                for (let i = 1; i < s.options.length; i++) {
                  if (s.options[i].value) return s.options[i].value;
                }
                return null;
              }, sel.index);
              
              if (optionValue) {
                console.log(`Selecting option value="${optionValue}" in select #${sel.index}`);
                const selector = sel.id ? `#${sel.id}` : `select:nth-of-type(${sel.index + 1})`;
                await page.selectOption(selector, optionValue);
                await page.waitForTimeout(3000);
              }
            }
          }
          
          // Wait a bit more for API calls to complete
          await page.waitForTimeout(5000);
        }
        
        break; // Don't try more URLs
      }
    }

    // Print summary of API calls with time info
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  API CALLS THAT INCLUDE TIME INFO:');
    console.log('═══════════════════════════════════════════════════');
    if (timeResponses.length === 0) {
      console.log('  NONE FOUND - ALL responses lack time info');
    } else {
      for (const tr of timeResponses) {
        console.log(`  ${tr.method} ${tr.status} ${tr.url}`);
        console.log(`  Body: ${tr.bodySnippet}`);
        console.log('');
      }
    }

    // Save all API calls for analysis
    const output = {
      timestamp: new Date().toISOString(),
      totalApiCalls: apiResponses.length,
      timeInfoFound: timeResponses.length,
      timeResponses,
      allApiCalls: apiResponses.map(r => ({ method: r.method, status: r.status, url: r.url, bodyLength: r.bodyLength }))
    };
    fs.writeFileSync('debug-browser-api-calls.json', JSON.stringify(output, null, 2));
    console.log('\nAll API calls saved to debug-browser-api-calls.json');
    console.log(`Total API calls intercepted: ${apiResponses.length}`);

    await browser.close();
  } catch (e) {
    console.error('Browser interception failed:', e.message);
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  const token = loadToken();
  const tokenPreview = token ? token.substring(0, 30) + '...' : 'NONE';
  console.log(`Token: ${tokenPreview}`);
  console.log(`Args: categoryId=${process.argv[2] || '1'}, date=${process.argv[3] || '(none)'}, city=${process.argv[4] || '(none)'}`);

  // Approach 1: Direct API calls
  await tryDirectAPI(token);

  // Approach 2: Browser interception
  const useBrowser = process.argv.includes('--browser') || process.argv.includes('-b');
  if (useBrowser) {
    await tryBrowserInterception(token);
  } else {
    console.log('\n(Add --browser flag to also launch browser interception)');
    console.log('Usage: node scripts/explore-times.js [categoryId] [date] [city] [--browser]');
  }

  console.log('\nDone.');
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
