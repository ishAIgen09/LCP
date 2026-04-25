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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  createPortalSession,
  humanizeError,
  requestPlanChange,
  type PlanTier,
} from "@/lib/api"
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
// these stay in sync via a /api/billing/plans endpoint we'll add.
const PLANS: PlanRow[] = [
  {
    id: "starter",
    name: "Starter",
    pricePence: 500,
    blurb: "What every brand starts on today.",
    features: [
      "Unlimited stamps + redeems",
      "Per-location billing",
      "B2B dashboard + Barista POS",
      "Stripe Customer Portal",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    pricePence: 799,
    blurb: "For brands ready to push promotions.",
    features: [
      "Everything in Starter",
      "Targeted offers + scheduling",
      "Customer CRM + segments",
      "Priority email support",
    ],
  },
  {
    id: "premium",
    name: "Premium",
    pricePence: 1499,
    blurb: "Multi-location operators going hard.",
    features: [
      "Everything in Pro",
      "Custom branded consumer card",
      "Advanced analytics + CSV exports",
      "Dedicated onboarding manager",
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
    tint: "border-amber-200 bg-amber-50 text-amber-800",
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

  // Plan-change flow state. The brand model doesn't carry a plan tier
  // yet — every brand sits on Starter. When `currentPlan` becomes a
  // backend-driven field, swap the literal here for `brand.plan_tier`.
  const currentPlan: PlanTier = "starter"
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
    const fromPlan = PLANS.find((p) => p.id === currentPlan)
    if (!fromPlan) return
    const deltaPerLocation = pending.pricePence - fromPlan.pricePence
    setSubmittingPlan(true)
    try {
      const res = await requestPlanChange(token, {
        from_plan: currentPlan,
        to_plan: pending.id,
        price_delta_pence_per_location: deltaPerLocation,
        cafe_count: cafeCount,
      })
      // Mirror the audit-log id locally so support tickets can be
      // cross-referenced. Best-effort only — never breaks the UX.
      // eslint-disable-next-line no-console
      console.info("[plan-change] super-admin notified", res)
      setToast({
        message: `Plan change requested — Super Admin notified (${res.request_id}).`,
        variant: "success",
      })
      setPending(null)
    } catch (e) {
      setToast({
        message: humanizeError(e),
        variant: "error",
      })
    } finally {
      setSubmittingPlan(false)
    }
  }

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Subscription</CardTitle>
          <CardDescription>
            £5 / month per active location — managed securely via Stripe.
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
                    £5
                  </span>
                  <span className="text-sm text-muted-foreground">
                    / month · per active location
                  </span>
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  Billed for{" "}
                  <span className="font-medium text-foreground">
                    {cafeCount} location{cafeCount === 1 ? "" : "s"}
                  </span>
                  {" · "}
                  <span className="font-medium text-foreground">
                    £{(cafeCount * 5).toFixed(2)}/mo
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
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 text-[12.5px] text-amber-900">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
              <div>
                <div className="font-medium">Your brand isn't active yet.</div>
                <p className="text-[11.5px] leading-snug text-amber-900/80">
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
          Per-location pricing. Changing plan sends an audit-logged
          request to the Super Admin — no Stripe charge until they
          flip the switch on their end.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 pt-0 md:grid-cols-3">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan
          const fromPlan = PLANS.find((p) => p.id === currentPlan)!
          const deltaPence = plan.pricePence - fromPlan.pricePence
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              isCurrent={isCurrent}
              deltaPence={deltaPence}
              onSelect={() => setPending(plan)}
            />
          )
        })}
      </CardContent>
    </Card>

    <PlanChangeDialog
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
  deltaPence,
  onSelect,
}: {
  plan: PlanRow
  isCurrent: boolean
  deltaPence: number
  onSelect: () => void
}) {
  const isUpgrade = deltaPence > 0
  const isDowngrade = deltaPence < 0
  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4",
        isCurrent
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-border bg-muted/20",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          {plan.name}
        </div>
        {isCurrent ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">
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
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" strokeWidth={2.4} />
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
              ? `Upgrade · +${formatGBP(deltaPence)}/mo`
              : isDowngrade
                ? `Downgrade · ${formatGBP(deltaPence)}/mo`
                : "Switch plan"}
          </Button>
        )}
      </div>
    </div>
  )
}

function PlanChangeDialog({
  open,
  onOpenChange,
  fromPlan,
  toPlan,
  cafeCount,
  submitting,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  fromPlan: PlanRow
  toPlan: PlanRow | null
  cafeCount: number
  submitting: boolean
  onConfirm: () => void
}) {
  if (!toPlan) {
    // Render the Dialog with no body so close-animation still runs cleanly
    // when `pending` flips back to null.
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent /></Dialog>
  }
  const deltaPerLocation = toPlan.pricePence - fromPlan.pricePence
  const totalDelta = deltaPerLocation * cafeCount
  const isUpgrade = deltaPerLocation > 0
  const verb = isUpgrade ? "Upgrade" : deltaPerLocation < 0 ? "Downgrade" : "Switch"
  const sign = isUpgrade ? "+" : deltaPerLocation < 0 ? "−" : ""
  const absPerLoc = Math.abs(deltaPerLocation)
  const absTotal = Math.abs(totalDelta)

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md ring-1",
                isUpgrade
                  ? "bg-emerald-500/10 text-emerald-600 ring-emerald-500/30"
                  : "bg-amber-500/10 text-amber-700 ring-amber-500/30",
              )}
            >
              {isUpgrade ? (
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              )}
            </span>
            <DialogTitle className="text-[16px] tracking-tight">
              {verb} to {toPlan.name}?
            </DialogTitle>
          </div>
          <DialogDescription>
            You're moving from{" "}
            <span className="font-medium text-foreground">
              {fromPlan.name} ({formatGBP(fromPlan.pricePence)}/mo per location)
            </span>{" "}
            to{" "}
            <span className="font-medium text-foreground">
              {toPlan.name} ({formatGBP(toPlan.pricePence)}/mo per location)
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border bg-muted/40 p-3.5">
          <div className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
            Price change
          </div>
          <div className="mt-1.5 flex items-baseline gap-2">
            <span
              className={cn(
                "text-2xl font-semibold tracking-tight",
                isUpgrade ? "text-emerald-700" : deltaPerLocation < 0 ? "text-amber-700" : "text-foreground",
              )}
            >
              {sign}
              {formatGBP(absPerLoc)}
            </span>
            <span className="text-[12px] text-muted-foreground">/mo per location</span>
          </div>
          <div className="mt-2 text-[12px] text-muted-foreground">
            {cafeCount === 0 ? (
              <>No active locations on the brand yet — total monthly impact is £0.00 until your first location goes live.</>
            ) : (
              <>
                Across your{" "}
                <span className="font-medium text-foreground">
                  {cafeCount} location{cafeCount === 1 ? "" : "s"}
                </span>
                : {sign}
                <span className="font-medium text-foreground">{formatGBP(absTotal)}/mo</span>{" "}
                from next renewal.
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={submitting}
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} /> Submitting…
              </>
            ) : (
              `Confirm ${verb.toLowerCase()}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
