import { useEffect, useState, useCallback } from "react";

export type Audience = "owner" | "consumer";

const STORAGE_KEY = "lcp_waitlist_counts_v1";
const BASELINE = { owner: 47, consumer: 312 };

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

  useEffect(() => {
    setCounts(read());
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCounts(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const increment = useCallback((audience: Audience) => {
    setCounts((prev) => {
      const next = { ...prev, [audience]: prev[audience] + 1 };
      write(next);
      return next;
    });
    setFlash(audience);
    window.setTimeout(() => setFlash(null), 700);
  }, []);

  return { counts, increment, flash };
}
