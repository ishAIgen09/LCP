-- 0002_drop_store_prefix.sql
-- UX decision (2026-04-18): baristas type the store ID directly without the
-- "STORE-" prefix. Loosens the format check and rewrites any existing
-- STORE-XXX rows to just XXX so they pass the new constraint.
--
-- Safe to re-run: the DROP is IF EXISTS; the UPDATE targets only rows that
-- still have the prefix; the ADD is gated on pg_constraint absence.

BEGIN;

ALTER TABLE cafes DROP CONSTRAINT IF EXISTS store_number_format;

UPDATE cafes
SET    store_number = substring(store_number FROM 7)
WHERE  store_number ~ '^STORE-[A-Z0-9]{3,10}$';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'store_number_format'
    ) THEN
        ALTER TABLE cafes
            ADD CONSTRAINT store_number_format CHECK (
                store_number IS NULL OR store_number ~ '^[A-Z0-9]{3,10}$'
            );
    END IF;
END
$$;

COMMIT;
