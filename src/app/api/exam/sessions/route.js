import { NextResponse } from 'next/server';
import { isLoggedIn, authenticatedFetch, logout } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

export async function GET(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const debug = searchParams.get('debug') === '1';

    const profileRes = await authenticatedFetch(`${SVP_API}/individual_labor_space/profile`);
    const profile = profileRes.ok ? await profileRes.json() : null;

    const res = await authenticatedFetch(
      `${SVP_API}/individual_labor_space/exam_reservations?country_id=${BANGLADESH_ID}`
    );

    if (!res.ok) {
      if (res.status === 401) {
        logout();
        return NextResponse.json(
          { success: false, error: 'Session expired. Please login again.', expired: true },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { success: false, error: `Failed to fetch bookings (${res.status})` },
        { status: res.status }
      );
    }

    const data = await res.json();
    const reservations = data.exam_reservations || data.data || data.results || data || [];

    if (debug) {
      return NextResponse.json({
        debug: true,
        profile: profile ? { email: profile.email, name: profile.full_name, id: profile.id, labor_profile_id: profile.labor_profile_id } : null,
        raw_keys: Object.keys(data),
        count: Array.isArray(reservations) ? reservations.length : 0,
        sample: Array.isArray(reservations) ? reservations.slice(0, 2) : reservations
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        sessions: Array.isArray(reservations) ? reservations : [],
      }
    });
  } catch (error) {
    console.error('[exam/sessions] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
