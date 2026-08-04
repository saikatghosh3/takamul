import fs from 'fs';
import path from 'path';
const dir = 'C:/Users/HP/AppData/Local/Temp/opencode/svp-chunks';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
const hits = [];
for (const f of files) {
  const c = fs.readFileSync(path.join(dir, f), 'utf-8');
  const lower = c.toLowerCase();
  if (lower.includes('reschedul')) {
    hits.push(f);
    const term = 'reschedule';
    let i = lower.indexOf(term);
    const ctx = c.substring(Math.max(0, i - 200), i + 300);
    console.log(`\n### ${f}: ...${ctx.substring(0, 500)}...`);
  }
}
console.log('\nTOTAL FILES MENTIONING reschedul:', hits.length);
fs.writeFileSync('_chunkhits.json', JSON.stringify(hits));
