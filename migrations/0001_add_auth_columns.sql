-- 0001_add_auth_columns.sql
-- Adds the per-row credential columns required by the productionised auth flow:
--   brands.password_hash  — bcrypt hash for brand-owner admin login
--   cafes.store_number    — human-typable store identifier (e.g. STORE-001)
--   cafes.pin_hash        — bcrypt hash of the store's 4-digit POS PIN
--
-- Safe to run on an existing database — every statement is IF NOT EXISTS
-- and the constraint is wrapped in a DO block that skips if already present.

ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS password_hash TEXT;

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS store_number TEXT;

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS pin_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cafes_store_number
    ON cafes (store_number);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_number_format'
    ) THEN
        ALTER TABLE cafes
            ADD CONSTRAINT store_number_format CHECK (
                store_number IS NULL OR store_number ~ '^STORE-[A-Z0-9]{3,10}$'
            );
    END IF;
END
$$;
