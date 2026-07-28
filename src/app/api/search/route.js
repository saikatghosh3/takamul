import { NextResponse } from 'next/server';

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

async function fetchAllTestCenters(categoryId) {
    const all = [];
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= 30) {
        let url = `${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=50&page=${page}`;
        if (categoryId) url += `&category_id=${categoryId}`;
        const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
        if (!res.ok) break;
        const data = await res.json();
        all.push(...(data.test_centers || []));
        totalPages = data.pagination?.pages || 1;
        page++;
    }
    return all;
}

export async function GET() {
    try {
        const catRes = await fetch(
            `${API_BASE}/visitor_space/categories?country_id=${BANGLADESH_ID}`,
            { headers: { 'Accept': 'application/json' } }
        ).then(r => r.ok ? r.json() : null);

        const categories = (catRes?.categories || [])
            .map(c => ({
                id: c.id,
                name: c.english_name
            }))
            .filter(c => c.name)
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({ success: true, data: { categories } });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function POST(request) {
    try {
        const { category, city, date } = await request.json();

        if (!category) {
            return NextResponse.json({
                success: false,
                error: 'Category is required'
            }, { status: 400 });
        }

        const centers = await fetchAllTestCenters(category);

        let filtered = centers;

        if (city && city.trim()) {
            const cityLower = city.toLowerCase().replace(/-/g, ' ');
            filtered = filtered.filter(c =>
                c.city?.toLowerCase().includes(cityLower)
            );
        }

        const cities = [...new Set(centers.map(c => c.city).filter(Boolean))]
            .sort()
            .map(c => ({ id: c.toLowerCase().replace(/\s+/g, '-'), name: c }));

        const results = filtered.map(c => ({
            id: c.id,
            name: c.name,
            city: c.city,
            address: c.address,
            date: date || null,
            categoryId: category
        }));

        return NextResponse.json({
            success: true,
            data: {
                total: results.length,
                centers: results,
                cities,
                date: date || null,
                category
            }
        });
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
