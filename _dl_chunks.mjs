import fs from 'fs';
import path from 'path';
const outDir = 'C:/Users/HP/AppData/Local/Temp/opencode/svp-chunks';
fs.mkdirSync(outDir, { recursive: true });
const { files } = JSON.parse(fs.readFileSync('_chunklist.json', 'utf-8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
let ok = 0, fail = 0;
for (const f of files) {
  const fp = path.join(outDir, f);
  if (fs.existsSync(fp)) { ok++; continue; }
  try {
    const r = await fetch('https://svp-international.pacc.sa/js/' + f, { headers: { 'User-Agent': UA } });
    if (r.ok) { fs.writeFileSync(fp, await r.text()); ok++; }
    else { fail++; }
  } catch { fail++; }
}
console.log('done ok:', ok, 'fail:', fail);
