const SVP_BASE = 'https://svp-international.pacc.sa';

const res = await fetch(`${SVP_BASE}/labor/reschedule/steps?reservationId=4964415`, {
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});
const txt = await res.text();
console.log('status', res.status, 'len', txt.length);
const srcs = [...txt.matchAll(/<script[^>]*src="([^"]+)"/g)].map(m => m[1]);
console.log('script srcs:', JSON.stringify(srcs, null, 1));
