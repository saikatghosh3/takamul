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

    const { categoryId, occupationId, cityName, newDate, examSessionId, languageCode, methodology, siteId, siteCity, duration, startAt } = await request.json();

    if (!examSessionId) {
      return NextResponse.json(
        { success: false, error: 'examSessionId is required. Select an exam session first.' },
        { status: 400 }
      );
    }

    if (!occupationId) {
      return NextResponse.json(
        { success: false, error: 'occupationId is required. Select the occupation the reservation belongs to.' },
        { status: 400 }
      );
    }

    if (!languageCode) {
      return NextResponse.json(
        { success: false, error: 'languageCode is required. Send the SVPI prometric code (e.g. LOABB), not the ISO code (e.g. bn).' },
        { status: 400 }
      );
    }

    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════');
    console.log('║  [SERVER] Incoming Rebook Request');
    console.log('╠═══════════════════════════════════════════════════════════');
    console.log(`║  categoryId:    ${categoryId}`);
    console.log(`║  occupationId:  ${occupationId}`);
    console.log(`║  cityName:      ${cityName}`);
    console.log(`║  newDate:       ${newDate}`);
    console.log(`║  examSessionId: ${examSessionId}`);
    console.log(`║  languageCode:  ${languageCode} (PROMETRIC code, e.g. LOABB)`);
    console.log(`║  methodology:   ${methodology}`);
    console.log(`║  siteId:        ${siteId}`);
    console.log(`║  siteCity:      ${siteCity}`);
    console.log(`║  duration:      ${duration}`);
    console.log(`║  startAt:       ${startAt}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');

    const result = await rebookViaAPI({
      occupationId: occupationId ?? categoryId,
      examSessionId,
      languageCode,
      methodology: methodology || 'in_person',
      categoryId,
      cityName,
      testDate: newDate,
      siteId,
      siteCity,
      duration,
      startAt
    });

    console.log(`[exam/rebook] Raw result: ${JSON.stringify(result).substring(0, 1000)}`);

    if (result && result.ok) {
      const reservation = result.data?.exam_reservation || result.data;
      const hasRealReservation = !!(reservation && (reservation.id || reservation.reservation_id || reservation.reservationId));
      console.log(`[exam/rebook] Success: ${result.status} hasRealReservation=${hasRealReservation}`);
      if (hasRealReservation) {
        const examSession = reservation.exam_session || {};
        const testDateTime = examSession.start_at_in_tc_time_zone || examSession.start_at || '';
        const testDate = examSession.test_date || String(testDateTime).split(' ')[0] || undefined;
        const testTime = examSession.test_time || String(testDateTime).split(' ')[1] || undefined;
        const responseData = {
          message: 'Rebooked successfully',
          reservationId: reservation.id || reservation.reservation_id || reservation.reservationId,
          status: reservation.reservation_status || reservation.status,
          testDate,
          testTime,
          center: reservation.test_center ? {
            id: reservation.test_center.id || reservation.test_center.test_center_id,
            name: reservation.test_center.test_center_name || reservation.test_center.name,
            city: reservation.test_center.test_center_city || reservation.test_center.city,
            address: reservation.test_center.test_center_address || reservation.test_center.address
          } : null
        };
        return NextResponse.json({ success: true, data: responseData });
      }
      return NextResponse.json(
        { success: false, error: 'SVPI returned a 2xx response but no reservation id. The reservation was not created. Try again or pick another session.' },
        { status: 502 }
      );
    }

    const errorMsg = (result?.data && (result.data.message || result.data.error)) || result?.error || `Rebook failed (HTTP ${result?.status ?? 'unknown'})`;
    console.error('[exam/rebook] Failed:', errorMsg, result?.status, JSON.stringify(result?.data)?.substring(0, 500));
    return NextResponse.json(
      {
        success: false,
        error: errorMsg,
        ...(result?.reservationId ? { reservationId: result.reservationId, partial: true } : {})
      },
      { status: result?.status || 500 }
    );
  } catch (error) {
    console.error('[exam/rebook] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
