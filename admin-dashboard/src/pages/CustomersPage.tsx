import { Users } from "lucide-react";

import { PlaceholderPage } from "./_placeholder";

export function CustomersPage() {
  return (
    <PlaceholderPage
      Icon={Users}
      kicker="Customers"
      title="End users of the consumer app"
      blurb="Look up a consumer by till_code or email, audit their ledger, or issue a manual correction when a scan goes wrong."
    />
  );
}
