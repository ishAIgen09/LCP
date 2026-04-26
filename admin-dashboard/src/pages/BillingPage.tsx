import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CreditCard,
  Loader2,
  TrendingUp,
  Users as UsersIcon,
  X,
} from "lucide-react";

import { PlanTypePill, StatusPill } from "@/components/Pills";
import {
  fetchBilling,
  setCafeBillingStatus,
  type AdminBillingRow,
} from "@/lib/api";

const GBP = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  maximumFractionDigits: 0,
});

const CYCLE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

// MVP mock — a cafe's cycle-end date isn't persisted yet, but the UI
// needs to visualise the grace-period timeline (cancellation policy is
// "cancel at period end", see memory: cancel-at-period-end). Hashes the
// cafe_id to a deterministic offset in [3, 28] days so dates stay stable
// across refreshes and vary row-to-row. Swap this for the real
// `current_period_end` column when the subscription sync endpoint lands.
function mockCycleEnd(cafeId: string): Date {
  let hash = 0;
  for (let i = 0; i < cafeId.length; i += 1) {
    hash = (hash * 31 + cafeId.charCodeAt(i)) >>> 0;
  }
  const offsetDays = 3 + (hash % 26);
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d;
}

export function BillingPage() {
  const [rows, setRows] = useState<AdminBillingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminBillingRow | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setRows(null);
    fetchBilling()
      .then((b) => {
        if (!cancelled) setRows(b.rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load billing.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recompute MRR and active count from the current row set instead of
  // trusting server-delta math. One source of truth, no drift after a
  // cancel / reactivate round-trip.
  const { mrrPence, activeCount } = useMemo(() => {
    if (!rows) return { mrrPence: 0, activeCount: 0 };
    let m = 0;
    let a = 0;
    for (const r of rows) {
      if (r.billing_status === "active") {
        m += r.monthly_rate_pence;
        a += 1;
      }
    }
    return { mrrPence: m, activeCount: a };
  }, [rows]);

  const mergeRow = (updated: AdminBillingRow) => {
    setRows((prev) =>
      prev
        ? prev.map((r) => (r.cafe_id === updated.cafe_id ? updated : r))
        : prev,
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <CreditCard className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
          Billing
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        Subscriptions + monthly recurring revenue
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        Platform-wide view of every paid cafe. Cancel a location to drop
        it out of MRR instantly — the real per-brand Stripe subscription
        stays untouched.
      </p>

      {error ? (
        <ErrorCard message={error} />
      ) : rows === null ? (
        <LoadingCard />
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SummaryCard
              Icon={TrendingUp}
              label="Total MRR"
              value={GBP.format(mrrPence / 100)}
              hint={`across ${activeCount} active ${
                activeCount === 1 ? "cafe" : "cafes"
              }`}
            />
            <SummaryCard
              Icon={UsersIcon}
              label="Active paid subscriptions"
              value={activeCount.toString()}
              hint={`out of ${rows.length} total ${
                rows.length === 1 ? "cafe" : "cafes"
              }`}
            />
          </div>
          <BillingTable rows={rows} onCancel={setCancelTarget} />
        </>
      )}

      {cancelTarget ? (
        <CancelPlanDialog
          row={cancelTarget}
          onDismiss={() => setCancelTarget(null)}
          onCancelled={(updated) => {
            mergeRow(updated);
            setCancelTarget(null);
          }}
        />
      ) : null}
    </div>
  );
}

function SummaryCard({
  Icon,
  label,
  value,
  hint,
}: {
  Icon: typeof TrendingUp;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl border border-neutral-800 p-5"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.4} />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50 tabular-nums">
        {value}
      </div>
      <div className="mt-1 text-xs text-neutral-500">{hint}</div>
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
      <span className="text-sm text-neutral-400">Loading billing…</span>
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
          Couldn&apos;t load billing
        </div>
        <div className="mt-1 text-xs text-red-300/80">{message}</div>
      </div>
    </div>
  );
}

function BillingTable({
  rows,
  onCancel,
}: {
  rows: AdminBillingRow[];
  onCancel: (r: AdminBillingRow) => void;
}) {
  return (
    <div
      className="mt-8 overflow-hidden rounded-xl border border-neutral-800"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 bg-neutral-900/60 px-5 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          Cafe subscriptions
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {rows.length} {rows.length === 1 ? "row" : "rows"}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="text-sm font-semibold text-neutral-200">
            No paid cafes yet
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            Seed a brand + cafe to start tracking MRR.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 font-semibold">Cafe</th>
                <th className="px-5 py-3 font-semibold">Plan</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">
                  Monthly rate
                </th>
                <th className="px-5 py-3 font-semibold">Cycle ends</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <BillingRow
                  key={row.cafe_id}
                  row={row}
                  isLast={i === rows.length - 1}
                  onCancel={() => onCancel(row)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BillingRow({
  row,
  isLast,
  onCancel,
}: {
  row: AdminBillingRow;
  isLast: boolean;
  onCancel: () => void;
}) {
  // Cancel button is disabled once the cafe is already out of "can still
  // cancel" territory — either mid-grace-period (pending_cancellation)
  // or fully expired (canceled).
  const disabled =
    row.billing_status === "canceled" ||
    row.billing_status === "pending_cancellation";
  return (
    <tr
      className={
        (isLast ? "" : "border-b border-neutral-800/60 ") +
        "transition-colors hover:bg-neutral-900/40"
      }
    >
      <td className="px-5 py-3">
        <div className="text-neutral-100">{row.cafe_name}</div>
        <div className="mt-0.5 truncate text-[11px] text-neutral-500">
          {row.brand_name}
        </div>
      </td>
      <td className="px-5 py-3">
        <PlanTypePill scheme={row.scheme_type} />
      </td>
      <td className="px-5 py-3">
        <StatusPill status={row.billing_status} />
      </td>
      <td className="px-5 py-3 text-right text-neutral-100 tabular-nums">
        {GBP.format(row.monthly_rate_pence / 100)}
        <span className="text-neutral-500">/mo</span>
      </td>
      <td className="px-5 py-3 whitespace-nowrap text-neutral-400 tabular-nums">
        {CYCLE_FORMATTER.format(mockCycleEnd(row.cafe_id))}
        {row.billing_status === "pending_cancellation" ? (
          <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-orange-400">
            Grace period
          </div>
        ) : null}
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          <CancelButton
            disabled={disabled}
            label={
              disabled
                ? `${row.cafe_name} already cancelled`
                : `Cancel plan for ${row.cafe_name}`
            }
            onClick={disabled ? () => undefined : onCancel}
          />
        </div>
      </td>
    </tr>
  );
}

function CancelButton({
  disabled,
  label,
  onClick,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  const base =
    "flex h-7 w-7 items-center justify-center rounded-md border transition-colors";
  const tone = disabled
    ? "cursor-not-allowed border-neutral-800 text-neutral-600 opacity-50"
    : "border-neutral-800 text-neutral-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`${base} ${tone}`}
    >
      <Ban className="h-3.5 w-3.5" strokeWidth={2.2} />
    </button>
  );
}

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
      aria-labelledby="lcp-billing-modal-title"
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
            id="lcp-billing-modal-title"
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

function CancelPlanDialog({
  row,
  onDismiss,
  onCancelled,
}: {
  row: AdminBillingRow;
  onDismiss: () => void;
  onCancelled: (updated: AdminBillingRow) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      // Cancel-at-period-end policy (see memory): flip to the grace-period
      // status, not the fully-finished `canceled`. The cafe keeps paying +
      // keeps serving customers until their billing cycle ends; a
      // period-end sweep would later transition them to `canceled`.
      const updated = await setCafeBillingStatus(
        row.cafe_id,
        "pending_cancellation",
      );
      onCancelled(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel plan.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title="Cancel this plan?"
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="px-5 py-4 text-sm leading-6 text-neutral-300">
        Mark{" "}
        <span className="font-semibold text-neutral-100">{row.cafe_name}</span>{" "}
        as pending cancellation? They&apos;ll keep billing at{" "}
        {GBP.format(row.monthly_rate_pence / 100)}/mo and stay live on the
        consumer app until their cycle ends — then the period-end job flips
        them to canceled and MRR drops. Ledger history is untouched either
        way.
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
          Keep active
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-rose-500/90 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Cancel plan
        </button>
      </div>
    </ModalShell>
  );
}
