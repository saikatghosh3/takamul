const fs = require('fs');
const path = require('path');
const { token } = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.svp-token.json'), 'utf-8'));
const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international', 'Origin': 'https://svp-international.pacc.sa', 'Referer': 'https://svp-international.pacc.sa/' };

async function probe(name, url, opts = {}) {
  try {
    const r = await fetch(url, { method: opts.method || 'GET', headers: HDR });
    const text = await r.text();
    console.log(`\n=== ${name} === status ${r.status}`);
    console.log(text.slice(0, 1500));
  } catch (e) { console.log(`\n=== ${name} === ERROR ${e.message}`); }
}

async function main() {
  const spaces = ['individual_labor_space', 'test_center_owner_space', 'assessor_space'];
  for (const sp of spaces) {
    await probe(`${sp} test_centers`, `${API}/${sp}/test_centers`);
    await probe(`${sp} test_centers/156`, `${API}/${sp}/test_centers/156`);
  }
  await probe('visitor_space cities', `${API}/visitor_space/cities`);
  await probe('visitor_space test_centers/156', `${API}/visitor_space/test_centers/156`);
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1); });
