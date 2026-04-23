// Admin-dashboard API client. Points at the droplet by default. Override
// via a local `.env.local` with `VITE_API_BASE_URL=http://localhost:8000`
// when running the backend locally.
//
// No auth header is attached today — the super-admin JWT scope doesn't
// exist yet and /api/admin/overview is intentionally open at the scaffold
// level (see the SECURITY comment on the backend route). When auth lands,
// inject an `Authorization: Bearer …` header in the fetch options below.
const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://178.62.123.228:8000";

export type AdminOverview = {
  total_customers: number;
  total_cafes: number;
  total_stamps_issued: number;
  total_rewards_redeemed: number;
};

export type SchemeType = "global" | "private";

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type AdminCafe = {
  id: string;
  name: string;
  address: string;
  brand_id: string;
  brand_name: string;
  scheme_type: SchemeType;
  subscription_status: SubscriptionStatus;
  created_at: string;
};

export type LedgerEventType = "EARN" | "REDEEM";

export type AdminTransaction = {
  id: string;
  created_at: string;
  event_type: LedgerEventType;
  stamp_delta: number;
  customer_id: string;
  customer_till_code: string;
  customer_email: string | null;
  cafe_id: string;
  cafe_name: string;
  brand_id: string;
  brand_name: string;
  scheme_type: SchemeType;
};

async function getJSON<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch {
    throw new Error("Couldn't reach the API — check your connection.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (body && typeof body.detail === "string") detail = body.detail;
    } catch {
      // fall through to the generic message
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export function fetchOverview(): Promise<AdminOverview> {
  return getJSON<AdminOverview>("/api/admin/overview");
}

// Platform-wide cafe list. Namespaced under /api/admin/platform/ because
// /api/admin/cafes is already taken by the brand-scoped B2B endpoint
// that requires a brand-admin JWT.
export function fetchCafes(): Promise<AdminCafe[]> {
  return getJSON<AdminCafe[]>("/api/admin/platform/cafes");
}

// Platform-wide ledger feed. Default cap of 500 matches the backend's
// default; pass a larger number up to 5000 for a deeper history pull.
export function fetchTransactions(limit = 500): Promise<AdminTransaction[]> {
  return getJSON<AdminTransaction[]>(
    `/api/admin/platform/transactions?limit=${encodeURIComponent(limit)}`,
  );
}
