-- 0017 — super_admins table for the platform-level "Super Admin" auth scope.
--
-- Powers POST /api/auth/super/login. Issues a JWT with aud="super-admin"
-- that the admin-dashboard sends as Authorization: Bearer on every
-- /api/admin/platform/* request. Distinct from the brand-scoped `brands`
-- table (admin login) and the cafe-scoped `cafes` table (store login):
-- a super admin is a Local Coffee Perks staff account with cross-tenant
-- read+write privileges, NOT a brand owner.
--
-- Seeding lives in scripts/seed_local_dev.py so the password is bcrypt-hashed
-- in Python (plpgsql can't run bcrypt) and existing dev databases pick up
-- the seed on the next seed run. Production seeding is a separate manual
-- INSERT executed against /root/.env-lcp-production's database.

CREATE TABLE IF NOT EXISTS super_admins (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT         NOT NULL UNIQUE,
    password_hash   TEXT         NOT NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_super_admins_email_lower
    ON super_admins (lower(email));
