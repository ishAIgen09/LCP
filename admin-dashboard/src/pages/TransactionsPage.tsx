import { Receipt } from "lucide-react";

import { PlaceholderPage } from "./_placeholder";

export function TransactionsPage() {
  return (
    <PlaceholderPage
      Icon={Receipt}
      kicker="Transactions"
      title="Live stamp + redeem feed"
      blurb="Tail the global_ledger across every brand, filter by event type, and flag suspicious scan patterns (e.g. 10 stamps in 30 seconds from one cafe)."
    />
  );
}
