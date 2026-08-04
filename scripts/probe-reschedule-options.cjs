// Read-only probe of the SVP reschedule options, mirroring exactly what the
// app's reschedule flow calls (see src/lib/takamol.js + SVP bundle chunks 7083/2915).
// Usage:  node scripts/probe-reschedule-options.cjs [reservationId]
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

const short = (o, len = 400) => JSON.stringify(o).substring(0, len);

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
    reservations.slice(0, 5).forEach((r, i) => console.log(
      `  [${i}] id=${r.id} status=${r.reservation_status || r.status} date=${r.test_date || r.exam_session?.test_date} lang=${r.language_code || r.language?.code || ''}`
    ));
    const scheduled = reservations.find(r => !['completed', 'passed', 'cancelled'].includes(String(r.reservation_status || r.status).toLowerCase()));
    if (!scheduled) { console.log('No reschedulable reservation found. Pass an id explicitly.'); return; }
    reservation = scheduled;
    console.log(`Using reservation id=${reservation.id}`);
  }

  const rid = String(reservation.id);
  const catId = String(reservation.category?.id || reservation.occupation?.id || reservation.category_id || reservation.occupation_id || '');
  console.log('  category_id:', catId, '| name:', reservation.category?.english_name || reservation.occupation?.english_name || '');

  // 1) Languages (prometric codes) from category.prometric_codes
  const prometricCodes = reservation.category?.prometric_codes || reservation.occupation?.prometric_codes || [];
  const langs = prometricCodes.filter(c => c?.non_targeted === false);
  console.log(`\n=== LANGUAGES (prometric codes, non_targeted=false) ${langs.length} of ${prometricCodes.length} ===`);
  langs.forEach(l => console.log(
    `  code=${l.code} | en=${l.english_name} | lang_code=${l.language_code} | q_count=${l.question_count} | engine=${l.exam_engine_name || ''} (${l.exam_engine_id || ''})`
  ));
  const current = langs.find(l => l.language_code === reservation.language_code);
  console.log('Current reservation language_code:', reservation.language_code, '-> prometric code:', current?.code || '(not found)');

  // 2) Reschedule available_dates (wizard params, start_at_date_from = now+2d)
  const startFrom = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const datesJson = await api('/individual_labor_space/exam_sessions/available_dates', {
    reservation_id: rid,
    category_id: catId,
    start_at_date_from: startFrom,
    available_seats: 'greater_than::0',
    status: 'scheduled',
  });
  const rawDates = datesJson.available_dates || datesJson.dates || datesJson.data || [];
  console.log(`\n=== RESCHEDULE AVAILABLE DATES (start_at_date_from=${startFrom}) ${rawDates.length} ===`);
  if (rawDates.length === 0) { console.log('  none'); return; }
  const cities = [...new Set(rawDates.map(d => d.test_center?.city || d.city || '').filter(Boolean))].sort();
  const dates = [...new Set(rawDates.map(d =>
    String(d.start_date_in_tc_time_zone || d.start_at_in_tc_time_zone || d.date || d.start_date || '').match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''
  ).filter(Boolean))].sort();
  console.log('  cities:', cities.join(', '));
  console.log('  dates :', dates.join(', '));
  const firstRaw = rawDates[0];
  console.log('  sample item keys:', Object.keys(firstRaw).join(', '));
  console.log('  sample item:', short(firstRaw, 700));

  // 3) Prometric sites for the current reservation's language code + first city/date
  if (!current || !cities.length || !dates.length) { console.log('  (need a language code, a city and a date to continue)'); return; }
  const city = cities[0];
  const date = dates[0];
  const sitesJson = await api('/individual_labor_space/prometric_scheduling/sites_availabilities', {
    prometric_code: current.code,
    city,
    start_date: date,
    end_date: date,
  });
  const sites = sitesJson.sites || sitesJson.data || [];
  console.log(`\n=== PROMETRIC SITES (code=${current.code} city=${city} date=${date}) ${sites.length} ===`);
  sites.forEach(s => console.log(`  site_id=${s.site_id || s.id} | ${s.site_name || s.name || ''} | ${s.site_city || s.city || ''} | ${s.site_address || s.address || ''}`));
  if (sites.length === 0) { console.log('  none'); return; }

  // 4) Prometric slots for those sites (slot.id = exam_session_id to send)
  const siteIds = sites.map(s => s.site_id || s.id).join(',');
  const slotsJson = await api('/individual_labor_space/prometric_scheduling/slots_availabilities', {
    site_ids: siteIds,
    exam_id: '',
    start_date: date,
    end_date: date,
  });
  const slots = slotsJson.slots_availabilities || slotsJson.slots || slotsJson.data || [];
  console.log(`\n=== PROMETRIC SLOTS (date=${date}) ${slots.length} ===`);
  slots.slice(0, 20).forEach(s => console.log(
    `  slot_id=${s.id || s.slot_id || s.exam_session_id} | site=${s.site_id || ''} | ${s.site_name || ''} | date=${s.date || s.start_date || ''} | time=${s.start_time || s.time || ''} | seats=${s.seats_available ?? s.available_seats ?? ''}`
  ));
  if (slots.length === 0) { console.log('  none'); return; }

  // 5) The exact reschedule payload the app would POST (dry run only, NOT sent)
  const slot = slots[0];
  console.log(`\n=== WOULD-BE RESCHEDULE PAYLOAD (NOT SENT, dry run) ===`);
  console.log(JSON.stringify({
    id: Number(rid),
    exam_session_id: slot.id || slot.slot_id || slot.exam_session_id,
    language_code: current.code,
  }, null, 2));
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
