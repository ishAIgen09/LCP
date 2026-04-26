import { useState, type FormEvent, type ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import {
  ArrowLeft,
  ArrowRight,
  Coffee,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Store,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { adminLogin, forgotPassword, humanizeError, storeLogin } from "@/lib/api"
import type { Brand, Session } from "@/lib/mock"

type Mode = "select" | "admin" | "store"

type Accent = "emerald" | "violet"

const accentTint: Record<Accent, string> = {
  emerald: "bg-emerald-500/10 text-emerald-700",
  violet: "bg-violet-500/10 text-violet-700",
}

const accentBar: Record<Accent, string> = {
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
}

export function LoginView({
  onAuthenticated,
}: {
  onAuthenticated: (s: Session, brand?: Brand) => void
}) {
  const [mode, setMode] = useState<Mode>("select")

  const subtitle =
    mode === "select"
      ? "Choose how you'll sign in today. Admins manage the brand; stores run the barista POS."
      : mode === "admin"
        ? "Sign in to your brand's admin workspace."
        : "Sign in to your store's barista POS."

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(1100px 520px at 50% -10%, oklch(0.145 0 0 / 0.05), transparent 60%), radial-gradient(700px 500px at 100% 100%, oklch(0.145 0 0 / 0.035), transparent 60%)",
        }}
      />

      <div className="w-full max-w-3xl">
        <div className="mb-10 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
              <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Local Coffee Perks</div>
              <div className="text-[11px] text-muted-foreground">For the regulars</div>
            </div>
          </div>
          <h1 className="font-heading text-[26px] font-semibold tracking-tight">
            Welcome back
          </h1>
          <p className="mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        </div>

        {mode === "select" && <SelectMode onPick={setMode} />}

        {mode === "admin" && (
          <AdminForm onBack={() => setMode("select")} onAuthenticated={onAuthenticated} />
        )}

        {mode === "store" && (
          <StoreForm onBack={() => setMode("select")} onAuthenticated={onAuthenticated} />
        )}

        <p className="mt-10 text-center text-[11px] text-muted-foreground">
          © 2026 Local Coffee Perks · Secure Portal
        </p>
      </div>
    </div>
  )
}

function SelectMode({ onPick }: { onPick: (m: Mode) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <RoleCard
        icon={ShieldCheck}
        accent="emerald"
        title="Admin Login"
        tag="Brand owner"
        description="Manage locations, see scans across your network, edit your loyalty scheme, and handle billing."
        action="Continue as Admin"
        onPick={() => onPick("admin")}
      />
      <RoleCard
        icon={Store}
        accent="violet"
        title="Store Login"
        tag="Barista POS"
        description="Sign in at the counter to run the stamp scanner and redeem rewards for customers at a specific store."
        action="Continue as Store"
        onPick={() => onPick("store")}
      />
    </div>
  )
}

function RoleCard({
  icon: Icon,
  accent,
  title,
  tag,
  description,
  action,
  onPick,
}: {
  icon: LucideIcon
  accent: Accent
  title: string
  tag: string
  description: string
  action: string
  onPick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      className={cn(
        "group relative flex h-full flex-col items-start gap-5 overflow-hidden rounded-xl bg-card p-6 text-left ring-1 ring-foreground/10 transition-all",
        "hover:-translate-y-0.5 hover:ring-foreground/25",
        "hover:shadow-[0_18px_40px_-22px_oklch(0.145_0_0/0.35)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", accentBar[accent])} />

      <div className="flex w-full items-center justify-between">
        <div className={cn("grid h-11 w-11 place-items-center rounded-lg", accentTint[accent])}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          <span className={cn("h-1.5 w-1.5 rounded-full", accentBar[accent])} />
          {tag}
        </span>
      </div>

      <div>
        <div className="font-heading text-[17px] font-semibold tracking-tight text-foreground">
          {title}
        </div>
        <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>

      <div className="mt-auto flex w-full items-center justify-between pt-2 text-[13px] font-medium text-foreground">
        <span>{action}</span>
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          strokeWidth={2.25}
        />
      </div>
    </button>
  )
}

function AdminForm({
  onBack,
  onAuthenticated,
}: {
  onBack: () => void
  onAuthenticated: (s: Session, brand?: Brand) => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Forgot-password sub-flow state. Kept inline (vs. a separate view) so
  // owners don't lose context — they switch back and forth between
  // login + reset request without leaving the page.
  const [forgotMode, setForgotMode] = useState(false)
  const [forgotSubmitting, setForgotSubmitting] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotError, setForgotError] = useState<string | null>(null)

  const requestReset = async () => {
    if (!/.+@.+\..+/.test(email.trim())) {
      setForgotError("Enter the email tied to your brand admin account.")
      return
    }
    setForgotError(null)
    setForgotSubmitting(true)
    try {
      await forgotPassword(email.trim())
      setForgotSent(true)
    } catch (e) {
      setForgotError(humanizeError(e))
    } finally {
      setForgotSubmitting(false)
    }
  }

  const shapeValid = /.+@.+\..+/.test(email.trim()) && password.length >= 1

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!shapeValid || submitting) {
      if (!shapeValid) setError("Enter a valid email and a password.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const { session, brand } = await adminLogin(email.trim(), password)
      onAuthenticated(session, brand)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <FormShell onBack={onBack} onSubmit={submit}>
      <FormHeader
        accent="emerald"
        icon={ShieldCheck}
        title="Admin sign-in"
        description="Access your brand dashboard."
      />

      <FieldLabel>Email</FieldLabel>
      <FieldWithIcon icon={Mail}>
        <Input
          type="email"
          placeholder="owner@halcyoncoffee.co.uk"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 pl-9"
          autoComplete="email"
          autoFocus
          disabled={submitting}
        />
      </FieldWithIcon>

      <FieldLabel className="mt-4">Password</FieldLabel>
      <FieldWithIcon icon={LockKeyhole}>
        <Input
          type={showPassword ? "text" : "password"}
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-11 pl-9 pr-10"
          autoComplete="current-password"
          disabled={submitting}
        />
        <PasswordToggle
          show={showPassword}
          disabled={submitting}
          onToggle={() => setShowPassword((s) => !s)}
        />
      </FieldWithIcon>

      {error && <ErrorText>{error}</ErrorText>}

      <Button
        type="submit"
        size="lg"
        className="mt-6 h-11 w-full gap-2 text-[13.5px] font-medium"
        disabled={!shapeValid || submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <>
            Sign in to Admin
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </>
        )}
      </Button>

      {!forgotMode ? (
        <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
          Forgot your password?{" "}
          <button
            type="button"
            onClick={() => {
              setForgotMode(true)
              setForgotSent(false)
              setForgotError(null)
            }}
            className="font-medium text-primary underline-offset-4 hover:underline"
          >
            Reset it here
          </button>
        </p>
      ) : forgotSent ? (
        <div className="mt-5 rounded-md border border-primary/30 bg-primary/5 px-3.5 py-3 text-[12.5px] text-foreground">
          <p className="font-medium">Reset link sent.</p>
          <p className="mt-1 leading-snug text-muted-foreground">
            If <span className="font-mono">{email.trim()}</span> matches a
            brand on file, we've emailed a one-time reset link. Check your
            inbox (and spam) — it expires in 60 minutes.
          </p>
          <button
            type="button"
            onClick={() => setForgotMode(false)}
            className="mt-2 text-[11.5px] font-medium text-primary underline-offset-4 hover:underline"
          >
            ← Back to sign in
          </button>
        </div>
      ) : (
        <div className="mt-5 rounded-md border border-border bg-muted/30 px-3.5 py-3">
          <p className="text-[12.5px] font-medium text-foreground">
            Send a reset link to <span className="font-mono">{email.trim() || "your email"}</span>
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
            We'll email a one-time link valid for 60 minutes. If the email
            doesn't match a brand, you'll still see this confirmation.
          </p>
          {forgotError ? (
            <p className="mt-2 text-[11.5px] text-destructive">{forgotError}</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={requestReset}
              disabled={forgotSubmitting}
              className="gap-1.5"
            >
              {forgotSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                  Sending…
                </>
              ) : (
                "Send reset link"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setForgotMode(false)}
              disabled={forgotSubmitting}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </FormShell>
  )
}

function StoreForm({
  onBack,
  onAuthenticated,
}: {
  onBack: () => void
  onAuthenticated: (s: Session, brand?: Brand) => void
}) {
  const [storeNumber, setStoreNumber] = useState("")
  const [pin, setPin] = useState("")
  const [showPin, setShowPin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const validStore = /^[A-Z0-9]{3,10}$/.test(storeNumber.trim())
  const validPin = /^\d{4}$/.test(pin)
  const shapeValid = validStore && validPin

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!shapeValid || submitting) {
      if (!shapeValid)
        setError("Store ID must be 3–10 letters/digits and PIN must be 4 digits.")
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const session = await storeLogin(storeNumber.trim().toUpperCase(), pin)
      onAuthenticated(session)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <FormShell onBack={onBack} onSubmit={submit}>
      <FormHeader
        accent="violet"
        icon={Store}
        title="Store sign-in"
        description="Run the barista POS for this store."
      />

      <FieldLabel>Store ID</FieldLabel>
      <FieldWithIcon icon={Store}>
        <Input
          placeholder="001"
          value={storeNumber}
          onChange={(e) =>
            setStoreNumber(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
          }
          className="h-11 pl-9 font-mono tracking-[0.18em]"
          autoFocus
          maxLength={10}
          autoCapitalize="characters"
          disabled={submitting}
          inputMode="text"
        />
      </FieldWithIcon>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        The short ID on your till sticker — just the digits, no prefix.
      </p>

      <FieldLabel className="mt-4">4-digit PIN</FieldLabel>
      <FieldWithIcon icon={KeyRound}>
        <Input
          type={showPin ? "text" : "password"}
          inputMode="numeric"
          pattern="\d*"
          placeholder="• • • •"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="h-11 pl-9 pr-10 font-mono text-[15px] tracking-[0.4em]"
          maxLength={4}
          autoComplete="off"
          disabled={submitting}
        />
        <PasswordToggle
          show={showPin}
          disabled={submitting}
          onToggle={() => setShowPin((s) => !s)}
        />
      </FieldWithIcon>

      {error && <ErrorText>{error}</ErrorText>}

      <Button
        type="submit"
        size="lg"
        className="mt-6 h-11 w-full gap-2 text-[13.5px] font-medium"
        disabled={!shapeValid || submitting}
      >
        {submitting ? (
          <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
        ) : (
          <>
            Open barista POS
            <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
        Lost your PIN? Ask your brand admin to reset it.
      </p>
    </FormShell>
  )
}

function FormShell({
  onBack,
  onSubmit,
  children,
}: {
  onBack: () => void
  onSubmit: (e: FormEvent) => void
  children: ReactNode
}) {
  return (
    <div className="mx-auto w-full max-w-[420px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.25} />
        Back to selection
      </button>
      <form
        onSubmit={onSubmit}
        noValidate
        className="relative overflow-hidden rounded-xl bg-card p-6 ring-1 ring-foreground/10"
      >
        {children}
      </form>
    </div>
  )
}

function FormHeader({
  icon: Icon,
  title,
  description,
  accent,
}: {
  icon: LucideIcon
  title: string
  description: string
  accent: Accent
}) {
  return (
    <>
      <div className={cn("absolute inset-x-0 top-0 h-[2px]", accentBar[accent])} />
      <div className="mb-6 flex items-center gap-3">
        <div className={cn("grid h-10 w-10 place-items-center rounded-lg", accentTint[accent])}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>
        <div className="leading-tight">
          <div className="font-heading text-[15px] font-semibold tracking-tight">{title}</div>
          <div className="text-[12px] text-muted-foreground">{description}</div>
        </div>
      </div>
    </>
  )
}

function FieldLabel({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <label
      className={cn("mb-1.5 block text-[12px] font-medium text-foreground", className)}
    >
      {children}
    </label>
  )
}

function FieldWithIcon({
  icon: Icon,
  children,
}: {
  icon: LucideIcon
  children: ReactNode
}) {
  return (
    <div className="relative">
      <Icon
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        strokeWidth={2}
      />
      {children}
    </div>
  )
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
      {children}
    </div>
  )
}

function PasswordToggle({
  show,
  onToggle,
  disabled,
}: {
  show: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  const Icon = show ? EyeOff : Eye
  const label = show ? "Hide password" : "Show password"
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center",
        "rounded-md text-muted-foreground/70 transition-colors",
        "hover:bg-muted hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </button>
  )
}
