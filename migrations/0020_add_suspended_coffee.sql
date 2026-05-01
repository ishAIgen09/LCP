-- 0020 — Pay It Forward / Suspended Coffee system
-- (PRD §4.5 — Pay It Forward (Suspended Coffee) System).
--
-- Two database-level pieces:
--   1. cafes.suspended_coffee_enabled — per-cafe opt-in toggle.
--      Default OFF so existing cafes don't accidentally enroll. The
--      partial index speeds up the consumer-app's "show only
--      participating cafes" filter.
--   2. suspended_coffee_ledger — append-only event log. Pool balance
--      for a cafe is computed at read time as
--          SUM(units_delta) WHERE cafe_id = $1.
--      Append-only is enforced with the same trigger pattern as
--      stamp_ledger (see models.sql) so accidental admin SQL can't
--      destroy the audit trail. Floor check (no negative pool) is
--      enforced at the API layer inside a transaction with
--      `SELECT … FROM cafes WHERE id = $1 FOR UPDATE`, NOT a CHECK
--      constraint, because the check needs to span rows.

-- ── 1. cafes.suspended_coffee_enabled ──────────────────────────────
ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS suspended_coffee_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index — only the rows we'll query (participating cafes).
-- Using a regular index here would index every cafe's `false` flag
-- which is most rows.
CREATE INDEX IF NOT EXISTS idx_cafes_suspended_coffee_enabled
    ON cafes (suspended_coffee_enabled)
    WHERE suspended_coffee_enabled = TRUE;

-- ── 2. suspended_coffee_ledger ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS suspended_coffee_ledger (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Pool scope: ALWAYS per-cafe. Multi-location brands have
    -- independent pools per shop. (PRD §4.5.3 architectural rule.)
    cafe_id         UUID         NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    -- 3 allowed values — kept in sync with
    -- app/models.py::SUSPENDED_COFFEE_EVENT_TYPES.
    event_type      TEXT         NOT NULL CHECK (event_type IN (
                        'donate_loyalty',
                        'donate_till',
                        'serve'
                    )),
    -- Always +1 for donate_loyalty / donate_till, -1 for serve in V1.
    -- The CHECK below just blocks the meaningless 0 case; we don't
    -- couple to specific magnitudes so future ops adjustments
    -- (e.g. a cafe-side correction) don't need a migration.
    units_delta     INTEGER      NOT NULL CHECK (units_delta <> 0),
    -- Loyalty donations originate from a known consumer (FK to users).
    -- Till-paid donations + serve are anonymous → NULL.
    -- ON DELETE SET NULL keeps the ledger row intact even if the
    -- consumer's user record is later removed (rare but possible).
    donor_user_id   UUID         REFERENCES users(id) ON DELETE SET NULL,
    -- Which barista performed the action. NULL allowed because
    -- anonymous staff actions are valid in V1; we'll tighten this
    -- when barista accounts get individual logins.
    barista_id      UUID         REFERENCES baristas(id) ON DELETE SET NULL,
    note            TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suspended_coffee_cafe_created
    ON suspended_coffee_ledger (cafe_id, created_at DESC);

-- Sparse partial index — only ~1/3 of rows have a donor (loyalty
-- donations); the other 2/3 are anonymous till-paid + serve events.
CREATE INDEX IF NOT EXISTS idx_suspended_coffee_donor
    ON suspended_coffee_ledger (donor_user_id)
    WHERE donor_user_id IS NOT NULL;

-- ── Append-only guard, mirroring stamp_ledger's trigger pattern ─────
-- CREATE OR REPLACE makes the function definition idempotent.
-- DROP TRIGGER IF EXISTS handles the trigger creation idempotency
-- (Postgres < 14 doesn't have CREATE TRIGGER IF NOT EXISTS).
CREATE OR REPLACE FUNCTION suspended_coffee_block_mutations()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'suspended_coffee_ledger is append-only (% not allowed)', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS suspended_coffee_no_update ON suspended_coffee_ledger;
CREATE TRIGGER suspended_coffee_no_update
    BEFORE UPDATE ON suspended_coffee_ledger
    FOR EACH ROW EXECUTE FUNCTION suspended_coffee_block_mutations();

DROP TRIGGER IF EXISTS suspended_coffee_no_delete ON suspended_coffee_ledger;
CREATE TRIGGER suspended_coffee_no_delete
    BEFORE DELETE ON suspended_coffee_ledger
    FOR EACH ROW EXECUTE FUNCTION suspended_coffee_block_mutations();
