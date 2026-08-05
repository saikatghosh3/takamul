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
const { codes } = JSON.parse(fs.readFileSync('debug-all-prometric-codes.json', 'utf-8'));
const q = (obj) => Object.entries(obj).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

const ranges = [['2026-08-01', '2026-08-31'], ['2027-08-01', '2027-08-31']];
const cities = [null, 'Khulna'];

(async () => {
  let hits = 0, i = 0;
  for (const code of codes) {
    i++;
    for (const [sd, ed] of ranges) {
      for (const city of cities) {
        const params = { prometric_code: code, start_date: sd, end_date: ed };
        if (city) params.city = city;
        const url = `${BASE}/individual_labor_space/prometric_scheduling/sites_availabilities?${q(params)}`;
        try {
          const r = await fetch(url, { headers: H });
          const data = await r.json();
          const sites = data.sites || [];
          if (sites.length > 0 || data.exam_id) {
            console.log('HIT', code, city || '(all)', sd, r.status, JSON.stringify(data).substring(0, 500));
            hits++;
            fs.writeFileSync('debug-site-hit.json', JSON.stringify({ code, city, sd, ed, status: r.status, data }, null, 1));
          }
        } catch (e) {
          console.log('ERR', code, city, sd, e.message);
        }
      }
    }
    if (i % 50 === 0) console.log('progress', i, '/', codes.length, 'hits', hits);
  }
  console.log('done, hits:', hits);
})();
