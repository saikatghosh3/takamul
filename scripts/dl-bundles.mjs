import { writeFileSync, mkdirSync, existsSync } from 'fs';
const files = [
  'https://svp-international.pacc.sa/js/app.db37e884.js',
  'https://svp-international.pacc.sa/js/368.8fb39ed2.js',
  'https://svp-international.pacc.sa/js/8564.22c8d28b.js',
  'https://svp-international.pacc.sa/js/8447.059667ad.js',
  'https://svp-international.pacc.sa/js/2920.dcb4598e.js',
  'https://svp-international.pacc.sa/js/491.96bf0c00.js',
  'https://svp-international.pacc.sa/js/4512.42d8d3b6.js',
  'https://svp-international.pacc.sa/js/6048.5f9007b6.js',
  'https://svp-international.pacc.sa/js/9588.21a78df4.js',
  'https://svp-international.pacc.sa/js/4142.1e5a1994.js',
];
if (!existsSync('.svp-bundles')) mkdirSync('.svp-bundles');
for (const url of files) {
  const name = url.split('/').pop();
  try {
    const r = await fetch(url, { headers: { 'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' } });
    const txt = await r.text();
    writeFileSync(`.svp-bundles/${name}`, txt);
    console.log(`saved ${name} ${txt.length} bytes (HTTP ${r.status})`);
  } catch(e) { console.log(`FAIL ${name}: ${e.message}`); }
}
