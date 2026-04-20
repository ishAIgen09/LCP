import { useEffect, useMemo, useState } from "react"
import { Calendar, Loader2, MapPin, Sparkles, Tag } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  OfferLocationTargeting,
  type OfferLocationTargetingValue,
} from "@/components/OfferLocationTargeting"
import { humanizeError, updateOffer } from "@/lib/api"
import type { Cafe } from "@/lib/mock"
import {
  OFFER_TARGETS,
  OFFER_TYPES,
  localDateTimeToISO,
  offerFromApi,
  type AmountKind,
  type Offer,
  type OfferTarget,
  type OfferType,
} from "@/lib/offers"

export function EditOfferDialog({
  open,
  onOpenChange,
  token,
  offer,
  cafes,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  token: string
  offer: Offer | null
  cafes: Cafe[]
  onSaved: (updated: Offer) => void
}) {
  const [type, setType] = useState<OfferType>("percent")
  const [target, setTarget] = useState<OfferTarget>("any_drink")
  const [amount, setAmount] = useState<string>("")
  const [startDate, setStartDate] = useState<string>("")
  const [startTime, setStartTime] = useState<string>("")
  const [endDate, setEndDate] = useState<string>("")
  const [endTime, setEndTime] = useState<string>("")
  const [targetCafeIds, setTargetCafeIds] =
    useState<OfferLocationTargetingValue>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !offer) return
    setType(offer.type)
    setTarget(offer.target)
    setAmount(offer.amount == null ? "" : String(offer.amount))
    setStartDate(offer.startDate)
    setStartTime(offer.startTime)
    setEndDate(offer.endDate)
    setEndTime(offer.endTime)
    setTargetCafeIds(offer.targetCafeIds)
    setError(null)
  }, [open, offer])

  const amountKind: AmountKind = useMemo(
    () => OFFER_TYPES.find((t) => t.id === type)!.amountKind,
    [type],
  )

  const onSave = async () => {
    if (!offer) return
    setError(null)

    if (amountKind !== "none") {
      const parsed = Number(amount)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError(
          amountKind === "percent"
            ? "Enter a discount percentage greater than 0."
            : "Enter a price greater than 0.",
        )
        return
      }
      if (amountKind === "percent" && parsed > 100) {
        setError("A percentage discount can't be greater than 100%.")
        return
      }
    }

    if (!startDate || !endDate || !startTime || !endTime) {
      setError("Pick a start and end date/time.")
      return
    }
    const startsIso = localDateTimeToISO(startDate, startTime)
    const endsIso = localDateTimeToISO(endDate, endTime)
    if (!startsIso || !endsIso) {
      setError("Invalid date or time.")
      return
    }
    if (new Date(endsIso).getTime() <= new Date(startsIso).getTime()) {
      setError("The offer's end must be after its start.")
      return
    }
    if (Array.isArray(targetCafeIds) && targetCafeIds.length === 0) {
      setError("Pick at least one location, or switch to All Locations.")
      return
    }

    setSaving(true)
    try {
      const updated = await updateOffer(token, offer.id, {
        offer_type: type,
        target,
        amount: amountKind === "none" ? null : Number(amount),
        starts_at: startsIso,
        ends_at: endsIso,
        target_cafe_ids: targetCafeIds,
      })
      onSaved(offerFromApi(updated))
      onOpenChange(false)
    } catch (e) {
      setError(humanizeError(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => (!saving ? onOpenChange(v) : null)}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-tight">
            Edit offer
          </DialogTitle>
          <DialogDescription>
            Update the offer type, target, or schedule window. Changes are live
            in the consumer Discover feed on next poll.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <Field icon={Tag} label="Offer type">
            <Select value={type} onValueChange={(v) => setType(v as OfferType)}>
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFER_TYPES.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {amountKind !== "none" && (
              <div className="mt-3 grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  {amountKind === "percent"
                    ? "Discount percentage"
                    : "Promo price (£)"}
                </label>
                <div className="relative">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={amountKind === "percent" ? 100 : undefined}
                    step={amountKind === "percent" ? 1 : 0.1}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder={amountKind === "percent" ? "20" : "2.50"}
                    className="h-10 pr-8"
                    disabled={saving}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">
                    {amountKind === "percent" ? "%" : "£"}
                  </span>
                </div>
              </div>
            )}
          </Field>

          <Field icon={Sparkles} label="Applies to">
            <Select
              value={target}
              onValueChange={(v) => setTarget(v as OfferTarget)}
            >
              <SelectTrigger className="h-10 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OFFER_TARGETS.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field icon={Calendar} label="When it runs">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  Start date
                </label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-10"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  Start time
                </label>
                <Input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="h-10"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  End date
                </label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-10"
                  disabled={saving}
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-[12px] font-medium text-foreground">
                  End time
                </label>
                <Input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="h-10"
                  disabled={saving}
                />
              </div>
            </div>
          </Field>

          <Field icon={MapPin} label="Participating locations">
            <OfferLocationTargeting
              cafes={cafes}
              value={targetCafeIds}
              onChange={setTargetCafeIds}
              disabled={saving}
            />
          </Field>

          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={onSave}
            disabled={saving || !offer}
            className="gap-1.5"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Tag
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2} />
        <span className="text-[13px] font-medium tracking-tight text-foreground">
          {label}
        </span>
      </div>
      {children}
    </div>
  )
}
