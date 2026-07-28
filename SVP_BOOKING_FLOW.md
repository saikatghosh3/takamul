# SVP International Portal — Booking Payment Flow & Center Assignment

## Overview

When you click "Payment" on the SVP International portal (`svp-international.pacc.sa`), it triggers a multi-step wizard. After completing all steps and confirming, the backend **auto-assigns** a test center. The center is NOT chosen by the user — it is determined server-side by the SVP backend based on the combination of selections you provide.

---

## Step-by-Step Wizard (What You Clicked)

```
┌─────────────────────────────────────────────────────────────────┐
│  STEP 1: Choose Occupation (Category)                          │
│  ────────────────────────────────────                          │
│  Select: e.g. "Electrician", "Plumber", "Welder" etc.         │
│  → NEXT                                                        │
├─────────────────────────────────────────────────────────────────┤
│  STEP 2: Choose Methodology                                    │
│  ──────────────────────────────                                │
│  Select: e.g. "Practical", "Theoretical", "Practical+Theory"  │
│  → NEXT                                                        │
├─────────────────────────────────────────────────────────────────┤
│  STEP 3: Choose City                                           │
│  ─────────────────────                                         │
│  Select: e.g. "Dhaka", "Chattogram", "Cumilla" etc.           │
│  → NEXT                                                        │
├─────────────────────────────────────────────────────────────────┤
│  STEP 4: Choose Language                                       │
│  ────────────────────────                                      │
│  Select: e.g. "English", "Arabic", "Bangla"                   │
│  → NEXT                                                        │
├─────────────────────────────────────────────────────────────────┤
│  STEP 5: Choose Date                                           │
│  ───────────────────                                           │
│  Select: Available date from calendar                          │
│  → NEXT                                                        │
├─────────────────────────────────────────────────────────────────┤
│  STEP 6: Review & Confirm                                      │
│  ────────────────────────                                      │
│  ☑ I declare checkbox (agree to terms)                         │
│  → CONFIRM button                                              │
├─────────────────────────────────────────────────────────────────┤
│  STEP 7: Payment & Final Assignment                            │
│  ────────────────────────────────                              │
│  Backend auto-assigns: CENTER + TIME SLOT                       │
│  → API response returned with center details                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Point:** At NO step do you manually select a test center or time slot. The SVP backend assigns these automatically based on your city + category + date + methodology + language combination.

---

## What the API Response Looks Like

After clicking "Confirm", the SVP backend makes a POST request internally and returns a response that includes the assigned center. Here is the typical structure:

### Request (made by SVP frontend to SVP API)

```
POST https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_reservations

Headers:
  Authorization: Bearer <JWT_TOKEN>
  Content-Type: application/json
  Origin: https://svp-international.pacc.sa

Body:
{
  "category_id": <selected_occupation_id>,
  "methodology_id": <selected_methodology_id>,
  "city": "<selected_city_name>",
  "language": "<selected_language>",
  "test_date": "<YYYY-MM-DD>",
  "country_id": 78,
  "accept_declaration": true
}
```

### Response (from SVP API)

```json
{
  "exam_reservation": {
    "id": 12345,
    "reservation_status": "scheduled",

    "category": {
      "id": 42,
      "english_name": "Electrician"
    },

    "occupation": {
      "id": 42,
      "english_name": "Electrician"
    },

    "exam_session": {
      "test_date": "2026-08-15",
      "test_time": "09:00",
      "methodology": "Practical"
    },

    "test_center": {
      "id": 789,
      "test_center_name": "Dhaka Technical Training Center",
      "test_center_city": "Dhaka",
      "test_center_address": "123 Mirpur Road, Dhaka"
    },

    "certificate": null,
    "can_be_rescheduled": true,
    "can_be_canceled": true,

    "created_at": "2026-07-28T10:30:00Z",
    "updated_at": "2026-07-28T10:30:00Z"
  }
}
```

### What the Network Tab Shows

In the browser's Network tab, after clicking Confirm, you will see:

```
Name: exam_reservations
Method: POST
Status: 201 Created (or 200 OK)
URL: https://svp-international-api.pacc.sa/api/v1/individual_labor_space/exam_reservations
```

The response body contains `test_center` with the auto-assigned center details. This is where the center data comes from — it is NOT a separate API call, it is embedded in the reservation creation response.

---

## Why Center is NOT in the UI (No Selection Option)

The SVP portal is designed as a **blind booking** system for candidates:

1. **City selection** narrows down which center pool to use
2. **Category + Methodology** narrows it further
3. **Date** determines availability within that pool
4. **The backend** picks the best available center from the filtered pool and assigns a time slot

The user never sees or chooses the specific center. This is by design — the SVP portal manages center capacity internally.

---

## Data Flow Diagram

```
User Selections              SVP Backend Logic              API Response
─────────────               ─────────────────              ────────────

Occupation (Category)  ──┐
                         ├──▶  Filter available centers  ──▶  Auto-assigns:
Methodology             ──┤     by category + city +           • test_center
                         │     date + methodology              • test_time
City                    ──┤                                    • exam_session
                         │
Language                ──┤
                         │
Date                    ──┘

Result: Center + Time are EMBEDDED in the reservation response
        They are NOT a separate step or separate API call
```

---

## Center Data Sources in the Codebase

### 1. Public Test Centers List (No Auth)
```
GET /api/v1/visitor_space/test_centers?country_id=78&category_id=<ID>&per_page=50&page=1
```
- Used by: `src/app/api/search/route.js:6-21`
- Returns: All test centers (paginated, up to 1500)
- Fields: `id`, `name`, `city`, `address`
- Purpose: Searching/displaying available centers to the user
- **Does NOT include time slots or availability**

### 2. Available Dates (Auth Required)
```
GET /api/v1/individual_labor_space/exam_sessions/available_dates?category_id=<ID>&country_id=78
```
- Used by: `src/lib/takamol.js:57-77`
- Returns: Array of available dates with embedded center info
- Each date object contains: `start_date_in_tc_time_zone`, `test_center.city`
- Purpose: Populating the calendar with available dates
- **The raw response includes `test_center` info per date**

### 3. Cities List (Auth Required)
```
GET /api/v1/individual_labor_space/test_centers/cities?category_id=<ID>&country_id=78
```
- Used by: `src/lib/takamol.js:79-97`
- Returns: List of cities with test centers for a category
- Purpose: Populating the city dropdown

### 4. Reservation Creation (Auth Required)
```
POST /api/v1/individual_labor_space/exam_reservations
```
- Used by: SVP portal frontend (not directly by this codebase)
- Returns: Full reservation object WITH assigned center
- **This is the response you saw in Network tab**

---

## Rescheduling vs Initial Booking

### Initial Booking (on SVP Portal)
- Steps: Occupation → Methodology → City → Language → Date → Confirm
- Center: Auto-assigned by backend
- Time: Auto-assigned by backend
- User sees: Only the confirmation with assigned center details

### Rescheduling (what we automate)
- Steps on SVP: City → Language → Date → Next → Confirm
- URL: `svp-international.pacc.sa/labor/reschedule/steps?reservationId=<ID>`
- Center: Can change (re-assigned based on new city/date)
- Time: Can change (re-assigned based on new date)
- **We automate this via Puppeteer SPA navigation** (see `svp-auth.js:482-692`)

### Key Difference
- Booking assigns center automatically (no user choice)
- Rescheduling also assigns center automatically based on new selections
- In both cases, the **center and time are backend decisions**, not user selections

---

## How This Affects Your Rescheduling Implementation

Since center selection is NOT part of the user flow (it's auto-assigned), your rescheduling implementation needs to:

1. **Capture city + date selections** from the user
2. **Pass them to the SVP reschedule wizard** via Playwright/Puppeteer
3. **Let the SVP backend auto-assign** the new center and time
4. **Parse the response** to confirm the new assignment

You do NOT need to:
- Fetch a list of centers for the reschedule
- Let the user pick a center
- Submit a center_id in the reschedule request

The SVP portal wizard handles everything after city + date selection.
