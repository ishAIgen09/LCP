import { ArrowRight, CheckCircle2, Coffee } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BillingSuccessView({
  onContinue,
  sessionId,
}: {
  onContinue: () => void
  sessionId: string | null
}) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 480px at 50% 0%, oklch(0.82 0.18 145 / 0.22), transparent 60%)",
        }}
      />

      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
            <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="text-left leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Local Coffee Perks</div>
            <div className="text-[11px] text-muted-foreground">For the regulars</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-emerald-500" />

          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/40">
            <CheckCircle2 className="h-7 w-7" strokeWidth={2.25} />
          </div>

          <h1 className="text-center font-heading text-[22px] font-semibold tracking-tight">
            You're subscribed
          </h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            Payment received. Your brand is active — customers can start earning stamps at every
            one of your cafes.
          </p>

          {sessionId && (
            <div className="mt-5 rounded-lg bg-muted/40 px-3 py-2 text-center">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Stripe session
              </div>
              <div className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {sessionId}
              </div>
            </div>
          )}

          <Button
            onClick={onContinue}
            size="lg"
            className="mt-6 h-11 w-full gap-2 text-[13.5px] font-medium"
          >
            Open dashboard
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </Button>
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          A receipt from Stripe is on its way to your billing contact email.
        </p>
      </div>
    </div>
  )
}
