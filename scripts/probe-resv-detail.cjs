const fs = require('fs');
const t = JSON.parse(fs.readFileSync('.svp-token.json', 'utf-8'));
const tok = String(t.token).replace(/^Bearer /, '');
const BASE = 'https://svp-international-api.pacc.sa/api/v1';
const H = {
  'Authorization': 'Bearer ' + tok,
  'Origin': 'https://svp-international.pacc.sa',
  'Referer': 'https://svp-international.pacc.sa/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'X-Tenant-Name': 'svp-international',
};
(async () => {
  const r = await fetch(`${BASE}/individual_labor_space/exam_reservations/4926912`, { headers: H });
  const j = await r.json();
  const keys = Object.keys(j);
  console.log('top-level keys:', keys.join(', '));
  for (const k of ['exam_session', 'prometric_data', 'test_center', 'occupation', 'methodology', 'language_code', 'reservation_status']) {
    console.log(`\n=== ${k} ===`);
    console.log(JSON.stringify(j[k], null, 1).substring(0, 1200));
  }
  fs.writeFileSync('debug-resv-4926912.json', JSON.stringify(j, null, 2));
  console.log('\n[saved] debug-resv-4926912.json');
})();
