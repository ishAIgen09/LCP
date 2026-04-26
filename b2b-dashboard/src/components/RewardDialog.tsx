import { PartyPopper, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"

export function RewardDialog({
  open,
  tillCode,
  balance,
  redeeming,
  onRedeem,
  onSaveForLater,
}: {
  open: boolean
  tillCode: string
  balance: number
  redeeming: boolean
  onRedeem: () => void
  onSaveForLater: () => void
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="overflow-hidden p-0 sm:max-w-[420px]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[180px] bg-gradient-to-b from-emerald-300/50 via-emerald-100/30 to-transparent"
        />

        <div className="relative px-6 pt-8 pb-2 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-400/20 text-emerald-700 ring-1 ring-emerald-400/40">
            <PartyPopper className="h-6 w-6" strokeWidth={2.25} />
          </div>

          <span className="mx-auto mb-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-400/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            <Sparkles className="h-3 w-3" strokeWidth={2.25} />
            Reward ready
          </span>

          <DialogTitle className="font-heading text-[22px] font-semibold tracking-tight text-foreground">
            Free drink available!
          </DialogTitle>

          <DialogDescription className="mt-1.5 text-[13px] text-muted-foreground">
            Customer{" "}
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] font-semibold text-foreground">
              {tillCode || "—"}
            </span>{" "}
            hit the reward threshold.
          </DialogDescription>

          <div className="mt-6 flex items-center justify-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <div className="text-left">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Balance
              </div>
              <div className="font-mono text-[22px] font-semibold tabular-nums text-foreground">
                {balance}
                <span className="text-[14px] font-medium text-muted-foreground">/10</span>
              </div>
            </div>
            <div className="h-10 w-px bg-border" />
            <div className="flex-1 text-left">
              <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </div>
              <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-emerald-800">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Awaiting barista
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 px-6 pt-5 pb-6">
          <Button
            onClick={onRedeem}
            disabled={redeeming}
            className="h-11 w-full gap-2 text-[13.5px] font-semibold"
          >
            {redeeming ? "Redeeming…" : "Redeem reward now"}
          </Button>
          <Button
            variant="outline"
            onClick={onSaveForLater}
            disabled={redeeming}
            className="h-11 w-full text-[13.5px] font-medium"
          >
            Save for later
          </Button>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Scanner paused. Pick an action to continue.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
