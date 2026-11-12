import { SmartImage } from "@/components/site/smart-image";
import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { X } from "lucide-react";

import type { SettingValue } from "@/lib/types";

export type PromoPopup = {
  enabled: boolean;
  url: string;
  link: string | null;
  alt: string | null;
  trigger: "delay" | "scroll" | "both";
  delaySeconds: number;
  scrollPercent: number;
};

export const DEFAULT_PROMO_POPUP: PromoPopup = {
  enabled: false,
  url: "",
  link: null,
  alt: null,
  trigger: "delay",
  delaySeconds: 5,
  scrollPercent: 30,
};

/** Reads the promo popup config out of the site_settings map, tolerating partial shapes. */
export function readPromoPopup(value: Record<string, SettingValue> | undefined): PromoPopup {
  const row = (value ?? {}) as Record<string, SettingValue>;
  const str = (k: string) => (typeof row[k] === "string" ? (row[k] as string).trim() : "");
  const num = (k: string, fb: number) => (typeof row[k] === "number" ? (row[k] as number) : fb);
  const trigger = str("trigger");
  return {
    enabled: row["enabled"] === true,
    url: str("url"),
    link: str("link") || null,
    alt: str("alt") || null,
    trigger: trigger === "scroll" || trigger === "both" ? trigger : "delay",
    delaySeconds: Math.min(120, Math.max(0, num("delay_seconds", 5))),
    scrollPercent: Math.min(95, Math.max(5, num("scroll_percent", 30))),
  };
}

const SESSION_KEY = "uk_promo_popup_seen";

export function PromoPopup({ config }: { config: PromoPopup }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const active = config.enabled && Boolean(config.url);

  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    try {
      if (window.sessionStorage.getItem(SESSION_KEY) === config.url) return;
    } catch {
      /* private mode — just show it */
    }

    let done = false;
    const show = () => {
      if (done) return;
      done = true;
      setOpen(true);
      try {
        window.sessionStorage.setItem(SESSION_KEY, config.url);
      } catch {
        /* ignore */
      }
      cleanup();
    };

    let timer: number | undefined;
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const pct = max > 0 ? (window.scrollY / max) * 100 : 0;
      if (pct >= config.scrollPercent) show();
    };
    const cleanup = () => {
      if (timer) window.clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
    };

    if (config.trigger === "delay" || config.trigger === "both") {
      timer = window.setTimeout(show, config.delaySeconds * 1000);
    }
    if (config.trigger === "scroll" || config.trigger === "both") {
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return cleanup;
  }, [active, config.url, config.trigger, config.delaySeconds, config.scrollPercent]);

  // Lock background scroll while open.
  useEffect(() => {
    if (!open) return;
    const { body, documentElement: html } = document;
    const y = window.scrollY;
    const prev = { top: body.style.top, position: body.style.position, width: body.style.width };
    body.style.position = "fixed";
    body.style.top = `-${y}px`;
    body.style.width = "100%";
    html.style.overflow = "hidden";
    return () => {
      const prevBehavior = html.style.scrollBehavior;
      html.style.scrollBehavior = "auto";
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      html.style.overflow = "";
      window.scrollTo(0, y);
      // Restore smooth scrolling after the jump-free restore.
      requestAnimationFrame(() => {
        html.style.scrollBehavior = prevBehavior;
      });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!active || !open) return null;

  const go = (e: React.MouseEvent) => {
    if (!config.link) return;
    setOpen(false);
    if (config.link.startsWith("/")) {
      e.preventDefault();
      void router.navigate({ to: config.link });
    }
  };

  const image = (
    <SmartImage
      src={config.url}
      alt={config.alt ?? "অফার"}
      baseWidth={768}
      fit="contain"
      className="block h-auto max-h-[82vh] w-full rounded-2xl object-contain"
    />
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={config.alt ?? "অফার"}
      className="promo-popup-overlay fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="promo-popup-card relative w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          aria-label="বন্ধ করুন"
          onClick={() => setOpen(false)}
          className="absolute -top-3 -right-3 z-10 grid size-9 cursor-pointer place-items-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <X className="size-5" />
        </button>

        {config.link ? (
          <a href={config.link} onClick={go} className="block cursor-pointer">
            {image}
          </a>
        ) : (
          image
        )}
      </div>
    </div>
  );
}
