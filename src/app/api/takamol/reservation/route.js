import { NextResponse } from 'next/server';
import { fetchReservation } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { reservationId } = await request.json();

    if (!reservationId) {
      return NextResponse.json({ success: false, error: 'reservationId is required' }, { status: 400 });
    }

    const reservation = await fetchReservation(reservationId);

    // SVP's reschedule wizard (chunk 7083) builds the language list from the
    // reservation's category.prometric_codes, keeping only codes whose
    // non_targeted flag matches the user (targeted user -> non_targeted === false)
    // and whose question_count matches the exam type (15 for this labor flow).
    const codes = (reservation.category?.prometric_codes || []).filter(
      (c) => c?.non_targeted === false
    );
    const langOfRes = codes.find((c) => c.language_code === reservation.language_code);
    const questionCount = langOfRes?.question_count || 15;
    const languages = codes.filter((c) => c.question_count === questionCount);

    const testCenter = reservation.test_center || {};
    const currentSession = reservation.exam_session || {};

    return NextResponse.json({
      success: true,
      data: {
        reservation: {
          id: reservation.id,
          reservation_status: reservation.reservation_status,
          language_code: reservation.language_code,
          methodology: reservation.methodology,
          can_be_rescheduled: reservation.can_be_rescheduled,
          category_id: reservation.category?.id,
          category_name: reservation.category?.english_name,
          test_center: {
            id: testCenter.test_center_id || testCenter.id || null,
            name: testCenter.test_center_name || testCenter.name || '',
            city: testCenter.test_center_city || testCenter.city || '',
            address: testCenter.address || ''
          },
          current_session: {
            id: reservation.exam_session_id || currentSession.id || null,
            date: currentSession.test_date || currentSession.start_date_in_tc_time_zone || '',
            time: currentSession.test_time || currentSession.start_at_in_tc_time_zone || '',
            center_name: currentSession.test_center?.test_center_name || currentSession.test_center?.name || ''
          }
        },
        languages
      }
    });
  } catch (error) {
    console.error('[takamol/reservation] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
