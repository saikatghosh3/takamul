import { NextResponse } from 'next/server';
import { browserFetch } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function GET() {
  const url = 'https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_sessions/available_dates?category_id=159&country_id=78&per_page=10000&city=Khulna';
  try {
    const r = await browserFetch(url, { method: 'GET' });
    const keys = r?.data && typeof r.data === 'object' ? Object.keys(r.data) : [];
    const rows = Array.isArray(r?.data?.available_dates) ? r.data.available_dates : [];
    return NextResponse.json({
      status: r.status,
      ok: r.ok,
      keys,
      rows: rows.length,
      first: rows[0] ? { d: rows[0].start_date_in_tc_time_zone, c: rows[0]?.test_center?.city } : null,
      rawSample: JSON.stringify(r?.data || null).substring(0, 400)
    });
  } catch (e) {
    return NextResponse.json({ error: e.message });
  }
}
