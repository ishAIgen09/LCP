import { useState, type FormEvent } from "react";
import {
  AlertCircle,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import {
  changeSuperAdminPassword,
  createSuperAdmin,
} from "@/lib/api";
import { toast } from "@/components/Toaster";

// Settings tab — super-admin team management. Two cards stacked:
//   1. Change Password — current/new/confirm, calls
//      POST /api/auth/super/change-password
//   2. Add Super Admin — email + temp password, calls
//      POST /api/auth/super/create
// Both routes are guarded server-side with Depends(get_super_admin_session);
// the JWT rides up automatically via getToken() in lib/api.ts.

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <header>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.22em] text-emerald-400">
          Super Admin · Settings
        </div>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-neutral-50">
          Team & Account
        </h1>
        <p className="mt-1.5 text-[13px] text-neutral-400">
          Rotate your password and bring co-founders onto the platform.
        </p>
      </header>

      <ChangePasswordCard />
      <AddSuperAdminCard />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Card 1 — Change Password
// ─────────────────────────────────────────────────────────────────

function ChangePasswordCard() {
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const newPwValid = newPw.length >= 8;
  const matches = newPw === confirmPw;
  const valid =
    currentPw.length > 0 && newPwValid && matches && confirmPw.length > 0;
  const mismatch = confirmPw.length > 0 && !matches;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await changeSuperAdminPassword({
        current_password: currentPw,
        new_password: newPw,
      });
      toast.success("Password updated. Use it next time you sign in.");
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't change password.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      icon={KeyRound}
      title="Change password"
      description="Rotate your sign-in credential. We verify the current password before applying the new one."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Current password">
          <PasswordInput
            value={currentPw}
            onChange={setCurrentPw}
            placeholder="Your current password"
            disabled={submitting}
            autoComplete="current-password"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password">
            <PasswordInput
              value={newPw}
              onChange={setNewPw}
              placeholder="At least 8 characters"
              disabled={submitting}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              value={confirmPw}
              onChange={setConfirmPw}
              placeholder="Re-type the new password"
              disabled={submitting}
              autoComplete="new-password"
            />
            {mismatch ? (
              <p className="mt-1.5 text-[11.5px] text-rose-400">
                Passwords don't match.
              </p>
            ) : null}
          </Field>
        </div>

        {error ? <ErrorBanner>{error}</ErrorBanner> : null}

        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={!valid || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                Updating…
              </>
            ) : (
              <>
                <ShieldCheck className="h-4 w-4" strokeWidth={2.25} />
                Update password
              </>
            )}
          </PrimaryButton>
        </div>
      </form>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────
// Card 2 — Add Super Admin
// ─────────────────────────────────────────────────────────────────

function AddSuperAdminCard() {
  const [email, setEmail] = useState("");
  const [tempPassword, setTempPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid =
    email.trim().length > 3 &&
    email.includes("@") &&
    tempPassword.length >= 8;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valid || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const profile = await createSuperAdmin({
        email: email.trim().toLowerCase(),
        password: tempPassword,
      });
      toast.success(
        `${profile.email} can now sign in. Share the temporary password securely.`,
      );
      setEmail("");
      setTempPassword("");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Couldn't create super admin.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard
      icon={UserPlus}
      title="Add super admin"
      description="Grant another teammate full platform access. Hand them the temporary password over a secure channel; they'll rotate it on first sign-in."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
                strokeWidth={1.9}
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cofounder@localcoffeeperks.com"
                disabled={submitting}
                autoComplete="off"
                className="w-full rounded-md border border-neutral-800 bg-neutral-950 py-2.5 pl-9 pr-3 text-[13.5px] text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          </Field>
          <Field label="Temporary password">
            <PasswordInput
              value={tempPassword}
              onChange={setTempPassword}
              placeholder="At least 8 characters"
              disabled={submitting}
              autoComplete="new-password"
            />
          </Field>
        </div>

        {error ? <ErrorBanner>{error}</ErrorBanner> : null}

        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={!valid || submitting}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.25} />
                Adding…
              </>
            ) : (
              <>
                <UserPlus className="h-4 w-4" strokeWidth={2.25} />
                Add super admin
              </>
            )}
          </PrimaryButton>
        </div>
      </form>
    </SectionCard>
  );
}

// ─────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────

type IconType = typeof KeyRound;

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: IconType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
      <header className="mb-5 flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-500/15 ring-1 ring-emerald-500/30">
          <Icon className="h-4 w-4 text-emerald-400" strokeWidth={2.25} />
        </div>
        <div className="flex-1">
          <h2 className="text-[15px] font-semibold tracking-tight text-neutral-50">
            {title}
          </h2>
          <p className="mt-1 text-[12.5px] leading-relaxed text-neutral-400">
            {description}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <Lock
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500"
        strokeWidth={1.9}
      />
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        className="w-full rounded-md border border-neutral-800 bg-neutral-950 py-2.5 pl-9 pr-3 text-[13.5px] text-neutral-100 placeholder-neutral-600 outline-none transition-colors focus:border-emerald-500/60 focus:ring-1 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded-md bg-emerald-500 px-4 py-2 text-[13px] font-semibold text-neutral-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-[12px] text-rose-300">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
      <span>{children}</span>
    </div>
  );
}
