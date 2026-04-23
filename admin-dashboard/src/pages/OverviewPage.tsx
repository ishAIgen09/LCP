import { LayoutDashboard } from "lucide-react";

import { PlaceholderPage } from "./_placeholder";

export function OverviewPage() {
  return (
    <PlaceholderPage
      Icon={LayoutDashboard}
      kicker="Platform Overview"
      title="Cross-tenant health at a glance"
      blurb="Aggregate stamps/day, MRR, active brands, and anomaly flags across every tenant on the platform."
    />
  );
}
