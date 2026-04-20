-- 0009_add_brand_kyc_fields.sql
-- Phase 4 (2026-04-20): KYC / Stripe-compliance fields on `brands`.
--
-- Added for Settings → "Owner Details" + "Legal & Compliance" sections.
-- All fields nullable so existing rows (seeded before KYC) stay valid; the
-- admin fills them in from the dashboard at their own pace.
--
-- Kept as TEXT without CHECK constraints — these are display fields the
-- brand owner enters free-form. Validation lives at the API boundary
-- (pydantic) and the UI, not the DB.
--
-- Safe to re-run: IF NOT EXISTS guards throughout.

BEGIN;

ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS owner_first_name           TEXT,
    ADD COLUMN IF NOT EXISTS owner_last_name            TEXT,
    ADD COLUMN IF NOT EXISTS owner_phone                TEXT,
    ADD COLUMN IF NOT EXISTS company_legal_name         TEXT,
    ADD COLUMN IF NOT EXISTS company_address            TEXT,
    ADD COLUMN IF NOT EXISTS company_registration_number TEXT;

COMMIT;
