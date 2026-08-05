const fs = require('fs');
const t = fs.readFileSync('.svp-bundles/app.db37e884.js', 'utf-8');

const terms = [
  'getPrometricExamSessions(',
  'getPrometricExamSessions;',
  '"getPrometricExamSessions"',
  'getAvailableSlots(',
  '"getAvailableSlots"',
  'createSlotHold(',
  '"createSlotHold"',
  'fetchAvailableDates',
  'prometric',
  'site_ids',
  'siteId',
];

for (const term of terms) {
  let idx = 0, c = 0;
  while ((idx = t.indexOf(term, idx)) !== -1 && c < 6) {
    const s = Math.max(0, idx - 350);
    const e = Math.min(t.length, idx + 350);
    c++;
    console.log('--- ' + term + ' occ ' + c + ' ---');
    console.log(t.substring(s, e).replace(/\n/g, ' '));
    console.log();
    idx += 1;
  }
}
