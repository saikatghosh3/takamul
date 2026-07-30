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

  // 1. Fetch test centers and check for time-related fields
  console.log('=== visitor_space/test_centers (with auth) ===');
  const tcRes = await fetch(`${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&category_id=1`, { headers });
  const tcData = await tcRes.json();
  const centers = tcData.test_centers || [];
  console.log(`Total centers: ${centers.length}`);
  
  // Collect all unique keys
  const allKeys = new Set();
  for (const c of centers) {
    for (const k of Object.keys(c)) allKeys.add(k);
  }
  console.log('All test_center keys:', [...allKeys].join(', '));
  
  // Show first 3 centers in full
  for (let i = 0; i < Math.min(centers.length, 3); i++) {
    console.log(`\nCenter ${i}:`, JSON.stringify(centers[i], null, 2));
  }
  
  // Check ALL centers for any time-related values
  console.log('\n=== Checking for time-related fields in ALL centers ===');
  for (const c of centers) {
    for (const [k, v] of Object.entries(c)) {
      const kLower = k.toLowerCase();
      if (kLower.includes('time') || kLower.includes('hour') || kLower.includes('schedule') || kLower.includes('slot') || kLower.includes('operating')) {
        console.log(`  ${c.id || c.name}: ${k} = ${v}`);
      }
    }
  }
  
  // 2. Try available_dates with a DIFFERENT category (one that has bookings/reservations)
  console.log('\n=== available_dates with category 160 (reserved one) ===');
  const adRes = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=160&country_id=${BANGLADESH_ID}&per_page=100`, { headers });
  const adData = await adRes.json();
  const adItems = adData.available_dates || adData.dates || adData.data || [];
  console.log(`Items: ${adItems.length}`);
  
  // Check each item's structure
  const itemKeys = new Set();
  for (const item of adItems) {
    for (const k of Object.keys(item)) itemKeys.add(k);
  }
  console.log('Item keys:', [...itemKeys].join(', '));
  
  // Check test_center within each item
  const tcItemKeys = new Set();
  for (const item of adItems) {
    const tc = item.test_center || {};
    for (const k of Object.keys(tc)) tcItemKeys.add(k);
  }
  console.log('test_center keys in items:', [...tcItemKeys].join(', '));
  
  // Show first few items
  for (let i = 0; i < Math.min(adItems.length, 3); i++) {
    console.log(`\nItem ${i}:`, JSON.stringify(adItems[i], null, 2));
  }
  
  // 3. Now let's try to POST to exam_reservations to see the time in the response
  // But first let's check what happens with a valid session
  console.log('\n=== Getting a reservation-ready session to check POST response ===');
  const sessionsRes = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=1&country_id=${BANGLADESH_ID}&date=2026-07-30&city=Dhaka&per_page=100`, { headers });
  const sessionsData = await sessionsRes.json();
  const sessions = sessionsData.exam_sessions || [];
  console.log(`Found ${sessions.length} sessions for Dhaka on 2026-07-30`);
  
  // Show full data for the first session
  if (sessions.length > 0) {
    console.log('\nFull first session:', JSON.stringify(sessions[0], null, 2));
    
    // Let's also check the GET full response body for ALL fields
    // Maybe there are fields we're missing due to truncation?
    const str = JSON.stringify(sessions[0]);
    
    // Check for ANY field containing "time" 
    const timeRegex = /"([^"]*time[^"]*)":\s*("[^"]*"|null|true|false|\d+)/gi;
    let m;
    const timeFields = [];
    while ((m = timeRegex.exec(str)) !== null) {
      timeFields.push({ field: m[1], value: m[2] });
    }
    if (timeFields.length > 0) {
      console.log('\nTime-related fields found in session:');
      timeFields.forEach(t => console.log(`  ${t.field}: ${t.value}`));
    } else {
      console.log('\nNo time-related fields found in session at all.');
    }
  }
  
  // Save full sessions data
  if (sessions.length > 0) {
    fs.writeFileSync('debug-session-full.json', JSON.stringify(sessions[0], null, 2));
    console.log('\nFull session saved to debug-session-full.json');
  }
}

main().catch(console.error);
