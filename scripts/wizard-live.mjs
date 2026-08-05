import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';

const storage = JSON.parse(readFileSync('.svp-storage.json','utf-8'));
const capture = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', headless: false, args: ['--no-sandbox','--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({ storageState: storage, viewport: { width: 1280, height: 900 } });
await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await context.newPage();

page.on('request', (req) => {
  const u = req.url();
  if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
    capture.push({ t:'req', method:req.method(), url:u, postData:req.postData()||null, ts:Date.now() });
  }
});
page.on('response', async (res) => {
  const u = res.url();
  if (u.includes('svp-international-api') && u.includes('/api/v1/')) {
    let body=null; try { body = await res.text(); } catch {}
    capture.push({ t:'res', status:res.status(), url:u, body, ts:Date.now() });
  }
});

try {
  // Directly navigate to the reschedule wizard for the cancelled reservation
  const url = 'https://svp-international.pacc.sa/labor/reschedule/steps?reservationId=4878771';
  console.log('[nav]', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(8000);
  console.log('url after nav:', page.url());
  const bodyText = await page.evaluate(() => document.body?.innerText || '').catch(()=>'');
  console.log('BODY:', bodyText.substring(0, 1200));

  // Find selects and pick a city (Khulna) + language (English)
  const dumpSelects = () => page.evaluate(() => [...document.querySelectorAll('select')].map((s,i) => ({ i, id:s.id, name:s.name, disabled:s.disabled, opts:[...s.options].map(o=>o.text.trim()) })));
  const selects = await dumpSelects();
  console.log('[selects]', JSON.stringify(selects));

  // choose city+lang selects by matching options
  for (const s of selects) {
    const low = (s.opts||[]).map(o=>o.toLowerCase()).join(' | ');
    if (/khulna/.test(low)) {
      await page.evaluate((i)=>{ const el=[...document.querySelectorAll('select')][i]; const o=[...el.options].find(o=>/khulna/i.test(o.text)); el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); }, s.i);
      console.log('[set] khulna on select', s.i);
    } else if (/english|arabic/.test(low)) {
      await page.evaluate((i)=>{ const el=[...document.querySelectorAll('select')][i]; const o=[...el.options].find(o=>/english/i.test(o.text)); el.value=o.value; el.dispatchEvent(new Event('change',{bubbles:true})); }, s.i);
      console.log('[set] english on select', s.i);
    }
  }
  await sleep(5000);
  const selects2 = await dumpSelects();
  console.log('[selects after]', JSON.stringify(selects2));

  // click next
  await page.evaluate(() => {
    const btns=[...document.querySelectorAll('button')].filter(b=>/next|continue|التالي|متابعة/i.test((b.textContent||'').trim()) && !b.disabled);
    if (btns.length){ const b=btns[0]; b.scrollIntoView(); const r=b.getBoundingClientRect(); window.__c={x:r.x+r.width/2,y:r.y+r.height/2}; }
  });
  const coord = await page.evaluate(()=>window.__c||null);
  if (coord) { await page.mouse.click(coord.x, coord.y); console.log('[click] next'); }
  await sleep(8000);
  console.log('url after next:', page.url());
  const bodyText2 = await page.evaluate(() => document.body?.innerText || '').catch(()=>'');
  console.log('BODY2:', bodyText2.substring(0, 1500));
} catch(e) {
  console.error('ERR', e.message);
} finally {
  writeFileSync('debug-wizard-live.json', JSON.stringify(capture, null, 2), 'utf-8');
  console.log('[written] debug-wizard-live.json', capture.length, 'events');
  await browser.close().catch(()=>{});
}
