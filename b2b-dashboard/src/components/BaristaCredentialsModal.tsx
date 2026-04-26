import { useEffect, useState, type FormEvent } from "react"
import {
  Check,
  ClipboardCopy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { humanizeError, resetCafePin } from "@/lib/api"
import type { Cafe } from "@/lib/mock"

// Public domain the brand owner reads aloud to the barista. Hard-coded
// here on purpose — the b2b dashboard runs in many places (localhost,
// staging, prod), but the barista handoff message ALWAYS points at the
// canonical production POS URL. If the production hostname ever moves,
// this is the single string to update.
const POS_URL = "dashboard.localcoffeeperks.com"

type Step = "set-pin" | "success"

export function BaristaCredentialsModal({
  cafe,
  token,
  onClose,
}: {
  cafe: Cafe | null
  token: string
  onClose: () => void
}) {
  const [step, setStep] = useState<Step>("set-pin")
  const [pin, setPin] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Whenever the modal is re-opened with a new cafe, snap state back
  // to the start of the flow. Otherwise an admin who creates a 2nd cafe
  // would see "success" before they'd set the new PIN.
  useEffect(() => {
    if (cafe) {
      setStep("set-pin")
      setPin("")
      setShowPin(false)
      setSubmitting(false)
      setError(null)
      setCopied(false)
    }
  }, [cafe?.id])

  if (!cafe) return null

  const storeId = cafe.storeNumber || ""
  const handoffMessage =
    `Here are the Barista POS login details for ${cafe.name}: ` +
    `URL: ${POS_URL} | Store ID: ${storeId} | Password: ${pin}`

  const validPin = /^\d{4,12}$/.test(pin)

  const handleSetPin = async (e: FormEvent) => {
    e.preventDefault()
    if (!validPin || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await resetCafePin(token, cafe.id, pin)
      setStep("success")
    } catch (err) {
      setError(humanizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(handoffMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2400)
    } catch {
      // Clipboard API unavailable (insecure context, ancient browser).
      // Surface the message in an error so the admin can copy it
      // manually from the on-screen preview block.
      setError(
        "Couldn't copy automatically — select the text in the preview box below and copy it manually.",
      )
    }
  }

  return (
    <Dialog
      open={true}
      onOpenChange={(v) => {
        if (!v && !submitting) onClose()
      }}
    >
      <DialogContent className="sm:max-w-[460px]">
        {step === "set-pin" ? (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/30">
                  <KeyRound className="h-4 w-4" strokeWidth={2.25} />
                </span>
                <DialogTitle className="text-[16px] tracking-tight">
                  Set Barista Login Details
                </DialogTitle>
              </div>
              <DialogDescription>
                Pick a 4–12 digit PIN your baristas will use to sign in
                at the till. You can rotate it anytime from the Locations
                tab — useful when staff change.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSetPin} className="space-y-4 pt-1">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-[12.5px]">
                <div className="font-semibold uppercase tracking-wider text-muted-foreground text-[10.5px]">
                  Location
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-mono font-semibold text-foreground">
                    Store {storeId || "—"}
                  </span>
                  <span className="text-muted-foreground">·</span>
                  <span className="font-medium text-foreground">{cafe.name}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="barista-pin"
                  className="block text-[12px] font-medium text-foreground"
                >
                  Barista PIN
                </label>
                <div className="relative">
                  <Input
                    id="barista-pin"
                    type={showPin ? "text" : "password"}
                    inputMode="numeric"
                    pattern="\d{4,12}"
                    autoComplete="new-password"
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 12))
                    }
                    placeholder="e.g. 4821"
                    className="h-11 pr-10 font-mono text-[15px] tracking-[0.4em]"
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin((s) => !s)}
                    aria-label={showPin ? "Hide PIN" : "Show PIN"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                    disabled={submitting}
                  >
                    {showPin ? (
                      <EyeOff className="h-4 w-4" strokeWidth={2} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={2} />
                    )}
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  4–12 digits. The PIN is stored as a bcrypt hash; we
                  never see the raw value once you set it.
                </p>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  {error}
                </div>
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={submitting}
                >
                  Skip for now
                </Button>
                <Button type="submit" disabled={!validPin || submitting} className="gap-1.5">
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                      Saving…
                    </>
                  ) : (
                    "Save PIN"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-primary/10 text-primary ring-1 ring-primary/30">
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                </span>
                <DialogTitle className="text-[16px] tracking-tight">
                  Barista PIN saved
                </DialogTitle>
              </div>
              <DialogDescription>
                Hand these credentials to your barista. They'll sign in
                once at the till; from then on the device stays signed in
                until you reset the PIN.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 pt-1">
              <div className="rounded-md border border-border bg-muted/30 p-3 text-[12.5px] leading-relaxed">
                {/* Render the handoff message verbatim so what the
                    admin sees on screen is exactly what lands in the
                    clipboard — no surprises. */}
                <code className="block whitespace-pre-wrap font-mono text-[12px] text-foreground">
                  {handoffMessage}
                </code>
              </div>

              {error ? (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  {error}
                </div>
              ) : null}

              <Button
                type="button"
                onClick={handleCopy}
                className="h-10 w-full gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    Copied to clipboard
                  </>
                ) : (
                  <>
                    <ClipboardCopy className="h-4 w-4" strokeWidth={2.25} />
                    Copy Login Details
                  </>
                )}
              </Button>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
