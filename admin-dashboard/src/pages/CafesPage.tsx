import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Coffee,
  Loader2,
  Pencil,
  Power,
} from "lucide-react";

import { PlanTypePill, StatusPill } from "@/components/Pills";
import { fetchCafes, type AdminCafe } from "@/lib/api";

export function CafesPage() {
  const [cafes, setCafes] = useState<AdminCafe[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setCafes(null);
    fetchCafes()
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
  }, []);

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
        Platform-wide cafe roster. Scan at a glance, act inline — no nested
        menus, no deep clicks.
      </p>

      {error ? (
        <ErrorCard message={error} />
      ) : cafes === null ? (
        <LoadingCard />
      ) : cafes.length === 0 ? (
        <EmptyCard />
      ) : (
        <CafesTable cafes={cafes} />
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

function EmptyCard() {
  return (
    <div
      className="mt-8 rounded-xl border border-dashed border-neutral-800 p-8 text-center"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <Coffee className="mx-auto h-6 w-6 text-neutral-600" strokeWidth={1.8} />
      <div className="mt-3 text-sm font-semibold text-neutral-200">
        No cafes on the platform yet
      </div>
      <div className="mt-1 text-xs text-neutral-500">
        Cafes added via the B2B dashboard will appear here.
      </div>
    </div>
  );
}

function CafesTable({ cafes }: { cafes: AdminCafe[] }) {
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
}: {
  cafe: AdminCafe;
  isLast: boolean;
}) {
  // Handlers are intentional no-ops for the scaffold. Wiring them up to
  // real PATCH / DELETE endpoints is a follow-up (pairs with the platform
  // admin auth work). Logging keeps the interaction diagnosable without
  // pretending the mutation happened.
  const handleEdit = () => {
    // eslint-disable-next-line no-console
    console.info("[admin] edit cafe:", cafe.id, cafe.name);
    alert(`Edit "${cafe.name}" — endpoint not wired yet.`);
  };
  const handleToggle = () => {
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
        <div className="font-medium text-neutral-100">{cafe.name}</div>
        <div
          className="mt-0.5 truncate text-[11px] text-neutral-500"
          title={cafe.address}
        >
          {cafe.address}
        </div>
      </td>
      <td className="px-5 py-3.5 text-neutral-300">{cafe.brand_name}</td>
      <td className="px-5 py-3.5">
        <PlanTypePill scheme={cafe.scheme_type} />
      </td>
      <td className="px-5 py-3.5">
        <StatusPill status={cafe.subscription_status} />
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

