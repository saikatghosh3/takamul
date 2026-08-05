const fs = require('fs');
const j = JSON.parse(fs.readFileSync('debug-booking-wizard.json', 'utf-8'));
const bodies = [];
for (const e of (j.capture || [])) {
  if (e.body && typeof e.body === 'string' && e.body.length > 200) bodies.push(e.body);
  if (e.responseBody && typeof e.responseBody === 'string' && e.responseBody.length > 200) bodies.push(e.responseBody);
}
console.log('big bodies:', bodies.length);
const codes = new Set();
const practical = new Set();
for (const b of bodies) {
  const re = /"code":"([A-Z0-9]{3,8})"/g;
  let m;
  while ((m = re.exec(b))) codes.add(m[1]);
  const re2 = /"prometric_practical_code(?:_non_targeted)?"\s*:\s*"([A-Z0-9]*)"|"prometric_practical_code(?:_non_targeted)?"\s*:\s*([A-Z0-9]+)"/g;
  let m2;
  while ((m2 = re2.exec(b))) { const v = m2[1] || m2[2]; if (v) practical.add(v); }
}
// also scan debug-wizard-capture.json bodies
try {
  const j2 = JSON.parse(fs.readFileSync('debug-wizard-capture.json', 'utf-8'));
  for (const e of (Array.isArray(j2) ? j2 : [])) {
    if (e.body && typeof e.body === 'string') {
      const re = /"code":"([A-Z0-9]{3,8})"/g;
      let m;
      while ((m = re.exec(e.body))) codes.add(m[1]);
    }
  }
} catch (e) {}
console.log('unique codes:', codes.size);
console.log([...codes].join(', '));
console.log('practical:', [...practical].join(', '));
fs.writeFileSync('debug-all-prometric-codes.json', JSON.stringify({ codes: [...codes], practical: [...practical] }, null, 1));
