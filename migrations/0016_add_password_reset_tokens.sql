-- 0016 — password reset tokens for the brand-admin "Forgot password" flow.
--
-- Stores a single-use bcrypt-hashed token per brand owner. Tokens carry
-- a short TTL (60 minutes) and are invalidated on first successful use
-- (used_at IS NOT NULL). The /api/auth/forgot-password endpoint logs the
-- mocked reset link to stdout in lieu of SMTP — same delivery stub as
-- the consumer OTP flow today.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id    UUID         NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    token_hash  TEXT         NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_brand_id_created_at
    ON password_reset_tokens(brand_id, created_at DESC);
