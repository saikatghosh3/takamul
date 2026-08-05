const fs = require('fs');
const b = fs.readFileSync('scripts/_prometric-locate.html', 'utf8');
const m = b.match(/var aIds,aDesc,aChnl;aIds=(\[[\s\S]*?\]);aDesc=(\[[\s\S]*?\]);/);
if (!m) { console.log('no match'); process.exit(1); }
const ids = JSON.parse(m[1]);
let desc = JSON.parse(m[2]);
desc = desc.map(d => String(d));
console.log('total programs:', ids.length);
const svp = [];
for (let i = 0; i < ids.length; i++) {
  const d = desc[i] || '';
  if (/svp|skill|verif|pacc|saudi|labor|exam|test center/i.test(d)) {
    svp.push({ id: ids[i], desc: d });
  }
}
console.log(JSON.stringify(svp.slice(0, 100), null, 2));
console.log('matched:', svp.length);
fs.writeFileSync('scripts/_prometric-programs.json', JSON.stringify(ids.map((id, i) => ({ id, desc: desc[i] })), null, 2), 'utf-8');
