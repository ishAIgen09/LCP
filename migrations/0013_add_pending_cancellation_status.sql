-- 0013: add 'pending_cancellation' to the subscription_status pgenum.
-- The super-admin Cafes tab surfaces this as a warning-orange pill when a
-- brand has cancelled but is still inside the grace window (cancel-at-
-- period-end policy). Only `canceled` drops MRR; `pending_cancellation`
-- cafes are still being billed + still fully live on the consumer app.
-- IF NOT EXISTS makes this safe to re-run.
ALTER TYPE subscription_status ADD VALUE IF NOT EXISTS 'pending_cancellation';
