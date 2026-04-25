import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Coffee,
  Gift,
  LayoutDashboard,
  Loader2,
  Stamp,
  Users,
  type LucideIcon,
} from "lucide-react";

import { fetchOverview, type AdminOverview } from "@/lib/api";

type Tint = "sky" | "amber" | "emerald" | "rose";

// Tailwind needs to see the full class names as string literals to include
// them in the JIT output — keeping this lookup inline (vs. string
// concatenation) guarantees each combo lands in the generated CSS.
const TINT_CLASSES: Record<Tint, string> = {
  sky: "bg-sky-500/15 ring-sky-500/30 text-sky-400",
  amber: "bg-amber-500/15 ring-amber-500/30 text-amber-400",
  emerald: "bg-emerald-500/15 ring-emerald-500/30 text-emerald-400",
  rose: "bg-rose-500/15 ring-rose-500/30 text-rose-400",
};

export function OverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    fetchOverview()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load metrics.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Platform Overview
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        Cross-tenant health at a glance
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        Platform-wide KPIs aggregated across every brand, cafe, and consumer on
        the platform.
      </p>

      {error ? (
        <div className="mt-8 flex items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/40 p-5">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
            strokeWidth={2}
          />
          <div>
            <div className="text-sm font-semibold text-red-200">
              Couldn&apos;t load platform metrics
            </div>
            <div className="mt-1 text-xs text-red-300/80">{error}</div>
          </div>
        </div>
      ) : data === null ? (
        <LoadingCard />
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
          <KpiCard
            Icon={Users}
            tint="sky"
            label="Total Customers"
            value={data.total_customers}
            onClick={() => navigate("/customers")}
            hint="Open customers tab"
          />
          <KpiCard
            Icon={Coffee}
            tint="amber"
            label="Total Cafes"
            value={data.total_cafes}
            onClick={() => navigate("/cafes")}
            hint="Open cafes tab"
          />
          <KpiCard
            Icon={Stamp}
            tint="emerald"
            label="Stamps Issued"
            value={data.total_stamps_issued}
            onClick={() => navigate("/transactions?event=EARN")}
            hint="Filter ledger to EARN"
          />
          <KpiCard
            Icon={Gift}
            tint="rose"
            label="Rewards Redeemed"
            value={data.total_rewards_redeemed}
            onClick={() => navigate("/transactions?event=REDEEM")}
            hint="Filter ledger to REDEEM"
          />
        </div>
      )}
    </div>
  );
}

function LoadingCard() {
  return (
    <div
      className="mt-8 flex items-center gap-3 rounded-xl border border-neutral-800 p-6"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <Loader2
        className="h-5 w-5 animate-spin text-amber-400"
        strokeWidth={2.2}
      />
      <span className="text-sm text-neutral-400">
        Loading platform metrics…
      </span>
    </div>
  );
}

function KpiCard({
  Icon,
  tint,
  label,
  value,
  onClick,
  hint,
}: {
  Icon: LucideIcon;
  tint: Tint;
  label: string;
  value: number;
  onClick: () => void;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: ${hint}`}
      className="group relative rounded-xl border border-neutral-800 p-5 text-left transition-colors hover:border-amber-500/40 focus:outline-none focus-visible:border-amber-500/60 focus-visible:ring-2 focus-visible:ring-amber-500/30"
      style={{ backgroundColor: "#1A1A1A", borderRadius: 12 }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${TINT_CLASSES[tint]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <div className="mt-5 text-4xl font-semibold tracking-tight tabular-nums text-neutral-50">
        {value.toLocaleString()}
      </div>
      <div className="mt-2 text-[11px] font-medium text-neutral-500 transition-colors group-hover:text-amber-300">
        {hint} →
      </div>
    </button>
  );
}
