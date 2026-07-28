import { NextResponse } from 'next/server';
import { fetchCategories } from '@/lib/takamol';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await fetchCategories();

    const categories = (data.categories || [])
      .map(c => ({
        id: c.id,
        name: c.english_name?.trim()
      }))
      .filter(c => c.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, data: { categories } });
  } catch (error) {
    console.error('[takamol/categories] Error:', error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
