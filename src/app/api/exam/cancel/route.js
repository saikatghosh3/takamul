import { NextResponse } from 'next/server';
import { isLoggedIn, cancelViaPlaywright } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { sessionId, reason } = await request.json();

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    console.log(`[exam/cancel] Starting Playwright cancel: session=${sessionId}`);

    const spaResult = await cancelViaPlaywright(sessionId, reason);

    if (spaResult && (spaResult.ok || (spaResult.status && spaResult.status < 400))) {
      console.log('[exam/cancel] Playwright cancel succeeded:', spaResult.status);
      return NextResponse.json({ success: true, data: spaResult.data });
    }

    const errorMsg = (spaResult?.data && spaResult.data.message) || spaResult?.error || `Cancel failed`;
    console.error('[exam/cancel] Playwright cancel failed:', errorMsg);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  } catch (error) {
    console.error('[exam/cancel] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
