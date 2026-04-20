-- 0008_offer_target_cafes.sql
-- Phase 4 (2026-04-20): let brand owners scope an offer to specific locations
-- instead of always broadcasting to every cafe under the brand.
--
-- Semantics:
--   target_cafe_ids IS NULL  → "All Locations" (default; broadcasts to every
--                             cafe in the offer's brand — existing behavior).
--   target_cafe_ids = '{...}' → only those specific cafe UUIDs see the offer.
--
-- UUID[] (not JSONB) to stay consistent with cafes.amenities and to get cheap
-- membership checks via ANY(). No FK enforcement on array elements (Postgres
-- doesn't support it), so orphan ids are possible if a cafe is deleted — the
-- consumer feed filter should ignore unknown ids gracefully.
--
-- Safe to re-run: IF NOT EXISTS guard.

BEGIN;

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS target_cafe_ids UUID[] NULL;

COMMENT ON COLUMN offers.target_cafe_ids IS
    'NULL = applies to all cafes in the brand. Non-NULL array = only those cafes.';

COMMIT;
