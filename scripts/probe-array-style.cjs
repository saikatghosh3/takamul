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
const q = (obj) => Object.entries(obj).flatMap(([k, v]) =>
  Array.isArray(v) ? v.map(x => `${encodeURIComponent(k)}[]=${encodeURIComponent(x)}`) : `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
).join('&');
(async () => {
  // 1) axios-style array for slots_availabilities with the real 10-digit site id
  let url = `${BASE}/individual_labor_space/prometric_scheduling/slots_availabilities?` +
    q({ site_ids: ['1279959005'], exam_id: '', start_date: '2026-08-15', end_date: '2026-08-15' });
  let r = await fetch(url, { headers: H });
  let j = await r.json();
  console.log('slots array-style 1279959005:', r.status, JSON.stringify(j).substring(0, 300));

  // 2) sites_availabilities with exact wizard params (start/end month range) + tenant header
  url = `${BASE}/individual_labor_space/prometric_scheduling/sites_availabilities?` +
    q({ prometric_code: 'LOABB', city: 'Khulna', start_date: '2026-08-01', end_date: '2026-08-31' });
  r = await fetch(url, { headers: H });
  j = await r.json();
  console.log('sites LOABB Khulna month:', r.status, JSON.stringify(j).substring(0, 300));
})();
