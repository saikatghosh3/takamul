const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { token } = JSON.parse(fs.readFileSync(path.join(ROOT, '.svp-token.json'), 'utf-8'));
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international' };
const LOCAL_HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-local' };

async function probe(name, url, headers) {
  try {
    const r = await fetch(url, { headers });
    const text = await r.text();
    console.log(`\n=== ${name} ===`);
    console.log(`status ${r.status}`);
    console.log(text.slice(0, 500));
  } catch (e) {
    console.log(`\n=== ${name} === ERROR ${e.message}`);
  }
}

async function main() {
  // svp-local tenant (Saudi) — same token, local tenant header
  const local = 'https://svp-local-api.pacc.sa/api/v1';
  await probe('svp-local categories (local hdr)', `${local}/individual_labor_space/categories`, LOCAL_HDR);
  await probe('svp-local sites LOABB Khulna', `${local}/individual_labor_space/prometric_scheduling/sites_availabilities?prometric_code=LOABB&city=Khulna&start_date=2026-08-01&end_date=2026-08-31`, LOCAL_HDR);
  await probe('svp-local sites LOABB Riyadh', `${local}/individual_labor_space/prometric_scheduling/sites_availabilities?prometric_code=LOABB&city=Riyadh&start_date=2026-08-01&end_date=2026-08-31`, LOCAL_HDR);
  await probe('svp-local auth/user', `${local}/auth/user`, LOCAL_HDR);

  // svp-international api host with svp-local tenant header
  const intl = 'https://svp-international-api.pacc.sa/api/v1';
  await probe('svp-international sites LOABB Khulna (local hdr)', `${intl}/individual_labor_space/prometric_scheduling/sites_availabilities?prometric_code=LOABB&city=Khulna&start_date=2026-08-01&end_date=2026-08-31`, LOCAL_HDR);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
