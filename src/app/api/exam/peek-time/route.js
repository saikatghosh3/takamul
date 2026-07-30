import { NextResponse } from 'next/server';
import { isLoggedIn, peekSessionTime } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { examSessionId, occupationId, languageCode, methodology } = await request.json();

    if (!examSessionId || !occupationId) {
      return NextResponse.json(
        { success: false, error: 'examSessionId and occupationId are required' },
        { status: 400 }
      );
    }

    const result = await peekSessionTime({
      occupationId,
      examSessionId,
      languageCode: languageCode || 'en',
      methodology: methodology || 1
    });

    if (result.ok && result.testTime) {
      return NextResponse.json({
        success: true,
        data: {
          testTime: result.testTime,
          reservationId: result.reservationId,
          testDate: result.testDate,
          cancelled: result.cancelResult?.ok || false
        }
      });
    }

    if (result.ok && !result.testTime) {
      return NextResponse.json({
        success: false,
        error: 'Time not available for this session',
        data: result
      });
    }

    return NextResponse.json(
      { success: false, error: result.error || 'Failed to peek session time' },
      { status: result.status || 500 }
    );
  } catch (error) {
    console.error('[peek-time] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
