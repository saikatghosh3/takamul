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

  const catId = process.argv[2] || '1';
  const date = process.argv[3] || '2026-07-30';

  const endpoints = [
    // Endpoint candidates for time info
    { url: `${API_BASE}/individual_labor_space/time_slots?test_center_id=166&date=${date}&category_id=${catId}`, label: 'time_slots (tc)' },
    { url: `${API_BASE}/individual_labor_space/exam_sessions/available_times?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'available_times' },
    { url: `${API_BASE}/individual_labor_space/exam_sessions/time_slots?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'time_slots' },
    { url: `${API_BASE}/individual_labor_space/exam_sessions/schedule?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'schedule' },
    { url: `${API_BASE}/individual_labor_space/schedules?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'schedules' },
    { url: `${API_BASE}/individual_labor_space/available_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'available_sessions' },
    { url: `${API_BASE}/individual_labor_space/exam_sessions/available?category_id=${catId}&country_id=${BANGLADESH_ID}&date=${date}`, label: 'available' },
    { url: `${API_BASE}/individual_labor_space/test_centers/166`, label: 'test_center_166' },
    { url: `${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&category_id=${catId}`, label: 'visitor_test_centers' },
    // Get reservations to see the time in exam_session
    { url: `${API_BASE}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`, label: 'exam_reservations' },
    // Try the exam_sessions with specific test_center_id
    { url: `${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&test_center_id=166&date=${date}`, label: 'exam_sessions(tc=166)' },
  ];

  for (const { url, label } of endpoints) {
    try {
      const res = await fetch(url, { headers });
      const text = await res.text();
      const shortUrl = url.replace(API_BASE, '');
      console.log(`\n── ${label} ──`);
      console.log(`GET ${shortUrl}`);
      console.log(`Status: ${res.status}`);
      
      if (res.ok && text.length > 0) {
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        const str = JSON.stringify(data);
        
        // Check for time-related fields
        const timePatterns = ['test_time', 'start_time', 'time_slot', 'end_time', 'available_time', '"time"'];
        let foundTime = false;
        for (const p of timePatterns) {
          if (str.includes(p)) {
            if (!foundTime) {
              console.log('*** TIME INFO FOUND! ***');
              foundTime = true;
            }
            // Extract values for this field
            const regex = new RegExp(`"${p.replace(/"/g, '')}":\\s*"([^"]+)"`, 'g');
            let m;
            while ((m = regex.exec(str)) !== null) {
              console.log(`  ${p} = "${m[1]}"`);
            }
          }
        }
        
        if (typeof data === 'object') {
          console.log('Keys:', Object.keys(data).join(', '));
          
          // Show first item in arrays
          for (const [k, v] of Object.entries(data)) {
            if (Array.isArray(v) && v.length > 0) {
              console.log(`${k}[${v.length}] first item keys:`, Object.keys(v[0]).join(', '));
              if (foundTime) {
                console.log('First item:', JSON.stringify(v[0], null, 2).substring(0, 800));
              }
            }
          }
        }
      } else if (!res.ok) {
        console.log('Error:', text.substring(0, 200));
      }
    } catch (e) {
      console.log(`\n── ${label} FAILED: ${e.message} ──`);
    }
  }
}

main().catch(console.error);
