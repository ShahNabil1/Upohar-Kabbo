import { SmartImage } from "@/components/site/smart-image";
import { Maximize2, ZoomIn } from "lucide-react";

import type { ComboContentItem } from "@/lib/types";
import { useLang } from "@/lib/language-context";
import { formatNumber, pick } from "@/lib/i18n";
import { ImageLightbox, useLightbox } from "@/components/site/image-lightbox";

export function ComboContents({
  items,
  selected,
  onSelect,
  highlightId,
}: {
  items: ComboContentItem[];
  selected?: Record<string, string>;
  onSelect?: (itemId: string, variantId: string) => void;
  /** Combo row advertised by a catalogue ad (?sku=…) — gently highlighted. */
  highlightId?: string | null;
}) {
  const { lang } = useLang();
  const lightbox = useLightbox();
  const galleryImages = items
    .map((item) => ({
      src: item.image,
      alt: pick(lang, item.nameBn, item.nameEn),
    }))
    .filter((img): img is { src: string; alt: string } => Boolean(img.src));
  if (items.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
        <h2 className="font-display-bn text-center text-xl font-bold leading-snug sm:text-2xl">
          {lang === "bn" ? "এই প্যাকেজে যা যা থাকছে" : "What's inside this package"}
        </h2>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
      </div>

      <p className="mt-2 text-center text-sm text-muted-foreground">
        {lang === "bn"
          ? `মোট ${formatNumber(lang, items.reduce((n, i) => n + i.quantity, 0))} টি আইটেম`
          : `${items.reduce((n, i) => n + i.quantity, 0)} items in total`}
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, i) => (
          <li
            key={item.id}
            className={`group flex items-center gap-3 rounded-xl border bg-card p-3 transition-shadow duration-300 hover:shadow-[var(--shadow-lift)] ${
              highlightId === item.id
                ? "border-primary shadow-[var(--shadow-lift)] ring-1 ring-primary/30"
                : "border-border"
            }`}
          >
            <button
              type="button"
              disabled={!item.image}
              aria-label={`View ${pick(lang, item.nameBn, item.nameEn)}`}
              className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-secondary disabled:cursor-default"
              onClick={() => item.image && lightbox.open(galleryImages, galleryImages.findIndex((img) => img.src === item.image))}
            >
              {item.image ? (
                <>
                  <SmartImage
                    src={item.image}
                    alt={pick(lang, item.nameBn, item.nameEn)}
                    baseWidth={160}
                    fit="contain"
                    className="size-full cursor-zoom-in object-contain transition-transform duration-500 group-hover:scale-105"
                  />

                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-foreground/25 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <Maximize2 className="size-5 text-background drop-shadow" strokeWidth={2.5} />
                  </span>
                  <span className="pointer-events-none absolute bottom-1 right-1 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm ring-1 ring-background/70 transition-opacity duration-300 group-hover:opacity-0">
                    <ZoomIn className="size-3.5" strokeWidth={2.5} />
                  </span>
                </>
              ) : (
                <div className="flex size-full items-center justify-center text-sm font-bold text-muted-foreground/60">
                  {formatNumber(lang, i + 1)}
                </div>
              )}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold leading-snug">
                {pick(lang, item.nameBn, item.nameEn)}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold">
                  {lang === "bn"
                    ? `${formatNumber(lang, item.quantity)} টি`
                    : `Qty ${item.quantity}`}
                </span>
                {item.isFree ? (
                  <span className="rounded-full bg-success/10 px-2 py-0.5 font-semibold text-success">
                    {lang === "bn" ? "ফ্রি" : "Free"}
                  </span>
                ) : null}
              </p>
              {item.variants.length > 0 ? (
                <div className="mt-2">
                  <p className="mb-1 text-xs font-semibold text-foreground">
                    {pick(lang, item.variants[0]?.groupNameBn, item.variants[0]?.groupNameEn)}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {item.variants.map((variant) => (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => onSelect?.(item.id, variant.id)}
                        className={`rounded-md border px-2.5 py-1 text-xs font-bold transition-colors ${
                          selected?.[item.id] === variant.id
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background hover:border-primary"
                        }`}
                      >
                        {pick(lang, variant.valueBn, variant.valueEn)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <ImageLightbox
        images={galleryImages}
        startIndex={lightbox.startIndex}
        isOpen={lightbox.isOpen}
        onClose={lightbox.close}
      />
    </section>
  );
}
