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

  // Use the CANCELLED reservation (4878771) — cannot be rescheduled, safe to probe
  const resvId = process.argv[2] || '4878771';
  const sampleSessionId = process.argv[3] || '1779692';

  const payloads = [
    { test_date: '2026-08-20' },
    { test_date: '2026-08-20', test_center_id: 174 },
    { test_date: '2026-08-20', test_center_id: 174, category_id: 159 },
    { test_date: '2026-08-20', city: 'Cumilla' },
    { test_date: '2026-08-20', city: 'Cumilla', language: 'bn' },
    { exam_session_id: sampleSessionId },
    { exam_session_id: sampleSessionId, test_date: '2026-08-20', test_center_id: 174, category_id: 159, city: 'Cumilla', language: 'bn' },
  ];

  for (const body of payloads) {
    console.log(`\n=== POST exam_reservations/${resvId}/reschedule ${JSON.stringify(body)} ===`);
    try {
      const r = await fetch(`${API_BASE}/individual_labor_space/exam_reservations/${resvId}/reschedule`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const txt = await r.text();
      console.log(`Status: ${r.status}`);
      console.log(txt.substring(0, 1200));
    } catch (e) {
      console.log(`NETWORK ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);
