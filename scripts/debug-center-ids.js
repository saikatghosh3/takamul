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

  const catId = process.argv[2] || '1';

  // ── 1. visitor_space/test_centers (what the dropdown uses) ──
  console.log(`\n=== visitor_space/test_centers (category ${catId}) ===`);
  const vsRes = await fetch(`${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000&category_id=${catId}`, { headers });
  const vsData = await vsRes.json();
  const vsCenters = vsData.test_centers || [];
  console.log(`Total: ${vsCenters.length}`);
  if (vsCenters.length > 0) {
    console.log('Sample keys:', Object.keys(vsCenters[0]).join(', '));
    console.log('First 5:', vsCenters.slice(0, 5).map(c => `${c.id} | ${c.name} | ${c.city || c.test_center_city}`).join('\n'));
  }
  fs.writeFileSync('debug-vs-centers.json', JSON.stringify(vsCenters, null, 2));

  // ── 2. individual_labor_space exam_sessions (what sessions have) ──
  console.log(`\n=== individual_labor_space/exam_sessions (category ${catId}) ===`);
  const ilRes = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000`, { headers });
  const ilData = await ilRes.json();
  const ilSessions = ilData.exam_sessions || [];
  console.log(`Total: ${ilSessions.length}`);
  const centerMap = new Map();
  for (const s of ilSessions) {
    const tc = s.test_center || {};
    const key = `${tc.test_center_id ?? tc.id ?? '?'} | ${tc.city ?? '?'}`;
    centerMap.set(key, (centerMap.get(key) || 0) + 1);
    if (Object.keys(s).length) {
      // capture a session with a full test_center
    }
  }
  console.log('test_center variants seen in sessions:');
  for (const [k, v] of centerMap.entries()) console.log(`  ${v}x  ${k}`);

  if (ilSessions.length > 0) {
    const sample = ilSessions[0];
    console.log('\nFull session sample:', JSON.stringify(sample, null, 2).substring(0, 1200));
  }
  fs.writeFileSync('debug-il-sessions.json', JSON.stringify(ilSessions, null, 2));

  // ── 3. Try individual_labor_space/test_centers endpoint variants ──
  console.log('\n=== probing individual_labor_space center endpoints ===');
  const variants = [
    `/individual_labor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000`,
    `/individual_labor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000&category_id=${catId}`,
    `/individual_labor_space/test_centers?country_id=${BANGLADESH_ID}`,
  ];
  for (const v of variants) {
    const r = await fetch(`${API_BASE}${v}`, { headers });
    const txt = (await r.text()).substring(0, 200);
    console.log(`GET ${v}`);
    console.log(`  -> ${r.status}: ${txt.replace(/\s+/g, ' ').substring(0, 120)}`);
  }

  // ── 4. Current reservations ──
  console.log('\n=== current exam_reservations ===');
  const resvRes = await fetch(`${API_BASE}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`, { headers });
  const resvData = await resvRes.json();
  const reservations = resvData.exam_reservations || resvData.data || [];
  console.log(`Total: ${reservations.length}`);
  for (const r of reservations.slice(0, 5)) {
    const es = r.exam_session || {};
    const tc = r.test_center || {};
    console.log(`Resv ${r.id} | session_id=${es.id} | test_date=${es.test_date} | center_id=${tc.test_center_id ?? tc.id ?? '?'} | center=${tc.test_center_name ?? tc.city ?? '?'}`);
  }
  fs.writeFileSync('debug-resv.json', JSON.stringify(reservations, null, 2));
}

main().catch(console.error);
