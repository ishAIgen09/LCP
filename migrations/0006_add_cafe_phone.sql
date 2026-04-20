-- 0006_add_cafe_phone.sql
-- Phase 4 (2026-04-20): consumer Contact & Location screen needs a phone
-- number per cafe. Nullable — the B2B dashboard's phone-collection form
-- doesn't exist yet, so every existing row stays NULL and the client renders
-- a "not shared yet" empty state.

BEGIN;

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS phone TEXT;

COMMIT;
