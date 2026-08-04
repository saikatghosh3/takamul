# Problems & Plan — Multi-User Support for PACC Scraper API

---

## 1. The Goal (from the owner)

- There is **one admin login** for the app. Only the admin manages users.
- Today: the admin has added **1 user** who is connected to SVPI (svp-international.pacc.sa).
- Goal: the admin will add **3 users**. Each user connects to **SVPI with their OWN login** (their own SVP account/session).
- The app will be **deployed** and the client will receive a **link** and work from it.
- Question to answer: how will the website behave with 3 users, and how should we handle it?

---

## 2. How the App Works Today (research findings from the codebase)

### 2.1 No real user system

- Admin auth is **hardcoded and client-side only**:
  - `src/app/admin/page.js:4` — `ADMIN_EMAIL = 'admin@gmail.com'`, `ADMIN_PASSWORD = 'admin@12333'`.
  - Login just sets `localStorage.setItem('pacc_admin_authed', 'true')` (admin/page.js:37).
  - The main page only checks that localStorage flag (`src/app/page.js:258`).
- There are **no staff accounts, no roles, no passwords stored on the server, no database**
  (no sqlite, prisma, mongoose, or any other DB anywhere in the repo).
- `src/app/api/auth/login|logout|status|profile` routes exist, but they authenticate against
  **SVP** (one global token), not against app users.

### 2.2 ONE global SVP token for the whole server

- `src/lib/svp-auth.js:9` — `authToken`, `tokenExpiry` are **module-level globals**.
- `src/lib/svp-auth.js:4` — token is persisted to a single file `.svp-token.json`.
- Every API call from **every client** uses the same token via `getToken()`.
- Consequences:
  - All clients share ONE SVP agency session.
  - `logout()` by one user logs out everyone.
  - When the token expires, everyone is logged out at once.

### 2.3 ONE shared browser (singletons, no locking)

- All browser automation uses **global singleton instances**:
  - `managedBrowser / managedContext / managedPage` — `src/lib/svp-playwright.js:29`
    (used by `browserFetch` → all reschedule / rebook / peek operations).
  - `apiBrowser / apiPage` — `src/lib/svp-auth.js:273` (old browserFetch path).
  - `authBrowser / authPage` — `src/lib/svp-auth.js:7` (interactive login + SPA reschedule/cancel).
- **There is no mutex, queue, or throttle anywhere.**
- `next start` runs a single Node process with one event loop, so all these globals are
  shared by every concurrent request.

### 2.4 No database for candidates / bookings

- Everything is live against the SVP portal. There is no local record of candidates,
  reservations, or audit history.
- `src/lib/takamol.js:6` — only an in-memory cache (`new Map()`) for API responses.

---

## 3. Will It Work With 3 Users, Each on Their Own SVP Login?

**NO — not with the current code.** Expected failures:

1. **Only ONE SVP token exists.** All 3 users would be forced to share one SVP account,
   which directly contradicts the requirement that each user has their own SVP login.
2. **Browser races.** If two users act at the same time:
   - Both call `ensureManagedBrowser()` (`svp-playwright.js:49`).
   - Because the browser launch is async, both see "not ready", both launch Chrome,
     the second overwrites the global variables, and the first request gets a torn-down
     page → `page.evaluate` fails or returns the **other user's result**.
3. **Login collisions.** A second user triggering login launches a second visible Chrome
   window and fights over the shared `authBrowser` global.
4. **No per-user identity.** There is no way for the server to know which user made a
   request, so per-user data / audit is impossible.

---

## 4. Will It Work With 3 PCs × 3 Clients (9 Users)?

**NO.** Same races as above (worse with more concurrency), plus:

1. **SVP rate limiting.** All 9 clients hit `svp-international-api.pacc.sa` from the same
   server IP (and same token). The portal responds with **429 / 529** under load. This is
   precisely why the code has a `browserFetch` workaround — direct Node fetches already
   get rate-limited.
2. **Long-held operations.** Reschedule / cancel / rebook hold the single browser page for
   many seconds. With 9 users, collisions are almost guaranteed.
3. **No horizontal scaling.** The token lives in memory + one file. Running 2 instances
   means each instance has its own token → users get "Not authenticated" unless you add
   sticky sessions or Redis.

---

## 5. CRITICAL: Vercel Will Not Run This App (Even For 1 User)

The deployment target was Vercel. This will **not work**, and the reason is a hard
incompatibility, not a configuration issue:

1. **Interactive login needs a real browser + a display + up to 5 minutes.**
   - `doLogin()` in `svp-playwright.js:169` launches a **visible** Chrome window
     (`headless: false`) and waits up to 5 minutes for manual OTP entry
     (svp-playwright.js:221-280).
   - Serverless functions have no display, no interactive session, and a hard execution
     time limit (default ~10s, max ~60s, up to ~300s only on higher plans with streaming).
   - The login will always time out / fail.
2. **Chromium is not reliably available on Vercel.**
   - Puppeteer/Playwright need a Chromium binary (~150–300 MB) at runtime.
   - Long-lived browser sessions (minutes) are not supported on serverless.
3. **The token file needs a writable persistent disk.**
   - `.svp-token.json` is written to disk (`svp-auth.js:4`, `svp-playwright.js:25`).
   - Vercel's filesystem is read-only except `/tmp`, which is wiped frequently.
   - Even the current single-user token storage breaks on Vercel.
4. **`process.on('SIGTERM'/'SIGINT')` handlers and module singletons assume a long-running
   process** (svp-playwright.js:619-620, svp-auth.js:778-779). Serverless has no such process.

**Conclusion:** To give the client a working link, the app must be deployed on a **VPS**
(a Linux or Windows server running the app as a long-lived process with PM2 or Docker).
The client still opens it with a normal URL — the link concept stays, just not on Vercel.

---

## 6. Recommended Architecture (What to Build)

### 6.1 Target layout

```
              Admin (app login)             Client 1 / 2 / 3 (app login)
                       │                            │
                       ▼                            ▼
              ┌───────────────────────────────────────────┐
              │    Next.js app on a VPS (long-running)    │
              │   - User accounts (admin creates users)   │
              │   - Server-side session cookies           │
              │   - Per-user SVP session manager          │
              │   - Operation queue / mutex               │
              │   - Audit log (who did what)              │
              └───────────────────┬───────────────────────┘
                                  │  SessionManager
                                  │  Map<userId, SvpUser>
              ┌───────────────────┼───────────────────┐
              ▼                   ▼                   ▼
      User 1 SVP           User 2 SVP           User 3 SVP
      token + context      token + context      token + context
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  ▼
                  svp-international-api.pacc.sa
```

### 6.2 Phase 1 — Concurrency-safe core (required, minimal change)

- Add an **in-process async mutex/queue** (a promise-chain lock) around every browser
  operation: `ensureManagedBrowser`, `browserFetch`, `getApiPage`,
  `ensureBrowserForSPA`, and `login`. Browser operations become atomic.
- Add a small **read-only page pool** (2–3 pages in one browser) so lookups
  (dates / centers / search) stay fast in parallel, while writes
  (reschedule / cancel / rebook) go through the strict queue.
- Add a **per-user request throttle** before SVP calls to reduce 429/529 responses.

### 6.3 Phase 2 — Real user accounts (required)

- Add a simple **user store** (SQLite or JSON file): id, username, password hash, role
  (`admin` / `staff`), status.
- Admin can **create / edit / delete users** (a user-management screen).
- Replace the localStorage admin check with a **server-side login + signed session cookie**,
  enforced by Next.js middleware on every API route and page.
- Every API route knows **who** is calling. Add an **audit log** (user, action, booking,
  timestamp, result).

### 6.4 Phase 3 — Per-user SVP sessions (required by the requirement)

- `SessionManager`: `Map<userId, { token, tokenExpiry, browserContext }>`.
- Each user gets their **own Playwright browserContext** (isolated cookies / storage /
  localStorage), so users never interfere with each other.
- A **mutex per user** so one user's own multiple tabs don't race.
- One **SVP login flow per user** (see section 7).
- When a user's SVP token expires, only that user must re-connect — others stay online.

### 6.5 What does NOT need to change

- The booking / reschedule / cancel / rebook UI and logic stay intact.
- The calendar, center search, and session picker components stay the same.
- `takamol.js` caching can stay (shared read cache is a feature, not a bug).

---

## 7. How Each User Connects to SVPI (login strategy — must be decided)

Because every SVP login needs manual OTP verification, pick one:

- **Option A (recommended, simplest):** Keep the existing interactive login per user.
  Admin goes to the user's row and clicks **"Connect SVP"**. On a desktop-VPS the Chrome
  window appears directly; on a headless Linux VPS use VNC/noVNC to see and complete the
  OTP login. The token is then stored per-user. (Similar to current `doLogin` flow in
  svp-playwright.js:169, but scoped to one user at a time.)
- **Option B (no server-side browser needed):** The user (or admin) logs into SVP in a
  normal browser on their own PC, copies the JWT from `localStorage` (the code already
  knows these keys — see `extractTokenFromStorage`, svp-auth.js:56), and pastes it into an
  **"Add SVP session"** form in the app. Simplest to build and to run on a headless VPS.
- **Option C (complex, not recommended now):** A remote-browser / browser-streaming
  service that renders the SVP login page in a web view. High effort, avoid unless needed.

---

## 8. What Will NOT Happen (honest limitations)

1. **It will not run on Vercel.** A VPS is mandatory. No workaround for the interactive
   browser login, Chromium availability, or the writable token file on serverless.
2. **No unlimited users per machine.** Each SVP browser context costs roughly 150–300 MB
   of RAM. 3 users are fine on a 2 GB VPS; plan **4 GB** for comfort. Idle contexts should
   be auto-closed after a timeout.
3. **No full parallelism.** SVP rate limits and the shared server IP mean operations must
   be **queued**. During busy booking windows, users will wait behind each other.
4. **No multi-instance scaling without Redis.** Tokens/sessions are in memory; if you later
   run more than one instance, you must move tokens/sessions to Redis and use sticky sessions.
5. **No silent token renewal.** When a user's SVP token expires, that user must re-run the
   connect flow. The other users stay unaffected (this is the benefit of per-user tokens).
6. **No per-user candidate database.** Today everything is live against SVP; there is no
   local candidate/booking storage. If users need to work on **separate** candidate data
   (rather than the same live SVP account data), a database must be added.
7. **SVP may flag multiple accounts from one IP.** Several distinct SVP logins coming from
   the same server IP can look suspicious to the portal's WAF. Mitigation: per-user browser
   context + UA handling (already partly in place), sequential (queued) operations, and
   avoiding bursts.

---

## 9. Open Decisions for the Owner

1. **VPS provider + OS** — Windows desktop VPS vs headless Linux VPS. This decides how the
   "Connect SVP" step (Option A) is completed.
2. **Login strategy** — Option A (interactive on server) vs Option B (paste token).
3. **Data model** — do the 3 users work on the SAME candidate/booking data (live SVP), or
   SEPARATE data (requires adding a database)?

---

## 10. Summary

| Question | Answer |
|----------|--------|
| Will 3 users, each with their own SVP login, work today? | **No** — one shared token + singleton browser + no user system. |
| Will 3 PCs × 3 clients work today? | **No** — browser races + SVP rate limits. |
| Can it deploy on Vercel? | **No** — interactive browser login, Chromium, and writable token file are impossible on serverless. |
| What is required? | Phase 1 (locks/queue) → Phase 2 (user accounts + sessions) → Phase 3 (per-user SVP sessions) on a **VPS**. |
