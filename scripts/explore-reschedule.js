/**
 * SVP Reschedule Wizard — Playwright Exploration Script
 * 
 * PURPOSE: Captures the exact DOM structure, API calls, and wizard steps
 * of the SVP reschedule flow. Run this FIRST to get real data.
 * 
 * USAGE:
 *   node scripts/explore-reschedule.js [reservationId]
 * 
 * This will:
 *   1. Open a visible browser window
 *   2. Navigate to SVP login page
 *   3. Wait for you to login manually (phone + OTP)
 *   4. Save login state for future use
 *   5. Navigate to the reschedule wizard
 *   6. Capture EVERY step (DOM, API, screenshots)
 *   7. Output a JSON file with full wizard structure
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SVP_BASE = 'https://svp-international.pacc.sa';
const SVP_API = 'https://svp-international-api.pacc.sa/api/v1';
const STATE_FILE = path.join(__dirname, '..', 'svp-playwright-state.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'exploration-output');

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function capturePageState(page, stepName) {
  const state = await page.evaluate(() => {
    const getSelectInfo = () => [...document.querySelectorAll('select')].map((s, i) => ({
      index: i,
      id: s.id || null,
      name: s.name || null,
      className: s.className || null,
      disabled: s.disabled,
      selectedIndex: s.selectedIndex,
      options: [...s.options].map(o => ({
        value: o.value,
        text: o.text.trim(),
        selected: o.selected
      }))
    }));

    const getButtonInfo = () => [...document.querySelectorAll('button')].map((b, i) => ({
      index: i,
      text: b.textContent.trim().substring(0, 100),
      disabled: b.disabled,
      visible: b.offsetParent !== null,
      type: b.type,
      className: b.className?.substring(0, 100) || null,
      id: b.id || null
    }));

    const getInputInfo = () => [...document.querySelectorAll('input')].map((inp, i) => ({
      index: i,
      type: inp.type,
      name: inp.name || null,
      id: inp.id || null,
      placeholder: inp.placeholder || null,
      value: inp.value,
      checked: inp.type === 'checkbox' ? inp.checked : undefined,
      className: inp.className?.substring(0, 100) || null
    }));

    const getRadioInfo = () => [...document.querySelectorAll('input[type="radio"]')].map((r, i) => ({
      index: i,
      name: r.name,
      value: r.value,
      checked: r.checked,
      id: r.id || null,
      label: r.closest('label')?.textContent?.trim() || r.nextElementSibling?.textContent?.trim() || ''
    }));

    const getLinkInfo = () => [...document.querySelectorAll('a')].filter(a => a.offsetParent !== null).map((a, i) => ({
      index: i,
      text: a.textContent.trim().substring(0, 80),
      href: a.href
    })).slice(0, 30);

    const getDivButtonInfo = () => [...document.querySelectorAll('[role="button"], [onclick], [class*="btn"], [class*="button"]')].map((el, i) => ({
      index: i,
      tag: el.tagName,
      text: el.textContent.trim().substring(0, 80),
      className: el.className?.substring(0, 100) || null,
      visible: el.offsetParent !== null
    })).filter(el => el.visible).slice(0, 20);

    const getVueAppInfo = () => {
      const app = document.querySelector('#app') || document.querySelector('[data-v-app]');
      if (!app) return null;
      return {
        id: app.id || null,
        dataAttrs: Object.keys(app.dataset || {}),
        childCount: app.children.length,
        hasVueInstance: !!app.__vue_app__ || !!app.__vue__
      };
    };

    const getWizardSteps = () => {
      const steps = document.querySelectorAll('[class*="step"], [class*="wizard"], [class*="stepper"], [class*="progress"], ol li, .steps li');
      return [...steps].map((s, i) => ({
        index: i,
        text: s.textContent.trim().substring(0, 100),
        className: s.className?.substring(0, 100) || null,
        active: s.classList.contains('active') || s.classList.contains('current') || s.getAttribute('aria-current') === 'step'
      })).slice(0, 10);
    };

    return {
      url: location.href,
      title: document.title,
      selects: getSelectInfo(),
      buttons: getButtonInfo(),
      inputs: getInputInfo(),
      radios: getRadioInfo(),
      links: getLinkInfo(),
      divButtons: getDivButtonInfo(),
      vueApp: getVueAppInfo(),
      wizardSteps: getWizardSteps(),
      bodyText: document.body?.innerText?.substring(0, 3000) || '',
      htmlSnippet: document.body?.innerHTML?.substring(0, 5000) || ''
    };
  });

  state.stepName = stepName;
  state.timestamp = new Date().toISOString();

  // Take screenshot
  const screenshotPath = path.join(OUTPUT_DIR, `${stepName}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });
  state.screenshot = screenshotPath;

  return state;
}

async function clickByText(page, texts, options = {}) {
  const { timeout = 5000 } = options;
  for (const text of texts) {
    try {
      // Try multiple selector strategies
      const strategies = [
        `button:has-text("${text}")`,
        `a:has-text("${text}")`,
        `[role="button"]:has-text("${text}")`,
        `label:has-text("${text}")`,
      ];

      for (const selector of strategies) {
        try {
          const el = await page.waitForSelector(selector, { timeout: 2000, state: 'visible' });
          if (el) {
            await el.scrollIntoViewIfNeeded();
            await el.click();
            console.log(`[EXPLORE] Clicked "${text}" via selector: ${selector}`);
            return { found: true, text, selector };
          }
        } catch {}
      }

      // Fallback: evaluate-based click
      const result = await page.evaluate((t) => {
        const all = [...document.querySelectorAll('button, a, [role="button"], label, span, div')];
        for (const el of all) {
          const txt = (el.textContent || '').trim();
          if (txt.toLowerCase().includes(t.toLowerCase()) && !el.disabled && el.offsetParent !== null) {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, text: txt.substring(0, 50) };
            }
          }
        }
        return null;
      }, text);

      if (result) {
        await page.mouse.click(result.x, result.y);
        console.log(`[EXPLORE] Clicked "${result.text}" at (${Math.round(result.x)}, ${Math.round(result.y)})`);
        return { found: true, text: result.text, method: 'coordinates' };
      }
    } catch (e) {
      console.log(`[EXPLORE] Strategy failed for "${text}": ${e.message}`);
    }
  }
  return { found: false };
}

async function selectFromDropdown(page, searchTexts, selectIndex = -1) {
  const selectInfo = await page.evaluate((idx) => {
    const selects = [...document.querySelectorAll('select')];
    if (idx >= 0 && idx < selects.length) {
      return [{ index: idx, options: [...selects[idx].options].map(o => ({ v: o.value, t: o.text.trim() })) }];
    }
    return selects.map((s, i) => ({
      index: i,
      id: s.id,
      name: s.name,
      disabled: s.disabled,
      options: [...s.options].map(o => ({ v: o.value, t: o.text.trim() }))
    }));
  }, selectIndex);

  for (const sel of selectInfo) {
    if (sel.disabled) continue;
    for (const searchText of searchTexts) {
      const match = sel.options.find(o => o.t.toLowerCase().includes(searchText.toLowerCase()));
      if (match) {
        const selector = sel.id ? `#${sel.id}` : `select:nth-of-type(${sel.index + 1})`;
        await page.selectOption(selector, match.v);
        console.log(`[EXPLORE] Selected "${match.t}" (value="${match.v}") in select #${sel.index}`);
        return { found: true, text: match.t, value: match.v, selectIndex: sel.index };
      }
    }
  }
  return { found: false, selects: selectInfo };
}

async function main() {
  await ensureOutputDir();
  const reservationId = process.argv[2] || '';

  console.log('=== SVP Reschedule Wizard Explorer ===');
  console.log(`Reservation ID: ${reservationId || '(not provided - will explore login only)'}`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--window-size=1280,900'
    ]
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  const allSteps = [];
  const apiCalls = [];

  // Capture all API calls
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api')) {
      const entry = {
        url: url,
        method: response.request().method(),
        status: response.status(),
        timestamp: new Date().toISOString()
      };
      try {
        entry.body = await response.text();
        if (entry.body.length > 2000) entry.body = entry.body.substring(0, 2000) + '...[truncated]';
      } catch {}
      try {
        entry.requestBody = response.request().postData()?.substring(0, 1000) || null;
      } catch {}
      apiCalls.push(entry);
      console.log(`[API] ${entry.method} ${entry.status} ${url.replace(SVP_API + '/', '')}`);
    }
  });

  // Capture all console logs from the page
  page.on('console', (msg) => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  try {
    // STEP 1: Navigate to login
    console.log('\n--- STEP 1: Navigate to Login ---');
    await page.goto(`${SVP_BASE}/auth/login?role=labor`, { waitUntil: 'networkidle', timeout: 30000 });
    const loginState = await capturePageState(page, '01-login');
    allSteps.push(loginState);
    console.log('Login page loaded. Please login manually in the browser window.');
    console.log('Waiting for you to complete login (timeout: 5 minutes)...');

    // Wait for login to complete (detect redirect away from /auth/)
    const loginStart = Date.now();
    const loginTimeout = 5 * 60 * 1000;
    let loggedIn = false;

    while (Date.now() - loginStart < loginTimeout) {
      const currentUrl = page.url();
      if (!currentUrl.includes('/auth/') && currentUrl.includes('svp-international')) {
        loggedIn = true;
        console.log(`Login detected! Current URL: ${currentUrl}`);
        break;
      }
      await page.waitForTimeout(2000);
    }

    if (!loggedIn) {
      console.log('Login timed out. Saving what we have...');
    }

    // Save auth state
    const storageState = await context.storageState();
    fs.writeFileSync(STATE_FILE, JSON.stringify(storageState, null, 2));
    console.log(`Auth state saved to: ${STATE_FILE}`);

    // Capture post-login state
    await page.waitForTimeout(3000);
    const postLoginState = await capturePageState(page, '02-post-login');
    allSteps.push(postLoginState);

    // Try to extract token from page
    const token = await page.evaluate(() => {
      for (const key of ['auth_token', 'token', 'access_token', 'vue-auth.token', 'svp_token']) {
        const val = localStorage.getItem(key);
        if (val) return val;
      }
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        const v = localStorage.getItem(k);
        if (v && v.split('.').length === 3) return v;
      }
      return null;
    });

    if (token) {
      console.log(`Token extracted: ${token.substring(0, 50)}...`);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'token.txt'), token);
    }

    // STEP 2: Navigate to exam sessions to find reservation IDs
    console.log('\n--- STEP 2: Fetch Exam Reservations ---');
    if (token) {
      const reservationsResult = await page.evaluate(async (apiBase) => {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
        try {
          const res = await fetch(`${apiBase}/individual_labor_space/exam_reservations?country_id=78`, {
            headers: {
              'Accept': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          return { status: res.status, body: await res.text() };
        } catch (e) {
          return { error: e.message };
        }
      }, SVP_API);

      console.log('Reservations response:', JSON.stringify(reservationsResult).substring(0, 500));
      fs.writeFileSync(path.join(OUTPUT_DIR, 'reservations.json'), JSON.stringify(reservationsResult, null, 2));

      // Parse to find reschedulable reservations
      try {
        const data = JSON.parse(reservationsResult.body);
        const reservations = data.exam_reservations || data.data || data.results || [];
        console.log(`Found ${reservations.length} reservations`);

        for (const r of reservations) {
          const canReschedule = r.can_be_rescheduled !== false;
          console.log(`  - ID: ${r.id}, Status: ${r.reservation_status}, Can Reschedule: ${canReschedule}`);
          console.log(`    Category: ${r.category?.english_name || r.occupation?.english_name || 'N/A'}`);
          console.log(`    Center: ${r.test_center?.test_center_name || 'N/A'}`);
          console.log(`    Date: ${r.exam_session?.test_date || 'N/A'}`);
        }
      } catch {}
    }

    // STEP 3: Navigate to reschedule wizard
    if (reservationId) {
      console.log(`\n--- STEP 3: Navigate to Reschedule Wizard (ID: ${reservationId}) ---`);
      const rescheduleUrl = `${SVP_BASE}/labor/reschedule/steps?reservationId=${reservationId}`;
      await page.goto(rescheduleUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(5000);

      // Capture initial wizard state
      let wizardState = await capturePageState(page, '03-wizard-initial');
      allSteps.push(wizardState);
      console.log('\n=== WIZARD INITIAL STATE ===');
      console.log('URL:', wizardState.url);
      console.log('Selects:', JSON.stringify(wizardState.selects, null, 2));
      console.log('Buttons:', JSON.stringify(wizardState.buttons, null, 2));
      console.log('Inputs:', JSON.stringify(wizardState.inputs, null, 2));
      console.log('Radios:', JSON.stringify(wizardState.radios, null, 2));
      console.log('Wizard Steps:', JSON.stringify(wizardState.wizardSteps, null, 2));
      console.log('Body Text (first 1000):', wizardState.bodyText.substring(0, 1000));

      // STEP 4: Walk through wizard steps
      let stepNum = 4;
      let maxSteps = 10; // safety limit

      for (let attempt = 0; attempt < maxSteps; attempt++) {
        console.log(`\n--- Attempt ${attempt + 1}: Looking for next action ---`);

        // Log current state
        const currentState = await page.evaluate(() => ({
          selects: [...document.querySelectorAll('select')].map((s, i) => ({
            index: i,
            id: s.id,
            name: s.name,
            disabled: s.disabled,
            optionCount: s.options.length,
            selectedText: s.options[s.selectedIndex]?.text?.trim(),
            options: [...s.options].slice(0, 15).map(o => o.text.trim())
          })),
          buttons: [...document.querySelectorAll('button')].map((b, i) => ({
            index: i,
            text: b.textContent.trim().substring(0, 50),
            disabled: b.disabled,
            visible: b.offsetParent !== null
          })).filter(b => b.visible),
          checkboxes: [...document.querySelectorAll('input[type="checkbox"]')].map((c, i) => ({
            index: i,
            checked: c.checked,
            id: c.id,
            label: c.closest('label')?.textContent?.trim()?.substring(0, 50) || ''
          })),
          url: location.href,
          bodyText: document.body?.innerText?.substring(0, 1500)
        }));

        console.log('Current URL:', currentState.url);
        console.log('Selects:', JSON.stringify(currentState.selects, null, 2));
        console.log('Buttons:', JSON.stringify(currentState.buttons, null, 2));
        console.log('Checkboxes:', JSON.stringify(currentState.checkboxes, null, 2));

        // Check if we see a success/confirmation page
        const bodyLower = (currentState.bodyText || '').toLowerCase();
        if (bodyLower.includes('success') || bodyLower.includes('rescheduled successfully') || bodyLower.includes('confirmed')) {
          console.log('\n=== SUCCESS PAGE DETECTED ===');
          const successState = await capturePageState(page, `${stepNum}-success`);
          allSteps.push(successState);
          break;
        }

        // Strategy 1: Try to find and select from dropdowns
        const unselectedSelects = currentState.selects.filter(s => !s.disabled && s.optionCount > 1);
        if (unselectedSelects.length > 0) {
          for (const sel of unselectedSelects) {
            if (sel.selectedText && sel.selectedText !== '-- Select' && sel.selectedText !== '') {
              console.log(`Select #${sel.index} already has: "${sel.selectedText}"`);
              continue;
            }
            // Try to auto-select first non-empty option
            const opts = sel.options.filter(o => o !== '-- Select' && o !== '' && !o.includes('Select'));
            if (opts.length > 0) {
              console.log(`Auto-selecting first option in select #${sel.index}: "${opts[0]}"`);
              // We'll just note this - the user should select manually during exploration
            }
          }
          console.log('\n>> Please SELECT values in the dropdowns above, then press Enter in the console.');
          console.log('>> Or type "auto" to auto-select first available option.');
          // For automated exploration, we'll try auto-selecting
          for (const sel of unselectedSelects) {
            if (!sel.selectedText || sel.selectedText === '-- Select' || sel.selectedText === '') {
              const firstValid = sel.options.find(o => o !== '-- Select' && o !== '' && !o.includes('Select'));
              if (firstValid) {
                const selector = sel.id ? `#${sel.id}` : `select >> nth=${sel.index}`;
                try {
                  await page.selectOption(selector.includes('#') ? selector : `select >> nth=${sel.index}`, { label: firstValid });
                  console.log(`Auto-selected "${firstValid}" in select #${sel.index}`);
                  await page.waitForTimeout(2000);
                } catch (e) {
                  console.log(`Auto-select failed: ${e.message}`);
                }
              }
            }
          }
        }

        // Strategy 2: Check for checkboxes
        const uncheckedBoxes = currentState.checkboxes.filter(c => !c.checked);
        if (uncheckedBoxes.length > 0) {
          for (const cb of uncheckedBoxes) {
            console.log(`Checking checkbox: "${cb.label || cb.id || cb.index}"`);
            await page.evaluate((idx) => {
              const cbs = document.querySelectorAll('input[type="checkbox"]');
              if (cbs[idx] && !cbs[idx].checked) {
                cbs[idx].click();
              }
            }, cb.index);
            await page.waitForTimeout(1000);
          }
        }

        // Strategy 3: Try to click Next/Continue/Proceed
        const clickResult = await clickByText(page, ['Next', 'Continue', 'Proceed', 'next', 'continue']);
        if (clickResult.found) {
          console.log(`Clicked: "${clickResult.text}"`);
          await page.waitForTimeout(5000);
          const newState = await capturePageState(page, `${stepNum}-${clickResult.text.toLowerCase().replace(/\s+/g, '-')}`);
          allSteps.push(newState);
          stepNum++;
          continue;
        }

        // Strategy 4: Try to click Confirm/Submit
        const confirmResult = await clickByText(page, ['Confirm', 'Submit', 'Yes', 'OK', 'confirm', 'submit']);
        if (confirmResult.found) {
          console.log(`Clicked confirm: "${confirmResult.text}"`);
          await page.waitForTimeout(5000);
          const confirmState = await capturePageState(page, `${stepNum}-confirm`);
          allSteps.push(confirmState);

          // Wait for API response
          console.log('Waiting for API response (25s)...');
          await page.waitForTimeout(25000);
          const finalState = await capturePageState(page, `${stepNum + 1}-final`);
          allSteps.push(finalState);
          break;
        }

        // Strategy 5: Try calendar date selection
        const dateClicked = await page.evaluate(() => {
          const cells = [...document.querySelectorAll('td, [class*="calendar"], [class*="date"], button')];
          for (const cell of cells) {
            const text = cell.textContent.trim();
            const dayNum = parseInt(text, 10);
            if (dayNum >= 1 && dayNum <= 31 && !cell.disabled && cell.offsetParent !== null) {
              const classes = cell.className || '';
              if (!classes.includes('disabled') && !classes.includes('past') && !classes.includes('inactive')) {
                cell.click();
                return { day: dayNum, text };
              }
            }
          }
          return null;
        });

        if (dateClicked) {
          console.log(`Clicked date: ${dateClicked.day}`);
          await page.waitForTimeout(2000);
          const dateState = await capturePageState(page, `${stepNum}-date-selected`);
          allSteps.push(dateState);
          stepNum++;
          continue;
        }

        console.log('No actionable elements found. Taking screenshot and waiting...');
        await capturePageState(page, `${stepNum}-stuck`);
        await page.waitForTimeout(3000);
      }
    } else {
      console.log('\nNo reservation ID provided. Run with: node scripts/explore-reschedule.js <reservationId>');
      console.log('Saving exploration output...');
    }

    // Save all collected data
    const output = {
      timestamp: new Date().toISOString(),
      reservationId,
      totalSteps: allSteps.length,
      steps: allSteps,
      apiCalls: apiCalls
    };

    const outputPath = path.join(OUTPUT_DIR, 'exploration-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    console.log(`\n=== EXPLORATION COMPLETE ===`);
    console.log(`Output saved to: ${outputPath}`);
    console.log(`Screenshots saved to: ${OUTPUT_DIR}/`);
    console.log(`Total API calls captured: ${apiCalls.length}`);
    console.log(`Total wizard steps captured: ${allSteps.length}`);

    // Print summary of API calls
    console.log('\n=== API CALLS SUMMARY ===');
    for (const call of apiCalls) {
      console.log(`${call.method} ${call.status} ${call.url.replace(SVP_API + '/', '')}`);
      if (call.requestBody) {
        console.log(`  Body: ${call.requestBody.substring(0, 200)}`);
      }
    }

  } catch (error) {
    console.error('Exploration error:', error.message);
    await capturePageState(page, 'error').catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
