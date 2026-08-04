import fs from 'fs';
const t = fs.readFileSync('_app-bundle.js', 'utf-8');
const idx = t.indexOf('.u=function');
const tail = t.substring(idx, idx + 40000);
// names map: first {...}
const nm = tail.match(/\{\s*4005:[^}]*\}/);
const names = new Map();
if (nm) { for (const entry of nm[0].slice(1, -1).split(',')) { const e = entry.match(/(\d+):"([^"]+)"/); if (e) names.set(e[1], e[2]); } }
console.log('names count:', names.size);
// find hash map object: match a brace group that contains entries like "11":"hex"
const hm = tail.match(/\{11:"[0-9a-f]+"[^}]*\}/);
const hashes = new Map();
if (hm) { for (const entry of hm[0].slice(1, -1).split(',')) { const e = entry.match(/(\d+):"([^"]+)"/); if (e) hashes.set(e[1], e[2]); } }
console.log('hashes count:', hashes.size);
const files = [];
for (const [id, h] of hashes) { const n = names.get(id); files.push(n ? `${n}.${h}.js` : `${id}.${h}.js`); }
fs.writeFileSync('_chunklist.json', JSON.stringify({ files }, null, 1));
console.log('total chunk files:', files.length);
console.log(files.slice(0, 8).join('\n'));
