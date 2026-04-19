import type { Session, Brand, Cafe, SchemeType } from "@/lib/mock"

const DEFAULT_BASE_URL = "http://localhost:8000"

const envBase =
  typeof import.meta !== "undefined" &&
  (import.meta as unknown as { env?: Record<string, string> }).env
    ? (import.meta as unknown as { env: Record<string, string> }).env
        .VITE_API_BASE_URL
    : undefined

export const API_BASE_URL = (envBase || DEFAULT_BASE_URL).replace(/\/+$/, "")

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

async function request<T>(
  method: "GET" | "POST" | "PATCH",
  path: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(headers ?? {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new ApiError(0, `Network error: ${msg}`)
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
}

export type ApiMetrics = {
  total_scans_30d: number
  total_scans_prev_30d: number
  active_cafes: number
  total_cafes: number
  per_cafe_30d: { cafe_id: string; scans_30d: number }[]
  renews_at: string | null
}

type ApiCafe = {
  id: string
  brand_id: string
  name: string
  slug: string
  address: string
  contact_email?: string
  store_number?: string | null
  created_at?: string
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

export function brandFromApi(b: ApiBrand): Brand {
  // Plan tier isn't modelled server-side yet — derive from subscription_status
  // so the dashboard can render consistent labels.
  const isActive = b.subscription_status === "active"
  return {
    name: b.name,
    slug: b.slug,
    contactEmail: b.contact_email,
    schemeType: b.scheme_type,
    plan: isActive ? "Growth" : "Starter",
    planPrice: isActive ? "£5 / month per cafe" : "—",
    subscriptionStatus: b.subscription_status === "incomplete" ? "past_due" : b.subscription_status,
    createdAt: new Date().toISOString().slice(0, 10),
    currentPeriodEnd: b.current_period_end ?? null,
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
  }
}

export async function listCafes(token: string): Promise<ApiCafe[]> {
  return request<ApiCafe[]>("GET", "/api/admin/cafes", undefined, authHeader(token))
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

export async function getAdminMetrics(token: string): Promise<ApiMetrics> {
  return request<ApiMetrics>(
    "GET",
    "/api/admin/metrics",
    undefined,
    authHeader(token)
  )
}

export async function updateAdminBrand(
  token: string,
  patch: {
    name?: string
    slug?: string
    contact_email?: string
    scheme_type?: SchemeType
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

export async function createCheckout(token: string): Promise<{ checkout_url: string }> {
  return request<{ checkout_url: string }>(
    "POST",
    "/api/billing/checkout",
    undefined,
    authHeader(token)
  )
}

export async function createCafe(
  token: string,
  values: {
    name: string
    address: string
    store_number?: string
    pin?: string
  }
): Promise<ApiCafe> {
  return request<ApiCafe>(
    "POST",
    "/api/admin/cafes",
    values,
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

export async function redeem(
  venueApiKey: string,
  tillCode: string
): Promise<RedeemResponse> {
  return request<RedeemResponse>(
    "POST",
    "/api/venues/redeem",
    { till_code: tillCode },
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
