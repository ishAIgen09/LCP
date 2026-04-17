-- =============================================================================
-- The Indie Coffee Loop — PHASE 1 schema (Data & Admin Foundation)
-- =============================================================================
-- Scope: Phase 1 ONLY. Do not add POS-auth, SSE subscriber state, or
-- geolocation/map-discovery tables here — those land in Phases 2 and 3.
--
-- Ledger rule (non-negotiable):
--   stamp_ledger is APPEND-ONLY. Never UPDATE, never DELETE.
--   A customer's current balance = SUM(stamp_delta) over their ledger rows.
--   Atomic stamp issuance uses SELECT ... FOR UPDATE on the users row,
--   inside a single transaction, to prevent double-scans.
--
-- Dialect: PostgreSQL (13+). Uses pgcrypto for gen_random_uuid().
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

-- Ledger event type. EARN = +1 stamp. REDEEM = -10 stamps (free drink claim).
CREATE TYPE ledger_event_type AS ENUM ('EARN', 'REDEEM');

-- Cafe-level subscription status, written by admin in Phase 1 and by the
-- Stripe webhook handler in Phase 2. Kept as a small enum so the POS can
-- gate access on status = 'active' without joining extra tables.
CREATE TYPE subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete'
);

-- -----------------------------------------------------------------------------
-- cafes — independent cafe tenants in the network
-- -----------------------------------------------------------------------------
CREATE TABLE cafes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL UNIQUE,           -- url-safe handle
    contact_email   TEXT        NOT NULL,
    -- Denormalised subscription status for fast POS-gate reads.
    -- Source of truth for billing details lives in subscriptions.
    subscription_status subscription_status NOT NULL DEFAULT 'incomplete',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cafes_subscription_status ON cafes (subscription_status);

-- -----------------------------------------------------------------------------
-- users — end customers (B2C). Each has a unique 6-character till_code drawn
-- from the uppercase alphanumeric alphabet [A-Z0-9] and a barcode string.
-- till_code and barcode are kept separate so the barcode can later be
-- rotated without changing the spoken code.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    till_code       CHAR(6)     NOT NULL UNIQUE,            -- spoken/typed at the till
    barcode         TEXT        NOT NULL UNIQUE,            -- scanned via WebRTC
    email           TEXT        UNIQUE,                     -- optional for MVP
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT till_code_format CHECK (till_code ~ '^[A-Z0-9]{6}$')
);

-- till_code UNIQUE already creates a btree index used for lookups by the POS.
-- The PRIMARY KEY on users.id is what the atomic stamp path locks via
--   SELECT ... FROM users WHERE id = $1 FOR UPDATE
-- so no extra index is needed for the lock itself.

-- -----------------------------------------------------------------------------
-- baristas — staff accounts scoped to a single cafe.
-- Included in Phase 1 because the ledger references barista_id for auditing,
-- but auth/login for baristas is Phase 2 (Barista POS). Phase 1 admin
-- endpoints can seed these rows directly.
-- -----------------------------------------------------------------------------
CREATE TABLE baristas (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id         UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    display_name    TEXT        NOT NULL,
    email           TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (cafe_id, email)
);

CREATE INDEX idx_baristas_cafe_id ON baristas (cafe_id);

-- -----------------------------------------------------------------------------
-- subscriptions — minimal Stripe subscription record per cafe.
-- Phase 1 writes rows via admin API. Phase 2 wires up Stripe webhooks to
-- keep this and cafes.subscription_status in sync.
-- -----------------------------------------------------------------------------
CREATE TABLE subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id                 UUID        NOT NULL UNIQUE REFERENCES cafes(id) ON DELETE CASCADE,
    stripe_customer_id      TEXT        UNIQUE,
    stripe_subscription_id  TEXT        UNIQUE,
    status                  subscription_status NOT NULL DEFAULT 'incomplete',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- stamp_ledger — APPEND-ONLY source of truth for loyalty balances.
--
-- Balance for a customer:
--     SELECT COALESCE(SUM(stamp_delta), 0)
--     FROM   stamp_ledger
--     WHERE  customer_id = $1;
--
-- Writes happen inside a single transaction that FIRST executes
--     SELECT id FROM users WHERE id = $1 FOR UPDATE;
-- on the customer row, so concurrent scans serialise on that row and
-- cannot produce duplicate EARN rows for the same scan.
-- -----------------------------------------------------------------------------
CREATE TABLE stamp_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    cafe_id         UUID        NOT NULL REFERENCES cafes(id)    ON DELETE RESTRICT,
    barista_id      UUID                 REFERENCES baristas(id) ON DELETE SET NULL,
    event_type      ledger_event_type NOT NULL,
    stamp_delta     INTEGER     NOT NULL,                       -- +1 for EARN, -10 for REDEEM
    note            TEXT,                                        -- optional admin note
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Enforce the only two shapes we support in Phase 1.
    CONSTRAINT ledger_delta_matches_event CHECK (
        (event_type = 'EARN'   AND stamp_delta = 1)
     OR (event_type = 'REDEEM' AND stamp_delta = -10)
    )
);

-- Fast per-customer balance scans and recent-activity queries.
CREATE INDEX idx_ledger_customer_created ON stamp_ledger (customer_id, created_at DESC);
CREATE INDEX idx_ledger_cafe_created     ON stamp_ledger (cafe_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Immutability guard — block UPDATE and DELETE on the ledger.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION stamp_ledger_block_mutations()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'stamp_ledger is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER stamp_ledger_no_update
    BEFORE UPDATE ON stamp_ledger
    FOR EACH ROW EXECUTE FUNCTION stamp_ledger_block_mutations();

CREATE TRIGGER stamp_ledger_no_delete
    BEFORE DELETE ON stamp_ledger
    FOR EACH ROW EXECUTE FUNCTION stamp_ledger_block_mutations();
