const { chromium } = require('playwright');

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const urls = [];
  page.on('request', (req) => { urls.push(req.method() + ' ' + req.url()); });
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERR:', msg.text().substring(0, 200)); });
  page.on('pageerror', (err) => console.log('PAGE ERROR:', String(err).substring(0, 200)));

  await page.goto('https://svp-international.pacc.sa/labor/reschedule/steps?reservationId=4878771', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(8000);
  console.log('URL:', page.url());
  console.log('=== JS CHUNKS LOADED ===');
  urls.filter(u => u.includes('.js')).forEach(u => console.log(u));
  console.log('=== TOTAL REQUESTS: ' + urls.length + ' ===');
  await browser.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
