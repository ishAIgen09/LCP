# PRD — Phase 2 Enhancements

**Author:** Isha Gupta
**Date drafted:** 2026-05-01
**Status:** Draft — pending review
**Scope:** Five feature additions on top of the live 2026-05-01 architecture (Resend transactional email, Stripe pro-rata, consolidated Add-Brand flow, Super-Admin auth, GAS waitlist hardening). No refactors of shipped surfaces beyond what each feature strictly requires.

---

## 1. Verification notes

### 1.1 No Postgres MCP available in this session

The MCP connectors attached to this account are **Google Drive, Gmail, Exa, and Indeed** — none provides direct Postgres access. Schema claims in §3 are therefore verified against the canonical source files in this repo:

* [`models.sql`](models.sql) — repo-level SQL schema
* [`app/models.py`](app/models.py) — SQLAlchemy ORM (the live, deployed shape)
* [`migrations/`](migrations/) — incremental migration files `0001` through `0017`

These files ARE the schema deployed to the production Postgres on every GHA push. If a Postgres MCP is later attached, re-validate before applying any migration.

### 1.2 Known doc drift

`models.sql` at the repo root is **stale** — it pre-dates migrations `0005` through `0017`. The authoritative shape lives in `app/models.py`. The schema-verification section below uses the ORM as the source of truth and notes per-migration provenance.

---

## 2. Live architecture snapshot (1 May 2026)

| Surface | Stack | Path | Key views (relevant to this PRD) |
|---|---|---|---|
| **Backend** | FastAPI + SQLAlchemy + Postgres | `app/` | `main.py`, `billing.py`, `consumer_auth.py`, `b2b_routes.py`, `auth_routes.py`, `email_sender.py` |
| **Consumer App** | React Native + Expo | `consumer-app/` | `App.tsx` (4 tabs: home / history / **discover** / profile), `CafeDetailsModal`, `ContactLocationModal`, `RewardModal` |
| **B2B Dashboard** | Vite + React + TS + Tailwind v4 + shadcn/ui | `b2b-dashboard/` | `BillingView` (Stripe portal CTA), `PromotionsView` (offers CRUD), `SettingsView`, `BaristaPOSView`, `LocationsView` |
| **Super-Admin Dashboard** | Vite + React + TS | `admin-dashboard/` | Out of scope for this PRD (no super-admin-facing features below) |

**Discover tab already exists** in `consumer-app/src/App.tsx` with distance-based sorting (`expo-location` + Haversine, 5-mile radius cap) and a horizontal smart-filter pill row. This PRD's Feature 1 is therefore a **rename + polish** ("Discover" → "Explore"), not a from-scratch build. The amenity-filter UX needs to be expanded from the current pill row into a more interactive multi-select.

---

## 3. Schema verification — `cafes`, `brands`, `users`

Verified against `app/models.py` (the deployed ORM shape).

### 3.1 `cafes`

| Column | Type | Nullable | Default | Provenance |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | initial |
| `brand_id` | UUID FK→`brands.id` ON DELETE CASCADE | NO | — | initial |
| `name` | TEXT | NO | — | initial |
| `slug` | TEXT UNIQUE | NO | — | initial |
| `address` | TEXT | NO | — | initial |
| `contact_email` | TEXT | NO | — | initial |
| `store_number` | TEXT UNIQUE (regex `^[A-Z0-9]{3,10}$`) | YES | NULL | migration 0001 |
| `pin_hash` | TEXT | YES | NULL | migration 0001 |
| `phone` | TEXT | YES | NULL | migration 0006 |
| `food_hygiene_rating` | TEXT (regex 1-5 \| `Awaiting Inspection`) | NO | `'Awaiting Inspection'` | migration 0007 |
| `amenities` | TEXT[] | NO | `'{}'::text[]` | migration 0005 |
| `latitude` | FLOAT (WGS-84) | YES | NULL | migration 0010 |
| `longitude` | FLOAT (WGS-84) | YES | NULL | migration 0010 |
| `last_known_ip` | TEXT | YES | NULL | migration 0015 |
| `network_locked_at` | TIMESTAMPTZ | YES | NULL | migration 0015 |
| `billing_status` | `subscription_status` ENUM | NO | `'active'` | migration 0012 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | initial |

### 3.2 `brands`

| Column | Type | Nullable | Default | Provenance |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | initial |
| `name` | TEXT | NO | — | initial |
| `slug` | TEXT UNIQUE | NO | — | initial |
| `contact_email` | TEXT UNIQUE | NO | — | unique constraint added in migration 0014 |
| `scheme_type` | `scheme_type` ENUM (`global`/`private`) | NO | `'global'` | initial |
| `stripe_customer_id` | TEXT UNIQUE | YES | NULL | migration 0001 |
| `stripe_subscription_id` | TEXT UNIQUE | YES | NULL | migration 0001 |
| `subscription_status` | `subscription_status` ENUM | NO | `'incomplete'` | migration 0001 (`pending_cancellation` value added in 0013) |
| `current_period_end` | TIMESTAMPTZ | YES | NULL | migration 0001 |
| `password_hash` | TEXT | YES | NULL | migration 0001 |
| `owner_first_name` | TEXT | YES | NULL | migration 0009 (KYC) |
| `owner_last_name` | TEXT | YES | NULL | migration 0009 |
| `owner_phone` | TEXT | YES | NULL | migration 0009 |
| `company_legal_name` | TEXT | YES | NULL | migration 0009 |
| `company_address` | TEXT | YES | NULL | migration 0009 |
| `company_registration_number` | TEXT | YES | NULL | migration 0009 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | initial |

### 3.3 `users`

| Column | Type | Nullable | Default | Provenance |
|---|---|---|---|---|
| `id` | UUID PK | NO | `gen_random_uuid()` | initial |
| `till_code` | CHAR(6) UNIQUE (regex `^[A-Z0-9]{6}$`) | NO | — | initial |
| `barcode` | TEXT UNIQUE | NO | — | initial |
| `email` | TEXT UNIQUE | YES | NULL | initial |
| `display_name` | TEXT | YES | NULL | initial |
| `first_name` | TEXT | YES | NULL | migration 0003 |
| `last_name` | TEXT | YES | NULL | migration 0003 |
| `is_suspended` | BOOLEAN | NO | `false` | migration 0011 |
| `created_at` | TIMESTAMPTZ | NO | `now()` | initial |

---

## 4. Feature specifications

### 4.1 Consumer 'Explore Local' Directory

#### 4.1.1 Current state (live 2026-05-01)

Tab is currently labeled **"Discover"**. Already implements:

* Distance-based sort using `expo-location` (Haversine; 5-mile radius cap).
* `GET /api/consumer/cafes?lat=…&lng=…` returns cafes with `amenities`, `food_hygiene_rating`, live `offers`, `is_lcp_plus`, `distance_miles`.
* Horizontal "smart-filter" pill row + per-card `HygienePill` and offer chips.

#### 4.1.2 Changes

* **Rename** the tab label from `"Discover"` to `"Explore"` everywhere it appears in `consumer-app/src/App.tsx` (`Tab` type, `BottomNav` rendering, headers). The internal route key can stay `"discover"` to minimize blast radius across `DiscoverView`, `DiscoverCafeCard`, `DiscoverOffer*`, `fetchDiscoverCafes`.
* **Interactive amenity filter** — replace / extend the current single-row pill bar with a bottom-sheet modal (or expanding accordion) of multi-select amenity chips. Source the catalogue from `consumer-app/src/amenities.ts` (already mirrored from `b2b-dashboard/src/lib/amenities.ts`). State: `Set<AmenityId>`. Filter logic: a cafe matches when EVERY selected amenity is present in `cafe.amenities` (AND semantics). "Clear filters" affordance to reset.
* **Result count + active-filter chip strip** above the cafe list so the user can see which filters are active and tap a chip to remove just that one.

#### 4.1.3 API changes

* No backend changes. Filtering happens client-side against the existing `/api/consumer/cafes` payload. Server-side amenity filtering can be a follow-up if N grows past ~500 cafes; for Founding 100 this isn't a concern.

#### 4.1.4 Database migrations required

* **None.** Uses existing `cafes.amenities`, `cafes.latitude`, `cafes.longitude`.

---

### 4.2 B2B Cancellation Feedback Flow

#### 4.2.1 Current state (live 2026-05-01)

`b2b-dashboard/src/views/BillingView.tsx::openPortal` calls `POST /api/billing/portal` and immediately redirects to the returned Stripe Customer Portal URL (`window.location.href = …`). The "Manage billing & invoices" button at line ~298 is the redirect trigger. There is currently **no interception** between the click and the redirect — the user lands directly in the Stripe portal where they can cancel without leaving any feedback.

The `[B2B cancel requires exit survey]` memory entry has flagged this as a missing pre-cancel feedback step since 2026-04 but no UI exists yet.

#### 4.2.2 Changes

* New `CancellationFeedbackModal` component in `b2b-dashboard/src/components/`. Two required fields, one conditional:
    * **Reason dropdown** (required) — predefined values:
        * `free_drink_cost` — "Free drinks are too expensive for my margin"
        * `barista_friction` — "Baristas find the till flow too clunky"
        * `price_too_high` — "The monthly subscription is too high"
        * `low_volume` — "Not enough customer volume to justify it"
        * `feature_gap` — "Missing a feature I need"
        * `closing_business` — "Closing or pausing the cafe"
        * `other` — "Other (please describe)"
    * **Other / details textarea** (required when `reason === 'other'`, optional otherwise; max 500 chars).
    * **Acknowledge** (required checkbox) — "I understand my account will remain active until the end of the current billing cycle."
* The modal is the new entry point. The "Manage billing & invoices" button + the `openPortal` flow in `AddLocationDialog.tsx` both gate behind this modal. Submitting the modal:
    1. POSTs the survey to a new backend route.
    2. On 2xx, proceeds to the existing Stripe-portal redirect.
    3. On non-2xx, surfaces the error inline + does NOT open the portal (fail-closed).
* Per `[Cancel at Period End policy]` memory: cancellations preserve the grace period — cafes stay active until `current_period_end` expires. The acknowledge checkbox copy reflects this.
* This intercept does NOT prevent ad-hoc Stripe-portal usage for non-cancel actions (updating cards, downloading invoices). The user submits the survey once on first portal-open per session; subsequent opens within the same session bypass.

#### 4.2.3 API changes

* New route `POST /api/b2b/cancellation-feedback` in `app/b2b_routes.py`. Auth: existing admin JWT (`Depends(get_admin_session)`).
    * Request: `{reason: <enum>, details: str | None, acknowledged: bool}`.
    * Response: `{ok: true, id: UUID}`.
    * Inserts a row into the new `cancellation_feedback` table.
    * Validation: reject if `reason="other"` and `details` is empty/whitespace.

#### 4.2.4 Database migrations required

* **`migrations/0019_add_cancellation_feedback.sql`** — new table:
    ```sql
    CREATE TABLE cancellation_feedback (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        brand_id        UUID         NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
        reason          TEXT         NOT NULL CHECK (reason IN (
                            'free_drink_cost', 'barista_friction', 'price_too_high',
                            'low_volume', 'feature_gap', 'closing_business', 'other'
                        )),
        details         TEXT,
        acknowledged    BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_cancellation_feedback_brand_created
        ON cancellation_feedback (brand_id, created_at DESC);
    ```

---

### 4.3 B2B Custom Offers Engine — free-text upgrade

#### 4.3.1 Current state (live 2026-05-01)

`offers` table (per `app/models.py::Offer`) supports structured offers only:

* `offer_type ∈ {percent, fixed, bogo, double_stamps}`
* `target ∈ {any_drink, all_pastries, food, merchandise, entire_order}`
* `amount NUMERIC(10,2) NULL`
* `starts_at`, `ends_at`, `target_cafe_ids` (NULL = brand-wide)

The b2b-dashboard's `PromotionsView.tsx` renders a constrained form against `OFFER_TYPES` + `OFFER_TARGETS`. There is currently **no path** for an owner to write bespoke promo copy like "Bring your dog in today and get 10% off."

#### 4.3.2 Changes

* Add a fifth `offer_type` value: `custom`.
* Add a new column `offers.custom_text TEXT NULL`.
    * For `offer_type = 'custom'`: `custom_text` is REQUIRED, `target` and `amount` are IGNORED at the API layer.
    * For non-custom types: `custom_text` is IGNORED.
* Frontend (`PromotionsView.tsx`):
    * New tile in the offer-type picker labeled **"Custom (write your own)"**.
    * When selected, the rest of the form collapses target/amount and reveals a `<textarea>` for `custom_text` (max 280 chars — keeps copy snappy + fits a phone card without truncation).
    * **Inspiration placeholder** rotates between three suggestions on focus (Feature 4.4):
        * "Bring your dog in today and get 10% off your flat white."
        * "Flash your student ID for a free pastry with any drink."
        * "Mention the phrase 'Rainy Day Roast' for buy-one-get-one."
* Consumer-app `DiscoverOfferRow` rendering:
    * For `offer_type === 'custom'`, render `custom_text` verbatim (with the existing offer-card chrome — terracotta accent, expiry timestamp).
    * For all other types, existing render path unchanged.

#### 4.3.3 API changes

* `app/schemas.py::OfferCreate` and `OfferUpdate` — extend with optional `custom_text: str | None = Field(default=None, max_length=280)`.
* `app/main.py` admin offer create/update handlers — when `offer_type == "custom"` and `custom_text` is empty/whitespace, return 422 with a clear message. When non-custom, ignore any incoming `custom_text` (don't persist).
* `ConsumerOfferPayload` (consumer feed shape) — add `custom_text: str | None`.
* `OFFER_TYPES` constant in `app/models.py` and `b2b-dashboard/src/lib/offers.ts` updated in lockstep.

#### 4.3.4 Database migrations required

* **`migrations/0018_add_offer_custom_text.sql`**:
    ```sql
    ALTER TABLE offers
        ADD COLUMN custom_text TEXT;

    -- Note: we don't widen the existing offer_type CHECK at the DB level
    -- (today's regex is enforced at the app layer in app/models.py
    -- ::OFFER_TYPES + the API boundary). Adding 'custom' to that tuple
    -- is the only code-level change required.
    ```

### 4.4 Custom Offers — Inspiration UI

Sub-feature of §4.3. **Frontend-only**, no schema or API change.

* `PromotionsView.tsx` — when the custom-offer textarea is focused or empty, cycle through three placeholder strings every 4 seconds. Animation: `opacity 0.5 → 1` fade. Pause cycling once the user types one character.
* String set lives in a const at the top of the file so future copy tweaks don't touch the form logic:
    ```ts
    const CUSTOM_OFFER_INSPIRATION = [
      "Bring your dog in today and get 10% off your flat white.",
      "Flash your student ID for a free pastry with any drink.",
      "Mention the phrase 'Rainy Day Roast' for buy-one-get-one.",
    ] as const;
    ```
* No analytics events on the placeholders themselves (the data is in the eventual offer rows).

---

### 4.5 Pay It Forward (Suspended Coffee) System

#### 4.5.1 Background — the ethos

"Suspended coffee" is a 100-year-old Italian tradition (`caffè sospeso`) where a customer pays for a coffee they don't drink, and the cafe holds it in a community pool that anyone in need can claim later. We're digitising the ledger so cafes can offer it without paper-pad bookkeeping, while keeping the **cafe's discretion** about who qualifies to claim — we do NOT build any consumer-facing "claim a coffee" flow. The barista decides at the till.

#### 4.5.2 Operational flow (3 steps)

1. **Accept** — a donation enters the pool either as a consumer's loyalty-reward donation (digital) or as a till-paid donation (cash/card via Stripe-or-other; we just record the +1).
2. **Record** — the system increments `pool_balance` by 1 drink unit per donation. Append-only ledger entries are how the pool is computed.
3. **Serve** — when someone asks for a suspended coffee, the barista taps "Serve from pool" on the POS and the system decrements by 1. The unit count goes down; ledger entry preserves who served + when.

#### 4.5.3 Core rules

* **Scope:** pool is per-cafe (`cafe_id`), not per-brand. A multi-location brand has independent pools per shop.
* **Currency:** drink units (integer). NEVER monetary value. Avoids tax / accounting / refund classification headaches.
* **Floor:** pool can never go negative. Server enforces with a transactional check before insert.
* **Opt-in:** controlled per-cafe by `cafes.suspended_coffee_enabled`. Disabled by default.
* **Privacy:** the consumer-app NEVER shows raw donor identities — only aggregate counts ("12 coffees donated today"). The barista POS sees the pool balance and a "+1 received" toast on donation.

#### 4.5.4 B2B setup — Settings toggle + Learn More modal

In `b2b-dashboard/src/views/SettingsView.tsx` (under a new "Community" card or as a row in the existing Brand-profile card):

* **Toggle** labeled "Suspended Coffee Pool" — on/off per cafe. When the brand has multiple cafes, render one toggle per cafe in a stacked list.
* **Info icon** next to the toggle. Tap → opens a `LearnMoreModal` explaining:
    * Origin / ethos (1 short paragraph).
    * The 3-step operational flow above (Accept / Record / Serve), each with a one-line description.
    * What it costs them (nothing — it's a manual ops feature, just bookkeeping).
* Toggle ON triggers `PATCH /api/admin/cafes/{cafe_id}` with `{suspended_coffee_enabled: true}`.

#### 4.5.5 Consumer-app — digital nudge in Explore

When `cafe.suspended_coffee_enabled === true`, the cafe's `DiscoverCafeCard` shows a new **"Community Board"** badge (mint pill with a heart-hands icon, sits adjacent to the existing `LCP+` and `Active Offers` pills). Inside the `CafeDetailsModal`, a dedicated row shows:

* Current pool count: `"3 coffees waiting on the board"` (singular when 1, hidden when 0 to avoid empty-state guilt)
* Two CTAs:
    * **"Donate a coffee"** — opens donation flow (Mode 1 below).
    * **"Learn more"** — opens the same ethos modal as the B2B Learn More.

#### 4.5.6 Mode 1 — Loyalty donation (consumer app)

* Available only when the consumer has at least 1 banked reward (`/me/wallet.banked_rewards >= 1`) for the SAME brand the cafe belongs to. Cross-brand donations are out-of-scope for V1 (avoids any legal/value-transfer ambiguity).
* Confirmation modal:
    * "Donate 1 banked reward to **{cafe_name}**'s Community Board?"
    * "{X} coffees are already waiting."
    * Buttons: Cancel / Confirm donation.
* On confirm:
    * Frontend POSTs `/api/consumer/suspended-coffee/donate-loyalty` with `{cafe_id}`.
    * Backend, in a single transaction:
        * Verifies the consumer has a banked reward for the cafe's brand (`/me/wallet` math: `floor(stamp_total / 10) >= 1`).
        * Inserts a `REDEEM` row into `stamp_ledger` (consumes the banked reward).
        * Inserts a `donate_loyalty` row into `suspended_coffee_ledger` with `+1` and the consumer's `user_id` as donor.
    * Response: `{ok: true, new_pool_balance: int}`.
* The consumer's reward count goes down by 1; the cafe's pool count goes up by 1. No money moves anywhere.

#### 4.5.7 Mode 2 — Paid at till (Barista POS)

In `b2b-dashboard/src/views/BaristaPOSView.tsx`, when the cafe has `suspended_coffee_enabled = true`:

* New "+1 Pay It Forward" button visible alongside the existing Paid/Free steppers. Tapping it:
    * Increments a local `pending_pif_units` integer (allow up to 10 per scan to keep the workflow tappable).
    * Shows an inline pill `"+{N} suspended coffee(s) added to community board"`.
* On Confirm Scan, after the existing `b2bScan` call succeeds, the POS additionally POSTs `/api/b2b/suspended-coffee/donate-till` with `{count: pending_pif_units}` (skipped if 0).
* Backend inserts one `donate_till` row per unit (or one row with `units_delta = N` — implementation detail; recommend per-unit rows for cleaner audit).
* Toast confirms: `"+N coffees added to the board (now: {pool_balance})"`.

#### 4.5.8 Claiming — Barista POS pool counter + Serve

Always-visible (when feature enabled) panel on the POS view:

* **Header:** "Community Board: {pool_balance} coffees"
* **"Serve from pool"** button — disabled when `pool_balance === 0`.
* Tap behavior:
    * Confirmation: "Serve 1 suspended coffee from the pool?"
    * On confirm: POSTs `/api/b2b/suspended-coffee/serve` (no body — the cafe_id comes from the venue API key).
    * Backend, in a single transaction with `SELECT … FOR UPDATE`-style locking on the cafe row to serialize concurrent serves:
        * Reads current pool balance (`SUM(units_delta) WHERE cafe_id = $1`).
        * If balance < 1, return 409 with `{detail: "Pool is empty"}`.
        * Otherwise insert a `serve` row with `units_delta = -1` and the current `barista_id` (from the store JWT, eventually).
* Toast: `"1 suspended coffee served. {new_balance} remaining."`
* No customer identity is recorded for the serve — the whole point is that anonymous people can claim without dignity loss.

#### 4.5.9 API surface summary

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/consumer/suspended-coffee/donate-loyalty` | consumer JWT | Mode 1 — burn 1 banked reward, +1 to cafe pool |
| `POST` | `/api/b2b/suspended-coffee/donate-till` | venue API key | Mode 2 — record N till-paid donations |
| `POST` | `/api/b2b/suspended-coffee/serve` | venue API key | Decrement pool by 1, log the serve |
| `GET` | `/api/b2b/suspended-coffee/pool` | venue API key | Cafe's current pool balance — POS polls this on mount + after every action |
| `GET` | `/api/consumer/cafes` (existing) | consumer JWT | Add `suspended_coffee_pool: int` and `suspended_coffee_enabled: bool` to each cafe payload |

#### 4.5.10 Database migrations required

* **`migrations/0020_add_suspended_coffee.sql`**:
    ```sql
    -- Per-cafe opt-in flag. Default OFF so existing cafes don't accidentally
    -- enroll without explicit consent from the owner.
    ALTER TABLE cafes
        ADD COLUMN suspended_coffee_enabled BOOLEAN NOT NULL DEFAULT FALSE;

    CREATE INDEX idx_cafes_suspended_coffee_enabled
        ON cafes (suspended_coffee_enabled) WHERE suspended_coffee_enabled = TRUE;

    -- Append-only ledger. Pool balance for a cafe = SUM(units_delta) WHERE
    -- cafe_id = $1. Floor check (no negative pool) is enforced at the API
    -- layer inside a transaction, not via a CHECK constraint, because the
    -- check needs to span rows.
    CREATE TABLE suspended_coffee_ledger (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        cafe_id         UUID         NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
        event_type      TEXT         NOT NULL CHECK (event_type IN (
                            'donate_loyalty', 'donate_till', 'serve'
                        )),
        units_delta     INTEGER      NOT NULL CHECK (units_delta <> 0),
        donor_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
        barista_id      UUID         REFERENCES baristas(id) ON DELETE SET NULL,
        note            TEXT,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
    );

    CREATE INDEX idx_suspended_coffee_cafe_created
        ON suspended_coffee_ledger (cafe_id, created_at DESC);
    CREATE INDEX idx_suspended_coffee_donor
        ON suspended_coffee_ledger (donor_user_id) WHERE donor_user_id IS NOT NULL;

    -- Append-only guard, mirroring the stamp_ledger trigger pattern. This
    -- keeps the audit trail intact even against accidental admin SQL.
    CREATE OR REPLACE FUNCTION suspended_coffee_block_mutations()
    RETURNS trigger AS $$
    BEGIN
        RAISE EXCEPTION 'suspended_coffee_ledger is append-only (% not allowed)', TG_OP;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER suspended_coffee_no_update
        BEFORE UPDATE ON suspended_coffee_ledger
        FOR EACH ROW EXECUTE FUNCTION suspended_coffee_block_mutations();

    CREATE TRIGGER suspended_coffee_no_delete
        BEFORE DELETE ON suspended_coffee_ledger
        FOR EACH ROW EXECUTE FUNCTION suspended_coffee_block_mutations();
    ```

---

## 5. Database migrations — full list

Three new migrations in numeric order. All are additive + reversible (see "Rollback note" below).

| File | Adds | Touches |
|---|---|---|
| `migrations/0018_add_offer_custom_text.sql` | `offers.custom_text TEXT` | `offers` |
| `migrations/0019_add_cancellation_feedback.sql` | `cancellation_feedback` table | new |
| `migrations/0020_add_suspended_coffee.sql` | `cafes.suspended_coffee_enabled BOOLEAN`, `suspended_coffee_ledger` table + append-only triggers | `cafes`, new |

**Rollback note.** Each migration is paired with a reverse SQL file in `migrations/rollback/` that drops what was added. Standard pattern: `0018_revert.sql` → `ALTER TABLE offers DROP COLUMN custom_text;`. Don't run a rollback against a populated `suspended_coffee_ledger` without first deciding what to do with the donation history — losing those rows = losing community-trust capital.

**Application order.** Apply 0018 → 0019 → 0020 sequentially via `python -m scripts.apply_migration migrations/00XX_*.sql`. Order doesn't strictly matter (no cross-migration FKs) but lower-number-first is the convention.

---

## 6. Cross-cutting concerns

### 6.1 `app/models.py` and `b2b-dashboard/src/lib/offers.ts` lockstep

The `OFFER_TYPES` constant is duplicated in three places:

* `app/models.py` — Python tuple, drives validation
* `app/schemas.py` — Pydantic Literal for API boundary
* `b2b-dashboard/src/lib/offers.ts` — TS array, drives the form picker

Adding `'custom'` requires touching all three in the same commit. Drift = silent rejection of valid frontend submissions.

### 6.2 Consumer-app `cafes.ts` mirror

The consumer-app keeps its own `amenities.ts` mirror of the b2b catalogue. The amenity catalogue itself isn't changing in this PRD, but if a future PRD adds amenities both copies must change in lockstep.

### 6.3 `models.sql` is stale

We've decided not to keep `models.sql` strictly in sync with migrations (the migrations + ORM are the source of truth). When applying these three migrations, **also** append the new tables/columns to `models.sql` for the operator-facing read-only schema map. This is a 30-line diff per migration.

### 6.4 Authentication scope

* Mode 1 (consumer donation) requires a valid consumer JWT with `aud="consumer"`.
* Mode 2 + Serve require the existing `Venue-API-Key` header (cafe UUID) — same auth model as `/api/b2b/scan`. No new auth surface.
* Brand owners turning the toggle on/off go through the existing `Depends(get_admin_session)` (admin JWT, brand-scoped).

### 6.5 Concurrency on `suspended_coffee_ledger.serve`

Two baristas at the same cafe could double-tap "Serve from pool" simultaneously and try to drain the last unit. The serve handler MUST wrap the balance read + insert in a single transaction with `SELECT … FROM cafes WHERE id = $1 FOR UPDATE` (cheap lock, lasts microseconds). Insert before the lock releases. Pattern mirrors `app/main.py::scan` for the stamp ledger.

### 6.6 Stripe — no impact

None of these features touch Stripe. The Cancellation Feedback Flow happens BEFORE the existing Stripe portal redirect; no Stripe API surface changes.

### 6.7 Resend — no impact

No new transactional emails in scope. Future enhancements could add a "weekly community board summary" email — flagging as out-of-scope-for-V1 to keep scope tight.

---

## 7. Build order + dependencies

Strict ordering within a feature; features can be built in parallel by different contributors otherwise.

1. **Schema first** — apply 0018, 0019, 0020 to local dev DB. Update `app/models.py` ORM definitions. Update `models.sql` mirror.
2. **Backend per feature** — schemas + handlers + tests in this order:
    * 4.3 Custom offers (smallest blast radius, validates the offer-type lockstep pattern)
    * 4.2 Cancellation feedback (one new endpoint, isolated)
    * 4.5 Pay It Forward (most complex; 4 new endpoints + cross-cutting balance logic)
    * 4.1 Explore tab (pure frontend; no backend)
3. **Frontend per surface** — one PR per dashboard, kept small:
    * `b2b-dashboard` — `PromotionsView` (4.3 + 4.4) → `BillingView` + `App.tsx::handleOpenPortal` (4.2) → `SettingsView` + `BaristaPOSView` (4.5)
    * `consumer-app` — Discover→Explore rename + amenity multi-select (4.1) → Community Board badge + donation flow (4.5)
4. **End-to-end smoke** — local dev with seed data, then push to droplet.

---

## 8. Acceptance criteria

A feature is "done" only when ALL of the following are true:

### Feature 4.1 (Explore)

* [ ] Bottom-nav label reads "Explore" (not "Discover").
* [ ] Tapping the amenity-filter chip opens a multi-select sheet.
* [ ] Selecting 2+ amenities applies AND-semantic filter; result count updates live.
* [ ] Filter state persists across cafe-detail modal open/close in the same Explore session.
* [ ] No new error states surfaced when location permission is denied (existing fallback preserved).

### Feature 4.2 (Cancellation feedback)

* [ ] Clicking "Manage billing & invoices" in BillingView opens the modal, NOT the Stripe portal directly.
* [ ] Modal blocks "Continue" until reason + acknowledgement are set.
* [ ] `reason="other"` requires non-empty `details`.
* [ ] Successful submit logs a row to `cancellation_feedback` AND opens the Stripe portal in the same browser tab.
* [ ] API error surfaces inline; Stripe portal does NOT open.
* [ ] `AddLocationDialog`'s portal CTA (the secondary entry point) gates behind the same modal.

### Feature 4.3 + 4.4 (Custom offers + inspiration)

* [ ] Picker shows 5 offer types: percent, fixed, bogo, double_stamps, **custom**.
* [ ] Selecting "custom" hides target/amount fields and shows a textarea (max 280 chars).
* [ ] Inspiration placeholder cycles through 3 strings on focus, pauses on first keystroke.
* [ ] Backend rejects `offer_type="custom"` with empty `custom_text` (422).
* [ ] Backend rejects non-custom types with `custom_text` set (or silently ignores — TBD).
* [ ] Consumer-app `DiscoverOfferRow` renders `custom_text` for custom offers.
* [ ] Existing offer types render unchanged (regression check).

### Feature 4.5 (Pay It Forward)

* [ ] B2B Settings → toggle per-cafe, persists to `cafes.suspended_coffee_enabled`.
* [ ] Learn More modal opens from both B2B Settings AND consumer CafeDetailsModal — same content.
* [ ] Community Board badge appears on Discover/Explore card iff `suspended_coffee_enabled` AND `pool_balance > 0` (or always when enabled — TBD).
* [ ] Mode 1 donation requires `>= 1 banked reward` for the SAME brand; otherwise CTA disabled with tooltip.
* [ ] Mode 1 confirmation atomically: redeems 1 reward + adds 1 to pool.
* [ ] Mode 2 "+1 Pay It Forward" counter on POS, preserved across pre-scan staging.
* [ ] Serve button disabled when `pool_balance === 0`.
* [ ] Concurrent-serve test: two POS sessions can't both drain the last coffee.
* [ ] Pool balance never negative, ever.

---

## 9. Out of scope (V1)

These adjacent features keep popping up — explicitly NOT in this PRD:

* **Cross-brand loyalty donations** — Mode 1 is brand-scoped only; donating an LCP+ Global reward to a private-brand cafe (or vice-versa) is deferred.
* **Refund / reverse a donation** — append-only ledger means no UI to "undo" a donation; if the operator ever needs to reverse, it's a manual SQL insert with a corrective `units_delta`. Acceptable for V1; revisit if community ops complains.
* **Suspended coffee stats on Super-Admin** — no platform-wide analytics surface for community pool data in this PRD. Easy follow-up: aggregate read on the admin-dashboard.
* **Donor leaderboard / gamification** — privacy ask, deliberately omitted.
* **Email notifications** — no Resend templates for "your donation was claimed" / "your pool is full" etc.
* **Premium plan tier** in `/plan-change` — already flagged as 422 server-side; the `STRIPE_PREMIUM_PRICE_ID` provisioning is a separate decision.

---

## 10. References

* [`INFRASTRUCTURE.md`](INFRASTRUCTURE.md) — operator-facing ledger of external services + recent change log.
* [`app/models.py`](app/models.py) — authoritative schema (this PRD references it for §3 verification).
* [`models.sql`](models.sql) — repo-level SQL mirror; **stale**, kept for documentation.
* `consumer-app/src/App.tsx` — current Discover-tab implementation (lines ~830–1300).
* `b2b-dashboard/src/views/BillingView.tsx` — current `openPortal` flow (line ~185).
* `b2b-dashboard/src/views/PromotionsView.tsx` — current offer CRUD form.
* `b2b-dashboard/src/views/BaristaPOSView.tsx` — current POS / scan flow.

---

*End of PRD.*
