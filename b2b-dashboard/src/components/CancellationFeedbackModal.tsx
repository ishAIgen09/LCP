import { useEffect, useState } from "react"
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react"

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
  postCancellationFeedback,
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

// Modal that intercepts the Stripe Customer Portal redirect (PRD §4.2).
// Caller owns the redirect itself — we POST the feedback survey and call
// `onSuccess` ONLY after the survey lands. If the API rejects the survey,
// the caller's redirect never fires, so the user can't sneak past.
//
// `token` is the brand admin JWT. `onSuccess` is what triggers the
// portal redirect (typically `await createPortalSession(token)` then
// `window.location.href = checkout_url`).
export function CancellationFeedbackModal({
  open,
  onOpenChange,
  token,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  token: string
  onSuccess: () => Promise<void> | void
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
      await postCancellationFeedback(token, {
        reason,
        // Send `null` rather than an empty string for non-other answers
        // so the server-side normalization doesn't have to second-guess
        // an "intentionally empty" value.
        details: detailsTrimmed.length > 0 ? detailsTrimmed : null,
        acknowledged,
      })
      // Survey landed — hand off to caller's portal-redirect path.
      // We close BEFORE awaiting onSuccess because typical redirects
      // tear the page down and any unmount-after-redirect leaves a
      // half-state.
      onOpenChange(false)
      await onSuccess()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't submit feedback. Try again.")
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-amber-500/10 text-amber-600 ring-1 ring-amber-500/30">
              <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <DialogTitle className="text-[16px] tracking-tight">
              Before you go — a quick word
            </DialogTitle>
          </div>
          <DialogDescription>
            We&apos;re here to help if anything&apos;s broken. Tell us why you&apos;re heading to
            billing, then we&apos;ll send you straight to the Stripe portal.
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
              billing cycle, and that cancellation must be confirmed inside the
              Stripe portal that opens next.
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
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                Continue to Stripe
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.25} />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
