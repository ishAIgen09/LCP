-- 0003_add_consumer_fields.sql
-- Phase 4 (Consumer App, 2026-04-18): the `users` table is the Consumer entity.
-- Extending it with first_name / last_name so the native app's Sign Up flow
-- (First Name + Last Name + Email) has somewhere to land, and adding a
-- `consumer_otps` table for the email-OTP passwordless login.
--
-- Safe to re-run: ADD COLUMN ... IF NOT EXISTS, CREATE TABLE IF NOT EXISTS.

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name  TEXT;

-- consumer_otps — short-lived email verification codes for the consumer app.
-- One row per request; we store the bcrypt hash of the 4-digit code rather
-- than the code itself. `used_at` is set on successful verification so a code
-- can't be replayed. Rows are cheap — a housekeeping cron can delete
-- used / expired rows; for now they just accumulate in dev.
CREATE TABLE IF NOT EXISTS consumer_otps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT        NOT NULL,
    code_hash       TEXT        NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    attempts        INTEGER     NOT NULL DEFAULT 0,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consumer_otps_email_created
    ON consumer_otps (lower(email), created_at DESC);

COMMIT;
