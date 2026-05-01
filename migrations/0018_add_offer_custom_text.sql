-- 0018 — offers.custom_text for the bespoke promo-copy upgrade
-- (PRD §4.3 — Custom Offers Engine).
--
-- A new offer_type value `custom` is being added at the application
-- layer (see app/models.py::OFFER_TYPES + app/schemas.py + the b2b
-- offers.ts mirror). For custom offers, target/amount are ignored and
-- this column carries the free-text copy the cafe owner wrote
-- (max 280 chars, enforced at the API boundary in schemas.py).
-- For non-custom offers this column is left NULL.
--
-- We deliberately do NOT add a CHECK constraint coupling
-- (offer_type='custom') ↔ (custom_text IS NOT NULL) at the DB level,
-- because the OFFER_TYPES allow-list is enforced in Python (matches
-- the existing 0005 convention). Adding it in SQL would create a
-- coupling that's harder to evolve when new offer types land.

ALTER TABLE offers
    ADD COLUMN IF NOT EXISTS custom_text TEXT;
