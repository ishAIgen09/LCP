-- 0004_add_global_ledger.sql
-- Phase 4 (Consumer App, 2026-04-19): Hub & Spoke Shadow Ledger.
-- Captures one aggregated row per B2B scan event (quantity bought + any free
-- drinks auto-redeemed on rollover), in parallel with the existing
-- `stamp_ledger` which stores one +1/-10 row per stamp. stamp_ledger remains
-- the source of truth for computing scheme-scoped balances; global_ledger is
-- the platform-wide activity feed the admin/analytics surfaces will read.
--
-- Safe to re-run: IF NOT EXISTS guards on type / table / indexes.

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'global_ledger_action') THEN
        CREATE TYPE global_ledger_action AS ENUM ('earned', 'redeemed');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS global_ledger (
    transaction_id  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    consumer_id     CHAR(6) NOT NULL
        REFERENCES users(till_code) ON DELETE RESTRICT ON UPDATE CASCADE,
    venue_id        UUID NOT NULL
        REFERENCES cafes(id) ON DELETE RESTRICT,
    action_type     global_ledger_action NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity >= 1),
    "timestamp"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT global_ledger_consumer_id_format
        CHECK (consumer_id ~ '^[A-Z0-9]{6}$')
);

CREATE INDEX IF NOT EXISTS idx_global_ledger_consumer_ts
    ON global_ledger (consumer_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_global_ledger_venue_ts
    ON global_ledger (venue_id, "timestamp" DESC);

CREATE INDEX IF NOT EXISTS idx_global_ledger_ts
    ON global_ledger ("timestamp" DESC);

COMMIT;
