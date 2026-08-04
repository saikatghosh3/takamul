import { NextResponse } from 'next/server';
import { fetchAvailableDates, fetchCities, fetchRescheduleAvailableDates } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { category, city, reservationId } = await request.json();

    if (!category) {
      return NextResponse.json({
        success: true,
        data: { dates: [], cities: [], sessions: [], source: 'none' }
      });
    }

    // In reschedule mode the wizard sources cities + dates from
    // exam_sessions/available_dates filtered by the reservation (chunk 7083).
    const isReschedule = Boolean(reservationId);
    const [dateResult, citiesResult] = await Promise.allSettled([
      isReschedule ? fetchRescheduleAvailableDates(reservationId, category) : fetchAvailableDates(category, city),
      isReschedule ? Promise.resolve([]) : fetchCities(category)
    ]);

    const dateErrors = [dateResult, citiesResult].filter(r => r.status === 'rejected').map(r => r.reason?.message || String(r.reason));
    if (dateResult.status === 'rejected' && citiesResult.status === 'rejected') {
      const msg = dateErrors[0] || 'Failed to fetch data';
      const isAuth = msg.toLowerCase().includes('not authenticated');
      return NextResponse.json({ success: false, error: msg }, { status: isAuth ? 401 : 500 });
    }

    const rawDates = dateResult.status === 'fulfilled' ? (dateResult.value?.available_dates || []) : [];
    console.log(`[takamol/dates] Raw dates count: ${rawDates.length}`);
    if (rawDates.length > 0) {
      console.log('[takamol/dates] Sample raw_date keys:', Object.keys(rawDates[0]));
      console.log('[takamol/dates] Sample raw_date:', JSON.stringify(rawDates[0]).substring(0, 800));
    }

    const citiesRaw = citiesResult.status === 'fulfilled' ? (citiesResult.value || []) : [];

    // Reschedule mode: the SVP wizard derives cities from the available_dates
    // items (test_center.city), not from the static test_centers/cities list.
    let derivedCities = [];
    if (isReschedule) {
      derivedCities = [...new Set(rawDates
        .map(d => d.test_center?.city || d.city || d.test_center?.test_center_city)
        .filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
    }

    const extractField = (obj, ...fieldNames) => {
      for (const fn of fieldNames) {
        const val = fn.split('.').reduce((o, k) => o?.[k], obj);
        if (val !== undefined && val !== null) return val;
      }
      return null;
    };

    const extractDateStr = (obj) => {
      const raw = extractField(obj, 'start_date_in_tc_time_zone', 'date', 'start_date',
        'start_at_in_tc_time_zone', 'start_date_in_browser_time_zone', 'exam_session.test_date', 'exam_session.date');
      if (!raw) return null;
      const m = String(raw).match(/^(\d{4}-\d{2}-\d{2})/);
      return m ? m[1] : null;
    };

    const extractTimeStr = (obj) => {
      return extractField(obj,
        'test_time', 'start_time', 'time', 'time_slot',
        'start_time_in_tc_time_zone', 'start_time_in_browser_time_zone',
        'exam_session.test_time', 'exam_session.start_time',
        'schedule.test_time');
    };

    const dates = [];
    const sessionsMap = {};

    for (const d of rawDates) {
      const dateStr = extractDateStr(d);
      if (dateStr) {
        if (!dates.includes(dateStr)) dates.push(dateStr);
      }

      const timeStr = extractTimeStr(d);
      const cityName = extractField(d, 'test_center.city', 'city',
        'test_center.test_center_city');
      const centerName = extractField(d, 'test_center.test_center_name', 'test_center.name');
      const sessionId = d.id || d.exam_session_id || d.exam_session?.id;
      const seats = d.available_seats ?? d.seats_available ?? d.slots_available ?? d.capacity ?? null;

      if (dateStr) {
        if (!sessionsMap[dateStr]) sessionsMap[dateStr] = [];
        sessionsMap[dateStr].push({
          id: sessionId || `session-${sessionsMap[dateStr].length}`,
          date: dateStr,
          time: timeStr || '',
          city: cityName || '',
          centerName: centerName || '',
          seats,
          raw: d
        });
      }
    }

    dates.sort();
    const uniqueDates = [...new Set(dates)];

    const cities = isReschedule
      ? derivedCities.map(name => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name }))
      : citiesRaw
        .map(c => {
          const name = typeof c === 'string' ? c : c.city || c.name || c.english_name;
          if (!name) return null;
          return {
            id: name.toLowerCase().replace(/\s+/g, '-'),
            name: name
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));

    console.log(`[takamol/dates] Unique dates: ${uniqueDates.length}`);
    console.log(`[takamol/dates] Sessions by date:`, Object.fromEntries(
      Object.entries(sessionsMap).map(([k, v]) => [k, v.length])
    ));

    return NextResponse.json({
      success: true,
      data: {
        dates: uniqueDates,
        cities,
        sessions: sessionsMap,
        source: uniqueDates.length > 0 ? 'api' : 'none'
      },
      raw_dates: rawDates
    });
  } catch (error) {
    console.error('[takamol/dates] Error:', error.message, error.stack);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
