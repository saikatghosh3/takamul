import { NextResponse } from 'next/server';
import { isLoggedIn, cancelViaPlaywright } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

function extractCancelError(result) {
  if (!result) return '';
  if (typeof result.error === 'string' && result.error) return result.error;
  const data = result.data;
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.message) return data.message;
  if (data.error) return data.error;
  if (data.errors) {
    if (Array.isArray(data.errors)) {
      const first = data.errors[0];
      if (typeof first === 'string') return first;
      if (first?.message) return first.message;
      return JSON.stringify(first);
    }
    const keys = Object.keys(data.errors);
    if (keys.length > 0) {
      const first = data.errors[keys[0]];
      return Array.isArray(first) ? (first[0] || JSON.stringify(first)) : String(first);
    }
  }
  if (data.detail) return data.detail;
  return '';
}

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

    const status = spaResult?.status || 500;
    const errorMsg = extractCancelError(spaResult) || `Cancel failed (HTTP ${status})`;
    console.error('[exam/cancel] Playwright cancel failed:', status, errorMsg, JSON.stringify(spaResult?.data)?.substring(0, 500));
    return NextResponse.json({ success: false, error: errorMsg }, { status });
  } catch (error) {
    console.error('[exam/cancel] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
