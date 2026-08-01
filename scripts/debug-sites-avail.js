const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));

  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Origin': 'https://svp-international.pacc.sa',
    'Referer': 'https://svp-international.pacc.sa/'
  };

  const catId = process.argv[2] || '159';

  const variants = [
    `/individual_labor_space/prometric_scheduling/sites_availabilities?category_id=${catId}&country_id=${BANGLADESH_ID}&date=2026-08-20`,
    `/individual_labor_space/prometric_scheduling/sites_availabilities?category_id=${catId}&country_id=${BANGLADESH_ID}`,
    `/individual_labor_space/prometric_scheduling/sites_availabilities?category_id=${catId}&country_id=${BANGLADESH_ID}&city=Cumilla`,
    `/individual_labor_space/prometric_scheduling/sites_availabilities?category_id=${catId}&country_id=${BANGLADESH_ID}&test_center_id=174`,
    `/individual_labor_space/prometric_scheduling/proctor_slots_availabilities?category_id=${catId}&country_id=${BANGLADESH_ID}&date=2026-08-20`,
  ];

  for (const v of variants) {
    console.log(`\n=== GET ${v} ===`);
    const r = await fetch(`${API_BASE}${v}`, { headers });
    const txt = await r.text();
    console.log(`Status: ${r.status}`);
    console.log(txt.substring(0, 1500));
    if (r.ok) {
      fs.writeFileSync('debug-sites-avail.json', txt);
    }
  }
}

main().catch(console.error);
