import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";

import { isAuthenticated, login } from "@/lib/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in? Skip straight to overview so refreshing /login
  // after auth doesn't strand the user on the form.
  if (isAuthenticated()) {
    return <Navigate to="/overview" replace />;
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const ok = login(email, password);
    setSubmitting(false);
    if (!ok) {
      setError("Those credentials don't match an admin account.");
      return;
    }
    navigate("/overview", { replace: true });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/30">
            <ShieldCheck className="h-6 w-6 text-emerald-400" strokeWidth={2.2} />
          </div>
          <div className="text-center">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
              LCP Admin
            </div>
            <div className="mt-1 text-xl font-semibold text-neutral-50">
              Command Center
            </div>
            <div className="mt-1 text-sm text-neutral-400">
              Sign in to manage the platform.
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6"
        >
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Email
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@localcoffeeperks.com"
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
              Password
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30"
            />
          </label>

          {error ? (
            <div className="rounded-md border border-red-900/60 bg-red-950/40 px-3 py-2 text-[12px] text-red-300">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-emerald-500 px-3 py-2 text-sm font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-neutral-500">
          Scaffold auth — hardcoded creds. Real JWT-backed login lands after
          the admin endpoint ships.
        </p>
      </div>
    </div>
  );
}
