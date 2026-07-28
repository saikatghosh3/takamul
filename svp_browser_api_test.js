const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');

  const apiCalls = [];
  page.on('response', async r => {
    if (r.url().includes('svp-international-api')) {
      let body = '';
      try { body = (await r.text()).substring(0, 1000); } catch {}
      apiCalls.push({ url: r.url(), status: r.status(), body });
    }
  });

  await page.goto('https://svp-international.pacc.sa/', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  // Try making the API call directly from browser context (bypasses WAF)
  const result = await page.evaluate(async () => {
    try {
      // Try the available_dates endpoint without auth
      const res1 = await fetch('https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_sessions/available_dates?category_id=1&country_id=78', {
        headers: { 'Accept': 'application/json' }
      });
      const data1 = await res1.text();

      // Try with visitor_space
      const res2 = await fetch('https://svp-international-api.pacc.sa/api/v1/visitor_space/exam_sessions/available_dates?category_id=1&country_id=78', {
        headers: { 'Accept': 'application/json' }
      });
      const data2 = await res2.text();

      // Try the cities endpoint
      const res3 = await fetch('https://svp-international-api.pacc.sa/api/v1/individual_labor_space/test_centers/cities?category_id=1&country_id=78', {
        headers: { 'Accept': 'application/json' }
      });
      const data3 = await res3.text();

      return { 
        individual_dates: data1.substring(0, 500),
        visitor_dates: data2.substring(0, 500),
        cities: data3.substring(0, 500)
      };
    } catch(e) {
      return { error: e.message };
    }
  });

  console.log('Browser context API results:', JSON.stringify(result, null, 2));
  await browser.close();
})();
