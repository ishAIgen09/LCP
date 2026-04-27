import { useEffect, useRef, useState } from "react";

// Smoothly tween a displayed integer toward a target. Used by the
// landing page's social-proof counter so the number ticks up visually
// when the live count from the Google Apps Script web app lands —
// instead of snapping from the mock baseline to the real total in a
// single jarring frame.
//
// Implementation:
//   - requestAnimationFrame loop, easeOutCubic interpolation
//   - First render seeds at the target (no animation on initial mount —
//     a "39 → 39" pop on first paint reads as a glitch)
//   - Subsequent target changes tween over `durationMs`
//   - rAF cancelled on unmount + on each new target so a fast double
//     update doesn't stack overlapping animations
//
// Returns the integer value to render. Always >= 0, always whole.
export function useCountUp(target: number, durationMs = 1200): number {
  const [display, setDisplay] = useState<number>(target);
  // Track the last-rendered value across renders so a new target
  // animates from where we *currently* are, not from a stale prop.
  const fromRef = useRef<number>(target);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // No-op when the target matches what's on screen — saves a frame
    // and silences the tween for unrelated re-renders.
    if (target === fromRef.current) return;

    const from = fromRef.current;
    const delta = target - from;
    const startedAt = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const t = Math.min(1, elapsed / durationMs);
      // easeOutCubic — fast at start, gentle settle. Reads as
      // "decisive" rather than "lazy" for a count-up.
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.round(from + delta * eased);
      setDisplay(value);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
        rafRef.current = null;
      }
    };

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs]);

  return display;
}
