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
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

const variants = [
  { prometric_code: 'LOABB', city: 'Khulna', start_date: '2026-11-01', end_date: '2026-11-30', locale: 'en' },
  { prometric_code: 'LOABB', city: 'Khulna', start_date: '2026-08-01', end_date: '2026-08-31', locale: 'en' },
  { prometric_code: 'LOABB', city: 'Khulna', start_date: '2026-08-05', end_date: '2026-08-05', locale: 'en' },
  { prometric_code: 'LOABB', city: 'Khulna', locale: 'en' },
  { prometric_code: 'LOABB', locale: 'en' },
  { prometric_code: 'LOABB', city: 'Dhaka', locale: 'en', category_id: '159' },
];

(async () => {
  for (const params of variants) {
    const qs = new URLSearchParams(params).toString();
    const url = `${BASE}/individual_labor_space/prometric_scheduling/sites_availabilities?${qs}`;
    const r = await fetch(url, { headers: H });
    const txt = await r.text();
    console.log(r.status, url);
    console.log('   ', txt.substring(0, 400));
  }
})();
