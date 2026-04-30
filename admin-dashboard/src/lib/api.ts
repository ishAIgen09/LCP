// Empty default → production builds emit same-origin paths (e.g.
// `/api/admin/overview`) so Nginx on hq.localcoffeeperks.com can
// reverse-proxy /api/* to FastAPI on :8000 with no mixed-content
// issues over HTTPS.
//
// Local dev still talks to the droplet via .env.local with
// VITE_API_BASE_URL=http://178.62.123.228:8000.
//
// As of 2026-04-30 every request rides with `Authorization: Bearer
// <super-admin JWT>`. The token comes from lib/auth.ts; if it's missing
// we still send the request bare (so the unauth'd /api/admin/overview
// scaffold endpoints keep working), but anything guarded by
// Depends(get_super_admin_session) will 401 — at which point the
// caller's catch surfaces the error to the UI.
import { getToken } from "./auth";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

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
  | "incomplete"
  | "pending_cancellation";

export type AdminCafe = {
  id: string;
  name: string;
  address: string;
  brand_id: string;
  brand_name: string;
  scheme_type: SchemeType;
  subscription_status: SubscriptionStatus;
  billing_status: SubscriptionStatus;
  created_at: string;
};

export type CafeStatsRange = "today" | "7d" | "30d" | "ytd" | "1y" | "all";

export type CafeStats = {
  cafe_id: string;
  cafe_name: string;
  range: CafeStatsRange;
  range_start: string | null;
  range_end: string;
  stamps_issued: number;
  rewards_redeemed: number;
  net_roi_pence: number;
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

export type AdminCustomer = {
  id: string;
  till_code: string;
  email: string | null;
  created_at: string;
  global_stamps: number;
  total_private_stamps: number;
  is_suspended: boolean;
  // Server-derived velocity flag — true when the customer has earned
  // ≥ N stamps in the last hour (see /api/admin/platform/customers).
  // Optional so older backends that haven't shipped this column yet
  // still hydrate the table without crashing.
  is_suspicious?: boolean;
};

export type AdminFlaggedActivity = {
  id: string;
  cafe_id: string;
  cafe_name: string;
  brand_id: string;
  brand_name: string;
  attempted_ip: string;
  expected_ip: string | null;
  attempted_at: string;
};

export type AdminCafeSecurity = {
  cafe_id: string;
  last_known_ip: string | null;
  network_locked_at: string | null;
  recent_attempts: AdminFlaggedActivity[];
};

export type AdjustStampsBody = {
  scheme_type: SchemeType;
  brand_id: string | null;
  amount: number;
};

export type AdminBillingRow = {
  cafe_id: string;
  cafe_name: string;
  brand_id: string;
  brand_name: string;
  scheme_type: SchemeType;
  billing_status: SubscriptionStatus;
  monthly_rate_pence: number;
};

export type AdminBilling = {
  total_mrr_pence: number;
  active_subscription_count: number;
  rows: AdminBillingRow[];
};

async function getJSON<T>(path: string): Promise<T> {
  return sendJSON<T>("GET", path);
}

async function sendJSON<T>(
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        ...(body !== undefined
          ? { "Content-Type": "application/json" }
          : null),
        ...(token ? { Authorization: `Bearer ${token}` } : null),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the API — check your connection.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === "string") detail = data.detail;
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

export function fetchFlaggedActivities(): Promise<AdminFlaggedActivity[]> {
  return getJSON<AdminFlaggedActivity[]>(
    "/api/admin/platform/flagged-activities",
  );
}

export function fetchCafeSecurity(cafeId: string): Promise<AdminCafeSecurity> {
  return getJSON<AdminCafeSecurity>(
    `/api/admin/platform/cafes/${encodeURIComponent(cafeId)}/security`,
  );
}

export function resetCafeNetworkLock(
  cafeId: string,
): Promise<AdminCafeSecurity> {
  return sendJSON<AdminCafeSecurity>(
    "POST",
    `/api/admin/platform/cafes/${encodeURIComponent(cafeId)}/reset-network-lock`,
  );
}

export type AdminCafeUpdate = {
  scheme_type?: SchemeType;
  billing_status?: SubscriptionStatus;
};

export function updatePlatformCafe(
  cafeId: string,
  body: AdminCafeUpdate,
): Promise<AdminCafe> {
  return sendJSON<AdminCafe>(
    "POST",
    `/api/admin/platform/cafes/${encodeURIComponent(cafeId)}/update`,
    body,
  );
}

// Platform-wide cafe list. Namespaced under /api/admin/platform/ because
// /api/admin/cafes is already taken by the brand-scoped B2B endpoint
// that requires a brand-admin JWT.

export type CafeJoinedWindow = "last_7_days" | "last_30_days" | "all";

export type CafeListFilter = {
  status?: SubscriptionStatus | "all"; // "all" or unset → no filter
  joined?: CafeJoinedWindow;
};

export function fetchCafes(filter?: CafeListFilter): Promise<AdminCafe[]> {
  const params = new URLSearchParams();
  if (filter?.status && filter.status !== "all") {
    params.set("status", filter.status);
  }
  if (filter?.joined && filter.joined !== "all") {
    params.set("joined", filter.joined);
  }
  const qs = params.toString();
  return getJSON<AdminCafe[]>(
    `/api/admin/platform/cafes${qs ? `?${qs}` : ""}`,
  );
}

export type AdminBrand = {
  id: string;
  name: string;
  slug: string;
  scheme_type: SchemeType;
  subscription_status: SubscriptionStatus;
  // Brand responses vary across endpoints (some snake, some camel);
  // this type covers the shape of POST /platform/brands.
};

export function createBrand(body: {
  name: string;
  scheme_type: SchemeType;
  contact_email: string;
}): Promise<AdminBrand> {
  return sendJSON<AdminBrand>("POST", "/api/admin/platform/brands", body);
}

export function createPlatformCafe(body: {
  brand_id: string;
  name: string;
  address: string;
  store_number?: string;
}): Promise<AdminCafe> {
  return sendJSON<AdminCafe>("POST", "/api/admin/platform/cafes", body);
}

export type BrandInviteResponse = {
  setup_url: string;
  token: string;
  expires_at: string;
  brand_id: string;
  brand_name: string;
  email: string;
};

// Super-Admin → brand-admin onboarding handshake. Returns a signed
// 48h JWT setup link the operator can paste into an email/Slack DM
// until SMTP delivery lands.
export function inviteBrandAdmin(body: {
  email: string;
  brand_id: string;
}): Promise<BrandInviteResponse> {
  return sendJSON<BrandInviteResponse>(
    "POST",
    "/api/admin/platform/invite-brand-admin",
    body,
  );
}

// Platform-wide ledger feed. Default cap of 500 matches the backend's
// default; pass a larger number up to 5000 for a deeper history pull.
export function fetchTransactions(limit = 500): Promise<AdminTransaction[]> {
  return getJSON<AdminTransaction[]>(
    `/api/admin/platform/transactions?limit=${encodeURIComponent(limit)}`,
  );
}

export function fetchCustomers(): Promise<AdminCustomer[]> {
  return getJSON<AdminCustomer[]>("/api/admin/platform/customers");
}

export function setCustomerSuspended(
  customerId: string,
  isSuspended: boolean,
): Promise<AdminCustomer> {
  return sendJSON<AdminCustomer>(
    "PATCH",
    `/api/admin/platform/customers/${encodeURIComponent(customerId)}/suspend`,
    { is_suspended: isSuspended },
  );
}

export function adjustCustomerStamps(
  customerId: string,
  body: AdjustStampsBody,
): Promise<AdminCustomer> {
  return sendJSON<AdminCustomer>(
    "POST",
    `/api/admin/platform/customers/${encodeURIComponent(customerId)}/adjust-stamps`,
    body,
  );
}

export function fetchBilling(): Promise<AdminBilling> {
  return getJSON<AdminBilling>("/api/admin/platform/billing");
}

export function setCafeBillingStatus(
  cafeId: string,
  status: SubscriptionStatus,
): Promise<AdminBillingRow> {
  return sendJSON<AdminBillingRow>(
    "PATCH",
    `/api/admin/platform/cafes/${encodeURIComponent(cafeId)}/billing-status`,
    { status },
  );
}

export function fetchCafeStats(
  cafeId: string,
  range: CafeStatsRange,
): Promise<CafeStats> {
  return getJSON<CafeStats>(
    `/api/admin/platform/cafes/${encodeURIComponent(
      cafeId,
    )}/stats?range=${encodeURIComponent(range)}`,
  );
}

// Super-admin team management — Settings tab on admin-dashboard.
// Both routes are guarded server-side with Depends(get_super_admin_session);
// the JWT goes up automatically via getToken() in sendJSON.

export function changeSuperAdminPassword(body: {
  current_password: string;
  new_password: string;
}): Promise<{ ok: boolean }> {
  return sendJSON<{ ok: boolean }>("POST", "/api/auth/super/change-password", body);
}

export function createSuperAdmin(body: {
  email: string;
  password: string;
}): Promise<{ email: string }> {
  return sendJSON<{ email: string }>("POST", "/api/auth/super/create", body);
}

export type AiAgentReply = { reply: string };

export function postAiAgent(message: string): Promise<AiAgentReply> {
  return sendJSON<AiAgentReply>("POST", "/api/admin/platform/ai-agent", {
    message,
  });
}

// Fetch a CSV and trigger a browser download. Goes through fetch (not a
// plain <a href>) so a 4xx surfaces as a throwable error the caller can
// show in a toast, and the filename comes from Content-Disposition when
// the server provides one (falls back to `fallbackName` otherwise).
export async function downloadCsv(
  path: string,
  fallbackName: string,
): Promise<void> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new Error("Couldn't reach the API — check your connection.");
  }
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const data = await res.json();
      if (data && typeof data.detail === "string") detail = data.detail;
    } catch {
      // non-JSON error body → stick with the generic message
    }
    throw new Error(detail);
  }
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export function exportCafesCsv(filter?: CafeListFilter): Promise<void> {
  const params = new URLSearchParams();
  if (filter?.status && filter.status !== "all") {
    params.set("status", filter.status);
  }
  if (filter?.joined && filter.joined !== "all") {
    params.set("joined", filter.joined);
  }
  const qs = params.toString();
  return downloadCsv(
    `/api/admin/export/cafes${qs ? `?${qs}` : ""}`,
    "lcp-cafes.csv",
  );
}
