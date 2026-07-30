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

  // 1. Get exam sessions list (hashed IDs)
  console.log('=== exam_sessions (first 3) ===');
  const listRes = await fetch(`${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=3`, { headers });
  const listData = await listRes.json();
  const sessions = listData.exam_sessions || [];
  
  for (const s of sessions) {
    console.log(`ID: ${s.id}, date: ${s.start_date_in_tc_time_zone}, city: ${s.test_center?.city}`);
  }

  if (sessions.length > 0) {
    const hashedId = sessions[0].id;
    
    // Try GET with hashed ID
    console.log(`\n=== GET exam_sessions/${hashedId} (hashed) ===`);
    const res1 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${hashedId}`, { headers });
    console.log('Status:', res1.status);
    if (res1.ok) {
      const data = await res1.json();
      console.log('Keys:', Object.keys(data));
      console.log(JSON.stringify(data, null, 2));
    } else {
      console.log(await res1.text());
    }

    // Try with 'detail' subpath
    console.log(`\n=== GET exam_sessions/${hashedId}/detail ===`);
    const res2 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${hashedId}/detail`, { headers });
    console.log('Status:', res2.status);
    if (res2.ok) {
      const data = await res2.json();
      console.log('Keys:', Object.keys(data));
      console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    } else {
      console.log((await res2.text()).substring(0, 300));
    }

    // Try PUT/GET with full prefix
    console.log(`\n=== GET exam_sessions/${hashedId}?include=test_time,start_at ===`);
    const res3 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${hashedId}?include=test_time,start_at`, { headers });
    console.log('Status:', res3.status);
    if (res3.ok) {
      const data = await res3.json();
      console.log(JSON.stringify(data, null, 2).substring(0, 1000));
    } else {
      console.log((await res3.text()).substring(0, 300));
    }
  }

  // 2. Get reservations to see numeric session IDs
  console.log('\n=== reservations (checking session IDs) ===');
  const resvRes = await fetch(`${API_BASE}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`, { headers });
  const resvData = await resvRes.json();
  const reservations = resvData.exam_reservations || [];
  
  for (const r of reservations) {
    const es = r.exam_session || {};
    console.log(`Reservation ${r.id}: session_id=${es.id}, test_date=${es.test_date}, test_time=${es.test_time}`);
    
    // Try GET with numeric session ID
    console.log(`\n=== GET exam_sessions/${es.id} (numeric) ===`);
    const res4 = await fetch(`${API_BASE}/individual_labor_space/exam_sessions/${es.id}`, { headers });
    console.log('Status:', res4.status);
    if (res4.ok) {
      const data = await res4.json();
      console.log('Keys:', Object.keys(data));
      console.log('test_time:', data.test_time);
      console.log('start_at:', data.start_at);
    } else {
      console.log(await res4.text());
    }

    break; // Just one reservation
  }

  // 3. Try sessions with different parameter combinations
  console.log('\n=== exam_sessions with extended params ===');
  const extendedUrls = [
    `${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=3&include=test_time,start_at,test_center`,
    `${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=3&extended=true`,
    `${API_BASE}/individual_labor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}&per_page=3&fields=all`,
  ];

  for (const url of extendedUrls) {
    console.log(`\nGET ${url.replace(API_BASE, '')}`);
    const res = await fetch(url, { headers });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      const s = data.exam_sessions || data.sessions || data.data || [];
      if (s.length > 0) {
        console.log('First session keys:', Object.keys(s[0]).join(', '));
        const hasTime = s[0].test_time || s[0].start_at || s[0].start_time || false;
        console.log('Has time:', hasTime);
      }
    } else {
      console.log((await res.text()).substring(0, 300));
    }
  }

  // 4. Try the visitor_space endpoint for sessions
  console.log('\n=== visitor_space sessions ===');
  const visitorUrls = [
    `${API_BASE}/visitor_space/exam_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}`,
    `${API_BASE}/visitor_space/available_sessions?category_id=${catId}&country_id=${BANGLADESH_ID}`,
  ];
  
  for (const url of visitorUrls) {
    console.log(`\nGET ${url.replace(API_BASE, '')}`);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    console.log('Status:', res.status);
    if (res.ok) {
      const data = await res.json();
      console.log('Keys:', Object.keys(data));
      const str = JSON.stringify(data);
      if (str.includes('test_time') || str.includes('start_at')) {
        console.log('*** TIME FOUND! ***');
        console.log(str.substring(0, 800));
      }
    } else {
      console.log((await res.text()).substring(0, 300));
    }
  }
}

main().catch(console.error);
