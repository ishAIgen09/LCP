import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Coffee, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

import { isAuthenticated, login } from "@/lib/auth";

// Espresso/Mint palette — locked to the brand tokens documented in
// INFRASTRUCTURE.md Section 8 / reference_brand_manifesto.md memory.
// We don't lean on Tailwind's `bg-emerald-*` here because the admin
// dashboard ships its own minimal Tailwind config; inline hex strings
// keep the page readable at a glance and immune to token drift.
const ESPRESSO = "#1A1412";
const ESPRESSO_RAISED = "#211915";
const MINT = "#00E576";
const MINT_PRESSED = "#00C865";
const MUTED = "#8A847C";
const TEXT_LIGHT = "#F5F1EA";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Skip straight to overview so refreshing /login
  // doesn't strand the user on the form.
  if (isAuthenticated()) {
    return <Navigate to="/overview" replace />;
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate("/overview", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
      setSubmitting(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-12"
      style={{
        background: `radial-gradient(1100px 520px at 50% -10%, rgba(0,229,118,0.06), transparent 60%), ${ESPRESSO}`,
        color: TEXT_LIGHT,
      }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center gap-4">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              backgroundColor: MINT,
              color: ESPRESSO,
            }}
          >
            <Coffee className="h-6 w-6" strokeWidth={2.25} />
          </div>
          <div className="text-center">
            <div
              className="text-[10.5px] font-semibold uppercase tracking-[0.24em]"
              style={{ color: MINT }}
            >
              Local Coffee Perks · Super Admin
            </div>
            <div
              className="mt-1.5 text-[22px] font-semibold leading-tight tracking-tight"
              style={{ color: TEXT_LIGHT }}
            >
              Command Center
            </div>
            <div
              className="mt-1.5 text-[13px]"
              style={{ color: MUTED }}
            >
              Sign in with your platform-staff credentials.
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl p-6"
          style={{
            backgroundColor: ESPRESSO_RAISED,
            border: "1px solid rgba(245,241,234,0.08)",
          }}
        >
          <label className="block">
            <span
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: MUTED }}
            >
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@localcoffeeperks.com"
              disabled={submitting}
              className="w-full rounded-md px-3 py-2.5 text-[13.5px] outline-none transition-colors"
              style={{
                backgroundColor: ESPRESSO,
                border: "1px solid rgba(245,241,234,0.10)",
                color: TEXT_LIGHT,
              }}
            />
          </label>

          <label className="block">
            <span
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: MUTED }}
            >
              Password
            </span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={submitting}
                className="w-full rounded-md px-3 py-2.5 pr-10 text-[13.5px] outline-none transition-colors"
                style={{
                  backgroundColor: ESPRESSO,
                  border: "1px solid rgba(245,241,234,0.10)",
                  color: TEXT_LIGHT,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                disabled={submitting}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md transition-colors"
                style={{ color: MUTED }}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </label>

          {error ? (
            <div
              className="rounded-md px-3 py-2 text-[12px]"
              style={{
                backgroundColor: "rgba(220,38,38,0.10)",
                border: "1px solid rgba(220,38,38,0.35)",
                color: "#fca5a5",
              }}
            >
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting || !email || !password}
            className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-[13.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              backgroundColor: MINT,
              color: ESPRESSO,
            }}
            onMouseDown={(e) => {
              if (!submitting) e.currentTarget.style.backgroundColor = MINT_PRESSED;
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.backgroundColor = MINT;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = MINT;
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                Signing in…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                Sign in
              </>
            )}
          </button>
        </form>

        <p
          className="mt-5 text-center text-[11px]"
          style={{ color: MUTED }}
        >
          Restricted access · Local Coffee Perks platform staff only.
        </p>
      </div>
    </div>
  );
}
