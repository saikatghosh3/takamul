import { getToken, authenticatedFetch } from './svp-playwright.js';

const API_BASE = 'https://svp-international-api.pacc.sa/api/v1';
const BANGLADESH_ID = 78;

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.time < entry.ttl) {
    return entry.data;
  }
  if (entry) cache.delete(key);
  return null;
}

function setCache(key, data, ttl) {
  cache.set(key, { data, time: Date.now(), ttl });
}

export async function fetchCategories() {  const cacheKey = 'categories';
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const res = await fetch(
    `${API_BASE}/visitor_space/categories?per_page=10000&locale=en`,
    { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Failed to fetch categories: ${res.status}`);
  const data = await res.json();

  const categories = (data.categories || []).map(c => ({
    id: c.id,
    english_name: c.english_name || c.name
  }));

  const result = { categories };
  setCache(cacheKey, result, 30 * 60 * 1000);
  return result;
}

export async function fetchAvailableDates(categoryId, city) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const cacheKey = `dates:${categoryId}:${city || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    category_id: String(categoryId),
    country_id: String(BANGLADESH_ID),
    per_page: '10000'
  });
  if (city) params.set('city', city);

  const url = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?${params.toString()}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch dates: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(data.error);

  const rawDates = data.available_dates || data.dates || data.data || [];
  console.log(`[takamol] fetchAvailableDates: ${rawDates.length} raw items`);
  if (rawDates.length > 0) {
    console.log(`[takamol] fetchAvailableDates first item keys:`, Object.keys(rawDates[0]));
    console.log(`[takamol] fetchAvailableDates first item:`, JSON.stringify(rawDates[0]).substring(0, 600));
  }

  const result = { available_dates: rawDates };
  setCache(cacheKey, result, 5 * 60 * 1000);
  return result;
}

export async function fetchCities(categoryId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const cacheKey = `cities:${categoryId}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    category_id: String(categoryId),
    country_id: String(BANGLADESH_ID),
    per_page: '10000'
  });
  const url = `${API_BASE}/individual_labor_space/test_centers/cities?${params.toString()}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch cities: ${res.status}`);
  const data = await res.json();

  if (data.error) throw new Error(data.error);

  const result = data.cities || data.data || [];
  setCache(cacheKey, result, 5 * 60 * 1000);
  return result;
}

export async function fetchTestCenters(categoryId, city) {
  const cacheKey = `centers:${categoryId}:${city || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  let url = `${API_BASE}/visitor_space/test_centers?country_id=${BANGLADESH_ID}&per_page=10000`;
  if (categoryId) url += `&category_id=${categoryId}`;

  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`Failed to fetch test centers: ${res.status}`);
  const data = await res.json();

  const centers = (data.test_centers || []).map(c => ({
    id: c.id,
    name: c.name,
    city: c.city,
    address: c.address,
    status: c.status
  })).filter(c => !city || (c.city && c.city.toLowerCase() === city.toLowerCase()));

  setCache(cacheKey, centers, 5 * 60 * 1000);
  return centers;
}

export async function fetchExamSessions(categoryId, testDate, city, testCenterId, reservationId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const cacheKey = `sessions:${categoryId}:${testDate || ''}:${city || ''}:${testCenterId || ''}:${reservationId || ''}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    category_id: String(categoryId)
  });
  // SVPI's wizard (chunk 7083/8189 getSessions) queries exam_sessions with
  // exam_date + city + category_id (+ available_seats); reschedule additionally
  // passes reservation_id. test_center_id narrows the returned sessions to the
  // exact center the user picked — SVPI returns a DIFFERENT exam_session token
  // set per test_center_id (verified live: center 62 vs 203 yield different
  // tokens, for both the fresh and the reservation_id query). Without it the
  // city-scoped list mixes sessions from every center in the city, which is why
  // the old rebook booked at a different center than the one the user selected.
  if (testDate) params.set('exam_date', testDate);
  if (city) params.set('city', city);
  if (testCenterId) params.set('test_center_id', String(testCenterId));
  if (reservationId) params.set('reservation_id', String(reservationId));
  params.set('available_seats', 'greater_than::0');

  const url = `${API_BASE}/individual_labor_space/exam_sessions?${params.toString()}`;

  console.log(`[takamol] fetchExamSessions: ${url}`);
  const res = await authenticatedFetch(url);

  if (!res.ok) throw new Error(`Failed to fetch exam sessions: ${res.status}`);
  const data = await res.json();

  console.log(`[takamol] fetchExamSessions top-level keys:`, Object.keys(data));
  console.log(`[takamol] fetchExamSessions full response:`, JSON.stringify(data).substring(0, 1500));

  let sessions = data.exam_sessions || data.sessions || data.data || data.available_sessions || [];

  if (!Array.isArray(sessions)) sessions = [];

  console.log(`[takamol] fetchExamSessions raw count: ${sessions.length}`);
  if (sessions.length > 0) {
    console.log(`[takamol] fetchExamSessions first item keys:`, Object.keys(sessions[0]));
    console.log(`[takamol] fetchExamSessions first item full:`, JSON.stringify(sessions[0]).substring(0, 800));
    if (sessions.length > 1) {
      console.log(`[takamol] fetchExamSessions second item full:`, JSON.stringify(sessions[1]).substring(0, 800));
    }
  }

  if (testDate && sessions.length > 0) {
    const extractDate = (obj) => {
      for (const fn of ['test_date', 'date', 'start_date', 'start_date_in_tc_time_zone',
        'start_date_in_browser_time_zone', 'exam_session.test_date', 'exam_session.date',
        'exam_session.start_date_in_tc_time_zone', 'schedule.test_date']) {
        const val = fn.split('.').reduce((o, k) => o?.[k], obj);
        if (val) {
          const m = String(val).match(/^(\d{4}-\d{2}-\d{2})/);
          if (m) return m[1];
        }
      }
      return null;
    };

    const sessionsBeforeFilter = sessions.length;
    sessions = sessions.filter(s => {
      const sessionDate = extractDate(s);
      if (!sessionDate) return true;
      return sessionDate === testDate;
    });
    console.log(`[takamol] fetchExamSessions after date filter: ${sessions.length} (was ${sessionsBeforeFilter})`);
  }

  const result = { sessions };
  setCache(cacheKey, result, 30 * 1000);
  return result;
}

export async function fetchReservation(reservationId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const url = `${API_BASE}/individual_labor_space/exam_reservations/${reservationId}`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reservation ${reservationId}: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data;
}

// SVP's reschedule wizard (chunk 7083, LanguageAndCity.fetchAvailableCities) uses
// these exact params on exam_sessions/available_dates. Cities and dates are then
// derived from the response's test_center.city.
export async function fetchRescheduleAvailableDates(reservationId, categoryId) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const startFrom = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    reservation_id: String(reservationId),
    category_id: String(categoryId),
    start_at_date_from: startFrom,
    available_seats: 'greater_than::0',
    status: 'scheduled'
  });
  const url = `${API_BASE}/individual_labor_space/exam_sessions/available_dates?${params.toString()}`;
  console.log(`[takamol] fetchRescheduleAvailableDates: ${url}`);

  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch reschedule dates: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  const rawDates = data.available_dates || data.dates || data.data || [];
  return { available_dates: rawDates };
}

export async function fetchPrometricSites({ prometricCode, city, startDate, endDate }) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const params = new URLSearchParams({
    prometric_code: prometricCode,
    city,
    start_date: startDate,
    end_date: endDate
  });
  const url = `${API_BASE}/individual_labor_space/prometric_scheduling/sites_availabilities?${params.toString()}`;
  console.log(`[takamol] fetchPrometricSites: ${url}`);

  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch prometric sites: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.sites || data.data || [];
}

export async function fetchPrometricSlots({ siteIds, examId, startDate, endDate }) {
  const token = getToken();
  if (!token) throw new Error('Not authenticated. Please login first.');

  const params = new URLSearchParams({
    site_ids: siteIds.join(','),
    exam_id: examId || '',
    start_date: startDate,
    end_date: endDate
  });
  const url = `${API_BASE}/individual_labor_space/prometric_scheduling/slots_availabilities?${params.toString()}`;
  console.log(`[takamol] fetchPrometricSlots: ${url}`);

  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error(`Failed to fetch prometric slots: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.slots_availabilities || data.slots || data.data || [];
}

export function shutdown() {
  cache.clear();
}
