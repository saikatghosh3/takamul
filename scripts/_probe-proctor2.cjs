const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { token } = JSON.parse(fs.readFileSync(path.join(ROOT, '.svp-token.json'), 'utf-8'));
const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international', 'Origin': 'https://svp-international.pacc.sa', 'Referer': 'https://svp-international.pacc.sa/' };

async function probe(name, url, opts = {}) {
  const { method = 'GET', body } = opts;
  try {
    const r = await fetch(url, { method, headers: { ...HDR, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    console.log(`\n=== ${name} === status ${r.status}`);
    console.log(text.slice(0, 1000));
  } catch (e) {
    console.log(`\n=== ${name} === ERROR ${e.message}`);
  }
}

async function main() {
  // proctor_slots_availabilities with city param (empty, as the wizard does for online)
  const codes = ['0ed9e454-bd29-4c9e-9093-e13432a5d542'];
  for (const c of codes) {
    const p = new URLSearchParams({ prometric_code: c, city: '', start_date: '2026-08-01', end_date: '2026-08-31' });
    await probe(`proctor city='' code=${c.slice(0,8)}`, `${API}/individual_labor_space/prometric_scheduling/proctor_slots_availabilities?${p}`);
  }
  // with city=Khulna
  for (const c of codes) {
    const p = new URLSearchParams({ prometric_code: c, city: 'Khulna', start_date: '2026-08-01', end_date: '2026-08-31' });
    await probe(`proctor city=Khulna code=${c.slice(0,8)}`, `${API}/individual_labor_space/prometric_scheduling/proctor_slots_availabilities?${p}`);
  }
  // get all TEP codes from occupations and probe online flow with each
  const occRes = await fetch(`${API}/individual_labor_space/occupations`, { headers: HDR });
  const occ = await occRes.json();
  const tepCodes = new Set();
  for (const o of occ.occupations || []) {
    for (const pc of (o.category?.prometric_codes || [])) {
      if ((pc.exam_engine_name || '').toLowerCase() === 'tep' && pc.code) tepCodes.add(pc.code);
    }
  }
  console.log('\nTEP codes:', tepCodes.size);
  let hit = 0;
  for (const c of tepCodes) {
    const p = new URLSearchParams({ prometric_code: c, city: '', start_date: '2026-08-01', end_date: '2026-08-31' });
    try {
      const r = await fetch(`${API}/individual_labor_space/prometric_scheduling/proctor_slots_availabilities?${p}`, { headers: HDR });
      const t = await r.text();
      if (r.status === 200) {
        console.log(`proctor 200 code=${c.slice(0,8)}:`, t.slice(0, 300));
        hit++;
      }
    } catch {}
  }
  console.log('proctor hits:', hit);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
