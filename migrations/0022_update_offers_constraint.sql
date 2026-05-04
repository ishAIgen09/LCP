-- 0022 — extend offers CHECK constraints to allow offer_type='custom'
--
-- Migration 0018 added offers.custom_text and updated app/models.py +
-- app/schemas.py to recognise 'custom' as a valid OFFER_TYPES value
-- (PRD §4.3 — Custom Offers Engine), but it deliberately did NOT touch
-- the two CHECK constraints established in 0005:
--
--   offers_type_allowed         — whitelist of offer_type values
--   offers_amount_matches_type  — couples (offer_type) ↔ (amount NULL/NOT NULL)
--
-- As a result every INSERT with offer_type='custom' currently aborts at
-- the DB layer with CheckViolationError. This migration drops both
-- constraints and re-adds them with 'custom' included.
--
-- Custom offers carry their content in `custom_text` (validated at the
-- API boundary in app/schemas.py::_validate_offer_payload) and have a
-- NULL `amount` — same NULL-amount rule already used by 'bogo' /
-- 'double_stamps'. We extend offers_amount_matches_type's NULL branch
-- to include 'custom' rather than introducing a third arm.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS so re-applying is a no-op.

ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_type_allowed;
ALTER TABLE offers DROP CONSTRAINT IF EXISTS offers_amount_matches_type;

ALTER TABLE offers ADD CONSTRAINT offers_type_allowed CHECK (
    offer_type IN ('percent', 'fixed', 'bogo', 'double_stamps', 'custom')
);

ALTER TABLE offers ADD CONSTRAINT offers_amount_matches_type CHECK (
    (offer_type IN ('percent', 'fixed') AND amount IS NOT NULL AND amount > 0)
    OR (offer_type IN ('bogo', 'double_stamps', 'custom') AND amount IS NULL)
);
