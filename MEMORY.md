# MEMORY — Local Coffee Perks
<!-- Renamed from "The Indie Coffee Loop" on 2026-04-19 alongside the full
product rebrand. Historical session entries below retain the old name
intentionally so the timeline stays auditable. -->


## Status

- **Phase 1 (Data & Admin Foundation):** ✅ COMPLETE.
- **Phase 2 (B2B Barista POS & Stripe Billing):** ✅ Stripe checkout + webhook live, POS scanner live. Still open under Phase 2: barista auth (optional).
- **🆕 Brand architecture pivot (2026-04-17):** ✅ COMPLETE. Two-tier tenancy (Brand → Cafe) now in place. Scheme-scoped stamp balances verified end-to-end.
- **🆕 Phase 3a — B2B Business Dashboard shell (2026-04-17):** ✅ COMPLETE. Vite + React + TS + Tailwind v4 + shadcn/ui app scaffolded in `b2b-dashboard/`. UI shell built against mock data; no backend wiring yet. **Scoped to the logged-in owner's single brand** (no Super-Admin flow; no "create brand" UI).
- **🆕 Phase 3a — Admin/Store Login Gateway (2026-04-18):** ✅ COMPLETE. Gateway landing screen is the new root of `b2b-dashboard/`. Two-role entry (Admin email/password, Store number + 4-digit PIN) with mock routing: Admin → existing dashboard shell (Overview/Locations/Billing/Settings), Store → `BaristaPOSView`. Logout from both paths drops the session back to the gateway.
- **🆕 Phase 3a — Barista POS React migration (2026-04-18):** ✅ COMPLETE. `static/index.html` scanner logic (html5-qrcode, Smart Pause, 2.5s dedupe, 10s reward-resolved re-scan protection) ported into `b2b-dashboard/src/views/BaristaPOSView.tsx`. Reward prompt is a premium shadcn Dialog with amber celebration treatment (`RewardDialog.tsx`).
- **🆕 Phase 3a — Backend auth + POS wiring (2026-04-18):** ✅ COMPLETE. New JWT-issuing routes `POST /api/auth/admin/login` and `POST /api/auth/store/login` live in `app/auth_routes.py`. Frontend gateway hits the real endpoints; JWT + venue API key persisted to `localStorage` (`icl_session_v1`) and rehydrated on refresh. Scanner sends `Venue-API-Key: <cafe UUID>` on real `POST /api/venues/stamp` + `/api/venues/redeem`; all HTTP error paths map back into the existing toast + activity-card UX. CORS tightened to explicit dev origins via `CORS_ORIGINS`.
- **🆕 Phase 3a — Production auth (per-row hashes) (2026-04-18):** ✅ COMPLETE. Dev-mode shared secrets (`letmein2026` / `1234`) retired. New columns: `brands.password_hash`, `cafes.store_number` (UNIQUE, with CHECK format), `cafes.pin_hash` — added via `migrations/0001_add_auth_columns.sql` (idempotent; `models.sql` updated to match). `app/security.py` provides `hash_password` / `verify_password` using `bcrypt` directly. `auth_routes.py` now verifies payloads against per-row hashes; failed lookups still run a decoy `verify_password` so response time doesn't leak which identifiers exist. `settings.dev_admin_password` + `settings.dev_store_pin` removed. Local DB seeded with `Test Coffee Co` brand (`admin@test.com` / `password123`) and one cafe (PIN `1234`); the one-shot `seed_test_data.py` was deleted after the run.
- **🆕 Phase 3a — Drop STORE- prefix (2026-04-18):** ✅ COMPLETE. UX decision to save barista keystrokes: store IDs no longer carry the "STORE-" prefix. Baristas now type just `001`. Schema: `cafes.store_number_format` CHECK relaxed from `^STORE-[A-Z0-9]{3,10}$` to `^[A-Z0-9]{3,10}$` via `migrations/0002_drop_store_prefix.sql`, which also rewrote the seeded `STORE-001` row to `001` in-place. `app/schemas.py::StoreLoginRequest.store_number` now `min_length=3, max_length=10, pattern=r"^[A-Za-z0-9]+$"`. Frontend `StoreForm` label is now "Store ID" with placeholder `001`; regex `/^[A-Z0-9]{3,10}$/`; onChange strips anything outside `[A-Z0-9]`.
- **🆕 Phase 3a — Add Location live wiring (2026-04-18):** ✅ COMPLETE. Dashboard's mock-to-real gap closed. `POST /api/admin/cafes` now requires a Bearer JWT (audience=admin) verified via new `app/auth.py::get_admin_session` dep; `brand_id` comes from the JWT, not the request body; `slug` and `contact_email` auto-derive from the brand if omitted; `store_number` + `pin` are optional and PIN is bcrypt-hashed server-side. New `GET /api/admin/cafes` returns the admin's cafes, newest first. Frontend `AddLocationDialog` now does an async `onSubmit`, shows loading state + inline `ApiError.detail` on failure; on success `App.tsx` re-fetches `listCafes(token)` so the table updates immediately.
- **🆕 Phase 3a — Full audit, zero mock data (2026-04-18):** ✅ COMPLETE — Phase 3a is 100% production-wired. New endpoints: `GET /api/admin/me` (rehydrates admin + full brand profile incl. `current_period_end`), `GET /api/admin/metrics` (30d scan totals + prev-30d for real deltas, active/total cafe counts, per-cafe scan counts), `PATCH /api/admin/brand` (partial updates to name/slug/contact_email/scheme_type with uniqueness check). Frontend: every view now reads from live state. `OverviewView` deltas are computed from metrics; `SettingsView` has a real draft/save/discard flow; `BillingView` reflects live `subscriptionStatus`; mock Visa 4242 block gone. `humanizeError(e)` helper maps `ApiError` status codes across login + add-location + settings forms. Sidebar "Sign out" upgraded to a labelled row; both admin + store paths clear `icl_session_v1` + `icl_brand_v1` on logout.
- **🆕 Phase 3 — Password visibility toggle (2026-04-18):** ✅ COMPLETE. Small UX polish: `LoginView`'s admin password field and store PIN field both gained a right-side show/hide toggle (`Eye` / `EyeOff` from lucide-react). New inline `PasswordToggle` helper in `LoginView.tsx`: absolute-positioned inside the existing `FieldWithIcon` wrapper, `muted-foreground/70` → `foreground` on hover, `bg-muted` hover surface, focus-visible ring, disabled while the form is submitting. Input `type` toggles between `"password"` and `"text"`; inputs gained `pr-10` to make room.
- **🆕 Phase 3 — Stripe Billing end-to-end (2026-04-18):** ✅ COMPLETE — Phase 3 is closed. `POST /api/billing/checkout` now requires a Bearer JWT (admin audience), derives `brand_id` from the token (no longer in the body), and builds `success_url` / `cancel_url` from the new `FRONTEND_BASE_URL` setting (default `http://localhost:5173`) with paths `/success?session_id={CHECKOUT_SESSION_ID}` and `/cancel`. Returning Stripe customer is reused if `stripe_customer_id` is set; otherwise `customer_email` is seeded from the brand. `POST /api/billing/webhook` (unchanged) catches `checkout.session.completed`, flips `brands.subscription_status` to `active`, and persists `stripe_customer_id` + `stripe_subscription_id`. Frontend: `createCheckout(token)` in api.ts; `BillingView` Subscribe/Manage button calls it and `window.location.href`'s to the Stripe URL, with loading + `humanizeError` inline error. New `BillingSuccessView` (emerald celebration + session ID) and `BillingCancelView` (neutral, "no charge") are routed via `window.location.pathname` sniff in `App.tsx` (minimal SPA routing — no React Router). On Success → Continue, the URL is cleared via `history.replaceState`, `refreshAdminData` re-fetches, and nav jumps to the Billing tab to show the new Active status.
- **Phase 3b (B2C Consumer App & Map Discovery):** 🟢 UNBLOCKED — ready to start on the user's cue.
- **🆕 Phase 4 — Consumer MVP framework (2026-04-18):** 🚧 IN PROGRESS — shell + UI polish + Sign Up/Log In flow + real consumer auth backend + History tab + Reward modal all shipped. Stack: **React Native + Expo** (SDK 54) at `consumer-app/`. Dark espresso palette, 4 bottom tabs (Home / History / Discover / Profile). Login gateway is a Sign Up vs Log In chooser → named form → 4-digit PIN → real `POST /api/consumer/auth/request-otp` + `verify-otp` (PyJWT, bcrypt-hashed codes in `consumer_otps` table, OTP printed to uvicorn stdout in dev). New consumers get a random unique 6-alphanumeric `till_code` (= `consumer_id` the QR encodes). Home reads the real profile from the auth response. Reward modal is a reusable celebration popup triggerable via a dev button. NativeWind v4 wired (`tailwind.config.js` w/ `nativewind/preset` + custom espresso/cream/latte/caramel/mocha palette, `global.css` with `@tailwind` directives, `babel.config.js` with `babel-preset-expo` + `jsxImportSource: "nativewind"` + `nativewind/babel`, `metro.config.js` with `withNativeWind`, `nativewind-env.d.ts` reference). Icons via `lucide-react-native`; QR via `react-native-qrcode-svg` (+ `react-native-svg` peer). `App.tsx` rewritten as a native shell: `SafeAreaView` + custom `BottomNav` (Home/Discover/Profile via House/Compass/User icons) + `HomeView` centering a 240px premium QR in a white card (shadow + 24-radius) with greeting header, Stamps progress text (`7/10 Stamps`, `3 until a free coffee`), amber progress bar, and a 10-dot stamp row filled with Coffee icons. Uses native `View` / `Text` / `Pressable` with NativeWind classes throughout — no `StyleSheet.create` except for dynamic shadow/width styles. This supersedes the earlier "Phase 3b PWA" framing in the Hub-and-Spoke doc.
- **🆕 Global rebrand + Brand Kit (2026-04-19):** ✅ COMPLETE. Product renamed **"The Indie Coffee Loop" → "Local Coffee Perks — For the regulars"** across every user-facing surface: dashboard lockups (Sidebar, LoginView, Billing Success/Cancel), `b2b-dashboard/index.html` title, consumer-app Home header + Discover subtitle + LoginScreen, Expo display name (`consumer-app/app.json`), FastAPI OpenAPI title (`app/main.py` → drives Swagger `/docs`), Stripe checkout line item (`app/billing.py`), and the legacy standalone `static/index.html` POS `<title>`. Scheme sub-brand label "Indie Loop" → **"Open Network"** (DB enum value `scheme_type="global"` untouched — label-only change in UI copy). Dashboard theme swapped to the new **Brand Kit**: Inter via Google Fonts (replacing Geist), `:root` palette rewritten to hex brand tokens (Crema `#FBF7F1` bg · Espresso `#2A211C` fg · Terracotta `#C96E4B` primary/ring · Oat `#F3E9DC` muted/secondary/sidebar · warm beige `#E8DCC9` borders), `--radius` bumped 0.625rem → 0.875rem for softer, friendlier corners. Chart palette repurposed to Terracotta / Moss / Roasted Almond / Success / Espresso. Standalone **`brand-moodboard.html`** generated at repo root (no build tooling — open directly): 7-swatch palette card with hex + usage notes, Inter typography scale (H1 48/Bold, H2 32/SemiBold, H3 24/SemiBold, Body 16/Regular), and UI element pairings (Terracotta CTA, Oat secondary, Crema input with Terracotta focus ring, status badges, Espresso-on-Crema offer preview). Dead `@fontsource-variable/geist` npm dep left in package.json to avoid churn but its `@import` is gone. `MEMORY.md` / `PRD.md` / npm `"name"` fields intentionally NOT rebranded (historical docs + internal identifiers).
- **🆕 B2B Dashboard build-out — Promotions + Locations UX (2026-04-19):** ✅ COMPLETE. Full merchant workflow added. **Promotions & Offers tab**: new sidebar entry (replaces earlier short-lived "Store Profile" nav slot) at `b2b-dashboard/src/views/PromotionsView.tsx`. Three numbered steps — (1) Offer type dropdown (Percentage %, Fixed £, BOGO, Double Stamps) with conditional amount input carrying `%` / `£` suffix, (2) Applies-to target dropdown (Any Drink, All Pastries, Food/Sandwiches, Merchandise, Entire Order), (3) 2×2 grid of Start date / Start time / End date / End time with `end > start` validation. Soft amber lead-time nudge if the start is <4h away (constant `LEAD_TIME_HOURS = 4`). Sticky **live consumer preview card** on the right column (lg+ breakpoint) renders an approximation of the consumer Offers strip in the espresso/amber palette. **Red barista warning block** ("🚨 Remember to inform your baristas — the consumer app advertises it but the till is manual") and a feedback mailto link (`feedback@localcoffeeperks.app`). Saved offers list with per-row Remove. Offer schema + localStorage helpers in `b2b-dashboard/src/lib/offers.ts` (keyed `icl_offers_v2:<brandId>` — schema v1→v2 bump stranded stale single-date entries cleanly). **Amenities relocated from a brand-level tab into the Location scope**: `ProfileView.tsx` deleted; the 9-checkbox grid now lives inside `AddLocationDialog.tsx` (location-specific, persisted keyed `icl_amenities_v1:<cafeId>` via new shared `src/lib/amenities.ts`) AND inside a new `components/EditAmenitiesDialog.tsx` opened from a per-row "Edit amenities" action on `LocationsView`. `App.tsx::handleAddLocation` widened to return the new `cafe.id` so the dialog can key persistence by it. **Address UX upgraded**: the single Address input is now a Google-Places-style autocomplete (`"Start typing address..."`) with a mock `MOCK_ADDRESSES` corpus + dropdown + bold-highlighted match, plus an "Enter manually" toggle that reveals Address Line 1 / City / Postcode fields. Both modes produce one address string for the backend. **Phone number field** added to the Location modal with a Phone icon, persisted via new `src/lib/location-meta.ts` helper (keyed `icl_location_meta_v1:<cafeId>`) since the backend `cafes` schema has no phone column yet. Everything frontend-only — no backend endpoints or migrations touched this session.
- **🚧 Network blocker — mobile ⇄ backend testing (2026-04-19):** ✅ **RESOLVED 2026-04-22** — superseded by the dedicated 2GB DigitalOcean droplet decision (see 2026-04-22 bullet below). Historical detail retained for auditability: `localtunnel` abandoned after repeated instability (anti-phishing interstitials, stale proxy caches, random disconnects, and a tranche of URL rotations mid-session). Attempted pivot to direct LAN via `http://192.168.0.18:8000` (uvicorn bound to `0.0.0.0`) is blocked by either the home router's **AP Isolation** (phone on Wi-Fi can't reach the laptop on the same LAN) or **Windows Firewall** rejecting inbound 8000. Not yet diagnosed to a single cause. **Next-session options**, either is acceptable: (A) bypass the phone entirely with a web-based dummy QR generator (e.g. a `<QRCode>` React component bound to a `text` input) to drive the B2B scanner during development, or (B) deploy the FastAPI backend to **DigitalOcean** (droplet + nginx + systemd, or App Platform) so the mobile app hits a stable public URL. Option B also unblocks TestFlight / Play Store Internal Testing later. Carry-over state that makes either path cheap: the consumer app's `src/api.ts` already centralises the `API_BASE_URL` + headers (Bypass-Tunnel-Reminder + Accept + Cache-Control + `?t=` cache-buster), so a URL swap is still one line. The `🚨 OTP REQUEST RECEIVED FOR:` + explicit `--- OTP for … ---` print lines and the temporary `saeed@test.com → 1234` hardcoded OTP in `app/consumer_auth.py::request_otp` are still in place for dev — **strip the hardcode before deploying**.
- **🆕 B2B hardening — 405 fixes + amenities + hygiene + Delete RPC (2026-04-20):** ✅ COMPLETE. Migration 0005 (`cafes.amenities TEXT[]` + `offers` table), 0006 (`cafes.phone TEXT`), 0007 (`cafes.food_hygiene_rating TEXT` CHECK `'1'..'5' | 'Awaiting Inspection'`) all applied. Add/Edit Location dialogs surface hygiene Select + 9-checkbox amenity grid (catalog mirrored in `consumer-app/src/amenities.ts`). `FastAPI(redirect_slashes=False)`, update handler double-decorated `@app.patch` + `@app.put`, frontend `requireCafeId()` guards, CORS widened to `allow_methods=["*"]`, startup banner logs registered `/api/admin/cafes*` routes. Phantom "POST saves but UI shows error" traced to post-create follow-ups throwing through dialog's try/catch — now best-effort `console.warn`. **Delete RPC workaround:** browser DELETE was blocked by dev-stack intermediary even after CORS widening — shared `_delete_cafe_impl` now exposed via both `DELETE /api/admin/cafes/{id}` and `POST /api/admin/cafes/{id}/delete`; frontend fires the POST variant with optimistic row removal.
- **🆕 Offers CRUD + location targeting (2026-04-20):** ✅ COMPLETE. `updateOffer` PUT + `EditOfferDialog` per-row pencil button; `deleteOffer` switched to RPC-POST (`/api/admin/offers/{id}/delete`) mirroring cafe pattern via shared `_delete_offer_impl`. **Location targeting:** migration 0008 adds `offers.target_cafe_ids UUID[] NULL` (NULL = All, populated = specific). Shared `OfferLocationTargeting.tsx` radio + checkbox grid wired into create form + Edit dialog + per-row `LocationScopeBadge` pill. Consumer `GET /api/consumer/cafes` honors the filter (shipped in section 11, 2026-04-21).
- **🆕 Per-cafe Stripe billing + Customer Portal (2026-04-20):** ✅ COMPLETE. £5/mo **per location** model — Stripe subscription item `quantity = COUNT(cafes)`. `sync_subscription_quantity` helper fires post-commit on cafe create/delete (failures log-only, cafe commit wins). New `POST /api/billing/portal` (400 if no `stripe_customer_id` yet). Generic "Subscribe" button gone — first cafe's "Add & Continue to Payment" triggers checkout. Active-brand AddLocationDialog shows amber "£5/mo will be auto-billed" notice + portal escape-hatch link. BillingView "Manage billing & invoices" → Stripe Customer Portal.
- **🆕 KYC fields + Overview "View all" nav fix (2026-04-20):** ✅ COMPLETE. Migration 0009 adds 6 nullable TEXT columns to `brands`: `owner_first_name`, `owner_last_name`, `owner_phone`, `company_legal_name`, `company_address`, `company_registration_number`. `BrandProfile` + `BrandUpdate` + `update_admin_brand` extended (empty-string-clears-to-NULL). SettingsView restructured into three stacked cards (Brand profile / Owner Details / Legal & Compliance) + shared Save bar. OverviewView "View all" next to Top performing branches now routes to Locations via `onNavigate` prop.
- **🆕 POS consolidation — ScannerView → BaristaPOSView (2026-04-21):** ✅ COMPLETE. Prototype `ScannerView.tsx` merged into `BaristaPOSView.tsx` (now production) and deleted. New scan-first UX: mode tabs (Camera / Keyboard-USB) → scan → action overlay (Customer ID + ± stepper 1–10 + giant Confirm + Cancel/Rescan). Preserved from the old view: `SCAN_LOCKOUT_MS = 3500` (post-Confirm, not pre-scan), `REWARD_RESOLVED_COOLDOWN_MS = 10_000`, four-layer double-stamp defense (`scannedRef` + `rewardOpenRef` + `inFlightRef` + `lockoutUntilRef`), full 401/402/404/409/422 toast taxonomy. Store-session routing in `App.tsx` unchanged.
- **🆕 Consumer live-data wiring + brand-scoped balance fix (2026-04-21):** ✅ COMPLETE. **Correctness bug fixed:** `/me/balance` was summing stamps cross-brand (violated Global-vs-Private isolation). Now uses `_scoped_balance_stmt` anchored on latest-earn's brand. `GET /api/consumer/cafes` now filters offers by `target_cafe_ids` (closes 2026-04-20 gap). New `GET /api/consumer/me/history?limit=50` reads from `global_ledger` (row-per-transaction, not per-stamp). `fetchHistory` wrapper + HistoryScreen rewritten (real API, loading/empty/error, quantity-aware titles — "Earned 3 stamps" / "Redeemed 1 Free Drink"; `balanceAfter` dropped).
- **🆕 Mixed-Basket POS + banking pivot (2026-04-21):** ✅ COMPLETE. **Architectural pivot:** `/api/b2b/scan` no longer auto-rollovers; rewards now bank until explicitly consumed via `/api/venues/redeem`. `RedeemRequest.quantity` added (1–20); handler inserts N REDEEM rows + aggregated REDEEMED global_ledger row. New `GET /api/venues/customer/{till_code}` → `CustomerStatusResponse(current_stamps, banked_rewards, threshold)`. `ConsumerBalanceResponse` gained `current_stamps` + `banked_rewards` derived fields; consumer app uses `current_stamps` for X/10 (avoids "13/10"). BaristaPOSView rewritten with pre-scan customer fetch, dual steppers (Paid drinks / Free drinks), Mid-Order Intercept dialog, serialised `b2bScan` → `redeem`, combined toast.
- **🆕 Intercept threshold — Buy 10, get 11th free (2026-04-21):** ✅ FIXED. Intercept trigger changed from `>= threshold` to `> threshold` — "Buy 10, get 11th free", not "Buy 9, get 10th free". Landing exactly on the threshold (e.g. 0+10=10 or 8+2=10) now banks a reward with no intercept. Free-drinks stepper stays rendered at `opacity-50` when `banked_rewards === 0` so baristas always see the feature exists.
- **🆕 Consumer Discover polish + Live Confetti (2026-04-22):** ✅ COMPLETE. `DiscoverCafeCard` gained compact `HygienePill` (`ShieldCheck` + "Hygiene · N/5") + offers recoloured amber → terracotta (matches B2B dashboard offer colour). **Celebration trigger rewired** from `latest_earn.transaction_id` → delta detection on `current_stamps`/`banked_rewards` (fixes banking-pivot regression where `free_drink_unlocked` was always false). `stampsEarnedDelta = (banked_new - banked_prev) * 10 + (current_new - current_prev)` handles threshold crossing. `AppState` listener pauses polling when backgrounded, re-polls immediately on foreground. **Flagged:** mixed-basket transient (net-zero poll miss when stamps + redeem fire close together) — belt-and-braces fix would be a `latest_redeem` payload diffed alongside `latest_earn`.
- **🆕 Infra — dedicated 2GB DigitalOcean droplet for the backend (2026-04-22):** ✅ **PROVISIONED.** Droplet is live. Closes the 2026-04-19 "Network blocker" (marked resolved above). Plain **2GB dedicated droplet** (NOT App Platform) so we keep root for uvicorn + Postgres + monitoring glue. Region, OS, webserver (nginx vs Caddy), TLS (Let's Encrypt), process manager (systemd), and on-box-Postgres-vs-Managed-DB are NOT pinned in this memo — ask at cut-over time. What this unblocks: (1) a stable public URL for the native Consumer App — retires the whole localtunnel chain (`stale-coats-run.loca.lt` and predecessors) — so the 3s `/me/balance` poll and OTP email round-trips stop bleeding stale requests through rotating tunnels; (2) TestFlight / Play Store internal testing later.
    - **▶️ Next: Step 1 — The Tunnel Killer.** The *immediate* follow-up is the `API_BASE_URL` cut-over itself — swap `consumer-app/src/api.ts::API_BASE_URL` from the loca.lt URL to the droplet's public host, and drop `Bypass-Tunnel-Reminder` from `DEFAULT_HEADERS`. That's the whole "Tunnel Killer" step. Do NOT assume the public host — user will supply it when we start.
    - **Deferred hardening (carry-over at cut-over, not part of Step 1):** rotate `JWT_SECRET` from `dev-secret-change-me` to ≥32 bytes; tighten `CORS_ORIGINS` from `*` to the explicit mobile-app + b2b-dashboard origins; strip the `saeed@test.com → 1234` hardcoded OTP + `🚨 OTP REQUEST RECEIVED FOR:` / `--- OTP for … ---` debug prints in `app/consumer_auth.py::request_otp`; swap `_send_otp_email`'s `print()` for SES/Postmark. None are new commitments — all were already tracked under hardening.

## Phase 4 — Consumer App (React Native / Expo) (shipped shell 2026-04-18)

The consumer spoke pivoted from "lightweight PWA" to a **true native iOS/Android app**, per user decision 2026-04-18. Lives at `consumer-app/` at the repo root — completely separate from `b2b-dashboard/`.

### Stack
- **Expo SDK ~54.0.33** + **React Native 0.81.5** + **React 19.1.0** + **TypeScript** (strict). Scaffolded via `npx create-expo-app consumer-app --template blank-typescript`.
- **NativeWind v4** (`nativewind ^4.2.3`, `tailwindcss ^3.3.2`). NOT Tailwind v4 — NativeWind still targets Tailwind v3. Config files: `tailwind.config.js`, `global.css`, `babel.config.js`, `metro.config.js`, `nativewind-env.d.ts`.
- **lucide-react-native** for icons (House, Compass, User, Coffee).
- **react-native-qrcode-svg** + **react-native-svg** (peer dep) for the loyalty QR.
- **react-native-safe-area-context** + **react-native-reanimated** installed as NativeWind peers.

### Shell structure (`App.tsx`)
- Top-level `View` (bg-cream) with a `SafeAreaView` body + `BottomNav` dock.
- `useState<Tab>` drives view switching — no router yet, no persistence.
- `HomeView`: greeting row (Good morning / Isha + Coffee avatar chip), centered "Your Loyalty Pass" QR card (240px, white, soft shadow), progress block (stamp count + "N until a free coffee" + amber bar + 10-dot stamp row with Coffee icons inside filled dots).
- `BottomNav`: 3 `Pressable` tabs (Home/Discover/Profile), active tab highlights with darker stroke + espresso-colored text, inactive is stone-400.
- Discover + Profile are `PlaceholderView` components (title + subtitle) — wired into nav but not built out.
- Mock values in code: `STAMPS_EARNED = 7`, `STAMPS_TARGET = 10`, `USER_TOKEN = "indie-coffee-loop:user:42:7b3f9a"`.

### Not done yet (intentional)
- No navigation library (react-navigation / expo-router). Tab switch is pure React state.
- No backend wiring. QR value is a hardcoded string; stamp count is a hardcoded constant.
- No auth / session / persistence. No SSE. No map.
- No app icon / splash customization. Expo default assets.

### Build fix (2026-04-18, post-initial-scaffold)
First boot on Expo Go surfaced `Make sure that all the Babel plugin and presets you are using are defined as dependency or dev dependency in your package.json`. Root cause: `babel-preset-expo` was nested under `node_modules/expo/node_modules/babel-preset-expo` (not hoisted), so Metro couldn't resolve it from the project's `babel.config.js`. Fix: `npm install --save-dev babel-preset-expo` — now hoisted to top level and resolvable. Also ran `npx expo install --fix` to align `react-native-reanimated` to `~4.1.1`, `react-native-safe-area-context` to `~5.6.0`, `react-native-svg` to `15.12.1` (Expo SDK 54's expected versions).

### UI polish round 1 (2026-04-18)
Promoted the shell from "functional" to "premium native product" per user direction.
- **Dark premium theme.** Switched from cream/espresso light palette to a deep espresso dark aesthetic: `#0B0908` app bg, `#15120F` surfaces, warm caramel accent `#E4B97F` / deeper `#C99A58`, text `#FAF7F2` / muted `#A8A29E` / faint `#57534E` / live-green dot `#4ADE80`. Centralised in a `COLOR` object at the top of `App.tsx` so swapping palettes is a one-file change. StatusBar is `light-content` over the dark bg.
- **Safe-area done properly.** Wrapped the root in `SafeAreaProvider` (from `react-native-safe-area-context`); top body uses `SafeAreaView edges={["top"]}`; `BottomNav` uses `useSafeAreaInsets()` and sets `paddingBottom: Math.max(insets.bottom, 10)` so the tab bar sits flush against the home-indicator on modern phones without a dead gap on older devices.
- **Bottom nav re-anchored.** The nav is now a sibling AFTER the body `SafeAreaView` inside the root `View` — it docks at the very bottom. Active tab gets a caramel pill background behind its icon (`h-10 w-16 rounded-full bg-[rgba(228,185,127,0.12)]`) with caramel icon + label; inactive is faint stone. Tabs: House / Compass / User. Pressable `hitSlop={8}`.
- **Personalised greeting.** Replaced "Good morning / Isha" with a two-line header: eyebrow `INDIE COFFEE LOOP` (11px uppercase, letter-spacing 2) + 26px "Welcome back, Sarah 👋". Right side now has a Bell icon button with a caramel unread-dot indicator (no backing logic yet).
- **QR card elevated.** QR lives inside a `rounded-3xl` card (`#15120F` surface, 1px `rgba(255,255,255,0.06)` hairline, shadow offset y=20 / opacity 0.45 / radius 28 / elevation 12). Card header row = caramel "LOYALTY PASS" eyebrow + "Show this at the counter" + green "ACTIVE" pill (dot + label on `rgba(74,222,128,0.1)`). QR itself sits inside an inner white 2xl panel (210px, dark ink on white for contrast). Footer row = small Coffee icon + "Token refreshes after every scan".
- **Stamp tracker redesigned.** Above the bar: left column = caramel "REWARDS PROGRESS" eyebrow + big 32px `7 / 10` (earned is brighter, denominator is textFaint). Right column = "Free coffee in / 3 stamps" inside a caramel-tinted outlined chip (`rgba(228,185,127,0.08)` + `rgba(228,185,127,0.15)` border). Progress bar is 12px tall on a dark surface track with a caramel-deep fill and a caramel glow shadow. Below the bar: a row of 10 coffee-icon stamps — filled uses `accentDeep` bg + `accentInk` icon stroke; unfilled uses `surface` bg + 1px border + faint icon. Spacing is flex-justified across the full width.
- **Placeholder screens polished.** Discover + Profile show a centered card: dark ring-framed Coffee icon chip + title + subtitle + "COMING SOON" eyebrow.
- **Style pattern.** Layout, spacing, typography, rounded corners, flex alignment all go through NativeWind `className` strings. Colours + shadows + dynamic widths + letter-spacing go through inline `style={}` using the centralised `COLOR` tokens — this sidesteps a NativeWind v4 edge case where arbitrary hex opacity modifiers (`bg-[#E4B97F]/10`) can render inconsistently on native.
- **Typecheck.** `npx tsc --noEmit` → clean. App boots cleanly on Expo Go post-babel-preset-expo install.

### Passwordless auth shell (2026-04-18)
Confirmed flow: **Email + 4-digit PIN** (magic-link-ish, no passwords on the consumer side). User ID format is the 6-alphanumeric `^[A-Z0-9]{6}$` that the barista POS regex already enforces (same format as till_code).
- **New files.** `consumer-app/src/theme.ts` centralises the `COLOR` palette plus mock `USER_ID = "A9X4B2"` and `USER_NAME = "Sarah"` — both App + LoginScreen import from here so the palette stays consistent across screens. `consumer-app/src/LoginScreen.tsx` owns the two-step gateway.
- **Login flow.** `LoginScreen` has `step: "email" | "pin"`, local `email` + `pin` state, email validated by `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, PIN validated by `/^\d{4}$/`. Step 1 = email input (Mail icon, placeholder `you@cafe.com`) + "Send Code" CTA. Step 2 = "Sent to {email}" + 4 PIN boxes driven by a single invisible `TextInput` (`textContentType="oneTimeCode"`, `keyboardType="number-pad"`, `maxLength={4}`, `autoFocus`), each box renders `pin[i]` with the active slot getting a 1.5px caramel border + a centred `·` placeholder. "Verify" CTA + "Didn't receive it? Resend code" link (wired to nothing yet). Back arrow button on the PIN step returns to email. `KeyboardAvoidingView` wraps both steps with `behavior="padding"` on iOS. On Verify, calls `onAuthenticated(trimmedEmail)` — parent just flips `authed` to true.
- **App gating.** `AppShell` now holds `authed: boolean` (default `false`). When `!authed`, renders `<LoginScreen>`; on success it drops through to the existing tabbed shell. No persistence yet — refreshing the app drops back to login. No real backend call yet — the email/PIN are validated by shape only.
- **Home code display.** QR now encodes the same 6-char `USER_ID` (`"A9X4B2"`) the backend `till_code` regex will accept. Beneath the QR panel there's a new "Member Code · Read Aloud" sub-card (bg `#0B0908`, 1px hairline border) containing the ID rendered in a platform-specific monospace face (`Menlo` on iOS, `monospace` on Android) at 32px with `letter-spacing: 10` so a barista can read the six characters without confusion when a scan fails. QR card header copy updated from "Show this at the counter" to "Scan or read aloud at the counter" to match.
- **Interaction details.** Primary CTA buttons (Send Code / Verify) use `disabled={!canSubmit}` with the disabled state visually dimmed (`opacity: 0.7`, surface-colored bg) — so the user gets immediate feedback without error banners. Both inputs fire `onSubmitEditing={submit}` to support keyboard "go" actions.
- **Typecheck.** `npx tsc --noEmit` → clean. No new deps needed — everything uses `react-native` core components + the existing `lucide-react-native` + `react-native-safe-area-context`.
- **Intentional gaps.** No real auth backend (no `/api/consumer/request-code` / `/verify-code` endpoints exist yet). No session persistence (AsyncStorage not wired). No rate-limiting UX (resend link is cosmetic). No error states — the whole flow assumes success. Email → real 4-digit-PIN delivery (SES / Postmark / etc.) is a later phase.

### Consumer MVP framework (2026-04-18)
Separated Sign Up vs Log In, wired the native app to real FastAPI routes, added History + reward Modal. The passwordless shell from the earlier round is now end-to-end against a live backend.

**Backend — new consumer auth surface**
- **Table:** kept existing `users` (already a 6-alphanumeric `till_code` = the consumer_id the QR encodes — semantically *is* the consumers table). `migrations/0003_add_consumer_fields.sql` adds `users.first_name`, `users.last_name`, and a new `consumer_otps` table (`email`, `code_hash`, `expires_at`, `attempts`, `used_at`, `created_at` + index on `lower(email) + created_at DESC`). `models.sql` updated to match. Decision note: did NOT rename `users` → `consumers` even though the Phase 4 UX calls them consumers. Rename would churn `stamp_ledger.customer_id`, ORM class, all imports, and every bit of memory we've written — for no product value. API layer uses "consumer" semantics; table stays `users`.
- **Routes:** `POST /api/consumer/auth/request-otp` and `POST /api/consumer/auth/verify-otp` in new `app/consumer_auth.py`. Request-otp accepts `{email, first_name?, last_name?}`: if email is unknown AND names present → creates a new `User` with a unique random 6-alphanumeric `till_code` (via `_unique_till_code`, up-to-16 retries, 503 on exhaustion) + a fresh `barcode = secrets.token_hex(12)`. If email is unknown and names absent → 404 `"We couldn't find an account for that email. Try signing up instead."` (fails closed so a log-in form never silently signs someone up). If email exists → ignores the names and just issues a new OTP (log-in wins, avoids clobbering a returning consumer's saved name). Always generates a fresh 4-digit code, bcrypt-hashes it, inserts into `consumer_otps` with `expires_at = now + 10min`, and calls `_send_otp_email` which in dev just `print()`s to stdout (replace with SES / Postmark later — only that one fn changes). Verify-otp picks the latest row for the email that's unused + not expired + under `MAX_OTP_ATTEMPTS=5`, verifies against the bcrypt hash (with `_DECOY_HASH` fallback when no row matches so wall time doesn't leak existence), bumps `attempts` on miss, sets `used_at` on hit, and returns a signed consumer JWT plus profile.
- **Tokens:** `app/tokens.py` gained `encode_consumer(user_id, consumer_id, email, first_name, last_name)` — JWT audience `"consumer"`. `consumer_id` claim is the `till_code`, so any future `get_consumer_session` dep just pulls it out. Signing config unchanged (12h TTL, HS256, `jwt_secret`).
- **Schemas:** `ConsumerRequestOTP`, `ConsumerRequestOTPResponse`, `ConsumerVerifyOTP`, `ConsumerProfile`, `ConsumerAuthResponse` in `app/schemas.py`. Email length-checked 3–254; first_name/last_name length-checked 1–60 when present; code is `^\d{4}$`.
- **Main.py:** `app.include_router(consumer_auth_router)` registered after the existing `auth_router`, before the `StaticFiles` mount. No new middleware needed — fetch from React Native does not send Origin so CORS doesn't gate it.
- **End-to-end verified (2026-04-18):**
  - Signup against `sarah@test.com` / `Sarah Chen` → 200 `{ok:true}`, new `User` row with `till_code=3E7FXH`, OTP printed to uvicorn stdout, verify-otp with the printed code → 200 with consumer JWT + `consumer_id=3E7FXH`.
  - Login path for the same email with no names → 200 + fresh OTP row.
  - Login path for an unknown email → 404 with the signup-redirect message.
  - Old `dev-secret-change-me` JWT signing still triggers PyJWT's `InsecureKeyLengthWarning` — carried as a known item under the hardening backlog.

**Consumer app — new files + restructured login**
- `consumer-app/src/theme.ts` — exports `COLOR` + `type Consumer` + `type Session`. No more mocked `USER_ID` / `USER_NAME` — they come from the real auth response now.
- `consumer-app/src/api.ts` — tiny fetch client. `API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://192.168.0.18:8000"` (the dev laptop's LAN IP — Expo Go on the phone hits this; override with `EXPO_PUBLIC_API_BASE_URL` in `.env` or `app.json` extras). `ApiError` class carries `status` + `detail`. `requestOtp({email, firstName?, lastName?})` and `verifyOtp({email, code}) → Session` wrap the two routes; both throw `ApiError` with a "Couldn't reach the server" fallback on network failure.
- `consumer-app/src/LoginScreen.tsx` — restructured to four modes: `select` (two tall card buttons for Sign Up / Log In with accent-tinted icon tiles), `signup` (First Name, Last Name, Email), `login` (Email only), and `pin` (the 4-slot driver-input PIN layout from the prior round, now calling the real verify-otp). Back button in the header returns to `select` (not to the prior form) so a user who picked the wrong path can re-choose. Inline `ErrorLine` surfaces `ApiError.detail` on 404/401/network failures. Submit buttons show "Please wait…" and dim while the request is in flight. "Resend code" in the PIN step re-calls `requestOtp` through whichever path had names (`signup` if both names filled, else `login`). Wrapped in a `ScrollView` + `KeyboardAvoidingView` so the small-screen keyboard doesn't cover the PIN slots.
- `consumer-app/src/HistoryScreen.tsx` — the new History tab. One `rounded-3xl` grouped card holding a list of `ActivityRow`s; each row = an icon tile (amber Coffee for EARN, green Gift for REDEEM) + title ("Earned 1 stamp" / "Redeemed 1 Free Drink") + cafe name/address line (MapPin icon) + "Balance after · X/10" eyebrow. Mock data: 5 entries spanning today → 2 weeks ago, across Shoreditch Roasters, King's Cross Coffee, Peckham Beans, and Brighton Lanes. Footer tip note references the append-only ledger.
- `consumer-app/src/RewardModal.tsx` — reusable native `Modal` (transparent, fade animation, status-bar translucent). Props: `visible`, `payload: RewardPayload | null`, `onClose`. Payload: `{stampsEarned, cafeName, cafeAddress, newBalance, freeDrinkUnlocked?}`. Backdrop `rgba(0,0,0,0.72)`; card is `surfaceElevated` with a caramel-tinted border + caramel shadow. Sparkles icon chip → "🎉 Nice one!" headline → "You've earned N stamps at {cafe}" body → cafe address pill → balance pill (switches to green "Free drink unlocked" chip when `freeDrinkUnlocked: true`) → full-width "Sweet!" accent button. Tap outside closes.
- `consumer-app/App.tsx` — `session: Session | null` replaces the boolean authed flag. LoginScreen calls `onAuthenticated(session)`. 4 tabs now — Home / History / Discover / Profile — with a `Clock` icon for History and `UserIcon` for Profile. HomeView reads `session.consumer.first_name` for the greeting and `session.consumer.consumer_id` for the QR value + read-aloud card (so whatever the backend actually generates shows up, not a hard-coded `A9X4B2`). Dashed dev-only button on Home labelled "Dev · Trigger Test Reward" (Sparkles icon) picks a random entry from `SAMPLE_REWARDS` and opens the modal. ProfileView shows full name, email, member code, and a Sign-out button that clears `session` back to the login gateway.

**Intentional gaps (still)**
- No AsyncStorage — refreshing the app drops you back to the login gateway. Session is in-memory only.
- No real email delivery. `_send_otp_email` is a `print()`. Wiring SES/Postmark is a later phase; only that function changes.
- No `get_consumer_session` dep / consumer-authed endpoints yet (balance, history). History tab is still mock data; it has not been wired to `stamp_ledger`. Reward modal payloads are sample data, not a real backend push — real integration will likely be SSE or a `GET /api/consumer/me/history` poll.
- No rate-limiting beyond `MAX_OTP_ATTEMPTS`. No CAPTCHA on `request-otp`, so a bad actor can enumerate emails via the 404 signal — acceptable for dev, rehash at hardening time.
- Expo `app.json` doesn't bake in `EXPO_PUBLIC_API_BASE_URL`; override per-machine via a local `.env` (gitignored) when the dev laptop's LAN IP changes.
- PyJWT `InsecureKeyLengthWarning` still fires on every token sign — `JWT_SECRET` default is 20 bytes. Hardening item: bump to ≥32 bytes before any non-local use.

### Physical-device network fix (2026-04-18)
Classic "the phone can't reach localhost" stumble when running the Consumer App in Expo Go on a real device. Three coordinated changes so it Just Works on any dev laptop without manual IP editing.

**Backend — bind + CORS**
- `app/main.py` gained an `if __name__ == "__main__"` block that calls `uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)` — so `python -m app.main` from the repo root is enough to boot a LAN-reachable dev server. The manual equivalent `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload` still works and is documented inline.
- `app/database.py::Settings.cors_origins` default changed from the explicit Vite-port allowlist (`localhost:5173` etc) to `"*"`. `cors_origin_list()` splits "," so a single `"*"` token yields `["*"]`. `allow_credentials=False` is already in place, so a wildcard is a legal CORS config — no cookies to leak.
- `.env` override still respected (`CORS_ORIGINS=...`) if a dev wants to tighten it. Tighten to an explicit allowlist before any non-local deploy.
- The existing Business Dashboard (running on `localhost:5173`) continues to work because `["*"]` is a superset.

**Consumer app — dynamic LAN IP**
- `npx expo install expo-constants` (SDK 54-compatible native module).
- `consumer-app/src/api.ts::resolveApiBaseUrl()` picks the backend URL in order of preference:
  1. `process.env.EXPO_PUBLIC_API_BASE_URL` if set — escape hatch for tunnels, staging, teammate's laptop.
  2. `Constants.expoConfig?.hostUri` (Expo SDK 49+) → split off the Metro port, reuse the IP on `:8000`. Falls back to `Constants.expoGoConfig?.hostUri`, then `manifest2.extra.expoClient.hostUri`, then `manifest.debuggerHost` for older SDKs.
  3. Platform-specific last resort: Android emulator → `http://10.0.2.2:8000` (the emulator's loopback back to the host OS); anything else → `http://127.0.0.1:8000`.
- `if (__DEV__) console.log("[api] base URL → ...")` logs the resolved URL once at boot, so the Metro console makes the "which backend are we hitting?" question disappear.
- No hard-coded `192.168.0.18` anymore. When the dev laptop's LAN IP changes (coffee shop, home, office), the phone re-derives correctly as long as Metro is serving on the right interface (Expo does this by default).

**Restart instructions for the user**
1. Stop the running uvicorn (Ctrl-C).
2. From the repo root: `python -m app.main` (or `uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload`). Server should print `Uvicorn running on http://0.0.0.0:8000`.
3. In a separate terminal: `cd consumer-app && npx expo start -c` (the `-c` clears the Metro cache so the new `api.ts` definitely loads).
4. On the phone, reload the app. First line in the Metro log should read `[api] base URL → http://<dev-laptop-LAN-IP>:8000`.
5. The Sign Up / Log In flow should now reach the backend; the OTP will print in the uvicorn terminal.

## 🧭 Hub and Spoke frontend architecture (finalized end of session, 2026-04-17)

The FastAPI backend is the **hub**. Three independent frontend **spokes** consume it, each with a distinct audience and surface area. This supersedes the earlier "two B2B surfaces" framing.

1. **Super-Admin** — hidden URL for Indie Coffee Loop platform staff. Brand provisioning, billing overrides, platform-wide analytics, compliance actions. **Not yet built**; will live at an unlisted URL and not link from any public surface.
2. **Consumer App** — future lightweight PWA for end customers. This is Phase 3b. Stamp balance(s) (scheme-scoped per brand — a user has N balances), reward state, participating-cafe map, SSE-driven live updates. **Still gated** — do not start until the user opens it explicitly for a specific feature.
3. **Business App** — the current [b2b-dashboard/](b2b-dashboard/) React/Vite/shadcn app. Will be unified behind a single **Admin vs Store login gateway** that routes a session to one of:
    - **Admin** surface = the existing brand-owner dashboard (Overview / Locations / Billing / Settings) already built with mock data.
    - **Store** surface = barista POS, migrated from the standalone [static/index.html](static/index.html) into this codebase (or bridged — exact approach TBD on resume).

The standalone Barista POS at `static/index.html` remains operational for now. The Business App's "Store" surface will supersede it once the gateway and the migrated POS are in place.

## ▶️ Very first step when we resume

**Phase 3 (B2B Dashboard + Billing) is 100% closed and production-ready.** Every Business App surface is wired — login, POS, dashboard reads + writes, Stripe checkout + webhook. Remaining candidates are discretionary, not loose ends:
1. **Phase 3b (Consumer PWA / SSE / map)** — the obvious next phase. Still gated — don't start without an explicit user nudge.
2. **Store credential provisioning UI** — `POST /api/admin/cafes` already accepts optional `store_number` + `pin`; `AddLocationDialog` doesn't surface them yet, so new cafes aren't POS-loginable until seeded manually.
3. **Stripe Customer Portal** — "Download invoices" is still disabled in `BillingView`. Add a `POST /api/billing/portal` endpoint (`stripe.billing_portal.Session.create`) and wire it.
4. **Hardening** — rotate `JWT_SECRET` to ≥32 bytes (current default throws PyJWT `InsecureKeyLengthWarning`); add refresh tokens so admins don't re-login every 12 h; production SPA hosting needs a history-fallback rule for `/success` + `/cancel` (Vite dev handles it automatically).

## Brand architecture (current)

The platform now has two tenancy tiers. A **Brand** is the top-level paying entity; a **Cafe** is a physical branch owned by exactly one Brand. Brands pick a loyalty scheme at creation time:

- `scheme_type = 'global'` — The Indie Loop. Stamps earned at any GLOBAL brand's cafe pool together across the whole network.
- `scheme_type = 'private'` — walled garden. Stamps pool only across this Brand's own cafes.

Billing lives at the Brand tier: `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`. A Cafe has no billing fields of its own — it inherits its gate from `cafe.brand.subscription_status`. The standalone `subscriptions` table has been dropped; all billing fields are on `brands` directly.

### Data model
- [app/models.py](app/models.py)
    - `Brand` — `id`, `name`, `slug` (unique), `contact_email`, `scheme_type` (enum `scheme_type`), `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `current_period_end`, `created_at`. Indexes on `subscription_status` and `scheme_type`.
    - `Cafe` — now `id`, `brand_id` → `brands.id` ON DELETE CASCADE, `name`, `slug` (unique), **`address`** (NOT NULL), `contact_email`, `created_at`. No `subscription_status` on cafes anymore.
    - `User`, `Barista`, `StampLedger` — unchanged.
    - `scheme_type` PG enum (`'global' | 'private'`) added alongside the existing `ledger_event_type` and `subscription_status` enums. All three use `create_type=False` — the DB owns the types; the ORM just references them.
- [models.sql](models.sql) — rewritten to match; brands come before cafes, dropped the `subscriptions` table, added `scheme_type` enum and `brands` table.

### Balance computation (scheme-scoped)
Balance is no longer a single SUM over the ledger. It's scoped at read time by the **scanning cafe's brand**:
- **PRIVATE:** `SUM(stamp_delta)` where `stamp_ledger.cafe_id ∈ cafes of this Brand`.
- **GLOBAL:** `SUM(stamp_delta)` where `cafe.brand.scheme_type = 'global'` (any global brand's cafe).

Implementation: [app/main.py](app/main.py)::`_scoped_balance_stmt` builds the JOIN + filter. `_lock_user_and_read_scoped_balance` takes the scanning `Brand` and calls it inside the `SELECT ... FOR UPDATE` transaction on the user row. Both `POST /api/venues/stamp` and `POST /api/venues/redeem` now load the Brand from `cafe.brand_id` and pass it through. The admin `GET /api/users/{user_id}/balance` still returns the unscoped total SUM (admin view, not a customer-facing number).

### Consequence: a user has N balances
A user now effectively has one balance per private brand they've interacted with PLUS one shared global balance. The consumer PWA (Phase 3) will need to decide how to present this — one balance per brand card is the natural model. The POS only ever shows the balance relevant to the currently-scanning cafe's brand, so it doesn't need to know.

### Routes
- **New:** `POST /api/admin/brands` (create with `scheme_type`, defaults to `global`), `POST /api/admin/brands/{brand_id}/activate`, `POST /api/billing/checkout` takes `{"brand_id"}`, webhook metadata is `brand_id`.
- **Changed:** `POST /api/admin/cafes` now requires `brand_id` + `address`. `POST /api/admin/cafes/{cafe_id}/activate` is **removed** — activation is per Brand.
- **Unchanged:** `POST /api/venues/stamp`, `POST /api/venues/redeem`, `POST /api/admin/users`, `GET /api/users/{user_id}/balance`. The `Venue-API-Key` is still the Cafe's UUID; the gate now checks `cafe.brand.subscription_status`.

### Verified end-to-end on 2026-04-17
Smoke test created GA + GB (global), P (private with 2 cafes), one user. After 2 stamps at GA, 3 at GB, 2 at P1, 1 at P2:
- Next scan at GB (global) → balance **6** (2+3+1, excludes private).
- Next scan at P2 (private) → balance **4** (2+1+1, excludes global).
Pools are correctly isolated.

## Phase 3a — B2B Business Dashboard shell (shipped 2026-04-17)

A separate frontend project lives at `b2b-dashboard/` at the repo root. It's a standalone Vite app — it does **not** share tooling with the FastAPI backend.

### Role & scope — owner dashboard, not super-admin

The dashboard is scoped to a **single brand owner**. The logged-in owner sees the brand they own and nothing else. There is no "create a new brand" UI, no brand switcher, and no Super-Admin / platform-operator surface. When a new brand needs to be provisioned, that happens outside this app (admin API or sales onboarding).

**Explicit surface boundaries:**
- Owner dashboard (`b2b-dashboard/`) — sees analytics (Total Scans, Active Branches, Current Plan), location list, billing, brand settings. Scoped to **the owner's own brand**.
- Barista POS ([static/index.html](static/index.html)) — separate, lightweight, **single-page** app served by FastAPI. The scanner only shows the **per-customer scan result** (till_code balance X/10, reward modal, toasts). It has **no aggregate analytics, no branch lists, no revenue / growth numbers**. Audited 2026-04-17: confirmed the only balance the POS ever renders is the single scanning customer's balance on their own card (needed for the reward prompt), which is operational, not analytical.

### Stack
- **Vite 8.0.8** (`npm create vite@latest -- --template react-ts`).
- **React 19** + **TypeScript** (strict, with path alias `@/* → src/*`).
- **Tailwind CSS v4** via `@tailwindcss/vite` plugin. CSS entry is `@import "tailwindcss"` in [b2b-dashboard/src/index.css](b2b-dashboard/src/index.css); shadcn added `@import "tw-animate-css"`, `@import "shadcn/tailwind.css"`, `@import "@fontsource-variable/geist"`, `@custom-variant dark`, plus the full `@theme inline` token block. Both `:root` (light) and `.dark` palettes are present; the app renders light-mode.
- **shadcn/ui** initialised with `--template vite --base radix --preset nova` (Nova = Lucide + Geist). Components in [b2b-dashboard/src/components/ui/](b2b-dashboard/src/components/ui/): `button`, `card`, `input`, `dialog`, `select`, `table`. `src/lib/utils.ts` holds `cn()`.
- **lucide-react** for icons.

### App structure
- [b2b-dashboard/src/App.tsx](b2b-dashboard/src/App.tsx) — top-level layout. Owns `nav: NavKey`, `brand: Brand`, **`cafes: Cafe[]`** (initialised from `initialCafes`), and `addLocationOpen: boolean`. Renders `<Sidebar>` + main column (`<Topbar>` sticky, then one of the four views). No router yet.
- [b2b-dashboard/src/components/Sidebar.tsx](b2b-dashboard/src/components/Sidebar.tsx) — left rail. Brand lockup, four nav items (Overview / Locations / Billing / Settings), and a **user chip at the bottom that reads `{brand.name}`** from App state — dynamic, bound to the current brand, not a hardcoded string.
- [b2b-dashboard/src/components/Topbar.tsx](b2b-dashboard/src/components/Topbar.tsx) — sticky topbar with section title/sub, a scheme-status pill (Global · Indie Loop / Private · Walled Garden), ornamental search, and the **primary button, now labelled "Add New Location"** (prop: `onOpenAddLocation`). This button does **not** create a new brand.
- [b2b-dashboard/src/components/AddLocationDialog.tsx](b2b-dashboard/src/components/AddLocationDialog.tsx) — the Add Location flow. Inputs: **Branch name** + **Address** (that's it). The description makes explicit that the new branch inherits `{brand.name}`'s subscription and the brand's loyalty scheme (`Global Indie Loop` / `Private Chain`). Submit generates a random `c-xxxxxx` id and appends to `cafes` via `onAdd`. The cafe name is stored as `"{brand.name} — {branchName}"` to stay consistent with seed data. **No scheme selector** — scheme is a brand-level decision, not a branch-level one; it's edited from Settings instead.
- [b2b-dashboard/src/components/MetricCard.tsx](b2b-dashboard/src/components/MetricCard.tsx) — reusable metric tile (accent top bar, Lucide icon chip, tabular-nums value, unit, up/down delta).
- [b2b-dashboard/src/views/OverviewView.tsx](b2b-dashboard/src/views/OverviewView.tsx) — three owner-only metric cards: **Total scans** (sum of `cafes[].scansThisMonth`), **Active branches** (`live` count / total), **Current plan** (`brand.plan` + `brand.planPrice`). Below: top-branches list with progress bars (or empty state if the owner has no locations yet) + scheme info side card. Takes `cafes: Cafe[]` as a prop; computes totals at render time, no `mockCafes` import.
- [b2b-dashboard/src/views/LocationsView.tsx](b2b-dashboard/src/views/LocationsView.tsx) — shadcn Table of cafes with initials badge, mono id, address, scans (30d), status pill. Has its own **Add location** button in the header that opens the same dialog. Renders an empty-state row when `cafes.length === 0`.
- [b2b-dashboard/src/views/BillingView.tsx](b2b-dashboard/src/views/BillingView.tsx) — subscription card + payment-method card (Visa •••• 4242 mock).
- [b2b-dashboard/src/views/SettingsView.tsx](b2b-dashboard/src/views/SettingsView.tsx) — brand profile inputs (name / slug / email, bound to App state) + a `<Select>` that lets the owner swap `schemeType` live, with a coloured info callout. Changing the scheme here is a legitimate owner action (it re-scopes their loyalty pool); it is **not** creating a new brand.
- [b2b-dashboard/src/lib/mock.ts](b2b-dashboard/src/lib/mock.ts) — `Brand` + `Cafe` types, `initialBrand` (Halcyon Coffee Co., Growth plan, global scheme), and `initialCafes` (four seed branches: Shoreditch / King's Cross / Peckham / Brighton Lanes). No more derived `totalScans` / `activeBranches` — those are computed in the view from current state so they update when the owner adds a location.

### Design language
- Stripe/Vercel-inspired: hairline borders, soft `bg-muted/30` panels, tabular-nums + mono for numerics, thin status pills with coloured dots, accent bars on metric cards. Geist variable font.
- Light mode only in practice. Not responsive below ~1024px.

### Build + verification (post-owner-refactor, 2026-04-17)
- `npx tsc -b` → clean.
- `npm run build` → `dist/` built, 333 kB JS gzip 104 kB, 48 kB CSS gzip 9 kB.
- `npm run dev` on 127.0.0.1:5276 → serves cleanly. All updated modules (App.tsx, AddLocationDialog.tsx, Topbar.tsx, OverviewView.tsx, LocationsView.tsx, mock.ts) 200 through HMR. (Note: the old `OnboardingDialog.tsx` file has been deleted from disk and is not imported anywhere; the production build confirms it is not bundled.)

### Not done yet (intentionally)
- No backend wiring. `AddLocationDialog.onAdd` does not POST to `/api/admin/cafes`; it appends to local state. Scans/plan numbers are mock.
- No router (`nav` is a `useState`).
- No B2C Consumer PWA / SSE / map — Phase 3b remains gated until the user opens it for a specific feature.

## Phase 3a — Admin/Store Login Gateway (shipped 2026-04-18)

The Business App now boots into a gateway screen instead of dropping straight into the admin dashboard. Session state lives at the top of `App.tsx`; unauthenticated users see the gateway, Admin sessions see the existing shell, Store sessions see a dedicated POS surface.

### Files
- [b2b-dashboard/src/views/LoginView.tsx](b2b-dashboard/src/views/LoginView.tsx) — the gateway. Three internal modes (`select` / `admin` / `store`) driven by local state. Selection mode renders two premium role cards (ShieldCheck + emerald accent for Admin, Store + violet accent for Store) with hover-lift, accent top-bar, and `ring-1 ring-foreground/10`. Picking a role swaps to a focused form view with a "Back to selection" affordance. Admin form = email + password (basic shape validation: `/.+@.+\..+/` and `password.length >= 6`). Store form = Store ID (`/^[A-Z0-9]{3,10}$/`, auto-upper-cased, no prefix) + 4-digit PIN (masked, numeric-only, `tracking-[0.4em]`). On success calls `onAuthenticated(session)` with the shape `{role, ...}`.
- [b2b-dashboard/src/views/BaristaPOSView.tsx](b2b-dashboard/src/views/BaristaPOSView.tsx) — the Store-path surface. Lightweight header (brand lockup + cafe name + store-number pill + Sign-out button) above a centered "Ready to scan" card with a dashed-border aspect-video placeholder for the live html5-qrcode viewport. Deliberately carries **no** aggregate analytics (consistent with the non-negotiable that the Store surface stays operational only).
- [b2b-dashboard/src/lib/mock.ts](b2b-dashboard/src/lib/mock.ts) — now exports a `Session` discriminated-union type: `{role: 'admin', email, brandName} | {role: 'store', storeNumber, cafeName}`. Mock values assume the single-owner seed brand (`Halcyon Coffee Co.` / `Halcyon Coffee Co. — Shoreditch`).
- [b2b-dashboard/src/App.tsx](b2b-dashboard/src/App.tsx) — wraps the existing shell in a session guard. No session → `<LoginView>`; `role === 'store'` → `<BaristaPOSView>`; `role === 'admin'` → the unchanged Sidebar/Topbar/views layout. Both paths have a Sign-out control that clears the session back to the gateway.
- [b2b-dashboard/src/components/Sidebar.tsx](b2b-dashboard/src/components/Sidebar.tsx) — user chip footer gained an optional `onLogout` prop rendered as a small `LogOut` icon button next to the brand chip. Prop is optional so the component stays reusable.

### Design language carried over
Matches the Stripe/Vercel-inspired aesthetic already in use: `bg-card` panels with `ring-1 ring-foreground/10`, hairline borders, `font-heading` for titles, accent top-bars (2px emerald/violet), coloured tint chips for the role icons, subtle radial-gradient background on the gateway page. Geist variable font, light-mode only.

### Mock auth — explicit non-goals
- No backend call. `onAuthenticated` synchronously promotes the session in React state.
- No credential check. Any well-formed email/password or Store/PIN is accepted — validation is purely shape-based so the UI can be exercised without a seeded user store.
- No persistence. Refreshing the page drops the session. Persistent session state will land when real auth is wired.

### Build + verification (2026-04-18)
- `npx tsc -b` → clean.
- `npm run build` → `dist/` built; ~347 kB JS gzip ~108 kB, ~53 kB CSS gzip ~10 kB.
- `npm run dev` on http://localhost:5173 → serves cleanly; HMR transforms `App.tsx`, `LoginView.tsx`, `BaristaPOSView.tsx`, `Sidebar.tsx`, and `lib/mock.ts` all 200.

## Phase 3a — Barista POS React migration (shipped 2026-04-18)

The standalone `static/index.html` POS has been ported into the Business App's Store surface. The old page is still served by FastAPI for now (as a fallback / reference); the React version lives inside the gateway-protected `b2b-dashboard/` app.

### Package
- `npm install html5-qrcode` — same library the static page used (v2.3.8 upstream). ESM import as `import { Html5Qrcode } from "html5-qrcode"`. Build bundle grew from ~347 kB → ~731 kB (gzip ~221 kB) on account of the library + its deps. Vite auto-optimizes it.

### Files
- [b2b-dashboard/src/views/BaristaPOSView.tsx](b2b-dashboard/src/views/BaristaPOSView.tsx) — the scanner. Scanner instance in `useRef` (mutable, doesn't trigger re-renders). State machine: `idle | starting | running | paused | error`. Uses a sanitized `useId()` as the DOM element id for the html5-qrcode viewport (colons stripped so the id is CSS-selector-safe).
- [b2b-dashboard/src/components/RewardDialog.tsx](b2b-dashboard/src/components/RewardDialog.tsx) — the Smart Pause modal. Shadcn Dialog with `showCloseButton={false}` + `onInteractOutside`/`onEscapeKeyDown` prevent-default so the barista must actively pick Redeem Now or Save for Later (mirrors the original page's modal semantics).
- [b2b-dashboard/src/index.css](b2b-dashboard/src/index.css) — added a `scan-line` keyframe + `.animate-scan-line` utility (2.4s ease-in-out) for the emerald scanning line overlay. Also hides html5-qrcode's default select/anchor chrome inside `#barista-reader` so the viewport is fully owned by our own premium frame.

### Logic preserved verbatim from static/index.html
- Till code pattern `/^[A-Z0-9]{6}$/`.
- `SCAN_COOLDOWN_MS = 2500` — same-value dedupe (avoids hammering the stamp endpoint when the camera re-reads the same code).
- `REWARD_RESOLVED_COOLDOWN_MS = 10_000` — "move the card away" protection: the same till code cannot trigger a new scan for 10 seconds after a Redeem/Save. Implemented with a `rewardResolvedRef` the scan handler checks before it does anything else.
- `inFlightRef` guards against overlapping stamp calls (mirrors the old `inFlight` module var).
- On `balance >= REWARD_THRESHOLD` (10) or `reward_earned`, the reward prompt opens and the scanner is paused via `scanner.pause(true)`. On Redeem / Save, the cooldown is armed and the scanner resumes.

### Mock backend (intentional, for this step)
- `mockStamp(tillCode)` — increments a local `Map<tillCode, balance>` up to 10, with a 220ms delay to mimic network latency. Returns `{balance, rewardEarned}`.
- `mockRedeem(tillCode)` — resets that till code's balance to 0, 260ms delay.
- Balances live only in a `useRef` Map — they do **not** persist across refreshes or even across unmounts of the view. This is deliberate: wiring to the real backend is the next step (see "Very first step when we resume" above).

### Premium UI treatment
- Scanner card: Stripe/Vercel-style `ring-1 ring-foreground/10`, violet accent top-bar, animated state pill (Idle / Starting / Live / Paused / Error).
- Camera viewport: 1:1 aspect-square, deep `bg-neutral-950`, corner-bracket frame overlay (absolute `div`s), emerald scanning line with a soft green glow shadow while running. Dark overlays when idle/starting/paused.
- Reward dialog: amber gradient wash at the top, `PartyPopper` icon in a ring-1 amber circle, "Reward ready" chip, balance/status split panel, full-width primary Redeem + outline Save for Later. Scanner-paused reassurance line at the bottom.
- Toast pill: fixed pill at the bottom center, variant-coloured (success / error / warn / info), auto-dismisses at 3s. Lighter weight than the old bottom-toast but keeps the `role="status"` live region.
- Dev-only "Simulate a scan" form is a dashed-border card at the bottom — intentionally visible so the stack can be exercised without a physical till code, and explicitly labelled "Dev · simulate a scan" so it's clear it's a development affordance.

### What this does NOT do yet (intentional, carried forward)
- No real backend call. `mockStamp` / `mockRedeem` are local.
- No `Venue-API-Key` wiring. The store login captures `storeNumber` + PIN; a real implementation will exchange those for a cafe's API key (or use short-lived barista tokens).
- No camera permission pre-flight. We rely on the browser's native permission prompt when `scanner.start()` is called.
- No decode-of-bad-codes analytics. We log rejected scans into the "Ignored scan" activity card but don't surface them anywhere else.

### Build + verification (2026-04-18)
- `npx tsc -b` → clean.
- `npm run build` → `dist/` built; ~731 kB JS gzip ~221 kB, ~62 kB CSS gzip ~11 kB. Vite warns about the chunk size (expected — html5-qrcode is sizeable; future improvement: `React.lazy` the Store path).
- `npm run dev` on http://localhost:5173 → serves cleanly; HMR re-transformed `BaristaPOSView.tsx` + `index.css` and auto-optimized the new `html5-qrcode` dep with no errors. Camera boot itself is browser-gated on real hardware — not exercisable from a headless CI context.

## Phase 3a — Backend auth + POS wiring (shipped 2026-04-18)

The Business App now talks to the real FastAPI backend for login and stamp/redeem. Dev-mode credentials only — do NOT deploy as-is (see "Very first step when we resume").

### New backend files
- [app/tokens.py](app/tokens.py) — thin PyJWT wrapper. Two audiences: `admin` (claims: `brand_id`, `brand_name`, `email`) and `store` (claims: `cafe_id`, `brand_id`, `cafe_name`, `brand_name`, `store_number`, `venue_api_key`). HS256 signed with `settings.jwt_secret`, default TTL 12 h, issuer `indie-coffee-loop`. `decode(token, audience)` verifies signature + audience + issuer.
- [app/auth_routes.py](app/auth_routes.py) — `POST /api/auth/admin/login` and `POST /api/auth/store/login`. Both return a JWT plus a profile payload. `derive_store_number(cafe) -> "STORE-" + cafe.id.hex[:4].upper()` — deterministic dev-mode store number derived from the cafe's UUID so we don't need a new DB column. 401s are uniform ("Invalid email or password." / "Invalid store number or PIN.") to avoid leaking whether a row exists. `hmac.compare_digest` guards against timing attacks on the shared dev secret.

### Changed backend files
- [app/database.py](app/database.py) — `Settings` gained `jwt_secret` (default `"dev-secret-change-me"`), `jwt_ttl_hours` (12), `dev_admin_password` (`"letmein2026"`), `dev_store_pin` (`"1234"`), `cors_origins` (comma-separated list with the Vite dev ports baked in). `Settings.cors_origin_list()` splits and trims.
- [app/main.py](app/main.py) — CORS tightened from `["*"]` to `settings.cors_origin_list()` with explicit methods (`GET, POST, PUT, PATCH, DELETE, OPTIONS`); `allow_credentials=False` (Bearer tokens travel in headers, not cookies). `auth_router` registered before `billing_router` and before the `StaticFiles` mount so `/api/*` always takes precedence.
- [app/schemas.py](app/schemas.py) — new request/response models: `AdminLoginRequest`, `StoreLoginRequest`, `AdminLoginResponse`, `StoreLoginResponse`, `AdminProfile`, `BrandProfile`, `CafeProfile`.
- [requirements.txt](requirements.txt) — `pyjwt` added.
- [.env.example](.env.example) — documents `JWT_SECRET`, `JWT_TTL_HOURS`, `DEV_ADMIN_PASSWORD`, `DEV_STORE_PIN`, and `CORS_ORIGINS`. The user's local `.env` was intentionally not touched — the defaults in `Settings` mean the app boots without any new env vars.

### New / changed frontend files
- [b2b-dashboard/src/lib/api.ts](b2b-dashboard/src/lib/api.ts) (new) — API client. `API_BASE_URL` reads `import.meta.env.VITE_API_BASE_URL` with default `http://localhost:8000`. Typed helpers: `adminLogin(email, password)`, `storeLogin(storeNumber, pin)`, `stamp(venueApiKey, tillCode)`, `redeem(venueApiKey, tillCode)`. Custom `ApiError` class preserves HTTP status + detail so the scanner can map 401/402/404/409/422 paths. `loadPersistedSession()` / `persistSession()` use `localStorage` key `icl_session_v1` — robust to private-mode browsers (try/catch'd).
- [b2b-dashboard/src/lib/mock.ts](b2b-dashboard/src/lib/mock.ts) — `Session` union now carries `token` on both variants, `brandId` + `schemeType` on admin, `venueApiKey` on store. Everything else (`initialBrand`, `initialCafes`) remains mock scaffolding for the dashboard view state when no real brand has loaded yet.
- [b2b-dashboard/src/views/LoginView.tsx](b2b-dashboard/src/views/LoginView.tsx) — forms now hit `adminLogin` / `storeLogin`, show a spinner in the submit button while pending, render the server's `detail` string in the inline error slot, and keep inputs disabled mid-submit. Store regex loosened to `/^STORE-[A-Z0-9]{3,}$/` to accept the UUID-derived numbers. Submission bubbles up the full `(session, brand?)` pair so `App.tsx` can seed the dashboard brand state from the real backend response.
- [b2b-dashboard/src/App.tsx](b2b-dashboard/src/App.tsx) — rehydrates the session from `localStorage` in `useState`'s initializer (so a page refresh doesn't drop you back to the gateway). `useEffect([session])` persists on any change. `handleLogout` clears the session AND resets `brand` and `cafes` back to `initialBrand` / `initialCafes` so the next login can't see stale state.
- [b2b-dashboard/src/views/BaristaPOSView.tsx](b2b-dashboard/src/views/BaristaPOSView.tsx) — `mockStamp` / `mockRedeem` removed; `balancesRef` removed. `processScan` and `onRedeem` now call `apiStamp` / `apiRedeem` with `session.venueApiKey`. New `handleApiError` callback maps status codes to the same toast + status-line + activity-card patterns the static POS used (401 → auth failed, 402 → billing required, 404 → customer not found, 409 → redeem rejected, 422 → invalid format, network error → toast with the underlying message). On a 409 to redeem, the modal is dismissed and the re-scan cooldown is armed, mirroring the old page's behaviour.

### Dev credentials (SUPERSEDED by per-row hashes — retained for the timeline)
Shared secrets (`letmein2026` / `1234`) and the derived-from-UUID store number were the first-cut implementation. They were **removed** on the same day in favour of per-row bcrypt hashes — see the next section.

### Build + verification (2026-04-18)
- `python -c "from app.main import app; print([r.path for r in app.routes])"` → both new `/api/auth/*` routes listed. FastAPI imports cleanly with no schema changes.
- `uvicorn app.main:app` → boots cleanly on `127.0.0.1:8000`. `OPTIONS /api/auth/admin/login` from `Origin: http://localhost:5173` → 200 with `access-control-allow-origin: http://localhost:5173` (CORS preflight verified). Bad-body requests return 422 with structured Pydantic detail. Login requests 500 when Postgres isn't up (asyncpg `ConnectionRefusedError`) — this is a local environment detail, not a code bug; `docker compose up -d` restores it.
- `npx tsc -b` → clean. `npm run build` → `dist/` built; ~734 kB JS gzip ~222 kB, ~62 kB CSS gzip ~11 kB. Vite dev server HMR'd `App.tsx`, `LoginView.tsx`, `BaristaPOSView.tsx`, and `lib/api.ts` cleanly.

### Intentional non-goals this phase
- No refresh tokens / token rotation. JWT TTL is 12 hours; after expiry the user has to sign in again.
- No Super-Admin spoke. Admin login still authenticates **against a single Brand's `contact_email`** — it's a brand-owner login, not a platform-operator login.
- `Venue-API-Key` is still the raw cafe UUID (inside the JWT's `venue_api_key` claim, so the frontend can extract it). `get_active_cafe` is unchanged, so the standalone `static/index.html` POS continues to work against the same endpoints.

## Phase 3a — Production auth with per-row hashes (shipped 2026-04-18)

The shared dev secrets are gone. Admin and Store login both verify against bcrypt hashes stored per row, and response timing is uniform whether or not the identifier matches a row.

### Schema migration
- [migrations/0001_add_auth_columns.sql](migrations/0001_add_auth_columns.sql) — idempotent. Adds `brands.password_hash TEXT`, `cafes.store_number TEXT UNIQUE`, `cafes.pin_hash TEXT`, a `UNIQUE INDEX idx_cafes_store_number`, and a `store_number_format` CHECK (`^STORE-[A-Z0-9]{3,10}$`). Applied to the local DB 2026-04-18 via `docker exec -i … psql … < migrations/0001_add_auth_columns.sql`.
- [models.sql](models.sql) — updated to reflect the post-migration state so fresh deploys get it on first schema load.
- [app/models.py](app/models.py) — `Brand.password_hash`, `Cafe.store_number` (unique), `Cafe.pin_hash`, plus the `store_number_format` CheckConstraint mirrored on the ORM.

### New / changed backend files
- [app/security.py](app/security.py) (new) — `hash_password(pwd) -> str` and `verify_password(pwd, hash) -> bool` using `bcrypt` directly. `verify_password` returns False on malformed hashes rather than raising, so a corrupted row fails closed. Reused for both brand passwords and store PINs.
- [app/auth_routes.py](app/auth_routes.py) — rewritten. Admin login: `SELECT * FROM brands WHERE lower(contact_email) = ?`; verify password against `brand.password_hash`. Store login: `SELECT * FROM cafes WHERE store_number = ?`; verify PIN against `cafe.pin_hash`; still gates on `brand.subscription_status == 'active'`. A module-level `_DECOY_HASH` is used when the lookup returns None so `verify_password` runs either way — timing-safe. 401 details are uniform ("Invalid email or password." / "Invalid store number or PIN.").
- [app/database.py](app/database.py) — `dev_admin_password` + `dev_store_pin` settings removed. `jwt_secret` + `jwt_ttl_hours` + `cors_origins` stay.
- [app/tokens.py](app/tokens.py) — unchanged; JWT claims shape was already correct for per-row auth.
- [requirements.txt](requirements.txt) — `bcrypt` added.
- [.env.example](.env.example) — `DEV_ADMIN_PASSWORD` + `DEV_STORE_PIN` removed; comment now notes that per-row creds live in `brands.password_hash` + `cafes.pin_hash`.

### Test credentials seeded locally (2026-04-18)
Seed was a one-shot `seed_test_data.py` in the repo root — **deleted after a successful run** so it doesn't get committed. Seeded rows:
- **Brand** `Test Coffee Co` — slug `test-coffee-co`, scheme `global`, subscription `active`, `contact_email = admin@test.com`, bcrypt(`password123`).
- **Cafe** `Test Coffee Co — Flagship` — slug `test-coffee-co-flagship`, `store_number = 001` (rewritten from the original `STORE-001` by migration 0002), bcrypt PIN `1234`, address `1 Example Street, London EC1A 1AA`.
- Login creds: `admin@test.com` / `password123` (admin) and `001` / `1234` (store). The cafe's UUID (which is the Venue-API-Key) is returned in both the JWT and the top-level `venue_api_key` field of the store login response.

### End-to-end verification
- Migration: `ALTER TABLE` × 3 + `CREATE UNIQUE INDEX` + `DO $$` block all returned success. `\d brands` / `\d cafes` confirm columns, index, and constraint in place.
- Admin login (correct creds) → 200 + JWT with `aud: admin`, `brand_id`, `brand_name`, `email`.
- Admin login (wrong password) → 401 with `Invalid email or password.`
- Admin login (old dev password `letmein2026`) → 401 (proves shared secret is retired).
- Store login (correct creds) → 200 + JWT with `aud: store`, `venue_api_key = cafe.id`, `store_number`, `cafe_name`, `brand_name`.
- Store login (wrong PIN) → 401 with `Invalid store number or PIN.`

### Operational notes
- Rerun the seed (if you ever need to reset passwords) by recreating the script — it was idempotent and would re-hash creds on an existing row with the same slug / store_number. The seed is not committed; you'd write it fresh if needed.
- Going forward, any new brand/cafe needs `password_hash` / `pin_hash` set explicitly. The admin API `POST /api/admin/cafes` does NOT accept these fields yet — that's the next step (see "Very first step when we resume").

## Phase 2 progress (pre-pivot)

- [x] **Security gate on venue routes.** [app/auth.py](app/auth.py) `get_active_cafe` dep. Reads `Venue-API-Key` (401 if missing/invalid), loads the Cafe and its Brand, gates on `brand.subscription_status == 'active'` (402 otherwise). Both `POST /api/venues/stamp` and `POST /api/venues/redeem` use the dep. Cafe identity is taken exclusively from the authenticated venue — no `cafe_id` in the request body.
- [x] **Barista POS frontend (Smart Pause redemption flow).** [static/index.html](static/index.html) — single mobile-responsive HTML5 + Vanilla JS page. API key in `localStorage`, html5-qrcode scanner, 2.5s dedupe, Smart Pause modal on reward with Redeem Now / Save for Later buttons, 10s re-scan protection. Toast `z-index: 250` > modal `z-index: 200`. Served via `app.mount("/", StaticFiles(directory="static", html=True))` as the final statement of [app/main.py](app/main.py). No changes needed from the Brand pivot — the stamp response shape is unchanged and the Venue-API-Key semantics still hold.
- [x] **Stripe Billing API (checkout + webhook).** [app/billing.py](app/billing.py). `POST /api/billing/checkout` now body `{"brand_id"}`; looks up Brand, creates GBP 500/month Checkout Session with `metadata.brand_id` + `client_reference_id = brand.id`. `POST /api/billing/webhook` on `checkout.session.completed` resolves `metadata.brand_id` (fallback `client_reference_id`), flips `brands.subscription_status = ACTIVE`, and persists `stripe_customer_id` + `stripe_subscription_id` from the event if they aren't already set. `DEBUG_SKIP_STRIPE_SIG=true` still bypasses signature verification for local testing.
- [ ] **Barista authentication.** (Phase 2 nice-to-have.)

## Phase 1 progress (historical)

- [x] Scaffolding & ORM models, docker-compose + Postgres 15, schemas, atomic stamp & redeem routes, till_code `^[A-Z0-9]{6}$`.

### Deferred from Phase 1
- Automated concurrency load test proving zero double-stamps under N simultaneous stamp calls for the same user (PRD KR2). Correct by construction via the row lock, no test harness yet.

## Not now (do not write code for these yet)

- **Phase 3** — Consumer PWA, Server-Sent Events live stamp updates, map discovery of participating cafes.

## Rule

Frontend architecture is three spokes: **Super-Admin** (hidden, platform staff), **Consumer App** (future PWA, Phase 3b, gated), and **Business App** (current `b2b-dashboard/`, will gain an Admin vs Store login gateway). The existing owner dashboard lives behind the **Admin** surface of the Business App; the existing `static/index.html` POS will migrate into the **Store** surface.

**Non-negotiables carried forward:**
- Analytics (Total Scans / Active Branches / Current Plan / revenue-like numbers) live **only** on the Admin surface. The Store surface (POS) stays lightweight and operational — it must **never** render aggregate analytics.
- No super-admin or "create brand" flow inside the Business App. Brand provisioning stays on the Super-Admin spoke (or out-of-band admin API) — never on the owner-facing Admin surface.
- Phase 3b (Consumer PWA, SSE, map) is still gated — do NOT start until the user opens it explicitly for a specific feature.

## 🆕 April 20 — 405 Fixes & CRUD Completion

Phase 3a hardening + Phase 4 consumer polish. All items below are verified against code on disk (not recalled from memory).

### 1. DB + Model + UI: amenities & food hygiene rating
- `migrations/0005_add_amenities_and_offers.sql` → `cafes.amenities TEXT[]` (+ standalone `offers` table).
- `migrations/0007_add_food_hygiene_rating.sql` → `cafes.food_hygiene_rating TEXT NOT NULL DEFAULT 'Awaiting Inspection'` with CHECK allow-list (`'1'..'5' | 'Awaiting Inspection'`).
- SQLAlchemy model `app/models.py:138` (`food_hygiene_rating`) + `:146` (`amenities: Mapped[list[str]]`) — both mapped.
- B2B UI: `AddLocationDialog` + `EditLocationDialog` expose a hygiene-rating `Select` above a 9-checkbox amenity grid (catalog in `b2b-dashboard/src/lib/amenities.ts`, mirrored in `consumer-app/src/amenities.ts`).

### 2. 405 Method Not Allowed — fixed for Add & Edit Location
Root causes found + resolved (five diagnosis passes, consolidated):
- `app/main.py:85` → `FastAPI(redirect_slashes=False)` prevents 307 → method-mangling.
- Update handler double-decorated: `@app.patch` **and** `@app.put` on `/api/admin/cafes/{cafe_id}` (`app/main.py:424-425`) so either verb routes.
- Frontend `deleteCafe` / `updateCafe` guarded by `requireCafeId()` — empty ids fail fast instead of hitting the list route (which was the real DELETE 405).
- CORS widened to `allow_methods=["*"]`; startup banner (`app/main.py:102`) logs registered `/api/admin/cafes*` routes on every uvicorn reload so staleness is visible.
- Phantom "POST saves but UI shows error" traced to a follow-up `refreshAdminData` throwing through the dialog's single try/catch — post-create steps are now best-effort `console.warn`.

**Status:** `POST` Add Location = 201 ✅. `PUT` Edit Location = 200 ✅ (hard-verified with real JWT via TestClient).

### 3. Delete RPC workaround (POST instead of DELETE)
The browser's DELETE verb was being blocked by an intermediary in the dev stack even after CORS was widened. Nuclear fix:
- New endpoint `app/main.py:499` → `@app.post("/api/admin/cafes/{cafe_id}/delete")` returns `{"status":"success","deleted_id":"<uuid>"}`.
- Both the new POST route and the original REST `DELETE /api/admin/cafes/{cafe_id}` call the shared `_delete_cafe_impl` (`app/main.py:469`), so behavior can't drift.
- Frontend `deleteCafe` (`b2b-dashboard/src/lib/api.ts:375`) fires the POST variant; UI strips the row optimistically on 200, then reconciles via `refreshAdminData`.
- E2E verified: click Trash → row vanishes → page refresh confirms DB removal.

### 4. Consumer App UI polish
- `consumer-app/src/FoodHygieneBadge.tsx` → native UK FSA sticker (black `#000000` + bright green `#00B140`). Numeric 1-5 renders 72px circle + 5-star row + `VERY GOOD`-style label; `Awaiting Inspection` keeps sticker chrome with a bordered panel.
- `consumer-app/src/CafeDetailsModal.tsx` → full-screen slide-up with dynamic amenity chips (lucide icons, 9-id catalog matching b2b) + live-offer terracotta cards.
- `consumer-app/src/ContactLocationModal.tsx` → nested modal behind the header "Cafe details" pill; name + address + phone (with "Not shared yet" empty state) + **Get Directions** (native `maps:` / `geo:` scheme with `https://www.google.com/maps/search/` web fallback via `Linking.canOpenURL` + try/catch).

### 5. Offers CRUD — fully wired (Edit + RPC-POST delete)
The `offers` surface now mirrors the cafe surface end-to-end — GET / POST / PUT / REST-DELETE / RPC-POST-delete, with Edit + Delete buttons per row in the B2B dashboard.

- **Backend**
  - `app/main.py` — `delete_offer` refactored into shared `_delete_offer_impl` (same pattern as `_delete_cafe_impl`).
  - New RPC route: `@app.post("/api/admin/offers/{offer_id}/delete")` returning `{"status":"success","deleted_id":"<uuid>"}`.
  - REST `DELETE /api/admin/offers/{offer_id}` kept alongside for standards-compliant clients; both paths call the shared impl so they can't drift.
- **Frontend API (`b2b-dashboard/src/lib/api.ts`)**
  - New `updateOffer(token, offerId, values)` → `PUT /api/admin/offers/{offerId}`.
  - `deleteOffer` switched REST-DELETE → RPC-POST (`/delete` suffix) to match `deleteCafe`. Uniform across the dashboard — a 405 on any DELETE verb can't bite us here anymore.
- **Frontend UI**
  - New `b2b-dashboard/src/components/EditOfferDialog.tsx` — mirrors `EditLocationDialog` pattern. Seeds from the row's current `Offer`, re-uses the same amount/target/window validation as the create form, sends a full PUT body on save.
  - `PromotionsView.tsx` — each scheduled-offer row now renders **Edit** (pencil) + **Remove** (trash) buttons side-by-side. Edit opens the dialog with pre-filled state; on save, the row in local state is swapped for the API response (no full refetch needed).
- **Status:** Offers CRUD is 100% wired in the B2B dashboard — create, edit, and delete all round-trip to Postgres through the real FastAPI routes. No localStorage anywhere in the Promotions surface.

### 6. Offer location targeting — All vs. Specific
Brand owners can now scope an offer to either every cafe under the brand or a hand-picked subset.

- **Migration 0008** (`migrations/0008_offer_target_cafes.sql`, applied) — `offers.target_cafe_ids UUID[] NULL`. **NULL = All Locations** (default, preserves existing behavior). A populated array scopes the offer to those cafe ids. UUID[] (not JSONB) to stay consistent with `cafes.amenities TEXT[]`.
- **Backend**
  - `app/models.py` — `Offer.target_cafe_ids` mapped as `ARRAY(UUID(as_uuid=True))`, nullable.
  - `app/schemas.py` — `OfferCreate` / `OfferUpdate` / `OfferResponse` now carry `target_cafe_ids: list[UUID] | None`. Route handlers normalize empty-list → `None` so "Specific with zero ticked" can't silently mint an invisible offer.
- **Frontend**
  - New shared component `b2b-dashboard/src/components/OfferLocationTargeting.tsx` — radio (`All locations (N)` / `Specific locations`) + checkbox grid of cafe names with the same visual pattern as the amenities picker.
  - `lib/api.ts` `ApiOffer`, `createOffer`, `updateOffer` gained `target_cafe_ids: string[] | null`.
  - `lib/offers.ts` UI `Offer` type + `offerFromApi` now carry `targetCafeIds`.
  - `PromotionsView.tsx` — accepts `cafes: Cafe[]` prop (wired in `App.tsx`), adds Step 4 "Participating locations" to the create form, rehydrates into Edit dialog. Each saved-offer row renders a `LocationScopeBadge` pill (emerald for "All locations", sky-blue for "N locations"). Client-side guard blocks submit when Specific-mode has zero boxes ticked.
  - `EditOfferDialog.tsx` — accepts `cafes` prop, seeds `targetCafeIds` from `offer.targetCafeIds` on open, sends on save.
- **Known gap — consumer feed filter not wired yet.** `GET /api/consumer/cafes` still attaches brand-wide offers to every cafe regardless of `target_cafe_ids`. This is a dashboard-authoring slice only — consumer visibility is the next task. Confirmed out of scope for this commit by the user prompt.
- **models.sql not synced.** The reference `models.sql` at the repo root hasn't tracked migrations 0005–0008 (offers, amenities, phone, hygiene, target_cafe_ids). The live schema is fully defined by the numbered migration files per `reference_migration_runner.md`; `models.sql` should be regenerated from introspection or deprecated.

### 7. Per-cafe Stripe billing (quantity-based) + Customer Portal
Brands now pay **£5/month per active location**, not a flat fee. Adding a cafe bumps the Stripe subscription item quantity; deleting a cafe decrements it. The generic "Subscribe" button is gone — subscriptions start implicitly when the first location is added.

**Backend (`app/billing.py`)**
- New helper `sync_subscription_quantity(session, brand)` — retrieves the brand's subscription, modifies the first subscription item to match `COUNT(cafes WHERE brand_id=…)`. `proration_behavior="create_prorations"` so mid-cycle quantity changes prorate automatically. **Failures NEVER raise** — a transient Stripe blip must not block a cafe create. Divergence is logged for manual reconciliation.
- New endpoint `POST /api/billing/portal` — `stripe.billing_portal.Session.create(customer=brand.stripe_customer_id, return_url=".../billing")`. Returns `CheckoutResponse` shape so the frontend can reuse its redirect helper. **Returns 400** if `brand.stripe_customer_id` is NULL (no customer yet — admin needs to add their first location first).
- Checkout now seeds with the live cafe count (`quantity=max(cafe_count, 1)`) instead of hardcoding `1`, so if a brand somehow arrives at checkout with N existing cafes the subscription starts at the right quantity.

**Backend (`app/main.py`)**
- `create_cafe` calls `sync_subscription_quantity(session, brand)` after commit. Inactive brands short-circuit inside the helper (no-op). Active brands get the Stripe bump.
- `_delete_cafe_impl` does the same after commit (skipped if new count == 0 — zero-qty subs are a portal-cancel concern).
- Third startup banner block (`_log_billing_routes`) prints `/api/billing/*` routes on every uvicorn reload.

**Frontend**
- `lib/api.ts` — new `createPortalSession(token)` returning `{ checkout_url }` (backend reuses the CheckoutResponse shape).
- `AddLocationDialog.tsx` — submit button text conditional on `brand.subscriptionStatus`: **"Add location"** when active, **"Add & Continue to Payment"** when not. Spinner label mirrors the split.
- `App.tsx handleAddLocation` — captures `wasActive = brand?.subscriptionStatus === "active"` *before* the POST. If inactive after the cafe lands, calls `createCheckout` and `window.location.href = checkout_url`. If active, backend already synced Stripe quantity — just refreshes local state. Checkout redirect failures fall through to the refresh path so the cafe row isn't orphaned.
- `BillingView.tsx` — **"Start a new Stripe checkout" button removed entirely**. "Download invoices" rewired to "Manage billing & invoices", calls `createPortalSession` and redirects. Plan card now reads **"£5 / month · per active location"** and shows `Billed for N locations · £N0.00/mo`. Inactive-brand banner redirects users to the Locations tab ("add your first location to begin"). No disable-guard on the portal button — the backend's 400 ("No Stripe customer on file yet. Add your first location…") surfaces in the existing inline error banner.

**Status:** Three layers verified. Backend `py_compile` clean; frontend `tsc --build --force` clean; `/api/billing/portal` confirmed registered in the app router; `sync_subscription_quantity` importable and no-ops correctly when Stripe key is unset or sub_id is NULL. Ready for live Stripe test.

### 7a. AddLocation billing transparency (active-brand warning + portal escape-hatch)
Polish pass on the per-cafe billing flow — when an **already-active** brand opens Add Location, the dialog now explicitly discloses the £5/mo increase and offers a pre-save path to switch payment method.

- `AddLocationDialog.tsx`
  - New prop `onOpenPortal: () => Promise<void>` — parent owns the `createPortalSession` + `window.location.href` redirect so the dialog stays API-free.
  - Conditional amber notice block (shown only when `brand.subscriptionStatus === "active"`): "Adding this location will automatically increase your plan by **£5/month**. This will be billed to your default payment method." Uses the `Info` lucide icon in amber-700.
  - Below the notice: a terse underlined button "Need to use a different card? Update your billing details here." with a `CreditCard` icon. Click → `onOpenPortal()` → spinner state "Opening Stripe portal…" while the API round-trip resolves, then the parent full-page-redirects to the Stripe Customer Portal.
  - Local `openingPortal` state guards against double-click; Dialog's main submit is blocked while the portal is opening (and vice versa).
- `App.tsx`
  - New `handleOpenPortal = useCallback(async () => { const { checkout_url } = await createPortalSession(session.token); window.location.href = checkout_url }, [session])` — wired to the dialog.
  - `createPortalSession` added to the `lib/api` import list (was not previously used in App.tsx).
- **Not shown for inactive brands.** They go through Stripe Checkout after cafe create anyway (separate disclosure flow), so duplicating the warning would be redundant.

**Status:** `tsc --build --force` clean. No backend changes in this pass — `createPortalSession` and `/api/billing/portal` were already live from task 7.

### 8. KYC fields + Overview "View all" navigation fix
Final B2B sweep. Two unrelated items bundled: the dead "View all" button on the Overview dashboard, and the missing KYC/Stripe-compliance fields on Settings.

**Navigation fix**
- `OverviewView.tsx` — `onNavigate: (nav: NavKey) => void` prop added; the "View all" button next to "Top performing branches" is now `onClick={() => onNavigate("locations")}` instead of dead. `App.tsx` passes `onNavigate={setNav}`.

**KYC — migration 0009 (`0009_add_brand_kyc_fields.sql`, applied)**
- Six new nullable TEXT columns on `brands`: `owner_first_name`, `owner_last_name`, `owner_phone`, `company_legal_name`, `company_address`, `company_registration_number`. No CHECK constraints — these are free-form display fields; validation is at the API boundary.

**Backend**
- `app/models.py Brand` — six mapped `Mapped[str | None]` columns added.
- `app/schemas.py`
  - `BrandProfile` — six nullable KYC fields added to the response shape so the Settings form can prefill.
  - `BrandUpdate` — same six as optional patch fields. Semantics: `None` = untouched; empty string = clear to NULL (handler normalizes).
- `app/main.py update_admin_brand` — loop over the six field names, trim whitespace, coerce `""` → `None` before assignment, so the admin can both set and clear any KYC field via a single PATCH.

**Frontend**
- `lib/mock.ts Brand` — six new camelCase nullable fields (`ownerFirstName`, …, `companyRegistrationNumber`). `initialBrand` constant seeded with nulls.
- `lib/api.ts` — `ApiBrand` + `brandFromApi` + `updateAdminBrand` patch signature all extended with the six snake_case fields.
- `SettingsView.tsx` — **restructured from "one wide card + right sidebar" to "three stacked cards + shared action bar + right sidebar"**. New cards:
  - **Owner Details** (UserRound icon) — first name, last name, phone
  - **Legal & Compliance** (Building2 icon) — legal name, registered address, CRN/VAT (auto-uppercased, monospace)
  - Existing **Brand profile** card stays on top.
  - Save/Discard moved into a single shared footer row below all three cards, so the admin hits one Save regardless of which section they edited. Patch diff spans all 10 draft fields; error + "Saved." indicators live in the same footer.
- All drafts re-seeded via the `useEffect([brand])` block so a parent refresh reflects in the form.

**Status:** Migration 0009 applied to local dev DB. Backend `py_compile` + Pydantic round-trip (set, clear, read) all clean. Frontend `tsc --build --force` clean.

---

## End of day — 2026-04-20 wrap-up

**B2B Dashboard is effectively feature-complete for the MVP scope.** Every surface the brand admin interacts with is wired to real FastAPI → Postgres: Overview, Locations (CRUD + edit + RPC-delete), Promotions (CRUD + location targeting), Billing (per-cafe subscription + portal), Settings (brand + KYC). No localStorage / mock data left in admin flows.

### Today's architectural completions (2026-04-20 session)
1. **Promotions CRUD + Location Targeting** — shared `OfferLocationTargeting` component; per-row `LocationScopeBadge` pill. Storage: `offers.target_cafe_ids UUID[] NULL` (migration 0008). *Not JSONB — chose native Postgres `UUID[]` for consistency with `cafes.amenities TEXT[]` and cheap `ANY()` membership checks. Same semantic as a JSON list of ids.* NULL = all, populated array = specific cafes.
2. **Per-cafe Stripe billing + Customer Portal** — `quantity = COUNT(cafes)` model. `sync_subscription_quantity` helper fires post-commit on cafe create / delete (failures log-only, cafe commit wins). Generic "Subscribe" button gone; first cafe's "Add & Continue to Payment" triggers checkout. Active-brand Add Location shows an amber £5/mo disclosure + portal escape-hatch link. BillingView "Manage billing & invoices" → Stripe Customer Portal.
3. **KYC fields** — migration 0009 adds 6 nullable TEXT columns: `owner_first_name`, `owner_last_name`, `owner_phone`, `company_legal_name`, `company_address`, `company_registration_number`. `BrandProfile` / `BrandUpdate` schemas + `update_admin_brand` handler (empty-string-clears-to-NULL) + SettingsView restructured into three stacked cards with a shared Save bar.
4. **Nav fix** — Overview "View all" next to "Top performing branches" now routes to Locations via `onNavigate` prop.

### Known gaps carried forward (flagged here so they don't get lost)
- **Consumer feed filter for `target_cafe_ids` not wired.** `GET /api/consumer/cafes` still broadcasts brand-wide offers to every cafe. Next task when we touch the consumer API.
- **KYC fields aren't pushed to Stripe** — they're stored in Postgres for our records and invoice display, but not yet propagated to the Stripe Customer object for merchant verification. Separate ticket if/when Stripe asks.
- **`models.sql` at repo root is stale** — hasn't tracked migrations 0005–0009. Migrations are the source of truth; regenerate or deprecate next time someone touches it.
- **Delete-to-zero cafes** doesn't cancel the Stripe subscription — admin must use the portal. Deliberate.

### Next session — resume here
Start with **one** of these two surfaces; both have been dormant while B2B got finished:
- **Barista POS scanner** — harden the in-store scan + redeem flow. Prior smart-pause work is in commit `d616a40` (2026-04-18).
- **Consumer App (React Native / Expo)** — Phase 4 MVP is up (commit `1c126eb`), but the Discover feed still ignores offer location targeting and the app is only reachable via localtunnel (`consumer-app/src/api.ts` currently points at `https://slow-snails-yawn.loca.lt`, rotates per session).

Both are greenfield for new features; no blockers from today's B2B work.

---

## 9. Scanner prototype (`ScannerView.tsx`) — Universal Scanner approach

New standalone view at `b2b-dashboard/src/views/ScannerView.tsx` demonstrating the dual-input pattern the user defined. **Prototype — not wired into navigation.** The production POS surface remains `BaristaPOSView.tsx` (764 lines, real `b2bScan` integration, reward dialog, scan-lockout).

**Universal Scanner pattern**
- **Mode tab bar:** Camera vs. Keyboard / USB Scanner. Switching modes tears down the camera cleanly (`stopCamera` runs from a mode-effect + unmount cleanup).
- **Camera path:** `html5-qrcode` (`^2.3.8`, already in deps). Start/Stop controls, decoded codes are normalized (`.trim().toUpperCase()`) and matched against `/^[A-Z0-9]{6}$/` — invalid payloads are ignored so consumer-app QR codes (the only intended scannable) pass while random QRs don't. `scannedRef` mirror prevents the decode callback from firing twice if the library emits multiple frames between pause and state commit.
- **Keyboard / USB path:** single `<Input>` with `maxLength={6}`, monospace + letter-spacing, explicit `onKeyDown` handler catching `Enter`. USB keyboard-wedge scanners stream the 6 chars + Enter at high speed and hit the same path as manual typing. The `<form>`-submit alternative (used in `BaristaPOSView.tsx`) works too, but the explicit keydown is robust in any layout.

**Scan → Action overlay**
- Fixed-position modal-style sheet (bottom-aligned on mobile, centered on desktop) over the scanner pane.
- Displays: large monospaced Customer ID, current-stamps tile (placeholder "—" with "fetched after stamp" subtitle — no pre-stamp balance endpoint wired into this prototype; real flow would fetch or just let the scan response return the new balance like `BaristaPOSView` does), and a giant +/- stepper (1–10, defaults to 1).
- **Confirm button** = tall, satisfying, two-line label "Confirm & Add N Stamp(s)". Currently fires `console.log("[ScannerView] confirm", {tillCode, stampsToAdd})` per spec — wire to `b2bScan` when promoting.
- **Cancel / Rescan** button clears state and resumes the paused camera (or just closes the overlay in keyboard mode).

**Findings flagged — user premises that didn't match the code**
1. **Alphanumeric ID generation was already correct.** `TILL_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"` in both `app/main.py:73` and `app/consumer_auth.py:62`, generated via `secrets.choice` × 6 (~2.18B combinations). DB enforces via `users.till_code CHAR(6)` + `CHECK (till_code ~ '^[A-Z0-9]{6}$')` at `app/models.py:196`. No backend change made.
2. **`BaristaPOSView.tsx` already exists** and covers every feature the user asked for (camera + keyboard dual-input, scan-lockout, quantity picker, real API) — just in a quantity-before-scan layout instead of a scan-then-overlay layout. This ScannerView is the scan-first UX variant, kept as a separate file so the production POS isn't disrupted.

**Duplicated helper flagged (not touched):** `TILL_CODE_ALPHABET` and `_generate_till_code` are defined in both `app/main.py` and `app/consumer_auth.py`. Not refactored per "no cleanup beyond task scope" — move to `app/security.py` or a new `app/ids.py` next time someone has a reason to touch both.

**To promote ScannerView to production** *(DONE 2026-04-21 — see section 10 below)*
1. ~~Add a NavKey entry + registration in `App.tsx` routing~~ — kept the existing store-session routing; the new UX is now the default POS.
2. ~~Replace the `console.log`~~ — real `b2bScan` wired.
3. ~~Copy the 3.5-second `SCAN_LOCKOUT_MS`~~ — carried over.

## 10. POS consolidation — ScannerView merged into BaristaPOSView

2026-04-21. Promoted the scan-first dual-input UX from the prototype into the production POS and deleted the parallel file.

**What changed**
- `BaristaPOSView.tsx` **rewritten** with the new UX: mode tabs (Camera / Keyboard-USB) → scan → **Action overlay** (Customer ID + current-stamps placeholder + ± stepper 1–10 + giant Confirm + Cancel/Rescan). Old quantity-before-scan layout retired.
- `ScannerView.tsx` **deleted** — no parallel file, no drift.
- Store-session routing unchanged: `App.tsx:249-250` still routes `session.role === "store"` → `<BaristaPOSView />`. No navigation work needed.

**What was preserved from the original BaristaPOSView**
- Header (Coffee mark, cafe name, store-number pill, Sign out).
- `SCAN_LOCKOUT_MS = 3500` — applied **after** a successful Confirm (not on initial scan), so the camera can't re-capture the same QR before the customer moves their phone away. Errors do NOT apply the lockout, so a typo or 404 doesn't wedge the scanner.
- `REWARD_RESOLVED_COOLDOWN_MS = 10_000` — same till code can't re-trigger for 10s after a reward resolution (Redeem or Save-for-later).
- `inFlightRef` guard against double-firing `b2bScan` (e.g. double-tap on Confirm).
- `RewardDialog` — fires when `result.free_drinks_unlocked > 0`. `onRedeem` / `onSaveForLater` handlers set `rewardResolvedRef` and resume the camera (if camera mode).
- Full API-error → toast mapping: 401 (invalid key), 402 (billing), 404 (unknown till code), 409 (rejected), 422 (invalid format), catch-all.

**Real API wiring**
- `confirmAddStamps` → `await b2bScan(session.venueApiKey, session.venueApiKey, scannedCode, stampsToAdd)`. *Note: the existing convention passes `session.venueApiKey` twice — once as the `Venue-API-Key` header and once as the `venue_id` body field. Preserved as-is from the old view; not a consolidation-task concern.*
- Success (no rollover) → success toast (`+N stamps · balance X/10`), overlay closes, camera resumes (if camera mode).
- Success (rollover) → `setReward(...)` opens the RewardDialog; overlay closes.
- Error → error toast, **overlay stays open** so the barista can fix the code and retry or Cancel.

**Scan-first lockout semantics (new)**
- Old flow: lockout gate was set on every valid decode before the API call.
- New flow: the **overlay itself** is the gate — while `scannedCode !== null`, `handleDecoded` early-returns. `scannedRef.current` (mirror) + `rewardOpenRef.current` + `inFlightRef.current` + `lockoutUntilRef.current` form a four-layer defense against double-stamps.

**Typecheck:** `npx tsc --build --force` clean.

**To test (manual mode)**
1. Boot backend + frontend. Log in to the Store surface (`001` / `1234` against the local seed).
2. Switch to the **Keyboard / USB Scanner** tab.
3. Type a valid till code (grab one from `SELECT till_code FROM users LIMIT 5;` in psql) → press **Enter** → overlay appears.
4. Adjust the stepper (±) → **Confirm & Add N Stamps** → success toast + overlay closes.
5. Error path: type `ZZZZZZ` → **Enter** → inline "6-character code" error. Or type a valid-format-but-nonexistent code → **Confirm** → toast: "Customer not found." Overlay stays open, barista can correct and retry.
6. Reward path: add enough stamps on one customer to roll over → RewardDialog pops instead of toast.
7. **Camera mode:** switch tab → **Start camera** → scan a consumer-app QR → same overlay. After Confirm succeeds, the camera stays paused for 3.5s before resuming, preventing double-stamps.

---

## 11. Consumer app — live data wiring (2026-04-21)

Three real gaps closed + one correctness bug fixed. `get_consumer_session`, the `fetchBalance` wrapper, and the HomeView's balance display were already wired; only flagged here for future-me not to duplicate.

### Correctness fix: `/me/balance` now brand-scoped (was a bug)
- **Before:** `SELECT SUM(stamp_delta) WHERE customer_id = X` — summed stamps across every brand, violating the Global-vs-Private isolation rule.
- **After:** Uses the existing `_scoped_balance_stmt(user_id, scanning_brand)` helper from `app/main.py` (deferred import to dodge the cycle, same pattern as `app/b2b_routes.py:62`). The scanning brand is derived from the consumer's latest EARNED `global_ledger` row — so the shown `stamp_balance` always reflects the pool of their most recent earn.
- **Semantics:** Global-brand earn → balance is the pooled sum across all global-scheme brands. Private-brand earn → balance is scoped to that brand's own cafes only. No earns yet → 0 (correct — no active pool). This matches what the till showed them at the last scan, so the `X/10` in the app and the reward-rollover modal stay consistent.

### `/api/consumer/cafes` — target_cafe_ids filter applied
- **Before:** Every live offer fetched by brand was attached to every cafe under that brand, broadcast-style, ignoring `target_cafe_ids`.
- **After:** Offer attaches to a cafe iff `target_cafe_ids IS NULL` (broadcast) OR the cafe's id is in the array. Filtering is done in Python after fetching (list is tiny per brand), keeping the query simple and avoiding array-containment SQL.
- Closes the "Consumer feed filter" gap flagged in the 2026-04-20 EOD wrap-up.

### New endpoint: `GET /api/consumer/me/history?limit=50`
- Reads from `global_ledger` (row-per-transaction shadow table), **not** `stamp_ledger` — so "+3 stamps at Cafe X" renders as one row instead of three.
- Response shape (`ConsumerHistoryEntry`): `transaction_id`, `kind: "earn" | "redeem"` (derived from `GlobalLedgerAction`), `quantity`, `cafe_name`, `cafe_address`, `timestamp`.
- `limit` param clamped to [1, 200], default 50. Sorted `timestamp DESC` via the existing `idx_global_ledger_consumer_ts` index.
- Auth: `Depends(get_consumer_session)` — anonymous callers 401.

### Frontend
- `consumer-app/src/api.ts` — new `fetchHistory(token, limit=50)` returning `HistoryEntry[]`.
- `consumer-app/App.tsx` — `<HistoryScreen />` now receives `session` as a prop.
- `consumer-app/src/HistoryScreen.tsx` — `MOCK_HISTORY` array deleted; replaced with `useEffect(fetchHistory)` + `loading` / `empty` / `error` branches. `balanceAfter` display dropped (the ledger rows don't carry a running balance without a window function; not worth adding for a history-tab concern). Row title is now quantity-aware ("Earned 3 stamps" / "Redeemed 1 Free Drink"). Added a local `formatWhen()` that reproduces the old "Today · 08:12 / Yesterday / N days ago / Last week" cadence without a date library.

### Verification
- `py_compile app/consumer_auth.py app/schemas.py` — clean.
- Route registration confirmed: `GET /api/consumer/me/balance`, `GET /api/consumer/me/history`, `GET /api/consumer/cafes`.
- `npx tsc --noEmit` in consumer-app (single tsconfig, no project references, so this is a real check) — clean.
- Pydantic round-trip for `ConsumerHistoryEntry` (earn + redeem) and `ConsumerBalanceResponse` (empty) — OK.

### To test
1. Restart uvicorn. Point Expo at the current tunnel URL (`consumer-app/src/api.ts:6`).
2. Open the mobile app → Home shows the scoped balance for the latest-earn brand. A brand-new user shows `0/10`.
3. Tap the **History** tab → loading spinner → real ledger rows (or empty-state card if the user has no activity yet).
4. Have a B2B admin POS add stamps to this consumer → pull-to-refresh isn't wired, but switching tabs and back re-fetches.
5. Promotions edge case: create an offer scoped to a specific cafe in the B2B dashboard → DiscoverView should show that offer **only** on that cafe, not siblings under the same brand. Inverse: broadcast offer (All Locations) should still show on every cafe under the brand.
6. Balance isolation check: if your test user has earns at both a Global and a Private brand, the number shown should match the pool of the *most recent* earn, not the cross-brand sum.

---

## 12. Mixed-Basket POS — banking pivot + Mid-Order Intercept (2026-04-21)

**Architectural pivot.** `/api/b2b/scan` no longer auto-rollovers; rewards now bank until explicitly consumed via `/api/venues/redeem`. Without this change, "Save for later" in the intercept dialog would be a no-op (the 10th stamp was always force-redeemed in-transaction). The consumer app and the scoped balance helper both had to move with this change.

### Backend — banking model

- **`app/b2b_routes.py::b2b_scan`** — auto-rollover logic removed entirely. Stamp ledger still writes one +1 EARN row per stamp. Global ledger writes one aggregated EARNED row. `free_drinks_unlocked` is now always `0` in the response (kept in the shape for backcompat). Balance can exceed `REWARD_THRESHOLD`.
- **`app/schemas.py::RedeemRequest`** — new `quantity: int = Field(default=1, ge=1, le=20)`. Default preserves legacy single-drink callers.
- **`app/schemas.py::RedeemResponse`** — new `quantity_redeemed` field echoing what was consumed.
- **`app/main.py::redeem_reward`** — accepts `quantity`, validates `balance >= quantity * 10` (409 otherwise), inserts N `-10` REDEEM rows, writes one aggregated REDEEMED row to `global_ledger` so `/me/history` renders "Redeemed 2 Free Drinks" as a single entry.
- **New `GET /api/venues/customer/{till_code}`** (`app/main.py`) — secured by `get_active_cafe`. Returns `CustomerStatusResponse` with `user_id`, `till_code`, `current_stamps` (mod threshold), `banked_rewards` (div threshold), `threshold`. 404 on unknown till, 422 on malformed.
- **`app/schemas.py::ConsumerBalanceResponse`** — gained `current_stamps` + `banked_rewards` derived fields. Clients should prefer these over raw `stamp_balance` for X/10 progress displays (old code would render "13/10" once banking starts accumulating).
- **`app/consumer_auth.py::/me/balance`** — populates the two new fields from the scoped balance.

### Known regression (flagged, not fixed in this slice)
- **Consumer celebration modal stops firing on stamp scans.** Old path: `latest_earn.free_drink_unlocked` was true whenever the same-timestamp EARNED + REDEEMED rows co-existed (auto-rollover path). Under banking, REDEEMED rows come from a separate `/venues/redeem` call in a separate transaction, so the timestamp-equality check never matches. Modal only fires on explicit redeems going forward — and only by coincidence (timestamps rarely match). Proper fix: add a `latest_redeem` payload with its own transaction_id and have the mobile app watch that alongside `latest_earn`. Follow-up ticket.

### Frontend — `b2b-dashboard/src/lib/api.ts`
- `redeem(venueApiKey, tillCode, quantity = 1)` — quantity threaded through to backend.
- New `getCustomerStatus(venueApiKey, tillCode)` + `CustomerStatusResponse` type.

### Frontend — `BaristaPOSView.tsx` (full rewrite)
- **Pre-scan fetch:** on camera decode or manual Enter, `scannedCode` state is set and a `useEffect` fires `getCustomerStatus`. Overlay renders a loading tile while the fetch resolves; error state shows an inline message with a Cancel / Rescan escape.
- **Dual steppers:**
  - **"Paid drinks (add stamps)"** — range 0–10. Default: 1 if `banked_rewards === 0`, else 0 (banking-heavy customers are more likely to be redeeming than earning).
  - **"Free drinks (redeem rewards)"** — range 0..`banked_rewards`. Disabled with "No banked rewards" hint if banked is 0.
- **Confirm button** disabled unless at least one stepper is > 0 and customer status has loaded.
- **Mid-Order Intercept** — fires when `stampsToAdd > 0 AND (current_stamps + stampsToAdd) >= threshold`. Uses a shadcn `Dialog` with two calls-to-action: "Yes, make 1 drink free" (folds one stamp into a reward redeem → executes combined basket) / "No — save for later" (fires the scan as-is; balance banks past threshold).
- **Execute order** — `b2bScan` first, then `redeem`. Matters for the intercept-yes case: the newly-added stamps have to land before the reward consumption has the 10 needed. Both calls are serialised in `executeTransaction`.
- **Combined success toast** — `+N stamps · M rewards redeemed` (only the relevant pieces rendered).
- **Error resilience** — API failures keep the overlay open so the barista can adjust and retry; no lockout applied on error (same pattern as the pre-pivot POS).
- **`RewardDialog` removed** — the old auto-rollover "Redeem / Save for later?" modal is obsolete; the Mid-Order Intercept fires pre-scan instead.

### Consumer app update (minimal)
- **`consumer-app/App.tsx`** — poll loop now consumes `res.current_stamps` (not `res.stamp_balance`) for the HomeView progress. Prevents "13/10" once banking accumulates.
- **`consumer-app/src/api.ts::BalanceResponse`** — added `current_stamps` + `banked_rewards` fields.

### Verification
- `py_compile app/main.py app/b2b_routes.py app/schemas.py app/consumer_auth.py` — clean.
- Routes confirmed registered: `POST /api/venues/stamp`, `POST /api/venues/redeem`, `GET /api/venues/customer/{till_code}`.
- `npx tsc --build --force` in b2b-dashboard + `npx tsc --noEmit` in consumer-app — both clean.
- Pydantic round-trip: `RedeemRequest` (default + custom quantity + quantity=0 rejection), `CustomerStatusResponse`, `ConsumerBalanceResponse` (banking case: total=27, current=7, banked=2) — all correct.

### Scenarios to test
1. **Pure earn, no threshold crossing.** Customer at 3/10, banked 0. Add 2 stamps. No intercept. Toast: `+2 stamps`. Customer now 5/10 banked 0.
2. **Earn crossing threshold, "Yes make one free".** Customer at 8/10 banked 0. Add 3 stamps → intercept → Yes. Executes `b2bScan(2)` then `redeem(1)`. Customer now 1/10 banked 0. Toast: `+2 stamps · 1 reward redeemed`.
3. **Earn crossing threshold, "No save for later".** Customer at 8/10 banked 0. Add 3 stamps → intercept → No. Executes `b2bScan(3)`. Customer now 1/10 banked 1. Toast: `+3 stamps`.
4. **Pure redeem, no new stamps.** Customer at 3/10 banked 2. Paid stepper 0, free stepper 2. No intercept (stamps=0). Executes `redeem(2)`. Customer now 3/10 banked 0. Toast: `2 rewards redeemed`.
5. **Mixed manual: both steppers > 0, no threshold.** Customer at 2/10 banked 1. Paid 2, free 1. No intercept (2+2 < 10). Executes `b2bScan(2)` then `redeem(1)`. Customer now 4/10 banked 0. Toast: `+2 stamps · 1 reward redeemed`.
6. **Insufficient stamps edge case.** Manually set `rewardsToRedeem` past `banked_rewards` — max caps on the stepper should prevent this, but if backend receives it anyway: 409 "Insufficient stamps".
7. **Consumer app mobile** — pull /me/balance for a user with balance >= 10. App shows `current_stamps/10` (e.g. `3/10`) rather than `13/10`. Banked count is available via `res.banked_rewards` for future UI.

### 12a. Intercept threshold — strictly `> 10` (Buy 10, get 11th free)
Math correction the same day: the intercept fired on `sum >= 10`, which treated "Current 0, Add 10" as a crossing event and offered the 10th drink free — effectively a "Buy 9, get 10th free" scheme. Correct semantic is "Buy 10, get 11th free": only a sum **strictly greater** than the threshold means the customer is ordering an 11th-drink-eligible-for-free in *this* transaction.

- **Before (wrong):** `current_stamps + stampsToAdd >= REWARD_THRESHOLD`
- **After (correct):** `current_stamps + stampsToAdd > REWARD_THRESHOLD`
- Location: `BaristaPOSView.tsx shouldIntercept()`.

**Behavior matrix after the fix:**
| current | add | sum | intercept? | outcome if yes | outcome if no |
|---|---|---|---|---|---|
| 0 | 10 | 10 | **NO** | — (no crossing) | `+10 stamps`, banks 1 reward |
| 8 | 2 | 10 | **NO** | — (no crossing) | `+2 stamps`, banks 1 reward |
| 8 | 3 | 11 | **YES** | 2 paid + 1 free → balance 0/10, 0 banked | `+3 stamps`, lands at 1/10 banked 1 |
| 0 | 11 | 11 | **YES** | 10 paid + 1 free → balance 0/10, 0 banked | `+11 stamps`, lands at 1/10 banked 1 |

`handleInterceptYes` math (`stampsToAdd - 1`, `rewardsToRedeem + 1`) was already correct for the `sum = threshold + 1` case and matched the dialog's singular "make 1 drink free" copy. No change there.

**Stepper visual polish (same commit):** the "Free drinks" stepper stays rendered even when `banked_rewards === 0` so the barista always knows the feature exists; it now gets `opacity-50` + muted number colour when disabled so the greyed-out state reads at a glance. The Paid stepper is always interactive.

**Verification:** `npx tsc --build --force` clean.

**To test**
- **Scenario 1 (no intercept, banking):** customer at 0/10 → Paid=10 → Confirm → **no dialog appears** → toast `+10 stamps`. Balance now 0/10 with 1 banked. Before the fix, this would have intercepted and offered the 10th drink free.
- **Scenario 2 (intercept):** customer at 8/10 → Paid=3 → Confirm → Intercept dialog fires → **Yes** executes `b2bScan(2)` + `redeem(1)`, toast `+2 stamps · 1 reward redeemed`, balance 0/10 banked 0. **No** executes `b2bScan(3)`, toast `+3 stamps`, balance 1/10 banked 1.
- **Scenario 3 (UI clarity):** a customer with `banked_rewards=0` → open overlay → Free-drinks stepper is visible, greyed out at opacity-50, +/– buttons disabled, "No banked rewards" hint beneath.

---

## 13. Discover polish + Live Confetti (smart polling, 2026-04-22)

### Audit findings (scope reality check)
- **Backend `target_cafe_ids` filter** — *already shipped* in task 11 (2026-04-21). No-op for this slice.
- **"DiscoverScreen Coming Soon placeholder"** — premise wrong. A full-featured `DiscoverView` (inline in `consumer-app/App.tsx:552`) with `fetchDiscoverCafes`, loading/error/empty states, terracotta retry button, and `CafeDetailsModal` nav already existed from prior sessions. The real gaps on the card were the missing hygiene indicator + offers using the *amber* (amenity) accent instead of the spec's terracotta.
- **Smart polling** — a 3s `/me/balance` poll (`BALANCE_POLL_MS = 3000`) was already wired in `HomeView`, but keyed on `latest_earn.transaction_id` rather than the delta the user now wants, and had no AppState foreground gate.

### What actually shipped

1. **`DiscoverCafeCard` polish**
   - New `HygienePill` subcomponent — compact `ShieldCheck` + "Hygiene · N/5" (or "Awaiting inspection") chip that echoes the amenity-chip treatment. The full FSA sticker (`FoodHygieneBadge`) stays reserved for the `CafeDetailsModal` where it has room to breathe.
   - Offers block recoloured from amber → **terracotta** (`rgba(201,110,75,0.08)` bg, `rgba(201,110,75,0.28)` border, `COLOR.terracotta` label). Matches the product spec and the B2B dashboard's offer colour so baristas and customers see the same visual language.
   - `ShieldCheck` added to the lucide-react-native import block; `FoodHygieneRating` added to the `./src/api` type imports.

2. **Live Confetti — delta-based celebration trigger**
   - **Replaces** the previous `latest_earn.transaction_id` gate, which was unreliable after the banking pivot (task 12) made `free_drink_unlocked` always false.
   - Two refs: `prevCurrentRef`, `prevBankedRef`. Null sentinels for pre-first-poll so the initial fetch seeds silently (no "welcome back" misfire).
   - Trigger: `current_stamps > prev` **OR** `banked_rewards > prev` — pure redeems (banked goes down) stay correctly silent since that action was barista-initiated.
   - `stampsEarnedDelta = (banked_new - banked_prev) * 10 + (current_new - current_prev)` — handles the threshold-crossing case where `current_stamps` resets (e.g. 8 → 1) but `banked_rewards` ticks up (0 → 1), total earn = 3. Always ≥ 1 when the celebration fires.
   - `freeDrinkUnlocked = bankedUp` — the "🎉 free drink unlocked" variant of the RewardModal fires iff the scan crossed the threshold.

3. **AppState-gated polling**
   - `AppState.addEventListener("change", …)` updates a `[appActive, setAppActive]` state (not a ref — want the effect to re-run on the flip).
   - The poll `useEffect` now depends on `appActive`. Backgrounded → logs `[poll] app backgrounded, pausing` and returns early, clearing the interval. Foreground → re-runs the effect, fires an immediate poll, re-installs the 3s interval.
   - Saves battery and avoids piling stale requests against a rotated localtunnel URL after long idle.

### Verification
- `npx tsc --noEmit` in consumer-app — clean.
- Manual logic walk-through:
  - Earn 2 at 3/10: delta_current=+2, delta_banked=0 → celebrate, freeDrinkUnlocked=false, stampsEarned=2.
  - Earn 3 at 8/10 (crosses): current 8→1, banked 0→1 → celebrate, freeDrinkUnlocked=true, stampsEarned=(1)*10 + (1-8) = 3. ✓
  - Barista redeems 1 (banked 1→0): delta_current=0, delta_banked=-1 → **no** celebrate. ✓
  - App foregrounds after 20min idle: initial poll seeds refs, doesn't celebrate. ✓

### Known / flagged (unchanged from task 12)
- **Mixed-basket transient:** if the barista fires +N stamps + -M redeem close together, a poll may catch only the post-state where both deltas are zero. The modal won't fire. Rare in practice; belt-and-braces fix would be adding a `latest_redeem` payload alongside `latest_earn` and diffing that too. Not done in this slice.

### To test
- "Tunnel killer" deployment first (replace the localtunnel URL with a stable backend), otherwise the 3s poll bleeds stale requests.
- Sign in on the mobile app → have a barista stamp +2 → Home's card progress animates to the new count within ~3s AND the RewardModal pops with "+2 stamps at X".
- Have the barista redeem 1 → Home's banked count updates silently (no modal).
- Home, stamp the customer to cross the threshold (8 → 11 total) → modal pops with the "🎉 free drink unlocked" variant.
- Background the app (home button) → console shows `[poll] app backgrounded, pausing`. Return → immediate re-poll, polling resumes.
- Discover tab → each cafe card now shows the compact hygiene pill under the address; any live offer block uses terracotta accent.

**Phase 3 (B2B Dashboard + Billing) is 100% closed as of 2026-04-18.** Every surface of the Business App is wired to real FastAPI endpoints. Gateway, POS scanner, dashboard reads (cafes, metrics, brand profile), dashboard writes (add-location, brand PATCH incl. scheme toggle), logout on both surfaces, AND a working end-to-end Stripe subscription flow: admin clicks Subscribe → `POST /api/billing/checkout` (JWT-authed) → Stripe hosted page → Stripe webhook on `checkout.session.completed` flips `subscription_status` to `active` and saves `stripe_customer_id` + `stripe_subscription_id` → Stripe redirects back to `/success?session_id=…` (or `/cancel`) on the Vite frontend, which refetches admin data and surfaces the new Active state. Admin + Store JWTs are per-audience, backed by bcrypt-hashed per-row credentials. Local dev DB seed: `admin@test.com`/`password123` + Store ID `001` / PIN `1234` against `Test Coffee Co — Flagship`. Discretionary next tracks (Phase 3b, store-cred UI, Customer Portal, hardening) are listed under "▶️ Very first step when we resume" — none are loose ends from Phase 3.
