import { NextResponse } from 'next/server';
import { getToken, isLoggedIn, logout } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';
const SVP_BASE = 'https://svp-international.pacc.sa';

// Proxies SVPI's ticket PDF for a confirmed exam reservation. SVPI generates
// the ticket server-side and returns it as a binary PDF blob (no JSON), so the
// managed-browser authenticatedFetch helpers (which parse JSON) are bypassed
// and the PDF is streamed straight back to the client with a Bearer token.
export async function POST(request) {
  try {
    if (!isLoggedIn()) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated. Please login first.' },
        { status: 401 }
      );
    }

    const { reservationId } = await request.json();
    if (!reservationId) {
      return NextResponse.json(
        { success: false, error: 'reservationId is required' },
        { status: 400 }
      );
    }

    const token = getToken();
    const res = await fetch(
      `${SVP_API}/individual_labor_space/tickets/${reservationId}/show_pdf?locale=en`,
      {
        headers: {
          'Accept': 'application/pdf',
          'Authorization': `Bearer ${token}`,
          'X-Tenant-Name': 'svp-international',
          'Origin': SVP_BASE,
          'Referer': `${SVP_BASE}/`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
      }
    );

    if (!res.ok) {
      if (res.status === 401) {
        logout();
        return NextResponse.json(
          { success: false, error: 'Session expired. Please login again.', expired: true },
          { status: 401 }
        );
      }
      let errText = '';
      try {
        const j = await res.json();
        errText = j.error || j.message || '';
      } catch {
        errText = await res.text().catch(() => '');
      }
      return NextResponse.json(
        { success: false, error: errText || `Failed to download ticket (${res.status}).` },
        { status: res.status }
      );
    }

    const buf = await res.arrayBuffer();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/pdf',
        'Content-Length': String(buf.byteLength),
        'Content-Disposition': `attachment; filename="ticket-${reservationId}.pdf"`
      }
    });
  } catch (error) {
    console.error('[takamol/ticket] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
