import type { Session } from "./theme";

// Local Windows Firewall blocked Python from serving on the LAN, so we're
// tunnelling the dev backend via localtunnel instead. Swap this back to a
// LAN IP or a resolver once the firewall rules are sorted.
export const API_BASE_URL = "https://real-heads-rest.loca.lt";

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

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
