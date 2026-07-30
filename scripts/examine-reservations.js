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

  const res = await fetch(`${API_BASE}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`, { headers });
  const data = await res.json();
  const reservations = data.exam_reservations || [];
  console.log('Total reservations:', reservations.length);

  // Save full response
  fs.writeFileSync('debug-reservations.json', JSON.stringify(data, null, 2));
  console.log('Full response saved to debug-reservations.json');

  for (let i = 0; i < Math.min(reservations.length, 3); i++) {
    const r = reservations[i];
    const es = r.exam_session || {};
    console.log('\n' + '='.repeat(60));
    console.log('Reservation', i, '(id:', r.id, ')');
    console.log('-'.repeat(60));
    console.log('exam_session keys:', Object.keys(es).join(', '));
    console.log('exam_session:', JSON.stringify(es, null, 2));
    console.log('test_center:', JSON.stringify(r.test_center, null, 2));
    
    // Check ALL time-related strings in the full reservation JSON
    const str = JSON.stringify(r);
    const timeRegex = /"(test_time|start_time|time_slot|end_time|available_time)":\s*"([^"]+)"/g;
    let match;
    const found = [];
    while ((match = timeRegex.exec(str)) !== null) {
      found.push({ field: match[1], value: match[2] });
    }
    if (found.length > 0) {
      console.log('Time-related fields:', JSON.stringify(found));
    } else {
      console.log('No time-related fields found in reservation');
    }
  }

  // Also check what the full list of unique exam_session keys are across ALL reservations
  const allEsKeys = new Set();
  for (const r of reservations) {
    const es = r.exam_session || {};
    for (const k of Object.keys(es)) {
      allEsKeys.add(k);
    }
  }
  console.log('\n' + '='.repeat(60));
  console.log('ALL unique exam_session keys across all reservations:');
  console.log([...allEsKeys].join(', '));

  // And similarly for test_center
  const allTcKeys = new Set();
  for (const r of reservations) {
    const tc = r.test_center || {};
    for (const k of Object.keys(tc)) {
      allTcKeys.add(k);
    }
  }
  console.log('\nALL unique test_center keys across all reservations:');
  console.log([...allTcKeys].join(', '));
}

main().catch(console.error);
