import { NextResponse } from 'next/server';

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

function normalizeDate(d) {
    let raw;
    if (typeof d === 'string') {
        raw = d;
    } else if (d && typeof d === 'object') {
        raw = d.date || d.start_date || d.exam_date;
    }
    if (!raw) return null;
    const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export async function POST(request) {
    try {
        const { category, city } = await request.json();

        if (!category) {
            return NextResponse.json({
                success: true,
                data: { dates: [], source: 'none' }
            });
        }

        try {
            const res = await fetch(
                `${API_BASE}/individual_labor_space/exam_sessions/available_dates?category_id=${category}&country_id=${BANGLADESH_ID}`,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Mozilla/5.0'
                    }
                }
            );

            if (res.ok) {
                const data = await res.json();
                const rawDates = data.dates || data.available_dates || data.data || [];
                const dates = rawDates.map(normalizeDate).filter(Boolean);
                const unique = [...new Set(dates)].sort();

                if (unique.length > 0) {
                    return NextResponse.json({
                        success: true,
                        data: { dates: unique, source: 'api' }
                    });
                }
            }
        } catch {}

        return NextResponse.json({
            success: true,
            data: { dates: [], source: 'none' }
        });
    } catch {
        return NextResponse.json({ success: true, data: { dates: [], source: 'none' } });
    }
}
