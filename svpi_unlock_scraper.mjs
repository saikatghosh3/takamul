import { readFileSync, writeFileSync } from 'fs';
import { decryptPayload, encryptJson } from './src/lib/svpi-crypto.js';

// ─────────────────────────────────────────────────────────────────────────
//  SVPI read-only center-unlock scraper (accurate version)
//
//  WARNING — 2026-08-15: the assumption documented below was DISPROVEN live.
//  exam_sessions token sets rotate per request AND can overlap centers: a query
//  scoped to test_center_id=174 returned a token that SVPI then assigned to
//  center 62 (Cumilla TTC) on reschedule. So a token captured here is NOT
//  guaranteed to book the center it was captured under, and unlock-state.json
//  becomes stale the moment tokens rotate. Treat any snapshot produced by this
//  scraper as historical, not authoritative. The API routes verify the assigned
//  center after booking instead (see /api/exam/reschedule and /api/exam/rebook).
//
//  SAFETY: read-only GETs only. No reservation is created, cancelled or changed.
// ─────────────────────────────────────────────────────────────────────────

const KEY = 'j/Y+VttEnyGYsThsvEPxFr6GxwuvE8GSxbwCHPtmucI=';
const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const COUNTRY_ID = 78;
const TOKEN_FILE = process.cwd() + '\\.svp-token.json';

const args = process.argv.slice(2);
const CATEGORY_ID = args[0] ? Number(args[0]) : 160;
const EXAM_DATE = args[1] || '2026-08-18';
const CITY = args[2] || null;               // optional: probe only centers in this city
const CENTER_IDS = (args[3] || '').split(',').map(s => Number(s)).filter(Boolean);
const SAVE_ENCRYPTED = args.includes('--save-encrypted');

const { token } = JSON.parse(readFileSync(TOKEN_FILE, 'utf-8'));
const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Origin': 'https://svp-international.pacc.sa',
  'Referer': 'https://svp-international.pacc.sa/',
  'Authorization': `Bearer ${token}`
};

async function get(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: HEADERS });
  let data; try { data = await res.json(); } catch { data = await res.text(); }
  return { status: res.status, ok: res.ok, data };
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Category
const catsRes = await get('/visitor_space/categories?per_page=10000&locale=en');
const categories = (catsRes.data.categories || []);
const cat = categories.find(c => c.id === CATEGORY_ID);
if (!cat) { console.error(`Category ${CATEGORY_ID} not found`); process.exit(1); }
console.log(`Category: ${cat.id} — ${cat.english_name}`);

// 2. Full test-center list (pagination!) -> id/name/city map
const centersAll = [];
const seen = new Set();
for (let page = 1; page <= 40; page++) {
  const r = await get(`/visitor_space/test_centers?country_id=${COUNTRY_ID}&per_page=100&page=${page}&locale=en`);
  const list = r.data.test_centers || r.data || [];
  if (!list.length) break;
  for (const c of list) { if (!seen.has(c.id)) { seen.add(c.id); centersAll.push(c); } }
  const pages = r.data.pagination?.pages;
  if (pages && page >= pages) break;
  if (!pages && list.length < 100) break;
}
console.log(`Total test centers: ${centersAll.length}`);

// 3. Pick target centers
let targets = centersAll;
if (CENTER_IDS.length) targets = centersAll.filter(c => CENTER_IDS.includes(c.id));
else if (CITY) targets = centersAll.filter(c => String(c.city || '').toLowerCase() === String(CITY).toLowerCase());
console.log(`Probing ${targets.length} centers on ${EXAM_DATE}...\n`);

// 4. Per-center unlock: query with BOTH city and test_center_id
const unlocked = [];
for (const c of targets) {
  const params = new URLSearchParams({
    category_id: String(CATEGORY_ID),
    exam_date: EXAM_DATE,
    city: c.city,
    test_center_id: String(c.id),
    available_seats: 'greater_than::0'
  });
  const r = await get(`/individual_labor_space/exam_sessions?${params.toString()}`);
  if (!r.ok) { console.log(`  ! ${c.name}: HTTP ${r.status} — ${JSON.stringify(r.data).substring(0,80)}`); await sleep(400); continue; }
  const sessions = r.data.exam_sessions || r.data.sessions || r.data.data || [];
  for (const s of sessions) {
    unlocked.push({
      encrypted_session_id: s.id,
      session_id: null,
      resolved: true,
      exam_date: s.start_date_in_browser_time_zone || s.exam_date,
      center_name: c.name,
      center_city: c.city,
      available_seats: s.available_seats ?? null,
      status: s.status,
      category: { id: cat.id, english_name: cat.english_name },
      verify_fail_count: 0
    });
  }
  console.log(`  ${c.name} (${c.id}, ${c.city}): ${sessions.length} session(s)`);
  await sleep(300);
}

unlocked.sort((a, b) => a.center_name.localeCompare(b.center_name));

console.log(`\n==== UNLOCKED CENTERS: ${cat.english_name} on ${EXAM_DATE} ====`);
const byCenter = {};
for (const u of unlocked) {
  (byCenter[u.center_name] = byCenter[u.center_name] || []).push(u);
}
for (const [name, list] of Object.entries(byCenter)) {
  console.log(`\n  ${name} (${list[0].center_city}) — ${list.length} bookable session(s)`);
  for (const u of list) console.log(`    token=${u.encrypted_session_id}`);
}

if (SAVE_ENCRYPTED) {
  const enc = await encryptJson(KEY, { sessions: unlocked, total: unlocked.length });
  const payload = [{ p: enc.p, iv: enc.iv }];
  writeFileSync(process.cwd() + '\\unlock-state.json', JSON.stringify(payload, null, 2));
  const check = await decryptPayload(KEY, payload[0]);
  const ok = JSON.stringify(check) === JSON.stringify({ sessions: unlocked, total: unlocked.length });
  console.log(`\nSaved unlock-state.json (encrypted). Round-trip verify: ${ok ? 'OK' : 'MISMATCH'}`);
}
