-- 0014: enforce one-brand-per-email at the DB layer so B2B logins can
-- never collide. Previously `brands.contact_email` was nullable-free
-- but had no unique index; `admin_login` would just pick the first
-- matching row, which made manual brand creation via the super-admin
-- dashboard quietly dangerous if the admin reused an email.
--
-- `CREATE UNIQUE INDEX IF NOT EXISTS` (not `ALTER TABLE ... ADD
-- CONSTRAINT`) is deliberate — IF NOT EXISTS lets this migration be
-- re-run safely, and the underlying index works identically for uniqueness
-- enforcement. Query planner treats the two the same.
--
-- Pre-flight audit confirmed no duplicate emails in the table before
-- this migration landed (2026-04-23). If you re-run against a tree
-- that has drifted and holds duplicates, this will fail fast with a
-- "could not create unique index" error — resolve the dups before
-- retrying rather than force-pushing a NOT-VALID constraint.
CREATE UNIQUE INDEX IF NOT EXISTS brands_contact_email_unique
    ON brands (contact_email);
