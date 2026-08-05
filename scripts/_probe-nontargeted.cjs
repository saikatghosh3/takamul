const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { token } = JSON.parse(fs.readFileSync(path.join(ROOT, '.svp-token.json'), 'utf-8'));
const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international' };

const nonTargetedCodes = ["TLREE","TLRAA","OFFII","OFFMM","OFFSS","OFFEE","OFFAA","HTDEE","HTDAA","AUMEE","AUMAA","BKREE","BKRAA","BRBEE","BRBAA","BRBTR","BAREE ","BARAA","BLSEE","BLSAA","BDEE","BDAA","BDII"];

const cities = [undefined, 'Khulna', 'Dhaka', 'Rajshahi', 'Sylhet'];
const ranges = [
  { start: '2026-08-01', end: '2026-08-31' },
  { start: '2026-10-01', end: '2026-10-31' },
  { start: '2026-08-01', end: '2026-12-31' }
];

let hits = [];

async function probe(code, city, range) {
  const params = new URLSearchParams();
  params.set('prometric_code', code.trim());
  if (city) params.set('city', city);
  params.set('start_date', range.start);
  params.set('end_date', range.end);
  try {
    const r = await fetch(`${API}/individual_labor_space/prometric_scheduling/sites_availabilities?${params}`, { headers: HDR });
    const body = await r.json();
    if (body.sites && body.sites.length > 0) {
      hits.push({ code: code.trim(), city, range, body });
      console.log(`*** HIT *** code=${code.trim()} city=${city} range=${range.start}..${range.end}`);
      console.log(JSON.stringify(body, null, 2).slice(0, 1500));
    }
  } catch (e) {
    // ignore transient errors
  }
}

async function main() {
  let n = 0;
  for (const code of nonTargetedCodes) {
    for (const city of cities) {
      for (const range of ranges) {
        await probe(code, city, range);
        n++;
        if (n % 23 === 0) console.log(`progress ${n}/${nonTargetedCodes.length * cities.length * ranges.length}`);
      }
    }
  }
  console.log(`\nDONE. ${n} probes, ${hits.length} hits.`);
  if (hits.length === 0) console.log('No non-targeted code returns sites.');
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
