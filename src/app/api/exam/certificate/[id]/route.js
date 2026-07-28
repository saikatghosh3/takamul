import { isLoggedIn, authenticatedFetch } from '@/lib/svp-playwright';

export const dynamic = 'force-dynamic';

const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';

export async function GET(request, { params }) {
  try {
    if (!isLoggedIn()) {
      return new Response(JSON.stringify({ success: false, error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { id } = await params;

    const certUrls = [
      `${SVP_API}/individual_labor_space/certificates/${encodeURIComponent(id)}/show_pdf`,
      `${SVP_API}/individual_labor_space/exam_reservations/${encodeURIComponent(id)}/certificate`,
      `${SVP_API}/individual_labor_space/exam_reservations/${encodeURIComponent(id)}/download`,
    ];

    for (const url of certUrls) {
      const res = await authenticatedFetch(url);

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && (contentType.includes('pdf') || contentType.includes('octet-stream') || contentType.includes('image'))) {
          const buffer = await res.arrayBuffer();
          return new Response(buffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': `attachment; filename="certificate-${id}.pdf"`,
            }
          });
        }

        const data = await res.json().catch(() => null);
        if (data && (data.url || data.download_url || data.certificate_url)) {
          const certUrl = data.url || data.download_url || data.certificate_url;
          const certRes = await fetch(certUrl);
          if (certRes.ok) {
            const buffer = await certRes.arrayBuffer();
            return new Response(buffer, {
              status: 200,
              headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="certificate-${id}.pdf"`,
              }
            });
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Certificate not available for this session.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[exam/certificate] Error:', error.message);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
