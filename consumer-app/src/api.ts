import type { Session } from "./theme";

// Production DO droplet running the FastAPI backend + postgres via
// docker compose. Plain http:// until TLS is added — on Android this
// requires usesCleartextTraffic=true, on iOS an ATS exception.
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

export type LatestEarn = {
  transaction_id: string;
  cafe_name: string;
  cafe_address: string;
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

export type DiscoverOffer = {
  id: string;
  offer_type: "percent" | "fixed" | "bogo" | "double_stamps";
  target: "any_drink" | "all_pastries" | "food" | "merchandise" | "entire_order";
  amount: string | number | null;
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
