import { NextResponse } from 'next/server';
import { isLoggedIn, rebookViaAPI } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { categoryId, cityName, newDate, examSessionId, languageCode, methodology } = await request.json();

    if (!examSessionId) {
      return NextResponse.json(
        { success: false, error: 'examSessionId is required. Select an exam session first.' },
        { status: 400 }
      );
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════');
    console.log('║  [SERVER] Incoming Rebook Request');
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  categoryId:    ${categoryId}`);
    console.log(`║  cityName:      ${cityName}`);
    console.log(`║  newDate:       ${newDate}`);
    console.log(`║  examSessionId: ${examSessionId}`);
    console.log(`║  languageCode:  ${languageCode}`);
    console.log(`║  methodology:   ${methodology}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');

    const result = await rebookViaAPI({
      occupationId: categoryId,
      examSessionId,
      languageCode: languageCode || 'en',
      methodology: methodology || 1,
      categoryId,
      cityName,
      testDate: newDate
    });

    console.log(`[exam/rebook] Raw result: ${JSON.stringify(result).substring(0, 1000)}`);

    if (result && result.ok) {
      console.log('[exam/rebook] Success:', result.status);
      const reservation = result.data?.exam_reservation || result.data;
      const responseData = {
        message: 'Rebooked successfully',
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

    const errorMsg = (result?.data && (result.data.message || result.data.error)) || result?.error || 'Rebook failed';
    console.error('[exam/rebook] Failed:', errorMsg, result?.status, JSON.stringify(result?.data)?.substring(0, 500));
    return NextResponse.json({ success: false, error: errorMsg }, { status: result?.status || 500 });
  } catch (error) {
    console.error('[exam/rebook] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
