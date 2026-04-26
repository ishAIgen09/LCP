-- 0015 — IP / network lock for cafe POS logins.
--
-- Pin each cafe's till to the IP it first successfully logged in from.
-- A subsequent login from a *different* IP within the cooldown window
-- (30 days from the lock timestamp) is rejected with 403, and the
-- attempt is recorded in network_lock_events for the Super Admin's
-- Flagged Activities widget. Admin can reset via
-- POST /api/admin/platform/cafes/{id}/reset-network-lock which clears
-- both columns; the next successful login becomes the new pinned IP.

ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS last_known_ip TEXT,
    ADD COLUMN IF NOT EXISTS network_locked_at TIMESTAMPTZ;

-- Append-only audit trail of every mismatched-IP attempt + every admin
-- reset. Kind = 'mismatch' for blocked logins, 'reset' for admin clears.
CREATE TABLE IF NOT EXISTS network_lock_events (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    cafe_id      UUID         NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
    kind         TEXT         NOT NULL CHECK (kind IN ('mismatch', 'reset')),
    attempted_ip TEXT         NOT NULL,
    expected_ip  TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_network_lock_events_cafe_id_created_at
    ON network_lock_events(cafe_id, created_at DESC);
