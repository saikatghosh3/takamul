import { NextResponse } from 'next/server';

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { category, city } = await request.json();

    if (!category) {
      return NextResponse.json({ success: true, data: { centers: [] } });
    }

    let url = `${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000`;
    if (category) url += `&category_id=${category}`;

    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Failed to fetch centers: ${res.status}` }, { status: res.status });
    }
    const data = await res.json();
    let centers = (data.test_centers || []).map(c => ({
      id: c.id,
      name: c.name,
      city: c.city,
      address: c.address,
      status: c.status
    }));

    if (city) {
      const cityLower = city.toLowerCase();
      centers = centers.filter(c => c.city && c.city.toLowerCase().includes(cityLower));
    }

    return NextResponse.json({ success: true, data: { centers } });
  } catch (error) {
    console.error('[takamol/centers] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
