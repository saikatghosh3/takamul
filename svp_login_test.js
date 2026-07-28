const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  const calls = [];
  page.on('response', async r => {
    if (r.url().includes('svp-international-api')) {
      let body = '';
      try { body = (await r.text()).substring(0, 500); } catch {}
      calls.push({ url: r.url(), status: r.status(), body });
    }
  });
  await page.goto('https://svp-international.pacc.sa/auth/login?role=labor', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  
  await page.type('input[placeholder="Enter your email"]', 'test@test.com');
  await page.type('input[type="password"]', 'Test12345!');
  
  const btn = await page.evaluateHandle(() => {
    return Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sign in'));
  });
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 5000));
  
  console.log('After login attempt:');
  const content = await page.evaluate(() => document.body.innerText.substring(0, 2000));
  console.log(content);
  console.log('\nAPI calls:');
  for (const c of calls) {
    console.log('[' + c.status + '] ' + c.url);
    if (c.body) console.log('  Body: ' + c.body.substring(0, 300));
  }
  await browser.close();
})();
