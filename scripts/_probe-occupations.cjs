const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { token } = JSON.parse(fs.readFileSync(path.join(ROOT, '.svp-token.json'), 'utf-8'));
const API = 'https://svp-international-api.pacc.sa/api/v1';
const HDR = { 'Accept': 'application/json', 'Authorization': 'Bearer ' + token, 'X-Tenant-Name': 'svp-international' };

async function main() {
  const out = { categories: null, occupations: null, prometricNonTargeted: [], prometricTargeted: [], tepCodes: [], analysis: {} };
  const [catRes, occRes] = await Promise.all([
    fetch(`${API}/individual_labor_space/categories`, { headers: HDR }),
    fetch(`${API}/individual_labor_space/occupations`, { headers: HDR })
  ]);
  out.categories = await catRes.json();
  out.occupations = await occRes.json();

  const cats = out.categories.categories || [];
  const occs = out.occupations.occupations || [];

  const catMap = new Map();
  for (const c of cats) catMap.set(c.id, c);

  // Merge category metadata into each category's prometric codes
  for (const o of occs) {
    const cat = o.category || catMap.get(o.category_id) || {};
    const codes = cat.prometric_codes || o.prometric_codes || [];
    for (const pc of codes) {
      const entry = {
        category_id: cat.id, category: cat.english_name,
        occupation_id: o.occupation_id, occupation: o.english_name,
        code: pc.code, language_code: pc.language_code, english_name: pc.english_name,
        non_targeted: pc.non_targeted, exam_engine_id: pc.exam_engine_id, exam_engine_name: pc.exam_engine_name,
        question_count: pc.question_count, id: pc.id
      };
      if ((pc.exam_engine_name || '').toLowerCase() === 'tep') {
        out.tepCodes.push(entry);
      } else if (pc.non_targeted) {
        out.prometricNonTargeted.push(entry);
      } else {
        out.prometricTargeted.push(entry);
      }
    }
  }

  // Dedupe
  const uniq = (arr, k) => {
    const seen = new Map();
    for (const e of arr) { if (!seen.has(e[k])) seen.set(e[k], e); }
    return [...seen.values()];
  };

  out.analysis = {
    totalOccupations: occs.length,
    totalCategories: cats.length,
    categories_with_prometric_engine: uniq(occs.map(o => o.category).filter(Boolean), 'id').length,
    uniquePrometricTargetedCodes: uniq(out.prometricTargeted, 'code').length,
    uniquePrometricNonTargetedCodes: uniq(out.prometricNonTargeted, 'code').length,
    uniqueTepCodes: uniq(out.tepCodes, 'code').length,
    nonTargetedPrometricCodes: uniq(out.prometricNonTargeted, 'code').map(c => ({ code: c.code, language_code: c.language_code, non_targeted: c.non_targeted, exam_engine_name: c.exam_engine_name })),
    categoryEngines: uniq(occs.map(o => o.category && { id: o.category.id, name: o.category.english_name, exam_engine: o.category.exam_engine, exam_type: o.category.exam_type, in_person_exam_type: o.category.in_person_exam_type }), 'id').slice(0, 30)
  };

  fs.writeFileSync(path.join(ROOT, 'debug-occupations-full.json'), JSON.stringify(out, null, 2), 'utf-8');
  console.log('categories:', out.analysis.totalCategories);
  console.log('occupations:', out.analysis.totalOccupations);
  console.log('unique targeted prometric codes:', out.analysis.uniquePrometricTargetedCodes);
  console.log('unique non-targeted prometric codes:', out.analysis.uniquePrometricNonTargetedCodes);
  console.log('unique TEP codes:', out.analysis.uniqueTepCodes);
  console.log('\nNon-targeted prometric codes:');
  console.log(JSON.stringify(out.analysis.nonTargetedPrometricCodes, null, 2));
  console.log('\nFirst 15 category engines:');
  console.log(JSON.stringify(out.analysis.categoryEngines, null, 2));
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
