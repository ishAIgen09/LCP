import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ClipboardCopy,
  Coffee,
  Download,
  ExternalLink,
  Filter,
  Gift,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Power,
  Receipt,
  RefreshCw,
  Scale,
  Shield,
  ShieldAlert,
  Stamp,
  Store,
  Undo2,
  UserCog,
  X,
} from "lucide-react";

import { PlanTypePill, StatusPill } from "@/components/Pills";
import {
  createBrand,
  createPlatformCafe,
  exportCafesCsv,
  fetchBrandInvoices,
  fetchCafeSecurity,
  fetchCafeStats,
  fetchCafes,
  inviteBrandAdmin,
  resetCafeNetworkLock,
  updatePlatformCafe,
  type AdminCafe,
  type AdminCafeSecurity,
  type BrandInvoice,
  type BrandInvoiceLine,
  type BrandInvoicesResponse,
  type BrandInviteResponse,
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

// Super-Admin dispute-resolution surface — they need to see at a glance
// when a cafe came onto the platform without doing date math. We render
// "Joined: DD MMM YYYY" so the column title carries no extra weight.
const JOINED_DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatJoinedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `Joined: ${JOINED_DATE_FORMATTER.format(d)}`;
}

type RangeOption = { id: CafeStatsRange; label: string };
const RANGE_OPTIONS: RangeOption[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
  { id: "ytd", label: "YTD" },
  { id: "1y", label: "Last year" },
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
  const [addOpen, setAddOpen] = useState<null | "brand" | "cafe" | "invite">(
    null,
  );
  const [editingCafe, setEditingCafe] = useState<AdminCafe | null>(null);
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
        <Coffee className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
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
        <CafesTable
          cafes={cafes}
          onSelect={setSelectedCafeId}
          onEdit={setEditingCafe}
        />
      )}

      {editingCafe ? (
        <EditCafeModal
          cafe={editingCafe}
          onDismiss={() => setEditingCafe(null)}
          onSaved={() => {
            setEditingCafe(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

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
      {addOpen === "invite" ? (
        <InviteAdminModal
          brands={brandOptions}
          onDismiss={() => setAddOpen(null)}
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
        className="h-5 w-5 animate-spin text-emerald-400"
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
  onEdit,
}: {
  cafes: AdminCafe[];
  onSelect: (cafeId: string) => void;
  onEdit: (cafe: AdminCafe) => void;
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
              <th className="px-5 py-3 font-semibold">Joined</th>
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
                onEdit={() => onEdit(cafe)}
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
  onEdit,
}: {
  cafe: AdminCafe;
  isLast: boolean;
  onSelect: () => void;
  onEdit: () => void;
}) {
  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };
  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Suspend is the cafe-level billing toggle — keep this as a quick
    // action that opens the same modal, focused on the status field.
    onEdit();
  };
  const handleImpersonate = (e: React.MouseEvent) => {
    e.stopPropagation();
    // eslint-disable-next-line no-console
    console.info("[admin] impersonate brand admin:", cafe.brand_id, cafe.brand_name);
    alert(
      `Impersonate ${cafe.brand_name} — feature stubbed; backend session-mint endpoint not wired yet.`,
    );
  };
  const handleReverse = (e: React.MouseEvent) => {
    e.stopPropagation();
    // eslint-disable-next-line no-console
    console.info("[admin] reverse latest transaction at cafe:", cafe.id, cafe.name);
    alert(
      `Reverse last transaction at ${cafe.name} — feature stubbed; ledger-reversal endpoint not wired yet.`,
    );
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
          <div className="font-medium text-neutral-100 transition-colors group-hover:text-emerald-300">
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
      <td className="px-5 py-3.5 text-[12.5px] text-neutral-300">
        {formatJoinedDate(cafe.created_at)}
      </td>
      <td className="px-5 py-3.5">
        {/* Effective status: a cafe can only be live if its brand is
            paying. Cafe.billing_status captures per-cafe cancellation
            *within* a paying brand; if the brand itself isn't ACTIVE,
            that's the bottleneck (and the b2b dashboard + POS gate are
            already reading brand.subscription_status, so the pill must
            agree or it lies to the admin). */}
        <StatusPill
          status={
            cafe.subscription_status === "active"
              ? cafe.billing_status
              : cafe.subscription_status
          }
        />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            onClick={handleEdit}
            aria-label={`Edit ${cafe.name}`}
            title="Edit plan + status"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <Pencil className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleImpersonate}
            aria-label={`Impersonate ${cafe.brand_name} admin`}
            title="Impersonate brand admin (stub)"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-emerald-300"
          >
            <UserCog className="h-4 w-4" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={handleReverse}
            aria-label={`Reverse last transaction at ${cafe.name}`}
            title="Reverse last transaction (stub)"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-emerald-300"
          >
            <Undo2 className="h-4 w-4" strokeWidth={2} />
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

// ─────────────────────────────────────────────────────────────────
// Edit Cafe modal — Super Admin manual override of plan + status.
// Sends to POST /api/admin/platform/cafes/{id}/update which atomically
// updates brand.scheme_type and cafes.billing_status. Plan changes
// affect every cafe under the brand (it's a brand-level field), so
// the dialog surfaces that warning explicitly.
// ─────────────────────────────────────────────────────────────────

function EditCafeModal({
  cafe,
  onDismiss,
  onSaved,
}: {
  cafe: AdminCafe;
  onDismiss: () => void;
  onSaved: () => void;
}) {
  const [scheme, setScheme] = useState<SchemeType>(cafe.scheme_type);
  const [billingStatus, setBillingStatus] = useState<SubscriptionStatus>(
    cafe.billing_status,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    scheme !== cafe.scheme_type || billingStatus !== cafe.billing_status;

  const handleSave = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      await updatePlatformCafe(cafe.id, {
        scheme_type: scheme,
        billing_status: billingStatus,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update cafe.");
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={`Edit ${cafe.name}`}
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="space-y-5 px-5 py-4">
        <div>
          <FieldLabel>Plan (brand-wide)</FieldLabel>
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
          {scheme !== cafe.scheme_type ? (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-[11px] text-emerald-300">
              <AlertTriangle className="h-3 w-3" strokeWidth={2.4} />
              Plan changes affect every cafe under {cafe.brand_name}.
            </p>
          ) : null}
        </div>

        <div>
          <FieldLabel>Status (this cafe)</FieldLabel>
          <select
            value={billingStatus}
            onChange={(e) =>
              setBillingStatus(e.target.value as SubscriptionStatus)
            }
            className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 [&>option]:bg-neutral-900"
          >
            <option value="active">Active</option>
            <option value="trialing">Trialing</option>
            <option value="pending_cancellation">Pending Cancellation</option>
            <option value="past_due">Past due</option>
            <option value="incomplete">Incomplete</option>
            <option value="canceled">Suspended (Cancelled)</option>
          </select>
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Cafe-level only — brand subscription with Stripe is unaffected.
          </p>
        </div>

        <CafeSecuritySection cafeId={cafe.id} />
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
          disabled={!dirty || busy}
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Save changes
        </button>
      </div>
    </ModalShell>
  );
}

// Security & Network section embedded in the Edit modal. Renders the
// last known IP + the network-lock status, with a Super-Admin-only
// "Reset Network Lock" button that wipes the lock so the next login from
// any IP becomes the new pinned address.
function CafeSecuritySection({ cafeId }: { cafeId: string }) {
  const [data, setData] = useState<AdminCafeSecurity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setData(null);
    fetchCafeSecurity(cafeId)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Couldn't load security.");
      });
    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  const handleReset = async () => {
    if (resetting) return;
    if (
      !window.confirm(
        "Reset the network lock for this cafe? The next successful login from any IP becomes the new pinned address.",
      )
    ) {
      return;
    }
    setResetting(true);
    try {
      const next = await resetCafeNetworkLock(cafeId);
      setData(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed.");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        <Shield className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.4} />
        Security &amp; Network
      </div>
      <div
        className="rounded-md border border-neutral-800 p-3"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        {error ? (
          <div className="text-[11px] text-rose-300">{error}</div>
        ) : data === null ? (
          <div className="flex items-center gap-2 text-[11px] text-neutral-500">
            <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.2} />
            Loading network state…
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="font-semibold uppercase tracking-wider text-neutral-500">
                  Last Known IP
                </div>
                <div
                  className="mt-1 text-neutral-200"
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  }}
                >
                  {data.last_known_ip ?? "— never logged in —"}
                </div>
              </div>
              <div>
                <div className="font-semibold uppercase tracking-wider text-neutral-500">
                  Lock state
                </div>
                <div className="mt-1">
                  {data.network_locked_at ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-300">
                      <ShieldAlert className="h-3 w-3" strokeWidth={2.4} />
                      Locked
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-300">
                      <Shield className="h-3 w-3" strokeWidth={2.4} />
                      Open
                    </span>
                  )}
                </div>
              </div>
            </div>

            {data.recent_attempts.length > 0 ? (
              <div className="mt-3">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
                  Recent mismatched-IP attempts
                </div>
                <ul className="mt-1.5 space-y-1">
                  {data.recent_attempts.slice(0, 5).map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between rounded border border-neutral-800/60 bg-neutral-950 px-2.5 py-1.5 text-[11px]"
                    >
                      <span
                        className="text-rose-300"
                        style={{
                          fontFamily:
                            "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                        }}
                      >
                        {row.attempted_ip}
                      </span>
                      <span className="text-neutral-500">
                        {new Date(row.attempted_at).toLocaleString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleReset}
              disabled={resetting || (!data.network_locked_at && !data.last_known_ip)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-rose-900/60 bg-rose-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-rose-200 transition-colors hover:bg-rose-950/60 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resetting ? (
                <Loader2 className="h-3 w-3 animate-spin" strokeWidth={2.4} />
              ) : (
                <RefreshCw className="h-3 w-3" strokeWidth={2.4} />
              )}
              Reset Network Lock
            </button>
            <p className="mt-1.5 text-[10px] text-neutral-500">
              Super-admin only. Clears Last Known IP + 30-day cooldown so the
              next login from any IP becomes the new pinned address.
            </p>
          </>
        )}
      </div>
    </div>
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
  const [invoicesOpen, setInvoicesOpen] = useState(false);

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
        <Coffee className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-400">
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
        <span className="text-neutral-700">·</span>
        <span className="text-neutral-400">{formatJoinedDate(cafe.created_at)}</span>
      </div>

      <div className="mt-5">
        <button
          type="button"
          onClick={() => setInvoicesOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600/40 bg-emerald-950/40 px-3 py-1.5 text-[11.5px] font-semibold text-emerald-200 transition-colors hover:border-emerald-500 hover:bg-emerald-900/40 hover:text-emerald-100"
        >
          <Receipt className="h-3.5 w-3.5" strokeWidth={2.2} />
          Billing history (Stripe)
        </button>
      </div>

      <BrandInvoicesModal
        open={invoicesOpen}
        brandId={cafe.brand_id}
        brandName={cafe.brand_name}
        onClose={() => setInvoicesOpen(false)}
      />

      <div className="mt-8 flex items-center gap-2">
        <CalendarClock
          className="h-3.5 w-3.5 text-neutral-500"
          strokeWidth={2.2}
        />
        <span className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
          Date range
        </span>
        <RangeDropdown value={range} onChange={setRange} />
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

// ─────────────────────────────────────────────────────────────────
// Super-Admin "Billing History" — Stripe invoices for the brand
// behind this cafe. Each row is collapsed to header + amount + date,
// expanding shows lines.data (proration-friendly so the operator can
// walk a disputing brand owner through the exact charges).
// ─────────────────────────────────────────────────────────────────

function BrandInvoicesModal({
  open,
  brandId,
  brandName,
  onClose,
}: {
  open: boolean;
  brandId: string;
  brandName: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<BrandInvoicesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setExpanded(new Set());
    fetchBrandInvoices(brandId)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load invoices.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, brandId]);

  if (!open) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-neutral-800 bg-[#161616] shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-neutral-800 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-emerald-400" strokeWidth={2.2} />
              <h2 className="text-base font-semibold text-neutral-50">
                Billing history
              </h2>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Stripe invoices issued to{" "}
              <span className="font-medium text-neutral-200">{brandName}</span>.
              Click a row to see line items and proration breakdown.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <Loader2 className="h-4 w-4 animate-spin text-emerald-400" strokeWidth={2.2} />
              Fetching from Stripe…
            </div>
          ) : error ? (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
              {error}
            </div>
          ) : !data || data.invoices.length === 0 ? (
            <div className="rounded-md border border-dashed border-neutral-800 bg-neutral-900/40 p-6 text-center text-sm text-neutral-400">
              {data?.stripe_customer_id
                ? "No invoices on file at Stripe yet."
                : "This brand hasn't completed Stripe Checkout, so no invoices exist."}
            </div>
          ) : (
            <ul className="space-y-2">
              {data.invoices.map((inv) => (
                <BrandInvoiceRow
                  key={inv.id}
                  invoice={inv}
                  expanded={expanded.has(inv.id)}
                  onToggle={() => toggle(inv.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const INVOICE_DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatPence(pence: number, currency: string): string {
  const upper = (currency || "gbp").toUpperCase();
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: upper,
    minimumFractionDigits: 2,
  }).format(pence / 100);
}

function invoiceStatusTone(status: string): string {
  switch (status) {
    case "paid":
      return "border-emerald-700/60 bg-emerald-900/30 text-emerald-200";
    case "open":
      return "border-amber-700/60 bg-amber-900/30 text-amber-200";
    case "uncollectible":
    case "void":
      return "border-red-800/60 bg-red-950/40 text-red-200";
    default:
      return "border-neutral-700 bg-neutral-900/60 text-neutral-300";
  }
}

function BrandInvoiceRow({
  invoice,
  expanded,
  onToggle,
}: {
  invoice: BrandInvoice;
  expanded: boolean;
  onToggle: () => void;
}) {
  const created = new Date(invoice.created_at);
  return (
    <li className="rounded-md border border-neutral-800 bg-neutral-950/40">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-neutral-900/60"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-neutral-500">
            <span>{INVOICE_DATE_FMT.format(created)}</span>
            <span className="text-neutral-700">·</span>
            <span className="font-mono text-neutral-300">
              {invoice.number ?? invoice.id}
            </span>
          </div>
          <div className="mt-1 text-sm font-semibold text-neutral-100">
            {formatPence(invoice.total_pence, invoice.currency)}
          </div>
        </div>
        <span
          className={
            "rounded-full border px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider " +
            invoiceStatusTone(invoice.status)
          }
        >
          {invoice.status}
        </span>
        <ChevronDown
          className={
            "h-4 w-4 shrink-0 text-neutral-400 transition-transform " +
            (expanded ? "rotate-180" : "")
          }
          strokeWidth={2.2}
        />
      </button>
      {expanded ? (
        <div className="border-t border-neutral-800 px-4 py-3">
          {invoice.lines.length === 0 ? (
            <p className="text-xs text-neutral-500">
              Stripe returned no line items for this invoice.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {invoice.lines.map((line, i) => (
                <BrandInvoiceLineRow
                  key={i}
                  line={line}
                  currency={invoice.currency}
                />
              ))}
            </ul>
          )}
          {invoice.hosted_invoice_url ? (
            <a
              href={invoice.hosted_invoice_url}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-300 hover:text-emerald-200"
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2.2} />
              Open hosted invoice
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function BrandInvoiceLineRow({
  line,
  currency,
}: {
  line: BrandInvoiceLine;
  currency: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 rounded border border-neutral-900 bg-neutral-900/40 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <div className="text-neutral-200">
          {line.description ?? "(unlabeled line)"}
        </div>
        {line.proration ? (
          <div className="mt-0.5 inline-flex items-center rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
            Proration
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-right font-mono text-[11.5px] text-neutral-100">
        {formatPence(line.amount_pence, line.currency || currency)}
      </div>
    </li>
  );
}


function RangeDropdown({
  value,
  onChange,
}: {
  value: CafeStatsRange;
  onChange: (r: CafeStatsRange) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-xs font-medium text-neutral-200 transition-colors hover:border-neutral-700">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as CafeStatsRange)}
        aria-label="Date range"
        className="cursor-pointer bg-transparent pr-1 text-xs font-semibold text-neutral-100 outline-none [&>option]:bg-neutral-900"
      >
        {RANGE_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StatsLoadingCard() {
  return (
    <div
      className="mt-6 flex items-center gap-3 rounded-xl border border-neutral-800 p-6"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <Loader2
        className="h-5 w-5 animate-spin text-emerald-400"
        strokeWidth={2.2}
      />
      <span className="text-sm text-neutral-400">Crunching ledger…</span>
    </div>
  );
}

function StatsCards({ stats }: { stats: CafeStats }) {
  const netSign = stats.net_roi_pence >= 0 ? "positive" : "negative";
  return (
    <div className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PrimaryStatCard
          Icon={Stamp}
          tint="emerald"
          label="Total Stamps Earned"
          value={stats.stamps_issued.toLocaleString()}
          hint="EARN rows in the selected window"
        />
        <PrimaryStatCard
          Icon={Gift}
          tint="rose"
          label="Total Rewards Redeemed"
          value={stats.rewards_redeemed.toLocaleString()}
          hint="REDEEM rows in the selected window"
        />
      </div>
      <SecondaryStatCard
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

const PRIMARY_TINT: Record<"emerald" | "rose", string> = {
  emerald: "bg-emerald-500/15 ring-emerald-500/30 text-emerald-400",
  rose: "bg-rose-500/15 ring-rose-500/30 text-rose-400",
};

function PrimaryStatCard({
  Icon,
  tint,
  label,
  value,
  hint,
}: {
  Icon: typeof Stamp;
  tint: "emerald" | "rose";
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div
      className="rounded-xl border border-neutral-800 p-6"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-10 w-10 items-center justify-center rounded-lg ring-1 ${PRIMARY_TINT[tint]}`}
        >
          <Icon className="h-5 w-5" strokeWidth={2} />
        </div>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      </div>
      <div className="mt-5 text-5xl font-semibold tracking-tight tabular-nums text-neutral-50">
        {value}
      </div>
      <div className="mt-2 text-xs text-neutral-500">{hint}</div>
    </div>
  );
}

function SecondaryStatCard({
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
      className="flex items-center justify-between rounded-xl border border-neutral-800 p-4"
      style={{ backgroundColor: "#1A1A1A" }}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.4} />
        <div>
          <div className="text-[10.5px] font-semibold uppercase tracking-wider text-neutral-500">
            {label}
          </div>
          <div className="mt-0.5 text-[11px] text-neutral-500">{hint}</div>
        </div>
      </div>
      <div
        className={`text-2xl font-semibold tracking-tight tabular-nums ${valueClass}`}
      >
        {value}
      </div>
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
          <AddNewButton
            onAddBrand={onAddBrand}
            onAddCafe={onAddCafe}
          />
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
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
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
          {/* "Invite Brand Admin" menu item removed 2026-04-30 — the
              consolidated "Add New Brand" modal now creates the brand
              AND fires the invite in a single submit. The standalone
              InviteAdminModal remains in this file unrouted, available
              for a future per-row "Resend invite" action. */}
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
      <Icon className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.4} />
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
      className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
    />
  );
}

// Consolidated "Add New Brand" modal — collects brand name, admin name,
// admin email, and plan, then in a single submit:
//   1. POST /api/admin/platform/brands  (creates the brand row)
//   2. POST /api/admin/platform/invite-brand-admin  (mints 48h JWT, fires
//      welcome email via Resend)
// On success, shows the setup URL + copy button + "Email sent to ..."
// confirmation. Replaces the old two-step flow where the operator had to
// click "Add Brand" then separately click "Invite Brand Admin" and pick
// the just-created brand from a dropdown — that UX was nonsensical for
// brand-new onboarding (the dropdown is necessarily empty for new
// brands). The standalone InviteAdminModal stays in this file unrouted
// so it's available for a future per-row "Resend invite" action.
function AddBrandModal({
  onDismiss,
  onCreated,
}: {
  onDismiss: () => void;
  onCreated: () => void;
}) {
  const [brandName, setBrandName] = useState("");
  const [adminName, setAdminName] = useState("");
  const [email, setEmail] = useState("");
  const [scheme, setScheme] = useState<SchemeType>("private");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrandInviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit =
    brandName.trim().length > 0 &&
    email.trim().length > 0 &&
    email.includes("@");

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);

    // Split admin name on the last space — last word becomes last name,
    // everything before becomes first name. Single-word names land in
    // first only. Empty admin name is fine — owner_first/last get NULL.
    const trimmedName = adminName.trim();
    const lastSpace = trimmedName.lastIndexOf(" ");
    const firstName =
      lastSpace > 0 ? trimmedName.slice(0, lastSpace).trim() : trimmedName;
    const lastName = lastSpace > 0 ? trimmedName.slice(lastSpace + 1) : "";

    try {
      const brand = await createBrand({
        name: brandName.trim(),
        scheme_type: scheme,
        contact_email: email.trim().toLowerCase(),
        owner_first_name: firstName || undefined,
        owner_last_name: lastName || undefined,
      });

      // Brand row exists — fire the invite. If THIS step fails (e.g.
      // Resend transport hiccup), the brand stays in the DB and the
      // operator can use a future per-row "Resend invite" action; we
      // surface the partial-success state with a clear message rather
      // than rolling back the brand.
      try {
        const invite = await inviteBrandAdmin({
          email: email.trim().toLowerCase(),
          brand_id: brand.id,
        });
        setResult(invite);
      } catch (inviteErr) {
        setError(
          inviteErr instanceof Error
            ? `Brand created, but invite send failed: ${inviteErr.message}`
            : "Brand created, but invite send failed.",
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create brand.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.setup_url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Older browsers / non-https origins. Fall through silently.
    }
  };

  // ── Result state ──────────────────────────────────────────────────
  if (result) {
    return (
      <ModalShell
        title="Brand created · invite sent"
        onDismiss={() => {
          setResult(null);
          onCreated();
        }}
      >
        <div className="space-y-4 px-5 py-4">
          <div className="rounded-md border border-emerald-900/60 bg-emerald-950/30 px-3 py-2.5 text-[12px] text-emerald-300">
            <div className="flex items-start gap-2">
              <CheckCircle2
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                strokeWidth={2.4}
              />
              <div className="flex-1">
                <div className="font-semibold text-emerald-200">
                  Welcome email sent to {result.email}
                </div>
                <div className="mt-1 text-emerald-300/80">
                  Setup link expires{" "}
                  {new Date(result.expires_at).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                  .
                </div>
              </div>
            </div>
          </div>

          <div>
            <FieldLabel>Setup URL (copy if needed)</FieldLabel>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={result.setup_url}
                readOnly
                className="min-w-0 flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-neutral-300 outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                type="button"
                onClick={copy}
                className="shrink-0 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-[11px] font-semibold text-neutral-200 transition-colors hover:bg-neutral-800"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">
              The new admin will use this link to set their password and add
              their first café.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              onCreated();
            }}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
          >
            Done
          </button>
        </div>
      </ModalShell>
    );
  }

  // ── Form state ────────────────────────────────────────────────────
  return (
    <ModalShell
      title="Add new brand"
      onDismiss={busy ? () => undefined : onDismiss}
    >
      <div className="space-y-4 px-5 py-4">
        <div>
          <FieldLabel>Brand name</FieldLabel>
          <TextInput
            value={brandName}
            onChange={setBrandName}
            placeholder="e.g. Flat White Collective"
          />
        </div>
        <div>
          <FieldLabel>Admin name</FieldLabel>
          <TextInput
            value={adminName}
            onChange={setAdminName}
            placeholder="e.g. Jane Doe"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            Optional — pre-fills the owner's profile in their dashboard.
          </p>
        </div>
        <div>
          <FieldLabel>Admin email</FieldLabel>
          <TextInput
            value={email}
            onChange={setEmail}
            placeholder="owner@brand.co"
            type="email"
          />
          <p className="mt-1.5 text-[11px] text-neutral-500">
            We'll send a setup link to this address (valid for 48 hours).
          </p>
        </div>
        <div>
          <FieldLabel>Subscription plan</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            <SchemeChoice
              selected={scheme === "private"}
              onSelect={() => setScheme("private")}
              label="Private"
              hint="£5/mo per location"
            />
            <SchemeChoice
              selected={scheme === "global"}
              onSelect={() => setScheme("global")}
              label="LCP+ Global"
              hint="£7.99/mo per location"
            />
          </div>
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
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
          ) : null}
          Create brand & send invite
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
          ? "border-emerald-500/60 bg-emerald-500/10"
          : "border-neutral-800 bg-neutral-950 hover:border-neutral-700")
      }
    >
      <div
        className={
          "text-xs font-semibold " +
          (selected ? "text-emerald-300" : "text-neutral-100")
        }
      >
        {label}
      </div>
      <div className="mt-0.5 text-[10.5px] text-neutral-500">{hint}</div>
    </button>
  );
}

// Inline searchable autocomplete for the brand picker. Built without
// a 3rd-party combobox lib — keystroke-driven filter, ↑/↓ to move
// through results, Enter to pick, Esc to close. The input value
// shows the selected brand's name once chosen; clearing the input
// reopens the menu.
function BrandCombobox({
  brands,
  value,
  onChange,
}: {
  brands: { id: string; name: string }[];
  value: string;
  onChange: (brandId: string) => void;
}) {
  const selectedName = useMemo(
    () => brands.find((b) => b.id === value)?.name ?? "",
    [brands, value],
  );
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the visible text in sync if the parent picks a brand
  // programmatically (e.g. defaulting to brands[0]).
  useEffect(() => {
    setQuery(selectedName);
  }, [selectedName]);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    // Showing only the selected brand's name (no edit) shouldn't filter
    // the menu down to one — show everything when the input matches the
    // current selection exactly.
    if (!needle || needle === selectedName.toLowerCase()) return brands;
    return brands.filter((b) => b.name.toLowerCase().includes(needle));
  }, [brands, query, selectedName]);

  const pick = (brandId: string) => {
    onChange(brandId);
    const name = brands.find((b) => b.id === brandId)?.name ?? "";
    setQuery(name);
    setOpen(false);
    setActiveIdx(0);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && filtered[activeIdx]) {
        e.preventDefault();
        pick(filtered[activeIdx].id);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIdx(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder="Search brands…"
        aria-label="Brand"
        aria-autocomplete="list"
        aria-expanded={open}
        role="combobox"
        className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
      />
      {open && filtered.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-y-auto rounded-md border border-neutral-800 bg-neutral-900 shadow-lg"
        >
          {filtered.map((b, i) => {
            const active = i === activeIdx;
            const selected = b.id === value;
            return (
              <li
                key={b.id}
                role="option"
                aria-selected={selected}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={(e) => {
                  // mousedown (not click) so the input doesn't blur and
                  // close the menu before the pick lands.
                  e.preventDefault();
                  pick(b.id);
                }}
                className={
                  "cursor-pointer px-3 py-2 text-xs " +
                  (active
                    ? "bg-emerald-500/15 text-emerald-200"
                    : "text-neutral-200 hover:bg-neutral-800") +
                  (selected ? " font-semibold" : "")
                }
              >
                {b.name}
              </li>
            );
          })}
        </ul>
      ) : open && filtered.length === 0 ? (
        <div className="absolute left-0 right-0 z-20 mt-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-neutral-500 shadow-lg">
          No brands match "{query.trim()}"
        </div>
      ) : null}
    </div>
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
            <BrandCombobox
              brands={brands}
              value={brandId}
              onChange={setBrandId}
            />
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
          className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
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

// ─────────────────────────────────────────────────────────────────
// Invite Brand Admin — Super Admin → email + brand → setup_url
// ─────────────────────────────────────────────────────────────────

function InviteAdminModal({
  brands,
  onDismiss,
}: {
  brands: { id: string; name: string }[];
  onDismiss: () => void;
}) {
  const [email, setEmail] = useState("");
  const [brandId, setBrandId] = useState(brands[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BrandInviteResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const canSubmit =
    email.trim().length > 0 &&
    email.includes("@") &&
    brandId.length > 0 &&
    !busy;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await inviteBrandAdmin({
        email: email.trim().toLowerCase(),
        brand_id: brandId,
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to issue invite.");
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.setup_url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Older browsers / non-https origins. Fall through silently.
    }
  };

  return (
    <ModalShell
      title="Invite brand admin"
      onDismiss={busy ? () => undefined : onDismiss}
    >
      {result === null ? (
        <>
          <div className="space-y-4 px-5 py-4">
            <div>
              <FieldLabel>Brand</FieldLabel>
              {brands.length === 0 ? (
                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs text-neutral-500">
                  No brands on the platform yet — add a brand first.
                </div>
              ) : (
                <BrandCombobox
                  brands={brands}
                  value={brandId}
                  onChange={setBrandId}
                />
              )}
            </div>
            <div>
              <FieldLabel>Admin email</FieldLabel>
              <TextInput
                value={email}
                onChange={setEmail}
                placeholder="owner@brand.co"
                type="email"
              />
              <p className="mt-1.5 text-[11px] text-neutral-500">
                A signed 48-hour setup link is generated. Paste it into
                whatever email/chat you're using until SMTP delivery
                lands.
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
              disabled={!canSubmit}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
              ) : (
                <Mail className="h-3.5 w-3.5" strokeWidth={2.4} />
              )}
              Generate setup link
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-4 px-5 py-4">
            <div className="flex items-center gap-2 rounded-md border border-emerald-700/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4" strokeWidth={2.4} />
              Invite issued for{" "}
              <span className="font-semibold">{result.email}</span> — link
              expires{" "}
              {new Date(result.expires_at).toLocaleString("en-GB", {
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              .
            </div>
            <div>
              <FieldLabel>Setup URL</FieldLabel>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={result.setup_url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-[11px] text-neutral-100 outline-none"
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  }}
                />
                <button
                  type="button"
                  onClick={copy}
                  aria-label="Copy setup link"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-2 text-xs font-semibold text-neutral-200 transition-colors hover:border-neutral-700 hover:bg-neutral-800"
                >
                  {copied ? (
                    <>
                      <CheckCircle2
                        className="h-3.5 w-3.5 text-emerald-400"
                        strokeWidth={2.4}
                      />
                      Copied
                    </>
                  ) : (
                    <>
                      <ClipboardCopy className="h-3.5 w-3.5" strokeWidth={2.4} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">
                Brand: <span className="text-neutral-300">{result.brand_name}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-neutral-800 px-5 py-3">
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setEmail("");
              }}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-neutral-300 transition-colors hover:bg-neutral-800"
            >
              Issue another
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-neutral-950 transition-colors hover:bg-emerald-400"
            >
              Done
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
