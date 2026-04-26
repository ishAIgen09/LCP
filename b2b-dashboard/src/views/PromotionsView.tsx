import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  Calendar,
  Clock,
  Loader2,
  MapPin,
  Megaphone,
  MessageSquareText,
  Pencil,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { EditOfferDialog } from "@/components/EditOfferDialog"
import {
  OfferLocationTargeting,
  type OfferLocationTargetingValue,
} from "@/components/OfferLocationTargeting"
import {
  createOffer,
  deleteOffer,
  humanizeError,
  listOffers,
} from "@/lib/api"
import type { Cafe } from "@/lib/mock"
import {
  OFFER_TARGETS,
  OFFER_TYPES,
  localDateTimeToISO,
  offerFromApi,
  type AmountKind,
  type Offer,
  type OfferTarget,
  type OfferType,
} from "@/lib/offers"

const LEAD_TIME_HOURS = 4
const LEAD_TIME_MS = LEAD_TIME_HOURS * 60 * 60 * 1000

export function PromotionsView({
  token,
  cafes,
}: {
  token: string
  cafes: Cafe[]
}) {
  // Form state
  const [type, setType] = useState<OfferType>("percent")
  const [target, setTarget] = useState<OfferTarget>("any_drink")
  const [amount, setAmount] = useState<string>("") // raw input, coerced to number on save
  const [startDate, setStartDate] = useState<string>(() => toDateInput(new Date()))
  const [startTime, setStartTime] = useState<string>("14:00")
  const [endDate, setEndDate] = useState<string>(() => toDateInput(new Date()))
  const [endTime, setEndTime] = useState<string>("16:00")
  // null = All Locations (default); string[] = Specific Locations selection.
  const [targetCafeIds, setTargetCafeIds] =
    useState<OfferLocationTargetingValue>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(true)

  const [offers, setOffers] = useState<Offer[]>([])
  const [editing, setEditing] = useState<Offer | null>(null)
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    listOffers(token)
      .then((rows) => {
        if (!cancelled) setOffers(rows.map(offerFromApi))
      })
      .catch((e) => {
        if (!cancelled) setError(humanizeError(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [token])

  const amountKind: AmountKind = useMemo(
    () => OFFER_TYPES.find((t) => t.id === type)!.amountKind,
    [type]
  )

  const resetForm = () => {
    const today = toDateInput(new Date())
    setType("percent")
    setTarget("any_drink")
    setAmount("")
    setStartDate(today)
    setStartTime("14:00")
    setEndDate(today)
    setEndTime("16:00")
    setTargetCafeIds(null)
  }

  const onCreate = async () => {
    setError(null)
    setSaved(false)

    if (amountKind !== "none") {
      const parsed = Number(amount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError(
          amountKind === "percent"
            ? "Enter a discount percentage greater than 0."
            : "Enter a price greater than 0."
        )
        return
      }
      if (amountKind === "percent" && parsed > 100) {
        setError("A percentage discount can't be greater than 100%.")
        return
      }
    }

    if (!startDate || !endDate) {
      setError("Pick a start and end date.")
      return
    }
    if (!startTime || !endTime) {
      setError("Pick a start and end time.")
      return
    }
    const startsIso = localDateTimeToISO(startDate, startTime)
    const endsIso = localDateTimeToISO(endDate, endTime)
    if (!startsIso || !endsIso) {
      setError("Invalid date or time.")
      return
    }
    if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      setError("The offer's end must be after its start.")
      return
    }
    // Specific-locations mode with zero boxes ticked is a user trap — block it
    // at the client since the backend will also coerce empty → NULL (= All),
    // which is the opposite of the user's visible intent.
    if (Array.isArray(targetCafeIds) && targetCafeIds.length === 0) {
      setError("Pick at least one location, or switch to All Locations.")
      return
    }

    setSubmitting(true)
    try {
      const created = await createOffer(token, {
        offer_type: type,
        target,
        amount: amountKind === "none" ? null : Number(amount),
        starts_at: startsIso,
        ends_at: endsIso,
        target_cafe_ids: targetCafeIds,
      })
      setOffers((prev) => [offerFromApi(created), ...prev])
      setSaved(true)
      resetForm()
    } catch (e) {
      setError(humanizeError(e))
    } finally {
      setSubmitting(false)
    }
  }

  const onDelete = async (id: string) => {
    setError(null)
    const previous = offers
    setOffers(previous.filter((o) => o.id !== id))
    try {
      await deleteOffer(token, id)
    } catch (e) {
      setOffers(previous)
      setError(humanizeError(e))
    }
  }

  // Live preview reflects the current form, not the saved list.
  const previewOffer = useMemo<Offer>(
    () => ({
      id: "preview",
      type,
      target,
      amount: amountKind === "none" ? null : Number(amount) || 0,
      startDate: startDate || toDateInput(new Date()),
      startTime: startTime || "00:00",
      endDate: endDate || startDate || toDateInput(new Date()),
      endTime: endTime || "00:00",
      targetCafeIds,
      createdAt: Date.now(),
    }),
    [type, target, amount, amountKind, startDate, startTime, endDate, endTime, targetCafeIds]
  )

  // Lead-time warning — soft, not blocking.
  const leadTimeTight = useMemo(() => {
    if (!startDate || !startTime) return false
    const start = parseLocalDateTime(startDate, startTime)
    if (!start) return false
    return start.getTime() - Date.now() < LEAD_TIME_MS
  }, [startDate, startTime])

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
        {/* ── FORM ────────────────────────────────────────────── */}
        <div className="space-y-5">
          <div className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-400/15 text-emerald-700 ring-1 ring-emerald-400/30">
                <Megaphone className="h-5 w-5" strokeWidth={2.25} />
              </div>
              <div className="leading-tight">
                <h2 className="font-heading text-[17px] font-semibold tracking-tight">
                  Schedule a new offer
                </h2>
                <p className="text-[12.5px] text-muted-foreground">
                  Three steps: pick the type, pick what it applies to, pick when it runs.
                </p>
              </div>
            </div>

            {/* STEP 1 */}
            <Step number={1} title="Offer type" icon={Tag}>
              <Select value={type} onValueChange={(v) => setType(v as OfferType)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFER_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {amountKind !== "none" && (
                <div className="mt-3 grid gap-1.5">
                  <label className="text-[12px] font-medium text-foreground">
                    {amountKind === "percent" ? "Discount percentage" : "Promo price (£)"}
                  </label>
                  <div className="relative">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={amountKind === "percent" ? 100 : undefined}
                      step={amountKind === "percent" ? 1 : 0.1}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={amountKind === "percent" ? "20" : "2.50"}
                      className="h-10 pr-8"
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                      {amountKind === "percent" ? "%" : "£"}
                    </span>
                  </div>
                </div>
              )}
            </Step>

            {/* STEP 2 */}
            <Step number={2} title="Applies to" icon={Sparkles}>
              <Select value={target} onValueChange={(v) => setTarget(v as OfferTarget)}>
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OFFER_TARGETS.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Step>

            {/* STEP 3 */}
            <Step number={3} title="When it runs" icon={Calendar}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-medium text-foreground">Start date</label>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-medium text-foreground">Start time</label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-medium text-foreground">End date</label>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10"
                  />
                </div>
                <div className="grid gap-1.5">
                  <label className="text-[12px] font-medium text-foreground">End time</label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-10"
                  />
                </div>
              </div>

              <p
                className={cn(
                  "mt-3 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] leading-snug",
                  leadTimeTight
                    ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                    : "bg-muted/50 text-muted-foreground"
                )}
              >
                <Clock className="h-3.5 w-3.5" strokeWidth={2} />
                ⏱️ Note: Offers must be scheduled at least {LEAD_TIME_HOURS} hours in advance to
                allow for network updates.
              </p>
            </Step>

            {/* STEP 4 */}
            <Step number={4} title="Participating locations" icon={MapPin}>
              <OfferLocationTargeting
                cafes={cafes}
                value={targetCafeIds}
                onChange={setTargetCafeIds}
                disabled={submitting}
              />
            </Step>

            {/* ERRORS / FEEDBACK */}
            {error && (
              <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12.5px] text-destructive">
                {error}
              </div>
            )}
            {saved && !error && (
              <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-800">
                Offer scheduled. It'll show up in the list below.
              </div>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <Button variant="outline" onClick={resetForm}>
                Reset
              </Button>
              <Button
                onClick={onCreate}
                disabled={submitting}
                className="gap-1.5"
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
                {submitting ? "Scheduling…" : "Schedule offer"}
              </Button>
            </div>
          </div>

          {/* ── BARISTA WARNING ──────────────────────────────── */}
          <div className="rounded-xl border border-red-300 bg-red-50 p-4 ring-1 ring-red-200">
            <div className="flex items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-red-500 text-white">
                <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
              </div>
              <div className="min-w-0 flex-1 leading-snug">
                <div className="text-[13px] font-semibold tracking-tight text-red-900">
                  🚨 IMPORTANT: Remember to inform your baristas and staff about this offer
                </div>
                <p className="mt-1 text-[12.5px] text-red-900/80">
                  The consumer app will advertise it, but the discount won't apply itself at the
                  till. Brief your team before the start time so they know to honor it.
                </p>
              </div>
            </div>
          </div>

          {/* ── SAVED OFFERS LIST ────────────────────────────── */}
          <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold tracking-tight">
                Scheduled offers
              </h3>
              <span className="text-[11.5px] text-muted-foreground">
                {offers.length} total
              </span>
            </div>
            {loading ? (
              <div className="flex items-center justify-center rounded-md bg-muted/40 px-3 py-6 text-[12.5px] text-muted-foreground">
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Loading offers…
              </div>
            ) : offers.length === 0 ? (
              <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-[12.5px] text-muted-foreground">
                Nothing scheduled yet. Fill in the form above to create your first offer.
              </p>
            ) : (
              <ul className="space-y-2">
                {offers.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium text-foreground">
                        {describeOffer(o)}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted-foreground">
                        <span>{formatOfferWindow(o)}</span>
                        <LocationScopeBadge
                          targetCafeIds={o.targetCafeIds}
                          totalCafes={cafes.length}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditing(o)}
                        className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDelete(o.id)}
                        className="h-8 gap-1.5 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* ── FEEDBACK ─────────────────────────────────────── */}
          <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <MessageSquareText
                className="mt-0.5 h-4 w-4 text-muted-foreground"
                strokeWidth={2}
              />
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                Don't see the exact offer type or item you want to run?{" "}
                <a
                  href="mailto:feedback@localcoffeeperks.app?subject=Offer%20type%20request"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Send us quick feedback
                </a>{" "}
                so we can add it to the list!
              </p>
            </div>
          </div>
        </div>

        {/* ── PREVIEW ─────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-20 lg:h-fit">
          <OfferPreview offer={previewOffer} />
        </div>
      </div>

      <EditOfferDialog
        open={editing !== null}
        onOpenChange={(v) => !v && setEditing(null)}
        token={token}
        offer={editing}
        cafes={cafes}
        onSaved={(updated) => {
          setOffers((prev) =>
            prev.map((o) => (o.id === updated.id ? updated : o)),
          )
          setEditing(null)
        }}
      />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Sub-components
// ──────────────────────────────────────────────────────────────

function Step({
  number,
  title,
  icon: Icon,
  children,
}: {
  number: number
  title: string
  icon: typeof Tag
  children: React.ReactNode
}) {
  return (
    <div className="mt-5">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background">
          {number}
        </span>
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}

function OfferPreview({ offer }: { offer: Offer }) {
  // Mirrors the consumer app's emerald-on-espresso palette so the admin sees
  // roughly what regulars will see in the app's Offers strip.
  const headline = offerHeadline(offer)
  const subhead = OFFER_TARGETS.find((t) => t.id === offer.target)?.label ?? ""
  return (
    <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Consumer preview
        </div>
        <span className="text-[11px] text-muted-foreground">Live</span>
      </div>

      <div
        className="overflow-hidden rounded-2xl p-5"
        style={{
          backgroundColor: "#15120F",
          border: "1px solid rgba(228,185,127,0.24)",
          boxShadow: "0 20px 40px -22px rgba(0,0,0,0.6)",
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: "rgba(228,185,127,0.14)",
              color: "#E4B97F",
              letterSpacing: "1.2px",
            }}
          >
            Limited time
          </span>
          <span className="text-[11px]" style={{ color: "#A8A29E" }}>
            {formatDateHuman(offer.startDate)}
            {offer.endDate && offer.endDate !== offer.startDate
              ? ` → ${formatDateHuman(offer.endDate)}`
              : ""}
          </span>
        </div>

        <div
          className="mt-3 font-semibold leading-tight"
          style={{ color: "#FAF7F2", fontSize: 22, letterSpacing: "-0.4px" }}
        >
          {headline}
        </div>

        <div className="mt-1 text-[13px]" style={{ color: "#A8A29E" }}>
          {subhead}
        </div>

        <div
          className="mt-4 flex items-center justify-between rounded-xl px-3 py-2.5"
          style={{
            backgroundColor: "#0B0908",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" strokeWidth={2} style={{ color: "#78716C" }} />
            <span className="font-mono text-[13px]" style={{ color: "#FAF7F2" }}>
              {offer.startTime} – {offer.endTime}
            </span>
          </div>
          <span
            className="text-[11px] font-semibold uppercase"
            style={{ color: "#4ADE80", letterSpacing: "1px" }}
          >
            Ready to claim
          </span>
        </div>

        <button
          type="button"
          disabled
          className="mt-4 h-10 w-full rounded-xl text-[13px] font-semibold"
          style={{ backgroundColor: "#E4B97F", color: "#0B0908", opacity: 0.9 }}
        >
          Show at the counter
        </button>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Preview only — styling approximation of the consumer app's Offers card. Final layout
        may vary by device.
      </p>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function parseLocalDateTime(date: string, time: string): Date | null {
  const [y, m, d] = date.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0)
}

function formatDateHuman(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  const dt = new Date(y, m - 1, d)
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  })
}

function offerHeadline(offer: Offer): string {
  const typeLabel = OFFER_TYPES.find((t) => t.id === offer.type)?.label ?? ""
  const targetLabel = OFFER_TARGETS.find((t) => t.id === offer.target)?.label ?? ""
  if (offer.type === "percent") {
    return `${offer.amount || 0}% off ${targetLabel}`
  }
  if (offer.type === "fixed") {
    return `${targetLabel} for £${(offer.amount || 0).toFixed(2)}`
  }
  if (offer.type === "bogo") {
    return `Buy one ${singularize(targetLabel)}, get one free`
  }
  if (offer.type === "double_stamps") {
    return `Double stamps on ${targetLabel}`
  }
  return typeLabel
}

function singularize(label: string): string {
  // Good-enough for the short list in OFFER_TARGETS.
  return label
    .replace(/^All\s+/i, "")
    .replace(/^Any\s+/i, "")
    .replace(/^Entire\s+/i, "")
    .replace(/\s+\/\s+.*$/, "")
    .toLowerCase()
}

function describeOffer(offer: Offer): string {
  return offerHeadline(offer)
}

function formatOfferWindow(o: Offer): string {
  const start = formatDateHuman(o.startDate)
  const end = formatDateHuman(o.endDate)
  const times = `${o.startTime}–${o.endTime}`
  if (o.startDate === o.endDate) return `${start} · ${times}`
  return `${start} ${o.startTime} → ${end} ${o.endTime}`
}

function LocationScopeBadge({
  targetCafeIds,
  totalCafes,
}: {
  targetCafeIds: string[] | null
  totalCafes: number
}) {
  const isAll = targetCafeIds === null
  const count = targetCafeIds?.length ?? totalCafes
  const label = isAll
    ? `All locations${totalCafes > 0 ? ` (${totalCafes})` : ""}`
    : `${count} location${count === 1 ? "" : "s"}`
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-medium",
        isAll
          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
          : "bg-sky-50 text-sky-800 ring-1 ring-sky-200",
      )}
    >
      <MapPin className="h-3 w-3" strokeWidth={2} />
      {label}
    </span>
  )
}
