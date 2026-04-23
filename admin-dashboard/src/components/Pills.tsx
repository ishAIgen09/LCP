import { Sparkles } from "lucide-react";

import type { SchemeType, SubscriptionStatus } from "@/lib/api";

// Shared pills for every admin table. Extracted so the Cafes, Transactions,
// Customers, and Billing pages all show the same gold-for-LCP+, same
// emerald-for-active, etc. A single source of truth also means Tailwind's
// JIT sees every class-name string literal here and bakes them into the
// build — which wouldn't happen if each page rebuilt its own variants.

export function PlanTypePill({ scheme }: { scheme: SchemeType }) {
  if (scheme === "global") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-amber-300 ring-1 ring-amber-500/30">
        <Sparkles className="h-3 w-3" strokeWidth={2.4} />
        LCP+
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-800 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide text-neutral-300 ring-1 ring-neutral-700">
      Private
    </span>
  );
}

// User-account-level status. "active" collides with SubscriptionStatus's
// "active" on purpose — both read as green and both mean "fine, no action
// needed", so one label keeps the visual vocabulary tight.
export type UserStatus = "active" | "suspended";

type PillStatus = SubscriptionStatus | UserStatus;

const STATUS_STYLES: Record<
  PillStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Active",
    className: "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30",
  },
  trialing: {
    label: "Trialing",
    className: "bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30",
  },
  past_due: {
    label: "Past due",
    className: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  },
  canceled: {
    label: "Canceled",
    className:
      "bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700 line-through",
  },
  incomplete: {
    label: "Incomplete",
    className: "bg-neutral-800 text-neutral-400 ring-1 ring-neutral-700",
  },
  // Cancel-at-period-end grace window. Warning orange — brighter than the
  // billing-finished gray "Canceled" because admins still need to act on
  // these (reach out, retention offer) before they actually go dark.
  pending_cancellation: {
    label: "Pending Cancellation",
    className: "bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30",
  },
  suspended: {
    label: "Suspended",
    className: "bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30",
  },
};

export function StatusPill({ status }: { status: PillStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${className}`}
    >
      {label}
    </span>
  );
}

// Event-type pill. EARN reads as a subtle positive signal (emerald — the
// same family as subscription Active); REDEEM is a warning orange so the
// admin can spot free drinks being given out at a glance. Deliberately
// LOUDER than EARN because redeems are the thing an auditor cares about.
export function EventTypePill({ event }: { event: "EARN" | "REDEEM" }) {
  if (event === "EARN") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-500/25">
        Earn
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-orange-300 ring-1 ring-orange-500/35">
      Redeem
    </span>
  );
}
