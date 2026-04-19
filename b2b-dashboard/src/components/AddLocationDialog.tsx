import { useState } from "react"
import { Loader2 } from "lucide-react"
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
import { humanizeError } from "@/lib/api"
import type { Brand } from "@/lib/mock"

export function AddLocationDialog({
  open,
  onOpenChange,
  brand,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand: Brand
  onSubmit: (values: { name: string; address: string }) => Promise<void>
}) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const valid = name.trim().length > 1 && address.trim().length > 3

  const reset = () => {
    setName("")
    setAddress("")
    setError(null)
    setSubmitting(false)
  }

  const submit = async () => {
    if (!valid || submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await onSubmit({ name: name.trim(), address: address.trim() })
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(humanizeError(e))
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (submitting) return
        if (!v) reset()
        onOpenChange(v)
      }}
    >
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-tight">Add a new location</DialogTitle>
          <DialogDescription>
            Register a new physical branch under{" "}
            <span className="font-medium text-foreground">{brand.name}</span>. It inherits your
            brand's subscription and{" "}
            <span className="font-medium text-foreground">
              {brand.schemeType === "global" ? "Global Indie Loop" : "Private Chain"}
            </span>{" "}
            loyalty scheme.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Branch name</label>
            <Input
              placeholder="e.g. Shoreditch"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10"
              autoFocus
              disabled={submitting}
            />
            <p className="text-[11px] text-muted-foreground">
              Stored as <span className="font-mono">{brand.name} — {name.trim() || "…"}</span>
            </p>
          </div>

          <div className="grid gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Address</label>
            <Input
              placeholder="14 Rivington St, London EC2A 3DU"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-10"
              disabled={submitting}
            />
          </div>

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
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button disabled={!valid || submitting} onClick={submit} className="gap-2">
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                Saving…
              </>
            ) : (
              "Add location"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
