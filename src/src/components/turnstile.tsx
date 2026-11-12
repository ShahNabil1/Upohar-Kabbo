import { useEffect, useId, useRef } from "react";

/** Cloudflare Turnstile public site key (safe to ship to the browser). */
export const TURNSTILE_SITE_KEY = "0x4AAAAAAFOwShoRrfF_XwK1";

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  remove: (id: string) => void;
  reset: (id?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loader: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loader) return loader;
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("turnstile unavailable"));
    });
    script.addEventListener("error", () => reject(new Error("turnstile script failed")));
    if (!existing) document.head.appendChild(script);
  });
  return loader;
}

export type TurnstileHandle = { reset: () => void };

/**
 * Renders a Turnstile widget. Calls `onToken` with a fresh token, or `null`
 * when it expires / errors so the caller can disable submit.
 */
export function Turnstile({
  onToken,
  handleRef,
  theme = "light",
  className,
}: {
  onToken: (token: string | null) => void;
  handleRef?: React.MutableRefObject<TurnstileHandle | null>;
  theme?: "light" | "dark" | "auto";
  className?: string;
}) {
  const id = useId();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useEffect(() => {
    let widgetId: string | null = null;
    let cancelled = false;
    const host = hostRef.current;
    if (!host) return;

    void loadTurnstile()
      .then((api) => {
        if (cancelled || !hostRef.current) return;
        widgetId = api.render(hostRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          callback: (token: string) => cbRef.current(token),
          "expired-callback": () => cbRef.current(null),
          "error-callback": () => cbRef.current(null),
        });
        if (handleRef) {
          handleRef.current = {
            reset: () => {
              if (widgetId) api.reset(widgetId);
              cbRef.current(null);
            },
          };
        }
      })
      .catch(() => cbRef.current(null));

    return () => {
      cancelled = true;
      if (handleRef) handleRef.current = null;
      try {
        if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
      } catch {
        /* widget already gone */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, theme]);

  return <div ref={hostRef} className={className} />;
}
