import type { Session } from "./theme";

// Production droplet (DigitalOcean, plain HTTP on :8000 until TLS lands).
// To run against a local backend instead, swap back to:
// - iOS Simulator + host containers: http://127.0.0.1:8000
// - Android emulator: http://10.0.2.2:8000 (emulator alias for host)
// - Physical device on your LAN: http://<your-LAN-IP>:8000
// On Android, plain http:// requires usesCleartextTraffic=true in app.json.
export const API_BASE_URL = "http://178.62.123.228:8000";

if (__DEV__) {
  // eslint-disable-next-line no-console
  console.log(`[api] base URL → ${API_BASE_URL}`);
}

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

// Headers applied to every backend request. `Accept: application/json`
// tells any intermediary we only want JSON back — if we ever put a proxy
// back in front, an HTML interstitial will 406 instead of silently
// rendering and confusing the client.
const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "application/json",
};

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty body is fine on 2xx; otherwise fall through to generic
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      `Request failed (${res.status}).`;
    throw new ApiError(res.status, String(detail));
  }

  return data as T;
}

async function getJSON<T>(path: string, token: string): Promise<T> {
  // Cache-bust aggressively: React Native's fetch + any tunnel/proxy in front
  // of the dev backend (localtunnel, Cloudflare, CDN) will happily serve a
  // stale GET if we let them. The `?t=` query param busts URL-keyed caches;
  // the no-cache headers cover the rest.
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API_BASE_URL}${path}${sep}t=${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        ...DEFAULT_HEADERS,
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (e) {
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }

  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // ignore — handled below
  }

  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      `Request failed (${res.status}).`;
    throw new ApiError(res.status, String(detail));
  }

  return data as T;
}

export function requestOtp(input: {
  email: string;
  firstName?: string;
  lastName?: string;
}): Promise<{ ok: boolean }> {
  return postJSON("/api/consumer/auth/request-otp", {
    email: input.email,
    first_name: input.firstName ?? null,
    last_name: input.lastName ?? null,
  });
}

export function verifyOtp(input: {
  email: string;
  code: string;
}): Promise<Session> {
  return postJSON<Session>("/api/consumer/auth/verify-otp", {
    email: input.email,
    code: input.code,
  });
}

export type ConsumerProfile = {
  consumer_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

export function updateConsumerProfile(
  token: string,
  input: { first_name?: string | null; last_name?: string | null },
): Promise<ConsumerProfile> {
  // PATCH /api/consumer/me — server trims values; an empty string clears
  // the field. Omitted keys leave the existing value untouched.
  return patchJSONWithAuth<ConsumerProfile>(
    "/api/consumer/me",
    input,
    token,
  );
}

export type LatestEarn = {
  transaction_id: string;
  // cafe_id + suspended_coffee_enabled added 2026-05-02 so the
  // RewardModal can render a Donate-to-Community CTA next to Redeem
  // when the earn happened at a participating cafe (PRD §4.5).
  cafe_id: string;
  cafe_name: string;
  cafe_address: string;
  suspended_coffee_enabled: boolean;
  stamps_earned: number;
  free_drink_unlocked: boolean;
  timestamp: string;
};

export type BalanceResponse = {
  consumer_id: string;
  // Total scoped balance (can exceed threshold — banking model).
  stamp_balance: number;
  threshold: number;
  // Derived server-side for the X/10 progress display and the banked-rewards
  // badge. Prefer these over raw stamp_balance to avoid "13/10" artifacts.
  current_stamps: number;
  banked_rewards: number;
  latest_earn: LatestEarn | null;
};

export function fetchBalance(token: string): Promise<BalanceResponse> {
  return getJSON<BalanceResponse>("/api/consumer/me/balance", token);
}

export type WalletBalanceBlock = {
  stamp_balance: number;
  current_stamps: number;
  banked_rewards: number;
};

export type PrivateBrandBalance = WalletBalanceBlock & {
  brand_id: string;
  brand_name: string;
};

export type WalletResponse = {
  threshold: number;
  global_balance: WalletBalanceBlock;
  private_balances: PrivateBrandBalance[];
  latest_earn: LatestEarn | null;
};

export function fetchWallet(token: string): Promise<WalletResponse> {
  return getJSON<WalletResponse>("/api/consumer/me/wallet", token);
}

export type DiscoverOffer = {
  id: string;
  // 'custom' added 2026-05-01 (PRD §4.3) — bespoke free-text variant.
  // The card renders `custom_text` verbatim instead of the structured
  // "X% off Y" template used for the four pre-existing types.
  offer_type: "percent" | "fixed" | "bogo" | "double_stamps" | "custom";
  target: "any_drink" | "all_pastries" | "food" | "merchandise" | "entire_order";
  amount: string | number | null;
  // Populated when offer_type === "custom"; null for the structured types.
  custom_text: string | null;
  starts_at: string;
  ends_at: string;
};

export type FoodHygieneRating =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "Awaiting Inspection";

export type DiscoverCafe = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  food_hygiene_rating: FoodHygieneRating;
  amenities: string[];
  live_offers: DiscoverOffer[];
  // Wallet / Discover additions (backend ≥ 2026-04-23).
  // `is_lcp_plus` is true for cafes whose brand uses the global scheme.
  // `distance_miles` is set only when the consumer passes lat/lng; the
  // server clamps missing cafe coords to `null` (sorted to the end).
  is_lcp_plus: boolean;
  latitude: number | null;
  longitude: number | null;
  distance_miles: number | null;
  // Pay It Forward / Suspended Coffee (PRD §4.5, backend ≥ 2026-05-01).
  // `suspended_coffee_enabled` drives the "Community Board" badge in the
  // Explore card; `suspended_coffee_pool` is the current drink-unit count
  // surfaced inside CafeDetailsModal. Older API responses pre-dating
  // migration 0020 may omit these — treat undefined as false / 0 in UI.
  suspended_coffee_enabled?: boolean;
  suspended_coffee_pool?: number;
};

export function fetchDiscoverCafes(
  token: string,
  coords?: { lat: number; lng: number } | null,
): Promise<DiscoverCafe[]> {
  const qs = coords
    ? `?lat=${encodeURIComponent(coords.lat)}&lng=${encodeURIComponent(coords.lng)}`
    : "";
  return getJSON<DiscoverCafe[]>(`/api/consumer/cafes${qs}`, token);
}

// One row per GlobalLedger transaction (not per individual stamp). Sorted
// newest-first by the server; the client just renders in order.
export type HistoryEntry = {
  transaction_id: string;
  kind: "earn" | "redeem";
  quantity: number;
  cafe_name: string;
  cafe_address: string;
  timestamp: string;
};

export function fetchHistory(
  token: string,
  limit = 50,
): Promise<HistoryEntry[]> {
  return getJSON<HistoryEntry[]>(`/api/consumer/me/history?limit=${limit}`, token);
}

// ────────────────────────────────────────────────────────────────────
// Pay It Forward / Suspended Coffee — consumer donation (Mode 1)
// PRD §4.5.6. Burns 1 banked reward (10 stamps, brand-scoped) → +1
// to the cafe's Community Board pool.
// ────────────────────────────────────────────────────────────────────

export type SuspendedCoffeeMutationResponse = {
  ok: boolean;
  new_pool_balance: number;
};

// Three call shapes (matches DonateLoyaltyRequest validator on the
// server — see app/schemas.py):
//
//   1. { cafeId }                            — explicit cafe pick
//      (LCP+ combobox / "Choose another cafe" path).
//   2. { scope: "private", brandId }         — auto-route to the
//      user's most recent EARN at that brand (1-tap private donate).
//   3. { scope: "global" }                   — auto-route to the
//      user's most recent EARN at any LCP+ network cafe.
//
// 409 is the auto-route-mismatch path (last visited cafe isn't
// participating in Pay It Forward) — the UI should surface a "pick
// another cafe" prompt and re-fire shape 1 with a chosen cafeId.
export type DonateLoyaltyArgs =
  | { cafeId: string; scope?: undefined; brandId?: undefined }
  | { cafeId?: undefined; scope: "private"; brandId: string }
  | { cafeId?: undefined; scope: "global"; brandId?: undefined };

export function donateLoyalty(
  token: string,
  args: DonateLoyaltyArgs,
): Promise<SuspendedCoffeeMutationResponse> {
  const body: Record<string, string | null> = {};
  if (args.cafeId) body.cafe_id = args.cafeId;
  if (args.scope) body.scope = args.scope;
  if (args.brandId) body.brand_id = args.brandId;
  return postJSONWithAuth<SuspendedCoffeeMutationResponse>(
    "/api/consumer/suspended-coffee/donate-loyalty",
    body,
    token,
  );
}

// Authenticated variant of postJSON — same response/error shape but
// adds the Bearer header. Inlined here so callers don't have to set
// up Authorization manually for one-off endpoints.
async function postJSONWithAuth<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return mutateJSONWithAuth<T>("POST", path, body, token);
}

async function patchJSONWithAuth<T>(
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  return mutateJSONWithAuth<T>("PATCH", path, body, token);
}

async function mutateJSONWithAuth<T>(
  method: "POST" | "PATCH" | "PUT",
  path: string,
  body: unknown,
  token: string,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...DEFAULT_HEADERS,
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      "Couldn't reach the server. Check your connection and try again.",
    );
  }
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    // empty body is fine on 2xx
  }
  if (!res.ok) {
    const detail =
      (data && (data.detail || data.message)) ||
      `Request failed (${res.status}).`;
    throw new ApiError(res.status, String(detail));
  }
  return data as T;
}
