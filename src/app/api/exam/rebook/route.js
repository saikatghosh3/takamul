import { NextResponse } from 'next/server';
import { isLoggedIn, rebookViaAPI, cancelViaAPI } from '@/lib/svp-playwright';
import { fetchExamSessions, fetchReservation } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

function centerIdOf(testCenter) {
  if (!testCenter) return null;
  const id = testCenter.id ?? testCenter.test_center_id;
  return id == null ? null : String(id);
}

function centerNameOf(testCenter) {
  if (!testCenter) return null;
  return testCenter.test_center_name || testCenter.name || null;
}

// Loose match for center names: SVPI returns "Cumilla Technical Training
// Centre", t2hub returns the same, but spacing/case/punctuation can vary.
function normName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^\w\d]+/g, ' ')
    .trim();
}

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { categoryId, occupationId, cityName, newDate, examSessionId, languageCode, methodology, siteId, siteCity, duration, startAt, sessionsSource, testCenterName } = await request.json();

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
    console.log(`║  testCenterName:${testCenterName || '(none)'}`);
    console.log(`║  duration:      ${duration}`);
    console.log(`║  startAt:       ${startAt}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');

    // NOTE (verified live 2026-08-15): this pre-post check is a WARNING ONLY,
    // not a block. test_center_id does NOT reliably scope exam_sessions to one
    // center — a query scoped to center 174 returned a token that SVPI assigned
    // to center 62. So a token missing/extra in the scoped list proves nothing,
    // and blocking on it would both allow wrong bookings and refuse correct
    // ones. The authoritative guard is the POST-BOOKING verification below,
    // which reads the new reservation back from SVPI and compares its assigned
    // test center against the requested center (siteId), cancelling on mismatch.
    if (sessionsSource !== 'prometric' && siteId) {
      try {
        const verify = await fetchExamSessions(categoryId, newDate, cityName, siteId);
        const scopedIds = (verify.sessions || []).map(s => String(s.id || s.exam_session_id || s.exam_session?.id));
        if (scopedIds.length > 0 && !scopedIds.includes(String(examSessionId))) {
          console.warn(`[exam/rebook] WARNING: exam_session_id ${examSessionId} not in center ${siteId} scoped list (${scopedIds.length} sessions). Proceeding — the post-booking check will catch a wrong center.`);
        }
      } catch (e) {
        console.warn(`[exam/rebook] Safety verify failed (continuing): ${e.message}`);
      }
    }

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
        const reservationId = reservation.id || reservation.reservation_id || reservation.reservationId;

        // POST-BOOKING VERIFICATION: read the new reservation back from SVPI
        // and confirm the assigned test center matches the one the user picked.
        // exam_sessions rows carry no center id and the test_center_id filter is
        // known to leak other centers, so this read-back is the only reliable
        // signal. On mismatch the fresh reservation is cancelled immediately.
        let fresh = null;
        try {
          fresh = await fetchReservation(reservationId);
        } catch (e) {
          console.warn(`[exam/rebook] Post-booking read failed (continuing): ${e.message}`);
        }
        const freshRes = fresh?.exam_reservation || fresh || reservation;
        const assignedCenterId = centerIdOf(freshRes?.test_center);
        const requestedCenterId = siteId == null ? null : String(siteId);
        const assignedCenterName = centerNameOf(freshRes?.test_center);
        const requestedCenterName = testCenterName || null;

        // Match if both id (when provided) and name (when provided) agree.
        const idMismatch = assignedCenterId && requestedCenterId && assignedCenterId !== requestedCenterId;
        const nameMismatch = requestedCenterName && assignedCenterName && normName(assignedCenterName) !== normName(requestedCenterName);

        if (idMismatch || nameMismatch) {
          console.error(`[exam/rebook] CENTER MISMATCH: assigned center ${assignedCenterId} (${assignedCenterName || '?'}), requested ${requestedCenterId || requestedCenterName || '?'}. Cancelling reservation ${reservationId}.`);
          let cancel = null;
          try {
            const cancelRes = await cancelViaAPI(reservationId, 'Wrong test center assigned by SVPI');
            cancel = { attempted: true, ok: !!cancelRes.ok, status: cancelRes.status, error: cancelRes.ok ? null : (cancelRes.data?.message || cancelRes.data?.error || 'Cancel failed') };
          } catch (e) {
            cancel = { attempted: true, ok: false, error: e.message };
          }
          console.error(`[exam/rebook] Cancel result: ${JSON.stringify(cancel)}`);
          return NextResponse.json(
            {
              success: false,
              error: `SVPI assigned the new reservation to center #${assignedCenterId || '?'} (${assignedCenterName || 'unknown'}), not the selected center ${requestedCenterId ? `#${requestedCenterId}` : `"${requestedCenterName || 'unknown'}"`}. ${cancel?.ok ? 'The wrong-center reservation was cancelled. No new booking remains.' : 'The wrong-center reservation could NOT be cancelled — check SVPI and cancel it manually.'}`,
              data: {
                assignedCenterId,
                requestedCenterId,
                requestedCenterName,
                assignedCenterName,
                reservationId,
                status: freshRes.reservation_status || reservation.reservation_status,
                cancel
              }
            },
            { status: 409 }
          );
        }

        console.log(`[exam/rebook] Center verified: assigned ${assignedCenterId || 'unknown'} (${assignedCenterName || '?'}) vs requested ${requestedCenterId || requestedCenterName || 'n/a'}`);
        const examSession = freshRes.exam_session || reservation.exam_session || {};
        const testDateTime = examSession.start_at_in_tc_time_zone || examSession.start_at || '';
        const testDate = examSession.test_date || String(testDateTime).split(' ')[0] || undefined;
        const testTime = examSession.test_time || String(testDateTime).split(' ')[1] || undefined;
        const centerSource = freshRes.test_center || reservation.test_center;
        const responseData = {
          message: 'Rebooked successfully',
          reservationId,
          status: freshRes.reservation_status || reservation.reservation_status || reservation.status,
          testDate,
          testTime,
          testTimeInTc: examSession.start_at_in_tc_time_zone || undefined,
          center: centerSource ? {
            id: centerSource.id || centerSource.test_center_id,
            name: centerSource.test_center_name || centerSource.name,
            city: centerSource.test_center_city || centerSource.city,
            address: centerSource.test_center_address || centerSource.address
          } : null,
          verified: {
            assignedCenterId,
            requestedCenterId,
            assignedCenterName,
            requestedCenterName,
            matches: (requestedCenterId ? assignedCenterId === requestedCenterId : true) &&
                     (requestedCenterName ? normName(assignedCenterName) === normName(requestedCenterName) : true)
          }
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
