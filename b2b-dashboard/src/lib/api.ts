import type { Session, Brand, Cafe, FoodHygieneRating, SchemeType } from "@/lib/mock"

// Empty default → production builds emit same-origin paths (e.g.
// `/api/auth/admin/login`) so Nginx on dashboard.localcoffeeperks.com
// can reverse-proxy /api/* to FastAPI on :8000 with no mixed-content
// issues over HTTPS.
//
// Local dev still talks to the droplet via .env.local with
// VITE_API_BASE_URL=http://178.62.123.228:8000. Use ?? not || so an
// explicit empty env value is honoured (it's the production setting).
const DEFAULT_BASE_URL = ""

const envBase =
  typeof import.meta !== "undefined" &&
  (import.meta as unknown as { env?: Record<string, string> }).env
    ? (import.meta as unknown as { env: Record<string, string> }).env
        .VITE_API_BASE_URL
    : undefined

export const API_BASE_URL = (envBase ?? DEFAULT_BASE_URL).replace(/\/+$/, "")

export class ApiError extends Error {
  readonly status: number
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
    this.detail = detail
  }
}

async function parseDetail(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (body && typeof body.detail === "string") return body.detail
    if (Array.isArray(body?.detail)) {
      const first = body.detail[0]
      if (first?.msg) return String(first.msg)
    }
  } catch {
    /* not JSON */
  }
  return `HTTP ${res.status}`
}

export function humanizeError(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 0) {
      return "Can't reach the server. Check your connection and try again."
    }
    if (e.status === 401) return e.detail || "Invalid credentials."
    if (e.status === 402) return e.detail || "Subscription is not active."
    if (e.status === 404) return e.detail || "Not found."
    if (e.status === 409) return e.detail || "That value is already in use."
    if (e.status === 422) return "Please check the form and try again."
    if (e.status >= 500) return "Server error. Try again in a moment."
    return e.detail || `Request failed (${e.status}).`
  }
  if (e instanceof Error) return e.message
  return "Something went wrong."
}

const DEV = Boolean(
  typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV,
)

async function request<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  // NOTE: we deliberately do NOT strip trailing slashes here any more. An
  // earlier belt-and-braces `.replace(/\/+$/, "")` silently rewrote
  // `/api/admin/cafes/` (which is what a template with an empty id produces)
  // into `/api/admin/cafes`, which 405s on DELETE because only GET+POST are
  // registered there. That masked the real bug (empty cafeId). Let the URL
  // go through verbatim so the failure mode matches the root cause.
  const url = `${API_BASE_URL}${path}`
  // Diagnostic breadcrumb — prints the exact method + URL the browser is
  // about to send. If the user ever sees 405 again, the Network tab will
  // show the literal request we fired and this console line will confirm
  // method+path came out of React correctly (so the mismatch is env-side).
  if (DEV) {
    // eslint-disable-next-line no-console
    console.info(`[api] → ${method} ${url}`)
  }
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (DEV) {
      // eslint-disable-next-line no-console
      console.warn(`[api] ✗ ${method} ${url} — network error: ${msg}`)
    }
    throw new ApiError(0, `Network error: ${msg}`)
  }

  if (DEV) {
    // eslint-disable-next-line no-console
    console.info(`[api] ← ${res.status} ${method} ${url}`)
  }

  if (!res.ok) {
    throw new ApiError(res.status, await parseDetail(res))
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

type ApiBrand = {
  id: string
  name: string
  slug: string
  contact_email: string
  scheme_type: SchemeType
  subscription_status: "active" | "trialing" | "past_due" | "canceled" | "incomplete"
  current_period_end?: string | null
  owner_first_name?: string | null
  owner_last_name?: string | null
  owner_phone?: string | null
  company_legal_name?: string | null
  company_address?: string | null
  company_registration_number?: string | null
}

export type MetricsRange = "7d" | "30d" | "ytd" | "all"

export type MetricsFilter = {
  cafeId?: string // "all" or a specific cafe UUID; defaults to "all"
  range?: MetricsRange // defaults to "30d"
}

export type ApiMetrics = {
  // Echoes of the request so a render can correlate to the query that
  // produced it — useful when filter changes overlap in-flight fetches.
  range: MetricsRange
  cafe_id: string
  // Range-filtered aggregates.
  total_earned: number
  total_redeemed: number
  prev_total_earned: number | null
  // Legacy brand-wide 30d fields — stable regardless of filter.
  total_scans_30d: number
  total_scans_prev_30d: number
  active_cafes: number
  total_cafes: number
  per_cafe_30d: { cafe_id: string; scans_30d: number }[]
  renews_at: string | null
}

export type ApiCafe = {
  id: string
  brand_id: string
  name: string
  slug: string
  address: string
  contact_email?: string
  store_number?: string | null
  phone?: string | null
  food_hygiene_rating?: FoodHygieneRating
  amenities?: string[]
  // Per-cafe Pay It Forward / Suspended Coffee opt-in (PRD §4.5).
  // Default false on backend; older API responses pre-dating migration
  // 0020 may omit the field — treat undefined as false.
  suspended_coffee_enabled?: boolean
  created_at?: string
}

export type ApiOffer = {
  id: string
  brand_id: string
  // 'custom' (added 2026-05-01, migration 0018) = bespoke free-text variant.
  // For custom offers, `target` and `amount` are persisted but ignored at
  // render — `custom_text` carries the entire content of the offer.
  offer_type: "percent" | "fixed" | "bogo" | "double_stamps" | "custom"
  target: "any_drink" | "all_pastries" | "food" | "merchandise" | "entire_order"
  amount: string | number | null
  starts_at: string
  ends_at: string
  // NULL (from API) = applies to all brand cafes. Array = scoped to those ids.
  target_cafe_ids: string[] | null
  // Populated for offer_type='custom'; NULL for the four structured types.
  // Max 280 chars (server validates; mirrors b2b's UI cap).
  custom_text: string | null
  created_at: string
}

type AdminLoginResponse = {
  token: string
  admin: { email: string }
  brand: ApiBrand
}

type StoreLoginResponse = {
  token: string
  venue_api_key: string
  store_number: string
  cafe: ApiCafe
  brand: ApiBrand
}

export type StampResponse = {
  user_id: string
  stamp_balance: number
  reward_earned: boolean
  ledger_entry_id: string
}

export type RedeemResponse = {
  user_id: string
  stamp_balance: number
  redeemed: boolean
  ledger_entry_id: string
}

export type B2BScanResponse = {
  consumer_id: string
  venue_id: string
  stamps_earned: number
  free_drinks_unlocked: number
  new_balance: number
  earned_transaction_id: string
  redeemed_transaction_id: string | null
}

export function brandFromApi(b: ApiBrand): Brand {
  // Plan label + price flow from the brand's scheme_type, locked at
  // signup. We don't surface "no active subscription" as a separate plan
  // string — the renewal/grace-period state lives on subscriptionStatus
  // and lights up its own UI elsewhere. Keeping the plan card honest
  // about which scheme the owner picked is what matters here.
  const isGlobal = b.scheme_type === "global"
  return {
    name: b.name,
    slug: b.slug,
    contactEmail: b.contact_email,
    schemeType: b.scheme_type,
    plan: isGlobal ? "LCP+ Global Pass" : "Private Scheme",
    planPrice: isGlobal ? "£7.99 / month per cafe" : "£5 / month per cafe",
    subscriptionStatus: b.subscription_status === "incomplete" ? "past_due" : b.subscription_status,
    createdAt: new Date().toISOString().slice(0, 10),
    currentPeriodEnd: b.current_period_end ?? null,
    ownerFirstName: b.owner_first_name ?? null,
    ownerLastName: b.owner_last_name ?? null,
    ownerPhone: b.owner_phone ?? null,
    companyLegalName: b.company_legal_name ?? null,
    companyAddress: b.company_address ?? null,
    companyRegistrationNumber: b.company_registration_number ?? null,
  }
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ session: Extract<Session, { role: "admin" }>; brand: Brand }> {
  const data = await request<AdminLoginResponse>("POST", "/api/auth/admin/login", {
    email,
    password,
  })
  return {
    session: {
      role: "admin",
      token: data.token,
      email: data.admin.email,
      brandId: data.brand.id,
      brandName: data.brand.name,
      schemeType: data.brand.scheme_type,
    },
    brand: brandFromApi(data.brand),
  }
}

// Onboarding wizard — finalize a brand-invite into an admin session.
// Mirrors adminLogin's return shape so the wizard's onAuthenticated
// callback drops straight into the existing App.tsx admin flow.
export async function adminSetup(
  token: string,
  password: string,
): Promise<{ session: Extract<Session, { role: "admin" }>; brand: Brand }> {
  const data = await request<AdminLoginResponse>("POST", "/api/auth/brand/setup", {
    token,
    password,
  })
  return {
    session: {
      role: "admin",
      token: data.token,
      email: data.admin.email,
      brandId: data.brand.id,
      brandName: data.brand.name,
      schemeType: data.brand.scheme_type,
    },
    brand: brandFromApi(data.brand),
  }
}

export async function storeLogin(
  storeNumber: string,
  pin: string
): Promise<Extract<Session, { role: "store" }>> {
  const data = await request<StoreLoginResponse>("POST", "/api/auth/store/login", {
    store_number: storeNumber,
    pin,
  })
  return {
    role: "store",
    token: data.token,
    venueApiKey: data.venue_api_key,
    storeNumber: data.store_number,
    cafeName: data.cafe.name,
    brandName: data.brand.name,
  }
}

function authHeader(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` }
}

export function cafeFromApi(apiCafe: ApiCafe, brandActive: boolean): Cafe {
  return {
    id: apiCafe.id,
    name: apiCafe.name,
    address: apiCafe.address,
    scansThisMonth: 0,
    status: brandActive ? "live" : "paused",
    amenities: apiCafe.amenities ?? [],
    phone: apiCafe.phone ?? null,
    foodHygieneRating: apiCafe.food_hygiene_rating ?? "Awaiting Inspection",
    storeNumber: apiCafe.store_number ?? null,
    suspendedCoffeeEnabled: apiCafe.suspended_coffee_enabled ?? false,
  }
}

export async function listCafes(token: string): Promise<ApiCafe[]> {
  return request<ApiCafe[]>("GET", "/api/admin/cafes", undefined, authHeader(token))
}

// Address autocomplete — feeds the AddLocationDialog combobox. Backend
// thinly wraps Nominatim (geopy) and returns the top 5 formatted
// matches. Caller debounces input at 800ms before invoking; the
// network round-trip itself is unbudgeted.
export async function geocodeAutocomplete(
  token: string,
  query: string,
  signal?: AbortSignal,
): Promise<string[]> {
  if (query.trim().length < 3) return []
  const path = `/api/b2b/geocode/autocomplete?q=${encodeURIComponent(query.trim())}`
  const raw = await request<{ suggestions: string[] }>(
    "GET",
    path,
    undefined,
    authHeader(token),
    signal,
  )
  return raw.suggestions ?? []
}

export async function getAdminMe(
  token: string
): Promise<{ admin: { email: string }; brand: Brand }> {
  const raw = await request<{ admin: { email: string }; brand: ApiBrand }>(
    "GET",
    "/api/admin/me",
    undefined,
    authHeader(token)
  )
  return { admin: raw.admin, brand: brandFromApi(raw.brand) }
}

export async function getAdminMetrics(
  token: string,
  filter?: MetricsFilter,
): Promise<ApiMetrics> {
  const range = filter?.range ?? "30d"
  const cafeId = filter?.cafeId ?? "all"
  const qs = `?range=${encodeURIComponent(range)}&cafe_id=${encodeURIComponent(cafeId)}`
  return request<ApiMetrics>(
    "GET",
    `/api/admin/metrics${qs}`,
    undefined,
    authHeader(token),
  )
}

// B2B data-report CSV download. Goes through fetch (not <a href>) so the
// JWT rides in an Authorization header rather than a query string, and a
// 4xx surfaces as a throwable the caller can show in a toast.
export async function downloadB2bReportCsv(
  token: string,
  range: MetricsRange,
): Promise<void> {
  const path = `/api/b2b/export/reports?range=${encodeURIComponent(range)}`
  const base =
    typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: Record<string, string> }).env
      ? (import.meta as unknown as { env: Record<string, string> }).env
          .VITE_API_BASE_URL
      : undefined
  const url = `${(base || "http://localhost:8000").replace(/\/+$/, "")}${path}`
  let res: Response
  try {
    res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    throw new Error("Couldn't reach the API — check your connection.")
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`
    try {
      const body = await res.json()
      if (body && typeof body.detail === "string") detail = body.detail
    } catch {
      // non-JSON body → stick with generic message
    }
    throw new Error(detail)
  }
  const disposition = res.headers.get("Content-Disposition") ?? ""
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match?.[1] ?? `lcp-report-${range}.csv`
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

export async function updateAdminBrand(
  token: string,
  patch: {
    name?: string
    slug?: string
    contact_email?: string
    scheme_type?: SchemeType
    owner_first_name?: string
    owner_last_name?: string
    owner_phone?: string
    company_legal_name?: string
    company_address?: string
    company_registration_number?: string
  }
): Promise<Brand> {
  const raw = await request<ApiBrand>(
    "PATCH",
    "/api/admin/brand",
    patch,
    authHeader(token)
  )
  return brandFromApi(raw)
}

// Optional `tier` picks the Stripe price id on the backend
// (private = £5/mo · global = £7.99/mo). When omitted, defaults to
// "private" — the historical behaviour for the first-cafe checkout
// auto-redirect.
export async function createCheckout(
  token: string,
  tier: "private" | "global" = "private",
): Promise<{ checkout_url: string }> {
  return request<{ checkout_url: string }>(
    "POST",
    `/api/billing/checkout?tier=${encodeURIComponent(tier)}`,
    undefined,
    authHeader(token)
  )
}

export async function createPortalSession(
  token: string,
): Promise<{ checkout_url: string }> {
  // Backend returns the same CheckoutResponse shape ({ checkout_url }) so the
  // frontend can reuse window.location.href = url for both flows.
  return request<{ checkout_url: string }>(
    "POST",
    "/api/billing/portal",
    undefined,
    authHeader(token),
  )
}

// Cancellation feedback survey (PRD §4.2, migration 0019). Posted before
// the b2b dashboard hands off to the Stripe Customer Portal so a brand
// cancelling can never bypass the survey. Server enforces the same enum
// + the conditional 'other' details requirement; matches the values in
// app/models.py::CANCELLATION_REASONS.
export type CancellationReason =
  | "free_drink_cost"
  | "barista_friction"
  | "price_too_high"
  | "low_volume"
  | "feature_gap"
  | "closing_business"
  | "other"

export type CancellationFeedbackResponse = {
  id: string
  brand_id: string
  reason: CancellationReason
  details: string | null
  acknowledged: boolean
  created_at: string
}

export async function postCancellationFeedback(
  token: string,
  values: {
    reason: CancellationReason
    details?: string | null
    acknowledged: boolean
  }
): Promise<CancellationFeedbackResponse> {
  return request<CancellationFeedbackResponse>(
    "POST",
    "/api/b2b/cancellation-feedback",
    values,
    authHeader(token),
  )
}

// ─────────────────────────────────────────────────────────────────
// Pay It Forward / Suspended Coffee — POS-side (Venue API key auth)
// PRD §4.5 + migration 0020.
// ─────────────────────────────────────────────────────────────────

export type CommunityPoolStatus = {
  cafe_id: string
  enabled: boolean
  pool_balance: number
}

export type SuspendedCoffeeMutationResponse = {
  ok: boolean
  new_pool_balance: number
}

export async function getSuspendedCoffeePool(
  venueApiKey: string,
): Promise<CommunityPoolStatus> {
  return request<CommunityPoolStatus>(
    "GET",
    "/api/b2b/suspended-coffee/pool",
    undefined,
    { "Venue-API-Key": venueApiKey },
  )
}

export async function donateSuspendedCoffeeAtTill(
  venueApiKey: string,
  count: number,
): Promise<SuspendedCoffeeMutationResponse> {
  return request<SuspendedCoffeeMutationResponse>(
    "POST",
    "/api/b2b/suspended-coffee/donate-till",
    { count },
    { "Venue-API-Key": venueApiKey },
  )
}

export async function serveSuspendedCoffee(
  venueApiKey: string,
): Promise<SuspendedCoffeeMutationResponse> {
  // Empty body — cafe identity from the Venue-API-Key header. 409
  // bubbles up as ApiError with detail "Community pool is empty."
  return request<SuspendedCoffeeMutationResponse>(
    "POST",
    "/api/b2b/suspended-coffee/serve",
    undefined,
    { "Venue-API-Key": venueApiKey },
  )
}

// Two tiers map to the two products on the Billing tab:
//   starter → "Private Plan"        (£5.00/mo per location)
//   pro     → "LCP+ Global Pass"    (£7.99/mo per location)
// IDs stay short + lowercase so the backend wire format doesn't churn
// alongside the marketing names.
export type PlanTier = "starter" | "pro"

export type PlanChangeRequestBody = {
  from_plan: PlanTier
  to_plan: PlanTier
  // Per-location monthly delta in pence (positive = upgrade).
  price_delta_pence_per_location: number
  cafe_count: number
}

export type PlanChangeResponse = {
  notified: boolean
  request_id: string
  received_at: string
  // Proration breakdown — backend computes from day-of-month so the
  // dialog/toast can show "you'll be charged £X today" or "you'll get
  // £X off next month".
  direction: "upgrade" | "downgrade" | "noop"
  days_remaining_in_month: number
  days_in_month: number
  proration_pence: number
  immediate_charge_pence: number | null
  next_invoice_credit_pence: number | null
}

// Submits an immediate plan change. Brands self-serve — there is no
// approval gate. The new rate appears on the next invoice; the LCP team
// is auto-notified for visibility but does NOT need to flip a switch.
// Backend doesn't yet swap the Stripe price id either; for now this
// captures the intent in a structured log line keyed by request_id and
// the dashboard treats the response as a fait accompli.
export async function requestPlanChange(
  token: string,
  body: PlanChangeRequestBody,
): Promise<PlanChangeResponse> {
  return request<PlanChangeResponse>(
    "POST",
    "/api/billing/plan-change",
    body,
    authHeader(token),
  )
}

export async function createCafe(
  token: string,
  values: {
    name: string
    address: string
    store_number?: string
    pin?: string
    phone?: string | null
    food_hygiene_rating?: FoodHygieneRating
  }
): Promise<ApiCafe> {
  return request<ApiCafe>(
    "POST",
    "/api/admin/cafes",
    values,
    authHeader(token)
  )
}

function requireCafeId(cafeId: string, caller: string): string {
  // Guard against empty / undefined ids building a URL like
  // `/api/admin/cafes/` — that request hits the list endpoint and 405s on
  // anything except GET/POST. Failing fast here produces a clear dialog
  // error instead of a misleading 405 in the Network tab.
  const trimmed = typeof cafeId === "string" ? cafeId.trim() : ""
  if (!trimmed) {
    throw new Error(
      `${caller}: missing cafe id — refusing to send a request to the list endpoint.`
    )
  }
  return trimmed
}

export async function updateCafe(
  token: string,
  cafeId: string,
  patch: {
    address?: string
    phone?: string | null
    food_hygiene_rating?: FoodHygieneRating
    // Per-cafe Pay It Forward / Suspended Coffee opt-in (PRD §4.5,
    // migration 0020). null/undefined = leave existing flag untouched;
    // explicit true/false flips it.
    suspended_coffee_enabled?: boolean
  }
): Promise<ApiCafe> {
  const id = requireCafeId(cafeId, "updateCafe")
  // PUT, keyed by the cafe's id — the backend's handler is registered for
  // both PUT and PATCH, so this stays REST-conventional. The body is still a
  // partial patch: omitted fields are left untouched server-side.
  return request<ApiCafe>(
    "PUT",
    `/api/admin/cafes/${id}`,
    patch,
    authHeader(token)
  )
}

export async function deleteCafe(
  token: string,
  cafeId: string,
): Promise<void> {
  const id = requireCafeId(cafeId, "deleteCafe")
  // RPC-style POST fallback. The REST DELETE endpoint still exists server-
  // side, but some intermediary in the dev stack (Vite proxy / browser
  // ext / Windows HTTP stack?) intermittently 405s on the DELETE verb.
  // POST is the most reliable verb across every stack, so we use that.
  // Response envelope: { status: "success", deleted_id: "<uuid>" }.
  await request<{ status: string; deleted_id: string }>(
    "POST",
    `/api/admin/cafes/${id}/delete`,
    {},
    authHeader(token),
  )
}

export async function resetCafePin(
  token: string,
  cafeId: string,
  pin: string,
): Promise<ApiCafe> {
  const id = requireCafeId(cafeId, "resetCafePin")
  return request<ApiCafe>(
    "POST",
    `/api/admin/cafes/${id}/reset-pin`,
    { pin },
    authHeader(token),
  )
}

// Brand-admin "forgot password" — fires off the reset request. The
// backend always responds 200 regardless of whether the email matched,
// so the caller never reveals account existence to the user.
export async function forgotPassword(email: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    "POST",
    "/api/auth/forgot-password",
    { email },
  )
}

export async function resetPassword(
  token: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    "POST",
    "/api/auth/reset-password",
    { token, new_password: newPassword },
  )
}

export async function updateCafeAmenities(
  token: string,
  cafeId: string,
  amenities: string[]
): Promise<ApiCafe> {
  return request<ApiCafe>(
    "PUT",
    `/api/admin/cafes/${cafeId}/amenities`,
    { amenities },
    authHeader(token)
  )
}

export async function listOffers(token: string): Promise<ApiOffer[]> {
  return request<ApiOffer[]>(
    "GET",
    "/api/admin/offers",
    undefined,
    authHeader(token)
  )
}

export async function createOffer(
  token: string,
  values: {
    offer_type: ApiOffer["offer_type"]
    target: ApiOffer["target"]
    amount: number | null
    starts_at: string
    ends_at: string
    target_cafe_ids: string[] | null
    // Required when offer_type === "custom" (server validates non-empty +
    // ≤ 280 chars). Silently dropped server-side for non-custom types.
    custom_text?: string | null
  }
): Promise<ApiOffer> {
  return request<ApiOffer>(
    "POST",
    "/api/admin/offers",
    values,
    authHeader(token)
  )
}

export async function updateOffer(
  token: string,
  offerId: string,
  values: {
    offer_type: ApiOffer["offer_type"]
    target: ApiOffer["target"]
    amount: number | null
    starts_at: string
    ends_at: string
    target_cafe_ids: string[] | null
    custom_text?: string | null
  }
): Promise<ApiOffer> {
  return request<ApiOffer>(
    "PUT",
    `/api/admin/offers/${offerId}`,
    values,
    authHeader(token)
  )
}

export async function deleteOffer(
  token: string,
  offerId: string
): Promise<void> {
  // RPC-style POST fallback mirroring deleteCafe — uniform across the
  // dashboard so a 405 on any DELETE verb can never bite us here.
  // Response envelope: { status: "success", deleted_id: "<uuid>" }.
  await request<{ status: string; deleted_id: string }>(
    "POST",
    `/api/admin/offers/${offerId}/delete`,
    {},
    authHeader(token)
  )
}

export async function stamp(
  venueApiKey: string,
  tillCode: string
): Promise<StampResponse> {
  return request<StampResponse>(
    "POST",
    "/api/venues/stamp",
    { till_code: tillCode },
    { "Venue-API-Key": venueApiKey }
  )
}

export type CustomerStatusResponse = {
  user_id: string
  till_code: string
  current_stamps: number
  banked_rewards: number
  threshold: number
}

export async function getCustomerStatus(
  venueApiKey: string,
  tillCode: string,
): Promise<CustomerStatusResponse> {
  return request<CustomerStatusResponse>(
    "GET",
    `/api/venues/customer/${encodeURIComponent(tillCode)}`,
    undefined,
    { "Venue-API-Key": venueApiKey },
  )
}

export async function redeem(
  venueApiKey: string,
  tillCode: string,
  quantity: number = 1,
): Promise<RedeemResponse> {
  // Mixed-Basket: quantity = number of banked rewards to consume. Default 1
  // keeps any legacy single-drink caller working untouched.
  return request<RedeemResponse>(
    "POST",
    "/api/venues/redeem",
    { till_code: tillCode, quantity },
    { "Venue-API-Key": venueApiKey },
  )
}

export async function b2bScan(
  venueApiKey: string,
  venueId: string,
  consumerId: string,
  quantity: number
): Promise<B2BScanResponse> {
  return request<B2BScanResponse>(
    "POST",
    "/api/b2b/scan",
    { consumer_id: consumerId, venue_id: venueId, quantity },
    { "Venue-API-Key": venueApiKey }
  )
}

const SESSION_STORAGE_KEY = "icl_session_v1"
const BRAND_STORAGE_KEY = "icl_brand_v1"

export function loadPersistedSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Session
    if (parsed && (parsed.role === "admin" || parsed.role === "store")) {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function persistSession(session: Session | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  } catch {
    /* localStorage unavailable — session is in-memory only */
  }
}

export function loadPersistedBrand(): Brand | null {
  try {
    const raw = localStorage.getItem(BRAND_STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Brand
  } catch {
    return null
  }
}

export function persistBrand(brand: Brand | null): void {
  try {
    if (brand) {
      localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify(brand))
    } else {
      localStorage.removeItem(BRAND_STORAGE_KEY)
    }
  } catch {
    /* localStorage unavailable */
  }
}
