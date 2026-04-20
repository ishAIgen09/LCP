-- 0007_add_food_hygiene_rating.sql
-- Phase 4 (2026-04-20): UK Food Hygiene Rating Scheme integration.
-- Stored as TEXT (not SMALLINT) because "Awaiting Inspection" is a first-
-- class value the FSA itself uses when a premises hasn't been audited yet,
-- and we'd rather render that string verbatim than encode it as a sentinel.
--
-- CHECK allow-list mirrors the set surfaced in the b2b-dashboard dropdown
-- and consumed by the consumer app's FoodHygieneBadge. Every existing row
-- defaults to 'Awaiting Inspection' which is the honest signal before a B2B
-- user has set their real rating.

BEGIN;

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS food_hygiene_rating TEXT NOT NULL
        DEFAULT 'Awaiting Inspection';

-- Guard constraint — safe to re-run via the DO block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'cafes_hygiene_rating_allowed'
    ) THEN
        ALTER TABLE cafes
            ADD CONSTRAINT cafes_hygiene_rating_allowed
            CHECK (food_hygiene_rating IN ('1', '2', '3', '4', '5', 'Awaiting Inspection'));
    END IF;
END $$;

COMMIT;
