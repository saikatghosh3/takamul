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
  const r = await fetch(`${BASE}/individual_labor_space/exam_sessions?category_id=159&country_id=78&per_page=100&city=Khulna&available_seats=greater_than::0&date=2026-09-28`, { headers: H });
  const j = await r.json();
  const list = j.exam_sessions || j.data || [];
  console.log('count', list.length);
  for (const s of list.slice(0, 4)) {
    console.log('\n--- session', s.id, '---');
    console.log('test_center:', JSON.stringify(s.test_center));
    console.log('keys:', Object.keys(s).join(', '));
  }
})();
