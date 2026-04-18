import { useState } from "react"
import { Sidebar, type NavKey } from "@/components/Sidebar"
import { Topbar } from "@/components/Topbar"
import { AddLocationDialog } from "@/components/AddLocationDialog"
import { OverviewView } from "@/views/OverviewView"
import { LocationsView } from "@/views/LocationsView"
import { BillingView } from "@/views/BillingView"
import { SettingsView } from "@/views/SettingsView"
import { initialBrand, initialCafes, type Brand, type Cafe } from "@/lib/mock"
import "./App.css"

function App() {
  const [nav, setNav] = useState<NavKey>("overview")
  const [brand, setBrand] = useState<Brand>(initialBrand)
  const [cafes, setCafes] = useState<Cafe[]>(initialCafes)
  const [addLocationOpen, setAddLocationOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <Sidebar active={nav} onSelect={setNav} brandName={brand.name} />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          section={nav}
          brand={brand}
          onOpenAddLocation={() => setAddLocationOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-6xl">
            {nav === "overview" && <OverviewView brand={brand} cafes={cafes} />}
            {nav === "locations" && (
              <LocationsView cafes={cafes} onAdd={() => setAddLocationOpen(true)} />
            )}
            {nav === "billing" && <BillingView brand={brand} />}
            {nav === "settings" && <SettingsView brand={brand} onChange={setBrand} />}
          </div>
        </main>
      </div>

      <AddLocationDialog
        open={addLocationOpen}
        onOpenChange={setAddLocationOpen}
        brand={brand}
        onAdd={(cafe) => setCafes((prev) => [cafe, ...prev])}
      />
    </div>
  )
}

export default App
