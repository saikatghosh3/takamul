const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://svp-international.pacc.sa',
    'Referer': 'https://svp-international.pacc.sa/'
  };

  const catId = process.argv[2] || '159';
  const centerId = process.argv[3] || '174';

  // ── 1. Test test_center_id filter on exam_sessions ──
  console.log(`\n=== exam_sessions with test_center_id=${centerId} (category ${catId}) ===`);
  const r1 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000&test_center_id=${centerId}`, { headers });
  const d1 = await r1.json();
  const s1 = d1.exam_sessions || [];
  console.log(`Status: ${r1.status}, sessions: ${s1.length}`);
  const cities = {};
  for (const s of s1) {
    const c = s.test_center?.city || '?';
    cities[c] = (cities[c] || 0) + 1;
  }
  console.log('Cities in result:', JSON.stringify(cities));
  if (s1.length > 0) {
    console.log('First session test_center:', JSON.stringify(s1[0].test_center));
    console.log('First session id (type):', typeof s1[0].id, s1[0].id);
  }
  fs.writeFileSync('debug-filtered-sessions.json', JSON.stringify(s1, null, 2));

  // ── 2. Same WITHOUT filter (for comparison) ──
  console.log(`\n=== exam_sessions WITHOUT filter (category ${catId}) ===`);
  const r2 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000`, { headers });
  const d2 = await r2.json();
  const s2 = d2.exam_sessions || [];
  console.log(`Status: ${r2.status}, sessions: ${s2.length}`);
  const cities2 = {};
  for (const s of s2) {
    const c = s.test_center?.city || '?';
    cities2[c] = (cities2[c] || 0) + 1;
  }
  console.log('Cities in result:', JSON.stringify(cities2));

  // ── 3. Test test_center_id on available_dates ──
  console.log(`\n=== available_dates with test_center_id=${centerId} (category ${catId}) ===`);
  const r3 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000&test_center_id=${centerId}`, { headers });
  const d3 = await r3.json();
  const ad3 = d3.available_dates || d3.data || [];
  console.log(`Status: ${r3.status}, dates: ${ad3.length}`);
  if (ad3.length > 0) {
    console.log('First item:', JSON.stringify(ad3[0]).substring(0, 800));
  }

  // ── 4. available_dates WITHOUT filter — check test_center structure ──
  console.log(`\n=== available_dates WITHOUT filter (category ${catId}) ===`);
  const r4 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000`, { headers });
  const d4 = await r4.json();
  const ad4 = d4.available_dates || d4.data || [];
  console.log(`Status: ${r4.status}, dates: ${ad4.length}`);
  if (ad4.length > 0) {
    console.log('First item keys:', Object.keys(ad4[0]).join(', '));
    console.log('First item:', JSON.stringify(ad4[0]).substring(0, 800));
    fs.writeFileSync('debug-available-dates-full.json', JSON.stringify(ad4, null, 2));
  }
}

main().catch(console.error);
