const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-web-security'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  console.log('1. Navigating to SPA...');
  await page.goto('https://svp-international.pacc.sa/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));

  const pageUrl = page.url();
  console.log('Current URL:', pageUrl);

  // Take screenshot to see what we have
  await page.screenshot({ path: 'svp_page1.png' });

  // Check if we're on login page or main page
  const html = await page.content();
  const hasLoginForm = html.includes('login') || html.includes('phone') || html.includes('OTP') || html.includes('recaptcha');
  console.log('Has login elements:', hasLoginForm);

  // Try to find the phone input
  const phoneInput = await page.$('input[type="tel"], input[placeholder*="phone"], input[placeholder*="Phone"], input[name*="phone"]');
  console.log('Phone input found:', !!phoneInput);

  // Check for recaptcha iframe
  const recaptchaFrame = await page.$('iframe[src*="recaptcha"]');
  console.log('Recaptcha iframe found:', !!recaptchaFrame);

  // Try intercepting OTP endpoint - call it directly with bypassed WAF
  console.log('\n2. Trying direct API call from page context with CORS disabled...');
  const result = await page.evaluate(async () => {
    const results = {};
    
    // Try calling the OTP endpoint directly
    try {
      const res = await fetch('https://svp-international-api.pacc.sa/api/v1/sessions/otp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Origin': 'https://svp-international.pacc.sa',
          'Referer': 'https://svp-international.pacc.sa/'
        },
        body: JSON.stringify({ phone_number: '+8801983416954', recaptcha: '' })
      });
      results.otp = { status: res.status, body: await res.text() };
    } catch(e) { results.otp = { error: e.message }; }

    // Try available dates without auth
    try {
      const res = await fetch('https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_sessions/available_dates?category_id=1&country_id=78', {
        headers: { 'Accept': 'application/json', 'Origin': 'https://svp-international.pacc.sa' }
      });
      results.dates = { status: res.status, body: (await res.text()).substring(0, 500) };
    } catch(e) { results.dates = { error: e.message }; }

    // Try cities
    try {
      const res = await fetch('https://svp-international-api.pacc.sa/api/v1/individual_labor_space/test_centers/cities?category_id=1&country_id=78', {
        headers: { 'Accept': 'application/json', 'Origin': 'https://svp-international.pacc.sa' }
      });
      results.cities = { status: res.status, body: (await res.text()).substring(0, 500) };
    } catch(e) { results.cities = { error: e.message }; }

    return results;
  });

  console.log('Results:', JSON.stringify(result, null, 2));
  
  // Check for any intercepted network requests
  const apiCalls = [];
  page.on('response', async r => {
    if (r.url().includes('svp-international-api')) {
      let body = '';
      try { body = (await r.text()).substring(0, 300); } catch {}
      apiCalls.push({ url: r.url().replace('https://svp-international-api.pacc.sa/api/v1/', ''), status: r.status(), body });
    }
  });

  // Try the SPA's own internal API calls
  console.log('\n3. Trying to trigger SPA internal calls via navigation...');
  
  // Check if there's a way to access test_centers from visitor_space
  try {
    const resp = await page.evaluate(async () => {
      const r = await fetch('https://svp-international-api.pacc.sa/api/v1/visitor_space/test_centers?country_id=78&category_id=1&per_page=100');
      return { status: r.status, body: (await r.text()).substring(0, 500) };
    });
    console.log('visitor_space test_centers with category_id=1:', JSON.stringify(resp, null, 2));
  } catch(e) { console.log('Error:', e.message); }

  await browser.close();
})();
