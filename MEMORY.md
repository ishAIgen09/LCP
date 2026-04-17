# MEMORY — The Indie Coffee Loop

## Phase 1: **COMPLETE** ✅

**Phase 1 — Data & Admin Foundation** is finished. All models, admin/read routes, and the atomic stamp/redeem path are in place. The ledger is the source of truth; balances are always `SUM(stamp_delta)`; concurrent stamp requests for the same customer serialise on `SELECT ... FOR UPDATE` against the `users` row, so double-stamps are structurally impossible.

**Do not start Phase 2 (Barista POS + Stripe) or Phase 3 (B2C PWA + SSE + Map) until the user explicitly opens the next phase.**

### Deferred from Phase 1 (worth doing before Phase 2 prod-readiness, but user declared Phase 1 complete)
- Automated concurrency load test proving zero double-stamps under N simultaneous `POST /api/venues/stamp` calls for the same `user_id` (this was a PRD exit criterion, KR2). The code path is correct by construction via the row lock, but no test harness exists yet.

## Phase 1 progress

- [x] **Step 1 — Scaffolding & ORM models.** [requirements.txt](requirements.txt), [.env.example](.env.example), [app/__init__.py](app/__init__.py), [app/main.py](app/main.py) (bare `FastAPI()`, no routes), [app/database.py](app/database.py) (async SQLAlchemy engine + `AsyncSessionLocal` + `Base`, config via `pydantic-settings` reading `DATABASE_URL`), [app/models.py](app/models.py) (`Cafe`, `User`, `Barista`, `Subscription`, `StampLedger` with `LedgerEventType` / `SubscriptionStatus` PG enums, CHECK constraints, and indexes — 1:1 with [models.sql](models.sql)).
- [x] **Local Docker infrastructure.** [docker-compose.yml](docker-compose.yml) spins up `postgres:15-alpine` as `indie_coffee_loop_postgres`, credentials `postgres` / `localpassword`, database `indie_coffee_loop`, port `5432:5432`, named volume `postgres_data` for persistence. [.env](.env) sets `DATABASE_URL=postgresql+asyncpg://postgres:localpassword@localhost:5432/indie_coffee_loop` to match. DB is hydrated with [models.sql](models.sql).
- [x] **till_code character set widened to `^[A-Z0-9]{6}$`.** Constraint renamed `till_code_is_6_digits` → `till_code_format` in both [models.sql](models.sql) and [app/models.py](app/models.py). **Run this once against the hydrated DB** to sync it:
    ```sql
    ALTER TABLE users DROP CONSTRAINT till_code_is_6_digits;
    ALTER TABLE users ADD CONSTRAINT till_code_format CHECK (till_code ~ '^[A-Z0-9]{6}$');
    ```
- [x] **Step 2 — Pydantic schemas + foundational admin/read routes.**
    - [app/schemas.py](app/schemas.py): `CafeCreate`, `CafeResponse`, `UserCreate`, `UserResponse`, `BalanceResponse`. `UserCreate.till_code` optional, validated against `^[A-Z0-9]{6}$`.
    - [app/main.py](app/main.py): CORS middleware (open in dev), `POST /api/admin/cafes`, `POST /api/admin/users` (auto-generates `till_code` via `secrets.choice` over `[A-Z0-9]` and `barcode` via `secrets.token_hex(12)` when not provided), `GET /api/users/{user_id}/balance` (returns `SUM(stamp_delta)` via `func.coalesce(func.sum(...), 0)`; 404 on unknown user).
    - Dependency-injected `AsyncSession` via `get_session`.
- [x] **Step 3 — Atomic stamp issuance & redemption.**
    - [app/schemas.py](app/schemas.py) adds `StampRequest` / `StampResponse` / `RedeemRequest` / `RedeemResponse`. `StampRequest` has a `model_validator` that enforces *exactly one* of `user_id` or `till_code` (never both, never neither).
    - Shared helper `_lock_user_and_read_balance` in [app/main.py](app/main.py): issues `SELECT ... FROM users WHERE ... FOR UPDATE`, then computes `SUM(stamp_delta)` while the row is locked.
    - `POST /api/venues/stamp`: wrapped in `async with session.begin()`; verifies the cafe, locks the user row, reads balance, inserts `StampLedger(event_type=EARN, stamp_delta=+1)`, flushes, commits. `reward_earned = (new_balance > 0 and new_balance % 10 == 0)` — fires on every 10th stamp, so accumulated rewards still celebrate.
    - `POST /api/venues/redeem`: same locking pattern; refuses with HTTP 409 if `current_balance < 10`; otherwise inserts `StampLedger(event_type=REDEEM, stamp_delta=-10)`.
    - Both routes accept `barista_id` (optional) for audit.
    - `REWARD_THRESHOLD = 10` is the single tunable constant in [app/main.py](app/main.py).

## Not now (do not write code for these yet)

- **Phase 2** — Barista POS (HTML5 WebRTC scanner, manual 6-digit `till_code` entry), barista auth, Stripe subscription webhooks / billing UI.
- **Phase 3** — Consumer PWA, Server-Sent Events live stamp updates, map discovery of participating cafes.

## Rule

Phase 1 Python is now being written. Phase 2 and Phase 3 code (POS HTML/JS, Stripe webhooks, SSE, PWA, map) must NOT be written until the user explicitly opens that phase.
