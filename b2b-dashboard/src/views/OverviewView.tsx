import { useEffect, useRef, useState } from "react"
import { Scan, Store, Sparkles, Gift, ArrowUpRight, MapPin, CalendarClock, Download, Loader2 } from "lucide-react"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { MetricCard } from "@/components/MetricCard"
import type { NavKey } from "@/components/Sidebar"
import type { Brand, Cafe } from "@/lib/mock"
import {
  downloadB2bReportCsv,
  getAdminMetrics,
  type ApiMetrics,
  type MetricsFilter,
  type MetricsRange,
} from "@/lib/api"

function formatNumber(n: number) {
  return n.toLocaleString("en-GB")
}

function computeDelta(current: number, prev: number | null | undefined): number | undefined {
  if (prev === null || prev === undefined || prev <= 0) return undefined
  const pct = ((current - prev) / prev) * 100
  return Math.round(pct * 10) / 10
}

function formatRenewalLabel(iso: string | null | undefined): string {
  if (!iso) return "No renewal date on file"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "No renewal date on file"
  return `Renews ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
}

type RangeOption = { id: MetricsRange; label: string; unit: string }
const RANGE_OPTIONS: RangeOption[] = [
  { id: "7d", label: "Last 7 Days", unit: "last 7 days" },
  { id: "30d", label: "Last 30 Days", unit: "last 30 days" },
  { id: "ytd", label: "Year to Date", unit: "year to date" },
  { id: "all", label: "All Time", unit: "all time" },
]

// Count-up animation for the KPI numbers. Ramps from the previous value
// to the target over ~500ms with requestAnimationFrame; first render
// snaps directly (no 0→N flash on initial mount).
function useCountUp(target: number, durationMs = 500): number {
  const [display, setDisplay] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number | null>(null)
  const mountedRef = useRef(false)

  useEffect(() => {
    if (!mountedRef.current) {
      // First paint — snap, don't animate.
      mountedRef.current = true
      prevRef.current = target
      setDisplay(target)
      return
    }
    const start = prevRef.current
    const delta = target - start
    if (delta === 0) return
    const startTs = performance.now()
    const step = (ts: number) => {
      const elapsed = ts - startTs
      const t = Math.min(1, elapsed / durationMs)
      // easeOutCubic — feels snappy without overshoot.
      const eased = 1 - Math.pow(1 - t, 3)
      const next = Math.round(start + delta * eased)
      setDisplay(next)
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        prevRef.current = target
      }
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [target, durationMs])

  return display
}

export function OverviewView({
  brand,
  cafes,
  metrics,
  token,
  onNavigate,
}: {
  brand: Brand
  cafes: Cafe[]
  // App-level metrics (always 30d / all-cafes). Feeds the "Top
  // performing branches" backdrop and the initial KPI render before the
  // filter-scoped refetch lands.
  metrics: ApiMetrics | null
  token: string
  onNavigate: (nav: NavKey) => void
}) {
  // Filter state owned locally — App-level metrics stays on 30d/all for
  // the bottom widget's stability, and this view refetches its own copy
  // whenever the user narrows the filter.
  const [filter, setFilter] = useState<MetricsFilter>({
    cafeId: "all",
    range: "30d",
  })
  const [filtered, setFiltered] = useState<ApiMetrics | null>(null)
  const [refetchError, setRefetchError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const handleDownloadReport = async () => {
    if (exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await downloadB2bReportCsv(token, filter.range ?? "30d")
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Download failed.")
    } finally {
      setExporting(false)
    }
  }

  // Refetch on filter change OR when the App-level metrics arrives
  // (which signals a fresh session). Always uses the current filter.
  useEffect(() => {
    let cancelled = false
    setRefetchError(null)
    getAdminMetrics(token, filter)
      .then((m) => {
        if (!cancelled) setFiltered(m)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setRefetchError(e instanceof Error ? e.message : "Failed to load metrics.")
      })
    return () => {
      cancelled = true
    }
  }, [token, filter, metrics])

  // Prefer the filter-scoped values when available. Before the first
  // filtered fetch lands we fall back to the App-level metrics (always
  // 30d/all) so the cards never flash empty on initial navigation.
  const activeMetrics = filtered ?? metrics
  const rangeOption =
    RANGE_OPTIONS.find((r) => r.id === (filter.range ?? "30d")) ?? RANGE_OPTIONS[1]
  const totalEarned = activeMetrics?.total_earned ?? activeMetrics?.total_scans_30d ?? 0
  const totalRedeemed = activeMetrics?.total_redeemed ?? 0
  const earnedPrev = activeMetrics?.prev_total_earned ?? null
  const earnedDelta = computeDelta(totalEarned, earnedPrev)

  const animatedEarned = useCountUp(totalEarned)
  const animatedRedeemed = useCountUp(totalRedeemed)

  // The "Top performing branches" card always shows the App-level 30d
  // roster regardless of the filter — the filter is for the KPIs only.
  const branchCount = cafes.length
  const recent = cafes
    .slice()
    .sort((a, b) => b.scansThisMonth - a.scansThisMonth)
    .slice(0, 4)

  const initialLoad = activeMetrics === null

  return (
    <div className="space-y-6">
      <FilterBar
        filter={filter}
        onFilterChange={setFilter}
        cafes={cafes}
        onDownloadReport={handleDownloadReport}
        downloading={exporting}
      />

      {refetchError ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {refetchError}
        </div>
      ) : null}

      {exportError ? (
        <div className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          Download failed: {exportError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total earned"
          value={initialLoad ? "—" : formatNumber(animatedEarned)}
          unit={rangeOption.unit}
          delta={earnedDelta}
          deltaLabel={
            filter.range === "ytd"
              ? "vs. last year YTD"
              : filter.range === "7d"
                ? "vs. prior 7 days"
                : filter.range === "30d"
                  ? "vs. prior 30 days"
                  : undefined
          }
          icon={Scan}
          accent="emerald"
        />
        <MetricCard
          label="Total redeemed"
          value={initialLoad ? "—" : formatNumber(animatedRedeemed)}
          unit="free coffees"
          icon={Gift}
          accent="amber"
        />
        <MetricCard
          label="Active branches"
          value={initialLoad ? "—" : String(branchCount)}
          unit={branchCount === 1 ? "location" : "locations"}
          icon={Store}
          accent="violet"
        />
        <MetricCard
          label="Current plan"
          value={brand.plan}
          unit={brand.planPrice}
          deltaLabel={formatRenewalLabel(brand.currentPeriodEnd ?? metrics?.renews_at)}
          icon={Sparkles}
          accent="amber"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-[15px] tracking-tight">Top performing branches</CardTitle>
              <CardDescription>Scans across the last 30 days.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => onNavigate("locations")}
            >
              View all
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            {recent.length === 0 ? (
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border text-[12.5px] text-muted-foreground">
                {cafes.length === 0
                  ? "No branches yet. Add your first location to start collecting scans."
                  : "No scans yet in the last 30 days."}
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((c) => {
                  const max = Math.max(1, ...recent.map((r) => r.scansThisMonth))
                  const pct = Math.round((c.scansThisMonth / max) * 100)
                  return (
                    <li key={c.id} className="flex items-center gap-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium tracking-tight text-foreground">
                          {c.name}
                        </div>
                        <div className="truncate text-[11.5px] text-muted-foreground">
                          {c.address}
                        </div>
                      </div>
                      <div className="hidden w-40 sm:block">
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-foreground"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="w-20 text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                        {formatNumber(c.scansThisMonth)}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <CardHeader>
            <CardTitle className="text-[15px] tracking-tight">Loyalty scheme</CardTitle>
            <CardDescription>
              {brand.schemeType === "global"
                ? "You're part of the shared Local Coffee Perks network."
                : "You're running a private walled-garden scheme."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <div className="rounded-lg border border-border bg-muted/30 p-3.5">
              <div className="flex items-center gap-2 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    brand.schemeType === "global" ? "bg-emerald-500" : "bg-violet-500"
                  }`}
                />
                {brand.schemeType === "global" ? "Global" : "Private"}
              </div>
              <div className="mt-1.5 text-[13.5px] leading-snug text-foreground">
                {brand.schemeType === "global"
                  ? "Customers can earn stamps at any cafe in the network. Great for discovery."
                  : "Stamps are locked to your own cafes. Best for established chains."}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function FilterBar({
  filter,
  onFilterChange,
  cafes,
  onDownloadReport,
  downloading,
}: {
  filter: MetricsFilter
  onFilterChange: (next: MetricsFilter) => void
  cafes: Cafe[]
  onDownloadReport: () => void
  downloading: boolean
}) {
  const cafeId = filter.cafeId ?? "all"
  const range = filter.range ?? "30d"
  return (
    // Sticky to the top of the scrollable <main>. The negative x/t
    // margins + full-width padding let the bar break out of the
    // max-w-6xl container so it covers the edges when scrolled.
    <div className="sticky -top-6 z-20 -mx-8 mb-2 border-b border-border bg-background/95 px-8 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <span>Filter</span>
        </div>
        <FilterDropdown
          Icon={MapPin}
          value={cafeId}
          onChange={(v) => onFilterChange({ ...filter, cafeId: v })}
          options={[
            { value: "all", label: "All Branches" },
            ...cafes.map((c) => ({ value: c.id, label: c.name })),
          ]}
          ariaLabel="Filter by location"
        />
        <FilterDropdown
          Icon={CalendarClock}
          value={range}
          onChange={(v) => onFilterChange({ ...filter, range: v as MetricsRange })}
          options={RANGE_OPTIONS.map((r) => ({ value: r.id, label: r.label }))}
          ariaLabel="Filter by date range"
        />
        {cafeId !== "all" || range !== "30d" ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => onFilterChange({ cafeId: "all", range: "30d" })}
          >
            Reset
          </Button>
        ) : null}
        <div className="ml-auto">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            onClick={onDownloadReport}
            disabled={downloading}
            title="Download the current range as a CSV"
          >
            {downloading ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" strokeWidth={2.2} />
            ) : (
              <Download className="mr-1 h-3.5 w-3.5" strokeWidth={2.2} />
            )}
            Download Data Report
          </Button>
        </div>
      </div>
    </div>
  )
}

function FilterDropdown({
  Icon,
  value,
  onChange,
  options,
  ariaLabel,
}: {
  Icon: typeof MapPin
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}) {
  return (
    <label className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-foreground/20">
      <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.2} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className="cursor-pointer bg-transparent pr-1 text-xs outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  )
}
