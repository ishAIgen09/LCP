-- 0019 — cancellation_feedback for the B2B cancel-intercept flow
-- (PRD §4.2 — B2B Cancellation Feedback Flow).
--
-- Captures the survey response a brand owner is required to submit
-- before the b2b dashboard hands off to the Stripe Customer Portal.
-- Append-only by convention (no UPDATE/DELETE expected from the
-- application; corrections happen via a fresh row).

CREATE TABLE IF NOT EXISTS cancellation_feedback (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        UUID         NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
    -- 7 allowed values — kept in sync with
    -- app/models.py::CANCELLATION_REASONS and the dropdown in
    -- b2b-dashboard/src/components/CancellationFeedbackModal.tsx.
    reason          TEXT         NOT NULL CHECK (reason IN (
                        'free_drink_cost',
                        'barista_friction',
                        'price_too_high',
                        'low_volume',
                        'feature_gap',
                        'closing_business',
                        'other'
                    )),
    -- Required (non-empty) when reason='other', optional otherwise.
    -- The non-empty rule is enforced at the API boundary, not in SQL,
    -- so a future change to that rule doesn't require a migration.
    details         TEXT,
    -- Required checkbox confirming the user understands the
    -- "cancel-at-period-end" grace-window policy. Stored so we can
    -- prove the disclosure landed if anyone disputes a charge.
    acknowledged    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_feedback_brand_created
    ON cancellation_feedback (brand_id, created_at DESC);
