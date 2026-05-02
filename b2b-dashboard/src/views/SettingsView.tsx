import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CheckCircle2,
  Coffee,
  Globe,
  HandHeart,
  Info,
  Loader2,
  Lock,
  UserRound,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { humanizeError } from "@/lib/api"
import type { Brand, Cafe, SchemeType } from "@/lib/mock"

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
  cafes,
  onSave,
  onToggleCafeSuspendedCoffee,
}: {
  brand: Brand
  cafes: Cafe[]
  onSave: (patch: Patch) => Promise<void>
  // Per-cafe Pay It Forward toggle. Caller (App.tsx) wraps updateCafe +
  // refreshes the cafes list. Resolves on success; rejects so the
  // toggle UI can roll back the optimistic flip + surface the error.
  onToggleCafeSuspendedCoffee: (cafeId: string, enabled: boolean) => Promise<void>
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

      <div className="space-y-4">
        {/* Community Board pinned to the top of the right column —
            owners told us this was the headline brand-positioning
            decision they wanted in their face when reviewing settings,
            so it sits above scheme/KYC. */}
        <CommunityBoardCard
          cafes={cafes}
          onToggle={onToggleCafeSuspendedCoffee}
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-[15px] tracking-tight">Loyalty scheme</CardTitle>
            <CardDescription>Switch between global and private.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0">
            <Select
              value={draftScheme}
              onValueChange={(v: SchemeType) => setDraftScheme(v)}
              disabled={saving}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">Global · Open Network</SelectItem>
                <SelectItem value="private">Private Chain</SelectItem>
              </SelectContent>
            </Select>

            <div
              className={cn(
                "rounded-lg border p-3.5",
                draftScheme === "global"
                  ? "border-emerald-200 bg-emerald-50/50"
                  : "border-violet-200 bg-violet-50/50",
              )}
            >
              <div className="flex items-center gap-2 text-[12.5px] font-semibold tracking-tight text-foreground">
                {draftScheme === "global" ? (
                  <>
                    <Globe className="h-3.5 w-3.5" strokeWidth={2.25} /> Global · Open Network
                  </>
                ) : (
                  <>
                    <Lock className="h-3.5 w-3.5" strokeWidth={2.25} /> Private · Walled Garden
                  </>
                )}
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-muted-foreground">
                {draftScheme === "global"
                  ? "Stamps pool across every Global cafe in the network. Higher discoverability, shared goodwill."
                  : "Stamps only pool across your own cafes. Fuller control of your loyalty economy."}
              </p>
            </div>

            {draftScheme !== brand.schemeType && (
              <p className="text-[11px] text-muted-foreground">
                Changing the scheme re-scopes every customer's stamp balance for this brand. Hit
                <span className="font-medium text-foreground"> Save changes </span>
                on the left to apply.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}


// ─────────────────────────────────────────────────────────────────
// Community Board / Suspended Coffee — per-cafe opt-in toggles
// (PRD §4.5 — Pay It Forward)
// ─────────────────────────────────────────────────────────────────

function CommunityBoardCard({
  cafes,
  onToggle,
}: {
  cafes: Cafe[]
  onToggle: (cafeId: string, enabled: boolean) => Promise<void>
}) {
  const [learnMoreOpen, setLearnMoreOpen] = useState(false)
  // Optimistic flip — local enabled state per cafe so the switch
  // animates immediately. Reverts on API error.
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const handleToggle = async (cafe: Cafe, next: boolean) => {
    setError(null)
    setPending((p) => new Set(p).add(cafe.id))
    try {
      await onToggle(cafe.id, next)
    } catch (e) {
      setError(humanizeError(e))
    } finally {
      setPending((p) => {
        const n = new Set(p)
        n.delete(cafe.id)
        return n
      })
    }
  }

  return (
    <>
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-[15px] tracking-tight">
                <HandHeart className="h-4 w-4 text-emerald-600" strokeWidth={2.25} />
                Community Board
              </CardTitle>
              <CardDescription className="mt-1">
                Accept "Suspended Coffee" donations from customers + your till. Per-cafe toggle —
                each location decides for itself.
              </CardDescription>
            </div>
            <button
              type="button"
              onClick={() => setLearnMoreOpen(true)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Learn more about Suspended Coffee"
              title="Learn more"
            >
              <Info className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2.5 pt-0">
          {cafes.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-muted/30 px-3 py-3 text-[12px] text-muted-foreground">
              Add your first location and the Pay It Forward toggle will appear here.
            </p>
          ) : (
            cafes.map((cafe) => {
              const busy = pending.has(cafe.id)
              const checked = cafe.suspendedCoffeeEnabled
              return (
                <label
                  key={cafe.id}
                  className="flex cursor-pointer items-center justify-between rounded-md border border-border bg-muted/20 px-3 py-2.5 transition-colors hover:bg-muted/40"
                >
                  <div className="min-w-0 flex-1 pr-3">
                    <div className="flex items-center gap-2">
                      <Coffee className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} />
                      <span className="truncate text-[13px] font-medium text-foreground">
                        {cafe.name}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
                      {cafe.address}
                    </p>
                  </div>
                  <span className="relative inline-flex items-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={busy}
                      onChange={(e) => handleToggle(cafe, e.target.checked)}
                      className="peer sr-only"
                    />
                    <span
                      className={cn(
                        "inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                        checked ? "bg-emerald-500" : "bg-neutral-300",
                        busy && "opacity-60",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                          checked ? "translate-x-[18px]" : "translate-x-0.5",
                        )}
                      />
                    </span>
                  </span>
                </label>
              )
            })
          )}
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <SuspendedCoffeeLearnMoreModal
        open={learnMoreOpen}
        onOpenChange={setLearnMoreOpen}
      />
    </>
  )
}


function SuspendedCoffeeLearnMoreModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/30">
              <HandHeart className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <DialogTitle className="text-[16px] tracking-tight">
              The Suspended Coffee tradition
            </DialogTitle>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="ml-auto grid h-7 w-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>
          <DialogDescription>
            <em>Caffè sospeso</em> — the century-old Italian habit of paying for a coffee you
            don&apos;t drink, so someone in need can claim it later. We&apos;ve digitised the ledger so
            it&apos;s a tap, not a paper-pad.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <Step
            num={1}
            title="Accept"
            body="A donation enters the pool either as a customer's loyalty-reward donation (right inside the Local Coffee Perks app) or as a till-paid donation a barista records on the POS."
          />
          <Step
            num={2}
            title="Record"
            body="Each donation increments the cafe's pool by one drink unit. Append-only ledger — your barista can scroll back through every donation + serve. Pool counts in coffees, never currency."
          />
          <Step
            num={3}
            title="Serve"
            body='When someone walks in and asks, your barista taps "Serve from pool" on the POS. Pool drops by one. No customer identity is ever recorded — anonymous claims, dignity preserved.'
          />
        </div>

        <p className="text-[11.5px] leading-snug text-muted-foreground">
          Toggle a cafe on and the Community Board badge starts showing on its consumer-app
          profile. You can toggle off at any time without losing historical donation data.
        </p>
      </DialogContent>
    </Dialog>
  )
}


function Step({
  num,
  title,
  body,
}: {
  num: number
  title: string
  body: string
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-500/30">
        {num}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold tracking-tight text-foreground">{title}</div>
        <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  )
}
