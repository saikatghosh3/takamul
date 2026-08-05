async function main() {
  const r = await fetch('https://svp-local.pacc.sa/assets/index-P77yw7cV.js', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const t = await r.text();
  require('fs').writeFileSync(require('path').join(__dirname, '..', '.svp-local-bundle.js'), t);
  const i = t.indexOf('prometric');
  const idxs = [];
  let j = 0;
  while ((j = t.indexOf('prometric', j)) !== -1) { idxs.push(j); j += 9; }
  console.log('occurrences:', idxs.length);
  for (const off of idxs.slice(0, 25)) {
    console.log('---', off, '---');
    console.log(t.slice(Math.max(0, off - 300), off + 300).replace(/\n/g, ' '));
  }
  // find API base
  const apis = [...new Set([...t.matchAll(/["'`](https?:\/\/[^"'`\s]+api[^"'`\s]*)/g)].map(x => x[1]))];
  console.log('\nAPI urls:', apis.slice(0, 20));
}
main().catch(e => console.error('ERR', e.message));
