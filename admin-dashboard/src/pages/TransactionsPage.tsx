import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Loader2,
  Receipt,
  Search,
  X,
} from "lucide-react";

import { EventTypePill, PlanTypePill } from "@/components/Pills";
import {
  fetchTransactions,
  type AdminTransaction,
} from "@/lib/api";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function TransactionsPage() {
  const [txns, setTxns] = useState<AdminTransaction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cafeFilter, setCafeFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setTxns(null);
    fetchTransactions()
      .then((rows) => {
        if (!cancelled) setTxns(rows);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Failed to load transactions.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Client-side filter on cafe name. Case-insensitive substring. At the
  // MVP 500-row cap this is instant; if the feed ever exceeds a few
  // thousand rows we'd push the filter to the server as a query param.
  const filtered = useMemo(() => {
    if (!txns) return null;
    const needle = cafeFilter.trim().toLowerCase();
    if (!needle) return txns;
    return txns.filter((t) => t.cafe_name.toLowerCase().includes(needle));
  }, [txns, cafeFilter]);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-amber-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-400">
          Transactions
        </span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-neutral-50">
        Shadow ledger — every stamp + redeem, live
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
        Full platform activity feed across every brand. Earns are passive;
        redeems are the cost-of-goods line — watch those.
      </p>

      {error ? (
        <ErrorCard message={error} />
      ) : txns === null || filtered === null ? (
        <LoadingCard />
      ) : (
        <TxnTable
          rows={filtered}
          totalCount={txns.length}
          filterValue={cafeFilter}
          onFilterChange={setCafeFilter}
        />
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
      <span className="text-sm text-neutral-400">Loading ledger…</span>
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
          Couldn&apos;t load transactions
        </div>
        <div className="mt-1 text-xs text-red-300/80">{message}</div>
      </div>
    </div>
  );
}

function TxnTable({
  rows,
  totalCount,
  filterValue,
  onFilterChange,
}: {
  rows: AdminTransaction[];
  totalCount: number;
  filterValue: string;
  onFilterChange: (v: string) => void;
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
            {filtered ? "No rows match that cafe" : "No transactions yet"}
          </div>
          <div className="mt-1 text-xs text-neutral-500">
            {filtered
              ? "Try a shorter or different substring."
              : "Stamps + redeems will stream in here as baristas scan."}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                <th className="px-5 py-3 font-semibold">Date / Time</th>
                <th className="px-5 py-3 font-semibold">Customer</th>
                <th className="px-5 py-3 font-semibold">Location</th>
                <th className="px-5 py-3 font-semibold">Event</th>
                <th className="px-5 py-3 font-semibold">Scheme</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((txn, i) => (
                <TxnRow
                  key={txn.id}
                  txn={txn}
                  isLast={i === rows.length - 1}
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
        placeholder="Filter by cafe name…"
        aria-label="Filter transactions by cafe name"
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

function TxnRow({
  txn,
  isLast,
}: {
  txn: AdminTransaction;
  isLast: boolean;
}) {
  // Format once per row — cheap, no memo needed at this size.
  const when = DATE_FORMATTER.format(new Date(txn.created_at));
  return (
    <tr
      className={
        (isLast ? "" : "border-b border-neutral-800/60 ") +
        "transition-colors hover:bg-neutral-900/40"
      }
    >
      <td className="px-5 py-3 whitespace-nowrap text-neutral-300 tabular-nums">
        {when}
      </td>
      <td className="px-5 py-3">
        {/* Till code renders in mono so the 6-char string aligns across
            rows; email below is secondary context. */}
        <div
          className="text-neutral-100"
          style={{
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
            letterSpacing: "0.08em",
          }}
        >
          {txn.customer_till_code}
        </div>
        {txn.customer_email ? (
          <div className="mt-0.5 truncate text-[11px] text-neutral-500">
            {txn.customer_email}
          </div>
        ) : null}
      </td>
      <td className="px-5 py-3 text-neutral-300">{txn.cafe_name}</td>
      <td className="px-5 py-3">
        <EventTypePill event={txn.event_type} />
      </td>
      <td className="px-5 py-3">
        <PlanTypePill scheme={txn.scheme_type} />
      </td>
    </tr>
  );
}
