# MEMORY — The Indie Coffee Loop

## Status

- **Phase 1 (Data & Admin Foundation):** ✅ COMPLETE.
- **Phase 2 (B2B Barista POS & Stripe Billing):** ✅ Stripe checkout + webhook live, POS scanner live. Still open under Phase 2: barista auth (optional).
- **🆕 Brand architecture pivot (2026-04-17):** ✅ COMPLETE. Two-tier tenancy (Brand → Cafe) now in place. Scheme-scoped stamp balances verified end-to-end.
- **🆕 Phase 3a — B2B Business Dashboard shell (2026-04-17):** ✅ COMPLETE. Vite + React + TS + Tailwind v4 + shadcn/ui app scaffolded in `b2b-dashboard/`. UI shell built against mock data; no backend wiring yet. **Scoped to the logged-in owner's single brand** (no Super-Admin flow; no "create brand" UI).
- **Phase 3b (B2C Consumer App & Map Discovery):** 🟢 UNBLOCKED — ready to start on the user's cue.

## 🧭 Hub and Spoke frontend architecture (finalized end of session, 2026-04-17)

The FastAPI backend is the **hub**. Three independent frontend **spokes** consume it, each with a distinct audience and surface area. This supersedes the earlier "two B2B surfaces" framing.

1. **Super-Admin** — hidden URL for Indie Coffee Loop platform staff. Brand provisioning, billing overrides, platform-wide analytics, compliance actions. **Not yet built**; will live at an unlisted URL and not link from any public surface.
2. **Consumer App** — future lightweight PWA for end customers. This is Phase 3b. Stamp balance(s) (scheme-scoped per brand — a user has N balances), reward state, participating-cafe map, SSE-driven live updates. **Still gated** — do not start until the user opens it explicitly for a specific feature.
3. **Business App** — the current [b2b-dashboard/](b2b-dashboard/) React/Vite/shadcn app. Will be unified behind a single **Admin vs Store login gateway** that routes a session to one of:
    - **Admin** surface = the existing brand-owner dashboard (Overview / Locations / Billing / Settings) already built with mock data.
    - **Store** surface = barista POS, migrated from the standalone [static/index.html](static/index.html) into this codebase (or bridged — exact approach TBD on resume).

The standalone Barista POS at `static/index.html` remains operational for now. The Business App's "Store" surface will supersede it once the gateway and the migrated POS are in place.

## ▶️ Very first step when we resume

**Build the Admin vs Store login gateway screen inside [b2b-dashboard/](b2b-dashboard/).** Nothing else first — not more dashboard features, not POS migration, not backend wiring. The gateway is the entry point that decides which surface (Admin or Store) the rest of the session operates on; every subsequent piece of Business App work depends on it being in place.

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
- No auth. The dashboard assumes a single signed-in owner whose brand is `initialBrand`. In a real build, the brand would come from a session context.
- No B2C Consumer PWA / SSE / map — Phase 3b remains gated until the user opens it for a specific feature.

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

**When the session resumes, the very first task is building the Admin vs Store login gateway screen inside `b2b-dashboard/`.** See the "▶️ Very first step when we resume" section above. Do not skip past it to wire APIs, add new dashboard surfaces, or start POS migration — the gateway must land first.
