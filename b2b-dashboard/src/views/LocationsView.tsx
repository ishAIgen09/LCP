import { useState } from "react"
import { Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog"
import { EditLocationDialog } from "@/components/EditLocationDialog"
import { deleteCafe, humanizeError } from "@/lib/api"
import type { Cafe } from "@/lib/mock"

function formatNumber(n: number) {
  return n.toLocaleString("en-GB")
}

function initialsFromName(name: string) {
  const tail = name.split("—")[1]?.trim() ?? name
  return tail
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
}

export function LocationsView({
  cafes,
  onAdd,
  token,
  onRefresh,
  onOptimisticRemove,
}: {
  cafes: Cafe[]
  onAdd: () => void
  token: string
  onRefresh: () => void | Promise<void>
  onOptimisticRemove?: (cafeId: string) => void
}) {
  const [editing, setEditing] = useState<Cafe | null>(null)
  const [deleting, setDeleting] = useState<Cafe | null>(null)

  const handleConfirmDelete = async () => {
    if (!deleting) return
    try {
      const idToRemove = deleting.id
      await deleteCafe(token, idToRemove)
      // Optimistic UI: drop the row from React state the moment the server
      // acknowledges, so the table animates out without waiting for the
      // full listCafes + metrics refresh roundtrip. `onRefresh` still fires
      // afterwards to reconcile anything else that changed.
      onOptimisticRemove?.(idToRemove)
      try {
        await onRefresh()
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[deleteCafe] refresh after delete failed:", e)
      }
    } catch (e) {
      // Re-throw with a friendlier message so ConfirmDeleteDialog can display
      // it without exposing the raw API shape.
      throw new Error(humanizeError(e))
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight text-foreground">
            All locations
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {cafes.length} cafe{cafes.length === 1 ? "" : "s"} enrolled under this brand.
          </p>
        </div>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={onAdd}>
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-10 pl-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Cafe
              </TableHead>
              <TableHead className="h-10 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Address
              </TableHead>
              <TableHead className="h-10 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Scans (30d)
              </TableHead>
              <TableHead className="h-10 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Status
              </TableHead>
              <TableHead className="h-10 pr-5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cafes.length === 0 && (
              <TableRow className="border-t border-border hover:bg-transparent">
                <TableCell colSpan={5} className="py-10 text-center text-[12.5px] text-muted-foreground">
                  No locations yet. Click <span className="font-medium text-foreground">Add New Location</span> to create your first branch.
                </TableCell>
              </TableRow>
            )}
            {cafes.map((c) => (
              <TableRow key={c.id} className="border-t border-border">
                <TableCell className="py-3.5 pl-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-8 w-8 place-items-center rounded-md border border-border bg-muted/40 font-mono text-[10px] font-semibold uppercase text-muted-foreground">
                      {initialsFromName(c.name)}
                    </div>
                    <div>
                      <div className="text-[13px] font-medium tracking-tight text-foreground">
                        {c.name}
                      </div>
                      <div className="font-mono text-[10.5px] text-muted-foreground">{c.id}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-[12.5px] text-muted-foreground">{c.address}</TableCell>
                <TableCell className="text-right font-mono text-[13px] font-semibold tabular-nums text-foreground">
                  {formatNumber(c.scansThisMonth)}
                </TableCell>
                <TableCell className="text-right">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      c.status === "live"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        c.status === "live" ? "bg-emerald-500" : "bg-amber-500"
                      }`}
                    />
                    {c.status === "live" ? "Live" : "Paused"}
                  </span>
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <div className="inline-flex items-center gap-2">
                    <Button
                      size="sm"
                      className="h-8 gap-1.5 text-[12px] text-white shadow-sm"
                      style={{ backgroundColor: "#C96E4B" }}
                      onClick={() => setEditing(c)}
                    >
                      <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1.5 text-[12px] text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => setDeleting(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <EditLocationDialog
        open={editing !== null}
        onOpenChange={(v) => {
          if (!v) setEditing(null)
        }}
        token={token}
        cafe={editing}
        onSaved={onRefresh}
      />

      <ConfirmDeleteDialog
        open={deleting !== null}
        onOpenChange={(v) => {
          if (!v) setDeleting(null)
        }}
        title={`Delete ${deleting?.name ?? "location"}?`}
        description="Are you sure you want to delete this location? This cannot be undone. Historical scan data, if any, will block deletion and we'll tell you so."
        confirmLabel="Yes, delete"
        onConfirm={handleConfirmDelete}
      />
    </div>
  )
}
