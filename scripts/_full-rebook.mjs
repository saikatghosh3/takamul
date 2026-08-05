import { getToken, authenticatedFetch } from '../src/lib/svp-auth.js';
import { rebookViaAPI } from '../src/lib/svp-playwright.js';

const BASE = 'https://svp-international-api.pacc.sa/api/v1';
console.log('[full-rebook] token loaded:', !!getToken());

const q = await authenticatedFetch(`${BASE}/individual_labor_space/exam_sessions?category_id=159&exam_date=2026-08-16&test_center_id=62&available_seats=greater_than::0`);
const qb = await q.json();
const sessions = (qb.exam_sessions || qb.data || []).filter(s => s.id);
console.log('[full-rebook] tc-62 cat159 2026-08-16 sessions:', sessions.length);
const sid = sessions[0]?.id;
if (!sid) { console.log('NO SESSION'); process.exit(1); }
console.log('[full-rebook] booking session:', String(sid).slice(0, 30), '…');

const cancelRes = await authenticatedFetch(`${BASE}/individual_labor_space/exam_reservations/4926912/cancel`, {
  method: 'POST', body: JSON.stringify({ cancellation_reason: 'rebooking at Cumilla TTC' })
});
const cancelText = await cancelRes.text();
console.log('[full-rebook] CANCEL 4926912:', cancelRes.status, String(cancelText).substring(0, 300));

const result = await rebookViaAPI({
  occupationId: 2061,
  examSessionId: sid,
  languageCode: 'LOABB',
  methodology: 'in_person',
  categoryId: 159,
  cityName: 'Cumilla',
  testDate: '2026-08-16',
  siteId: 62,
  siteCity: 'Cumilla'
});
console.log('\n=== REBOOK RESULT ===');
console.log('ok:', result.ok, 'status:', result.status);
console.log(JSON.stringify(result, null, 2).substring(0, 2500));

const created = result.data?.exam_reservation || result.data;
const reservationId = created?.id || created?.reservation_id || created?.reservationId;
console.log('\nreservationId:', reservationId);

if (reservationId) {
  await new Promise(r => setTimeout(r, 3000));
  const res = await authenticatedFetch(`${BASE}/individual_labor_space/exam_reservations/${reservationId}`);
  const data = await res.json();
  console.log('\n=== FRESH RESERVATION READBACK ===');
  console.log('status:', res.status);
  console.log('id:', data.id, 'reservation_status:', data.reservation_status, 'paid:', data.paid);
  console.log('exam_session_id:', data.exam_session_id);
  console.log('exam_session.test_center:', JSON.stringify(data.exam_session?.test_center));
  console.log('exam_session.test_date:', data.exam_session?.test_date, 'time:', data.exam_session?.test_time);
  console.log('reservation.test_center:', JSON.stringify(data.test_center));
  console.log('ASSIGNED CENTER NAME:', data.exam_session?.test_center?.name || data.test_center?.test_center_name || '(none)');
  console.log('ASSIGNED CENTER ID:', data.exam_session?.test_center?.id || data.test_center?.test_center_id || '(none)');
}
process.exit(0);
