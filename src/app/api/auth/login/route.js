import { NextResponse } from 'next/server';
import { login } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const result = await login();
    return NextResponse.json(result);
  } catch (error) {
    console.error('[auth/login] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
