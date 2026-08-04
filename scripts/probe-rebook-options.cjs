// Read-only probe of the SVP rebook (createReservation) options, mirroring
// exactly what the app's rebook flow builds (see src/app/page.js rebook panel,
// src/lib/svp-playwright.js rebookViaAPI, SVP bundle chunks 8189/6533).
// Usage:  node scripts/probe-rebook-options.cjs [reservationId]
// Sends GETs only. Requires .svp-token.json (from a login).

const fs = require('fs');
const path = require('path');

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const TOKEN_FILE = path.join(__dirname, '..', '.svp-token.json');

const HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Origin': 'https://svp-international.pacc.sa',
  'Referer': 'https://svp-international.pacc.sa/',
};

function getToken() {
  const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
  const token = String(data.token || '').replace(/^Bearer /, '');
  if (!token) throw new Error(`No token in ${TOKEN_FILE}`);
  const expiry = data.expiry ? new Date(data.expiry) : null;
  if (expiry && expiry < new Date()) throw new Error('Token expired, please login again.');
  return token;
}

async function api(pathname, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${pathname}${qs ? '?' + qs : ''}`;
  const res = await fetch(url, { headers: { ...HEADERS, 'Authorization': `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`${url} -> error: ${json.error}`);
  return json;
}

// Exact SVP booking-wizard language filter (chunk 8189 handleUpdateLanguageList).
// Bangladesh = country exam_type 'both', in_person methodology, prometric engine id 1.
function prometricLanguages(category) {
  const codes = (category?.prometric_codes || []).filter(c => c?.non_targeted === false);
  const q = (category?.in_person_exam_type === 'category_settings') ? 15
    : (category?.in_person_exam_type === 'cbt') ? 30
    : (category?.exam_type === 'cbt') ? 30 : 15;
  return codes.filter(c => c.question_count === q && (c.exam_engine_id === 1 || c.exam_engine_name === 'prometric'));
}

async function main() {
  const givenId = process.argv[2];

  let reservation = null;
  if (givenId) {
    reservation = await api(`/individual_labor_space/exam_reservations/${givenId}`);
    console.log(`\n=== RESERVATION ${givenId} ===`);
  } else {
    const list = await api('/individual_labor_space/exam_reservations', { per_page: '100' });
    const reservations = list.exam_reservations || list.data || list.reservations || [];
    console.log(`\nReservations fetched: ${reservations.length}`);
    reservations.slice(0, 8).forEach((r, i) => console.log(
      `  [${i}] id=${r.id} status=${r.reservation_status || r.status} date=${r.exam_session?.start_at || r.test_date} lang=${r.language_code || ''}`
    ));
    const cancelled = reservations.find(r => ['cancelled', 'canceled'].includes(String(r.reservation_status || r.status).toLowerCase()));
    if (!cancelled) { console.log('No cancelled reservation found to rebook. Pass an id explicitly.'); return; }
    reservation = cancelled;
    console.log(`Using reservation id=${reservation.id}`);
  }

  const rid = String(reservation.id);
  const cat = reservation.category || {};
  const occ = reservation.occupation || {};
  console.log('  category_id:', cat.id, '|', cat.english_name || '');
  console.log('  occupation_id:', occ.id, '|', occ.english_name || occ.name || '');
  console.log('  methodology:', reservation.methodology, '(must be the string in_person, not a number)');
  console.log('  reservation.language_code (ISO):', reservation.language_code);

  // 1) Languages -> prometric codes the wizard would offer
  const langs = prometricLanguages(cat);
  console.log(`\n=== REBOOK LANGUAGES (wizard-exact filter, in_person, prometric engine) ${langs.length} ===`);
  langs.forEach(l => console.log(
    `  code=${l.code} | en=${l.english_name} | iso=${l.language_code} | q=${l.question_count}`
  ));
  const current = langs.find(l => l.language_code === reservation.language_code);
  console.log('Current ISO', reservation.language_code, '-> prometric code to SEND:', current?.code || '(not found)');
  if (langs.length === 0) { console.log('No rebookable languages for this reservation.'); return; }
  const sendCode = current?.code || langs[0].code;

  // 2) Booking-style sessions for this category (no reservation_id) on available dates
  const startFrom = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const sessionsJson = await api('/individual_labor_space/exam_sessions', {
    category_id: String(cat.id),
    country_id: '78',
    per_page: '100',
    date: startFrom,
    available_seats: 'greater_than::0',
  });
  const sessions = sessionsJson.exam_sessions || sessionsJson.sessions || sessionsJson.data || [];
  console.log(`\n=== BOOKING-STYLE EXAM SESSIONS (date=${startFrom}) ${sessions.length} ===`);
  if (sessions.length > 0) {
    console.log('  sample keys:', Object.keys(sessions[0]).join(', '));
    console.log('  sample:', JSON.stringify(sessions[0]).substring(0, 600));
  }

  // 3) Prometric sites + slots for the language code to send
  const cities = [...new Set(sessions.map(s => s.test_center?.city || s.city || '').filter(Boolean))].sort();
  console.log('  cities present:', cities.join(', ') || '(none)');
  if (cities.length === 0) { console.log('  (no city to query prometric sites)'); return; }
  const city = cities[0];
  const sitesJson = await api('/individual_labor_space/prometric_scheduling/sites_availabilities', {
    prometric_code: sendCode,
    city,
    start_date: startFrom,
    end_date: startFrom,
  });
  const sites = sitesJson.sites || sitesJson.data || [];
  console.log(`\n=== PROMETRIC SITES (code=${sendCode} city=${city} date=${startFrom}) ${sites.length} ===`);
  sites.forEach(s => console.log(`  site_id=${s.site_id || s.id} | ${s.site_name || s.name || ''} | ${s.site_city || s.city || ''}`));
  if (sites.length === 0) { console.log('  none'); return; }

  const siteIds = sites.map(s => s.site_id || s.id).join(',');
  const slotsJson = await api('/individual_labor_space/prometric_scheduling/slots_availabilities', {
    site_ids: siteIds,
    exam_id: '',
    start_date: startFrom,
    end_date: startFrom,
  });
  const slots = slotsJson.slots_availabilities || slotsJson.slots || slotsJson.data || [];
  console.log(`\n=== PROMETRIC SLOTS (date=${startFrom}) ${slots.length} ===`);
  slots.slice(0, 20).forEach(s => console.log(
    `  slot_id=${s.id || s.slot_id || s.exam_session_id} | site=${s.site_id || ''} | time=${s.startDateTime || s.start_at || s.start_time || ''} | duration=${s.duration ?? ''} | seats=${s.available_seats ?? s.seats_available ?? ''}`
  ));
  if (slots.length === 0) { console.log('  none'); return; }
  const slot = slots[0];

  // 4) The exact payloads the app would send (dry run only, NOT sent)
  console.log(`\n=== WOULD-BE SLOT HOLD PAYLOAD (NOT SENT, dry run) ===`);
  console.log(JSON.stringify(slot.site_id
    ? { slot_id: String(slot.id || slot.slot_id || slot.exam_session_id), site_id: String(slot.site_id) }
    : { exam_session_id: String(slot.id || slot.slot_id || slot.exam_session_id) }, null, 2));

  console.log(`\n=== WOULD-BE REBOOK (createReservation) PAYLOAD (NOT SENT, dry run) ===`);
  console.log(JSON.stringify({
    exam_session_id: String(slot.id || slot.slot_id || slot.exam_session_id),
    occupation_id: Number(occ.id) || occ.id,
    language_code: sendCode,
    methodology: reservation.methodology || 'in_person',
    site_id: slot.site_id || null,
    site_city: city || null,
    hold_id: null,
    duration: slot.duration ?? null,
    start_at: slot.startDateTime || slot.start_at || slot.start_time || null,
  }, null, 2));
  console.log('\n  NOTE: site_id/site_city are informational; SVPI assigns the test center of exam_session_id.');
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
