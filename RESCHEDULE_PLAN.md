# Rescheduling Implementation Plan — Playwright Automation

## Current State

### What Exists (Puppeteer-based)
- `src/lib/svp-auth.js:482-692` — `rescheduleViaSPA()` function using Puppeteer
- `src/app/api/exam/reschedule/route.js` — API route calling `rescheduleViaSPA()`
- `src/app/page.js:686-731` — Frontend reschedule UI (Category → City → Date → Confirm)

### Problems with Current Implementation
1. **Puppeteer is used but Playwright is installed** — dependency mismatch
2. **Reschedule wizard steps are incomplete** — current code does: City → Language → Date → Confirm
3. **The actual SVP wizard has more steps** — based on your observation: Occupation → Methodology → City → Language → Date → Confirm
4. **No center/time selection UI** — but SVP auto-assigns these, so we need to capture them from the response
5. **The current code only captures the API response** — it doesn't extract center/time details for display

---

## Playwright Plan — Full Rescheduling Flow

### Phase 1: Explore & Reverse-Engineer the SVP Reschedule Flow

**Goal:** Use Playwright to manually walk through the reschedule wizard and capture every step, API call, and DOM structure.

#### Step 1.1: Create a Playwright exploration script

```javascript
// File: scripts/explore-reschedule.js
// Purpose: Launch visible browser, login, navigate to reschedule, capture everything

const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1280,800']
  });
  const context = await browser.newContext({
    storageState: 'svp-auth-state.json'  // saved login state
  });
  const page = await context.newPage();

  // 1. Login and save state
  await page.goto('https://svp-international.pacc.sa/auth/login?role=labor');
  // ... manual login or inject token ...

  // 2. Navigate to reschedule wizard
  await page.goto('https://svp-international.pacc.sa/labor/reschedule/steps?reservationId=XXXXX');

  // 3. Screenshot every step
  await page.screenshot({ path: 'step-1-initial.png', fullPage: true });

  // 4. Log all API calls
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('svp-international-api')) {
      console.log(`[API] ${response.status()} ${url}`);
      try {
        const body = await response.text();
        console.log(`[API Body] ${body.substring(0, 500)}`);
      } catch {}
    }
  });

  // 5. Log all select elements, buttons, inputs at each step
  const logPageState = async (stepName) => {
    const state = await page.evaluate(() => {
      return {
        url: location.href,
        selects: [...document.querySelectorAll('select')].map((s, i) => ({
          index: i,
          id: s.id,
          name: s.name,
          options: [...s.options].map(o => ({ value: o.value, text: o.text.trim() }))
        })),
        buttons: [...document.querySelectorAll('button')].map((b, i) => ({
          index: i,
          text: b.textContent.trim().substring(0, 80),
          disabled: b.disabled,
          visible: b.offsetParent !== null
        })),
        inputs: [...document.querySelectorAll('input')].map((inp, i) => ({
          index: i,
          type: inp.type,
          name: inp.name,
          placeholder: inp.placeholder,
          value: inp.value
        })),
        checkboxes: [...document.querySelectorAll('input[type="checkbox"]')].map((c, i) => ({
          index: i,
          checked: c.checked,
          id: c.id,
          name: c.name
        })),
        pageText: document.body?.innerText?.substring(0, 2000)
      };
    });
    console.log(`\n=== ${stepName} ===`);
    console.log(JSON.stringify(state, null, 2));
    await page.screenshot({ path: `step-${stepName}.png`, fullPage: true });
    return state;
  };

  // Walk through each step, capturing state
  let state = await logPageState('initial');

  // Step 1: Click reschedule button
  // ... click logic based on state.buttons ...

  // Step 2: Select city
  // ... select from dropdown ...

  // Step 3: Select language
  // ... select from dropdown ...

  // Step 4: Click Next
  // ... click next button ...

  // Step 5: Select date
  // ... click calendar date ...

  // Step 6: Click Next
  // ... click next button ...

  // Step 7: Check declaration checkbox
  // ... check checkbox ...

  // Step 8: Click Confirm
  // ... click confirm button ...

  // Step 9: Capture final API response
  // ... wait for response ...

  await browser.close();
})();
```

#### Step 1.2: What to Capture at Each Step

For each wizard step, record:

| What | How |
|------|-----|
| URL | `page.url()` |
| Select elements | `document.querySelectorAll('select')` — options, values |
| Buttons | `document.querySelectorAll('button')` — text, disabled state |
| Inputs | `document.querySelectorAll('input')` — type, value |
| Checkboxes | `document.querySelectorAll('input[type="checkbox"]')` |
| Radio buttons | `document.querySelectorAll('input[type="radio"]')` |
| Page text | `document.body.innerText` (first 2000 chars) |
| API calls | Intercept with `page.on('response', ...)` |
| Screenshots | `page.screenshot()` for visual reference |

#### Step 1.3: Expected SVP Wizard Structure (Based on Your Description)

```
URL: /labor/reschedule/steps?reservationId=<ID>

STEP 1 — Occupation/Category:
  <select> with occupation options
  <button> "Next"

STEP 2 — Methodology:
  <select> with methodology options (Practical/Theory/Both)
  <button> "Next"

STEP 3 — City:
  <select> with city options
  <button> "Next"

STEP 4 — Language:
  <select> with language options
  <button> "Next"

STEP 5 — Date:
  <calendar component> or <select> with dates
  <button> "Next"

STEP 6 — Confirmation:
  <input type="checkbox"> "I declare..."
  <button> "Confirm"
  → Triggers POST to exam_reservations API
  → Response includes assigned center + time
```

---

### Phase 2: Build the Playwright Reschedule Module

**Goal:** Create a reusable Playwright-based reschedule function that replaces the Puppeteer one.

#### Step 2.1: Create `src/lib/svp-playwright.js`

```javascript
// Key functions to implement:

import { chromium } from 'playwright';

// 1. Launch persistent browser context
async function launchRescheduleBrowser() {
  const browser = await chromium.launch({
    headless: false,  // visible for debugging, switch to true for production
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    storageState: undefined,  // will inject token
    userAgent: 'Mozilla/5.0 ...',
    viewport: { width: 1280, height: 800 }
  });
  return { browser, context };
}

// 2. Inject auth token into browser context
async function injectToken(context, token) {
  await context.addCookies([{
    name: 'auth_token',
    value: token,
    domain: '.svp-international.pacc.sa',
    path: '/'
  }]);
  await context.addInitScript((t) => {
    localStorage.setItem('auth_token', t);
    localStorage.setItem('token', t);
  }, token);
}

// 3. Navigate to reschedule wizard
async function navigateToReschedule(page, reservationId) {
  await page.goto(
    `https://svp-international.pacc.sa/labor/reschedule/steps?reservationId=${reservationId}`,
    { waitUntil: 'networkidle', timeout: 45000 }
  );
}

// 4. Walk through wizard steps
async function walkWizard(page, options) {
  const { city, language, date } = options;

  // Step 1: Occupation (already pre-filled from reservation)
  // Step 2: Methodology (may be pre-filled)
  // Step 3: City selection
  await selectDropdown(page, city);
  await clickNext(page);

  // Step 4: Language selection
  await selectDropdown(page, language);
  await clickNext(page);

  // Step 5: Date selection
  await selectDate(page, date);
  await clickNext(page);

  // Step 6: Declaration checkbox + Confirm
  await checkDeclaration(page);
  await clickConfirm(page);
}

// 5. Capture API response
async function captureResponse(page) {
  return new Promise((resolve) => {
    page.on('response', async (response) => {
      if (response.url().includes('exam_reservations') &&
          !response.url().includes('available')) {
        const body = await response.json().catch(() => null);
        resolve({ status: response.status(), data: body });
      }
    });
    // Timeout fallback
    setTimeout(() => resolve(null), 30000);
  });
}

// 6. Extract center + time from response
function extractCenterInfo(apiResponse) {
  if (!apiResponse?.data) return null;
  const reservation = apiResponse.data.exam_reservation || apiResponse.data;
  return {
    centerName: reservation.test_center?.test_center_name,
    centerCity: reservation.test_center?.test_center_city,
    centerAddress: reservation.test_center?.test_center_address,
    testDate: reservation.exam_session?.test_date,
    testTime: reservation.exam_session?.test_time,
    status: reservation.reservation_status
  };
}
```

#### Step 2.2: Helper Functions

```javascript
// Dropdown selection by visible text
async function selectDropdown(page, searchText) {
  const selects = await page.$$('select');
  for (const select of selects) {
    const options = await select.$$eval('option', opts =>
      opts.map(o => ({ value: o.value, text: o.text.trim() }))
    );
    const match = options.find(o =>
      o.text.toLowerCase().includes(searchText.toLowerCase())
    );
    if (match) {
      await select.selectOption(match.value);
      return true;
    }
  }
  return false;
}

// Click button by text
async function clickButton(page, texts) {
  for (const text of texts) {
    const button = await page.$(`button:has-text("${text}")`);
    if (button && await button.isEnabled()) {
      await button.click();
      return true;
    }
  }
  return false;
}

// Click Next
async function clickNext(page) {
  await page.waitForTimeout(2000);
  await clickButton(page, ['Next', 'Continue', 'Proceed']);
  await page.waitForTimeout(3000);
}

// Select date from calendar
async function selectDate(page, dateStr) {
  const [, , day] = dateStr.split('-');
  const dayNum = parseInt(day, 10);

  // Try clicking the day number in calendar
  const clicked = await page.evaluate((day) => {
    const elements = [...document.querySelectorAll('button, td, span, div')];
    for (const el of elements) {
      if (el.textContent.trim() === String(day) && el.offsetParent !== null) {
        el.click();
        return true;
      }
    }
    return false;
  }, dayNum);

  // Fallback: set date input
  if (!clicked) {
    await page.evaluate((d) => {
      const input = document.querySelector('input[type="date"]');
      if (input) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value'
        ).set;
        nativeSetter.call(input, d);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, dateStr);
  }
}

// Check declaration checkbox
async function checkDeclaration(page) {
  await page.evaluate(() => {
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (!cb.checked) cb.click();
    }
  });
}

// Click Confirm
async function clickConfirm(page) {
  await clickButton(page, ['Confirm', 'Submit', 'Yes', 'OK', 'Reschedule']);
}
```

---

### Phase 3: Integrate into the API Route

**Goal:** Replace the Puppeteer reschedule function with Playwright.

#### Step 3.1: Update `src/app/api/exam/reschedule/route.js`

```javascript
// Change import from Puppeteer to Playwright
import { rescheduleViaPlaywright } from '@/lib/svp-playwright';

// In the POST handler:
const spaResult = await rescheduleViaPlaywright(sessionId, newDate, categoryId);

// spaResult should contain:
// {
//   ok: true,
//   center: { name, city, address },
//   time: "09:00",
//   date: "2026-08-15",
//   status: "scheduled"
// }
```

#### Step 3.2: Update Response to Include Center Info

```javascript
// Return enriched response
return NextResponse.json({
  success: true,
  data: {
    message: 'Rescheduled successfully',
    center: {
      name: spaResult.center?.name,
      city: spaResult.center?.city,
      address: spaResult.center?.address
    },
    testDate: spaResult.date,
    testTime: spaResult.time,
    status: spaResult.status
  }
});
```

---

### Phase 4: Update Frontend to Display Center Info

**Goal:** Show the assigned center and time after rescheduling.

#### Step 4.1: Update `src/app/page.js`

After successful reschedule, display:
- New center name
- New center city
- New test date
- New test time
- New status

This goes in the `rescheduleResult` display area (around line 764).

---

### Phase 5: Token Management & Session Persistence

#### Step 5.1: Save Playwright browser state

```javascript
// After successful login, save storage state
const storageState = await context.storageState();
writeFileSync('svp-playwright-state.json', JSON.stringify(storageState));

// On subsequent runs, reuse saved state
const context = await browser.newContext({
  storageState: 'svp-playwright-state.json'
});
```

#### Step 5.2: Token injection strategy

Playwright's `addInitScript` runs before any page script:
```javascript
await context.addInitScript((token) => {
  localStorage.setItem('auth_token', token);
  localStorage.setItem('token', token);
  localStorage.setItem('access_token', token);
  localStorage.setItem('vue-auth.token', token);
  localStorage.setItem('svp_token', token);
}, currentToken);
```

---

## Execution Checklist

| # | Task | Status |
|---|------|--------|
| 1 | Run exploration script to capture all wizard steps | ⬜ |
| 2 | Document exact DOM structure at each step | ⬜ |
| 3 | Identify all API endpoints called during reschedule | ⬜ |
| 4 | Create `svp-playwright.js` module | ⬜ |
| 5 | Implement `rescheduleViaPlaywright()` function | ⬜ |
| 6 | Update API route to use Playwright | ⬜ |
| 7 | Test with real reservation ID | ⬜ |
| 8 | Extract center + time from response | ⬜ |
| 9 | Update frontend to show center info | ⬜ |
| 10 | Handle edge cases (auth expired, seat unavailable, etc.) | ⬜ |
| 11 | Add error handling and retry logic | ⬜ |
| 12 | Switch to headless mode for production | ⬜ |

---

## Key Differences: Puppeteer vs Playwright

| Aspect | Current (Puppeteer) | Planned (Playwright) |
|--------|---------------------|----------------------|
| Browser launch | `puppeteer.launch()` | `chromium.launch()` |
| Page evaluation | `page.evaluate()` | `page.evaluate()` |
| Click by text | Custom `clickByText()` | `page.$('button:has-text("...")')` |
| Select dropdown | Custom `selectByText()` | `page.selectOption()` |
| Response capture | `page.on('response')` | `page.on('response')` |
| Session persistence | Manual token injection | `context.storageState()` |
| Auto-wait | Manual `setTimeout` | Built-in auto-wait |
| Multi-tab | Manual | Native support |
| Speed | Slower | Faster (auto-wait) |

---

## API Response Structure (Expected After Reschedule)

```json
{
  "exam_reservation": {
    "id": 12345,
    "reservation_status": "scheduled",
    "category": {
      "id": 42,
      "english_name": "Electrician"
    },
    "exam_session": {
      "test_date": "2026-08-20",
      "test_time": "10:00",
      "methodology": "Practical"
    },
    "test_center": {
      "id": 789,
      "test_center_name": "Chattogram Technical Institute",
      "test_center_city": "Chattogram",
      "test_center_address": "456 Agrabad, Chattogram"
    },
    "can_be_rescheduled": true,
    "can_be_canceled": true,
    "updated_at": "2026-07-28T11:00:00Z"
  }
}
```

This response is captured from the network interception and used to confirm the reschedule was successful and to display the new center/time details.
