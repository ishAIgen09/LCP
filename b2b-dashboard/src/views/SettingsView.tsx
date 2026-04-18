import { Globe, Lock } from "lucide-react"
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
import type { Brand, SchemeType } from "@/lib/mock"

export function SettingsView({
  brand,
  onChange,
}: {
  brand: Brand
  onChange: (b: Brand) => void
}) {
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
              value={brand.name}
              onChange={(e) => onChange({ ...brand, name: e.target.value })}
              className="h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">Slug</label>
              <Input
                value={brand.slug}
                onChange={(e) => onChange({ ...brand, slug: e.target.value })}
                className="h-10 font-mono text-sm"
              />
            </div>
            <div className="grid gap-1.5">
              <label className="text-[12px] font-medium text-foreground">Contact email</label>
              <Input
                value={brand.contactEmail}
                onChange={(e) => onChange({ ...brand, contactEmail: e.target.value })}
                className="h-10"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" className="h-9">Discard</Button>
            <Button size="sm" className="h-9">Save changes</Button>
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
            value={brand.schemeType}
            onValueChange={(v: SchemeType) => onChange({ ...brand, schemeType: v })}
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
              brand.schemeType === "global"
                ? "border-emerald-200 bg-emerald-50/50"
                : "border-violet-200 bg-violet-50/50"
            )}
          >
            <div className="flex items-center gap-2 text-[12.5px] font-semibold tracking-tight text-foreground">
              {brand.schemeType === "global" ? (
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
              {brand.schemeType === "global"
                ? "Stamps pool across every Global cafe in the network. Higher discoverability, shared goodwill."
                : "Stamps only pool across your own cafes. Fuller control of your loyalty economy."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
