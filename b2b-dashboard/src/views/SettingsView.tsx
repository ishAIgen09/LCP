import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Globe, Loader2, Lock } from "lucide-react"
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
}

export function SettingsView({
  brand,
  onSave,
}: {
  brand: Brand
  onSave: (patch: Patch) => Promise<void>
}) {
  const [draftName, setDraftName] = useState(brand.name)
  const [draftSlug, setDraftSlug] = useState(brand.slug)
  const [draftEmail, setDraftEmail] = useState(brand.contactEmail)
  const [draftScheme, setDraftScheme] = useState<SchemeType>(brand.schemeType)
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraftName(brand.name)
    setDraftSlug(brand.slug)
    setDraftEmail(brand.contactEmail)
    setDraftScheme(brand.schemeType)
  }, [brand])

  const patch = useMemo<Patch>(() => {
    const p: Patch = {}
    if (draftName.trim() !== brand.name) p.name = draftName.trim()
    if (draftSlug.trim() !== brand.slug) p.slug = draftSlug.trim()
    if (draftEmail.trim() !== brand.contactEmail) p.contact_email = draftEmail.trim()
    if (draftScheme !== brand.schemeType) p.scheme_type = draftScheme
    return p
  }, [brand, draftName, draftSlug, draftEmail, draftScheme])

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

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Brand profile</CardTitle>
          <CardDescription>These details appear across the customer app.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-0">
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Brand name</label>
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-10"
              disabled={status === "saving"}
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
                disabled={status === "saving"}
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
                disabled={status === "saving"}
                aria-invalid={draftEmail.length > 0 && !emailValid}
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}

          {status === "saved" && !error && (
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.25} />
              Saved.
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              onClick={discard}
              disabled={!dirty || status === "saving"}
            >
              Discard
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5"
              onClick={save}
              disabled={!canSave}
            >
              {status === "saving" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Loyalty scheme</CardTitle>
          <CardDescription>Switch between global and private.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Select
            value={draftScheme}
            onValueChange={(v: SchemeType) => setDraftScheme(v)}
            disabled={status === "saving"}
          >
            <SelectTrigger className="h-10 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="global">Global Indie Loop</SelectItem>
              <SelectItem value="private">Private Chain</SelectItem>
            </SelectContent>
          </Select>

          <div
            className={cn(
              "rounded-lg border p-3.5",
              draftScheme === "global"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-violet-200 bg-violet-50/50"
            )}
          >
            <div className="flex items-center gap-2 text-[12.5px] font-semibold tracking-tight text-foreground">
              {draftScheme === "global" ? (
                <>
                  <Globe className="h-3.5 w-3.5" strokeWidth={2.25} /> Global · Indie Loop
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
  )
}
