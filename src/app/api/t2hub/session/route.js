import { NextResponse } from 'next/server';
import {
  login,
  validateSession,
  getSessionStatus,
  canAutoLogin
} from '@/lib/t2hub-session';

export const dynamic = 'force-dynamic';

// GET /api/t2hub/session — live status + on-demand probe of the stored session.
export async function GET() {
  try {
    const validation = await validateSession({ force: true });
    return NextResponse.json({
      success: validation.ok,
      ...getSessionStatus(),
      validation
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/t2hub/session — force a fresh login. Pass { "interactive": true } to
// open a visible browser for MFA/OTP; otherwise headless with stored credentials.
export async function POST(request) {
  try {
    const { interactive = false } = await request.json().catch(() => ({}));
    if (interactive && !canAutoLogin()) {
      return NextResponse.json({ success: false, error: 'Interactive login requires T2HUB_PHONE/T2HUB_PASSWORD in .env.t2hub to prefill the form.' });
    }
    const result = await login({ interactive: Boolean(interactive) });
    const status = getSessionStatus();
    return NextResponse.json({ success: result.ok, ...result, status });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
