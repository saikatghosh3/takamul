async function main() {
  const hosts = ['https://svp-oman.pacc.sa/', 'https://svp-om.pacc.sa/', 'https://svp-international-api.pacc.sa/api/v1/'];
  for (const h of hosts) {
    try {
      const r = await fetch(h, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'manual' });
      console.log(h, r.status, r.headers.get('location') || '');
    } catch (e) { console.log(h, 'ERR', e.message); }
  }
  // prometric public site list
  try {
    const r = await fetch('https://www.prometric.com/files/2022-03/test_center_list_web.pdf', { headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('pdf status', r.status, 'len', (await r.arrayBuffer()).byteLength);
  } catch (e) { console.log('pdf ERR', e.message); }
}
main().catch(e => console.error('ERR', e.message));
