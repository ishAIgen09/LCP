import { useEffect, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import {
  createPortalSession,
  humanizeError,
  requestPlanChange,
  type PlanTier,
} from "@/lib/api"
import { PlanChangeConfirmationDialog } from "@/components/PlanChangeConfirmationDialog"
import type { Brand } from "@/lib/mock"

type PlanRow = {
  id: PlanTier
  name: string
  // Per-location monthly price in pence so deltas stay integer until the
  // moment of display. £5.00 → 500, £7.99 → 799, £14.99 → 1499.
  pricePence: number
  blurb: string
  features: string[]
}

// Hardcoded tier table. Backend has no tier mapping yet — when it does,
// these stay in sync via a /api/billing/plans endpoint we'll add. The
// `id` strings are the wire format the backend logs; `name` is the
// brand-facing label.
const PLANS: PlanRow[] = [
  {
    id: "starter",
    name: "Private Plan",
    pricePence: 500,
    blurb: "Just your cafe. Just your customers.",
    features: [
      "Branded loyalty card on your customers' phones",
      "Limitless stamps and redemptions",
      "Stop paper card fraud instantly",
      "Track daily stamps and redemptions in real-time",
      "Dedicated per-location billing",
    ],
  },
  {
    id: "pro",
    name: "LCP+ Global Pass",
    pricePence: 799,
    blurb: "Get discovered by coffee lovers nearby.",
    features: [
      "Everything in the Private Plan, plus:",
      "Join the shared Local Perks loyalty network",
      "Use cross-cafe stamps across the entire network",
      "Customer earned perks across the network",
      "Enhanced in-app discovery to find new customers",
    ],
  },
]

function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

type ToastShape = { message: string; variant: "success" | "error" }

const STATUS_META: Record<
  Brand["subscriptionStatus"],
  { label: string; tint: string; icon: typeof CheckCircle2 }
> = {
  active: {
    label: "Active",
    tint: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: CheckCircle2,
  },
  trialing: {
    label: "Trialing",
    tint: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  past_due: {
    label: "Past due",
    tint: "border-rose-200 bg-rose-50 text-rose-700",
    icon: AlertTriangle,
  },
  canceled: {
    label: "Canceled",
    tint: "border-border bg-muted/50 text-muted-foreground",
    icon: AlertTriangle,
  },
  pending_cancellation: {
    label: "Cancelling",
    tint: "border-amber-200 bg-amber-50 text-amber-800",
    icon: AlertTriangle,
  },
}

// Lame Duck banner needs the bare date with no "Renews" prefix —
// the surrounding sentence supplies the framing ("scheduled to cancel
// on …"). Falls back to "the end of your current cycle" when Stripe
// hasn't reported a date yet (very rare — pending_cancellation always
// has a current_period_end), so the sentence still reads.
function formatLameDuckDate(iso: string | null | undefined): string {
  if (!iso) return "the end of your current cycle"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "the end of your current cycle"
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

function formatRenewal(iso: string | null | undefined): string {
  if (!iso) return "No renewal date on file."
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "No renewal date on file."
  return `Renews ${d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })}.`
}

export function BillingView({
  brand,
  token,
  cafeCount,
}: {
  brand: Brand
  token: string
  cafeCount: number
}) {
  const meta = STATUS_META[brand.subscriptionStatus]
  const StatusIcon = meta.icon
  const isActive = brand.subscriptionStatus === "active"

  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Plan-change flow state. The brand model doesn't carry a plan tier yet —
  // every brand starts on the Private Plan ("starter"). Held in local state
  // so a successful confirm flips the CURRENT pill + per-loc price + total
  // monthly cost across the whole tab in one render. When the backend
  // exposes brand.plan_tier, seed the initial value from there.
  const [currentPlan, setCurrentPlan] = useState<PlanTier>("starter")
  const currentPlanRow =
    PLANS.find((p) => p.id === currentPlan) ?? PLANS[0]
  const totalMonthlyPence = currentPlanRow.pricePence * cafeCount
  const [pending, setPending] = useState<PlanRow | null>(null)
  const [submittingPlan, setSubmittingPlan] = useState(false)
  const [toast, setToast] = useState<ToastShape | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-dismiss after 4s; cleared on unmount + when a new toast lands.
  useEffect(() => {
    if (!toast) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [toast])

  // Manage Payment Method & Invoices → Stripe Customer Portal. The exit
  // survey was previously chained on top of this button; that was a
  // miswiring (a brand updating their card shouldn't trigger a
  // cancellation flow). The survey now lives behind the dedicated
  // Cancel Subscription button in Settings → Account Management.
  const openPortal = async () => {
    if (opening) return
    setError(null)
    setOpening(true)
    try {
      const { checkout_url } = await createPortalSession(token)
      window.location.href = checkout_url
    } catch (e) {
      setError(humanizeError(e))
      setOpening(false)
    }
  }

  const confirmPlanChange = async () => {
    if (!pending || submittingPlan) return
    setSubmittingPlan(true)
    try {
      const deltaPerLocationPence =
        pending.pricePence - currentPlanRow.pricePence
      // Hits POST /api/billing/plan-change which calls
      // stripe.SubscriptionItem.modify(price=..., proration_behavior=
      // "create_prorations") on the brand's existing subscription. No
      // new Checkout Session is created — the proration co-terms onto
      // the next invoice naturally.
      await requestPlanChange(token, {
        from_plan: currentPlan,
        to_plan: pending.id,
        price_delta_pence_per_location: deltaPerLocationPence,
        cafe_count: cafeCount,
      })
      setCurrentPlan(pending.id)
      setPending(null)
      setSubmittingPlan(false)
      setToast({
        message: "Plan upgraded successfully!",
        variant: "success",
      })
    } catch (e) {
      setToast({
        message: humanizeError(e),
        variant: "error",
      })
      setSubmittingPlan(false)
    }
  }

  return (
    <div className="space-y-4">
    {/* Lame Duck banner — drives off `cancelAtPeriodEnd` (mirrored
        from Stripe via /api/billing/cancel-subscription + the
        customer.subscription.updated webhook). Sits above every other
        card so a brand owner cannot miss it on the next page load
        after they confirm cancellation. */}
    {brand.cancelAtPeriodEnd && (
      <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
          strokeWidth={2.25}
        />
        <div className="leading-snug">
          <span className="font-semibold">
            Your subscription is scheduled to cancel on{" "}
            {formatLameDuckDate(brand.currentPeriodEnd)}.
          </span>{" "}
          You will retain full access until then.
        </div>
      </div>
    )}
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Subscription</CardTitle>
          <CardDescription>
            Per-active-location billing — managed securely via Stripe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  Current plan
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">
                    {currentPlanRow.name}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    · {formatGBP(currentPlanRow.pricePence)} / month per location
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Billed for{" "}
                  <span className="font-medium text-foreground">
                    {cafeCount} location{cafeCount === 1 ? "" : "s"}
                  </span>
                  {" · "}
                  <span className="font-medium text-foreground">
                    {formatGBP(totalMonthlyPence)}/mo
                  </span>
                  {" · "}
                  {formatRenewal(brand.currentPeriodEnd)}
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  meta.tint,
                )}
              >
                <StatusIcon className="h-3 w-3" strokeWidth={2.5} /> {meta.label}
              </span>
            </div>
          </div>

          {!isActive && (
            <div className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 px-3.5 py-2.5 text-[12.5px] text-emerald-900">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <div>
                <div className="font-medium">Your brand isn't active yet.</div>
                <p className="text-[11.5px] leading-snug text-emerald-900/80">
                  Subscriptions start automatically when you add your first
                  location — head to the Locations tab and click Add Location
                  to begin.
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={openPortal}
              disabled={opening}
            >
              {opening ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                  Opening portal…
                </>
              ) : (
                <>
                  <ExternalLink className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Manage Payment Method & Invoices
                </>
              )}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            The Stripe Customer Portal lets you update cards, download past
            invoices, and cancel or pause the subscription.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Billing contact</CardTitle>
          <CardDescription>Where Stripe receipts are sent.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <div className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </div>
            <div className="mt-1 truncate text-[13px] font-medium text-foreground">
              {brand.contactEmail}
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Update the billing contact from the Settings tab.
          </p>
        </CardContent>
      </Card>
    </div>

    <Card>
      <CardHeader>
        <CardTitle className="text-[15px] tracking-tight">Choose your plan</CardTitle>
        <CardDescription>
          Change your plan instantly. Your new rate will be reflected on
          your next invoice. The Local Perks team will be automatically
          notified.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 pt-0 md:grid-cols-2">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const deltaPerLocationPence =
            plan.pricePence - currentPlanRow.pricePence
          // Show only the per-location delta on the button — softer
          // psychology than slapping the brand-wide total on the CTA.
          // The full multi-location math is still surfaced inside the
          // PlanChangeDialog receipt (per-loc × N locations) so nothing
          // is hidden, just sequenced.
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={isCurrent}
              deltaPerLocationPence={deltaPerLocationPence}
              onSelect={() => setPending(plan)}
            />
          )
        })}
      </CardContent>
    </Card>

    <PlanChangeConfirmationDialog
      open={pending !== null}
      onOpenChange={(v) => (!submittingPlan && !v ? setPending(null) : null)}
      fromPlan={PLANS.find((p) => p.id === currentPlan)!}
      toPlan={pending}
      cafeCount={cafeCount}
      submitting={submittingPlan}
      onConfirm={confirmPlanChange}
    />

    {toast ? <BillingToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

function PlanCard({
  plan,
  isCurrent,
  deltaPerLocationPence,
  onSelect,
}: {
  plan: PlanRow
  isCurrent: boolean
  // Per-location monthly delta in pence — the button label deliberately
  // shows the per-cafe figure, not the brand-wide total, so the CTA
  // doesn't trigger sticker shock on multi-location brands. The total
  // is still revealed inside the PlanChangeDialog receipt.
  deltaPerLocationPence: number
  onSelect: () => void
}) {
  const isUpgrade = deltaPerLocationPence > 0
  const isDowngrade = deltaPerLocationPence < 0
  const absDeltaLabel = formatGBP(Math.abs(deltaPerLocationPence))
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        isCurrent
          ? "border-primary/50 bg-primary/5"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {plan.name}
        </div>
        {isCurrent ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-primary">
            <Star className="h-2.5 w-2.5" strokeWidth={2.5} /> Current
          </span>
        ) : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {formatGBP(plan.pricePence)}
        </span>
        <span className="text-xs text-muted-foreground">/mo · per location</span>
      </div>
      <p className="text-[12px] text-muted-foreground">{plan.blurb}</p>
      <ul className="space-y-1 text-[12px] text-foreground">
        {plan.features.map((feat) => (
          <li key={feat} className="flex items-start gap-1.5">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-primary" strokeWidth={2.4} />
            {feat}
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-1">
        {isCurrent ? (
          <Button size="sm" variant="outline" className="w-full" disabled>
            On this plan
          </Button>
        ) : (
          <Button
            size="sm"
            className={cn(
              "w-full gap-1.5",
              isDowngrade && "bg-muted text-foreground hover:bg-muted/80",
            )}
            onClick={onSelect}
          >
            {isUpgrade ? <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.4} /> : null}
            {isUpgrade
              ? `Upgrade · +${absDeltaLabel}/mo per cafe`
              : isDowngrade
                ? `Downgrade · −${absDeltaLabel}/mo per cafe`
                : "Switch plan"}
          </Button>
        )}
      </div>
      <p className="text-[10.5px] leading-snug text-muted-foreground">
        Note: Prices currently do not include VAT. If Local Coffee Perks
        becomes VAT registered in the future, this amount will be adjusted
        accordingly.
      </p>
    </div>
  )
}

function BillingToast({
  toast,
  onDismiss,
}: {
  toast: ToastShape
  onDismiss: () => void
}) {
  const Icon = toast.variant === "success" ? CheckCircle2 : XCircle
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px] shadow-lg ring-1",
        toast.variant === "success" && "bg-emerald-600 text-white ring-emerald-700/40",
        toast.variant === "error" && "bg-rose-600 text-white ring-rose-700/40",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
      <div className="max-w-xs leading-snug">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-2 rounded text-white/80 transition-colors hover:text-white"
      >
        <XCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>
  )
}
