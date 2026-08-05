const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOKEN_FILE = path.join(ROOT, '.svp-token.json');
const { token } = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));

const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international' };

const codes = ['LOABB', 'TLREE', 'CTWPE', 'TLRPE'];

async function probe(name, url, opts = {}) {
  const { method = 'GET', body } = opts;
  try {
    const r = await fetch(url, {
      method,
      headers: { ...HDR, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await r.text();
    console.log(`\n=== ${name} ===`);
    console.log(`${method} ${url.replace(API, '')}`);
    console.log(`status ${r.status}`);
    console.log(text.slice(0, 600));
  } catch (e) {
    console.log(`\n=== ${name} ===`);
    console.log('ERROR:', e.message);
  }
}

async function main() {
  const base = 'individual_labor_space/prometric_scheduling/sites_availabilities';
  const q = (extra = '') => `${API}/${base}?prometric_code=${encodeURIComponent('LOABB')}&city=Khulna&start_date=2026-08-01&end_date=2026-08-31${extra}`;

  // 1. Extra params the wizard never sends
  await probe('sites_availabilities + category_id=159', q('&category_id=159'));
  await probe('sites_availabilities + country_id=78', q('&country_id=78'));
  await probe('sites_availabilities + country_code=BD', q('&country_code=BD'));
  await probe('sites_availabilities + category_id + country_id', q('&category_id=159&country_id=78'));
  await probe('sites_availabilities + category_id + country_code', q('&category_id=159&country_code=BD'));
  await probe('sites_availabilities + exam_engine=prometric', q('&exam_engine=prometric'));
  await probe('sites_availabilities single-day', `${API}/${base}?prometric_code=LOABB&city=Khulna&start_date=2026-08-06&end_date=2026-08-06`);
  await probe('sites_availabilities no-city wide', `${API}/${base}?prometric_code=LOABB&start_date=2026-08-01&end_date=2026-12-31`);
  await probe('sites_availabilities language_code param', `${API}/${base}?prometric_code=LOABB&city=Khulna&start_date=2026-08-01&end_date=2026-08-31&language_code=LOABB`);

  // 2. slots_availabilities variants (GET with params, POST with body)
  const slotsBase = 'individual_labor_space/prometric_scheduling/slots_availabilities';
  await probe('slots_availabilities GET site_ids=1279959005', `${API}/${slotsBase}?site_ids=1279959005&exam_id=1`);
  await probe('slots_availabilities GET exam_id=null', `${API}/${slotsBase}?site_ids=1279959005&exam_id=null`);
  await probe('slots_availabilities POST', `${API}/${slotsBase}`, {
    method: 'POST',
    body: { site_id: 1279959005, exam_id: 1, start_date: '2026-08-01', end_date: '2026-08-31' }
  });
  await probe('slots_availabilities POST array', `${API}/${slotsBase}`, {
    method: 'POST',
    body: { site_ids: [1279959005], exam_id: 1, start_date: '2026-08-01', end_date: '2026-08-31' }
  });

  // 3. TEP / other engine variants on the visitor space
  await probe('visitor_space exam_sessions available_dates cat159', `${API}/visitor_space/exam_sessions/available_dates?category_id=159`);
  await probe('visitor_space exam_sessions cat159', `${API}/visitor_space/exam_sessions?category_id=159&country_id=78`);
  await probe('visitor_space exam_reservations/options', `${API}/visitor_space/exam_reservations/options`);

  // 4. Non-targeted flow endpoints on individual_labor_space (used by non-targeted users)
  await probe('i_l_s cities list', `${API}/individual_labor_space/test_centers/cities`);
  await probe('i_l_s categories', `${API}/individual_labor_space/categories`);
  await probe('i_l_s countries', `${API}/individual_labor_space/active_country_codes`);
  await probe('i_l_s occupations', `${API}/individual_labor_space/occupations`);
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
