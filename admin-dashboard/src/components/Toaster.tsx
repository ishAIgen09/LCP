// Tiny in-house toast — admin-dashboard ships no toast lib (kept the
// dep tree minimal), so this is a 60-line replacement that covers the
// success/error UX the Settings page calls for. Module-level pubsub +
// a single mount point in DashboardLayout.
//
// API:
//   import { toast } from "@/components/Toaster"
//   toast.success("Password changed")
//   toast.error("Email already in use")

import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";

type Tone = "success" | "error";

type Item = {
  id: number;
  tone: Tone;
  message: string;
};

type Listener = (item: Item) => void;

const listeners = new Set<Listener>();
let nextId = 1;

function emit(tone: Tone, message: string) {
  const item: Item = { id: nextId++, tone, message };
  listeners.forEach((l) => l(item));
}

export const toast = {
  success: (message: string) => emit("success", message),
  error: (message: string) => emit("error", message),
};

const AUTO_DISMISS_MS = 4_000;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const listener: Listener = (item) => {
      setItems((prev) => [...prev, item]);
      // Auto-dismiss after the configured window. We schedule per item
      // (rather than running a single sweeper) so a burst of toasts
      // disappears in arrival order without one stalling the others.
      window.setTimeout(() => {
        setItems((prev) => prev.filter((p) => p.id !== item.id));
      }, AUTO_DISMISS_MS);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-[320px] flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="pointer-events-auto flex items-start gap-2.5 rounded-md border border-neutral-700 bg-neutral-900 px-3.5 py-3 shadow-lg"
        >
          {item.tone === "success" ? (
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
              strokeWidth={2.25}
            />
          ) : (
            <XCircle
              className="mt-0.5 h-4 w-4 shrink-0 text-rose-400"
              strokeWidth={2.25}
            />
          )}
          <div className="flex-1 text-[12.5px] leading-snug text-neutral-100">
            {item.message}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() =>
              setItems((prev) => prev.filter((p) => p.id !== item.id))
            }
            className="text-neutral-500 transition-colors hover:text-neutral-200"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} />
          </button>
        </div>
      ))}
    </div>
  );
}
