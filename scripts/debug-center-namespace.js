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

  // ── 1. Does city filter work on exam_sessions? ──
  console.log(`\n=== exam_sessions with city=Cumilla (category ${catId}) ===`);
  const r1 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000&city=Cumilla`, { headers });
  const d1 = await r1.json();
  const s1 = d1.exam_sessions || [];
  const cities = {};
  for (const s of s1) cities[s.test_center?.city || '?'] = (cities[s.test_center?.city || '?'] || 0) + 1;
  console.log(`Status: ${r1.status}, sessions: ${s1.length}, cities: ${JSON.stringify(cities)}`);

  // ── 2. Does session detail expose test_center.id? ──
  console.log('\n=== exam_sessions/{hashed_id} detail ===');
  if (s1.length > 0) {
    const hashedId = s1[0].id;
    console.log('Hashed id:', hashedId);
    const r2 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${hashedId}`, { headers });
    const txt2 = await r2.text();
    console.log(`Status: ${r2.status}`);
    console.log(txt2.substring(0, 1500));
    console.log('---');
    const r2b = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${hashedId}?include=test_center`, { headers });
    console.log(`With include=test_center: ${r2b.status}: ${(await r2b.text()).substring(0, 800)}`);
  }

  // ── 3. visitor_space/test_centers for this category — does it contain 174/203? ──
  console.log(`\n=== visitor_space/test_centers (category ${catId}) ===`);
  const r3 = await fetch(`${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000&category_id=${catId}`, { headers: { 'Accept': 'application/json' } });
  const d3 = await r3.json();
  const centers = d3.test_centers || [];
  console.log(`Status: ${r3.status}, centers: ${centers.length}`);
  for (const c of centers.slice(0, 15)) {
    console.log(`  ${c.id} | ${c.name} | ${c.city}`);
  }
  const ids = centers.map(c => c.id);
  console.log('Contains 174 (Brahmanbaria)?', ids.includes(174));
  console.log('Contains 203 (Noakhali)?', ids.includes(203));
}

main().catch(console.error);
