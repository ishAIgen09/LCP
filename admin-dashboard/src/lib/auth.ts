// Real super-admin auth — talks to POST /api/auth/super/login on the
// FastAPI backend and stashes the issued JWT in localStorage. The token
// is sent as `Authorization: Bearer …` on every /api/admin/platform/*
// request via lib/api.ts::sendJSON.
//
// Token shape: aud="super-admin", iss="indie-coffee-loop", brand-and-
// cafe scope intentionally absent. See app/tokens.py::encode_super_admin
// + app/auth.py::get_super_admin_session for the server-side decoder.
//
// Replaces the pre-2026-04-30 hardcoded `email === "admin..." && pw ===
// "admin"` placeholder. The seed account (admin@localcoffeeperks.com /
// password123) lives in scripts/seed_local_dev.py.

const SESSION_KEY = "lcp_super_admin_session_v1";

export type SuperAdminSession = {
  token: string;
  email: string;
};

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export async function login(
  email: string,
  password: string,
): Promise<SuperAdminSession> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/auth/super/login`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    throw new Error("Couldn't reach the API — check your connection.");
  }

  if (!res.ok) {
    let detail = "Those credentials don't match a super-admin account.";
    if (res.status >= 500) {
      detail = "Something went wrong on our end. Try again in a moment.";
    } else {
      try {
        const data = await res.json();
        if (data && typeof data.detail === "string") detail = data.detail;
      } catch {
        // non-JSON error → use the default copy above
      }
    }
    throw new Error(detail);
  }

  const data = (await res.json()) as {
    token: string;
    admin: { email: string };
  };
  const session: SuperAdminSession = {
    token: data.token,
    email: data.admin.email,
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): SuperAdminSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SuperAdminSession>;
    if (
      parsed &&
      typeof parsed.token === "string" &&
      typeof parsed.email === "string"
    ) {
      return { token: parsed.token, email: parsed.email };
    }
  } catch {
    // Corrupted JSON — drop it so the next login can write a clean copy.
    window.localStorage.removeItem(SESSION_KEY);
  }
  return null;
}

export function getToken(): string | null {
  return getSession()?.token ?? null;
}

export function isAuthenticated(): boolean {
  return getToken() !== null;
}
