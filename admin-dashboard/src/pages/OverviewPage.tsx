import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Coffee,
  Gift,
  LayoutDashboard,
  Loader2,
  ShieldAlert,
  Stamp,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";

import {
  fetchFlaggedActivities,
  fetchOverview,
  type AdminFlaggedActivity,
  type AdminOverview,
} from "@/lib/api";

// Brand palette pivoted to Espresso + Mint, so the previous "amber" tint
// (Tailwind yellow-orange) was retired. "stone" replaces it as a neutral,
// off-white-on-dark KPI accent that doesn't compete with the mint
// emerald used by the headline action signals.
type Tint = "sky" | "stone" | "emerald" | "rose" | "violet";

// Tailwind needs to see the full class names as string literals to include
// them in the JIT output — keeping this lookup inline (vs. string
// concatenation) guarantees each combo lands in the generated CSS.
const TINT_CLASSES: Record<Tint, string> = {
  sky: "bg-sky-500/15 ring-sky-500/30 text-sky-400",
  stone: "bg-stone-500/15 ring-stone-500/30 text-stone-300",
  emerald: "bg-emerald-500/15 ring-emerald-500/30 text-emerald-400",
  rose: "bg-rose-500/15 ring-rose-500/30 text-rose-400",
  violet: "bg-violet-500/15 ring-violet-500/30 text-violet-400",
};

export function OverviewPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<AdminFlaggedActivity[] | null>(null);
  const [flaggedError, setFlaggedError] = useState<string | null>(null);

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

  // Flagged activities is best-effort — if the endpoint isn't deployed yet
  // (older droplet, fresh local backend without the migration), the widget
  // shows an empty state instead of breaking the page.
  useEffect(() => {
    let cancelled = false;
    setFlaggedError(null);
    setFlagged(null);
    fetchFlaggedActivities()
      .then((rows) => {
        if (!cancelled) setFlagged(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setFlaggedError(
          e instanceof Error ? e.message : "Couldn't load flagged activity.",
        );
        setFlagged([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2">
        <LayoutDashboard className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
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
        <>
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
              tint="stone"
              label="Total Cafes"
              value={data.total_cafes}
              onClick={() => navigate("/cafes")}
              hint="Open cafes tab"
            />
          </div>

          <EarnedRedeemedNetGrowth
            issued={data.total_stamps_issued}
            redeemed={data.total_rewards_redeemed}
            onOpenEarn={() => navigate("/transactions?event=EARN")}
            onOpenRedeem={() => navigate("/transactions?event=REDEEM")}
          />
        </>
      )}

      <FlaggedActivitiesWidget
        rows={flagged}
        error={flaggedError}
        onOpenCafe={(cafeId) => navigate(`/cafes?focus=${cafeId}`)}
      />
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
        className="h-5 w-5 animate-spin text-emerald-400"
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
      className="group relative rounded-xl border border-neutral-800 p-5 text-left transition-colors hover:border-emerald-500/40 focus:outline-none focus-visible:border-emerald-500/60 focus-visible:ring-2 focus-visible:ring-emerald-500/30"
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
      <div className="mt-2 text-[11px] font-medium text-neutral-500 transition-colors group-hover:text-emerald-300">
        {hint} →
      </div>
    </button>
  );
}

function EarnedRedeemedNetGrowth({
  issued,
  redeemed,
  onOpenEarn,
  onOpenRedeem,
}: {
  issued: number;
  redeemed: number;
  onOpenEarn: () => void;
  onOpenRedeem: () => void;
}) {
  // Net Growth = stamps issued minus rewards redeemed. It's the "did the
  // network grow this period?" north-star — positive means more loyalty
  // earned than spent. Highlighted card with a colour-coded badge.
  const netGrowth = issued - redeemed;
  const isPositive = netGrowth >= 0;
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
        <TrendingUp className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.2} />
        Loyalty engine — earn vs redeem
      </div>
      <div className="mt-2 grid grid-cols-1 gap-4 md:grid-cols-3">
        <KpiCard
          Icon={Stamp}
          tint="emerald"
          label="Total Earned"
          value={issued}
          onClick={onOpenEarn}
          hint="Filter ledger to EARN"
        />
        <KpiCard
          Icon={Gift}
          tint="rose"
          label="Total Redeemed"
          value={redeemed}
          onClick={onOpenRedeem}
          hint="Filter ledger to REDEEM"
        />
        <NetGrowthCard value={netGrowth} positive={isPositive} />
      </div>
    </div>
  );
}

function NetGrowthCard({
  value,
  positive,
}: {
  value: number;
  positive: boolean;
}) {
  const valueClass = positive ? "text-emerald-300" : "text-rose-300";
  const ringClass = positive
    ? "border-emerald-500/40 ring-1 ring-emerald-500/20"
    : "border-rose-500/40 ring-1 ring-rose-500/20";
  const ArrowIcon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div
      className={`relative rounded-xl border p-5 ${ringClass}`}
      style={{ backgroundColor: "#1A1A1A", borderRadius: 12 }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${TINT_CLASSES.violet}`}
        >
          <TrendingUp className="h-5 w-5" strokeWidth={2} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          Net Growth
        </span>
        <span
          className={
            "ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
            (positive
              ? "bg-emerald-500/15 text-emerald-300"
              : "bg-rose-500/15 text-rose-300")
          }
        >
          <ArrowIcon className="h-3 w-3" strokeWidth={2.4} />
          ROI
        </span>
      </div>
      <div
        className={`mt-5 text-4xl font-semibold tracking-tight tabular-nums ${valueClass}`}
      >
        {value > 0 ? "+" : ""}
        {value.toLocaleString()}
      </div>
      <div className="mt-2 text-[11px] font-medium text-neutral-500">
        Stamps earned − rewards redeemed (network growth)
      </div>
    </div>
  );
}

function FlaggedActivitiesWidget({
  rows,
  error,
  onOpenCafe,
}: {
  rows: AdminFlaggedActivity[] | null;
  error: string | null;
  onOpenCafe: (cafeId: string) => void;
}) {
  return (
    <div className="mt-10">
      <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
        <ShieldAlert className="h-3.5 w-3.5 text-rose-400" strokeWidth={2.2} />
        Flagged Activities
      </div>
      <div
        className="mt-2 overflow-hidden rounded-xl border border-neutral-800"
        style={{ backgroundColor: "#1A1A1A" }}
      >
        {rows === null && !error ? (
          <div className="flex items-center gap-3 px-5 py-4">
            <Loader2
              className="h-4 w-4 animate-spin text-rose-400"
              strokeWidth={2.2}
            />
            <span className="text-xs text-neutral-500">
              Scanning the network for anomalies…
            </span>
          </div>
        ) : error ? (
          <div className="px-5 py-4 text-xs text-neutral-500">
            Flagging service is unavailable: {error}
          </div>
        ) : rows && rows.length === 0 ? (
          <div className="px-5 py-5 text-xs text-neutral-500">
            All clear — no mismatched-IP attempts in the last 7 days.
          </div>
        ) : (
          <ul>
            {(rows ?? []).map((row, i) => (
              <li
                key={row.id}
                className={
                  (i === 0 ? "" : "border-t border-neutral-800/60 ") +
                  "flex items-start gap-3 px-5 py-3 transition-colors hover:bg-neutral-900/40"
                }
              >
                <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-md bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30">
                  <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.2} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-neutral-100">
                    <span className="font-semibold">{row.cafe_name}</span>
                    <span className="text-neutral-500"> · {row.brand_name}</span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-neutral-500">
                    Login attempt from{" "}
                    <span className="font-mono text-rose-300">
                      {row.attempted_ip}
                    </span>{" "}
                    · expected{" "}
                    <span className="font-mono text-neutral-400">
                      {row.expected_ip ?? "—"}
                    </span>{" "}
                    ·{" "}
                    {new Date(row.attempted_at).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCafe(row.cafe_id)}
                  className="shrink-0 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 transition-colors hover:bg-neutral-800"
                >
                  Review →
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
