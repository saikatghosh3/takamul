'use client';
import { useState, useEffect, useMemo } from 'react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

function Calendar({ value, onChange, minDate, availableDates, loading, source }) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = value ? new Date(value + 'T00:00:00') : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfWeek = currentMonth.getDay();

  const days = useMemo(() => {
    const arr = [];
    for (let i = 0; i < firstDayOfWeek; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [daysInMonth, firstDayOfWeek]);

  const availableSet = useMemo(() => {
    if (!availableDates || !availableDates.length) return new Set();
    return new Set(availableDates);
  }, [availableDates]);

  const hasRealDates = source === 'api' && availableSet.size > 0;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  function prevMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  }

  function nextMonth() {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  }

  function selectDate(day) {
    if (!day) return;
    const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
    if (d < minDate) return;
    const iso = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (value === iso) {
      onChange('');
    } else {
      onChange(iso);
    }
  }

  function toISO(day) {
    return `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 border border-slate-600/50 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all active:scale-95">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8L10 4"/></svg>
        </button>
        <span className="font-bold text-white text-base tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
        <button type="button" onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-slate-700/80 transition-all active:scale-95">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12L10 8L6 4"/></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-2">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
          <div key={d} className="text-center text-[11px] font-semibold text-slate-500 py-1 uppercase tracking-wider">{d}</div>
        ))}
      </div>
      {loading ? (
        <div className="grid grid-cols-7 gap-0.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="aspect-square flex items-center justify-center">
              <div className="w-6 h-6 rounded-full bg-slate-700/50 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {days.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} />;
            const iso = toISO(day);
            const d = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), day);
            const isPast = d < minDate;
            const isSelected = iso === value;
            const isToday = iso === today.toISOString().split('T')[0];
            const isAvailable = hasRealDates && availableSet.has(iso);
            return (
              <button key={iso} type="button" onClick={() => selectDate(day)} disabled={isPast || (hasRealDates && !isAvailable)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all duration-150 ${isPast || (hasRealDates && !isAvailable) ? 'text-slate-600 cursor-not-allowed' : isAvailable ? 'text-white cursor-pointer hover:bg-emerald-500/20 hover:scale-105' : 'text-slate-400 cursor-pointer hover:bg-slate-700/60 hover:text-slate-200'} ${isSelected ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-600/30 ring-2 ring-blue-400/50' : ''} ${isToday && !isSelected ? 'ring-1 ring-slate-500' : ''}`}>
                <span className={`text-xs sm:text-sm leading-none ${isToday && !isSelected ? 'text-blue-400 font-semibold' : ''}`}>{day}</span>
                {isAvailable && !isPast && <span className={`mt-1 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400 shadow-sm shadow-emerald-400/50'}`} />}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-slate-700/50">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
            Loading available dates...
          </div>
        ) : hasRealDates ? (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" /><span className="text-slate-400">Available ({availableSet.size})</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-600" /><span className="text-slate-400">Selected</span></div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">{source === 'none' ? 'Select any exam date to search for available centers' : 'Pick a date to search for centers'}</div>
        )}
      </div>
    </div>
  );
}

function LoginPanel({ onLogin, authStatus, setAuthStatus }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const json = await res.json();
        if (json.success) setAuthStatus(json.data);
      } catch {}
    }
    checkStatus();
  }, [setAuthStatus]);

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setAuthStatus({ loggedIn: true });
        onLogin();
      } else {
        setError(json.error || 'Login failed.');
      }
    } catch {
      setError('Connection error.');
    } finally {
      setLoading(false);
    }
  }

  if (authStatus?.loggedIn) {
    return (
      <div className="bg-slate-900/80 backdrop-blur rounded-xl p-3 border border-emerald-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
          <span className="text-xs text-slate-400">Connected</span>
        </div>
        <button onClick={() => { setAuthStatus({ loggedIn: false }); try { fetch('/api/auth/logout', { method: 'POST' }); } catch {} }} className="text-xs text-slate-500 hover:text-red-400 transition-colors px-2.5 py-1 rounded-lg hover:bg-red-500/10">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 backdrop-blur rounded-xl p-3 border border-slate-800 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        <span className="text-xs text-slate-500">Not connected</span>
      </div>
      <button onClick={handleLogin} disabled={loading}
        className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 disabled:text-slate-600 rounded-lg text-slate-300 hover:text-white transition-all disabled:cursor-not-allowed border border-slate-700 hover:border-slate-600">
        {loading ? (
          <span className="flex items-center gap-1.5">
            <div className="w-3 h-3 border-[1.5px] border-white/30 border-t-white rounded-full animate-spin" />
            Waiting...
          </span>
        ) : 'Login'}
      </button>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState('search');
  const [authStatus, setAuthStatus] = useState({ loggedIn: false });
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingCities, setLoadingCities] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [allDatesRaw, setAllDatesRaw] = useState([]);
  const [dateSource, setDateSource] = useState('none');
  const [loadingDates, setLoadingDates] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const [availableSessions, setAvailableSessions] = useState({});

  const [rescheduleSession, setRescheduleSession] = useState('');
  const [rescheduleNewDate, setRescheduleNewDate] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleResult, setRescheduleResult] = useState(null);

  const [rescheduleCategory, setRescheduleCategory] = useState('');
  const [rescheduleCity, setRescheduleCity] = useState('');
  const [rescheduleCities, setRescheduleCities] = useState([]);
  const [rescheduleAllDatesRaw, setRescheduleAllDatesRaw] = useState([]);
  const [rescheduleAvailableDates, setRescheduleAvailableDates] = useState([]);
  const [rescheduleDateSource, setRescheduleDateSource] = useState('none');
  const [rescheduleLoadingDates, setRescheduleLoadingDates] = useState(false);
  const [rescheduleLoadingCities, setRescheduleLoadingCities] = useState(false);

  const [rescheduleCenters, setRescheduleCenters] = useState([]);
  const [rescheduleCenter, setRescheduleCenter] = useState('');
  const [rescheduleLoadingCenters, setRescheduleLoadingCenters] = useState(false);

  const [rescheduleAvailableSessions, setRescheduleAvailableSessions] = useState([]);
  const [rescheduleLoadingSessions, setRescheduleLoadingSessions] = useState(false);
  const [rescheduleSelectedSessionId, setRescheduleSelectedSessionId] = useState('');
  const [rescheduleSelectedTime, setRescheduleSelectedTime] = useState('');
  const [rescheduleSessionsFromDates, setRescheduleSessionsFromDates] = useState({});

  const [cancelSession, setCancelSession] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [rescheduleSelected, setRescheduleSelected] = useState(null);
  const [cancelSelected, setCancelSelected] = useState(null);

  const [examResults, setExamResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');

  const minDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/takamol/categories');
        const json = await res.json();
        if (json.success) setCategories(json.data.categories);
        else setError('Failed to load categories.');
      } catch {
        setError('Server connection error.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedCategory) return;
    let cancelled = false;
    async function loadCitiesAndDates() {
      setLoadingCities(true);
      setLoadingDates(true);
      setCities([]);
      setSelectedCity('');
      setResults(null);
      setAllDatesRaw([]);
      setAvailableDates([]);
      setAvailableSessions({});
      setDateSource('none');
      setSelectedDate('');
      try {
        const res = await fetch('/api/takamol/dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: selectedCategory })
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setCities(json.data.cities || []);
          setAllDatesRaw(json.raw_dates || []);
          setAvailableDates(json.data.dates || []);
          setAvailableSessions(json.data.sessions || {});
          setDateSource(json.data.source || 'none');
        } else if (!cancelled && json.error) {
          setError(json.error);
        }
      } catch {} finally {
        if (!cancelled) { setLoadingCities(false); setLoadingDates(false); }
      }
    }
    loadCitiesAndDates();
    return () => { cancelled = true; };
  }, [selectedCategory]);

  useEffect(() => {
    if (!rescheduleCategory) return;
    let cancelled = false;
    async function loadRescheduleCitiesAndDates() {
      setRescheduleLoadingCities(true);
      setRescheduleLoadingDates(true);
      setRescheduleCities([]);
      setRescheduleCity('');
      setRescheduleAllDatesRaw([]);
      setRescheduleAvailableDates([]);
      setRescheduleDateSource('none');
      setRescheduleNewDate('');
      setRescheduleSessionsFromDates({});
      try {
        const res = await fetch('/api/takamol/dates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: rescheduleCategory })
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setRescheduleCities(json.data.cities || []);
          setRescheduleAllDatesRaw(json.raw_dates || []);
          setRescheduleAvailableDates(json.data.dates || []);
          setRescheduleSessionsFromDates(json.data.sessions || {});
          setRescheduleDateSource(json.data.source || 'none');
        }
      } catch {} finally {
        if (!cancelled) { setRescheduleLoadingCities(false); setRescheduleLoadingDates(false); }
      }
    }
    loadRescheduleCitiesAndDates();
    return () => { cancelled = true; };
  }, [rescheduleCategory]);

  useEffect(() => {
    if (!rescheduleCategory || !rescheduleCity) return;
    let cancelled = false;
    async function loadCenters() {
      setRescheduleLoadingCenters(true);
      try {
        const cityObj = rescheduleCities.find(c => c.id === rescheduleCity);
        const cityName = cityObj ? cityObj.name : rescheduleCity;
        const res = await fetch('/api/takamol/centers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: rescheduleCategory, city: cityName })
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          setRescheduleCenters(json.data.centers || []);
          setRescheduleCenter('');
        }
      } catch {} finally { if (!cancelled) setRescheduleLoadingCenters(false); }
    }
    loadCenters();
    return () => { cancelled = true; };
  }, [rescheduleCategory, rescheduleCity, rescheduleCities]);

  useEffect(() => {
    if (!rescheduleCategory || !rescheduleNewDate) {
      setRescheduleAvailableSessions([]);
      setRescheduleSelectedSessionId('');
      setRescheduleSelectedTime('');
      return;
    }
    let cancelled = false;
    async function loadSessions() {
      setRescheduleLoadingSessions(true);
      setRescheduleAvailableSessions([]);
      setRescheduleSelectedSessionId('');
      setRescheduleSelectedTime('');
      try {
        const cityObj = rescheduleCity ? rescheduleCities.find(c => c.id === rescheduleCity) : null;
        const cityName = cityObj ? cityObj.name : undefined;
        const res = await fetch('/api/takamol/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: rescheduleCategory, date: rescheduleNewDate, city: cityName })
        });
        const json = await res.json();
        console.log('[reschedule] Sessions API response:', JSON.stringify(json).substring(0, 2000));
        if (!cancelled && json.success) {
          const apiSessions = json.data.sessions || [];
          const normalizedDate = rescheduleNewDate;
          const sessionsForDate = apiSessions.map(s => {
            let time = s.test_time || s.start_time || s.time || s.time_slot || s.start_time_in_tc_time_zone || s.test_time_in_tc_time_zone || s.exam_session?.test_time || s.exam_session?.start_time || s.exam_session?.test_time_in_tc_time_zone || s.schedule?.test_time || s.schedule?.test_time_in_tc_time_zone || '';
            if (!time) {
              const dtFields = [s.start_date_in_tc_time_zone, s.start_date_in_browser_time_zone, s.end_date_in_tc_time_zone, s.exam_date_time, s.exam_session?.start_date_in_tc_time_zone, s.exam_session?.start_date, s.exam_session?.end_date_in_tc_time_zone, s.schedule?.start_date_in_tc_time_zone, s.schedule?.start_date];
              for (const dt of dtFields) {
                if (dt && String(dt).includes('T')) {
                  const m = String(dt).match(/T(\d{2}:\d{2})/);
                  if (m) { time = m[1]; break; }
                }
              }
            }
            const date = s.test_date || s.date || s.start_date || s.start_date_in_tc_time_zone || s.start_date_in_browser_time_zone || s.exam_session?.test_date || s.exam_session?.date || s.schedule?.test_date || '';
            const dateMatch = !date || String(date).includes(normalizedDate);
            return {
              id: s.id || s.exam_session_id || s.exam_session?.id || s.session_id,
              date,
              time,
              city: s.test_center?.city || s.test_center?.test_center_city || '',
              centerName: s.test_center?.test_center_name || s.test_center?.name || '',
              seats: s.available_seats ?? s.seats_available ?? s.slots_available ?? s.capacity ?? null,
              raw: s,
              dateMatch
            };
          }).filter(s => s.dateMatch && s.id);

          console.log('[reschedule] Final sessions for', normalizedDate, ':', sessionsForDate.length, 'with time:', sessionsForDate.filter(s => s.time).length);
          if (!cancelled) setRescheduleAvailableSessions(sessionsForDate);
        }
      } catch (e) {
        console.error('[reschedule] Failed to load sessions:', e.message);
      } finally {
        if (!cancelled) setRescheduleLoadingSessions(false);
      }
    }
    loadSessions();
    return () => { cancelled = true; };
  }, [rescheduleCategory, rescheduleNewDate, rescheduleCity, rescheduleCities]);

  const filteredCityDates = useMemo(() => {
    if (!selectedCategory || !selectedCity) return { dates: [], source: 'none' };
    const cityObj = cities.find(c => c.id === selectedCity);
    if (!cityObj) return { dates: [], source: 'none' };
    const cityName = cityObj.name;
    const cityNameLower = cityName.toLowerCase();
    const extractDateFromRaw = (d) => {
      const raw = d.start_date_in_tc_time_zone || d.date || d.start_date || d.start_date_in_browser_time_zone;
      if (!raw) return null;
      const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
    };
    const extractCityFromRaw = (d) => {
      return d.test_center?.city || d.city || d.test_center?.test_center_city || '';
    };
    const filteredDates = allDatesRaw
      .filter(d => {
        const itemCity = extractCityFromRaw(d);
        return itemCity && itemCity.toLowerCase() === cityNameLower;
      })
      .map(d => extractDateFromRaw(d))
      .filter(Boolean);
    const uniqueDates = [...new Set(filteredDates)].sort();
    return { dates: uniqueDates, source: uniqueDates.length > 0 ? 'api' : 'none' };
  }, [selectedCategory, selectedCity, cities, allDatesRaw]);

  const effectiveAvailableDates = selectedCity ? filteredCityDates.dates : availableDates;
  const effectiveDateSource = selectedCity ? filteredCityDates.source : dateSource;

  const effectiveSessions = useMemo(() => {
    if (!selectedCity) return availableSessions;
    const cityObj = cities.find(c => c.id === selectedCity);
    if (!cityObj) return availableSessions;
    const cityNameLower = cityObj.name.toLowerCase();
    const filtered = {};
    for (const [date, sessions] of Object.entries(availableSessions)) {
      const filteredSessions = sessions.filter(s => {
        const sessCity = (s.city || '').toLowerCase();
        return sessCity === cityNameLower;
      });
      if (filteredSessions.length > 0) filtered[date] = filteredSessions;
    }
    return filtered;
  }, [selectedCity, cities, availableSessions]);

  const rescheduleFilteredCityDates = useMemo(() => {
    if (!rescheduleCategory || !rescheduleCity) return { dates: [], source: 'none' };
    const cityObj = rescheduleCities.find(c => c.id === rescheduleCity);
    if (!cityObj) return { dates: [], source: 'none' };
    const cityName = cityObj.name;
    const cityNameLower = cityName.toLowerCase();
    const extractDateFromRaw = (d) => {
      const raw = d.start_date_in_tc_time_zone || d.date || d.start_date || d.start_date_in_browser_time_zone;
      if (!raw) return null;
      const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
      return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
    };
    const extractCityFromRaw = (d) => {
      return d.test_center?.city || d.city || d.test_center?.test_center_city || '';
    };
    const filteredDates = rescheduleAllDatesRaw
      .filter(d => {
        const itemCity = extractCityFromRaw(d);
        return itemCity && itemCity.toLowerCase() === cityNameLower;
      })
      .map(d => extractDateFromRaw(d))
      .filter(Boolean);
    const uniqueDates = [...new Set(filteredDates)].sort();
    return { dates: uniqueDates, source: uniqueDates.length > 0 ? 'api' : 'none' };
  }, [rescheduleCategory, rescheduleCity, rescheduleCities, rescheduleAllDatesRaw]);

  const rescheduleEffectiveAvailableDates = rescheduleCity ? rescheduleFilteredCityDates.dates : rescheduleAvailableDates;
  const rescheduleEffectiveDateSource = rescheduleCity ? rescheduleFilteredCityDates.source : rescheduleDateSource;

  const rescheduleAvailableTimes = useMemo(() => {
    if (!rescheduleAvailableSessions || rescheduleAvailableSessions.length === 0) return [];
    const timeMap = new Map();
    for (const s of rescheduleAvailableSessions) {
      const t = (s.time || '').trim();
      if (!t) continue;
      if (!timeMap.has(t)) {
        timeMap.set(t, { time: t, centerName: s.centerName || '', city: s.city || '', seats: s.seats ?? null });
      }
    }
    const sorted = [...timeMap.values()].sort((a, b) => a.time.localeCompare(b.time));
    return sorted;
  }, [rescheduleAvailableSessions]);

  const rescheduleCategories = useMemo(() => {
    const session = rescheduleSelected?.session;
    if (!session) return categories;
    const sessionName = (session.category?.english_name || session.occupation?.english_name || '').trim();
    if (!sessionName) return categories;
    const found = categories.some(c => c.name === sessionName);
    if (found) return categories;
    const sessionId = session.category?.id || session.occupation?.id || session.category_id || session.occupation_id;
    return [{ id: sessionId, name: sessionName }, ...categories];
  }, [categories, rescheduleSelected?.session]);

  async function handleSearch() {
    if (!selectedCategory) { setError('Please select a category.'); return; }
    if (!selectedCity) { setError('Please select a city.'); return; }
    if (!selectedDate) { setError('Please select an exam date.'); return; }
    setError(''); setSearching(true); setResults(null);
    try {
      const res = await fetch('/api/search', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: selectedCategory, city: selectedCity, date: selectedDate })
      });
      const json = await res.json();
      if (json.success) setResults(json.data);
      else setError(json.error || 'Search failed.');
    } catch { setError('Search request failed.'); } finally { setSearching(false); }
  }

  async function handleReschedule() {
    if (!rescheduleSession || !rescheduleNewDate) { setError('Session ID and new date are required.'); return; }
    setRescheduleLoading(true); setRescheduleResult(null); setError('');
    try {
      const res = await fetch('/api/exam/reschedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: rescheduleSession, newDate: rescheduleNewDate, categoryId: selectedCategory })
      });
      const json = await res.json();
      setRescheduleResult(json);
      if (!json.success) setError(json.error || 'Reschedule failed.');
    } catch { setError('Reschedule request failed.'); } finally { setRescheduleLoading(false); }
  }

  async function handleCancel() {
    if (!cancelSession) { setError('Session ID is required.'); return; }
    setCancelLoading(true); setCancelResult(null); setError('');
    try {
      const res = await fetch('/api/exam/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: cancelSession, reason: cancelReason })
      });
      const json = await res.json();
      setCancelResult(json);
      if (!json.success) setError(json.error || 'Cancel failed.');
    } catch { setError('Cancel request failed.'); } finally { setCancelLoading(false); }
  }

  async function handleLoadResults() {
    setLoadingResults(true); setExamResults(null); setResultsError('');
    try {
      const res = await fetch('/api/exam/results', { method: 'GET' });
      const json = await res.json();
      if (json.success) setExamResults(json.data.results);
      else setResultsError(json.error || 'Failed to load results.');
    } catch { setResultsError('Results request failed.'); } finally { setLoadingResults(false); }
  }

  async function handleLoadSessions() {
    if (!authStatus?.loggedIn) return;
    setLoadingSessions(true);
    try {
      const res = await fetch('/api/exam/sessions');
      const json = await res.json();
      if (json.success) setSessions(json.data.sessions);
    } catch {} finally { setLoadingSessions(false); }
  }

  useEffect(() => {
    if (!authStatus?.loggedIn) return;
    let cancelled = false;
    async function load() {
      setLoadingSessions(true);
      try {
        const res = await fetch('/api/exam/sessions');
        const json = await res.json();
        if (!cancelled && json.success) setSessions(json.data.sessions);
      } catch {} finally { if (!cancelled) setLoadingSessions(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [authStatus?.loggedIn]);

  useEffect(() => {
    if (!authStatus?.loggedIn || activeTab !== 'results' || examResults) return;
    let cancelled = false;
    async function load() {
      setLoadingResults(true); setResultsError('');
      try {
        const res = await fetch('/api/exam/results', { method: 'GET' });
        const json = await res.json();
        if (!cancelled && json.success) setExamResults(json.data.results);
        else if (!cancelled) setResultsError(json.error || 'Failed to load results.');
      } catch { if (!cancelled) setResultsError('Results request failed.'); } finally { if (!cancelled) setLoadingResults(false); }
    }
    load();
    return () => { cancelled = true; };
  }, [authStatus?.loggedIn, activeTab]);

  const categorySearchDebounced = useDebounce(categorySearch, 300);

  const filteredCategories = useMemo(() => {
    if (!categorySearchDebounced) return categories;
    const words = categorySearchDebounced.toLowerCase().split(/\s+/).filter(Boolean);
    return categories.filter(cat => {
      const name = cat.name.toLowerCase();
      return words.every(word => name.includes(word));
    });
  }, [categories, categorySearchDebounced]);

  const selectedCatName = categories.find(c => c.id == selectedCategory)?.name || '';
  const selectedCityName = cities.find(c => c.id === selectedCity)?.name || '';

  const tabs = [
    { id: 'search', label: 'Search', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: 'bookings', label: 'My Bookings', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'results', label: 'Results', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-10 space-y-6">
        <div className="text-center mb-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Exam Center Manager</h1>
          <p className="text-slate-500 text-sm">Bangladesh — Search, Schedule, Reschedule & Manage Exams</p>
        </div>

        <LoginPanel onLogin={() => {}} authStatus={authStatus} setAuthStatus={setAuthStatus} />

        <div className="flex gap-1 bg-slate-900/60 rounded-xl p-1 border border-slate-800">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(''); if (tab.id === 'results' && authStatus?.loggedIn && !examResults) handleLoadResults(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-semibold transition-all ${activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50'}`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon}/></svg>
              {tab.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
            {error}
          </div>
        )}

        {activeTab === 'search' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-6 border border-slate-800 space-y-5">
                <div className="flex items-center gap-2 mb-1">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Search Centers</span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Category</label>
                  <div className="relative">
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input type="text" value={categorySearch} onChange={(e) => { setCategorySearch(e.target.value); setShowCategoryDropdown(true); if (!e.target.value && selectedCategory) { setSelectedCategory(''); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); } }} onFocus={() => setShowCategoryDropdown(true)} onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)} placeholder={selectedCategory ? selectedCatName : 'Search categories...'} className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all placeholder:text-slate-500" />
                      {categorySearch && (
                        <button type="button" onClick={() => { setCategorySearch(''); setSelectedCategory(''); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); setShowCategoryDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    {showCategoryDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-slate-800 border border-slate-700 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                        {filteredCategories.length > 0 ? filteredCategories.slice(0, 50).map((cat, idx) => (
                          <button key={`${cat.id}-${idx}`} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedCategory(cat.id); setCategorySearch(cat.name); setShowCategoryDropdown(false); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); }}
                            className={`w-full text-left px-4 py-3 text-sm text-white hover:bg-slate-700/80 transition-colors border-b border-slate-700/50 last:border-b-0 ${selectedCategory === cat.id ? 'bg-blue-600/20 text-blue-400' : ''}`}>
                            {cat.name}
                          </button>
                        )) : (
                          <div className="px-4 py-3 text-sm text-slate-500">No categories found</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                    City {loadingCities && <span className="ml-2 text-[10px] text-blue-400 normal-case tracking-normal">Loading...</span>}
                  </label>
                  <select value={selectedCity} onChange={(e) => { setSelectedCity(e.target.value); setSelectedDate(''); setResults(null); }} disabled={!selectedCategory || loadingCities}
                    className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                    <option value="">{!selectedCategory ? 'Select category first' : loadingCities ? 'Loading cities...' : '-- Select City --'}</option>
                    {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                  </select>
                </div>
                <button onClick={handleSearch} disabled={searching || !selectedCategory || !selectedCity || !selectedDate}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl font-semibold text-sm text-white transition-all disabled:cursor-not-allowed active:scale-[0.98]">
                  {searching ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Searching...</span> : 'Search Exam Centers'}
                </button>
              </div>
              {results && (
                <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-6 border border-slate-800">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-bold text-white">Results for {selectedDate}</h2>
                    <span className="text-xs px-2.5 py-1 bg-slate-800 rounded-full text-slate-400 border border-slate-700">{results.total} center{results.total !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg">{selectedCatName}</span>
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">{selectedCityName}</span>
                  </div>
                  {results.centers && results.centers.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {results.centers.map((center) => (
                        <div key={center.id} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50 hover:border-slate-600 transition-colors">
                          <h3 className="font-semibold text-white text-sm">{center.name}</h3>
                          {center.address && <p className="text-xs text-slate-500 mt-1.5">{center.address}</p>}
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-slate-500 text-sm">No exam centers found for this selection.</p>}
                </div>
              )}
            </div>
            <div>
              <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-5 border border-slate-800">
                <div className="flex items-center gap-2 mb-4">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Exam Date</span>
                </div>
                <Calendar value={selectedDate} onChange={setSelectedDate} minDate={minDate} availableDates={effectiveAvailableDates} loading={loadingDates} source={effectiveDateSource} />
                {selectedDate && effectiveSessions[selectedDate] && effectiveSessions[selectedDate].length > 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-700/50">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Available Sessions for {selectedDate}</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {effectiveSessions[selectedDate].map((sess, si) => (
                        <div key={sess.id || si} className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/30">
                          <div className="flex items-center gap-3">
                            {sess.time && <span className="text-sm font-medium text-white">{sess.time}</span>}
                            {!sess.time && <span className="text-sm font-medium text-slate-400">Session #{si + 1}</span>}
                            {sess.centerName && <span className="text-xs text-slate-500 truncate max-w-[180px]">{sess.centerName}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {sess.seats != null && <span className="text-[10px] text-emerald-400">{sess.seats} seats</span>}
                            {sess.city && <span className="text-[10px] text-slate-600">{sess.city}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDate && effectiveSessions[selectedDate] && effectiveSessions[selectedDate].length === 0 && (
                  <div className="mt-4 pt-3 border-t border-slate-700/50">
                    <div className="text-xs text-slate-500">No session details available for this date. Select a city to see filtered sessions.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="max-w-3xl mx-auto space-y-4">
            {!authStatus?.loggedIn && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm text-center">
                Please login first to view your bookings.
              </div>
            )}
            {authStatus?.loggedIn && (
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Your Exam Bookings</h2>
                <button onClick={handleLoadSessions} disabled={loadingSessions}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800 rounded-lg text-xs text-slate-400 transition-all">
                  {loadingSessions ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            )}
            {loadingSessions && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loadingSessions && sessions.length === 0 && authStatus?.loggedIn && (
              <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-8 border border-slate-800 text-center">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto mb-3 text-slate-600"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                <p className="text-slate-500 text-sm">No exam bookings found.</p>
                <p className="text-slate-600 text-xs mt-1">Book an exam from the Search tab to see it here.</p>
              </div>
            )}
            {sessions.length > 0 && (
              <div className="space-y-3">
                 {sessions.map((session, i) => {
                   const sid = session.id || `session-${i}`;
                   const name = session.category?.english_name || session.occupation?.english_name || session.occupation?.name || `Exam #${i + 1}`;
                   const date = session.exam_session?.test_date || '';
                   const time = session.exam_session?.test_time || '';
                   const center = session.test_center?.test_center_name || '';
                   const city = session.test_center?.test_center_city || '';
                   const status = (session.reservation_status || 'scheduled').toLowerCase();
                   const canReschedule = session.can_be_rescheduled !== false && !['completed','passed','cancelled'].includes(status);
                   const canCancel = session.can_be_canceled !== false && !['completed','passed','cancelled'].includes(status);
                   const certId = session.certificate?.id || sid;
                   const isRescheduling = rescheduleSelected?.id === sid;
                   const isCancelling = cancelSelected?.id === sid;

                   const statusColors = {
                     scheduled: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
                     confirmed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     completed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     passed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     cancelled: 'bg-red-500/10 border-red-500/30 text-red-400',
                     rescheduled: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                     pending: 'bg-slate-700 border-slate-600 text-slate-400',
                   };

                   return (
                     <div key={sid} className="bg-slate-900/80 backdrop-blur rounded-2xl border border-slate-800 overflow-hidden">
                       <div className="p-5">
                         <div className="flex items-start justify-between mb-3">
                           <div>
                             <h3 className="font-semibold text-white text-sm">{name}</h3>
                             {date && <p className="text-xs text-slate-400 mt-1">{date}{time ? ` at ${time}` : ''}</p>}
                             {(center || city) && <p className="text-xs text-slate-500 mt-0.5">{[center, city].filter(Boolean).join(', ')}</p>}
                           </div>
                           <span className={`text-[11px] px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[status] || statusColors.pending}`}>{status}</span>
                         </div>
                         <div className="flex flex-wrap gap-2">
                           <button onClick={() => {
                              if (isRescheduling) {
                                setRescheduleSelected(null);
                                setRescheduleNewDate('');
                                setRescheduleCategory('');
                                setRescheduleCity('');
                                setRescheduleSelectedSessionId('');
                                setRescheduleSelectedTime('');
                             } else {
                               const sessionName = (session.category?.english_name || session.occupation?.english_name || '').trim();
                               const sessionId = session.category?.id || session.occupation?.id || session.category_id || session.occupation_id;
                               let matchedCat = categories.find(c => c.id == sessionId);
                               if (!matchedCat && sessionName) {
                                 matchedCat = categories.find(c => c.name === sessionName);
                               }
                               const catId = matchedCat ? matchedCat.id : sessionId;
                               setRescheduleSelected({ id: sid, session });
                               setRescheduleCategory(String(catId || ''));
                               setRescheduleCity('');
                                setRescheduleNewDate('');
                               }
                            }} disabled={!canReschedule}
                              className="px-3 py-1.5 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 text-amber-400 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                              Reschedule
                            </button>
                           <button onClick={() => setCancelSelected(isCancelling ? null : { id: sid, session })} disabled={!canCancel}
                             className="px-3 py-1.5 bg-red-600/10 hover:bg-red-600/20 border border-red-500/20 text-red-400 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                             Cancel
                           </button>
                           {session.certificate && (
                             <a href={`/api/exam/certificate/${certId}`} target="_blank" rel="noopener noreferrer"
                               className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                               Certificate
                             </a>
                           )}
                         </div>
                       </div>
                      {isRescheduling && (
                        <div className="px-5 pb-5 pt-0 border-t border-slate-800 mt-1 pt-4 space-y-3">
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Category</label>
                             <select value={rescheduleCategory} onChange={(e) => { setRescheduleCategory(e.target.value); setRescheduleCity(''); setRescheduleNewDate(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleSelectedTime(''); }}
                              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all appearance-none cursor-pointer">
                              <option value="">-- Select Category --</option>
                              {rescheduleCategories.map((cat, idx) => <option key={`${cat.id}-${idx}`} value={cat.id}>{cat.name}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                              City {rescheduleLoadingCities && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                            </label>
                             <select value={rescheduleCity} onChange={(e) => { setRescheduleCity(e.target.value); setRescheduleNewDate(''); setRescheduleCenter(''); setRescheduleSelectedTime(''); }} disabled={!rescheduleCategory || rescheduleLoadingCities}
                              className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                              <option value="">{!rescheduleCategory ? 'Select category first' : rescheduleLoadingCities ? 'Loading cities...' : '-- Select City --'}</option>
                              {rescheduleCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                            </select>
                          </div>
                          {rescheduleCity && rescheduleCenters.length > 0 && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                Test Center {rescheduleLoadingCenters && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              <select value={rescheduleCenter} onChange={(e) => setRescheduleCenter(e.target.value)} disabled={rescheduleLoadingCenters}
                                className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                                <option value="">{rescheduleLoadingCenters ? 'Loading centers...' : '-- Select Center (optional) --'}</option>
                                {rescheduleCenters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` - ${c.city}` : ''}</option>)}
                              </select>
                            </div>
                          )}
                           <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">New Date</label>
                            <Calendar value={rescheduleNewDate} onChange={(v) => { console.log('[reschedule] Calendar onChange:', v, 'current rescheduleNewDate:', rescheduleNewDate); setRescheduleNewDate(v); setRescheduleSelectedSessionId(''); setRescheduleSelectedTime(''); }} minDate={minDate} availableDates={rescheduleEffectiveAvailableDates} loading={rescheduleLoadingDates} source={rescheduleEffectiveDateSource} />
                          </div>
                          {rescheduleNewDate && (
                            <div>
                              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                                Available Session {rescheduleLoadingSessions && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              {rescheduleLoadingSessions ? (
                                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                  <div className="w-3 h-3 border-[1.5px] border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                                  Fetching available sessions...
                                </div>
                              ) : rescheduleAvailableSessions.length > 0 ? (
                                <>
                                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                  {(() => {
                                    if (rescheduleAvailableSessions.length > 0) {
                                      console.log('[reschedule] All sessions:', JSON.stringify(rescheduleAvailableSessions).substring(0, 2000));
                                    }
                                    return rescheduleAvailableSessions.map((s, idx) => {
                                      const sessionId = s.id || idx;
                                      const time = s.time || '';
                                      const date = s.date || '';
                                      const centerName = s.centerName || '';
                                      const centerCity = s.city || '';
                                      const slots = s.seats ?? '';
                                      const isSelected = rescheduleSelectedSessionId === String(sessionId);
                                      const dateMatch = date && rescheduleNewDate ? String(date).includes(rescheduleNewDate) : true;
                                      return (
                                        <button key={sessionId || idx} type="button" onClick={() => { if (isSelected) { setRescheduleSelectedSessionId(''); setRescheduleSelectedTime(''); } else { setRescheduleSelectedSessionId(String(sessionId)); setRescheduleSelectedTime(time); } }}
                                          className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected ? 'bg-amber-600/20 border-amber-500/50 ring-1 ring-amber-500/30' : 'bg-slate-800/60 border-slate-700/50 hover:border-slate-600 hover:bg-slate-800'}`}>
                                          <div className="flex items-center justify-between">
                                            <div className="min-w-0">
                                              <div className="flex items-center gap-2 flex-wrap">
                                                {time && <span className="text-sm font-medium text-white">{time}</span>}
                                                {date && <span className="text-xs text-amber-400">{date}</span>}
                                                {!time && !date && <span className="text-sm font-medium text-slate-400">Session #{idx + 1}</span>}
                                              </div>
                                              {(centerName || centerCity) && <div className="text-xs text-slate-500 mt-0.5 truncate">{[centerName, centerCity].filter(Boolean).join(', ')}</div>}
                                              {!dateMatch && date && <div className="text-[10px] text-amber-400/70 mt-0.5">This session&apos;s date differs from selected</div>}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              {slots !== '' && slots !== null && <span className="text-[10px] text-slate-500">{slots} seats</span>}
                                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-slate-600'}`}>
                                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                              </div>
                                            </div>
                                          </div>
                                        </button>
                                      );
                                    });
                                  })()}
                                </div>
                                {rescheduleAvailableTimes.length > 0 && (
                                  <div className="mt-3">
                                    <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">Select Time Slot</label>
                                    <select
                                      value={rescheduleSelectedTime}
                                      onChange={(e) => {
                                        const pickedTime = e.target.value;
                                        setRescheduleSelectedTime(pickedTime);
                                        if (!pickedTime) { setRescheduleSelectedSessionId(''); return; }
                                        const matchSession = rescheduleAvailableSessions.find(s => (s.time || '').trim() === pickedTime);
                                        if (matchSession) {
                                          const matchIdx = rescheduleAvailableSessions.indexOf(matchSession);
                                          setRescheduleSelectedSessionId(String(matchSession.id || matchIdx));
                                        }
                                      }}
                                      className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all appearance-none cursor-pointer">
                                      <option value="">-- Select Time --</option>
                                      {rescheduleAvailableTimes.map((t) => (
                                        <option key={t.time} value={t.time}>
                                          {t.time}{t.centerName ? ` - ${t.centerName}` : ''}{t.city ? `, ${t.city}` : ''}{t.seats != null ? ` (${t.seats} seats)` : ''}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {rescheduleSelectedTime && rescheduleSelectedSessionId && (() => {
                                  const selectedSession = rescheduleAvailableSessions.find(s => String(s.id) === rescheduleSelectedSessionId);
                                  if (!selectedSession) return null;
                                  return (
                                    <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                      <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">Selected Slot</div>
                                      <div className="text-sm text-white font-medium">{selectedSession.time}</div>
                                      {selectedSession.centerName && <div className="text-xs text-slate-400 mt-0.5">{selectedSession.centerName}{selectedSession.city ? `, ${selectedSession.city}` : ''}</div>}
                                      {selectedSession.seats != null && <div className="text-xs text-slate-500 mt-0.5">{selectedSession.seats} seats available</div>}
                                    </div>
                                  );
                                })()}
                                </>
                              ) : rescheduleNewDate ? (
                                <div className="text-xs text-slate-500 py-2">No sessions found for this date. Try a different date or city.</div>
                              ) : null}
                            </div>
                          )}
                          <div className="flex gap-2">
                            <button onClick={() => { setRescheduleSelected(null); setRescheduleNewDate(''); setRescheduleCategory(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleAvailableSessions([]); setRescheduleSelectedSessionId(''); setRescheduleSelectedTime(''); }} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 text-xs transition-all">Cancel</button>
                            <button onClick={async () => {
                              if (!rescheduleNewDate || !rescheduleCategory) return;
                              const examSessionId = rescheduleSelectedSessionId;
                              const selectedSessionData = rescheduleAvailableSessions.find(s => String(s.id) === examSessionId);
                              console.log('[reschedule] CONFIRM:', { newDate: rescheduleNewDate, examSessionId, selectedTime: rescheduleSelectedTime, sessionData: selectedSessionData ? JSON.stringify(selectedSessionData).substring(0, 500) : 'NOT FOUND' });
                              if (!examSessionId) { setError('Please select an available session from the list.'); return; }
                              if (!rescheduleSelectedTime) { setError('Please select a time slot from the dropdown.'); return; }
                              setRescheduleLoading(true); setError('');
                              try {
                                const body = { sessionId: sid, newDate: rescheduleNewDate, categoryId: rescheduleCategory, testCenterId: rescheduleCenter || undefined, examSessionId, time: rescheduleSelectedTime };
                                console.log('[reschedule] Sending body:', JSON.stringify(body));
                                const res = await fetch('/api/exam/reschedule', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify(body)
                                });
                                const json = await res.json();
                                console.log('[reschedule] Response:', JSON.stringify(json).substring(0, 500));
                                setRescheduleResult(json);
                                if (json.success) { setRescheduleSelected(null); setRescheduleNewDate(''); setRescheduleCategory(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleAvailableSessions([]); setRescheduleSelectedSessionId(''); setRescheduleSelectedTime(''); handleLoadSessions(); }
                                else setError(json.error || 'Reschedule failed.');
                              } catch { setError('Reschedule request failed.'); } finally { setRescheduleLoading(false); }
                            }} disabled={rescheduleLoading || !rescheduleNewDate || !rescheduleCategory || !rescheduleSelectedSessionId || !rescheduleSelectedTime}
                              className="flex-[2] py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                              {rescheduleLoading ? 'Rescheduling...' : 'Confirm Reschedule'}
                            </button>
                          </div>
                        </div>
                      )}
                      {isCancelling && (
                        <div className="px-5 pb-5 pt-0 border-t border-slate-800 mt-1 pt-4 space-y-3">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Reason (optional)</label>
                          <textarea placeholder="Reason for cancellation" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
                            className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => { setCancelSelected(null); setCancelReason(''); }} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-slate-400 text-xs transition-all">Cancel</button>
                            <button onClick={async () => {
                              setCancelLoading(true); setError('');
                              try {
                                const res = await fetch('/api/exam/cancel', {
                                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ sessionId: sid, reason: cancelReason })
                                });
                                const json = await res.json();
                                setCancelResult(json);
                                if (json.success) { setCancelSelected(null); setCancelReason(''); handleLoadSessions(); }
                                else setError(json.error || 'Cancel failed.');
                              } catch { setError('Cancel request failed.'); } finally { setCancelLoading(false); }
                            }} disabled={cancelLoading}
                              className="flex-[2] py-2 bg-red-600 hover:bg-red-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                              {cancelLoading ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {rescheduleResult && (
              <div className={`p-4 rounded-xl border ${rescheduleResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                {rescheduleResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Exam rescheduled successfully!
                    </div>
                    {rescheduleResult.data?.center && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-slate-400"><span className="text-slate-500">Center:</span> <span className="text-white">{rescheduleResult.data.center.name}</span></div>
                        {rescheduleResult.data.center.city && <div className="text-slate-400"><span className="text-slate-500">City:</span> <span className="text-white">{rescheduleResult.data.center.city}</span></div>}
                        {rescheduleResult.data.center.address && <div className="text-slate-400"><span className="text-slate-500">Address:</span> <span className="text-white">{rescheduleResult.data.center.address}</span></div>}
                      </div>
                    )}
                    {rescheduleResult.data?.testDate && (
                      <div className="text-xs text-slate-400"><span className="text-slate-500">New Date:</span> <span className="text-white">{rescheduleResult.data.testDate}{rescheduleResult.data.testTime ? ` at ${rescheduleResult.data.testTime}` : ''}</span></div>
                    )}
                    {rescheduleResult.data?.status && (
                      <div className="text-xs text-slate-400"><span className="text-slate-500">Status:</span> <span className="text-emerald-400 capitalize">{rescheduleResult.data.status}</span></div>
                    )}
                  </div>
                ) : (
                  <span className="text-red-400 text-sm">{rescheduleResult.error || 'Reschedule failed.'}</span>
                )}
                <button onClick={() => setRescheduleResult(null)} className="mt-2 text-xs underline opacity-70 text-slate-400">dismiss</button>
              </div>
            )}
            {cancelResult && (
              <div className={`p-3 rounded-xl border text-sm ${cancelResult.success ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                {cancelResult.success ? 'Exam cancelled successfully!' : cancelResult.error || 'Cancellation failed.'}
                <button onClick={() => setCancelResult(null)} className="ml-2 text-xs underline opacity-70">dismiss</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'results' && (
          <div className="max-w-2xl mx-auto space-y-4">
            {!authStatus?.loggedIn && (
              <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-sm text-center">
                Please login first to view results.
              </div>
            )}
            <div className="bg-slate-900/80 backdrop-blur rounded-2xl p-6 border border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Exam Results</span>
                </div>
                <button onClick={handleLoadResults} disabled={loadingResults || !authStatus?.loggedIn}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-xl text-xs font-semibold text-white transition-all disabled:cursor-not-allowed">
                  {loadingResults ? 'Loading...' : 'Load Results'}
                </button>
              </div>
              {resultsError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm mb-4">{resultsError}</div>
              )}
              {loadingResults && (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {examResults && examResults.length > 0 && (
                <div className="space-y-3">
                  {examResults.map((r, i) => {
                    const rid = r.certificate?.id || r.id || `result-${i}`;
                    const passed = (r.final_result || r.exam_result || '').toLowerCase() === 'passed';
                    const rName = r.category?.english_name || r.occupation?.english_name || `Exam ${i + 1}`;
                    const rDate = r.exam_session?.test_date || '';
                    const rCenter = r.test_center?.test_center_name || '';
                    const rCity = r.test_center?.test_center_city || '';
                    const score = r.examination_result?.total_score;
                    const certNum = r.certificate?.certificate_number || '';
                    return (
                      <div key={rid} className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/50">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-semibold text-white text-sm">{rName}</h3>
                          <span className={`text-xs px-2.5 py-1 rounded-full border ${passed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                            {passed ? 'Passed' : r.final_result || r.exam_result || 'N/A'}
                          </span>
                        </div>
                        {rDate && <p className="text-xs text-slate-500">Date: {rDate}</p>}
                        {(rCenter || rCity) && <p className="text-xs text-slate-500">Center: {[rCenter, rCity].filter(Boolean).join(', ')}</p>}
                        {score != null && <p className="text-xs text-slate-400 mt-1">Score: {score}/100</p>}
                        {certNum && <p className="text-xs text-slate-500 mt-0.5">Certificate: {certNum}</p>}
                        {r.certificate && (
                          <a href={`/api/exam/certificate/${rid}`} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            Download Certificate
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {examResults && examResults.length === 0 && !loadingResults && (
                <p className="text-slate-500 text-sm text-center py-6">No results found.</p>
              )}
              {!examResults && !loadingResults && !resultsError && (
                <p className="text-slate-500 text-sm text-center py-6">Click &quot;Load Results&quot; to view your exam results.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
