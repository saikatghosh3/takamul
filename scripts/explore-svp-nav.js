const { chromium } = require('playwright');
const fs = require('fs');

const SVP_BASE = 'https://svp-international.pacc.sa';
const STATE_FILE = require('path').join(__dirname, '..', 'svp-playwright-state.json');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1280, height: 900 }
  });

  // Load token
  const token = JSON.parse(fs.readFileSync('.svp-token.json', 'utf-8')).token;
  
  // Inject token
  await context.addInitScript((t) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    delete navigator.__proto__.webdriver;
    try {
      localStorage.setItem('auth_token', t);
      localStorage.setItem('token', t);
      localStorage.setItem('access_token', t);
      localStorage.setItem('vue-auth.token', t);
      localStorage.setItem('svp_token', t);
    } catch {}
  }, token);

  const page = await context.newPage();
  
  // Capture API calls
  const apiCalls = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api') && !url.includes('care.')) {
      const status = response.status();
      const method = response.request().method();
      let body = null;
      try { body = await response.text(); } catch {}
      const entry = { url, method, status, bodyLength: body ? body.length : 0 };
      
      // Check for time info
      if (body) {
        for (const field of ['test_time', 'start_time', 'start_at', 'time_slot']) {
          if (body.includes(`"${field}"`)) {
            entry.hasTime = true;
            entry.timeField = field;
            entry.bodySnippet = body.substring(0, 800);
            break;
          }
        }
      }
      
      apiCalls.push(entry);
      console.log(`[API] ${method} ${status} ${url.replace('https://svp-international-api.pacc.sa', '')} ${entry.hasTime ? '<<< HAS TIME' : ''}`);
    }
  });

  // Navigate to home
  console.log('=== Navigate to home ===');
  await page.goto(`${SVP_BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);
  console.log(`URL: ${page.url()}`);
  
  // Get all links and interactive elements
  const pageInfo = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].map(a => ({
      href: a.href,
      text: a.textContent.trim().substring(0, 80)
    })).filter(a => a.href && !a.href.startsWith('javascript'));
    
    const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).map(b => ({
      text: b.textContent.trim().substring(0, 60),
      className: (b.className || '').substring(0, 80),
      onclick: (b.getAttribute('onclick') || '').substring(0, 100)
    }));
    
    // Look for Vue Router links / navigation items
    const navItems = [...document.querySelectorAll('[class*=\"menu\"] a, [class*=\"nav\"] a, li a, [class*=\"sidebar\"] a')].map(a => ({
      href: a.href,
      text: a.textContent.trim().substring(0, 80)
    }));
    
    return { links, buttons, navItems, bodyText: document.body.innerText.substring(0, 2000) };
  });
  
  console.log('\n=== ALL LINKS ===');
  for (const l of pageInfo.links) {
    console.log(`  "${l.text}" => ${l.href}`);
  }
  
  console.log('\n=== VISIBLE BUTTONS ===');
  for (const b of pageInfo.buttons) {
    console.log(`  "${b.text}" class=${b.className.substring(0, 60)}`);
  }
  
  console.log('\n=== NAV ITEMS ===');
  for (const n of pageInfo.navItems) {
    console.log(`  "${n.text}" => ${n.href}`);
  }
  
  console.log('\n=== PAGE TEXT (first 1000) ===');
  console.log(pageInfo.bodyText.substring(0, 1000));

  // Try clicking 'Join the program' or similar button to get to booking
  console.log('\n=== Clicking first major button ===');
  const clickResult = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && b.textContent.trim());
    for (const b of buttons) {
      const txt = b.textContent.trim().toLowerCase();
      if (txt.includes('join') || txt.includes('book') || txt.includes('exam') || txt.includes('apply') || txt.includes('start')) {
        b.click();
        return { clicked: txt.substring(0, 50), className: b.className.substring(0, 60) };
      }
    }
    // Try the first visible non-empty button
    for (const b of buttons) {
      if (b.textContent.trim()) {
        b.click();
        return { clicked: b.textContent.trim().substring(0, 50) };
      }
    }
    return null;
  });
  console.log('Clicked:', JSON.stringify(clickResult));
  
  await page.waitForTimeout(5000);
  console.log(`New URL: ${page.url()}`);
  
  const newPageInfo = await page.evaluate(() => {
    const links = [...document.querySelectorAll('a')].map(a => ({
      href: a.href,
      text: a.textContent.trim().substring(0, 80)
    })).filter(a => a.href && !a.href.startsWith('javascript'));
    return { url: location.href, links, bodyText: document.body.innerText.substring(0, 1000) };
  });
  console.log('\n=== AFTER CLICK LINKS ===');
  for (const l of newPageInfo.links) {
    console.log(`  "${l.text}" => ${l.href}`);
  }
  console.log('\nBody:', newPageInfo.bodyText.substring(0, 500));
  
  // Print API call summary
  console.log('\n=== API CALLS SUMMARY ===');
  for (const a of apiCalls) {
    console.log(`${a.method} ${a.status} ${a.url.replace('https://svp-international-api.pacc.sa', '')} (${a.bodyLength}B)${a.hasTime ? ' <<< TIME: ' + a.timeField : ''}`);
    if (a.hasTime) {
      console.log('  BODY:', a.bodySnippet);
    }
  }
  
  // Save page HTML
  const html = await page.content();
  fs.writeFileSync('debug-svp-home.html', html);
  console.log('\nHTML saved to debug-svp-home.html');
  
  await browser.close();
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
