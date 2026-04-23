import { CreditCard } from "lucide-react";

import { PlaceholderPage } from "./_placeholder";

export function BillingPage() {
  return (
    <PlaceholderPage
      Icon={CreditCard}
      kicker="Billing"
      title="Subscriptions + invoices"
      blurb="Platform-level view of every brand's Stripe subscription — MRR, past_due alerts, failed renewals, and one-click links into Stripe customer portals."
    />
  );
}
