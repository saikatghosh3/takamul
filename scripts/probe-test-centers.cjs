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
  const r = await fetch(`${BASE}/visitor_space/test_centers?per_page=2000&country_id=78`, { headers: H });
  const j = await r.json();
  const list = j.test_centers || [];
  console.log('total', list.length);
  fs.writeFileSync('debug-vs-centers-full.json', JSON.stringify(list, null, 1));
  // look for any site_id / prometric-like fields
  const keySet = new Set();
  for (const c of list) Object.keys(c).forEach(k => keySet.add(k));
  console.log('all keys:', [...keySet].join(', '));
  const withSite = list.filter(c => c.site_id || c.prometric_site_id || /^\d{9,}/.test(String(c.id)));
  console.log('with site_id / big id:', withSite.length);
  for (const c of withSite.slice(0, 20)) console.log(JSON.stringify(c));
})();
