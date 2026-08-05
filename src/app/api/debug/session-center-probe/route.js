import { NextResponse } from 'next/server';
import { fetchExamSessions } from '@/lib/takamol';
import { isLoggedIn, authenticatedFetch } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || '160';
    const date = searchParams.get('date') || '2026-08-09';
    const reservationId = searchParams.get('reservationId') || '5022212';

    const variants = [
      { key: 'no-center', testCenterId: null },
      { key: 'center-174', testCenterId: '174' },
      { key: 'center-203', testCenterId: '203' },
      { key: 'center-62', testCenterId: '62' },
      { key: 'center-174+res', testCenterId: '174', reservationId },
      { key: 'center-203+res', testCenterId: '203', reservationId }
    ];

    const out = [];
    for (const v of variants) {
      try {
        const result = await fetchExamSessions(category, date, undefined, v.testCenterId, v.reservationId);
        const sessions = result.sessions || [];
        out.push({
          key: v.key,
          count: sessions.length,
          ids: sessions.map((s) => s.id),
          cities: [...new Set(sessions.map((s) => s.test_center?.city || ''))],
          sample: sessions.slice(0, 2).map((s) => ({ id: s.id, city: s.test_center?.city, tc: s.test_center }))
        });
      } catch (e) {
        out.push({ key: v.key, error: e.message });
      }
    }

    const byKey = {};
    for (const o of out) byKey[o.key] = o.ids || [];

    const overlap = [];
    const keys = Object.keys(byKey);
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const a = byKey[keys[i]] || [];
        const b = byKey[keys[j]] || [];
        overlap.push({ a: keys[i], b: keys[j], shared: a.filter((x) => b.includes(x)).length });
      }
    }

    // Probe B: does exam_sessions/{token} detail reveal the full center?
    const details = [];
    for (const v of variants) {
      const ids = byKey[v.key] || [];
      if (ids.length === 0) continue;
      try {
        const res = await authenticatedFetch(`${SVP_API}/individual_labor_space/exam_sessions/${ids[0]}`);
        const body = await res.json();
        details.push({ key: v.key, status: res.status, id: ids[0], test_center: body.test_center, keys: Object.keys(body) });
      } catch (e) {
        details.push({ key: v.key, error: e.message });
      }
    }

    // Probe D: numeric session ids from the reservation (1781228 / 1781240)
    const numericProbe = [];
    for (const numericId of ['1781228', '1781240']) {
      try {
        const res = await authenticatedFetch(`${SVP_API}/individual_labor_space/exam_sessions/${numericId}`);
        const body = await res.json();
        numericProbe.push({ numericId, status: res.status, body: body.test_center ? body.test_center : body });
      } catch (e) {
        numericProbe.push({ numericId, error: e.message });
      }
    }

    // Probe E: temporary_seats — does the hold response reveal the real test_center?
    const tempProbe = [];
    const noCenterIds = byKey['no-center'] || [];
    for (const sid of noCenterIds.slice(0, 3)) {
      try {
        const res = await authenticatedFetch(`${SVP_API}/individual_labor_space/temporary_seats`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ exam_session_id: sid })
        });
        const body = await res.json();
        tempProbe.push({
          sentId: sid,
          status: res.status,
          body
        });
      } catch (e) {
        tempProbe.push({ sentId: sid, error: e.message });
      }
    }

    return NextResponse.json({ success: true, data: { variants: out, overlap, details, numericProbe, tempProbe } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';
