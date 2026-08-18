import { NextResponse } from 'next/server';
import { isLoggedIn } from '@/lib/svp-playwright';
import { fetchExamSessions } from '@/lib/takamol';
import {
  hasT2hubAuth,
  isT2hubAuthError,
  t2hubFetch,
  fetchT2hubExamSessions,
  fetchT2hubAvailableDates,
  fetchT2hubTestCenters,
  groupSessionsByCenter
} from '@/lib/t2hub-api';

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

// ── t2hub source ──────────────────────────────────────────────────────────
// The t2hub proxy knows the exact center NAME per session, which the raw SVP
// API never returns. Its city filter is case-sensitive and uses the display
// name (e.g. "Cumilla", not "cumilla"), so we first resolve the proper casing
// from exam-available-dates, then query pacc-exam-sessions.

async function resolveCityDisplayName(categoryId, city) {
  const requested = String(city || '').toLowerCase().replace(/-/g, ' ').trim();
  if (!requested) return city || '';

  try {
    const { available_dates } = await fetchT2hubAvailableDates({ categoryId });
    const seen = new Set();
    for (const d of available_dates || []) {
      const c = d?.test_center?.city || d?.city || '';
      if (c) seen.add(c);
    }
    for (const name of seen) {
      if (name.toLowerCase() === requested) return name;
    }
  } catch { /* fall through to heuristics below */ }

  return city || '';
}

// Build full-name -> short-name map exactly like the t2hub page does, so the UI
// shows "Noakhal" instead of "Noakhali Technical Training Centre".
async function centerShortNamesForCity(cityDisplayName) {
  const map = {};
  try {
    const { sites } = await fetchT2hubTestCenters({ city: cityDisplayName });
    for (const site of sites || []) {
      if (site?.name) map[site.name.toLowerCase()] = site.city || site.name;
    }
  } catch { /* optional enhancement */ }
  return map;
}

async function searchT2hub({ category, city, date }) {
  const cityDisplayName = await resolveCityDisplayName(category, city);
  const shortNames = await centerShortNamesForCity(cityDisplayName);

  const { sessions, total } = await fetchT2hubExamSessions({
    categoryId: category,
    city: cityDisplayName,
    examDate: date
  });

  const grouped = groupSessionsByCenter(sessions);
  const centers = grouped.map((g, i) => ({
    id: `${cityDisplayName.toLowerCase().replace(/\s+/g, '-')}-${i}`,
    name: shortNames[g.center_name.toLowerCase()] || g.center_name,
    full_name: g.center_name,
    city: cityDisplayName,
    address: '',
    date,
    categoryId: category,
    available: g.available,
    pending: g.pending,
    source: 't2hub',
    sessionsCount: g.sessionsCount,
    totalSeats: g.totalSeats,
    sessions: g.sessions.map((s, si) => ({
      id: s.id ?? si,
      session_id: s.session_id,
      available_seats: s.available_seats,
      status: s.status,
      time: s.available_seats != null ? `${s.available_seats} seat${s.available_seats === 1 ? '' : 's'}` : ''
    }))
  }));

  return {
    success: true,
    data: {
      total: centers.length,
      centers,
      cities: [],
      date,
      category,
      availabilitySource: centers.length > 0 ? 't2hub' : 'none',
      warnings: [],
      source: 't2hub',
      total_sessions: total
    }
  };
}

// ── SVP prometric fallback ────────────────────────────────────────────────

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

// For a given category+city+date, return the bookable sessions. Mirrors the
// t2hub.app search output: one row per CITY with a session count (t2hub's
// "Center Name" column values were city names — Cumilla, Noakhal, Khulna …).
//
// IMPORTANT (verified live 2026-08-16): SVP's exam_sessions endpoint only
// exposes availability at CITY level. Its test_center_id param is decorative —
// even test_center_id=99999 returns the same whole-country list, and combining
// it with city returns ZERO rows. Session rows carry no center id/name, no
// time, and no seat count. Per-center granularity does not exist in the SVP
// API for these TTC (cbt_and_practical) categories; t2hub's per-center split
// (e.g. "Cumilla 2 + Noakhal 2") came from the old takamol portal, which is
// gone. The CITY total is identical either way (verified: Cumilla = 4 on
// 2026-08-17 for category 160, matching t2hub's 2+2), so we report the city's
// session count — the number the booking system itself returns.
async function fetchAvailableCentersByDate({ category, cityName, date, centers }) {
    const cityLower = String(cityName || '').toLowerCase().replace(/-/g, ' ');
    const cityCenter = (centers || []).find(c => c.city && c.city.toLowerCase() === cityLower);
    const out = [];
    const codeErrors = [];
    if (!cityCenter) return { centers: out, codeErrors };

    let sessions = [];
    try {
        const res = await fetchExamSessions(category, date, cityName, null);
        sessions = res.sessions || [];
    } catch (e) {
        codeErrors.push(`${cityName}: ${e.message}`);
        return { centers: out, codeErrors };
    }

    if (!sessions.length) return { centers: out, codeErrors };

    out.push({
        test_center_id: cityCenter.id,
        test_center_name: cityCenter.city,
        city: cityCenter.city,
        address: '',
        sessionsCount: sessions.length,
        sessions: sessions.map((s, si) => ({
            id: s.id ?? si,
            session_id: s.id,
            encrypted_session_id: s.id,
            time: '',
            date: s.start_date_in_browser_time_zone || s.start_date_in_tc_time_zone || date
        }))
    });
    return { centers: out, codeErrors };
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

        // ── Primary source: t2hub (exact center names + per-center session counts) ──
        if (hasT2hubAuth()) {
            try {
                return NextResponse.json(await searchT2hub({ category, city, date }));
            } catch (err) {
                console.warn('[search] t2hub search failed:', err.message);
                if (isT2hubAuthError(err)) {
                    console.warn('[search] t2hub auth invalid -> falling back to SVP path');
                } else if (!err.status || err.status >= 500 || err.status === 503) {
                    console.warn('[search] t2hub unavailable -> falling back to SVP path');
                } else {
                    // 4xx other than auth (e.g. bad city) — still fall back so the
                    // user gets a usable response rather than a hard error.
                    console.warn('[search] t2hub rejected request -> falling back to SVP path');
                }
            }
        }

        // ── Fallback: SVP per-center exam_sessions probe ───────────────────
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

        const baseResult = filtered.map(c => ({
            id: c.id,
            name: c.name,
            city: c.city,
            address: c.address,
            date: date || null,
            categoryId: category
        }));

        // No date chosen -> just list the city's centers (no availability claim).
        if (!date || !city) {
            return NextResponse.json({
                success: true,
                data: {
                    total: baseResult.length,
                    centers: baseResult.map(c => ({ ...c, available: null, sessionsCount: 0, sessions: [] })),
                    cities,
                    date: date || null,
                    category,
                    availabilitySource: 'list'
                }
            });
        }

        const warnings = [];
        const cityName = filtered.find(c => c.city)?.city || city.replace(/-/g, ' ');

        try {
            const { centers: availableCenters, codeErrors } = await fetchAvailableCentersByDate({ category, cityName, date, centers });
            if (codeErrors.length) warnings.push(...codeErrors);

            // Each probed center has real session counts on this date — show it
            // as available (mirrors t2hub's per-center session list). Centers
            // with no sessions on the date are dropped, so the list only shows
            // centers that truly have sessions that day.
            const results = availableCenters.map(ac => ({
                id: ac.test_center_id,
                name: ac.test_center_name,
                city: ac.city,
                address: ac.address,
                date,
                categoryId: category,
                available: true,
                source: 'svp',
                sessionsCount: ac.sessionsCount,
                sessions: ac.sessions,
                site_id: null
            }));

            return NextResponse.json({
                success: true,
                data: {
                    total: results.length,
                    centers: results,
                    cities,
                    date,
                    category,
                    availabilitySource: results.length > 0 ? 'svp' : (isLoggedIn() ? 'none' : 'login-required'),
                    warnings
                }
            });
        } catch (e) {
            // Prometric data unavailable (e.g. not signed in). Fall back to the
            // plain center list but never claim availability for it.
            warnings.push(`Accurate availability unavailable: ${e.message}`);
            return NextResponse.json({
                success: true,
                data: {
                    total: baseResult.length,
                    centers: baseResult.map(c => ({ ...c, available: null, sessionsCount: 0, sessions: [] })),
                    cities,
                    date,
                    category,
                    availabilitySource: isLoggedIn() ? 'unknown' : 'login-required',
                    warnings
                }
            });
        }
    } catch (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
