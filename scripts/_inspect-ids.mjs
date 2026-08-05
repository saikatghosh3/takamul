import fs from 'fs';
for (const f of ['debug-exam-sessions.json','debug-il-sessions.json','debug-filtered-sessions.json','debug-session-full.json','debug-resv.json']) {
  if (!fs.existsSync(f)) { console.log(f, 'missing'); continue; }
  const raw = fs.readFileSync(f, 'utf-8');
  let j; try { j = JSON.parse(raw); } catch (e) { console.log(f, 'parse fail', e.message); continue; }
  const s = JSON.stringify(j);
  const ids = [...new Set((s.match(/"id": ?"?\d{6,9}"?|"id":"[A-Za-z0-9_-]{12,40}"|"exam_session_id": ?"?\d{6,9}"?/g) || []))].slice(0, 8);
  console.log('===', f, 'type=' + (Array.isArray(j) ? 'array(' + j.length + ')' : 'obj keys=' + Object.keys(j).join(',')));
  console.log('  id-ish:', ids.join(' | ').substring(0, 400));
}
