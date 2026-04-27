import { useEffect, useState, useCallback } from "react";

export type Audience = "owner" | "consumer";

// Same Google Apps Script Web App URL as the WaitlistForm POST. The
// Apps Script `doGet` returns the live row count as JSON:
//   { "waitlist_count": 42 }
// CORS: GAS allows simple GETs cross-origin (no preflight). On any
// failure (network / CORS / parse) we leave `liveTotal` null and the
// UI hides the social-proof slot — there is **no mock fallback** so
// the number on screen is always the real number, never a baseline.
const WAITLIST_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbwhzhDwQwr1OLiE_GAuS6SJScuDucZXVYX8y9Wdozt0i5cPq-HVkMpXeQbixOzRbno/exec";

export function useWaitlistCounts() {
  // `null` until the GAS fetch resolves successfully. We deliberately
  // do NOT seed from localStorage / a baseline — consumers must hide
  // the slot while loading rather than show a fake placeholder.
  const [liveTotal, setLiveTotal] = useState<number | null>(null);
  const [flash, setFlash] = useState<Audience | null>(null);

  // Single-shot fetch on mount. Cancel-flag guards against a fast
  // unmount racing the await.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(WAITLIST_WEBHOOK_URL, {
          method: "GET",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        const n = Number(data?.waitlist_count);
        if (!cancelled && Number.isFinite(n) && n >= 0) {
          // Floor only protects against negative noise from a bad GAS
          // response — `0` is a legitimate value (empty sheet) and
          // single-digit values render verbatim, no clamp.
          setLiveTotal(Math.floor(n));
        }
      } catch {
        // Deliberate silence — slot stays hidden when the fetch
        // fails. Better to show no number than a fake one.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Optimistic bump after a successful local signup so the number on
  // screen reflects the new entry immediately. No-op if the GAS fetch
  // hasn't returned yet — the next page-load fetch will catch up.
  const increment = useCallback((audience: Audience) => {
    setLiveTotal((prev) => (prev === null ? prev : prev + 1));
    setFlash(audience);
    window.setTimeout(() => setFlash(null), 700);
  }, []);

  return { liveTotal, increment, flash };
}
