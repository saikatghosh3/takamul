import { NextResponse } from 'next/server';
import { isLoggedIn, rescheduleViaAPI } from '@/lib/svp-playwright';
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

function langOf(reservation) {
  if (!reservation) return null;
  const es = reservation.exam_session || {};
  return es.language_code || reservation.language_code || reservation.language || es.language || null;
}

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, language, languageCode, testCenterName } = await request.json();

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
    console.log(`║  testCenterName:${testCenterName || '(none)'}`);
    console.log(`║  languageCode:  ${langCode}`);
    console.log('╚═══════════════════════════════════════════════════════════');
    console.log('');

    // NOTE (verified live 2026-08-15): this pre-post check is a WARNING ONLY,
    // not a block. test_center_id does NOT reliably scope exam_sessions to one
    // center — the query for center 174 returned a token (DXEDnvkTWA--...) that
    // SVPI assigned to center 62 (Cumilla TTC). So a token missing/extra in the
    // scoped list proves nothing, and blocking on it would both allow wrong
    // bookings and refuse correct ones. The authoritative guard is the
    // POST-BOOKING verification below, which reads the reservation back from
    // SVPI and compares its assigned test center against the requested center.
    if (testCenterId) {
      try {
        const verify = await fetchExamSessions(categoryId, newDate, cityName, testCenterId, sessionId);
        const scopedIds = (verify.sessions || []).map(s => String(s.id || s.exam_session_id || s.exam_session?.id));
        if (scopedIds.length > 0 && !scopedIds.includes(String(examSessionId))) {
          console.warn(`[exam/reschedule] WARNING: exam_session_id ${examSessionId} not in center ${testCenterId} scoped list (${scopedIds.length} sessions). Proceeding — the post-booking check will catch a wrong center.`);
        }
      } catch (e) {
        console.warn(`[exam/reschedule] Safety verify failed (continuing): ${e.message}`);
      }
    }

    // Capture the current reservation BEFORE booking so a wrong-center booking
    // can be reverted to the exact session/date/language SVPI currently holds.
    let orig = null;
    try {
      orig = await fetchReservation(sessionId);
    } catch (e) {
      console.warn(`[exam/reschedule] Pre-booking reservation read failed (continuing): ${e.message}`);
    }
    const origRes = orig?.exam_reservation || orig;
    const origSessionToken = origRes?.exam_session?.id || origRes?.exam_session_id || null;
    const origDate = origRes?.exam_session?.test_date || origRes?.test_date || null;
    const origCenterId = centerIdOf(origRes?.test_center);
    const origLang = langOf(origRes);
    console.log(`[exam/reschedule] Original booking: token=${origSessionToken ? 'captured' : 'NOT CAPTURED'} date=${origDate || '?'} centerId=${origCenterId || '?'} lang=${origLang || '?'}`);

    const result = await rescheduleViaAPI(sessionId, newDate, categoryId, testCenterId, examSessionId, cityName, langCode);

    console.log(`[exam/reschedule] Raw result: ${JSON.stringify(result).substring(0, 1000)}`);

    if (result && result.ok) {
      console.log('[exam/reschedule] Success:', result.status);
      const reservation = result.data?.exam_reservation || result.data;
      const reservationId = reservation?.id || sessionId;

      // POST-BOOKING VERIFICATION: read the reservation back from SVPI and
      // confirm the assigned test center matches the one the user selected.
      // This is the only reliable signal — exam_sessions rows carry no center
      // id, and the test_center_id filter is known to leak other centers.
      let fresh = null;
      try {
        fresh = await fetchReservation(reservationId);
      } catch (e) {
        console.warn(`[exam/reschedule] Post-booking read failed (continuing): ${e.message}`);
      }
      const freshRes = fresh?.exam_reservation || fresh || reservation;
      const assignedCenterId = centerIdOf(freshRes?.test_center);
      const requestedCenterId = testCenterId == null ? null : String(testCenterId);
      const assignedCenterName = centerNameOf(freshRes?.test_center);
      const requestedCenterName = testCenterName || null;

      // Match if both id (when provided) and name (when provided) agree.
      const idMismatch = assignedCenterId && requestedCenterId && assignedCenterId !== requestedCenterId;
      const nameMismatch = requestedCenterName && assignedCenterName && normName(assignedCenterName) !== normName(requestedCenterName);

      if (idMismatch || nameMismatch) {
        console.error(`[exam/reschedule] CENTER MISMATCH: assigned center ${assignedCenterId} (${assignedCenterName || '?'}), requested ${requestedCenterId || requestedCenterName || '?'}. Attempting revert.`);

        let revert = null;
        if (origSessionToken && origDate) {
          try {
            const revertRes = await rescheduleViaAPI(reservationId, origDate, categoryId, origCenterId, origSessionToken, cityName, origLang || langCode);
            let revertFresh = null;
            if (revertRes.ok) {
              try { revertFresh = await fetchReservation(reservationId); } catch {}
            }
            const revertCenterId = centerIdOf((revertFresh?.exam_reservation || revertFresh)?.test_center);
            revert = {
              attempted: true,
              ok: !!revertRes.ok && revertCenterId === origCenterId,
              restoredCenterId: revertCenterId,
              restoredDate: (revertFresh?.exam_reservation || revertFresh)?.exam_session?.test_date || origDate,
              error: revertRes.ok ? (revertCenterId === origCenterId ? null : 'Revert landed on a different center') : (revertRes.error || `Revert failed (HTTP ${revertRes.status})`)
            };
          } catch (e) {
            revert = { attempted: true, ok: false, error: e.message };
          }
        } else {
          revert = { attempted: false, error: 'Original session token/date was not captured, so no revert was possible.' };
        }

        console.error(`[exam/reschedule] Revert result: ${JSON.stringify(revert)}`);
        return NextResponse.json(
          {
            success: false,
            error: `SVPI assigned the reservation to center #${assignedCenterId || '?'} (${assignedCenterName || 'unknown'}), not the selected center ${requestedCenterId ? `#${requestedCenterId}` : `"${requestedCenterName || 'unknown'}"`}. ${revert?.ok ? 'The original booking was restored.' : 'The booking could NOT be restored — check SVPI and fix it manually.'}`,
            data: {
              assignedCenterId,
              requestedCenterId,
              requestedCenterName,
              assignedCenterName,
              ...(freshRes ? {
                reservationId: freshRes.id || reservationId,
                status: freshRes.reservation_status,
                testDate: freshRes.exam_session?.test_date,
                testTimeInTc: freshRes.exam_session?.start_at_in_tc_time_zone || freshRes.exam_session?.test_time
              } : {}),
              revert
            }
          },
          { status: 409 }
        );
      }

      console.log(`[exam/reschedule] Center verified: assigned ${assignedCenterId || 'unknown'} (${assignedCenterName || '?'}) vs requested ${requestedCenterId || requestedCenterName || 'n/a'}`);
      const responseData = {
        message: 'Rescheduled successfully',
        ...(freshRes ? {
          reservationId: freshRes.id || reservationId,
          status: freshRes.reservation_status,
          testDate: freshRes.exam_session?.test_date,
          testTime: freshRes.exam_session?.test_time,
          testTimeInTc: freshRes.exam_session?.start_at_in_tc_time_zone || freshRes.exam_session?.test_time,
          center: freshRes.test_center ? {
            id: freshRes.test_center.id || freshRes.test_center.test_center_id,
            name: freshRes.test_center.test_center_name || freshRes.test_center.name,
            city: freshRes.test_center.test_center_city || freshRes.test_center.city,
            address: freshRes.test_center.test_center_address || freshRes.test_center.address
          } : null
        } : reservation ? {
          reservationId: reservation.id,
          status: reservation.reservation_status,
          testDate: reservation.exam_session?.test_date,
          testTime: reservation.exam_session?.test_time,
          testTimeInTc: reservation.exam_session?.start_at_in_tc_time_zone || reservation.exam_session?.test_time,
          center: reservation.test_center ? {
            id: reservation.test_center.id || reservation.test_center.test_center_id,
            name: reservation.test_center.test_center_name || reservation.test_center.name,
            city: reservation.test_center.test_center_city || reservation.test_center.city,
            address: reservation.test_center.test_center_address || reservation.test_center.address
          } : null
        } : result.data),
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

    const errorMsg = (result?.data && (result.data.message || result.data.error)) || result?.error || 'Reschedule failed';
    console.error('[exam/reschedule] Failed:', errorMsg, result?.status, JSON.stringify(result?.data)?.substring(0, 500));
    return NextResponse.json({ success: false, error: errorMsg }, { status: result?.status || 500 });
  } catch (error) {
    console.error('[exam/reschedule] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
