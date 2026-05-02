import { useEffect, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  cancelSubscription,
  humanizeError,
  postCancellationFeedback,
  type CancelSubscriptionResponse,
  type CancellationReason,
} from "@/lib/api"

// Mirrors the server-side allow-list at app/models.py::CANCELLATION_REASONS
// + the DB CHECK constraint in migration 0019. Order is the order the
// dropdown displays them; chosen so the most-actionable feedback (cost,
// friction) is at the top.
const CANCELLATION_REASONS: ReadonlyArray<{ id: CancellationReason; label: string }> = [
  { id: "free_drink_cost",   label: "Free drinks are too expensive for my margin" },
  { id: "barista_friction",  label: "Baristas find the till flow too clunky" },
  { id: "price_too_high",    label: "The monthly subscription is too high" },
  { id: "low_volume",        label: "Not enough customer volume to justify it" },
  { id: "feature_gap",       label: "Missing a feature I need" },
  { id: "closing_business",  label: "Closing or pausing the cafe" },
  { id: "other",             label: "Other (please describe below)" },
] as const

const DETAILS_MAX = 500

// Cancel-subscription survey + commit. Two-step API call inside one
// modal click:
//   1. POST /api/b2b/cancellation-feedback to capture WHY the brand is
//      leaving (founder direction — never let a churned brand get away
//      without a reason).
//   2. POST /api/billing/cancel-subscription to flip Stripe's
//      cancel_at_period_end flag + mirror it to the brand row.
//
// On success we hand the cancel-response back to the parent via
// `onSuccess` so the caller can toast + refresh the brand state to
// pick up the Lame Duck banner. The parent NEVER opens the Stripe
// portal — that path was intentionally removed (founder direction
// 2026-05-03; the modal previously redirected to portal which was
// confusing alongside the Settings → Account Management button).
//
// `token` is the brand admin JWT.
export function CancellationFeedbackModal({
  open,
  onOpenChange,
  token,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  token: string
  onSuccess: (result: CancelSubscriptionResponse) => Promise<void> | void
}) {
  const [reason, setReason] = useState<CancellationReason | null>(null)
  const [details, setDetails] = useState("")
  const [acknowledged, setAcknowledged] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state on open so a prior error / partial fill doesn't
  // bleed into the next session.
  useEffect(() => {
    if (open) {
      setReason(null)
      setDetails("")
      setAcknowledged(false)
      setError(null)
      setSubmitting(false)
    }
  }, [open])

  const requiresDetails = reason === "other"
  const detailsTrimmed = details.trim()

  const canSubmit =
    reason !== null &&
    acknowledged &&
    (!requiresDetails || detailsTrimmed.length > 0) &&
    !submitting

  const handleSubmit = async () => {
    if (!canSubmit || reason === null) return
    setSubmitting(true)
    setError(null)
    try {
      // 1. Capture the reason BEFORE flipping the subscription so a
      //    feedback-write failure aborts the cancel — we never want to
      //    lose a churn signal.
      await postCancellationFeedback(token, {
        reason,
        details: detailsTrimmed.length > 0 ? detailsTrimmed : null,
        acknowledged,
      })
      // 2. Schedule the Stripe cancel_at_period_end. Backend mirrors
      //    the flag + status to the brand row before the response so
      //    the parent's refresh picks up the Lame Duck banner state.
      const result = await cancelSubscription(token)
      // Close BEFORE awaiting onSuccess so the toast/refresh path the
      // parent runs doesn't race against the modal unmount.
      onOpenChange(false)
      await onSuccess(result)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-rose-500/10 text-rose-600 ring-1 ring-rose-500/30">
              <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <DialogTitle className="text-[16px] tracking-tight">
              We&apos;re sorry to see you go.
            </DialogTitle>
          </div>
          <DialogDescription>
            We are always striving to improve. Please let us know why
            you&apos;re leaving. Your account will remain fully active
            until the end of your current billing cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-[12px] font-medium text-foreground">
              Reason
            </label>
            <select
              value={reason ?? ""}
              onChange={(e) => {
                const v = e.target.value
                setReason(v === "" ? null : (v as CancellationReason))
              }}
              disabled={submitting}
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-[13.5px] outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" disabled>
                Pick the closest match…
              </option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {requiresDetails ? (
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-foreground">
                Tell us a bit more
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value.slice(0, DETAILS_MAX))}
                disabled={submitting}
                rows={3}
                placeholder="A sentence or two helps a lot — we read every single one."
                className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-[13.5px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Required when reason is &quot;Other&quot;.</span>
                <span>
                  {details.length}/{DETAILS_MAX}
                </span>
              </div>
            </div>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-[12.5px] leading-relaxed">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              disabled={submitting}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input text-foreground focus:ring-2 focus:ring-ring"
            />
            <span className="text-foreground">
              I understand my account stays active until the end of the current
              billing cycle, after which it will be cancelled.
            </span>
          </label>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          {/* Destructive button — this is the irreversible commit. The
              button styling explicitly leans rose so the brand owner
              can't mistake it for a soft "Continue" action. */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            variant="destructive"
            className="gap-1.5 bg-rose-600 text-white hover:bg-rose-600/90"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelling…
              </>
            ) : (
              "Confirm Cancellation"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
