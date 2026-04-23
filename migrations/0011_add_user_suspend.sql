-- 0011: give users a suspend flag so the admin dashboard can block
-- misbehaving accounts without deleting their ledger history.
-- NOT NULL with a FALSE default — no existing row needs backfill.
-- No index yet; current query pattern lists every user, filtering is
-- client-side. Add `idx_users_is_suspended` if we ever paginate.
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
