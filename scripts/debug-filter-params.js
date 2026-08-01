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

  // Baseline: unfiltered
  const baseRes = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000`, { headers });
  const baseData = await baseRes.json();
  const base = baseData.exam_sessions || [];
  const baseCities = {};
  for (const s of base) baseCities[s.test_center?.city || '?'] = (baseCities[s.test_center?.city || '?'] || 0) + 1;
  console.log(`BASELINE: ${base.length} sessions`);
  console.log('  cities:', JSON.stringify(baseCities));

  const params = [
    'test_center_id=174',
    'center_id=174',
    'test_center=174',
    'test_center_id=174&city=Cumilla',
    'city=Cumilla',
    'test_center_id=174&date=2026-08-20',
    'date=2026-08-20&city=Cumilla',
  ];

  for (const p of params) {
    const url = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=10000&${p}`;
    try {
      const r = await fetch(url, { headers });
      const d = await r.json();
      const s = d.exam_sessions || [];
      const c = {};
      for (const x of s) c[x.test_center?.city || '?'] = (c[x.test_center?.city || '?'] || 0) + 1;
      const hasDates = s.slice(0, 5).map(x => x.start_date_in_tc_time_zone);
      console.log(`\nGET ...?${p}`);
      console.log(`  -> ${r.status}, sessions: ${s.length}, cities: ${JSON.stringify(c)}`);
      console.log(`  dates: ${hasDates.join(', ')}`);
    } catch (e) {
      console.log(`\nGET ...?${p} -> ERROR ${e.message}`);
    }
  }
}

main().catch(console.error);
