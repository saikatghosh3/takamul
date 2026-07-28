import { NextResponse } from 'next/server';
import { isLoggedIn, rescheduleViaAPI } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { sessionId, newDate, categoryId, testCenterId, examSessionId } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session/Reservation ID is required' },
        { status: 400 }
      );
    }

    if (!examSessionId && !newDate) {
      return NextResponse.json(
        { success: false, error: 'examSessionId or newDate is required' },
        { status: 400 }
      );
    }

    console.log(`[exam/reschedule] reservation=${sessionId} examSession=${examSessionId || '(none)'} date=${newDate} center=${testCenterId || '(none)'}`);

    const result = await rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId);

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
            id: reservation.test_center.id,
            name: reservation.test_center.test_center_name,
            city: reservation.test_center.test_center_city,
            address: reservation.test_center.test_center_address
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
