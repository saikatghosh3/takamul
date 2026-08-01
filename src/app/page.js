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
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-5 shadow-lg shadow-black/20 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-4">
        <button type="button" onClick={prevMonth} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8L10 4"/></svg>
        </button>
        <span className="font-bold text-white text-base tracking-wide">{monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}</span>
        <button type="button" onClick={nextMonth} className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all active:scale-95">
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
              <div className="w-6 h-6 rounded-full bg-white/[0.05] animate-pulse" />
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
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-all duration-150 ${isPast || (hasRealDates && !isAvailable) ? 'text-slate-600 cursor-not-allowed' : isAvailable ? 'text-white cursor-pointer hover:bg-emerald-500/20 hover:scale-105' : 'text-slate-400 cursor-pointer hover:bg-white/[0.07] hover:text-slate-200'} ${isSelected ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white font-bold shadow-lg shadow-indigo-500/40 ring-2 ring-indigo-400/50' : ''} ${isToday && !isSelected ? 'ring-1 ring-slate-500' : ''}`}>
                <span className={`text-xs sm:text-sm leading-none ${isToday && !isSelected ? 'text-indigo-400 font-semibold' : ''}`}>{day}</span>
                {isAvailable && !isPast && <span className={`mt-1 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-400 shadow-sm shadow-emerald-400/50'}`} />}
              </button>
            );
          })}
        </div>
      )}
      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-pulse" />
            Loading available dates...
          </div>
        ) : hasRealDates ? (
          <div className="flex flex-wrap items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" /><span className="text-slate-400">Available ({availableSet.size})</span></div>
            <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500" /><span className="text-slate-400">Selected</span></div>
          </div>
        ) : (
          <div className="text-xs text-slate-400">{source === 'none' ? 'Select any exam date to search for available centers' : 'Pick a date to search for centers'}</div>
        )}
      </div>
    </div>
  );
}

function getInitials(name) {
  if (!name) return 'SV';
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map(w => w[0].toUpperCase()).join('') || 'SV';
}

function LoginPanel({ onLogin, onDisconnect, authStatus, setAuthStatus, compact }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch('/api/auth/status');
        const json = await res.json();
        if (json.success) {
          setAuthStatus(json.data);
          if (json.data?.loggedIn) fetchProfile();
        }
      } catch {}
    }
    checkStatus();
  }, [setAuthStatus]);

  async function fetchProfile() {
    try {
      const res = await fetch('/api/auth/profile');
      const json = await res.json();
      if (json.success && json.data) setProfile(json.data);
    } catch {}
  }

  async function handleLogin() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setAuthStatus({ loggedIn: true });
        fetchProfile();
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

  function handleDisconnect() {
    setProfile(null);
    if (onDisconnect) onDisconnect();
  }

  if (authStatus?.loggedIn) {
    if (compact) {
      return (
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          <span className="max-w-[140px] truncate text-[11px] font-medium text-emerald-300">{profile?.name || 'Online'}</span>
          <button onClick={handleDisconnect} className="shrink-0 rounded-md px-1.5 py-1 text-[10px] text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400">Disconnect</button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.12] to-white/[0.02] p-3 shadow-lg shadow-emerald-500/5">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white shadow-md shadow-emerald-500/25">
              {getInitials(profile?.name)}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#0a0f1d] bg-emerald-400" />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{profile?.name || 'Connected to SVPI'}</p>
            <p className="truncate text-[11px] text-slate-500">{profile?.email || 'SVPI account'}</p>
          </div>
          <button onClick={handleDisconnect}
            className="shrink-0 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400">
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${compact ? 'flex items-center gap-2' : 'flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-slate-500"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
        <span className="truncate text-xs text-slate-400">{compact ? 'Offline' : 'Not connected'}</span>
      </div>
      <button onClick={handleLogin} disabled={loading}
        className={`shrink-0 rounded-lg border font-medium transition-all disabled:cursor-not-allowed ${compact ? 'border-white/10 px-2.5 py-1 text-[11px] text-slate-300 hover:bg-white/[0.06]' : 'border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-200 hover:bg-white/[0.1]'}`}>
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
  const [adminAuthed, setAdminAuthed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const authed = localStorage.getItem('pacc_admin_authed') === 'true';
        setAdminAuthed(authed);
        if (!authed) window.location.replace('/admin');
      } catch {
        setAdminAuthed(false);
        window.location.replace('/admin');
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
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
  const [rescheduleCategorySearch, setRescheduleCategorySearch] = useState('');
  const [rescheduleShowCategoryDropdown, setRescheduleShowCategoryDropdown] = useState(false);
  const [rebookCategorySearch, setRebookCategorySearch] = useState('');
  const [rebookShowCategoryDropdown, setRebookShowCategoryDropdown] = useState(false);

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
  const [rescheduleSessionsFromDates, setRescheduleSessionsFromDates] = useState({});

  const [cancelSession, setCancelSession] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [cancelLoading, setCancelLoading] = useState(false);
  const [cancelResult, setCancelResult] = useState(null);

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const [rebookSelected, setRebookSelected] = useState(null);
  const [rebookLoading, setRebookLoading] = useState(false);
  const [rebookResult, setRebookResult] = useState(null);
  const [rebookExamSessionId, setRebookExamSessionId] = useState('');
  const [rebookLanguage, setRebookLanguage] = useState('en');
  const [rebookMethodology, setRebookMethodology] = useState(1);
  const [rebookAvailableSessions, setRebookAvailableSessions] = useState([]);
  const [rebookLoadingSessions, setRebookLoadingSessions] = useState(false);

  const [rescheduleSelected, setRescheduleSelected] = useState(null);
  const [cancelSelected, setCancelSelected] = useState(null);

  // Payload preview state — shows exact JSON before sending to server
  const [showPayloadPreview, setShowPayloadPreview] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);

  const [examResults, setExamResults] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);
  const [resultsError, setResultsError] = useState('');

  const minDate = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  function handleDisconnect() {
    setResults(null);
    setAvailableDates([]);
    setAllDatesRaw([]);
    setAvailableSessions({});
    setSelectedDate('');
    setDateSource('none');
    setRescheduleSession('');
    setRescheduleNewDate('');
    setRescheduleResult(null);
    setRescheduleCategory('');
    setRescheduleCity('');
    setRescheduleCities([]);
    setRescheduleAllDatesRaw([]);
    setRescheduleAvailableDates([]);
    setRescheduleDateSource('none');
    setRescheduleCenters([]);
    setRescheduleCenter('');
    setRescheduleAvailableSessions([]);
    setRescheduleSelectedSessionId('');
    setRescheduleSessionsFromDates({});
    setRescheduleSelected(null);
    setCancelSession('');
    setCancelReason('');
    setCancelResult(null);
    setCancelSelected(null);
    setSessions([]);
    setRebookSelected(null);
    setRebookResult(null);
    setRebookExamSessionId('');
    setRebookLanguage('en');
    setRebookMethodology(1);
    setRebookAvailableSessions([]);
    setExamResults(null);
    setResultsError('');
    setPendingPayload(null);
    setShowPayloadPreview(false);
    setAuthStatus({ loggedIn: false });
    try { fetch('/api/auth/logout', { method: 'POST' }); } catch {}
  }

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
      return;
    }
    let cancelled = false;
    async function loadSessions() {
      setRescheduleLoadingSessions(true);
      setRescheduleAvailableSessions([]);
      setRescheduleSelectedSessionId('');
      try {
        const cityObj = rescheduleCity ? rescheduleCities.find(c => c.id === rescheduleCity) : null;
        const cityName = cityObj ? cityObj.name : undefined;
        const res = await fetch('/api/takamol/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: rescheduleCategory, date: rescheduleNewDate, city: cityName, testCenterId: rescheduleCenter || undefined })
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
  }, [rescheduleCategory, rescheduleNewDate, rescheduleCity, rescheduleCenter, rescheduleCities]);

  useEffect(() => {
    if (!rescheduleCategory || !rescheduleNewDate) {
      setRebookAvailableSessions([]);
      setRebookExamSessionId('');
      return;
    }
    let cancelled = false;
    async function loadRebookSessions() {
      setRebookLoadingSessions(true);
      setRebookAvailableSessions([]);
      setRebookExamSessionId('');
      try {
        const cityObj = rescheduleCity ? rescheduleCities.find(c => c.id === rescheduleCity) : null;
        const cityName = cityObj ? cityObj.name : undefined;
        const res = await fetch('/api/takamol/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ category: rescheduleCategory, date: rescheduleNewDate, city: cityName })
        });
        const json = await res.json();
        if (!cancelled && json.success) {
          const apiSessions = json.data.sessions || [];
          const normalizedDate = rescheduleNewDate;
          const sessionsForDate = apiSessions.map(s => {
            let time = s.test_time || s.start_time || s.time || s.time_slot || s.start_time_in_tc_time_zone || s.test_time_in_tc_time_zone || s.exam_session?.test_time || s.exam_session?.start_time || '';
            if (!time) {
              const dtFields = [s.start_date_in_tc_time_zone, s.start_date_in_browser_time_zone, s.end_date_in_tc_time_zone, s.exam_date_time, s.exam_session?.start_date_in_tc_time_zone];
              for (const dt of dtFields) {
                if (dt && String(dt).includes('T')) {
                  const m = String(dt).match(/T(\d{2}:\d{2})/);
                  if (m) { time = m[1]; break; }
                }
              }
            }
            const date = s.test_date || s.date || s.start_date || s.start_date_in_tc_time_zone || s.start_date_in_browser_time_zone || s.exam_session?.test_date || '';
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
          if (!cancelled) setRebookAvailableSessions(sessionsForDate);
        }
      } catch (e) {
        console.error('[rebook] Failed to load sessions:', e.message);
      } finally {
        if (!cancelled) setRebookLoadingSessions(false);
      }
    }
    loadRebookSessions();
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
      if (json.expired) {
        setAuthStatus({ loggedIn: false });
        setError('Session expired. Please login again.');
        return;
      }
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
        if (!cancelled && json.expired) {
          setAuthStatus({ loggedIn: false });
          setError('Session expired. Please login again.');
          return;
        }
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

  const filteredRescheduleCategories = useMemo(() => {
    if (!rescheduleCategorySearch) return rescheduleCategories;
    const q = rescheduleCategorySearch.toLowerCase();
    return rescheduleCategories.filter(cat => cat.name.toLowerCase().includes(q));
  }, [rescheduleCategories, rescheduleCategorySearch]);

  const filteredRebookCategories = useMemo(() => {
    if (!rebookCategorySearch) return rescheduleCategories;
    const q = rebookCategorySearch.toLowerCase();
    return rescheduleCategories.filter(cat => cat.name.toLowerCase().includes(q));
  }, [rescheduleCategories, rebookCategorySearch]);

  const selectedCatName = categories.find(c => c.id == selectedCategory)?.name || '';
  const selectedCityName = cities.find(c => c.id === selectedCity)?.name || '';

  const tabs = [
    { id: 'search', label: 'Search', description: 'Find centers, dates & sessions', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z' },
    { id: 'bookings', label: 'My Bookings', description: 'Reschedule, rebook & cancel', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
    { id: 'results', label: 'Results', description: 'Scores, certificates & more', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  ];

  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0];

  if (!adminAuthed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex items-center gap-3 text-sm text-slate-500">
          <div className="h-4 w-4 rounded-full border-2 border-indigo-500/30 border-t-indigo-400 animate-spin" />
          Redirecting to admin login...
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/15" />
            <div className="absolute inset-0 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-white">PACC Admin Console</p>
            <p className="mt-1 text-xs text-slate-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-48 right-[-10%] h-[520px] w-[520px] rounded-full bg-indigo-600/10 blur-[130px]" />
        <div className="absolute bottom-[-20%] left-[-5%] h-[420px] w-[420px] rounded-full bg-blue-600/10 blur-[130px]" />
      </div>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[268px] flex-col border-r border-white/[0.06] bg-[#0a0f1d] lg:flex">
        <div className="flex h-16 items-center gap-3 border-b border-white/[0.06] px-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-lg shadow-indigo-500/25">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight tracking-tight text-white">PACC Admin</p>
            <p className="text-[11px] text-slate-500">Exam Center Console</p>
          </div>
        </div>

        <div className="border-b border-white/[0.06] p-3">
          <LoginPanel onLogin={() => {}} onDisconnect={handleDisconnect} authStatus={authStatus} setAuthStatus={setAuthStatus} />
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">Navigation</p>
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(''); if (tab.id === 'results' && authStatus?.loggedIn && !examResults) handleLoadResults(); }}
                className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all ${isActive ? 'bg-gradient-to-r from-indigo-500/[0.14] to-blue-600/[0.06] text-white ring-1 ring-inset ring-indigo-500/30' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white'}`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${isActive ? 'bg-gradient-to-br from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/30' : 'bg-white/[0.05] text-slate-400 group-hover:text-slate-200'}`}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon}/></svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="block truncate text-[11px] text-slate-500">{tab.description}</span>
                </span>
                {isActive && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />}
              </button>
            );
          })}
        </nav>

        <div className="space-y-3 border-t border-white/[0.06] p-4">
          <div className="flex items-center justify-between px-1 text-[10px] text-slate-600">
            <span>Bangladesh Region</span>
            <span className="font-mono">v0.1.0</span>
          </div>
          <button onClick={() => { try { localStorage.removeItem('pacc_admin_authed'); } catch {} window.location.href = '/admin'; }}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-400">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            Admin Logout
          </button>
        </div>
      </aside>

      <div className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#0a0f1d]/95 backdrop-blur lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
            </div>
            <span className="text-sm font-bold text-white">PACC Admin</span>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${authStatus?.loggedIn ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'}`} />
            {authStatus?.loggedIn ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex gap-1.5 overflow-x-auto px-3 pb-2.5">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setError(''); if (tab.id === 'results' && authStatus?.loggedIn && !examResults) handleLoadResults(); }}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${isActive ? 'bg-gradient-to-r from-indigo-500 to-blue-600 text-white shadow-md shadow-indigo-500/25' : 'bg-white/[0.04] text-slate-400 hover:text-white'}`}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={tab.icon}/></svg>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <main className="relative lg:pl-[268px]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-indigo-500/[0.07] via-blue-500/[0.03] to-transparent" />
        <div className="relative mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-indigo-400">Admin Console</p>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{currentTab.label}</h1>
            <p className="text-sm text-slate-500">{currentTab.description}</p>
            <span className="mt-1 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-medium text-slate-400">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <div className="h-px w-full bg-gradient-to-r from-transparent via-white/[0.09] to-transparent" />

          {error && (
            <div className="flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-sm text-red-400">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              {error}
            </div>
          )}

        {activeTab === 'search' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/30 backdrop-blur-xl space-y-5">
                <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-indigo-500/[0.12] blur-3xl" />
                <div className="relative flex items-center gap-2.5 mb-1">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-500/10">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  </span>
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-[0.14em]">Search Centers</span>
                    <span className="block text-[10px] text-slate-600">Find available exam centers</span>
                  </div>
                </div>
                <div>
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Category</label>
                  <div className="relative">
                    <div className="relative">
                      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      <input type="text" value={categorySearch} onChange={(e) => { setCategorySearch(e.target.value); setShowCategoryDropdown(true); if (!e.target.value && selectedCategory) { setSelectedCategory(''); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); } }} onFocus={() => setShowCategoryDropdown(true)} onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)} placeholder={selectedCategory ? selectedCatName : 'Search categories...'} className="w-full pl-10 pr-4 py-3 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all placeholder:text-slate-500" />
                      {categorySearch && (
                        <button type="button" onClick={() => { setCategorySearch(''); setSelectedCategory(''); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); setShowCategoryDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    {showCategoryDropdown && (
                      <div className="absolute z-10 mt-1 w-full bg-[#111827] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 max-h-60 overflow-y-auto">
                        {filteredCategories.length > 0 ? filteredCategories.slice(0, 50).map((cat, idx) => (
                          <button key={`${cat.id}-${idx}`} type="button" onMouseDown={(e) => { e.preventDefault(); setSelectedCategory(cat.id); setCategorySearch(cat.name); setShowCategoryDropdown(false); setSelectedCity(''); setCities([]); setAvailableDates([]); setDateSource('none'); setResults(null); setSelectedDate(''); }}
                            className={`w-full text-left px-4 py-3 text-sm text-white hover:bg-white/[0.06] transition-colors border-b border-white/[0.06] last:border-b-0 ${selectedCategory === cat.id ? 'bg-indigo-500/15 text-indigo-300' : ''}`}>
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
                  <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                    City {loadingCities && <span className="ml-2 text-[10px] text-indigo-400 normal-case tracking-normal">Loading...</span>}
                  </label>
                  <select value={selectedCity} onChange={(e) => { setSelectedCity(e.target.value); setSelectedDate(''); setResults(null); }} disabled={!selectedCategory || loadingCities}
                    className="w-full px-4 py-3 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                    <option value="">{!selectedCategory ? 'Select category first' : loadingCities ? 'Loading cities...' : '-- Select City --'}</option>
                    {cities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                  </select>
                </div>
                <button onClick={handleSearch} disabled={searching || !selectedCategory || !selectedCity || !selectedDate}
                  className="w-full py-3.5 bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-400 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 rounded-xl font-semibold text-sm text-white shadow-lg shadow-indigo-500/25 transition-all disabled:cursor-not-allowed active:scale-[0.98]">
                  {searching ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Searching...</span> : <span className="flex items-center justify-center gap-2"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Search Exam Centers</span>}
                </button>
              </div>
              {results && (
                <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
                  <div className="pointer-events-none absolute -bottom-16 -left-16 h-44 w-44 rounded-full bg-blue-500/[0.1] blur-3xl" />
                  <div className="relative flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/10">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                      </span>
                      <h2 className="text-sm font-bold text-white">Results for {selectedDate}</h2>
                    </div>
                    <span className="text-xs px-2.5 py-1 bg-white/[0.05] rounded-full text-slate-400 border border-white/[0.08]">{results.total} center{results.total !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-2 text-xs">
                    <span className="px-2 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 rounded-lg">{selectedCatName}</span>
                    <span className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg">{selectedCityName}</span>
                  </div>
                  {results.centers && results.centers.length > 0 ? (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                      {results.centers.map((center) => (
                        <div key={center.id} className="flex items-start gap-3 bg-white/[0.03] p-4 rounded-xl border border-white/[0.06] hover:border-indigo-500/30 hover:bg-white/[0.05] transition-all">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          </span>
                          <div>
                            <h3 className="font-semibold text-white text-sm">{center.name}</h3>
                            {center.address && <p className="text-xs text-slate-500 mt-1.5">{center.address}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <p className="text-slate-500 text-sm">No exam centers found for this selection.</p>}
                </div>
              )}
            </div>
            <div>
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-5 shadow-xl shadow-black/30 backdrop-blur-xl">
                <div className="pointer-events-none absolute -top-14 -left-14 h-40 w-40 rounded-full bg-violet-500/[0.1] blur-3xl" />
                <div className="relative flex items-center gap-2.5 mb-4">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-indigo-500/25 bg-indigo-500/10 text-indigo-300 shadow-sm shadow-indigo-500/10">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </span>
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-[0.14em]">Exam Date</span>
                    <span className="block text-[10px] text-slate-600">Pick an available date</span>
                  </div>
                </div>
                <Calendar value={selectedDate} onChange={setSelectedDate} minDate={minDate} availableDates={effectiveAvailableDates} loading={loadingDates} source={effectiveDateSource} />
                {selectedDate && effectiveSessions[selectedDate] && effectiveSessions[selectedDate].length > 0 && (
                  <div className="mt-4 pt-3 border-t border-white/[0.06]">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.14em] mb-2">Available Sessions for {selectedDate}</div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {effectiveSessions[selectedDate].map((sess, si) => (
                        <div key={sess.id || si} className="flex items-center justify-between p-2.5 bg-white/[0.03] rounded-lg border border-white/[0.06]">
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
                  <div className="mt-4 pt-3 border-t border-white/[0.06]">
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
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Your Exam Bookings</h2>
                <button onClick={handleLoadSessions} disabled={loadingSessions}
                  className="px-3 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] disabled:bg-white/[0.05] rounded-lg text-xs text-slate-400 border border-white/[0.08] transition-all">
                  {loadingSessions ? 'Refreshing...' : 'Refresh'}
                </button>
              </div>
            )}
            {loadingSessions && (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {!loadingSessions && sessions.length === 0 && authStatus?.loggedIn && (
              <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 text-center shadow-xl shadow-black/30 backdrop-blur-xl">
                <div className="pointer-events-none absolute -top-14 left-1/2 h-40 w-72 -translate-x-1/2 rounded-full bg-indigo-500/[0.1] blur-3xl" />
                <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-white/[0.04] mx-auto mb-4 shadow-lg shadow-black/20">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-500"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                </div>
                <p className="text-slate-400 text-sm font-medium">No exam bookings found.</p>
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
                    const isRebooking = rebookSelected?.id === sid;

                   const statusColors = {
                     scheduled: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
                     confirmed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     completed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     passed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
                     cancelled: 'bg-red-500/10 border-red-500/30 text-red-400',
                     rescheduled: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
                     pending: 'bg-white/[0.04] border-white/[0.1] text-slate-400',
                   };
                   const accentMap = {
                     scheduled: 'bg-indigo-500',
                     confirmed: 'bg-emerald-500',
                     completed: 'bg-emerald-500',
                     passed: 'bg-emerald-500',
                     cancelled: 'bg-red-500',
                     rescheduled: 'bg-amber-500',
                     pending: 'bg-slate-500',
                   };

                   return (
                     <div key={sid} className="overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.05] to-white/[0.02] shadow-xl shadow-black/25 backdrop-blur-xl">
                       <div className="flex">
                         <div className={`w-1 shrink-0 self-stretch ${accentMap[status] || 'bg-slate-600'}`} />
                         <div className="flex-1 p-5">
                         <div className="flex items-start justify-between gap-3 mb-3">
                           <div className="min-w-0">
                             <h3 className="font-semibold text-white text-sm">{name}</h3>
                             {date && <p className="text-xs text-slate-400 mt-1">{date}{time ? ` at ${time}` : ''}</p>}
                             {(center || city) && <p className="text-xs text-slate-500 mt-0.5">{[center, city].filter(Boolean).join(', ')}</p>}
                           </div>
                           <span className={`shrink-0 text-[11px] px-2.5 py-1 rounded-full border font-medium capitalize ${statusColors[status] || statusColors.pending}`}>{status}</span>
                         </div>
                         <div className="flex flex-wrap gap-2">
                           <button onClick={() => {
                              if (isRescheduling) {
                                setRescheduleSelected(null);
                                setRescheduleNewDate('');
                                setRescheduleCategory('');
                                setRescheduleCategorySearch('');
                                setRescheduleCity('');
                                setRescheduleSelectedSessionId('');
                             } else {
                               const sessionName = (session.category?.english_name || session.occupation?.english_name || '').trim();
                               const sessionId = session.category?.id || session.occupation?.id || session.category_id || session.occupation_id;
                               let matchedCat = categories.find(c => c.id == sessionId);
                               if (!matchedCat && sessionName) {
                                 matchedCat = categories.find(c => c.name === sessionName);
                               }
                                const catId = matchedCat ? matchedCat.id : sessionId;
                                const catName = matchedCat ? matchedCat.name : sessionName;
                                setRescheduleSelected({ id: sid, session });
                                setRescheduleCategory(String(catId || ''));
                                setRescheduleCategorySearch(catName);
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
                            <button onClick={() => {
                              if (rebookSelected?.id === sid) {
                                setRebookSelected(null);
                                setRescheduleCategory('');
                                setRebookCategorySearch('');
                                setRescheduleCity('');
                                setRescheduleNewDate('');
                                return;
                              }
                              const sessionName = (session.category?.english_name || session.occupation?.english_name || '').trim();
                              const sessionId = session.category?.id || session.occupation?.id || session.category_id || session.occupation_id;
                              let matchedCat = categories.find(c => c.id == sessionId);
                              if (!matchedCat && sessionName) {
                                matchedCat = categories.find(c => c.name === sessionName);
                              }
                              const catId = matchedCat ? matchedCat.id : sessionId;
                              const catName = matchedCat ? matchedCat.name : sessionName;
                              setRescheduleSelected(null);
                              setCancelSelected(null);
                              setRebookSelected({ id: sid, session });
                              setRescheduleCategory(String(catId || ''));
                              setRebookCategorySearch(catName);
                              setRescheduleCity('');
                              setRescheduleNewDate('');
                              setRebookExamSessionId('');
                              setRebookLanguage('en');
                              setRebookMethodology(1);
                              setRebookAvailableSessions([]);
                            }} disabled={!['cancelled','canceled'].includes(status)}
                              className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                              Reschedule Again
                            </button>
                            {session.certificate && (
                             <a href={`/api/exam/certificate/${certId}`} target="_blank" rel="noopener noreferrer"
                               className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition-all">
                               Certificate
                             </a>
                            )}
                          </div>
                        </div>
                        </div>
                       {isRescheduling && (
                         <div className="space-y-3 border-t border-white/[0.06] px-5 pb-5 pt-4 mt-1">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Category</label>
                            <div className="relative">
                              <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                <input type="text" value={rescheduleCategorySearch} onChange={(e) => { setRescheduleCategorySearch(e.target.value); setRescheduleShowCategoryDropdown(true); if (!e.target.value && rescheduleCategory) { setRescheduleCategory(''); setRescheduleCity(''); setRescheduleNewDate(''); setRescheduleCenter(''); setRescheduleCenters([]); } }} onFocus={() => setRescheduleShowCategoryDropdown(true)} onBlur={() => setTimeout(() => setRescheduleShowCategoryDropdown(false), 200)} placeholder={rescheduleCategory ? rescheduleCategorySearch : 'Search categories...'} className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all placeholder:text-slate-500" />
                                {rescheduleCategorySearch && (
                                  <button type="button" onClick={() => { setRescheduleCategorySearch(''); setRescheduleCategory(''); setRescheduleCity(''); setRescheduleNewDate(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleShowCategoryDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )}
                              </div>
                              {rescheduleShowCategoryDropdown && (
                                <div className="absolute z-10 mt-1 w-full bg-[#111827] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 max-h-60 overflow-y-auto">
                                  {filteredRescheduleCategories.length > 0 ? filteredRescheduleCategories.slice(0, 50).map((cat, idx) => (
                                    <button key={`${cat.id}-${idx}`} type="button" onMouseDown={(e) => { e.preventDefault(); setRescheduleCategory(cat.id); setRescheduleCategorySearch(cat.name); setRescheduleShowCategoryDropdown(false); setRescheduleCity(''); setRescheduleNewDate(''); setRescheduleCenter(''); setRescheduleCenters([]); }}
                                      className={`w-full text-left px-4 py-3 text-sm text-white hover:bg-white/[0.06] transition-colors border-b border-white/[0.06] last:border-b-0 ${rescheduleCategory === cat.id ? 'bg-amber-500/15 text-amber-300' : ''}`}>
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
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              City {rescheduleLoadingCities && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                            </label>
                             <select value={rescheduleCity} onChange={(e) => { setRescheduleCity(e.target.value); setRescheduleNewDate(''); setRescheduleCenter(''); }} disabled={!rescheduleCategory || rescheduleLoadingCities}
                              className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                              <option value="">{!rescheduleCategory ? 'Select category first' : rescheduleLoadingCities ? 'Loading cities...' : '-- Select City --'}</option>
                              {rescheduleCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                            </select>
                          </div>
                          {rescheduleCity && rescheduleCenters.length > 0 && (
                            <div>
                              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Test Center {rescheduleLoadingCenters && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              <select value={rescheduleCenter} onChange={(e) => setRescheduleCenter(e.target.value)} disabled={rescheduleLoadingCenters}
                                className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                                <option value="">{rescheduleLoadingCenters ? 'Loading centers...' : '-- Select Center (optional) --'}</option>
                                {rescheduleCenters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` - ${c.city}` : ''}</option>)}
                              </select>
                            </div>
                          )}
                           <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">New Date</label>
                            <Calendar value={rescheduleNewDate} onChange={(v) => { console.log('[reschedule] Calendar onChange:', v, 'current rescheduleNewDate:', rescheduleNewDate); setRescheduleNewDate(v); setRescheduleSelectedSessionId(''); }} minDate={minDate} availableDates={rescheduleEffectiveAvailableDates} loading={rescheduleLoadingDates} source={rescheduleEffectiveDateSource} />
                          </div>
                          {rescheduleNewDate && (
                            <div>
                              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Available Session {rescheduleLoadingSessions && <span className="ml-2 text-[10px] text-amber-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              {(() => {
                                const selectedCenter = rescheduleCenters.find(c => String(c.id) === String(rescheduleCenter));
                                const centerCityLower = selectedCenter ? (selectedCenter.city || '').toLowerCase() : '';
                                const siblingCentersInCity = selectedCenter && centerCityLower
                                  ? rescheduleCenters.filter(c => (c.city || '').toLowerCase() === centerCityLower)
                                  : [];
                                const filteredSessions = rescheduleAvailableSessions.filter(s => {
                                  if (!centerCityLower) return true;
                                  return (s.city || '').toLowerCase() === centerCityLower;
                                });
                                if (selectedCenter && siblingCentersInCity.length > 1) {
                                  return (
                                    <div className="mb-2 flex items-start gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>
                                      <span>SVPI assigns the exact center from the session you pick. This city has {siblingCentersInCity.length} centers, so sessions here may belong to a different center than {selectedCenter.name}. Pick the session whose time matches your preferred center.</span>
                                    </div>
                                  );
                                }
                                if (rescheduleLoadingSessions) {
                                  return (
                                    <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                      <div className="w-3 h-3 border-[1.5px] border-amber-500/30 border-t-amber-400 rounded-full animate-spin" />
                                      Fetching available sessions...
                                    </div>
                                  );
                                }
                                if (filteredSessions.length > 0) {
                                  return (
                                    <>
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {filteredSessions.map((s, idx) => {
                                        const sessionId = s.id || idx;
                                        const time = s.time || '';
                                        const date = s.date || '';
                                        const centerName = s.centerName || '';
                                        const centerCity = s.city || '';
                                        const slots = s.seats ?? '';
                                        const isSelected = rescheduleSelectedSessionId === String(sessionId);
                                        const dateMatch = date && rescheduleNewDate ? String(date).includes(rescheduleNewDate) : true;
                                        return (
                                          <button key={sessionId || idx} type="button" onClick={() => { if (isSelected) { setRescheduleSelectedSessionId(''); } else { setRescheduleSelectedSessionId(String(sessionId)); } }}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected ? 'bg-amber-600/20 border-amber-500/50 ring-1 ring-amber-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06]'}`}>
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
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-amber-400 bg-amber-400' : 'border-white/[0.15]'}`}>
                                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                    </>
                                  );
                                }
                                if (rescheduleNewDate) {
                                  return (
                                    <div className="text-xs text-slate-500 py-2">
                                      {selectedCenter
                                        ? `No sessions found for ${selectedCenter.name} on this date. Try a different date or center.`
                                        : 'No sessions found for this date. Try a different date or city.'}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                          {showPayloadPreview && pendingPayload && pendingPayload.sessionId === sid ? (
                            <div className="w-full space-y-3">
                              <div className="p-3 bg-white/[0.04] border border-amber-500/30 rounded-xl">
                                <div className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2">Payload Preview — Check before sending</div>
                                <pre className="text-xs text-slate-300 bg-black/30 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">{JSON.stringify(pendingPayload, null, 2)}</pre>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => { setShowPayloadPreview(false); setPendingPayload(null); }} className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-slate-400 text-xs border border-white/[0.08] transition-all">
                                  Cancel
                                </button>
                                <button onClick={async () => {
                                  setShowPayloadPreview(false);
                                  setRescheduleLoading(true); setError('');
                                  try {
                                    console.log('[reschedule] Sending payload:', JSON.stringify(pendingPayload));
                                    const res = await fetch('/api/exam/reschedule', {
                                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(pendingPayload)
                                    });
                                    const json = await res.json();
                                    console.log('[reschedule] Response:', JSON.stringify(json).substring(0, 500));
                                    setRescheduleResult(json);
                                    if (json.success) { setRescheduleSelected(null); setRescheduleNewDate(''); setRescheduleCategory(''); setRescheduleCategorySearch(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleAvailableSessions([]); setRescheduleSelectedSessionId(''); handleLoadSessions(); }
                                    else setError(json.error || 'Reschedule failed.');
                                  } catch { setError('Reschedule request failed.'); } finally { setRescheduleLoading(false); setPendingPayload(null); }
                                }} disabled={rescheduleLoading}
                                  className="flex-[2] py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-white/[0.06] disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                                  {rescheduleLoading ? 'Rescheduling...' : 'Confirm & Send to SVPI'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setRescheduleSelected(null); setRescheduleNewDate(''); setRescheduleCategory(''); setRescheduleCategorySearch(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleCenters([]); setRescheduleAvailableSessions([]); setRescheduleSelectedSessionId(''); }} className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-slate-400 text-xs border border-white/[0.08] transition-all">Cancel</button>
                              <button onClick={() => {
                                if (!rescheduleNewDate || !rescheduleCategory) return;
                                const examSessionId = rescheduleSelectedSessionId;
                                const selectedSessionData = rescheduleAvailableSessions.find(s => String(s.id) === examSessionId);
                                const selectedCenter = rescheduleCenters.find(c => String(c.id) === String(rescheduleCenter));
                                const cityName = selectedCenter?.city || selectedSessionData?.city || rescheduleSelected?.session?.test_center?.test_center_city || '';
                                const language = rescheduleSelected?.session?.language || 'bn';
                                console.log('[reschedule] Building payload...', { newDate: rescheduleNewDate, examSessionId, cityName, language });
                                if (!examSessionId) { setError('Please select an available session from the list.'); return; }
                                const body = {
                                  sessionId: sid,
                                  newDate: rescheduleNewDate,
                                  categoryId: rescheduleCategory,
                                  testCenterId: rescheduleCenter || undefined,
                                  cityName,
                                  language,
                                  // Always send the exam_session_id of the session the user picked.
                                  // It is the authoritative parameter that pins the exact session
                                  // (and therefore the exact center). Dropping it made SVPI
                                  // auto-assign a random session — which is why the selected
                                  // center was ignored. test_center_id is still sent as the
                                  // explicit center confirmation.
                                  examSessionId
                                };
                                console.log('[reschedule] PAYLOAD PREVIEW:', JSON.stringify(body, null, 2));
                                setPendingPayload(body);
                                setShowPayloadPreview(true);
                              }} disabled={!rescheduleNewDate || !rescheduleCategory || !rescheduleSelectedSessionId}
                                className="flex-[2] py-2 bg-amber-600 hover:bg-amber-500 disabled:bg-white/[0.06] disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                                Review Payload
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      {isCancelling && (
                         <div className="space-y-3 border-t border-white/[0.06] px-5 pb-5 pt-4 mt-1">
                          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Reason (optional)</label>
                          <textarea placeholder="Reason for cancellation" value={cancelReason} onChange={e => setCancelReason(e.target.value)} rows={2}
                            className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 transition-all resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => { setCancelSelected(null); setCancelReason(''); }} className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-slate-400 text-xs border border-white/[0.08] transition-all">Cancel</button>
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
                              className="flex-[2] py-2 bg-red-600 hover:bg-red-500 disabled:bg-white/[0.06] disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                              {cancelLoading ? 'Cancelling...' : 'Confirm Cancel'}
                            </button>
                          </div>
                        </div>
                      )}
                      {isRebooking && (
                         <div className="space-y-3 border-t border-white/[0.06] px-5 pb-5 pt-4 mt-1">
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Category</label>
                            <div className="relative">
                              <div className="relative">
                                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                <input type="text" value={rebookCategorySearch} onChange={(e) => { setRebookCategorySearch(e.target.value); setRebookShowCategoryDropdown(true); if (!e.target.value && rescheduleCategory) { setRescheduleCategory(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleNewDate(''); setRebookAvailableSessions([]); setRebookExamSessionId(''); } }} onFocus={() => setRebookShowCategoryDropdown(true)} onBlur={() => setTimeout(() => setRebookShowCategoryDropdown(false), 200)} placeholder={rescheduleCategory ? rebookCategorySearch : 'Search categories...'} className="w-full pl-10 pr-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-slate-500" />
                                {rebookCategorySearch && (
                                  <button type="button" onClick={() => { setRebookCategorySearch(''); setRescheduleCategory(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleNewDate(''); setRebookAvailableSessions([]); setRebookExamSessionId(''); setRebookShowCategoryDropdown(false); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                  </button>
                                )}
                              </div>
                              {rebookShowCategoryDropdown && (
                                <div className="absolute z-10 mt-1 w-full bg-[#111827] border border-white/[0.08] rounded-xl shadow-2xl shadow-black/40 max-h-60 overflow-y-auto">
                                  {filteredRebookCategories.length > 0 ? filteredRebookCategories.slice(0, 50).map((cat, idx) => (
                                    <button key={`${cat.id}-${idx}`} type="button" onMouseDown={(e) => { e.preventDefault(); setRescheduleCategory(cat.id); setRebookCategorySearch(cat.name); setRebookShowCategoryDropdown(false); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleNewDate(''); setRebookAvailableSessions([]); setRebookExamSessionId(''); }}
                                      className={`w-full text-left px-4 py-3 text-sm text-white hover:bg-white/[0.06] transition-colors border-b border-white/[0.06] last:border-b-0 ${rescheduleCategory === cat.id ? 'bg-emerald-500/15 text-emerald-300' : ''}`}>
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
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                              City {rescheduleLoadingCities && <span className="ml-2 text-[10px] text-emerald-400 normal-case tracking-normal">Loading...</span>}
                            </label>
                            <select value={rescheduleCity} onChange={(e) => { setRescheduleCity(e.target.value); setRescheduleCenter(''); setRescheduleNewDate(''); setRebookAvailableSessions([]); setRebookExamSessionId(''); }} disabled={!rescheduleCategory || rescheduleLoadingCities}
                              className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                              <option value="">{!rescheduleCategory ? 'Select category first' : rescheduleLoadingCities ? 'Loading cities...' : '-- Select City --'}</option>
                              {rescheduleCities.map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}
                            </select>
                          </div>
                          {rescheduleCity && rescheduleCenters.length > 0 && (
                            <div>
                              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Test Center {rescheduleLoadingCenters && <span className="ml-2 text-[10px] text-emerald-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              <select value={rescheduleCenter} onChange={(e) => { setRescheduleCenter(e.target.value); setRebookExamSessionId(''); }} disabled={rescheduleLoadingCenters}
                                className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all disabled:opacity-40 disabled:cursor-not-allowed appearance-none cursor-pointer">
                                <option value="">{rescheduleLoadingCenters ? 'Loading centers...' : '-- Select Center --'}</option>
                                {rescheduleCenters.map((c) => <option key={c.id} value={c.id}>{c.name}{c.city ? ` - ${c.city}` : ''}</option>)}
                              </select>
                            </div>
                          )}
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Exam Date</label>
                            <Calendar value={rescheduleNewDate} onChange={(v) => { setRescheduleNewDate(v); setRebookExamSessionId(''); }} minDate={minDate} availableDates={rescheduleEffectiveAvailableDates} loading={rescheduleLoadingDates} source={rescheduleEffectiveDateSource} />
                          </div>
                          {rescheduleNewDate && (
                            <div>
                              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                Available Session {rebookLoadingSessions && <span className="ml-2 text-[10px] text-emerald-400 normal-case tracking-normal">Loading...</span>}
                              </label>
                              {rebookLoadingSessions ? (
                                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                                  <div className="w-3 h-3 border-[1.5px] border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin" />
                                  Fetching available sessions...
                                </div>
                              ) : (() => {
                                const selectedCenter = rescheduleCenters.find(c => String(c.id) === String(rescheduleCenter));
                                const centerCityLower = selectedCenter ? (selectedCenter.city || '').toLowerCase() : '';
                                const filteredSessions = rebookAvailableSessions.filter(s => {
                                  if (!centerCityLower) return true;
                                  return (s.city || '').toLowerCase() === centerCityLower;
                                });
                                const selectedSessionData = rebookAvailableSessions.find(s => String(s.id) === rebookExamSessionId);
                                if (filteredSessions.length > 0) {
                                  return (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                                      {filteredSessions.map((s, idx) => {
                                        const sessionId = s.id || idx;
                                        const isSelected = rebookExamSessionId === String(sessionId);
                                        const time = s.time || '';
                                        const centerName = s.centerName || '';
                                        const centerCity = s.city || '';
                                        const slots = s.seats ?? '';
                                        return (
                                          <button key={sessionId || idx} type="button" onClick={() => { setRebookExamSessionId(isSelected ? '' : String(sessionId)); }}
                                            className={`w-full text-left p-3 rounded-xl border transition-all ${isSelected ? 'bg-emerald-600/20 border-emerald-500/50 ring-1 ring-emerald-500/30' : 'bg-white/[0.03] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.06]'}`}>
                                            <div className="flex items-center justify-between">
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  {time && <span className="text-sm font-medium text-white">{time}</span>}
                                                  {!time && <span className="text-sm font-medium text-slate-400">Session #{idx + 1}</span>}
                                                </div>
                                                {(centerName || centerCity) && <div className="text-xs text-slate-500 mt-0.5 truncate">{[centerName, centerCity].filter(Boolean).join(', ')}</div>}
                                              </div>
                                              <div className="flex items-center gap-2 shrink-0">
                                                {slots !== '' && slots !== null && <span className="text-[10px] text-slate-500">{slots} seats</span>}
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-emerald-400 bg-emerald-400' : 'border-white/[0.15]'}`}>
                                                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div className="text-xs text-slate-500 py-2">
                                      {selectedCenter
                                        ? `No sessions found for ${selectedCenter.name} on this date. Try a different date.`
                                        : 'No sessions found for this date. Try a different date or city.'}
                                    </div>
                                  );
                                }
                              })()}
                            </div>
                          )}
                          <div>
                            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Language</label>
                            <select value={rebookLanguage} onChange={(e) => setRebookLanguage(e.target.value)}
                              className="w-full px-4 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all appearance-none cursor-pointer">
                              <option value="en">English</option>
                              <option value="ar">Arabic</option>
                              <option value="bn">Bangla</option>
                              <option value="id">Indonesian</option>
                              <option value="ta">Tamil</option>
                              <option value="si">Sinhala</option>
                            </select>
                          </div>
                          {showPayloadPreview && pendingPayload && pendingPayload._rebook ? (
                            <div className="w-full space-y-3">
                              <div className="p-3 bg-white/[0.04] border border-emerald-500/30 rounded-xl">
                                <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-2">Payload Preview — Exact data sent to SVPI</div>
                                <pre className="text-xs text-slate-300 bg-black/30 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap font-mono">{JSON.stringify(pendingPayload, null, 2)}</pre>
                              </div>
                              <div className="flex gap-2">
                                <button onClick={() => { setShowPayloadPreview(false); setPendingPayload(null); }} className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-slate-400 text-xs border border-white/[0.08] transition-all">Cancel</button>
                                <button onClick={async () => {
                                  setShowPayloadPreview(false);
                                  setRebookLoading(true); setError('');
                                  try {
                                    const res = await fetch('/api/exam/rebook', {
                                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify(pendingPayload)
                                    });
                                    const json = await res.json();
                                    setRebookResult(json);
                                    if (json.success) { setRebookSelected(null); setRescheduleNewDate(''); setRescheduleCategory(''); setRebookCategorySearch(''); setRescheduleCity(''); setRescheduleCenter(''); setRebookExamSessionId(''); setRebookAvailableSessions([]); handleLoadSessions(); }
                                    else setError(json.error || 'Rebook failed.');
                                  } catch { setError('Rebook request failed.'); } finally { setRebookLoading(false); setPendingPayload(null); }
                                }} disabled={rebookLoading}
                                  className="flex-[2] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/[0.06] disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                                  {rebookLoading ? 'Rebooking...' : 'Confirm & Send to SVPI'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setRebookSelected(null); setRescheduleCategory(''); setRebookCategorySearch(''); setRescheduleCity(''); setRescheduleCenter(''); setRescheduleNewDate(''); setRebookExamSessionId(''); setRebookAvailableSessions([]); }} className="flex-1 py-2 bg-white/[0.05] hover:bg-white/[0.1] rounded-xl text-slate-400 text-xs border border-white/[0.08] transition-all">Cancel</button>
                              <button onClick={() => {
                                if (!rescheduleNewDate || !rescheduleCategory || !rescheduleCity) { setError('Please select category, city, and date.'); return; }
                                if (!rebookExamSessionId) { setError('Please select an available exam session.'); return; }
                                if (!rescheduleCenter) { setError('Please select a test center.'); return; }
                                const cityObj = rescheduleCities.find(c => c.id === rescheduleCity);
                                const cityName = cityObj ? cityObj.name : '';
                                if (!cityName) { setError('City name not found.'); return; }
                                const selectedCenter = rescheduleCenters.find(c => String(c.id) === String(rescheduleCenter));
                                const centerName = selectedCenter ? selectedCenter.name : '';
                                const selectedSessionData = rebookAvailableSessions.find(s => String(s.id) === rebookExamSessionId);
                                const body = {
                                  categoryId: rescheduleCategory,
                                  examSessionId: rebookExamSessionId,
                                  languageCode: rebookLanguage,
                                  methodology: rebookMethodology,
                                  newDate: rescheduleNewDate,
                                  cityName,
                                  testCenter: centerName,
                                  sessionTime: selectedSessionData?.time || ''
                                };
                                setPendingPayload({ ...body, _rebook: true });
                                setShowPayloadPreview(true);
                              }} disabled={!rescheduleNewDate || !rescheduleCategory || !rescheduleCity || !rebookExamSessionId || !rescheduleCenter}
                                className="flex-[2] py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-white/[0.06] disabled:text-slate-500 rounded-xl text-white text-xs font-semibold transition-all">
                                Review Payload
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {rebookResult && (
              <div className={`p-4 rounded-xl border ${rebookResult.success ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
                {rebookResult.success ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-semibold">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                      Exam rebooked successfully!
                    </div>
                    {rebookResult.data?.center && (
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="text-slate-400"><span className="text-slate-500">Center:</span> <span className="text-white">{rebookResult.data.center.name}</span></div>
                        {rebookResult.data.center.city && <div className="text-slate-400"><span className="text-slate-500">City:</span> <span className="text-white">{rebookResult.data.center.city}</span></div>}
                        {rebookResult.data.center.address && <div className="text-slate-400"><span className="text-slate-500">Address:</span> <span className="text-white">{rebookResult.data.center.address}</span></div>}
                      </div>
                    )}
                    {rebookResult.data?.testDate && (
                      <div className="text-xs text-slate-400"><span className="text-slate-500">New Date:</span> <span className="text-white">{rebookResult.data.testDate}{rebookResult.data.testTime ? ` at ${rebookResult.data.testTime}` : ''}</span></div>
                    )}
                    {rebookResult.data?.status && (
                      <div className="text-xs text-slate-400"><span className="text-slate-500">Status:</span> <span className="text-emerald-400 capitalize">{rebookResult.data.status}</span></div>
                    )}
                  </div>
                ) : (
                  <span className="text-red-400 text-sm">{rebookResult.error || 'Rebook failed.'}</span>
                )}
                <button onClick={() => setRebookResult(null)} className="mt-2 text-xs underline opacity-70 text-slate-400">dismiss</button>
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
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.09] bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-6 shadow-xl shadow-black/30 backdrop-blur-xl">
              <div className="pointer-events-none absolute -top-16 -right-16 h-44 w-44 rounded-full bg-emerald-500/[0.1] blur-3xl" />
              <div className="relative flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 shadow-sm shadow-emerald-500/10">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  </span>
                  <div>
                    <span className="block text-[11px] font-semibold text-slate-400 uppercase tracking-[0.14em]">Exam Results</span>
                    <span className="block text-[10px] text-slate-600">Download official certificates</span>
                  </div>
                </div>
                <button onClick={handleLoadResults} disabled={loadingResults || !authStatus?.loggedIn}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-white/[0.06] disabled:to-white/[0.06] disabled:text-slate-500 rounded-xl text-xs font-semibold text-white shadow-lg shadow-emerald-600/25 transition-all disabled:cursor-not-allowed">
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
                      <div key={rid} className="flex items-start gap-3 bg-white/[0.03] p-4 rounded-xl border border-white/[0.06] hover:border-emerald-500/30 hover:bg-white/[0.05] transition-all">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] border border-white/[0.08] text-slate-400">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <h3 className="font-semibold text-white text-sm">{rName}</h3>
                            <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full border ${passed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
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
    </div>
  );
}
