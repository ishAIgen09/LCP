import { useState } from "react"
import { Coffee, Loader2, LockKeyhole, LogOut, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createCheckout, humanizeError } from "@/lib/api"
import type { Brand } from "@/lib/mock"

// Hard-wall lockout shown when brand.subscriptionStatus === 'canceled'
// — the grace period elapsed and Stripe deleted the subscription.
// Sidebar, Settings, POS, every other tab is gated; the user can
// only reactivate (which spins up a fresh Checkout session) or
// sign out.
//
// Distinct from the LameDuckBanner: that warns INSIDE the dashboard
// during the grace window. This replaces the dashboard once the
// subscription is fully terminal.
export function InactiveSubscriptionView({
  brand,
  token,
  onSignOut,
}: {
  brand: Brand
  token: string
  onSignOut: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The brand still has a stripe_customer_id from their original
  // subscription; createCheckout reuses it via brand.stripe_customer_id
  // server-side, so the new subscription lands on the same Stripe
  // customer record — invoice history stays continuous.
  //
  // Tier MUST be derived from brand.schemeType — defaulting to
  // "private" would silently downgrade a Global brand back to £5
  // (see project_stripe_tier_threading memory for the bug class).
  const handleReactivate = async () => {
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const tier: "private" | "global" =
        brand.schemeType === "global" ? "global" : "private"
      const { checkout_url } = await createCheckout(token, tier)
      // Full-page redirect into Stripe Checkout. The webhook on
      // checkout.session.completed will flip subscription_status
      // back to ACTIVE + cascade cafes.billing_status, at which
      // point a refresh of the dashboard exits this lockout.
      window.location.href = checkout_url
    } catch (e) {
      setError(humanizeError(e))
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
              <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">
                Local Coffee Perks
              </div>
              <div className="text-[11px] text-muted-foreground">
                For the regulars
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-7 shadow-sm">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600 ring-1 ring-rose-200">
            <LockKeyhole className="h-6 w-6" strokeWidth={2} />
          </div>

          <h1 className="text-center font-heading text-[22px] font-semibold tracking-tight">
            Your subscription has expired.
          </h1>
          <p className="mt-2 text-center text-[13.5px] leading-relaxed text-muted-foreground">
            All your loyalty data is safely stored, but your dashboard
            is currently locked.
          </p>

          {error ? (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mt-6 space-y-2.5">
            <Button
              size="lg"
              onClick={handleReactivate}
              disabled={busy}
              className="h-11 w-full gap-2 text-[13.5px] font-medium"
            >
              {busy ? (
                <>
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    strokeWidth={2.25}
                  />
                  Redirecting to Stripe…
                </>
              ) : (
                <>
                  <RotateCcw className="h-4 w-4" strokeWidth={2.25} />
                  Reactivate Subscription
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={onSignOut}
              disabled={busy}
              className="h-11 w-full gap-2 text-[13.5px] font-medium"
            >
              <LogOut className="h-4 w-4" strokeWidth={2.25} />
              Sign Out
            </Button>
          </div>

          <p className="mt-5 text-center text-[11px] text-muted-foreground">
            Reactivating starts a new monthly subscription on your{" "}
            <span className="font-medium text-foreground">
              {brand.schemeType === "global"
                ? "LCP+ Global Pass"
                : "Private Plan"}
            </span>{" "}
            tier. Your past invoice history stays linked to the same
            Stripe customer.
          </p>
        </div>
      </div>
    </div>
  )
}
