// Hardcoded admin gate — scaffolding only. Swap for a real JWT-backed
// session once the backend exposes an admin-scoped auth endpoint.
// Treat this as a placeholder that keeps the routing + layout wiring
// honest (protected vs public routes) without blocking on backend work.

const ADMIN_EMAIL = "admin@localcoffeeperks.com";
const ADMIN_PASSWORD = "admin";
const SESSION_KEY = "lcp-admin-session";

export function login(email: string, password: string): boolean {
  // Case-insensitive email, exact-match password. No rate limiting, no
  // lockout — fine for a local-only scaffold; absolutely NOT safe to ship.
  const ok =
    email.trim().toLowerCase() === ADMIN_EMAIL &&
    password === ADMIN_PASSWORD;
  if (ok) {
    localStorage.setItem(SESSION_KEY, "1");
  }
  return ok;
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  // Safe to call during SSR / node — localStorage will be undefined there,
  // and we return false. Currently this is only hit client-side but the
  // guard is cheap and future-proofs an SSR migration.
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(SESSION_KEY) === "1";
}
