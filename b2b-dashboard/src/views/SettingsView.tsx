import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Loader2,
  MessageSquare,
  Send,
  UserRound,
  XCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import {
  humanizeError,
  postProductFeedback,
} from "@/lib/api"
import { CancellationFeedbackModal } from "@/components/CancellationFeedbackModal"
import type { Brand, SchemeType } from "@/lib/mock"

const PRODUCT_FEEDBACK_MAX = 4000

type ToastShape = { message: string; variant: "success" | "error" }

type Patch = {
  name?: string
  slug?: string
  contact_email?: string
  scheme_type?: SchemeType
  owner_first_name?: string
  owner_last_name?: string
  owner_phone?: string
  company_legal_name?: string
  company_address?: string
  company_registration_number?: string
}

export function SettingsView({
  brand,
  token,
  onSave,
  onCancelSuccess,
}: {
  brand: Brand
  token: string
  onSave: (patch: Patch) => Promise<void>
  // Optional refresh hook fired AFTER a successful cancellation so the
  // BillingView Lame Duck banner picks up without a manual reload.
  // Wired from App.tsx → refreshAdminData.
  onCancelSuccess?: () => Promise<void>
}) {
  // Brand profile drafts
  const [draftName, setDraftName] = useState(brand.name)
  const [draftSlug, setDraftSlug] = useState(brand.slug)
  const [draftEmail, setDraftEmail] = useState(brand.contactEmail)
  const [draftScheme, setDraftScheme] = useState<SchemeType>(brand.schemeType)

  // KYC — Owner Details drafts
  const [draftOwnerFirst, setDraftOwnerFirst] = useState(brand.ownerFirstName ?? "")
  const [draftOwnerLast, setDraftOwnerLast] = useState(brand.ownerLastName ?? "")
  const [draftOwnerPhone, setDraftOwnerPhone] = useState(brand.ownerPhone ?? "")

  // KYC — Legal & Compliance drafts
  const [draftLegalName, setDraftLegalName] = useState(brand.companyLegalName ?? "")
  const [draftCompanyAddress, setDraftCompanyAddress] = useState(
    brand.companyAddress ?? "",
  )
  const [draftCRN, setDraftCRN] = useState(brand.companyRegistrationNumber ?? "")

  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraftName(brand.name)
    setDraftSlug(brand.slug)
    setDraftEmail(brand.contactEmail)
    setDraftScheme(brand.schemeType)
    setDraftOwnerFirst(brand.ownerFirstName ?? "")
    setDraftOwnerLast(brand.ownerLastName ?? "")
    setDraftOwnerPhone(brand.ownerPhone ?? "")
    setDraftLegalName(brand.companyLegalName ?? "")
    setDraftCompanyAddress(brand.companyAddress ?? "")
    setDraftCRN(brand.companyRegistrationNumber ?? "")
  }, [brand])

  const patch = useMemo<Patch>(() => {
    const p: Patch = {}
    if (draftName.trim() !== brand.name) p.name = draftName.trim()
    if (draftSlug.trim() !== brand.slug) p.slug = draftSlug.trim()
    if (draftEmail.trim() !== brand.contactEmail) p.contact_email = draftEmail.trim()
    if (draftScheme !== brand.schemeType) p.scheme_type = draftScheme

    // KYC — send the trimmed draft whenever it differs from the stored value
    // (treating null-from-API as empty-string). Backend coerces "" → NULL so
    // the admin can clear a previously-set field.
    const kycPairs: Array<[keyof Patch, string, string | null]> = [
      ["owner_first_name", draftOwnerFirst, brand.ownerFirstName],
      ["owner_last_name", draftOwnerLast, brand.ownerLastName],
      ["owner_phone", draftOwnerPhone, brand.ownerPhone],
      ["company_legal_name", draftLegalName, brand.companyLegalName],
      ["company_address", draftCompanyAddress, brand.companyAddress],
      ["company_registration_number", draftCRN, brand.companyRegistrationNumber],
    ]
    for (const [key, draft, stored] of kycPairs) {
      const trimmed = draft.trim()
      if (trimmed !== (stored ?? "")) {
        p[key] = trimmed as never
      }
    }
    return p
  }, [
    brand,
    draftName,
    draftSlug,
    draftEmail,
    draftScheme,
    draftOwnerFirst,
    draftOwnerLast,
    draftOwnerPhone,
    draftLegalName,
    draftCompanyAddress,
    draftCRN,
  ])

  const dirty = Object.keys(patch).length > 0
  const slugValid = /^[a-z0-9-]+$/.test(draftSlug.trim())
  const nameValid = draftName.trim().length > 0
  const emailValid = draftEmail.trim().length >= 3
  const shapeValid = slugValid && nameValid && emailValid
  const canSave = dirty && shapeValid && status !== "saving"

  const discard = () => {
    setDraftName(brand.name)
    setDraftSlug(brand.slug)
    setDraftEmail(brand.contactEmail)
    setDraftScheme(brand.schemeType)
    setDraftOwnerFirst(brand.ownerFirstName ?? "")
    setDraftOwnerLast(brand.ownerLastName ?? "")
    setDraftOwnerPhone(brand.ownerPhone ?? "")
    setDraftLegalName(brand.companyLegalName ?? "")
    setDraftCompanyAddress(brand.companyAddress ?? "")
    setDraftCRN(brand.companyRegistrationNumber ?? "")
    setError(null)
    setStatus("idle")
  }

  const save = async () => {
    if (!canSave) return
    setError(null)
    setStatus("saving")
    try {
      await onSave(patch)
      setStatus("saved")
      setTimeout(() => {
        setStatus((s) => (s === "saved" ? "idle" : s))
      }, 2000)
    } catch (e) {
      setError(humanizeError(e))
      setStatus("idle")
    }
  }

  const saving = status === "saving"

  // ─── Account Management — Cancel Subscription ──────────────────────
  // The exit survey was previously chained on top of the Manage Billing
  // button in BillingView; that was a miswiring (a brand updating their
  // card shouldn't trigger a cancellation flow). The intent surfaces
  // here, in the Danger Zone, where it semantically belongs.
  const [cancelOpen, setCancelOpen] = useState(false)

  // ─── Provide Feedback ──────────────────────────────────────────────
  const [feedbackBody, setFeedbackBody] = useState("")
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [toast, setToast] = useState<ToastShape | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!toast) return
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4000)
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [toast])

  const trimmedFeedback = feedbackBody.trim()
  const canSubmitFeedback =
    trimmedFeedback.length > 0 && !feedbackSubmitting

  const submitFeedback = async () => {
    if (!canSubmitFeedback) return
    setFeedbackSubmitting(true)
    try {
      await postProductFeedback(token, trimmedFeedback)
      setFeedbackBody("")
      setToast({
        message: "Thanks — your feedback is in. We read every single one.",
        variant: "success",
      })
    } catch (e) {
      setToast({ message: humanizeError(e), variant: "error" })
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  // After the modal commits the cancellation server-side (feedback +
  // cancel_at_period_end), surface the success toast and ask the
  // parent to refresh the brand row so the BillingView Lame Duck
  // banner picks up immediately. No Stripe portal redirect — that
  // path was removed 2026-05-03.
  const handleCancelSuccess = async () => {
    setToast({
      message:
        "Cancellation scheduled. You'll keep full access until the end of your current cycle.",
      variant: "success",
    })
    if (onCancelSuccess) {
      try {
        await onCancelSuccess()
      } catch {
        // Refresh failures are cosmetic — the next page load will
        // pick up the new state via getAdminMe.
      }
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        {/* Brand profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] tracking-tight">Brand profile</CardTitle>
            <CardDescription>
              These details appear across the customer app.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">Brand name</label>
              <Input
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="h-10"
                disabled={saving}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">Slug</label>
                <Input
                  value={draftSlug}
                  onChange={(e) =>
                    setDraftSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
                  }
                  className="h-10 font-mono text-sm"
                  disabled={saving}
                  aria-invalid={draftSlug.length > 0 && !slugValid}
                />
                <p className="text-[11px] text-muted-foreground">
                  Lowercase letters, numbers, hyphens.
                </p>
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">Contact email</label>
                <Input
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  className="h-10"
                  disabled={saving}
                  aria-invalid={draftEmail.length > 0 && !emailValid}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Owner Details (KYC) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] tracking-tight">
              <UserRound className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
              Owner Details
            </CardTitle>
            <CardDescription>
              The natural person Stripe will verify for KYC. Not shown publicly.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  First name
                </label>
                <Input
                  value={draftOwnerFirst}
                  onChange={(e) => setDraftOwnerFirst(e.target.value)}
                  className="h-10"
                  disabled={saving}
                  placeholder="Jane"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  Last name
                </label>
                <Input
                  value={draftOwnerLast}
                  onChange={(e) => setDraftOwnerLast(e.target.value)}
                  className="h-10"
                  disabled={saving}
                  placeholder="Okafor"
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Phone number
              </label>
              <Input
                type="tel"
                value={draftOwnerPhone}
                onChange={(e) => setDraftOwnerPhone(e.target.value)}
                className="h-10"
                disabled={saving}
                placeholder="+44 20 7946 0958"
                autoComplete="tel"
              />
            </div>
          </CardContent>
        </Card>

        {/* Legal & Compliance (KYC) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] tracking-tight">
              <Building2 className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
              Legal &amp; Compliance
            </CardTitle>
            <CardDescription>
              Used on invoices and for Stripe merchant verification.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 pt-0">
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Company legal name
              </label>
              <Input
                value={draftLegalName}
                onChange={(e) => setDraftLegalName(e.target.value)}
                className="h-10"
                disabled={saving}
                placeholder="Halcyon Coffee Co. Ltd"
              />
              <p className="text-[11px] text-muted-foreground">
                Exactly as registered with Companies House. Can differ from your
                brand name.
              </p>
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">
                Registered address
              </label>
              <Input
                value={draftCompanyAddress}
                onChange={(e) => setDraftCompanyAddress(e.target.value)}
                className="h-10"
                disabled={saving}
                placeholder="85 Great Portland St, London W1W 7LT"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">
                CRN / VAT number
              </label>
              <Input
                value={draftCRN}
                onChange={(e) => setDraftCRN(e.target.value.toUpperCase())}
                className="h-10 font-mono tracking-wider"
                disabled={saving}
                placeholder="12345678 or GB123456789"
              />
              <p className="text-[11px] text-muted-foreground">
                Either is fine — sole traders can leave this blank.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Shared action bar */}
        <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-border bg-card px-4 py-3">
          {error && (
            <div className="mr-auto rounded-md border border-destructive/30 bg-destructive/5 px-3 py-1.5 text-[12px] text-destructive">
              {error}
            </div>
          )}
          {status === "saved" && !error && (
            <div className="mr-auto flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[12px] text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Saved.
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={discard}
            disabled={!dirty || saving}
          >
            Discard
          </Button>
          <Button size="sm" className="h-9 gap-1.5" onClick={save} disabled={!canSave}>
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </div>

      </div>

      {/* Right column: Provide Feedback (founder-direction 2026-05-03,
          replacing the old Loyalty Scheme informational card — scheme
          is now locked at brand-creation time so the picker had become
          a vestigial surface). */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[15px] tracking-tight">
              <MessageSquare className="h-4 w-4 text-muted-foreground" strokeWidth={2.25} />
              Provide Feedback
            </CardTitle>
            <CardDescription>
              We are constantly evolving LCP and your feedback is absolutely
              valuable. If there is a feature you&apos;d love to see or
              something that would work better for you, we are all ears!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <textarea
              value={feedbackBody}
              onChange={(e) =>
                setFeedbackBody(e.target.value.slice(0, PRODUCT_FEEDBACK_MAX))
              }
              disabled={feedbackSubmitting}
              rows={6}
              placeholder="Tell us what would help — feature requests, friction points, anything that's nagging you."
              className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-[13.5px] leading-relaxed outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] text-muted-foreground">
                {feedbackBody.length}/{PRODUCT_FEEDBACK_MAX}
              </span>
              <Button
                size="sm"
                className="h-9 gap-1.5"
                onClick={submitFeedback}
                disabled={!canSubmitFeedback}
              >
                {feedbackSubmitting ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Submit feedback
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Management — Danger Zone. Lives at the very bottom
          of the page, full-width across both columns, so it reads as
          a deliberate "this is irreversible" surface rather than a
          row inside the regular form column. */}
      <Card className="border-destructive/30 lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[15px] tracking-tight text-destructive">
            <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
            Account Management
          </CardTitle>
          <CardDescription>
            Irreversible actions. Cancellation takes effect at the end
            of your current billing cycle.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">
                Cancel Subscription
              </div>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
                We&apos;ll ask one quick question, then schedule the
                cancellation for the end of your current cycle.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setCancelOpen(true)}
            >
              Cancel Subscription
            </Button>
          </div>
        </CardContent>
      </Card>

      <CancellationFeedbackModal
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        token={token}
        onSuccess={handleCancelSuccess}
      />

      {toast ? <SettingsToast toast={toast} onDismiss={() => setToast(null)} /> : null}
    </div>
  )
}

function SettingsToast({
  toast,
  onDismiss,
}: {
  toast: ToastShape
  onDismiss: () => void
}) {
  const Icon = toast.variant === "success" ? CheckCircle2 : XCircle
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-start gap-2.5 rounded-lg px-4 py-3 text-[13px] shadow-lg ring-1",
        toast.variant === "success" && "bg-emerald-600 text-white ring-emerald-700/40",
        toast.variant === "error" && "bg-rose-600 text-white ring-rose-700/40",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.4} />
      <div className="max-w-xs leading-snug">{toast.message}</div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-2 rounded text-white/80 transition-colors hover:text-white"
      >
        <XCircle className="h-3.5 w-3.5" strokeWidth={2.4} />
      </button>
    </div>
  )
}
