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
const q = (obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const spaces = ['visitor_space', 'test_center_owner_space', 'assessor_space', 'legislator_space', 'verification_company_manager_space'];
const paths = [
  'prometric_scheduling/sites_availabilities?prometric_code=LOABB&city=Khulna&start_date=2026-08-01&end_date=2026-08-31',
  'prometric_scheduling/sites_availabilities?prometric_code=TLREE&city=Khulna&start_date=2026-08-01&end_date=2026-08-31',
  'test_centers?per_page=100&city=Khulna'
];
(async () => {
  for (const space of spaces) {
    for (const path of paths) {
      const url = `${BASE}/${space}/${path}`;
      try {
        const r = await fetch(url, { headers: H });
        const txt = await r.text();
        console.log(space, '|', path.split('?')[0], '->', r.status, txt.substring(0, 150).replace(/\n/g, ' '));
      } catch (e) {
        console.log(space, path.split('?')[0], 'ERR', e.message);
      }
    }
  }
})();
