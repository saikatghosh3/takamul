async function main() {
  const r = await fetch('https://svp-local.pacc.sa/', { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131' } });
  const t = await r.text();
  console.log('status', r.status, 'len', t.length);
  const m = [...new Set([...t.matchAll(/https:\/\/[a-zA-Z0-9.-]+\.pacc\.sa/g)].map(x => x[0]))];
  console.log('hosts:', m);
  const m2 = [...t.matchAll(/src="([^"]+\.js)"/g)].map(x => x[1]);
  console.log('scripts:', m2.slice(0, 20));
  const m3 = [...t.matchAll(/href="([^"]+)"/g)].map(x => x[1]).filter(h => /prometric|schedul/i.test(h));
  console.log('prometric hrefs:', m3);
}
main().catch(e => console.error('ERR', e.message));
