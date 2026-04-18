import { useState } from "react"
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
import type { Brand, Cafe } from "@/lib/mock"

export function AddLocationDialog({
  open,
  onOpenChange,
  brand,
  onAdd,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  brand: Brand
  onAdd: (cafe: Cafe) => void
}) {
  const [name, setName] = useState("")
  const [address, setAddress] = useState("")

  const valid = name.trim().length > 1 && address.trim().length > 3

  const reset = () => {
    setName("")
    setAddress("")
  }

  const submit = () => {
    if (!valid) return
    onAdd({
      id: `c-${Math.random().toString(36).slice(2, 8)}`,
      name: `${brand.name} — ${name.trim()}`,
      address: address.trim(),
      scansThisMonth: 0,
      status: "live",
    })
    reset()
    onOpenChange(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
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
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={submit}>
            Add location
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
