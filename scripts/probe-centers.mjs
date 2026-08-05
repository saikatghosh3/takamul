import { chromium } from 'playwright';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const API = 'https://svp-international-api.pacc.sa/api/v1';
const TOKEN_FILE = join(process.cwd(), '.svp-token.json');
const STORAGE_FILE = join(process.cwd(), '.svp-storage.json');

const CATEGORY = 160;
const RESERVATION = 5022212;
const DATE = '2026-08-09';

async function main() {
  const token = readFileSync(TOKEN_FILE, 'utf-8');
  const storage = JSON.parse(readFileSync(STORAGE_FILE, 'utf-8'));
  const browser = await chromium.launch({
    channel: 'msedge', headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled']
  });
  const context = await browser.newContext({
    storageState: storage,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto('https://svp-international.pacc.sa', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  async function apiGet(path) {
    const result = await page.evaluate(async ({ api, path, token }) => {
      const res = await fetch(`${api}/${path}`, {
        headers: { 'Accept': 'application/json', 'Authorization': `Bearer ${token}` }
      });
      const text = await res.text();
      let data; try { data = JSON.parse(text); } catch { data = text; }
      return { status: res.status, data };
    }, { api: API, path, token });
    return result;
  }

  function sum(sessions) {
    return (sessions || []).map(s => ({
      id: (s.id || '').slice(0, 10) + '…',
      city: s.test_center?.city || null,
      date: s.start_date_in_tc_time_zone || null,
      tc: s.test_center ? JSON.stringify(s.test_center) : null
    }));
  }

  console.log('=== A: exam_sessions token sets by test_center_id ===');
  const queries = {
    'no-center      ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&available_seats=greater_than::0&country_id=78`,
    'center-174     ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&test_center_id=174&available_seats=greater_than::0&country_id=78`,
    'center-203     ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&test_center_id=203&available_seats=greater_than::0&country_id=78`,
    'center-174+res ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&test_center_id=174&reservation_id=${RESERVATION}&available_seats=greater_than::0&country_id=78`,
    'center-203+res ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&test_center_id=203&reservation_id=${RESERVATION}&available_seats=greater_than::0&country_id=78`,
    'res-only       ': `individual_labor_space/exam_sessions?category_id=${CATEGORY}&exam_date=${DATE}&reservation_id=${RESERVATION}&available_seats=greater_than::0&country_id=78`
  };
  const sets = {};
  for (const [name, path] of Object.entries(queries)) {
    const { status, data } = await apiGet(path);
    const sessions = data.exam_sessions || data.sessions || data.data || [];
    console.log(`\n[${name}] status=${status} count=${sessions.length}`);
    console.log(JSON.stringify(sum(summarizeSessions(sessions)), null, 2));
    sets[name] = (sessions || []).map(s => s.id);
  }

  function summarizeSessions(s) { return s; }

  console.log('\n=== OVERLAP ===');
  const keys = Object.keys(sets);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = sets[keys[i]], b = sets[keys[j]];
      const shared = a.filter(x => b.includes(x)).length;
      console.log(`${keys[i]} vs ${keys[j]}: shared=${shared}`);
    }
  }

  console.log('\n=== B: exam_sessions/{token} detail reveals center? ===');
  const firstToken = Object.values(sets).flat()[0];
  if (firstToken) {
    const { status, data } = await apiGet(`individual_labor_space/exam_sessions/${firstToken}`);
    console.log(`status=${status}`);
    console.log(JSON.stringify(data, null, 2).substring(0, 3000));
  }

  console.log('\n=== C: test_centers in Cumilla-ish region ===');
  const tc = await apiGet(`visitor_space/test_centers?country_id=78&category_id=${CATEGORY}&per_page=10000`);
  const centers = tc.data.test_centers || [];
  console.log(`total=${centers.length} status=${tc.status}`);
  for (const c of centers.filter(c => ['Cumilla', 'Brahmanbaria', 'Noakhali', 'Comilla'].some(k => (c.city || '').toLowerCase().includes(k.toLowerCase())))) {
    console.log(`  id=${c.id} name=${c.name} city=${c.city}`);
  }

  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(3); });
