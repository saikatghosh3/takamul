import { NextResponse } from 'next/server';
import { fetchExamSessions, fetchPrometricSites, fetchPrometricSlots } from '@/lib/takamol';
import {
  hasT2hubAuth,
  fetchT2hubExamSessions,
  fetchT2hubAvailableDates,
  groupSessionsByCenter
} from '@/lib/t2hub-api';

export const dynamic = 'force-dynamic';

// Resolve the t2hub city display name (its filter is case-sensitive, e.g.
// "Cumilla" not "cumilla"). Falls back to whatever was passed.
async function resolveCityDisplayName(categoryId, city) {
  const requested = String(city || '').toLowerCase().replace(/-/g, ' ').trim();
  if (!requested) return city || '';
  try {
    const { available_dates } = await fetchT2hubAvailableDates({ categoryId });
    const seen = new Set();
    for (const d of available_dates || []) {
      const c = d?.test_center?.city || d?.city || '';
      if (c) seen.add(c);
    }
    for (const name of seen) {
      if (name.toLowerCase() === requested) return name;
    }
  } catch { /* fall through */ }
  return city || '';
}

// Merge slot data with its site so each session carries the test center name.
function mergeSlotsWithSites(slotsGroups, sites) {
  return slotsGroups.flatMap((group) => {
    const site = sites.find((s) => String(s.site_id) === String(group.site_id));
    return (group.slots || []).map((slot) => ({
      ...slot,
      site_id: group.site_id,
      site_name: site?.test_center?.name || '',
      site_city: site?.test_center?.address?.locality || site?.test_center?.city || '',
      site_address: site?.test_center?.address?.formattedAddress || '',
      test_center: {
        id: site?.test_center?.id ?? site?.test_center_id ?? null,
        test_center_name: site?.test_center?.name || '',
        city: site?.test_center?.address?.locality || site?.test_center?.city || ''
      }
    }));
  });
}

export async function POST(request) {
  try {
    const { category, date, city, testCenterId, reservationId, prometricCode, examId } = await request.json();

    if (!category) {
      return NextResponse.json({ success: false, error: 'category is required' }, { status: 400 });
    }

    // ── Primary source: t2hub (exact center NAME per session + seats) ─────────
    // t2hub's pacc-exam-sessions returns every session WITH its center name,
    // which the raw SVP API never exposes. Its encrypted_session_id is exactly
    // the SVPI exam_session_id token the reschedule/rebook payloads need, so the
    // session the user picks pins the exact center they saw. Returns both the
    // grouped centers (for the "know before you pick" list) and the flat list.
    if (hasT2hubAuth() && city && date) {
      try {
        const cityDisplayName = await resolveCityDisplayName(category, city);
        const { sessions, total } = await fetchT2hubExamSessions({
          categoryId: category,
          city: cityDisplayName,
          examDate: date
        });
        if (sessions.length > 0) {
          const grouped = groupSessionsByCenter(sessions);
          const centers = grouped.map((g, i) => ({
            id: `${cityDisplayName.toLowerCase().replace(/\s+/g, '-')}-${i}`,
            name: g.center_name,
            full_name: g.center_name,
            city: g.city || cityDisplayName,
            available: g.available,
            pending: g.pending,
            sessionsCount: g.sessionsCount,
            totalSeats: g.totalSeats,
            source: 't2hub',
            sessions: g.sessions.map((s, si) => ({
              id: s.encrypted_session_id || s.session_id || si,
              examSessionId: s.encrypted_session_id || s.session_id,
              session_id: s.session_id,
              available_seats: s.available_seats,
              status: s.status,
              time: s.available_seats != null ? `${s.available_seats} seat${s.available_seats === 1 ? '' : 's'}` : ''
            }))
          }));
          const flat = sessions.map(s => ({
            id: s.encrypted_session_id || s.session_id,
            examSessionId: s.encrypted_session_id || s.session_id,
            session_id: s.session_id,
            date: s.exam_date || date,
            city: s.center_city || cityDisplayName,
            centerName: s.center_name || '',
            seats: s.available_seats ?? null,
            status: s.status ?? null,
            siteId: null,
            duration: null,
            startAt: null,
            raw: s,
            source: 't2hub'
          }));
          console.log(`[takamol/sessions] t2hub: ${flat.length} sessions / ${centers.length} centers for ${cityDisplayName} on ${date}`);
          return NextResponse.json({
            success: true,
            data: {
              sessions: flat,
              centers,
              source: 't2hub',
              total,
              targeted: [],
              prometric: [],
              sites: [],
              warnings: []
            }
          });
        }
      } catch (e) {
        console.warn('[takamol/sessions] t2hub path failed, falling back to SVP:', e.message);
      }
    }

    // 1) Targeted getExamSessions (works for the reservation; carries city only).
    let targeted = [];
    let targetedError = '';
    try {
      const result = await fetchExamSessions(category, date, city, testCenterId, reservationId);
      targeted = result.sessions || [];
    } catch (e) {
      targetedError = e.message;
      console.warn('[takamol/sessions] targeted exam_sessions fetch failed:', e.message);
    }

    // 2) Prometric slots flow. Its slots are the real exam sessions and each
    //    carries the test center (site) name — this is what lets the app pin
    //    the exact center the user picks. slot.id is what SVPI expects as
    //    exam_session_id in the reschedule payload.
    let prometric = [];
    let sites = [];
    let prometricError = '';
    if (prometricCode && city && date) {
      try {
        sites = await fetchPrometricSites({
          prometricCode,
          city,
          startDate: date,
          endDate: date
        });
        // The user picked one center — only that center's sites may produce slots,
        // otherwise slots from other centers would leak into the list.
        if (testCenterId) {
          const matched = sites.filter((s) =>
            String(s?.test_center?.id ?? s?.test_center_id ?? '') === String(testCenterId)
          );
          if (matched.length > 0) {
            sites = matched;
          } else {
            // The picked center has NO matching prometric site. Do NOT leak slots
            // from every center in the city: drop the prometric path entirely so
            // the caller falls back to the targeted exam_sessions list, which IS
            // scoped by test_center_id. This is what keeps the rebook booking on
            // the exact center the user selected.
            sites = [];
            prometric = [];
          }
        }
        const siteIds = [...new Set(sites.map((s) => s.site_id).filter(Boolean))];
        if (siteIds.length > 0) {
          const slotsGroups = await fetchPrometricSlots({
            siteIds,
            examId,
            startDate: date,
            endDate: date
          });
          prometric = mergeSlotsWithSites(slotsGroups, sites);
        }
      } catch (e) {
        prometricError = e.message;
        console.warn('[takamol/sessions] prometric slots fetch failed:', e.message);
      }
    }

    console.log(`[takamol/sessions] targeted=${targeted.length} prometric=${prometric.length} sites=${sites.length}`);

    // For a reservation reschedule the targeted list (reservation_id + exam_date,
    // exactly what SVPI's wizard sends) is the authoritative reschedulable set.
    // Prometric slots only take over for fresh bookings (no reservationId).
    const sessions = reservationId ? targeted : (prometric.length > 0 ? prometric : targeted);
    const warnings = [];
    if (targetedError) warnings.push(`targeted: ${targetedError}`);
    if (prometricError) warnings.push(`prometric: ${prometricError}`);

    return NextResponse.json({
      success: true,
      data: {
        sessions,
        source: prometric.length > 0 ? 'prometric' : 'targeted',
        targeted,
        prometric,
        sites,
        warnings
      }
    });
  } catch (error) {
    console.error('[takamol/sessions] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
