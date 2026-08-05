const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { token } = JSON.parse(fs.readFileSync(path.join(ROOT, '.svp-token.json'), 'utf-8'));
const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international', 'Origin': 'https://svp-international.pacc.sa', 'Referer': 'https://svp-international.pacc.sa/' };

async function probe(name, url, opts = {}) {
  const { method = 'GET', body } = opts;
  try {
    const r = await fetch(url, {
      method,
      headers: { ...HDR, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    console.log(`\n=== ${name} ===`);
    console.log(`${method} ${url.replace(API, '')}`);
    console.log(`status ${r.status}`);
    console.log(text.slice(0, 800));
  } catch (e) {
    console.log(`\n=== ${name} === ERROR ${e.message}`);
  }
}

async function main() {
  // feature flags
  await probe('feature_flags', `${API}/feature_flags`);
  await probe('permissions', `${API}/permissions`);

  // proctor_slots_availabilities (TEP online) with a TEP code
  const tepCodes = ['0ed9e454-bd29-4c9e-9093-e13432a5d542', 'LOABB', 'TLRPE', 'CTWPE'];
  for (const c of tepCodes.slice(0, 2)) {
    await probe(`proctor_slots_availabilities code=${c}`, `${API}/individual_labor_space/prometric_scheduling/proctor_slots_availabilities?prometric_code=${encodeURIComponent(c)}&start_date=2026-08-01&end_date=2026-08-31`);
  }

  // slots_availabilities GET with proper array-style site_ids
  await probe('slots_availabilities GET site_ids[]=1279959005', `${API}/individual_labor_space/prometric_scheduling/slots_availabilities?site_ids%5B%5D=1279959005&exam_id=1`);
  await probe('slots_availabilities GET exam_id only', `${API}/individual_labor_space/prometric_scheduling/slots_availabilities?exam_id=1`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
