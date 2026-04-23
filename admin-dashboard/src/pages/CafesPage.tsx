import { Coffee } from "lucide-react";

import { PlaceholderPage } from "./_placeholder";

export function CafesPage() {
  return (
    <PlaceholderPage
      Icon={Coffee}
      kicker="Cafes"
      title="Every branch on the network"
      blurb="Search, filter, suspend, or promote any cafe across every brand. The grid will key off /api/admin/cafes once the super-admin scope lands."
    />
  );
}
