const fs = require('fs');
const t = JSON.parse(fs.readFileSync('.svp-token.json', 'utf-8'));
const tok = String(t.token).replace(/^Bearer /, '');
const BASE = 'https://svp-international-api.pacc.sa/api/v1';
const H = {
  'Authorization': 'Bearer ' + tok,
  'Origin': 'https://svp-international.pacc.sa',
  'Referer': 'https://svp-international.pacc.sa/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'X-Tenant-Name': 'svp-international',
};
async function jget(url) {
  const r = await fetch(url, { headers: H });
  let body = null;
  try { body = await r.json(); } catch {}
  return { status: r.status, body };
}
async function jpost(url, payload) {
  const r = await fetch(url, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  let body = null;
  try { body = await r.json(); } catch { try { body = await r.text(); } catch {} }
  return { status: r.status, body };
}
(async () => {
  const cat = '160';
  const date = '2026-08-09';
  const city = 'Cumilla';

  console.log('========== TOKEN CHECK ==========');
  const tokCheck = await jget(`${BASE}/individual_labor_space/exam_reservations?per_page=1`);
  console.log('exam_reservations status:', tokCheck.status, 'count:', (tokCheck.body?.exam_reservations || []).length);

  console.log('\n========== A) RESERVATION-QUALIFIED SCOPE (does test_center_id still scope WITH reservation_id?) ==========');
  const variants = {
    'res-only-4844086': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&reservation_id=4844086&available_seats=greater_than::0`,
    'res-174-4844086': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&reservation_id=4844086&test_center_id=174&available_seats=greater_than::0`,
    'res-203-4844086': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&reservation_id=4844086&test_center_id=203&available_seats=greater_than::0`,
  };
  const sets = {};
  for (const [k, u] of Object.entries(variants)) {
    const { status, body } = await jget(BASE + u);
    const list = (body && (body.exam_sessions || body.data || [])) || [];
    sets[k] = list.map(s => s.id);
    console.log(`\n[${k}] status=${status} count=${list.length}`);
    for (const s of list.slice(0, 3)) {
      console.log(`  id=${String(s.id).slice(0, 24)}… tc=${JSON.stringify(s.test_center)}`);
    }
  }
  const overlap = (a, b) => a.filter(x => b.includes(x));
  console.log('\nOVERLAP:');
  console.log('res-174 ∩ res-203 =', overlap(sets['res-174-4844086'], sets['res-203-4844086']).length);
  console.log('res-only count:', (sets['res-only-4844086'] || []).length);

  console.log('\n========== B) TEMPORARY SEAT HOLD: does the hold reveal/pin the center? (non-destructive) ==========');
  const date2 = '2026-08-16';
  const q174 = await jget(`${BASE}/individual_labor_space/exam_sessions?category_id=159&city=${city}&exam_date=${date2}&test_center_id=174&available_seats=greater_than::0`);
  const q203 = await jget(`${BASE}/individual_labor_space/exam_sessions?category_id=159&city=${city}&exam_date=${date2}&test_center_id=203&available_seats=greater_than::0`);
  const s174 = (q174.body && (q174.body.exam_sessions || [])) || [];
  const s203 = (q203.body && (q203.body.exam_sessions || [])) || [];
  console.log('tc-174 count:', s174.length, 'tc-203 count:', s203.length);

  for (const [label, sid] of [['tc-174', s174[0]?.id], ['tc-203', s203[0]?.id]].filter(([, id]) => id)) {
    const { status, body } = await jpost(`${BASE}/individual_labor_space/temporary_seats`, { exam_session_id: sid });
    console.log(`\n[${label} hold] session=${String(sid).slice(0, 24)}… status=${status}`);
    console.log('  hold keys:', body && typeof body === 'object' ? Object.keys(body).join(', ') : String(body).slice(0, 300));
    if (body && typeof body === 'object') {
      const es = body.exam_session || body;
      console.log('  exam_session.test_center:', JSON.stringify(es && es.test_center));
      console.log('  exam_session keys:', es ? Object.keys(es).join(', ') : 'n/a');
      const holdId = body.id || body.hold_id || (body.data && body.data.id);
      if (holdId) {
        console.log('  holdId:', holdId);
      }
    }
  }
})();
