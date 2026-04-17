# PRD — The Indie Coffee Loop (MVP)

## 1. Summary

The Indie Coffee Loop is a B2B SaaS loyalty network for independent cafes. Each participating cafe pays £5/month via Stripe. Customers earn one stamp per drink and redeem a free drink after ten stamps — and crucially, they can earn at any cafe in the network and claim at any cafe in the network (an "open-loop" programme). This PRD defines the MVP scope and the three execution phases required to ship it.

## 2. Contacts

| Name | Role | Comment |
|------|------|---------|
| TBD | Product Owner | Owns scope, prioritisation, and sign-off on each phase gate. |
| TBD | Backend Engineer (FastAPI / PostgreSQL) | Owns Phase 1 data layer, ledger, and atomic transaction guarantees. |
| TBD | Frontend Engineer (HTML5 / Vanilla JS PWA) | Owns Barista POS (Phase 2) and Consumer App (Phase 3). |
| TBD | Billing / Ops | Owns Stripe configuration, subscription lifecycle, and cafe onboarding. |
| hello@impactvisualbranding.co.uk | Stakeholder / Initiator | Commissioned the MVP; receives phase-end demos. |

## 3. Background

### Context
Independent cafes lose loyalty-driven repeat visits to chains whose stamp cards, apps, and reward networks are out of reach for a single-site operator. A paper-card programme tied to one cafe cannot compete with a network. The Indie Coffee Loop gives independents a shared network they can plug into for £5/month.

### Why now?
- HTML5 WebRTC makes a phone-camera barcode scanner viable without a native POS app — a barista can scan from any modern browser.
- Server-Sent Events (SSE) are natively supported everywhere a customer PWA would run, removing the need for polling or heavier WebSocket infrastructure.
- Stripe Billing has made recurring £5/month subscriptions trivial to operate, so the B2B revenue mechanic is a solved problem and not part of the risk surface.

### What is new here
The differentiator is the **open-loop** mechanic: a customer can earn a stamp at Cafe A and redeem the free drink at Cafe B. This requires a centrally managed ledger and atomic stamp operations — which is what Phase 1 builds.

## 4. Objective

### What and why
Ship an MVP that proves three things:
1. Independent cafes will pay £5/month to join a shared loyalty network.
2. Baristas can reliably scan/enter a customer code and credit a stamp without double-counting, even under load.
3. Customers will return more often because their stamp balance is portable across the network.

### Key Results (SMART)
- **KR1 — Billing works:** 100% of onboarded cafes have an active Stripe subscription at £5/month before their POS is enabled.
- **KR2 — Ledger integrity:** Zero double-stamp incidents in Phase 1 load tests (concurrent scans of the same customer code must produce exactly one stamp).
- **KR3 — Scan latency:** Median barista scan-to-confirmation under 1 second on a mid-range phone browser.
- **KR4 — Reward mechanic:** Every 10th eligible stamp produces a redeemable free-drink entitlement, confirmed by ledger audit.
- **KR5 — Open-loop proof:** At least one customer in pilot earns and redeems at different cafes within the pilot window.

## 5. Market Segment(s)

### Primary — Independent cafe owner-operators
- The job: retain customers and compete with chain loyalty programmes without building their own app.
- Constraints: cannot afford bespoke software, cannot install dedicated POS hardware, run the till on an existing phone/tablet browser.

### Secondary — Regular cafe customers in a dense urban area
- The job: be rewarded for the coffee habit they already have, without juggling a different paper card per cafe.
- Constraints: will not install a heavy native app for a £3 drink; expect instant feedback at the till.

### Out of scope for MVP
- Chains, franchises, non-cafe food & beverage, tiered rewards, paid gift cards, marketing automation, analytics dashboards beyond basic admin, native mobile apps.

## 6. Value Proposition(s)

### For the cafe (B2B)
- **Gain:** access to a shared customer base for £5/month — customers earned elsewhere can be redeemed at their till.
- **Pain avoided:** no app build, no POS integration, no card printing, no per-transaction fees on loyalty.
- **Better than alternatives:** paper cards are single-site; chain apps are closed to them; bespoke apps are unaffordable.

### For the customer (B2C)
- **Gain:** one stamp card that works across every independent cafe in the network.
- **Pain avoided:** lost paper cards, app-per-cafe fatigue, stamps stranded at a cafe they no longer visit.
- **Better than alternatives:** a portable balance is something no single-site loyalty card offers.

## 7. Solution

### 7.1 UX / Prototypes

**Barista POS flow (Phase 2)**
1. Barista opens POS URL in browser, logs in as their cafe.
2. Customer shows barcode on their phone → barista scans via HTML5 WebRTC camera.
3. Fallback: barista types the customer's 6-digit `till_code` manually.
4. Server returns confirmation: "Stamp added — 7/10" or "Free drink redeemed".

**Customer PWA flow (Phase 3)**
1. Customer opens PWA, sees their current stamp count and personal barcode / 6-digit code.
2. SSE stream pushes a live update the moment the barista confirms the scan — the count increments on screen without the customer refreshing.
3. At 10 stamps, the screen flips to a redeemable "Free Drink" state.
4. Map view shows participating cafes.

### 7.2 Key Features

**Phase 1 — Data & Admin Foundation**
- PostgreSQL schema: cafes, users (customers), subscriptions, and an append-only stamp **ledger**.
- FastAPI routes for: creating cafes, creating customers, issuing a stamp, redeeming a reward, fetching a customer's current balance.
- Atomic stamp-issuance logic using `SELECT ... FOR UPDATE` on the customer row (or equivalent row lock) inside a single DB transaction, so two concurrent scans cannot both succeed.
- Admin endpoints for onboarding a cafe and viewing ledger entries.

**Phase 2 — B2B Barista POS & Stripe Billing**
- HTML5 / Vanilla JS POS page with WebRTC barcode scanner.
- Manual 6-digit `till_code` entry as fallback.
- Stripe subscription at £5/month per cafe; POS is gated on subscription status being `active`.
- Barista authentication scoped to a single cafe.

**Phase 3 — B2C Consumer App & Map Discovery**
- HTML5 / Vanilla JS PWA for customers.
- SSE endpoint that pushes stamp-count updates to the customer's device the instant the ledger changes.
- Customer's personal barcode and 6-digit `till_code` shown on the home screen.
- Map view listing participating cafes in the network.

### 7.3 Technology

- **Backend:** Python + FastAPI.
- **Database:** PostgreSQL. The ledger is the source of truth; stamp counts and reward eligibility are derived from ledger entries. Concurrency is handled with row-level locking (`SELECT ... FOR UPDATE`) inside explicit transactions.
- **Frontends:** HTML5 + Vanilla JS PWAs (no framework dependency for MVP).
- **Real-time:** Server-Sent Events for customer screen updates. No polling, no WebSockets.
- **Barcode capture:** HTML5 WebRTC (`getUserMedia`) in the browser.
- **Billing:** Stripe subscriptions, £5/month per cafe.

### 7.4 Assumptions

- Cafes run the POS in a modern mobile browser with WebRTC support.
- Customers have a smartphone capable of running a modern PWA.
- Stripe is an acceptable payment processor in the target market.
- "1 drink = 1 stamp" is a sufficient economic model for MVP (no multi-tier SKUs).
- Cafe density in the pilot area is high enough that a customer realistically visits more than one participating cafe.

## 8. Release

The MVP ships in three phased gates. No phase begins before the previous phase is demoed and signed off.

### Phase 1 — Data & Admin Foundation *(first)*
- Models, migrations, API routes, ledger, and atomic stamp transaction.
- Exit criteria: concurrent-scan load test produces zero double-stamps; admin can create a cafe, create a customer, issue stamps, and redeem a reward via API.

### Phase 2 — B2B Barista POS & Stripe Billing *(second)*
- WebRTC scanner + manual `till_code` entry on a browser POS.
- Stripe £5/month subscription lifecycle gating POS access.
- Exit criteria: a real cafe can subscribe, log in, and stamp a live customer end-to-end.

### Phase 3 — B2C Consumer App & Map Discovery *(third)*
- PWA with live SSE stamp updates, personal barcode/code, and map of participating cafes.
- Exit criteria: a customer earns a stamp at Cafe A and, in a separate session, redeems at Cafe B; the PWA updates live without a manual refresh.

### Timeframes
No fixed dates. Each phase is gated on its exit criteria, not a calendar. Phase 1 is the current focus.

### Out of first release (future versions)
- Analytics dashboards, marketing/push notifications, native mobile apps, multi-tier rewards, gift cards, franchise/chain support, referral mechanics.
