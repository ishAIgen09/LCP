import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronDown,
  Coffee,
  Download,
  Filter,
  Gift,
  Loader2,
  Pencil,
  Plus,
  Power,
  Scale,
  Stamp,
  Store,
  X,
} from "lucide-react";

import { PlanTypePill, StatusPill } from "@/components/Pills";
import {
  createBrand,
  createPlatformCafe,
  exportCafesCsv,
  fetchCafeStats,
  fetchCafes,
  type AdminCafe,
  type CafeJoinedWindow,
  type CafeListFilter,
  type CafeStats,
  type CafeStatsRange,
  type SchemeType,
  type SubscriptionStatus,
} from "@/lib/api";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 2,
});

type RangeOption = { id: CafeStatsRange; label: string };
const RANGE_OPTIONS: RangeOption[] = [
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "ytd", label: "YTD" },
  { id: "all", label: "All time" },
];

export function CafesPage() {
  const [cafes, setCafes] = useState<AdminCafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [filter, setFilter] = useState<CafeListFilter>({
    status: "all",
    joined: "all",
  });
  const [addOpen, setAddOpen] = useState<null | "brand" | "cafe">(null);
  // Bumps on every successful create → forces the fetch effect to re-run.
  const [refreshKey, setRefreshKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportCafesCsv(filter);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCafes(null);
    fetchCafes(filter)
      .then((rows) => {
        if (!cancelled) setCafes(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load cafes.");
      });
    return () => {
      cancelled = true;
    };
  }, [filter, refreshKey]);

  const selectedCafe = useMemo(
    () => cafes?.find((c) => c.id === selectedCafeId) ?? null,
    [cafes, selectedCafeId],
  );

  // Brand roll-up for the Add-Cafe modal's brand picker. Derived from
  // the current cafes feed so we don't need a separate /brands list
  // endpoint. Filter-aware: if you've narrowed to status=canceled you'll
  // see fewer brands here, which is fine — a brand with only canceled
  // cafes is legitimately what you want to add a new cafe under.
  const brandOptions = useMemo(() => {
    if (!cafes) return [];
    const seen = new Map<string, { id: string; name: string }>();
    for (const c of cafes) {
      if (!seen.has(c.brand_id)) {
        seen.set(c.brand_id, { id: c.brand_id, name: c.brand_name });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [cafes]);

  if (selectedCafe) {
    return (
      <CafeDetailPanel
        cafe={selectedCafe}
        onBack={() => setSelectedCafeId(null)}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Coffee className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Cafes
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        Every branch on the network
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        Platform-wide cafe roster. Click any cafe to open its ROI dossier —
        ledger totals, redemptions, and net revenue within a date window.
      </p>

      <CafesFilterBar
        filter={filter}
        onFilterChange={setFilter}
        onAddBrand={() => setAddOpen("brand")}
        onAddCafe={() => setAddOpen("cafe")}
        onExport={handleExport}
        exporting={exporting}
      />
      {exportError ? (
        <div className="mt-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          Export failed: {exportError}
        </div>
      ) : null}

      {error ? (
        <ErrorCard message={error} />
      ) : cafes === null ? (
        <LoadingCard />
      ) : cafes.length === 0 ? (
        <EmptyCard
          isFiltered={filter.status !== "all" || filter.joined !== "all"}
          onResetFilters={() => setFilter({ status: "all", joined: "all" })}
        />
      ) : (
        <CafesTable cafes={cafes} onSelect={setSelectedCafeId} />
      )}

      {addOpen === "brand" ? (
        <AddBrandModal
          onDismiss={() => setAddOpen(null)}
          onCreated={() => {
            setAddOpen(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
      {addOpen === "cafe" ? (
        <AddCafeModal
          brands={brandOptions}
          onDismiss={() => setAddOpen(null)}
          onCreated={() => {
            setAddOpen(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
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
      <span className="text-sm text-neutral-400">Loading cafe roster…</span>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mt-8 flex items-start gap-3 rounded-xl border border-red-900/60 bg-red-950/40 p-5">
      <AlertTriangle
        className="mt-0.5 h-5 w-5 shrink-0 text-red-400"
        strokeWidth={2}
      />
      <div>
        <div className="text-sm font-semibold text-red-200">
          Couldn&apos;t load cafes
        </div>
        <div className="mt-1 text-xs text-red-300/80">{message}</div>
      </div>
    </div>
  );
}

function EmptyCard({
  isFiltered,
  onResetFilters,
}: {
  isFiltered: boolean;
  onResetFilters: () => void;
}) {
  return (
    <div
      className="mt-8 rounded-xl border border-dashed border-neutral-800 p-8 text-center"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <Coffee className="mx-auto h-6 w-6 text-neutral-600" strokeWidth={1.8} />
      <div className="mt-3 text-sm font-semibold text-neutral-200">
        {isFiltered ? "No cafes match the filter" : "No cafes on the platform yet"}
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        {isFiltered
          ? "Loosen the status or date-joined dropdown to see more rows."
          : "Cafes added via the B2B dashboard or Add New → Cafe will appear here."}
      </div>
      {isFiltered ? (
        <button
          type="button"
          onClick={onResetFilters}
          className="mt-4 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800"
        >
          Reset filters
        </button>
      ) : null}
    </div>
  );
}

function CafesTable({
  cafes,
  onSelect,
}: {
  cafes: AdminCafe[];
  onSelect: (cafeId: string) => void;
}) {
  return (
    <div
      className="mt-8 overflow-hidden rounded-xl border border-neutral-800"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-5 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {cafes.length} {cafes.length === 1 ? "cafe" : "cafes"}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
              <th className="px-5 py-3 font-semibold">Cafe Name</th>
              <th className="px-5 py-3 font-semibold">Brand</th>
              <th className="px-5 py-3 font-semibold">Plan Type</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {cafes.map((cafe, i) => (
              <CafeRow
                key={cafe.id}
                cafe={cafe}
                isLast={i === cafes.length - 1}
                onSelect={() => onSelect(cafe.id)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CafeRow({
  cafe,
  isLast,
  onSelect,
}: {
  cafe: AdminCafe;
  isLast: boolean;
  onSelect: () => void;
}) {
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // eslint-disable-next-line no-console
    console.info("[admin] edit cafe:", cafe.id, cafe.name);
    alert(`Edit "${cafe.name}" — endpoint not wired yet.`);
  };
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // eslint-disable-next-line no-console
    console.info("[admin] suspend/toggle cafe:", cafe.id, cafe.name);
    alert(`Suspend "${cafe.name}" — endpoint not wired yet.`);
  };

  return (
    <tr
      className={
        (isLast ? "" : "border-b border-neutral-800/60 ") +
        "transition-colors hover:bg-neutral-900/40"
      }
    >
      <td className="px-5 py-3.5">
        <button
          type="button"
          onClick={onSelect}
          className="group block text-left"
          aria-label={`Open ${cafe.name} dossier`}
        >
          <div className="font-medium text-neutral-100 transition-colors group-hover:text-amber-300">
            {cafe.name}
          </div>
          <div
            className="mt-0.5 truncate text-[11px] text-neutral-500"
            title={cafe.address}
          >
            {cafe.address}
          </div>
        </button>
      </td>
      <td className="px-5 py-3.5 text-neutral-300">{cafe.brand_name}</td>
      <td className="px-5 py-3.5">
        <PlanTypePill scheme={cafe.scheme_type} />
      </td>
      <td className="px-5 py-3.5">
        {/* Cafe-level billing_status — set from the Billing tab's Cancel
            flow. Brand-level subscription_status is a different concept
            (real Stripe subscription) and isn't what an admin cares
            about when drilling into a single branch. */}
        <StatusPill status={cafe.billing_status} />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleEdit}
            aria-label={`Edit ${cafe.name}`}
            title="Edit"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleToggle}
            aria-label={`Suspend ${cafe.name}`}
            title="Suspend / toggle active"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-rose-400"
          >
            <Power className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CafeDetailPanel({
  cafe,
  onBack,
}: {
  cafe: AdminCafe;
  onBack: () => void;
}) {
  const [range, setRange] = useState<CafeStatsRange>("30d");
  const [stats, setStats] = useState<CafeStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setError(null);
    fetchCafeStats(cafe.id, range)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load stats.");
      });
    return () => {
      cancelled = true;
    };
  }, [cafe.id, range]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400 transition-colors hover:border-neutral-700 hover:bg-neutral-800 hover:text-neutral-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.4} />
        Back to cafes
      </button>

      <div className="mt-5 flex items-center gap-2">
        <Coffee className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Cafe dossier
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        {cafe.name}
      </h1>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
        <span>{cafe.address}</span>
        <span className="text-neutral-700">·</span>
        <span>{cafe.brand_name}</span>
        <span className="text-neutral-700">·</span>
        <PlanTypePill scheme={cafe.scheme_type} />
        <StatusPill status={cafe.billing_status} />
      </div>

      <div className="mt-8">
        <RangePicker value={range} onChange={setRange} />
      </div>

      {error ? (
        <ErrorCard message={error} />
      ) : stats === null ? (
        <StatsLoadingCard />
      ) : (
        <StatsCards stats={stats} />
      )}
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: CafeStatsRange;
  onChange: (r: CafeStatsRange) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-neutral-800 bg-neutral-950 p-0.5">
      {RANGE_OPTIONS.map((opt) => {
        const selected = opt.id === value;
        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChange(opt.id)}
            aria-pressed={selected}
            className={
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors " +
              (selected
                ? "bg-amber-500/15 text-amber-300"
                : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function StatsLoadingCard() {
  return (
    <div
      className="mt-6 flex items-center gap-3 rounded-xl border border-neutral-800 p-6"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <Loader2
        className="h-5 w-5 animate-spin text-amber-400"
        strokeWidth={2.2}
      />
      <span className="text-sm text-neutral-400">Crunching ledger…</span>
    </div>
  );
}

function StatsCards({ stats }: { stats: CafeStats }) {
  const netSign = stats.net_roi_pence >= 0 ? "positive" : "negative";
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
      <StatCard
        Icon={Stamp}
        label="Total stamps issued"
        value={stats.stamps_issued.toString()}
        hint="EARN rows in the window"
      />
      <StatCard
        Icon={Gift}
        label="Free coffees redeemed"
        value={stats.rewards_redeemed.toString()}
        hint="REDEEM rows in the window"
      />
      <StatCard
        Icon={Scale}
        label="Net ROI"
        value={GBP.format(stats.net_roi_pence / 100)}
        hint={
          stats.rewards_redeemed === 0 && stats.stamps_issued === 0
            ? "no ledger activity yet"
            : "(stamps − redemptions) × £3.50 assumed drink value"
        }
        tone={netSign}
      />
    </div>
  );
}

function StatCard({
  Icon,
  label,
  value,
  hint,
  tone,
}: {
  Icon: typeof Stamp;
  label: string;
  value: string;
  hint: string;
  tone?: "positive" | "negative";
}) {
  const valueClass =
    tone === "negative"
      ? "text-rose-300"
      : tone === "positive"
        ? "text-emerald-300"
        : "text-neutral-50";
  return (
    <div
      className="rounded-xl border border-neutral-800 p-5"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-amber-400" strokeWidth={2.4} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <div
        className={`mt-3 text-3xl font-semibold tracking-tight tabular-nums ${valueClass}`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Filter bar + Add New flow
// ─────────────────────────────────────────────────────────────────

type StatusFilterOption = {
  value: SubscriptionStatus | "all";
  label: string;
};

const STATUS_OPTIONS: StatusFilterOption[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "pending_cancellation", label: "Pending Cancellation" },
  { value: "canceled", label: "Cancelled" },
  { value: "past_due", label: "Past due" },
  { value: "trialing", label: "Trialing" },
  { value: "incomplete", label: "Incomplete" },
];

const JOINED_OPTIONS: { value: CafeJoinedWindow; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "last_7_days", label: "Last 7 days" },
  { value: "last_30_days", label: "Last 30 days" },
];

function CafesFilterBar({
  filter,
  onFilterChange,
  onAddBrand,
  onAddCafe,
  onExport,
  exporting,
}: {
  filter: CafeListFilter;
  onFilterChange: (next: CafeListFilter) => void;
  onAddBrand: () => void;
  onAddCafe: () => void;
  onExport: () => void;
  exporting: boolean;
}) {
  const status = filter.status ?? "all";
  const joined = filter.joined ?? "all";
  return (
    // Sticky sits inside the DashboardLayout's scrollable <main>. The
    // negative x/t offsets break out of the max-w-6xl + py-8 padding so
    // the bar covers the full width and tucks under the page header.
    <div className="sticky -top-8 z-20 -mx-8 mt-8 border-b border-neutral-800 bg-neutral-950/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-neutral-950/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
            <Filter className="h-3.5 w-3.5" strokeWidth={2.2} />
            <span>Filter</span>
          </div>
          <FilterDropdown
            Icon={Store}
            value={status}
            onChange={(v) =>
              onFilterChange({
                ...filter,
                status: v as SubscriptionStatus | "all",
              })
            }
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            ariaLabel="Filter by status"
          />
          <FilterDropdown
            Icon={CalendarClock}
            value={joined}
            onChange={(v) =>
              onFilterChange({ ...filter, joined: v as CafeJoinedWindow })
            }
            options={JOINED_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            ariaLabel="Filter by date joined"
          />
          {status !== "all" || joined !== "all" ? (
            <button
              type="button"
              onClick={() => onFilterChange({ status: "all", joined: "all" })}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-neutral-500 transition-colors hover:text-neutral-200"
            >
              Reset
            </button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
            title="Download the filtered cafe roster as a CSV"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <Download className="h-3.5 w-3.5" strokeWidth={2.4} />
            )}
            Export Report (CSV)
          </button>
          <AddNewButton onAddBrand={onAddBrand} onAddCafe={onAddCafe} />
        </div>
      </div>
    </div>
  );
}

function FilterDropdown({
  Icon,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  Icon: typeof Store;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <label className="group inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-700">
      <Icon className="h-3.5 w-3.5 text-neutral-500" strokeWidth={2.2} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="cursor-pointer bg-transparent pr-1 text-xs text-neutral-100 outline-none [&>option]:bg-neutral-900"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function AddNewButton({
  onAddBrand,
  onAddCafe,
}: {
  onAddBrand: () => void;
  onAddCafe: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Click-outside to dismiss. One listener, cleaned up on unmount — no
  // dependency on a portal library for such a small menu.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-400"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.6} />
        Add New
        <ChevronDown
          className={
            "h-3 w-3 transition-transform " + (open ? "rotate-180" : "")
          }
          strokeWidth={2.6}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-md border border-neutral-800 bg-neutral-900 shadow-lg"
        >
          <MenuItem
            Icon={Store}
            label="Add New Brand"
            onClick={() => {
              setOpen(false);
              onAddBrand();
            }}
          />
          <MenuItem
            Icon={Coffee}
            label="Add New Cafe"
            onClick={() => {
              setOpen(false);
              onAddCafe();
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  Icon,
  label,
  onClick,
}: {
  Icon: typeof Store;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 border-b border-neutral-800 px-3 py-2 text-left text-xs font-semibold text-neutral-200 transition-colors last:border-b-0 hover:bg-neutral-800"
    >
      <Icon className="h-3.5 w-3.5 text-amber-400" strokeWidth={2.4} />
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────
// Create-Brand + Create-Cafe modals
// ─────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onDismiss,
  children,
}: {
  title: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="lcp-cafes-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-md rounded-xl border border-neutral-800 shadow-2xl"
        style={{ backgroundColor: "#1A1A1A" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 py-3">
          <h2
            id="lcp-cafes-modal-title"
            className="text-sm font-semibold text-neutral-100"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
    />
  );
}

function AddBrandModal({
  onDismiss,
  onCreated,
}: {
  onDismiss: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scheme, setScheme] = useState<SchemeType>("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    name.trim().length > 0 && email.trim().length > 0 && email.includes("@");

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createBrand({
        name: name.trim(),
        scheme_type: scheme,
        contact_email: email.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create brand.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Add new brand"
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <FieldLabel>Brand name</FieldLabel>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Flat White Collective"
          />
        </div>
        <div>
          <FieldLabel>Scheme</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <SchemeChoice
              selected={scheme === "global"}
              onSelect={() => setScheme("global")}
              label="LCP+ (global)"
              hint="Shared network"
            />
            <SchemeChoice
              selected={scheme === "private"}
              onSelect={() => setScheme("private")}
              label="Private"
              hint="Walled-garden"
            />
          </div>
        </div>
        <div>
          <FieldLabel>Contact email</FieldLabel>
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="owner@brand.co"
            type="email"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Brand lands without a password — the owner will need one set via
            a separate path before they can log in.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mx-5 mb-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Create brand
        </button>
      </div>
    </ModalShell>
  );
}

function SchemeChoice({
  selected,
  onSelect,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "rounded-md border px-3 py-2 text-left transition-colors " +
        (selected
          ? "border-amber-500/60 bg-amber-500/10"
          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700")
      }
    >
      <div
        className={
          "text-xs font-semibold " +
          (selected ? "text-amber-300" : "text-neutral-100")
        }
      >
        {label}
      </div>
      <div className="mt-0.5 text-[10.5px] text-neutral-500">{hint}</div>
    </button>
  );
}

function AddCafeModal({
  brands,
  onDismiss,
  onCreated,
}: {
  brands: { id: string; name: string }[];
  onDismiss: () => void;
  onCreated: () => void;
}) {
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    brandId.length > 0 && name.trim().length > 0 && address.trim().length > 0;

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      await createPlatformCafe({
        brand_id: brandId,
        name: name.trim(),
        address: address.trim(),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create cafe.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Add new cafe"
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <FieldLabel>Brand</FieldLabel>
          {brands.length === 0 ? (
            <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-500">
              No brands on the platform yet — add a brand first.
            </div>
          ) : (
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
            >
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div>
          <FieldLabel>Cafe name</FieldLabel>
          <TextInput
            value={name}
            onChange={setName}
            placeholder="e.g. Shoreditch High Street"
          />
        </div>
        <div>
          <FieldLabel>Address</FieldLabel>
          <TextInput
            value={address}
            onChange={setAddress}
            placeholder="12 Shoreditch High St, London E1 6PJ"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            A unique 6-character till code is allocated automatically on save.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mx-5 mb-3 rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
        <button
          type="button"
          onClick={onDismiss}
          disabled={busy}
          className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Create cafe
        </button>
      </div>
    </ModalShell>
  );
}
