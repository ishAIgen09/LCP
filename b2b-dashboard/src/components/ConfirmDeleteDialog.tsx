import { useState, useEffect } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

// Generic "are you sure?" modal. Keeps the caller free of UI plumbing —
// the caller owns the delete request itself and just resolves / rejects the
// returned promise from `onConfirm`. Errors bubble up so the caller can toast.
export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  onConfirm,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  onConfirm: () => Promise<void> | void
}) {
  const [working, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local state whenever the dialog opens so a prior error doesn't
  // persist into the next confirmation.
  useEffect(() => {
    if (open) {
      setError(null)
      setWorking(false)
    }
  }, [open])

  const handleConfirm = async () => {
    setWorking(true)
    setError(null)
    try {
      await onConfirm()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't complete the action.")
    } finally {
      setWorking(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!working ? onOpenChange(v) : null)}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <div className="mb-1 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-red-500/10 text-red-600 ring-1 ring-red-500/30">
              <AlertTriangle className="h-4 w-4" strokeWidth={2.25} />
            </span>
            <DialogTitle className="text-[16px] tracking-tight">{title}</DialogTitle>
          </div>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={working}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={working}
            className="gap-1.5 bg-red-600 text-white hover:bg-red-600/90"
          >
            {working ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…
              </>
            ) : (
              confirmLabel
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
