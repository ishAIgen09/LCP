import { useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { createPortalSession, humanizeError } from "@/lib/api"
import type { Brand } from "@/lib/mock"

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

  return (
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
                  Manage billing & invoices
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
  )
}
