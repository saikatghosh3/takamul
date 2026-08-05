import { rebookViaAPI } from '../src/lib/svp-playwright.js';
import { getToken, authenticatedFetch } from '../src/lib/svp-auth.js';

const params = {
  occupationId: 2063,
  examSessionId: 'dr9UcoucNw--naSoBmJVguAEDF',
  languageCode: 'OFFBB',
  methodology: 'in_person',
  categoryId: 160,
  cityName: 'Cumilla',
  testDate: '2026-08-16',
  siteId: 62,
  siteCity: 'Cumilla'
};

const token = getToken();
console.log('[live-rebook] token loaded:', !!token);

const result = await rebookViaAPI(params);
console.log('\n=== REBOOK RESULT ===');
console.log('ok:', result.ok, 'status:', result.status);
console.log(JSON.stringify(result, null, 2).substring(0, 3000));

const created = result.data?.exam_reservation || result.data;
const reservationId = created?.id || created?.reservation_id || created?.reservationId || (result.ok && result.data?.reservationId);
console.log('\nreservationId:', reservationId);
console.log('created.exam_session?.test_center:', JSON.stringify(created?.exam_session?.test_center));
console.log('created.test_center:', JSON.stringify(created?.test_center));

if (reservationId) {
  try {
    const res = await authenticatedFetch(`https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_reservations/${reservationId}`);
    const data = await res.json();
    console.log('\n=== FRESH RESERVATION READBACK ===');
    console.log('status:', res.status);
    console.log('reservation id:', data.id);
    console.log('reservation_status:', data.reservation_status, 'paid:', data.paid);
    console.log('exam_session_id:', data.exam_session_id);
    console.log('test_center (reservation):', JSON.stringify(data.test_center));
    console.log('exam_session.test_center:', JSON.stringify(data.exam_session?.test_center));
    console.log('exam_session.test_center.name:', data.exam_session?.test_center?.name);
    console.log('exam_session.test_date:', data.exam_session?.test_date, 'test_time:', data.exam_session?.test_time);
  } catch (e) {
    console.error('readback failed:', e.message);
  }
}
process.exit(0);
