import { NextResponse } from 'next/server';
import { fetchExamSessions } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { category, date, city } = await request.json();

    if (!category) {
      return NextResponse.json({ success: false, error: 'category is required' }, { status: 400 });
    }

    const result = await fetchExamSessions(category, date, city);

    return NextResponse.json({
      success: true,
      data: {
        sessions: result.sessions
      }
    });
  } catch (error) {
    console.error('[takamol/sessions] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
