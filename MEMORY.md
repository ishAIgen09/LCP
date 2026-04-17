# MEMORY — The Indie Coffee Loop

## Status

- **Phase 1 (Data & Admin Foundation):** ✅ COMPLETE.
- **Phase 2 (B2B Barista POS & Stripe Billing):** 🔨 IN PROGRESS — security gate on venue routes is live.
- **Phase 3 (B2C Consumer App & Map Discovery):** 🚫 GATED — do not start.

### Deferred from Phase 1
- Automated concurrency load test proving zero double-stamps under N simultaneous `POST /api/venues/stamp` calls for the same `user_id` (PRD KR2). The code path is correct by construction via the row lock, but no test harness exists yet.

## Phase 2 progress

- [x] **Security gate on venue routes.**
    - [app/auth.py](app/auth.py) exposes the `get_active_cafe` FastAPI dependency, which:
        1. Reads the `Venue-API-Key` request header — **401** if missing.
        2. Parses it as a UUID and looks up the Cafe by id — **401** on parse failure or unknown cafe. MVP uses `cafe.id` as the API key; swap for a hashed secret when Stripe billing lands.
        3. Enforces `subscription_status == 'active'` — **HTTP 402 Payment Required** otherwise.
    - `POST /api/venues/stamp` and `POST /api/venues/redeem` take `cafe: Cafe = Depends(get_active_cafe)` plus the existing session. The cafe identity is taken **exclusively from the authenticated venue** — `cafe_id` has been removed from `StampRequest` / `RedeemRequest`, so the body carries only the customer identifier (`user_id` XOR `till_code`) and optional `barista_id`. No body/auth reconciliation or 403 mismatch path is needed any more.
    - These two routes dropped `async with session.begin():` and moved to the implicit-transaction + explicit `session.commit()` pattern so they can share the auth dep's session. Atomicity preserved: the `SELECT ... FOR UPDATE` row lock is acquired inside the autobegun transaction and released at `session.commit()`. On any HTTPException, `get_session` cleanup closes the session and rolls back.
- [x] **Temporary admin activate endpoint.** `POST /api/admin/cafes/{cafe_id}/activate` flips `subscription_status` to `'active'`. **Remove or gate behind admin auth** when Stripe webhooks land.
- [x] **Barista POS frontend (Smart Pause redemption flow).**
    - [static/index.html](static/index.html) — single mobile-responsive HTML5 + Vanilla JS page (CSS and JS inline, dark UI, max-width 480px). No framework, no build step.
    - Config section: input for `Venue-API-Key`, Save / Clear buttons, persisted to `localStorage` under key `indie_coffee_loop_api_key`.
    - Scanner: [html5-qrcode 2.3.8 from unpkg CDN](https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js). Start/Stop buttons; back camera (`facingMode: "environment"`); 240×240 qrbox; 10 fps.
    - **Scanner is always in "Stamp Mode" by default.** On a successful scan: decoded text is uppercased → validated against `^[A-Z0-9]{6}$` → 2.5s dedupe on identical rapid scans → POST to `/api/venues/stamp` with `Venue-API-Key` header.
    - **Smart Pause on reward.** If the stamp response has `stamp_balance >= 10` OR `reward_earned: true`, the scanner is paused via `Html5Qrcode.pause(true)` (video stream stays alive for instant resume), a full-screen gold modal opens showing "🎉 FREE DRINK AVAILABLE! Balance: X", and two large buttons are offered:
        - **Redeem Reward Now** → POST `/api/venues/redeem` with the held `till_code`. On 2xx: dismiss modal, show success toast with new balance, resume scanner. On 409 (balance changed): dismiss modal with a warn toast and resume. On other errors: keep modal open so barista can retry or hit "Save for Later".
        - **Save for Later** → dismiss modal, resume scanner, short success toast.
    - **Re-scan protection.** After the modal is dismissed (either button), the till_code is marked resolved for 10 s; the camera silently ignores the same code during that window so the still-held customer card doesn't immediately re-trigger a stamp. Different customers are unaffected.
    - Normal non-reward scans still show the success toast (`Stamp added. Balance X/10`). Errors (401 invalid key, 402 inactive subscription, 404 unknown till_code, 422 bad format, network) each map to a distinct red toast.
    - Toast `z-index: 250` > modal `z-index: 200` so redeem errors are visible above the modal.
    - [app/main.py](app/main.py) serves the page via `app.mount("/", StaticFiles(directory="static", html=True), name="static")` as the final statement; run `uvicorn app.main:app` from the project root so the relative `static/` path resolves.
    - Camera access requires a secure context — `localhost` during dev; HTTPS on LAN.
- [ ] **Stripe subscription lifecycle.** Webhooks keeping `subscriptions` and `cafes.subscription_status` in sync.
- [ ] **Barista authentication.**
- [ ] **Redeem flow UI.** The scanner only calls `/api/venues/stamp`; no redeem button yet.

## Phase 1 progress (historical)

- [x] **Step 1 — Scaffolding & ORM models.** [requirements.txt](requirements.txt), [.env.example](.env.example), [app/__init__.py](app/__init__.py), [app/main.py](app/main.py), [app/database.py](app/database.py), [app/models.py](app/models.py) (`Cafe`, `User`, `Barista`, `Subscription`, `StampLedger` + `LedgerEventType` / `SubscriptionStatus` PG enums — 1:1 with [models.sql](models.sql)).
- [x] **Local Docker infrastructure.** [docker-compose.yml](docker-compose.yml) spins up `postgres:15-alpine` (`indie_coffee_loop_postgres`), named volume `postgres_data`, port `5432:5432`. [.env](.env) sets `DATABASE_URL=postgresql+asyncpg://postgres:localpassword@localhost:5432/indie_coffee_loop`. DB hydrated from [models.sql](models.sql).
- [x] **till_code widened to `^[A-Z0-9]{6}$`.** Constraint renamed `till_code_is_6_digits` → `till_code_format` in both [models.sql](models.sql) and [app/models.py](app/models.py). The one-time `ALTER TABLE` has been applied to the hydrated DB.
- [x] **Step 2 — Pydantic schemas + admin/read routes.** `CafeCreate`, `CafeResponse`, `UserCreate`, `UserResponse`, `BalanceResponse` in [app/schemas.py](app/schemas.py). `POST /api/admin/cafes`, `POST /api/admin/users` (auto-generates till_code + barcode), `GET /api/users/{user_id}/balance`.
- [x] **Step 3 — Atomic stamp issuance & redemption.** `StampRequest` / `StampResponse` / `RedeemRequest` / `RedeemResponse`, shared `_lock_user_and_read_balance` helper, `POST /api/venues/stamp` and `POST /api/venues/redeem`. `REWARD_THRESHOLD = 10`. `reward_earned = (new_balance > 0 and new_balance % 10 == 0)`.

## Not now (do not write code for these yet)

- **Phase 3** — Consumer PWA, Server-Sent Events live stamp updates, map discovery of participating cafes.

## Rule

Phase 2 is active. Phase 3 code (Consumer PWA, SSE, map) must NOT be written until the user explicitly opens Phase 3.
