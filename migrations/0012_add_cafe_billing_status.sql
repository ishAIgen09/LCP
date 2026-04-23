-- 0012: per-cafe billing status for the super-admin Billing tab.
-- Reuses the existing `subscription_status` pgenum (trialing | active |
-- past_due | canceled | incomplete). This is deliberately separate from
-- `brands.subscription_status` — that one drives the real per-brand
-- Stripe subscription; this one is a cafe-level override the platform
-- admin can flip for the MVP billing table (cancel a single cafe without
-- touching Stripe). When we reconcile with the real billing flow later,
-- either column becomes the source of truth or we collapse them.
ALTER TABLE cafes
    ADD COLUMN IF NOT EXISTS billing_status subscription_status NOT NULL DEFAULT 'active';
