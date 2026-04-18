import { CreditCard, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Brand } from "@/lib/mock"

export function BillingView({ brand }: { brand: Brand }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Subscription</CardTitle>
          <CardDescription>Managed securely via Stripe.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="rounded-lg border border-border bg-muted/30 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11.5px] font-medium uppercase tracking-wider text-muted-foreground">
                  Current plan
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">
                    {brand.plan}
                  </span>
                  <span className="text-sm text-muted-foreground">{brand.planPrice}</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" strokeWidth={2.5} /> Active
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-9">Manage in Stripe</Button>
            <Button size="sm" variant="outline" className="h-9">Download invoices</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-[15px] tracking-tight">Payment method</CardTitle>
          <CardDescription>Primary card on file.</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-foreground text-background">
              <CreditCard className="h-4 w-4" strokeWidth={2} />
            </div>
            <div className="leading-tight">
              <div className="text-[13px] font-medium text-foreground">Visa •••• 4242</div>
              <div className="text-[11.5px] text-muted-foreground">Expires 09 / 2028</div>
            </div>
          </div>
          <Button variant="outline" size="sm" className="mt-3 h-9 w-full">
            Update card
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
