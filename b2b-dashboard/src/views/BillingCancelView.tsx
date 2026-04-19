import { ArrowLeft, CircleSlash, Coffee } from "lucide-react"
import { Button } from "@/components/ui/button"

export function BillingCancelView({
  onContinue,
}: {
  onContinue: () => void
}) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(900px 480px at 50% 0%, oklch(0.145 0 0 / 0.05), transparent 60%)",
        }}
      />

      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
            <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
          </div>
          <div className="text-left leading-tight">
            <div className="text-[15px] font-semibold tracking-tight">Indie Loop</div>
            <div className="text-[11px] text-muted-foreground">Business App</div>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl bg-card p-8 ring-1 ring-foreground/10">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-muted-foreground/40" />

          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground ring-1 ring-border">
            <CircleSlash className="h-7 w-7" strokeWidth={2} />
          </div>

          <h1 className="text-center font-heading text-[22px] font-semibold tracking-tight">
            Checkout canceled
          </h1>
          <p className="mt-2 text-center text-[13px] leading-relaxed text-muted-foreground">
            No charge was made. Your brand's subscription state is unchanged — you can start
            checkout again any time from the Billing tab.
          </p>

          <Button
            onClick={onContinue}
            size="lg"
            variant="outline"
            className="mt-6 h-11 w-full gap-2 text-[13.5px] font-medium"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2.25} />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  )
}
