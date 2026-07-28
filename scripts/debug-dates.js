// Quick debug: fetch available_dates and dump the structure of items
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
  
  // Use category_id=1 as a test (user should change to their actual category)
  const categoryId = process.argv[2] || '1';
  
  const url = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${categoryId}&country_id=${BANGLADESH_ID}`;
  console.log('Fetching:', url);
  
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Origin': 'https://svp-international.pacc.sa',
      'Referer': 'https://svp-international.pacc.sa/'
    }
  });
  
  console.log('Status:', res.status);
  const data = await res.json();
  
  // Find the array of dates
  const dates = data.available_dates || data.dates || data.data || data.sessions || [];
  console.log('\nTop-level keys:', Object.keys(data));
  console.log('Dates array key:', data.available_dates ? 'available_dates' : data.dates ? 'dates' : data.data ? 'data' : data.sessions ? 'sessions' : 'UNKNOWN');
  console.log('Number of items:', Array.isArray(dates) ? dates.length : 'not an array');
  
  if (Array.isArray(dates) && dates.length > 0) {
    console.log('\n=== FIRST ITEM ===');
    console.log('Keys:', Object.keys(dates[0]));
    console.log('Full item:', JSON.stringify(dates[0], null, 2));
    
    if (dates.length > 1) {
      console.log('\n=== SECOND ITEM ===');
      console.log('Keys:', Object.keys(dates[1]));
      console.log('Full item:', JSON.stringify(dates[1], null, 2));
    }
  }
}

main().catch(console.error);
