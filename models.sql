-- =============================================================================
-- The Indie Coffee Loop — schema (post-Brand pivot)
-- =============================================================================
-- Two loyalty models, both driven by brands.scheme_type:
--   'global'  → stamps pool across EVERY cafe whose brand is also 'global'
--   'private' → stamps pool only across the cafes belonging to this brand
--
-- Ledger rule (non-negotiable):
--   stamp_ledger is APPEND-ONLY. Never UPDATE, never DELETE.
--   A customer's current balance is computed at read time, scoped by the
--   scanning cafe's brand scheme (see README / app/main.py::_scoped_balance_stmt).
--   Atomic stamp issuance uses SELECT ... FOR UPDATE on the users row,
--   inside a single transaction, to prevent double-scans.
--
-- Dialect: PostgreSQL (13+). Uses pgcrypto for gen_random_uuid().
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

CREATE TYPE ledger_event_type AS ENUM ('EARN', 'REDEEM');

CREATE TYPE subscription_status AS ENUM (
    'trialing',
    'active',
    'past_due',
    'canceled',
    'incomplete'
);

-- Loyalty scheme for a brand.
--   global  — opt-in to the shared network; stamps pool across ALL global brands
--   private — walled garden; stamps pool only within this brand's own cafes
CREATE TYPE scheme_type AS ENUM ('global', 'private');

-- -----------------------------------------------------------------------------
-- brands — top-level tenant. A brand owns one or more cafes and one Stripe
-- subscription. scheme_type decides the loyalty pool for all its cafes.
-- -----------------------------------------------------------------------------
CREATE TABLE brands (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT        NOT NULL,
    slug                    TEXT        NOT NULL UNIQUE,
    contact_email           TEXT        NOT NULL,
    scheme_type             scheme_type NOT NULL DEFAULT 'global',
    stripe_customer_id      TEXT        UNIQUE,
    stripe_subscription_id  TEXT        UNIQUE,
    subscription_status     subscription_status NOT NULL DEFAULT 'incomplete',
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_brands_subscription_status ON brands (subscription_status);
CREATE INDEX idx_brands_scheme_type         ON brands (scheme_type);

-- -----------------------------------------------------------------------------
-- cafes — a physical branch that belongs to exactly one brand.
-- Subscription / billing fields live on brands, not here.
-- -----------------------------------------------------------------------------
CREATE TABLE cafes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID        NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL UNIQUE,
    address         TEXT        NOT NULL,
    contact_email   TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cafes_brand_id ON cafes (brand_id);

-- -----------------------------------------------------------------------------
-- users — end customers (B2C). Each has a unique 6-character till_code drawn
-- from the uppercase alphanumeric alphabet [A-Z0-9] and a barcode string.
-- -----------------------------------------------------------------------------
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    till_code       CHAR(6)     NOT NULL UNIQUE,
    barcode         TEXT        NOT NULL UNIQUE,
    email           TEXT        UNIQUE,
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT till_code_format CHECK (till_code ~ '^[A-Z0-9]{6}$')
);

-- -----------------------------------------------------------------------------
-- baristas — staff accounts scoped to a single cafe.
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
-- stamp_ledger — APPEND-ONLY source of truth for loyalty events.
--
-- Balance for a customer is computed at read time, scoped by the scanning
-- cafe's brand scheme:
--
--   -- PRIVATE (this brand's cafes only):
--   SELECT COALESCE(SUM(sl.stamp_delta), 0)
--   FROM   stamp_ledger sl
--   JOIN   cafes c ON sl.cafe_id = c.id
--   WHERE  sl.customer_id = $1
--     AND  c.brand_id = $2;    -- scanning brand
--
--   -- GLOBAL (all global-scheme brands):
--   SELECT COALESCE(SUM(sl.stamp_delta), 0)
--   FROM   stamp_ledger sl
--   JOIN   cafes  c ON sl.cafe_id  = c.id
--   JOIN   brands b ON c.brand_id  = b.id
--   WHERE  sl.customer_id = $1
--     AND  b.scheme_type = 'global';
--
-- Writes happen inside a single transaction that FIRST executes
--     SELECT id FROM users WHERE id = $1 FOR UPDATE;
-- so concurrent scans serialise on the user row and cannot produce duplicate
-- EARN rows for the same scan.
-- -----------------------------------------------------------------------------
CREATE TABLE stamp_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID        NOT NULL REFERENCES users(id)    ON DELETE RESTRICT,
    cafe_id         UUID        NOT NULL REFERENCES cafes(id)    ON DELETE RESTRICT,
    barista_id      UUID                 REFERENCES baristas(id) ON DELETE SET NULL,
    event_type      ledger_event_type NOT NULL,
    stamp_delta     INTEGER     NOT NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ledger_delta_matches_event CHECK (
        (event_type = 'EARN'   AND stamp_delta = 1)
     OR (event_type = 'REDEEM' AND stamp_delta = -10)
    )
);

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
