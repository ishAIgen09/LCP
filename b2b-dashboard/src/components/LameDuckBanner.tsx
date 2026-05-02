import { useState } from "react"
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ApiError, humanizeError, reactivateSubscription } from "@/lib/api"
import type { Brand } from "@/lib/mock"

// Sticky, un-dismissible warning that follows the brand owner around
// every tab while their subscription is in the cancel-at-period-end
// grace window. Founder direction 2026-05-03: must be impossible to
// miss, ride above all main content, and offer a one-click recovery
// path so an accidental cancel doesn't bleed into a real churn.
//
// `onReactivated` is the parent's refresh hook (typically
// refreshAdminData → re-fetches /api/admin/me which clears the
// `cancelAtPeriodEnd` flag and removes this banner). `onError`
// surfaces a toast in the parent — the banner itself doesn't own
// any toaster state.
export function LameDuckBanner({
  brand,
  token,
  onReactivated,
  onError,
}: {
  brand: Brand
  token: string
  onReactivated: () => Promise<void> | void
  onError: (message: string) => void
}) {
  const [busy, setBusy] = useState(false)

  const formatted = formatBannerDate(brand.currentPeriodEnd)

  const handleReactivate = async () => {
    if (busy) return
    setBusy(true)
    try {
      await reactivateSubscription(token)
      // Hand control back to the parent — typical wiring is to
      // re-fetch /api/admin/me which clears cancelAtPeriodEnd and
      // unmounts this banner naturally on the next render.
      await onReactivated()
    } catch (e) {
      onError(humanizeError(e))
      // 409 from the backend means the grace window already elapsed
      // and Stripe deleted the subscription — at that point the
      // brand state will have flipped to `canceled` by the next
      // /me fetch and the InactiveSubscriptionView takes over.
      // Surface the message either way; the UI converges on the
      // next tick.
      if (e instanceof ApiError && e.status === 409) {
        await onReactivated()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      role="alert"
      // No close button by design — see comment above. `sticky` so
      // the banner pins to the top of the main scroll area as the
      // user navigates between tabs.
      className="sticky top-0 z-40 flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-100 px-4 py-2.5 text-[13px] text-amber-900 sm:px-6"
    >
      <AlertTriangle
        className="h-4 w-4 shrink-0 text-amber-700"
        strokeWidth={2.4}
      />
      <div className="min-w-0 flex-1 leading-snug">
        <span aria-hidden>⚠️</span>{" "}
        <span className="font-semibold">
          Your subscription will end on {formatted}.
        </span>{" "}
        You have full access until then.
      </div>
      <Button
        size="sm"
        onClick={handleReactivate}
        disabled={busy}
        className="h-8 gap-1.5 bg-amber-700 text-white hover:bg-amber-700/90"
      >
        {busy ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
            Reactivating…
          </>
        ) : (
          <>
            <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.4} />
            Reactivate Subscription
          </>
        )}
      </Button>
    </div>
  )
}

function formatBannerDate(iso: string | null | undefined): string {
  if (!iso) return "the end of your current cycle"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "the end of your current cycle"
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}
