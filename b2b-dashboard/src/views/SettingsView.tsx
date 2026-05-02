import { useEffect, useMemo, useState } from "react"
import {
  Building2,
  CheckCircle2,
  Globe,
  Loader2,
  Lock,
  UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { Brand, SchemeType } from "@/lib/mock"

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
  onSave,
}: {
  brand: Brand
  onSave: (patch: Patch) => Promise<void>
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

      {/* Community Board / Suspended Coffee per-cafe toggle moved
          2026-05-02 into the Add Location + Edit Location dialogs so
          the opt-in is set when each location is configured (instead
          of a brand-level grid that became hard to scan as multi-cafe
          brands grew). The CommunityBoardCard component below is
          retained but no longer rendered — kept in case we ever want
          a brand-wide overview surface again. */}
      <div className="space-y-4">
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
