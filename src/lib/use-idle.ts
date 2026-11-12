import { useEffect, useRef } from "react";

/**
 * Calls `onIdle` once after `ms` of no user activity.
 *
 * Activity = pointer, keyboard, wheel, touch, scroll or the tab regaining
 * focus. The timer restarts on every event (throttled to once per second so a
 * moving mouse does not reset state hundreds of times per second) and the
 * callback fires at most once per mount/enable cycle.
 */
export function useIdleTimeout(ms: number, onIdle: () => void, enabled = true) {
  const cb = useRef(onIdle);
  cb.current = onIdle;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let fired = false;
    let last = 0;

    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (fired) return;
        fired = true;
        cb.current();
      }, ms);
    };

    const activity = () => {
      if (fired) return;
      const now = Date.now();
      if (now - last < 1000) return;
      last = now;
      arm();
    };

    const events = [
      "mousemove",
      "mousedown",
      "keydown",
      "wheel",
      "touchstart",
      "scroll",
      "focus",
    ] as const;
    for (const e of events) window.addEventListener(e, activity, { passive: true });
    document.addEventListener("visibilitychange", activity);

    arm();

    return () => {
      if (timer) clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, activity);
      document.removeEventListener("visibilitychange", activity);
    };
  }, [ms, enabled]);
}
