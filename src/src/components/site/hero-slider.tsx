import { SmartImage } from "@/components/site/smart-image";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { SettingValue } from "@/lib/types";

export type HeroSlide = {
  url: string;
  link: string | null;
  alt: string | null;
};

export const MAX_HERO_SLIDES = 3;

/** Reads hero slides out of the site_settings map, tolerating partial/legacy shapes. */
export function readHeroSlides(value: Record<string, SettingValue> | undefined): HeroSlide[] {
  const raw = value?.["slides"];
  if (!Array.isArray(raw)) return [];
  const slides: HeroSlide[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, SettingValue>;
    const url = typeof row["url"] === "string" ? row["url"].trim() : "";
    if (!url) continue;
    const link = typeof row["link"] === "string" && row["link"].trim() ? row["link"].trim() : null;
    const alt = typeof row["alt"] === "string" && row["alt"].trim() ? row["alt"].trim() : null;
    slides.push({ url, link, alt });
  }
  return slides.slice(0, MAX_HERO_SLIDES);
}

const INTERVAL = 5000;

export function HeroSlider({ slides }: { slides: HeroSlide[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = slides.length;

  const go = useCallback(
    (next: number) => setIndex(((next % count) + count) % count),
    [count],
  );

  useEffect(() => {
    if (paused || count < 2) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), INTERVAL);
    return () => window.clearInterval(id);
  }, [paused, count]);

  if (count === 0) return null;

  const onSlideActivate = (slide: HeroSlide, e: React.MouseEvent) => {
    if (!slide.link) return;
    const isInternal = slide.link.startsWith("/");
    if (isInternal) {
      e.preventDefault();
      void router.navigate({ to: slide.link });
    }
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="হিরো ব্যানার"
      className="relative isolate overflow-hidden border-b border-border bg-surface"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={(e) => {
        setPaused(true);
        touchX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX ?? null;
        touchX.current = null;
        if (start !== null && end !== null && Math.abs(end - start) > 40) {
          go(index + (end < start ? 1 : -1));
        }
      }}
    >
      <div className="mx-auto max-w-6xl px-0 sm:px-4 sm:py-6">
        <div className="relative overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-[var(--shadow-card)]">
          <div
            className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {slides.map((slide, i) => {
              const img = (
                <SmartImage
                  src={slide.url}
                  alt={slide.alt ?? "উপহারকাব্য ব্যানার"}
                  baseWidth={1200}
                  intrinsicWidth={1600}
                  intrinsicHeight={600}
                  sizes="(max-width: 639px) 100vw, 1152px"
                  priority={i === 0}
                  className="h-auto w-full object-contain sm:aspect-[21/9] sm:object-cover"
                />
              );
              return (
                <div
                  key={`${slide.url}-${i}`}
                  className="w-full shrink-0"
                  aria-hidden={i !== index}
                  {...(i !== index ? { inert: true } : {})}
                >
                  {slide.link ? (
                    <a
                      href={slide.link}
                      onClick={(e) => onSlideActivate(slide, e)}
                      tabIndex={i === index ? 0 : -1}
                      className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      {img}
                    </a>
                  ) : (
                    img
                  )}
                </div>
              );
            })}
          </div>

          {count > 1 ? (
            <>
              <button
                type="button"
                aria-label="আগের ব্যানার"
                onClick={() => go(index - 1)}
                className="absolute left-2 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-card sm:grid"
              >
                <ChevronLeft className="size-5" />
              </button>
              <button
                type="button"
                aria-label="পরের ব্যানার"
                onClick={() => go(index + 1)}
                className="absolute right-2 top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-card/85 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-card sm:grid"
              >
                <ChevronRight className="size-5" />
              </button>
              <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
                {slides.map((s, i) => (
                  <button
                    key={`dot-${s.url}-${i}`}
                    type="button"
                    aria-label={`ব্যানার ${i + 1}`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className="grid size-11 place-items-center rounded-full"
                  >
                    <span
                      aria-hidden
                      className={
                        i === index
                          ? "h-2 w-6 rounded-full bg-primary transition-all"
                          : "size-2 rounded-full bg-card/80 transition-all"
                      }
                    />
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
