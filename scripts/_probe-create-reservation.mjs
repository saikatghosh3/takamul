import { getToken, authenticatedFetch } from '../src/lib/svp-auth.js';

const BASE = 'https://svp-international-api.pacc.sa/api/v1';
const token = getToken();
console.log('[probe-res] token loaded:', !!token);

const q = await authenticatedFetch(`${BASE}/individual_labor_space/exam_sessions?category_id=159&exam_date=2026-08-16&test_center_id=62&available_seats=greater_than::0`);
const qb = await q.json();
const sessions = qb.exam_sessions || qb.data || [];
console.log('[probe-res] tc-62 cat159 2026-08-16 count:', sessions.length);
for (const s of sessions.slice(0, 4)) {
  console.log('  id:', String(s.id).slice(0, 28), 'tc:', JSON.stringify(s.test_center));
}
const sid = sessions[0]?.id;
if (!sid) { console.log('no session to test'); process.exit(1); }

const shapes = [
  { name: 'minimal', body: { exam_session_id: String(sid), occupation_id: 2061, language_code: 'LOABB', methodology: 'in_person' } },
  { name: 'rebook-shape', body: { exam_session_id: String(sid), occupation_id: 2061, language_code: 'LOABB', methodology: 'in_person', site_id: 62, site_city: 'Cumilla', hold_id: null, duration: null, start_at: null, country_id: 78, accept_declaration: true, info_confirmation: true, practical_confirmation: true } },
  { name: 'minimal+site', body: { exam_session_id: String(sid), occupation_id: 2061, language_code: 'LOABB', methodology: 'in_person', site_id: 62, site_city: 'Cumilla' } },
];

for (const shape of shapes) {
  const res = await authenticatedFetch(`${BASE}/individual_labor_space/exam_reservations`, {
    method: 'POST', body: JSON.stringify(shape.body)
  });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`\n[${shape.name}] status=${res.status}`);
  const j = typeof data === 'object' ? JSON.stringify(data).substring(0, 800) : String(data).substring(0, 400);
  console.log('  ', j);
  if (res.ok) {
    const r = data.exam_reservation || data;
    console.log('  → created id:', r.id || r.reservation_id);
    console.log('  → test_center:', JSON.stringify(r.test_center || (r.exam_session && r.exam_session.test_center)));
    break;
  }
}
process.exit(0);
