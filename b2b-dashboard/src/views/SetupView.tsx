import { useEffect, useMemo, useState, type FormEvent } from "react"
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Coffee,
  CreditCard,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  MapPin,
  Sparkles,
  Store,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  adminSetup,
  createCafe,
  createCheckout,
  humanizeError,
} from "@/lib/api"
import { cn } from "@/lib/utils"
import type { Brand, Session } from "@/lib/mock"

type Step = 1 | 2 | 3

// Standalone /setup landing — three-step onboarding wizard for a brand-
// invited admin. Lifecycle:
//   Step 1 (Secure Account)  → POST /api/auth/admin/setup with the
//                              ?token= JWT + chosen password. On 200,
//                              hand the session up via onAuthenticated
//                              so App.tsx persists localStorage and the
//                              user is fully signed in.
//   Step 2 (Add Location)    → POST /api/admin/cafes (createCafe). Uses
//                              the session token from Step 1.
//   Step 3 (Payment)         → POST /api/billing/checkout (createCheckout)
//                              and assign window.location.href to the
//                              returned Stripe url.
export function SetupView({
  onAuthenticated,
}: {
  onAuthenticated: (s: Session, brand?: Brand) => void
}) {
  const inviteToken = useMemo(() => {
    if (typeof window === "undefined") return null
    const params = new URLSearchParams(window.location.search)
    return params.get("token")
  }, [])

  const [step, setStep] = useState<Step>(1)
  const [sessionToken, setSessionToken] = useState<string | null>(null)
  const [createdCafeName, setCreatedCafeName] = useState<string | null>(null)

  if (!inviteToken) {
    return <InvalidLinkScreen />
  }

  return (
    <Frame step={step}>
      {step === 1 && (
        <StepSecureAccount
          inviteToken={inviteToken}
          onComplete={(token) => {
            setSessionToken(token)
            setStep(2)
          }}
          onAuthenticated={onAuthenticated}
        />
      )}
      {step === 2 && sessionToken && (
        <StepAddLocation
          token={sessionToken}
          onComplete={(name) => {
            setCreatedCafeName(name)
            setStep(3)
          }}
        />
      )}
      {step === 3 && sessionToken && (
        <StepPayment token={sessionToken} cafeName={createdCafeName} />
      )}
    </Frame>
  )
}

// ─────────────────────────────────────────────────────────────────
// Frame + step indicator — the surrounding chrome stays mounted across
// all three steps so transitions stay smooth and the user keeps a
// stable visual anchor.
// ─────────────────────────────────────────────────────────────────

function Frame({ step, children }: { step: Step; children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 520px at 50% -10%, oklch(0.145 0 0 / 0.05), transparent 60%), radial-gradient(700px 500px at 100% 100%, oklch(0.145 0 0 / 0.04), transparent 60%)",
        }}
      />

      <div className="w-full max-w-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
              <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Local Coffee Perks</div>
              <div className="text-[11px] text-muted-foreground">For the regulars</div>
            </div>
          </div>
          <StepIndicator current={step} />
        </div>

        <StepShell>{children}</StepShell>

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          © 2026 Local Coffee Perks · Secure Onboarding
        </p>
      </div>
    </div>
  )
}

function StepShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-card p-7 ring-1 ring-foreground/10 transition-all">
      <div className="absolute inset-x-0 top-0 h-[2px] bg-primary" />
      {children}
    </div>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const labels: Record<Step, string> = {
    1: "Secure Account",
    2: "Add Location",
    3: "Payment",
  }
  return (
    <div className="flex items-center gap-3 text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
      {([1, 2, 3] as Step[]).map((n, i) => {
        const active = current === n
        const done = current > n
        return (
          <span key={n} className="flex items-center gap-3">
            <span
              className={cn(
                "flex items-center gap-2 transition-colors",
                active && "text-foreground",
                done && "text-primary",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-full text-[10px]",
                  done
                    ? "bg-primary text-primary-foreground"
                    : active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} /> : n}
              </span>
              {labels[n]}
            </span>
            {i < 2 && <span className="h-px w-6 bg-border" />}
          </span>
        )
      })}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Step 1 — Secure Account
// ─────────────────────────────────────────────────────────────────

function StepSecureAccount({
  inviteToken,
  onComplete,
  onAuthenticated,
}: {
  inviteToken: string
  onComplete: (sessionToken: string) => void
  onAuthenticated: (s: Session, brand?: Brand) => void
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const passwordValid = password.length >= 6
  const matches = password === confirm
  const valid = passwordValid && matches && confirm.length > 0
  const mismatch = confirm.length > 0 && !matches

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const { session, brand } = await adminSetup(inviteToken, password)
      // Hoist the session up FIRST so localStorage / global state is
      // populated before we leave this step. The wizard's later steps
      // still consume the token locally via onComplete to avoid relying
      // on an async setState round-trip.
      onAuthenticated(session, brand)
      onComplete(session.token)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          <Sparkles className="h-3 w-3" strokeWidth={2.4} />
          Welcome to Local Coffee Perks
        </span>
        <h1 className="font-heading text-[24px] font-semibold leading-tight tracking-tight">
          Let's get your café set up.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          Three quick steps and you're live. We'll start by securing your
          account with a password — you'll use this to sign in to your
          dashboard going forward.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="New password">
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.9}
            />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pl-9 pr-10"
              autoComplete="new-password"
              autoFocus
              disabled={submitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
              disabled={submitting}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>

        <Field label="Confirm password">
          <div className="relative">
            <LockKeyhole
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.9}
            />
            <Input
              type={showPassword ? "text" : "password"}
              placeholder="Re-type your password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="h-11 pl-9"
              autoComplete="new-password"
              disabled={submitting}
            />
          </div>
          {mismatch && (
            <p className="mt-1.5 text-[11.5px] text-destructive">Passwords don't match.</p>
          )}
        </Field>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full gap-2 text-[13.5px] font-medium"
          disabled={!valid || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              Securing your account…
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </>
          )}
        </Button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Step 2 — Add Location
// ─────────────────────────────────────────────────────────────────

function StepAddLocation({
  token,
  onComplete,
}: {
  token: string
  onComplete: (cafeName: string) => void
}) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const valid = name.trim().length > 1 && address.trim().length > 3

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!valid || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const cafe = await createCafe(token, {
        name: name.trim(),
        address: address.trim(),
      })
      onComplete(cafe.name)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          <Store className="h-3 w-3" strokeWidth={2.4} />
          Step 2 of 3
        </span>
        <h1 className="font-heading text-[24px] font-semibold leading-tight tracking-tight">
          Add your first location.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          This is the café customers will see in the app. You can add more
          locations and fine-tune amenities later from your dashboard.
        </p>
      </header>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Cafe name">
          <div className="relative">
            <Building2
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.9}
            />
            <Input
              placeholder="e.g. Halcyon Coffee — Shoreditch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 pl-9"
              autoFocus
              disabled={submitting}
            />
          </div>
        </Field>

        <Field label="Address">
          <div className="relative">
            <MapPin
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.9}
            />
            <Input
              placeholder="14 Rivington St, London EC2A 3DU"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-11 pl-9"
              autoComplete="street-address"
              disabled={submitting}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            One-line address — the consumer app uses this to power Get
            Directions.
          </p>
        </Field>

        {error && <ErrorBanner>{error}</ErrorBanner>}

        <Button
          type="submit"
          size="lg"
          className="h-11 w-full gap-2 text-[13.5px] font-medium"
          disabled={!valid || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              Adding location…
            </>
          ) : (
            <>
              Continue to Payment
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </>
          )}
        </Button>
      </form>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Step 3 — Payment
// ─────────────────────────────────────────────────────────────────

function StepPayment({
  token,
  cafeName,
}: {
  token: string
  cafeName: string | null
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Auto-trigger the redirect once on mount so the user doesn't have to
  // tap a button just to land on Stripe — the prior step's "Continue to
  // Payment" already telegraphed the intent. We still render the manual
  // "Continue to checkout" CTA below as a fallback if the redirect fails.
  const [autoRedirected, setAutoRedirected] = useState(false)

  const goToStripe = async () => {
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      const { checkout_url } = await createCheckout(token)
      window.location.href = checkout_url
      // We don't reset submitting here — the page is navigating away.
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  useEffect(() => {
    if (autoRedirected) return
    setAutoRedirected(true)
    void goToStripe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          <CreditCard className="h-3 w-3" strokeWidth={2.4} />
          Step 3 of 3
        </span>
        <h1 className="font-heading text-[24px] font-semibold leading-tight tracking-tight">
          One last step — secure payment.
        </h1>
        <p className="text-[13.5px] leading-relaxed text-muted-foreground">
          {cafeName ? (
            <>
              <span className="font-medium text-foreground">{cafeName}</span>{" "}
              is saved. We'll bill £5/month per location. Card details are
              handled by Stripe — we never see your number.
            </>
          ) : (
            <>
              We'll bill £5/month per location. Card details are handled by
              Stripe — we never see your number.
            </>
          )}
        </p>
      </header>

      <div className="rounded-md border border-emerald-200 bg-emerald-50/70 p-3.5">
        <div className="flex items-start gap-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" strokeWidth={2.25} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[12.5px] font-medium text-emerald-900">
              Account secured · Location saved
            </p>
            <p className="text-[11.5px] leading-snug text-emerald-900/85">
              You'll be redirected to Stripe Checkout to add your payment
              method. After payment, you'll land back in your dashboard.
            </p>
          </div>
        </div>
      </div>

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <Button
        type="button"
        size="lg"
        className="h-11 w-full gap-2 text-[13.5px] font-medium"
        disabled={submitting}
        onClick={goToStripe}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
            Redirecting to Stripe…
          </>
        ) : (
          <>
            Continue to checkout
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </>
        )}
      </Button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-foreground">{label}</span>
      {children}
    </label>
  )
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <span>{children}</span>
    </div>
  )
}

function InvalidLinkScreen() {
  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
              <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Local Coffee Perks</div>
              <div className="text-[11px] text-muted-foreground">For the regulars</div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-destructive" strokeWidth={2.25} />
          <h1 className="mt-3 font-heading text-[18px] font-semibold tracking-tight">
            This setup link is invalid
          </h1>
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
            We couldn't find an invitation token in this URL. Open the
            link from your invitation email exactly as it was sent — or
            ask your Local Coffee Perks contact to reissue it.
          </p>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="mt-5 h-11 w-full gap-2 text-[13.5px] font-medium"
            onClick={() => {
              if (typeof window !== "undefined") {
                window.history.replaceState({}, "", "/")
                window.location.reload()
              }
            }}
          >
            Back to sign in
          </Button>
        </div>
      </div>
    </div>
  )
}

export type { Step }