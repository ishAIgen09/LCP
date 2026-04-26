import { useState, type FormEvent } from "react"
import {
  ArrowRight,
  CheckCircle2,
  Coffee,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { humanizeError, resetPassword } from "@/lib/api"

// Standalone landing page for /reset-password?token=XYZ. Mounted in
// App.tsx BEFORE the auth gate so a logged-out brand owner can use the
// reset link straight from their email — they don't need a stale
// session to set a new password. After success the view itself replaces
// the URL with "/" so the next render falls into the regular login
// flow with no token confusion.
export function ResetPasswordView({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const validShape = password.length >= 8 && password === confirm
  const mismatch = confirm.length > 0 && password !== confirm

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validShape || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(humanizeError(err))
    } finally {
      setSubmitting(false)
    }
  }

  const goBackToLogin = () => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/")
      window.location.reload()
    }
  }

  return (
    <div className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground">
              <Coffee className="h-[18px] w-[18px]" strokeWidth={2.25} />
            </div>
            <div className="text-left leading-tight">
              <div className="text-[15px] font-semibold tracking-tight">Local Coffee Perks</div>
              <div className="text-[11px] text-muted-foreground">For the regulars</div>
            </div>
          </div>
          <h1 className="font-heading text-[24px] font-semibold tracking-tight">
            {done ? "Password updated" : "Set a new password"}
          </h1>
        </div>

        {done ? (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-5 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" strokeWidth={2.25} />
            <p className="mt-3 text-[14px] font-medium text-foreground">
              Your password has been reset.
            </p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
              Sign in with your new password — the reset link is now
              spent and can't be reused.
            </p>
            <Button
              type="button"
              size="lg"
              className="mt-5 h-11 w-full gap-2 text-[13.5px] font-medium"
              onClick={goBackToLogin}
            >
              Continue to sign in
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 rounded-lg border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-[12px] text-foreground">
              <KeyRound className="h-3.5 w-3.5 text-primary" strokeWidth={2.4} />
              Pick a strong password — at least 8 characters.
            </div>

            <FieldLabel>New password</FieldLabel>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.9} />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11 pl-9 pr-10"
                autoComplete="new-password"
                disabled={submitting}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                disabled={submitting}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>

            <FieldLabel>Confirm password</FieldLabel>
            <div className="relative">
              <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.9} />
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 pl-9"
                autoComplete="new-password"
                disabled={submitting}
              />
            </div>
            {mismatch ? (
              <p className="text-[11.5px] text-destructive">Passwords don't match.</p>
            ) : null}

            {error ? (
              <p className="text-[12px] text-destructive">{error}</p>
            ) : null}

            <Button
              type="submit"
              size="lg"
              className="mt-2 h-11 w-full gap-2 text-[13.5px] font-medium"
              disabled={!validShape || submitting}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
              ) : (
                <>
                  Save new password
                  <ArrowRight className="h-4 w-4" strokeWidth={2.25} />
                </>
              )}
            </Button>
          </form>
        )}

        <p className="mt-8 text-center text-[11px] text-muted-foreground">
          © 2026 Local Coffee Perks · Secure Portal
        </p>
      </div>
    </div>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </label>
  )
}
