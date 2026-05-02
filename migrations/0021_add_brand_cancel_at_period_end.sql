-- 0021 — track Stripe's `cancel_at_period_end` flag on the brand row
--
-- Powers the "Lame Duck" UI state: when a brand owner clicks Cancel
-- Subscription in the b2b dashboard's Settings → Account Management,
-- we call stripe.Subscription.modify(cancel_at_period_end=True) AND
-- flip this column to true. The brand stays fully operational until
-- their current_period_end naturally arrives — the existing webhook
-- on customer.subscription.deleted will then transition them to
-- CANCELED. This boolean is what BillingView reads to render the
-- "Your subscription is scheduled to cancel on …" warning banner.
--
-- The column is also used by the customer.subscription.updated
-- webhook handler so a Stripe-portal-driven cancel/uncancel stays
-- in sync with our DB without requiring an out-of-band reconciliation.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS so re-applying is a no-op.

ALTER TABLE brands
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE;
