-- 0005_add_amenities_and_offers.sql
-- Phase 4 (2026-04-20): back the B2B dashboard's Amenities checklist and
-- Promotions view with real storage, and expose both to the consumer
-- Discover tab via a new /api/consumer/cafes endpoint.
--
-- 1. cafes.amenities: TEXT[] of stable AmenityId strings (see
--    b2b-dashboard/src/lib/amenities.ts). Default '{}' so existing rows
--    read as "no amenities configured yet". Validated at the API boundary,
--    not the DB, so the catalog can evolve without schema churn.
-- 2. offers: brand-scoped promotion windows. starts_at / ends_at are
--    TIMESTAMPTZ — the b2b client converts its local date+time to a UTC
--    ISO string on submit, and the consumer API filters on `now()` to
--    decide what's live.
--
-- Safe to re-run: IF NOT EXISTS guards throughout.

BEGIN;

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS amenities TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

CREATE TABLE IF NOT EXISTS offers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    offer_type  TEXT NOT NULL,
    target      TEXT NOT NULL,
    amount      NUMERIC(10, 2),
    starts_at   TIMESTAMPTZ NOT NULL,
    ends_at     TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT offers_window_valid CHECK (ends_at > starts_at),
    CONSTRAINT offers_type_allowed CHECK (
        offer_type IN ('percent', 'fixed', 'bogo', 'double_stamps')
    ),
    CONSTRAINT offers_target_allowed CHECK (
        target IN ('any_drink', 'all_pastries', 'food', 'merchandise', 'entire_order')
    ),
    CONSTRAINT offers_amount_matches_type CHECK (
        (offer_type IN ('percent', 'fixed') AND amount IS NOT NULL AND amount > 0)
        OR (offer_type IN ('bogo', 'double_stamps') AND amount IS NULL)
    ),
    CONSTRAINT offers_percent_bounded CHECK (
        offer_type <> 'percent' OR (amount > 0 AND amount <= 100)
    )
);

CREATE INDEX IF NOT EXISTS idx_offers_brand_window
    ON offers (brand_id, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_offers_live_window
    ON offers (starts_at, ends_at);

COMMIT;
