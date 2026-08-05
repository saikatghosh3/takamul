const fs = require('fs');
const path = require('path');
const b = fs.readFileSync(path.join(__dirname, '..', '.svp-local-bundle.js'), 'utf8');

function find(needle, before, after, limit = 5) {
  const idxs = [];
  let i = 0;
  while ((i = b.indexOf(needle, i)) !== -1) { idxs.push(i); i += needle.length; }
  console.log(`\n### ${needle}: ${idxs.length} occurrences`);
  for (const off of idxs.slice(0, limit)) {
    console.log('---', off, '---');
    console.log(b.slice(Math.max(0, off - before), off + after).replace(/\n/g, ' '));
  }
  return idxs;
}

async function main() {
  // Find t1e / TestCenterSearch component definition
  const idxs = find('TestCenterSearch', 400, 1500, 5);
  find('test-center-search', 200, 200, 5);
}
main().catch(e => console.error('ERR', e.message));
