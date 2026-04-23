import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";

import { StatusPill } from "@/components/Pills";
import {
  adjustCustomerStamps,
  fetchCafes,
  fetchCustomers,
  setCustomerSuspended,
  type AdjustStampsBody,
  type AdminCafe,
  type AdminCustomer,
  type SchemeType,
} from "@/lib/api";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

// A de-duped option list driving the Adjust Stamps modal's scheme picker.
// Only schemes that actually have a cafe show up — the backend would 409
// otherwise ("No cafe exists for the selected scheme"), so we pre-filter.
type SchemeOption =
  | { kind: "global" }
  | { kind: "private"; brandId: string; brandName: string };

export function CustomersPage() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(null);
  const [cafes, setCafes] = useState<AdminCafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  // Modal state is kept at the page level so the table rows stay dumb —
  // they just emit "user clicked edit/suspend on row X".
  const [suspendTarget, setSuspendTarget] = useState<AdminCustomer | null>(
    null,
  );
  const [adjustTarget, setAdjustTarget] = useState<AdminCustomer | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCustomers(null);
    setCafes(null);
    Promise.all([fetchCustomers(), fetchCafes()])
      .then(([cs, cf]) => {
        if (cancelled) return;
        setCustomers(cs);
        setCafes(cf);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load customers.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const schemeOptions = useMemo<SchemeOption[]>(() => {
    if (!cafes) return [];
    const options: SchemeOption[] = [];
    const seenPrivate = new Set<string>();
    let hasGlobal = false;
    for (const cafe of cafes) {
      if (cafe.scheme_type === "global") {
        hasGlobal = true;
      } else if (!seenPrivate.has(cafe.brand_id)) {
        seenPrivate.add(cafe.brand_id);
        options.push({
          kind: "private",
          brandId: cafe.brand_id,
          brandName: cafe.brand_name,
        });
      }
    }
    if (hasGlobal) options.unshift({ kind: "global" });
    options.sort((a, b) => {
      if (a.kind === "global") return -1;
      if (b.kind === "global") return 1;
      return a.brandName.localeCompare(b.brandName);
    });
    return options;
  }, [cafes]);

  const filtered = useMemo(() => {
    if (!customers) return null;
    const needle = filter.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter((c) => {
      if (c.till_code.toLowerCase().includes(needle)) return true;
      if (c.email && c.email.toLowerCase().includes(needle)) return true;
      return false;
    });
  }, [customers, filter]);

  // Response shape from both endpoints is an AdminCustomer, so we just
  // splice it back into the table. No refetch round-trip needed.
  const mergeCustomer = (updated: AdminCustomer) => {
    setCustomers((prev) =>
      prev ? prev.map((c) => (c.id === updated.id ? updated : c)) : prev,
    );
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Customers
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        End users of the consumer app
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        Look up a consumer by till code or email, see their net stamp
        balances across LCP+ and Private schemes, and issue corrections
        when a scan goes wrong.
      </p>

      {error ? (
        <ErrorCard message={error} />
      ) : customers === null || filtered === null ? (
        <LoadingCard />
      ) : (
        <CustomerTable
          rows={filtered}
          totalCount={customers.length}
          filterValue={filter}
          onFilterChange={setFilter}
          onEdit={setAdjustTarget}
          onSuspend={setSuspendTarget}
        />
      )}

      {suspendTarget ? (
        <SuspendConfirmDialog
          customer={suspendTarget}
          onDismiss={() => setSuspendTarget(null)}
          onConfirmed={(updated) => {
            mergeCustomer(updated);
            setSuspendTarget(null);
          }}
        />
      ) : null}

      {adjustTarget ? (
        <AdjustStampsDialog
          customer={adjustTarget}
          schemes={schemeOptions}
          onDismiss={() => setAdjustTarget(null)}
          onSaved={(updated) => {
            mergeCustomer(updated);
            setAdjustTarget(null);
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
      <span className="text-sm text-neutral-400">Loading customers…</span>
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
          Couldn&apos;t load customers
        </div>
        <div className="mt-1 text-xs text-red-300/80">{message}</div>
      </div>
    </div>
  );
}

function CustomerTable({
  rows,
  totalCount,
  filterValue,
  onFilterChange,
  onEdit,
  onSuspend,
}: {
  rows: AdminCustomer[];
  totalCount: number;
  filterValue: string;
  onFilterChange: (v: string) => void;
  onEdit: (c: AdminCustomer) => void;
  onSuspend: (c: AdminCustomer) => void;
}) {
  const filtered = filterValue.trim().length > 0;
  return (
    <div
      className="mt-8 overflow-hidden rounded-xl border border-neutral-800"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex flex-col gap-3 border-b border-neutral-800 bg-neutral-900/60 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchBar value={filterValue} onChange={onFilterChange} />
        <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {filtered
            ? `${rows.length} of ${totalCount} rows`
            : `${rows.length} ${rows.length === 1 ? "row" : "rows"}`}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="text-sm font-semibold text-neutral-200">
            {filtered ? "No customers match" : "No customers yet"}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {filtered
              ? "Try a shorter till code or different email substring."
              : "Consumers who sign up will appear here."}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 font-semibold">Till Code</th>
                <th className="px-5 py-3 font-semibold">Email</th>
                <th className="px-5 py-3 font-semibold text-right">
                  Global Stamps
                </th>
                <th className="px-5 py-3 font-semibold text-right">
                  Private Stamps
                </th>
                <th className="px-5 py-3 font-semibold">Joined</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((customer, i) => (
                <CustomerRow
                  key={customer.id}
                  customer={customer}
                  isLast={i === rows.length - 1}
                  onEdit={() => onEdit(customer)}
                  onSuspend={() => onSuspend(customer)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full sm:max-w-xs">
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-500"
        strokeWidth={2}
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter by till code or email…"
        aria-label="Filter customers by till code or email"
        className="w-full rounded-md border border-neutral-800 bg-neutral-950 py-1.5 pl-8 pr-8 text-[13px] text-neutral-100 placeholder-neutral-500 outline-none transition-colors focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear filter"
          className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      ) : null}
    </div>
  );
}

function CustomerRow({
  customer,
  isLast,
  onEdit,
  onSuspend,
}: {
  customer: AdminCustomer;
  isLast: boolean;
  onEdit: () => void;
  onSuspend: () => void;
}) {
  const joined = DATE_FORMATTER.format(new Date(customer.created_at));
  return (
    <tr
      className={
        (isLast ? "" : "border-b border-neutral-800/60 ") +
        "transition-colors hover:bg-neutral-900/40"
      }
    >
      <td className="px-5 py-3 whitespace-nowrap">
        <span
          className="text-neutral-100"
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            letterSpacing: "0.08em",
          }}
        >
          {customer.till_code}
        </span>
      </td>
      <td className="px-5 py-3 text-neutral-300">
        {customer.email ?? (
          <span className="italic text-neutral-600">no email</span>
        )}
      </td>
      <td className="px-5 py-3 text-right text-neutral-100 tabular-nums">
        {customer.global_stamps}
      </td>
      <td className="px-5 py-3 text-right text-neutral-100 tabular-nums">
        {customer.total_private_stamps}
      </td>
      <td className="px-5 py-3 whitespace-nowrap text-neutral-400">
        {joined}
      </td>
      <td className="px-5 py-3">
        <StatusPill status={customer.is_suspended ? "suspended" : "active"} />
      </td>
      <td className="px-5 py-3">
        <div className="flex items-center justify-end gap-1">
          <RowActionButton
            label={`Edit or adjust stamps for ${customer.till_code}`}
            onClick={onEdit}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
          </RowActionButton>
          <RowActionButton
            label={
              customer.is_suspended
                ? `Reactivate ${customer.till_code}`
                : `Suspend ${customer.till_code}`
            }
            danger={!customer.is_suspended}
            onClick={onSuspend}
          >
            {customer.is_suspended ? (
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.2} />
            ) : (
              <Ban className="h-3.5 w-3.5" strokeWidth={2.2} />
            )}
          </RowActionButton>
        </div>
      </td>
    </tr>
  );
}

function RowActionButton({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const base =
    "flex h-7 w-7 items-center justify-center rounded-md border transition-colors";
  const tone = danger
    ? "border-neutral-800 text-neutral-400 hover:border-rose-500/40 hover:bg-rose-500/10 hover:text-rose-300"
    : "border-neutral-800 text-neutral-400 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-300";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`${base} ${tone}`}
    >
      {children}
    </button>
  );
}

// Shared modal chrome — one dimming backdrop + card, so Suspend and
// Adjust can stay light on structure and focus on their own bodies.
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
      aria-labelledby="lcp-modal-title"
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
            id="lcp-modal-title"
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

function SuspendConfirmDialog({
  customer,
  onDismiss,
  onConfirmed,
}: {
  customer: AdminCustomer;
  onDismiss: () => void;
  onConfirmed: (updated: AdminCustomer) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const suspending = !customer.is_suspended;

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const updated = await setCustomerSuspended(customer.id, suspending);
      onConfirmed(updated);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to update status.",
      );
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={suspending ? "Suspend customer?" : "Reactivate customer?"}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="px-5 py-4 text-sm leading-6 text-neutral-300">
        {suspending ? (
          <>
            Suspending{" "}
            <span className="font-mono text-neutral-100">
              {customer.till_code}
            </span>{" "}
            will block the account from earning or redeeming stamps. Their
            ledger history is preserved — you can reactivate them at any
            time.
          </>
        ) : (
          <>
            Reactivate{" "}
            <span className="font-mono text-neutral-100">
              {customer.till_code}
            </span>
            ? They&apos;ll be able to earn and redeem again immediately.
          </>
        )}
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
          onClick={handleConfirm}
          disabled={busy}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 " +
            (suspending
              ? "bg-rose-500/90 text-white hover:bg-rose-500"
              : "bg-emerald-500/90 text-white hover:bg-emerald-500")
          }
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          {suspending ? "Suspend" : "Reactivate"}
        </button>
      </div>
    </ModalShell>
  );
}

function AdjustStampsDialog({
  customer,
  schemes,
  onDismiss,
  onSaved,
}: {
  customer: AdminCustomer;
  schemes: SchemeOption[];
  onDismiss: () => void;
  onSaved: (updated: AdminCustomer) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string>(() =>
    schemes[0] ? schemeKey(schemes[0]) : "",
  );
  const [amountStr, setAmountStr] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = schemes.find((s) => schemeKey(s) === selectedKey) ?? null;
  const amount = Number.parseInt(amountStr, 10);
  const amountIsValid =
    Number.isFinite(amount) &&
    amount !== 0 &&
    Math.abs(amount) <= 100 &&
    (amount > 0 || amount % 10 === 0);

  const handleSave = async () => {
    if (!selected || !amountIsValid) return;
    setBusy(true);
    setError(null);
    const body: AdjustStampsBody = {
      scheme_type: selected.kind as SchemeType,
      brand_id: selected.kind === "private" ? selected.brandId : null,
      amount,
    };
    try {
      const updated = await adjustCustomerStamps(customer.id, body);
      onSaved(updated);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to adjust stamps.",
      );
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Adjust stamps — ${customer.till_code}`}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Scheme
          </label>
          {schemes.length === 0 ? (
            <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-500">
              No schemes with live cafes — seed a brand first.
            </div>
          ) : (
            <select
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
            >
              {schemes.map((opt) => (
                <option key={schemeKey(opt)} value={schemeKey(opt)}>
                  {opt.kind === "global"
                    ? "LCP+ (global)"
                    : `${opt.brandName} (private)`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
            Stamps
          </label>
          <input
            type="number"
            inputMode="numeric"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-amber-500/60 focus:ring-1 focus:ring-amber-500/30"
          />
          <p className="mt-1.5 text-[11px] leading-5 text-neutral-500">
            Positive = credit (EARN). Negative = claw-back (REDEEM, must be
            a multiple of 10). Cap ±100.
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
          onClick={handleSave}
          disabled={busy || !selected || !amountIsValid}
          className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Save
        </button>
      </div>
    </ModalShell>
  );
}

function schemeKey(opt: SchemeOption): string {
  return opt.kind === "global" ? "global" : `private:${opt.brandId}`;
}
