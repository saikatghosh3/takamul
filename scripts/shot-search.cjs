const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('PAGE-ERROR:', msg.text());
  });
  page.on('pageerror', (err) => console.log('PAGE-EXCEPTION:', err.message));

  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 60000 });
  } catch (e) {
    console.log('goto error:', e.message);
  }
  await page.waitForTimeout(2000);

  const url = page.url();
  console.log('URL after load:', url);

  if (url.includes('/admin')) {
    await page.fill('input[name="email"], input[type="email"], input[placeholder*="mail"], input[placeholder*="Email"]', 'admin@gmail.com').catch(() => {});
    await page.fill('input[type="password"]', 'admin@12333').catch(() => {});
    // fallback: find text inputs
    const inputs = page.locator('input');
    const count = await inputs.count();
    for (let i = 0; i < count; i++) {
      const type = await inputs.nth(i).getAttribute('type');
      if (type !== 'password') {
        const val = await inputs.nth(i).inputValue().catch(() => '');
        if (!val) await inputs.nth(i).fill('admin@gmail.com').catch(() => {});
      }
    }
    await page.locator('button[type="submit"], button:has-text("Login"), button:has-text("Sign in")').first().click().catch(() => {});
    await page.waitForTimeout(2500);
    console.log('URL after admin login:', page.url());
  }

  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'C:\\Users\\HP\\AppData\\Local\\Temp\\opencode\\search1.png', fullPage: true });

  // try to interact: select a category
  const catInput = page.locator('input[placeholder*="Search categories"]').first();
  const catCount = await catInput.count();
  console.log('category input count:', catCount);
  if (catCount > 0) {
    await catInput.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'C:\\Users\\HP\\AppData\\Local\\Temp\\opencode\\search2.png', fullPage: true });
    const opts = page.locator('text=No categories found');
    const noCat = await opts.count();
    console.log('No categories found shown:', noCat > 0);
  }

  await browser.close();
})().catch(e => { console.log('SCRIPT ERROR:', e); process.exit(1); });
