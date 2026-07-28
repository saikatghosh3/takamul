import { NextResponse } from 'next/server';
import { isLoggedIn, getToken } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const loggedIn = isLoggedIn();
    const token = getToken();

    let tokenInfo = null;
    if (token) {
      try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        tokenInfo = {
          expires: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
          issuer: payload.iss || null,
          subject: payload.sub || null
        };
      } catch {}
    }

    return NextResponse.json({
      success: true,
      data: {
        loggedIn,
        tokenInfo
      }
    });
  } catch (error) {
    console.error('[auth/status] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
