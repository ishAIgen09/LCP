import { ArrowUpRight, Loader2, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type PlanChangeRow = {
  id: "starter" | "pro"
  name: string
  pricePence: number
}

function formatGBP(pence: number): string {
  const sign = pence < 0 ? "-" : ""
  return `${sign}£${(Math.abs(pence) / 100).toFixed(2)}`
}

// Mirror of app/billing.py::_compute_proration_pence — same rounding
// rule (half-up). Pass a TOTAL monthly delta in pence (per-loc delta ×
// cafe_count) so the returned figure is the all-locations charge.
function previewProration(
  monthlyTotalDeltaPence: number,
  now: Date = new Date(),
): { pence: number; daysRemaining: number; daysInMonth: number } {
  const year = now.getFullYear()
  const month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysRemaining = daysInMonth - now.getDate() + 1
  const numerator = Math.abs(monthlyTotalDeltaPence) * daysRemaining
  const prorationAbs = Math.floor(
    (numerator + Math.floor(daysInMonth / 2)) / daysInMonth,
  )
  const pence = monthlyTotalDeltaPence >= 0 ? prorationAbs : -prorationAbs
  return { pence, daysRemaining, daysInMonth }
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const

export function PlanChangeConfirmationDialog({
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
  fromPlan: PlanChangeRow
  toPlan: PlanChangeRow | null
  cafeCount: number
  submitting: boolean
  onConfirm: () => void
}) {
  if (!toPlan) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    )
  }

  const deltaPerLocation = toPlan.pricePence - fromPlan.pricePence
  const totalDelta = deltaPerLocation * cafeCount
  const isUpgrade = totalDelta > 0
  const isDowngrade = totalDelta < 0
  const action = isUpgrade ? "upgrade" : isDowngrade ? "downgrade" : "switch"

  const proration = previewProration(totalDelta)
  const newMonthlyTotal = toPlan.pricePence * cafeCount

  // Upgrade: next invoice = standard month + prorated fee for current
  // cycle remainder (Stripe charges proration_behavior=create_prorations).
  // Downgrade: revenue-protection policy 2026-05-04 — NO credit is
  // issued for the unused portion of the higher tier. Next invoice is
  // simply the standard new-month total at the lower rate. The receipt
  // section below renders very differently in the two cases.
  const nextInvoiceTotal = isDowngrade
    ? newMonthlyTotal
    : newMonthlyTotal + proration.pence

  const now = new Date()
  const currentMonthName = MONTH_NAMES[now.getMonth()]

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!submitting ? onOpenChange(v) : null)}
    >
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-md ring-1",
                isUpgrade
                  ? "bg-primary/10 text-primary ring-primary/30"
                  : "bg-muted text-muted-foreground ring-border",
              )}
            >
              {isUpgrade ? (
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.25} />
              ) : (
                <Sparkles className="h-4 w-4" strokeWidth={2.25} />
              )}
            </span>
            <DialogTitle className="text-[16px] tracking-tight">
              Confirm plan change
            </DialogTitle>
          </div>
          <DialogDescription>
            Switching {cafeCount} location{cafeCount === 1 ? "" : "s"} to the{" "}
            <span className="font-medium text-foreground">{toPlan.name}</span>.
            No payment is taken today — the breakdown below is what you&apos;ll
            see on your next invoice.
          </DialogDescription>
        </DialogHeader>

        {isDowngrade ? (
          // Downgrade copy is hardcoded by founder policy (2026-05-04).
          // No "prorated credit" row — the no-credit policy is the whole
          // point. Standard next-month total is still shown so the brand
          // sees exactly what they'll be billed.
          <div className="mt-2 space-y-3">
            <div className="rounded-lg border border-border bg-muted/30 px-4 py-3.5 text-[12.5px] leading-relaxed text-foreground">
              You will instantly leave the LCP+ Global network. Because
              you are exiting mid-cycle, no prorated credits are issued.
              Your next invoice will be your standard Private rate.
            </div>
            <div className="divide-y divide-border rounded-lg border border-border bg-muted/20">
              <ReceiptRow
                label="Total expected on your next billing date"
                value={`${formatGBP(nextInvoiceTotal)}`}
                valueClass="text-primary"
                hint={
                  cafeCount > 0
                    ? `${formatGBP(toPlan.pricePence)} × ${cafeCount} location${cafeCount === 1 ? "" : "s"} = ${formatGBP(newMonthlyTotal)}`
                    : "No active locations yet — total kicks in once you add your first cafe."
                }
                emphasis
              />
            </div>
          </div>
        ) : (
          // Upgrade / no-op: full three-line receipt as before.
          <div className="mt-2 divide-y divide-border rounded-lg border border-border bg-muted/20">
            <ReceiptRow
              label={`Prorated fee for the remainder of ${currentMonthName}`}
              value={
                totalDelta === 0
                  ? "£0.00"
                  : formatGBP(proration.pence)
              }
              valueClass={
                isUpgrade ? "text-foreground" : "text-muted-foreground"
              }
              hint={
                totalDelta === 0
                  ? undefined
                  : `${proration.daysRemaining} of ${proration.daysInMonth} days remaining${
                      cafeCount > 0
                        ? ` × ${cafeCount} location${cafeCount === 1 ? "" : "s"}`
                        : ""
                    }`
              }
            />
            <ReceiptRow
              label="Standard next month's total"
              value={`${formatGBP(newMonthlyTotal)}`}
              valueClass="text-foreground"
              hint={
                cafeCount > 0
                  ? `${formatGBP(toPlan.pricePence)} × ${cafeCount} location${cafeCount === 1 ? "" : "s"} = ${formatGBP(newMonthlyTotal)}`
                  : "No active locations yet — total kicks in once you add your first cafe."
              }
            />
            <ReceiptRow
              label="Total expected on your next billing date"
              value={`${formatGBP(nextInvoiceTotal)}`}
              valueClass="text-primary"
              emphasis
            />
          </div>
        )}

        <DialogFooter className="mt-2">
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
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  strokeWidth={2.25}
                />
                Updating plan…
              </>
            ) : (
              `Confirm ${action}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReceiptRow({
  label,
  value,
  valueClass,
  hint,
  emphasis = false,
}: {
  label: string
  value: string
  valueClass?: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className={cn("px-4 py-3.5", emphasis && "bg-primary/5")}>
      <div className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "mt-1.5 font-semibold tracking-tight",
          emphasis ? "text-[20px]" : "text-[18px]",
          valueClass ?? "text-foreground",
        )}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </div>
  )
}
