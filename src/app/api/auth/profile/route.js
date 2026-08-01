import { NextResponse } from 'next/server';
import { isLoggedIn, authenticatedFetch } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';

export async function GET() {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 }
      );
    }

    const profileRes = await authenticatedFetch(`${SVP_API}/individual_labor_space/profile`);
    if (!profileRes.ok) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch profile (${profileRes.status})` },
        { status: profileRes.status }
      );
    }

    const profile = await profileRes.json();

    return NextResponse.json({
      success: true,
      data: {
        name: profile.full_name || profile.name || '',
        email: profile.email || profile.email_address || '',
        id: profile.id || null,
        labor_profile_id: profile.labor_profile_id || null
      }
    });
  } catch (error) {
    console.error('[auth/profile] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
