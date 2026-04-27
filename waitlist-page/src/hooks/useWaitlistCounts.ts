import { useEffect, useState, useCallback } from "react";

export type Audience = "owner" | "consumer";

const STORAGE_KEY = "lcp_waitlist_counts_v1";
const BASELINE = { owner: 47, consumer: 312 };

// Same Google Apps Script Web App URL as the WaitlistForm POST. The Apps
// Script handler routes GETs to a count-only response shape:
//   { "waitlist_count": 42 }
// CORS: GAS allows simple GETs cross-origin (no preflight), so the
// default `fetch` mode works. We swallow any error silently and fall
// back to the mock baseline so the UI never shows a broken counter.
const WAITLIST_WEBHOOK_URL =
  "https://script.google.com/macros/s/AKfycbwhzhDwQwr1OLiE_GAuS6SJScuDucZXVYX8y9Wdozt0i5cPq-HVkMpXeQbixOzRbno/exec";

type Counts = { owner: number; consumer: number };

function read(): Counts {
  if (typeof window === "undefined") return BASELINE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return BASELINE;
    const parsed = JSON.parse(raw) as Counts;
    return {
      owner: Math.max(BASELINE.owner, parsed.owner ?? 0),
      consumer: Math.max(BASELINE.consumer, parsed.consumer ?? 0),
    };
  } catch {
    return BASELINE;
  }
}

function write(c: Counts) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export function useWaitlistCounts() {
  const [counts, setCounts] = useState<Counts>(BASELINE);
  const [flash, setFlash] = useState<Audience | null>(null);
  // Server-reported total. null until the GAS fetch resolves; any
  // consumer can fall back to `counts.owner + counts.consumer` (the
  // mock total) during the brief load window so the pill never reads
  // zero or "—".
  const [liveTotal, setLiveTotal] = useState<number | null>(null);

  useEffect(() => {
    setCounts(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCounts(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Single-shot fetch on mount — pulls the live count from the same
  // Apps Script Web App URL the form POSTs to. Cancel-flag pattern so
  // a fast unmount doesn't race a setState onto a torn-down component.
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
          setLiveTotal(Math.floor(n));
        }
      } catch {
        // Network / CORS / parse failure — leave liveTotal null so
        // consumers fall through to the mock total. Deliberate silence.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const increment = useCallback((audience: Audience) => {
    setCounts((prev) => {
      const next = { ...prev, [audience]: prev[audience] + 1 };
      write(next);
      return next;
    });
    // Optimistically bump the live total too — a successful local
    // signup should reflect immediately rather than waiting for the
    // next page-load fetch. If the server hasn't reported yet, treat
    // the mock total as the current value to bump.
    setLiveTotal((prev) => {
      const base =
        prev ??
        (() => {
          const c = read();
          return c.owner + c.consumer;
        })();
      return base + 1;
    });
    setFlash(audience);
    window.setTimeout(() => setFlash(null), 700);
  }, []);

  // Public total: live if available, mock otherwise. Consumers should
  // prefer `total` over computing from `counts` themselves so the
  // social-proof number stays consistent across the page.
  const total = liveTotal ?? counts.owner + counts.consumer;

  return { counts, increment, flash, total, liveTotal };
}
