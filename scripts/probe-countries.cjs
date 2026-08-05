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
  'Accept-Language': 'en'
};
(async () => {
  const r = await fetch(`${BASE}/individual_labor_space/countries?per_page=250`, { headers: H });
  const j = await r.json();
  const list = j.countries || [];
  console.log('total countries:', list.length);
  fs.writeFileSync('debug-countries-full.json', JSON.stringify(list, null, 1));
  const nonTargeted = list.filter(c => !c.targeted);
  console.log('non-targeted:', nonTargeted.length);
  for (const c of nonTargeted) console.log(' -', c.id, c.english_name, 'test_engine:', c.test_engine, 'test_type:', c.test_type, 'load_balancer:', c.load_balancer);
})();
