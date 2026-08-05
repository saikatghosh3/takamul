async function main() {
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131' };
  const r = await fetch('https://securereg3.prometric.com/pageredirection.aspx?mode=locatecenter', { headers });
  const t = await r.text();
  console.log('status', r.status, 'len', t.length);
  const forms = [...t.matchAll(/<form[^>]*>/g)].map(x => x[0]);
  console.log('FORMS:', forms);
  const selects = [...t.matchAll(/<select[^>]*name="([^"]+)"[^>]*>/g)].map(x => x[1]);
  console.log('SELECTS:', selects);
  const inputs = [...t.matchAll(/<input[^>]*name="([^"]+)"[^>]*>/g)].map(x => x[1]);
  console.log('INPUTS:', [...new Set(inputs)]);
  const scripts = [...t.matchAll(/src="([^"]+\.js)"/g)].map(x => x[1]);
  console.log('SCRIPTS:', scripts);
  const options = [...t.matchAll(/<option[^>]*value="([^"]+)"[^>]*>([^<]*)<\/option>/g)].slice(0, 20).map(x => `${x[1]} = ${x[2].trim()}`);
  console.log('OPTIONS sample:', options);
  require('fs').writeFileSync('scripts/_prometric-locate.html', t);
}
main().catch(e => console.error('ERR', e.message));
