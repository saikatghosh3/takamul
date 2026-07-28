const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

async function main() {
  const tokenFile = path.join(__dirname, '..', '.svp-token.json');
  const { token } = JSON.parse(fs.readFileSync(tokenFile, 'utf-8'));
  
  const categoryId = process.argv[2] || '1';
  const testDate = process.argv[3] || '';
  const city = process.argv[4] || '';
  
  const headers = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Origin': 'https://svp-international.pacc.sa',
    'Referer': 'https://svp-international.pacc.sa/'
  };

  console.log('=== AVAILABLE DATES (Full Response) ===');
  const datesUrl = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${categoryId}&country_id=${BANGLADESH_ID}`;
  console.log('URL:', datesUrl);
  const datesRes = await fetch(datesUrl, { headers });
  console.log('Status:', datesRes.status);
  const datesData = await datesRes.json();
  console.log('Top-level keys:', Object.keys(datesData));
  
  const dates = datesData.available_dates || datesData.dates || datesData.data || [];
  console.log('Dates count:', Array.isArray(dates) ? dates.length : 'not array');
  
  if (Array.isArray(dates) && dates.length > 0) {
    console.log('\n--- ALL UNIQUE DATE FIELDS from first item ---');
    console.log('Keys:', Object.keys(dates[0]));
    console.log('Full first item:', JSON.stringify(dates[0], null, 2));
    console.log('\nFull second item:', dates.length > 1 ? JSON.stringify(dates[1], null, 2) : 'N/A');
    console.log('\nFull third item:', dates.length > 2 ? JSON.stringify(dates[2], null, 2) : 'N/A');
    
    // Extract all unique dates
    const allDates = [];
    for (const d of dates) {
      const fields = ['date', 'start_date', 'start_date_in_tc_time_zone', 'start_date_in_browser_time_zone', 'end_date', 'exam_date'];
      for (const f of fields) {
        if (d[f]) allDates.push({ field: f, value: d[f], city: d.test_center?.city || d.city || '' });
      }
    }
    console.log('\n--- ALL EXTRACTED DATES ---');
    const uniqueDates = [...new Set(allDates.map(d => String(d.value).substring(0, 10)))].sort();
    console.log('Unique date values:', uniqueDates);
    
    // Show city mapping
    const cityDateMap = {};
    for (const d of dates) {
      const cityName = d.test_center?.city || d.city || 'unknown';
      if (!cityDateMap[cityName]) cityDateMap[cityName] = [];
      const rawDate = d.start_date_in_tc_time_zone || d.date || d.start_date || '';
      const match = String(rawDate).match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) cityDateMap[cityName].push(match[1]);
    }
    console.log('\n--- CITY -> DATES MAPPING ---');
    for (const [cityName, cityDates] of Object.entries(cityDateMap)) {
      console.log(`${cityName}: ${[...new Set(cityDates)].sort().join(', ')}`);
    }
  }

  // Save full response
  fs.writeFileSync(path.join(__dirname, '..', 'debug-dates-response.json'), JSON.stringify(datesData, null, 2));
  console.log('\nFull dates response saved to debug-dates-response.json');

  // Now fetch cities
  console.log('\n\n=== CITIES (Full Response) ===');
  const citiesUrl = `${API_BASE}/individual_labor_space/test_centers/cities?category_id=${categoryId}&country_id=${BANGLADESH_ID}`;
  console.log('URL:', citiesUrl);
  const citiesRes = await fetch(citiesUrl, { headers });
  console.log('Status:', citiesRes.status);
  const citiesData = await citiesRes.json();
  console.log('Full response:', JSON.stringify(citiesData, null, 2).substring(0, 2000));

  // Fetch exam sessions (if date provided)
  if (testDate) {
    console.log(`\n\n=== EXAM SESSIONS for date=${testDate} city=${city || '(any)'} ===`);
    let sessionsUrl = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}&date=${encodeURIComponent(testDate)}`;
    if (city) sessionsUrl += `&city=${encodeURIComponent(city)}`;
    console.log('URL:', sessionsUrl);
    const sessionsRes = await fetch(sessionsUrl, { headers });
    console.log('Status:', sessionsRes.status);
    const sessionsData = await sessionsRes.json();
    console.log('Top-level keys:', Object.keys(sessionsData));
    
    const sessions = sessionsData.exam_sessions || sessionsData.sessions || sessionsData.data || sessionsData.available_sessions || [];
    console.log('Sessions count:', Array.isArray(sessions) ? sessions.length : 'not array');
    
    if (Array.isArray(sessions) && sessions.length > 0) {
      console.log('\n--- FIRST SESSION ---');
      console.log('Keys:', Object.keys(sessions[0]));
      console.log('Full:', JSON.stringify(sessions[0], null, 2));
      if (sessions.length > 1) {
        console.log('\n--- SECOND SESSION ---');
        console.log('Keys:', Object.keys(sessions[1]));
        console.log('Full:', JSON.stringify(sessions[1], null, 2));
      }
    }
    
    fs.writeFileSync(path.join(__dirname, '..', 'debug-sessions-response.json'), JSON.stringify(sessionsData, null, 2));
    console.log('\nFull sessions response saved to debug-sessions-response.json');
  }
  
  // Also try WITHOUT date to get all sessions
  console.log(`\n\n=== ALL EXAM SESSIONS (no date filter) ===`);
  const allSessionsUrl = `${API_BASE}/individual_labor_space/exam_sessions?category_id=${categoryId}&country_id=${BANGLADESH_ID}`;
  console.log('URL:', allSessionsUrl);
  const allSessionsRes = await fetch(allSessionsUrl, { headers });
  console.log('Status:', allSessionsRes.status);
  const allSessionsData = await allSessionsRes.json();
  console.log('Top-level keys:', Object.keys(allSessionsData));
  
  const allSessions = allSessionsData.exam_sessions || allSessionsData.sessions || allSessionsData.data || [];
  console.log('Sessions count:', Array.isArray(allSessions) ? allSessions.length : 'not array');
  
  if (Array.isArray(allSessions) && allSessions.length > 0) {
    console.log('\n--- FIRST SESSION (all) ---');
    console.log('Full:', JSON.stringify(allSessions[0], null, 2));
    
    // Extract dates from all sessions
    const sessionDates = allSessions.map(s => {
      const rawDate = s.test_date || s.date || s.start_date || s.start_date_in_tc_time_zone || 
        s.exam_session?.test_date || s.exam_session?.date || '';
      return String(rawDate).substring(0, 10);
    }).filter(Boolean);
    console.log('\nUnique session dates:', [...new Set(sessionDates)].sort());
    
    // Check time fields
    const sessionTimes = allSessions.map(s => {
      return s.test_time || s.start_time || s.time || s.time_slot || 
        s.start_time_in_tc_time_zone || s.exam_session?.test_time || 
        s.exam_session?.start_time || s.schedule?.test_time || '';
    }).filter(Boolean);
    console.log('Unique session times:', [...new Set(sessionTimes)].sort());
  }
  
  fs.writeFileSync(path.join(__dirname, '..', 'debug-all-sessions-response.json'), JSON.stringify(allSessionsData, null, 2));
  console.log('\nFull all-sessions response saved to debug-all-sessions-response.json');
}

main().catch(console.error);
