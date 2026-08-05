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
(async () => {
  const cat = '159';
  const date = '2026-08-16';
  const city = 'Cumilla';
  const variants = {
    'no-center': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&available_seats=greater_than::0`,
    'tc-174': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&available_seats=greater_than::0&test_center_id=174`,
    'tc-203': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&available_seats=greater_than::0&test_center_id=203`,
    'tc-62': `/individual_labor_space/exam_sessions?category_id=${cat}&city=${city}&exam_date=${date}&available_seats=greater_than::0&test_center_id=62`,
  };
  const sets = {};
  for (const [k, u] of Object.entries(variants)) {
    const { status, body } = await jget(BASE + u);
    const list = (body && (body.exam_sessions || body.data || [])) || [];
    sets[k] = list.map(s => s.id);
    console.log(`\n=== ${k} status=${status} count=${list.length} ===`);
    for (const s of list.slice(0, 3)) {
      console.log(`  id=${s.id}`);
      console.log(`    tc=${JSON.stringify(s.test_center)}`);
    }
  }
  const ids174 = sets['tc-174'] || [], ids203 = sets['tc-203'] || [], ids0 = sets['no-center'] || [];
  const overlap = (a, b) => a.filter(x => b.includes(x));
  console.log('\n=== OVERLAP ===');
  console.log('174 ∩ 203 =', overlap(ids174, ids203).length);
  console.log('174 ⊆ no-center =', ids174.filter(x => ids0.includes(x)).length, '/', ids174.length);
  console.log('203 ⊆ no-center =', ids203.filter(x => ids0.includes(x)).length, '/', ids203.length);
  // detail probe on a 174-scoped token
  for (const sid of ids174.slice(0, 2)) {
    const { status, body } = await jget(`${BASE}/individual_labor_space/exam_sessions/${sid}`);
    console.log(`\n=== DETAIL ${sid.slice(0, 18)}... status=${status} ===`);
    console.log('  keys:', body ? Object.keys(body).join(', ') : 'n/a');
    console.log('  test_center:', body ? JSON.stringify(body.test_center) : 'n/a');
    if (body && body.test_center) console.log('  test_center keys:', Object.keys(body.test_center).join(', '));
  }
})();
