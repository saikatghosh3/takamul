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

const codes = ['LOAII','LOACC','LOAMM','LOATR','LOASS','LOAEE','LOAAA'];
const dates = [
  ['2026-08-01','2027-12-31'],
  ['2026-11-01','2026-11-30'],
  ['2026-09-01','2026-09-30'],
];

async function probe(params, label) {
  const qs = new URLSearchParams({ ...params, locale: 'en' }).toString();
  const r = await fetch(`${BASE}/individual_labor_space/prometric_scheduling/sites_availabilities?${qs}`, { headers: H });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { j = { raw: txt.substring(0, 200) }; }
  const n = (j.sites || []).length;
  console.log(`${label} [${r.status}] sites=${n}`, JSON.stringify(j).substring(0, 350));
  return j;
}

(async () => {
  for (const code of codes) {
    for (const [sd, ed] of dates) {
      await probe({ prometric_code: code, start_date: sd, end_date: ed }, `code=${code} ${sd}..${ed}`);
    }
  }
  // numeric id as prometric_code
  await probe({ prometric_code: '392', start_date: '2026-08-01', end_date: '2027-12-31' }, 'prometric_code=392 numeric');
  // with city
  await probe({ prometric_code: 'LOABB', city: 'Khulna', start_date: '2026-08-01', end_date: '2027-12-31' }, 'LOABB Khulna wide');
  await probe({ prometric_code: 'LOAII', city: 'Khulna', start_date: '2026-08-01', end_date: '2027-12-31' }, 'LOAII Khulna wide');
})();
