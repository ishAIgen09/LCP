import { useCallback, useEffect, useState } from "react"
import { Sidebar, type NavKey } from "@/components/Sidebar"
import { Topbar } from "@/components/Topbar"
import { AddLocationDialog } from "@/components/AddLocationDialog"
import { LoginView } from "@/views/LoginView"
import { BaristaPOSView } from "@/views/BaristaPOSView"
import { BillingCancelView } from "@/views/BillingCancelView"
import { BillingSuccessView } from "@/views/BillingSuccessView"
import { OverviewView } from "@/views/OverviewView"
import { LocationsView } from "@/views/LocationsView"
import { PromotionsView } from "@/views/PromotionsView"
import { BillingView } from "@/views/BillingView"
import { SettingsView } from "@/views/SettingsView"
import {
  initialBrand,
  type Brand,
  type Cafe,
  type FoodHygieneRating,
  type Session,
} from "@/lib/mock"
import {
  ApiError,
  cafeFromApi,
  createCafe,
  createCheckout,
  createPortalSession,
  getAdminMe,
  getAdminMetrics,
  listCafes,
  loadPersistedBrand,
  loadPersistedSession,
  persistBrand,
  persistSession,
  updateAdminBrand,
  updateCafeAmenities,
  type ApiMetrics,
} from "@/lib/api"
import "./App.css"

type BillingRoute = "success" | "cancel" | null

function detectBillingRoute(): { route: BillingRoute; sessionId: string | null } {
  if (typeof window === "undefined") return { route: null, sessionId: null }
  const path = window.location.pathname
  if (path === "/success") {
    const params = new URLSearchParams(window.location.search)
    return { route: "success", sessionId: params.get("session_id") }
  }
  if (path === "/cancel") return { route: "cancel", sessionId: null }
  return { route: null, sessionId: null }
}

function App() {
  const [session, setSession] = useState<Session | null>(() => loadPersistedSession())
  const [nav, setNav] = useState<NavKey>("overview")
  const [brand, setBrand] = useState<Brand>(() => loadPersistedBrand() ?? initialBrand)
  const [cafes, setCafes] = useState<Cafe[]>([])
  const [metrics, setMetrics] = useState<ApiMetrics | null>(null)
  const [addLocationOpen, setAddLocationOpen] = useState(false)
  const [billingRoute, setBillingRoute] = useState(() => detectBillingRoute())

  useEffect(() => {
    persistSession(session)
  }, [session])

  useEffect(() => {
    persistBrand(session?.role === "admin" ? brand : null)
  }, [brand, session])

  const handleLogout = useCallback(() => {
    setSession(null)
    setBrand(initialBrand)
    setCafes([])
    setMetrics(null)
    setNav("overview")
  }, [])

  const refreshAdminData = useCallback(
    async (token: string): Promise<void> => {
      try {
        const [meRes, metricsRes, cafesRes] = await Promise.all([
          getAdminMe(token),
          getAdminMetrics(token),
          listCafes(token),
        ])
        const brandActive = meRes.brand.subscriptionStatus === "active"
        const scansByCafe = new Map(
          metricsRes.per_cafe_30d.map((s) => [s.cafe_id, s.scans_30d])
        )
        setBrand(meRes.brand)
        setMetrics(metricsRes)
        setCafes(
          cafesRes.map((c) => ({
            ...cafeFromApi(c, brandActive),
            scansThisMonth: scansByCafe.get(c.id) ?? 0,
          }))
        )
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          handleLogout()
          return
        }
        throw e
      }
    },
    [handleLogout]
  )

  useEffect(() => {
    if (session?.role !== "admin") {
      setCafes([])
      setMetrics(null)
      return
    }
    void refreshAdminData(session.token)
  }, [session, refreshAdminData])

  const handleAuthenticated = (next: Session, nextBrand?: Brand) => {
    setSession(next)
    if (nextBrand) setBrand(nextBrand)
  }

  const handleAddLocation = useCallback(
    async (values: {
      name: string
      address: string
      phone?: string | null
      food_hygiene_rating: FoodHygieneRating
      amenityIds: string[]
    }): Promise<string> => {
      if (session?.role !== "admin") {
        throw new ApiError(401, "Not signed in as admin.")
      }
      // Snapshot the pre-create billing state. Per-cafe billing: if the
      // brand doesn't already have an active sub, we need to redirect to
      // Stripe Checkout *after* the cafe row lands. If they're already
      // active, the backend auto-bumped the Stripe subscription quantity
      // via sync_subscription_quantity — no redirect needed.
      const wasActive = brand?.subscriptionStatus === "active"

      // 1. The actual create — this IS the work. If this throws, the user
      //    sees the error and the cafe was never saved.
      const cafe = await createCafe(session.token, {
        name: values.name,
        address: values.address,
        phone: values.phone ?? null,
        food_hygiene_rating: values.food_hygiene_rating,
      })

      // 2. Amenities live on a separate endpoint. Failure here must NOT be
      //    surfaced as a failed create — the cafe is already persisted.
      //    Log and move on; the user can edit amenities from the row's
      //    Edit button once the list refreshes.
      if (values.amenityIds.length > 0) {
        try {
          await updateCafeAmenities(session.token, cafe.id, values.amenityIds)
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[addLocation] amenities follow-up failed:", e)
        }
      }

      // 3a. Inactive brand — send them straight to Stripe Checkout. Don't
      //     refresh first: we're about to navigate away, and the webhook
      //     will flip the status to active on return.
      if (!wasActive) {
        try {
          const { checkout_url } = await createCheckout(session.token)
          window.location.href = checkout_url
          return cafe.id
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[addLocation] checkout redirect failed:", e)
          // Fall through to the refresh path — the cafe row is safe; the
          // admin can retry via the Billing tab or re-open the dialog.
        }
      }

      // 3b. Active brand — the backend already nudged the Stripe quantity.
      //     Refresh is cosmetic; don't throw past it.
      try {
        await refreshAdminData(session.token)
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[addLocation] refresh-after-create failed:", e)
      }

      return cafe.id
    },
    [session, brand, refreshAdminData]
  )

  const handleOpenPortal = useCallback(async (): Promise<void> => {
    if (session?.role !== "admin") {
      throw new ApiError(401, "Not signed in as admin.")
    }
    const { checkout_url } = await createPortalSession(session.token)
    window.location.href = checkout_url
  }, [session])

  const handleUpdateBrand = useCallback(
    async (patch: {
      name?: string
      slug?: string
      contact_email?: string
      scheme_type?: "global" | "private"
    }): Promise<void> => {
      if (session?.role !== "admin") {
        throw new ApiError(401, "Not signed in as admin.")
      }
      const updated = await updateAdminBrand(session.token, patch)
      setBrand(updated)
    },
    [session]
  )

  const clearBillingRoute = useCallback((goTo: NavKey = "billing") => {
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/")
    }
    setBillingRoute({ route: null, sessionId: null })
    setNav(goTo)
  }, [])

  if (billingRoute.route === "success") {
    return (
      <BillingSuccessView
        sessionId={billingRoute.sessionId}
        onContinue={() => {
          clearBillingRoute("billing")
          if (session?.role === "admin") void refreshAdminData(session.token)
        }}
      />
    )
  }

  if (billingRoute.route === "cancel") {
    return (
      <BillingCancelView
        onContinue={() => clearBillingRoute("billing")}
      />
    )
  }

  if (!session) {
    return <LoginView onAuthenticated={handleAuthenticated} />
  }

  if (session.role === "store") {
    return <BaristaPOSView session={session} onLogout={handleLogout} />
  }

  return (
    <div className="flex min-h-screen bg-background text-foreground antialiased">
      <Sidebar
        active={nav}
        onSelect={setNav}
        brandName={brand.name}
        onLogout={handleLogout}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          section={nav}
          brand={brand}
          onOpenAddLocation={() => setAddLocationOpen(true)}
        />

        <main className="flex-1 overflow-y-auto px-8 py-6">
          <div className="mx-auto w-full max-w-6xl">
            {nav === "overview" && (
              <OverviewView
                brand={brand}
                cafes={cafes}
                metrics={metrics}
                token={session.token}
                onNavigate={setNav}
              />
            )}
            {nav === "locations" && (
              <LocationsView
                cafes={cafes}
                onAdd={() => setAddLocationOpen(true)}
                token={session.token}
                onRefresh={() => refreshAdminData(session.token)}
                onOptimisticRemove={(cafeId) =>
                  setCafes((prev) => prev.filter((c) => c.id !== cafeId))
                }
              />
            )}
            {nav === "promotions" && (
              <PromotionsView token={session.token} cafes={cafes} />
            )}
            {nav === "billing" && (
              <BillingView
                brand={brand}
                token={session.token}
                cafeCount={cafes.length}
              />
            )}
            {nav === "settings" && (
              <SettingsView brand={brand} onSave={handleUpdateBrand} />
            )}
          </div>
        </main>
      </div>

      <AddLocationDialog
        open={addLocationOpen}
        onOpenChange={setAddLocationOpen}
        brand={brand}
        onSubmit={handleAddLocation}
        onOpenPortal={handleOpenPortal}
      />
    </div>
  )
}

export default App
