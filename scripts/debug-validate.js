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

  // Try the validate endpoint with various payloads (SAFE - validation only)
  const payloads = [
    { category_id: 159, country_id: BANGLADESH_ID, test_date: '2026-08-20', test_center_id: 174 },
    { category_id: 159, country_id: BANGLADESH_ID, test_date: '2026-08-20', city: 'Cumilla' },
    { category_id: 159, country_id: BANGLADESH_ID, test_date: '2026-08-20', test_center_id: 174, city: 'Cumilla' },
    { category_id: 159, country_id: BANGLADESH_ID, test_center_id: 174 },
  ];

  for (const body of payloads) {
    console.log(`\n=== POST exam_reservations/validate with ${JSON.stringify(body)} ===`);
    const r = await fetch(`${API_BASE}/individual_labor_space/exam_reservations/validate`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const txt = await r.text();
    console.log(`Status: ${r.status}`);
    console.log(txt.substring(0, 1200));
  }
}

main().catch(console.error);
