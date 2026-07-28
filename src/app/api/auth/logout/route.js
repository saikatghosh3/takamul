import { NextResponse } from 'next/server';
import { logout } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    logout();
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
