import { NextResponse } from 'next/server';
import { isLoggedIn, authenticatedFetch } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

export async function GET() {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const res = await authenticatedFetch(
      `${SVP_API}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`
    );

    if (!res.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch results (${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const reservations = data.exam_reservations || data.data || data.results || data || [];
    const list = Array.isArray(reservations) ? reservations : [];

    const completed = list.filter(r => {
      const s = (r.reservation_status || r.status || '').toLowerCase();
      const result = (r.final_result || r.exam_result || '').toLowerCase();
      return s === 'completed' || s === 'passed' || result === 'passed' || result === 'failed';
    });

    return NextResponse.json({
      success: true,
      data: { results: completed }
    });
  } catch (error) {
    console.error('[exam/results] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
