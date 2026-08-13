import { NextResponse } from 'next/server';
import { isLoggedIn, rescheduleViaAPI } from '@/lib/svp-playwright';
import { fetchExamSessions } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language, languageCode } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session/Reservation ID is required' },
        { status: 400 }
      );
    }

    if (!examSessionId) {
      return NextResponse.json(
        { success: false, error: 'examSessionId is required. Select the exact exam session you want (its test center is what gets assigned).' },
        { status: 400 }
      );
    }

    const langCode = languageCode || language;
    if (!langCode) {
      return NextResponse.json(
        { success: false, error: 'languageCode is required. Please select a language.' },
        { status: 400 }
      );
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════');
    console.log('║  [SERVER] Incoming Reschedule Request');
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  reservationId: ${sessionId}`);
    console.log(`║  newDate:       ${newDate || '(none)'}`);
    console.log(`║  categoryId:    ${categoryId || '(none)'}`);
    console.log(`║  testCenterId:  ${testCenterId || '(none)'}`);
    console.log(`║  examSessionId: ${examSessionId}`);
    console.log(`║  cityName:      ${cityName || '(none)'}`);
    console.log(`║  languageCode:  ${langCode}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');

    // Pre-post safety check: confirm the picked exam session belongs to the
    // selected center BEFORE posting. exam_sessions scoped by test_center_id
    // returns a disjoint token set per center (verified live, including with
    // reservation_id), so a session missing from the center-scoped list cannot
    // be that center's session. The reschedule list is always the targeted
    // source, so this is exact.
    if (testCenterId) {
      try {
        const verify = await fetchExamSessions(categoryId, newDate, cityName, testCenterId, sessionId);
        const scopedIds = (verify.sessions || []).map(s => String(s.id || s.exam_session_id || s.exam_session?.id));
        if (scopedIds.length > 0 && !scopedIds.includes(String(examSessionId))) {
          console.warn(`[exam/reschedule] SAFETY BLOCK: exam_session_id ${examSessionId} not in center ${testCenterId} scoped list (${scopedIds.length} sessions). Refusing to post.`);
          return NextResponse.json(
            {
              success: false,
              error: `Safety check: the selected session does not belong to the chosen center (center id ${testCenterId}). Refusing to post. Reload sessions and pick a session listed under that center.`
            },
            { status: 409 }
          );
        }
      } catch (e) {
        console.warn(`[exam/reschedule] Safety verify failed (continuing): ${e.message}`);
      }
    }

    const result = await rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, langCode);

    console.log(`[exam/reschedule] Raw result: ${JSON.stringify(result).substring(0, 1000)}`);

    if (result && result.ok) {
      console.log('[exam/reschedule] Success:', result.status);
      const reservation = result.data?.exam_reservation || result.data;
      const responseData = {
        message: 'Rescheduled successfully',
        ...(reservation ? {
          reservationId: reservation.id,
          status: reservation.reservation_status,
          testDate: reservation.exam_session?.test_date,
          testTime: reservation.exam_session?.test_time,
          center: reservation.test_center ? {
            id: reservation.test_center.id || reservation.test_center.test_center_id,
            name: reservation.test_center.test_center_name || reservation.test_center.name,
            city: reservation.test_center.test_center_city || reservation.test_center.city,
            address: reservation.test_center.test_center_address || reservation.test_center.address
          } : null
        } : result.data)
      };
      return NextResponse.json({ success: true, data: responseData });
    }

    const errorMsg = (result?.data && (result.data.message || result.data.error)) || result?.error || 'Reschedule failed';
    console.error('[exam/reschedule] Failed:', errorMsg, result?.status, JSON.stringify(result?.data)?.substring(0, 500));
    return NextResponse.json({ success: false, error: errorMsg }, { status: result?.status || 500 });
  } catch (error) {
    console.error('[exam/reschedule] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
