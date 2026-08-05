const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '.svp-bundles');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const endpoints = new Map();

for (const f of files) {
  const b = fs.readFileSync(path.join(dir, f), 'utf8');
  const re = /(?:\/api\/v1)?(?:\/)?([a-z_]+(?:\/[a-zA-Z0-9_{}$.\-]+)*)\/?(?=['"])/g;
  // find template-literal-ish api path strings
  const pats = [...b.matchAll(/`([^`]*\/(?:exam|reservation|session|slot|site|center|category|occupation|country|city|certificate|prometric|ticket|payment|test)[^`]*)`/g)].map(x => x[1]);
  const strs = [...b.matchAll(/['"](\/(?:individual_labor_space|visitor_space|test_center_owner_space|assessor_space|legislator_space|admin)[^'"]*)['"]/g)].map(x => x[1]);
  const all = [...pats, ...strs];
  for (const p of all) {
    const clean = p.replace(/^\$\{e\}/, 'X').replace(/\$\{[^}]*\}/g, ':p');
    const k = clean.split('?')[0];
    if (!endpoints.has(k)) endpoints.set(k, []);
    endpoints.get(k).push(f);
  }
}

const list = [...endpoints.entries()].sort((a, b) => a[0].localeCompare(b[0]));
for (const [k, files] of list) {
  console.log(k.padEnd(80), [...new Set(files)].join(','));
}
console.log('\ntotal:', list.length);
