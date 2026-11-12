import { useEffect, useRef, useState } from "react";

import {
  IMAGE_WIDTHS,
  bucketWidth,
  canTransform,
  cdnImage,
  getCachedWidth,
  rememberWidth,
} from "@/lib/cdn-image";
import { cn } from "@/lib/utils";

type SmartImageProps = {
  src: string;
  alt: string;
  /** Width assumed before the element is measured (SSR / first paint). */
  baseWidth?: number;
  height?: number;
  /** Intrinsic dimensions reserve the correct layout space without forcing a crop. */
  intrinsicWidth?: number;
  intrinsicHeight?: number;
  fit?: "cover" | "contain" | "scale-down";
  gravity?: "auto" | "center";
  quality?: number;
  /** Marks the image as the LCP candidate: eager, high priority and preloaded. */
  priority?: boolean;
  /** Overrides the auto-computed `sizes` hint. */
  sizes?: string;
  className?: string;
  style?: React.CSSProperties;
  onClick?: (() => void) | undefined;
  onError?: (() => void) | undefined;
};


/**
 * Image element backed by Cloudflare Transformations.
 *
 * - resolves the real rendered width (× DPR, capped at 2) and snaps it to a bucket
 * - remembers that width per device in localStorage, so repeat visits reuse the
 *   exact same URL and hit the CDN cache instead of billing a new transform
 * - never downgrades a cached width, which keeps variant count minimal
 */
export function SmartImage({
  src,
  alt,
  baseWidth = 640,
  height,
  intrinsicWidth,
  intrinsicHeight,
  fit = "cover",
  gravity = "auto",
  quality,
  priority = false,
  sizes,
  className,
  style,
  onClick,
  onError,
}: SmartImageProps) {
  const ref = useRef<HTMLImageElement>(null);
  const [width, setWidth] = useState(() => getCachedWidth(src) ?? bucketWidth(baseWidth));
  const [cssWidth, setCssWidth] = useState<number | null>(null);
  const [rawFallback, setRawFallback] = useState(false);

  useEffect(() => setRawFallback(false), [src]);

  useEffect(() => {
    setWidth((prev) => Math.max(prev, getCachedWidth(src) ?? 0));
  }, [src]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !canTransform(src)) return;
    const measure = () => {
      const css = el.clientWidth || el.parentElement?.clientWidth || 0;
      if (!css) return;
      setCssWidth(css);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const next = bucketWidth(css * dpr);
      setWidth((prev) => {
        if (next <= prev) return prev;
        rememberWidth(src, next);
        return next;
      });
      if (next <= width) rememberWidth(src, width);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const finalSrc = rawFallback
    ? src
    : cdnImage(src, {
    width,
    ...(height ? { height } : {}),
    fit,
    gravity,
    ...(quality ? { quality } : {}),
      });

  const responsiveSrcSet =
    !rawFallback && canTransform(src)
      ? IMAGE_WIDTHS.filter((candidate) => candidate <= Math.max(1600, width))
          .map(
            (candidate) =>
              `${cdnImage(src, {
                width: candidate,
                ...(height ? { height } : {}),
                fit,
                gravity,
                ...(quality ? { quality } : {}),
              })} ${candidate}w`,
          )
          .join(", ")
      : undefined;

  /** Single fixed-width variant is served, so the hint mirrors the rendered box. */
  const autoSizes = sizes ?? `${Math.round(cssWidth ?? baseWidth)}px`;

  return (
    <>
      <img
        ref={ref}
        src={finalSrc}
        srcSet={responsiveSrcSet}
        alt={alt}
        width={intrinsicWidth ?? baseWidth}
        height={intrinsicHeight ?? height ?? baseWidth}
        sizes={autoSizes}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : "auto"}
        onClick={onClick}
        onError={() => {
          if (!rawFallback && finalSrc !== src) {
            setRawFallback(true);
            return;
          }
          onError?.();
        }}
        style={style}
        className={cn(className)}
      />
    </>
  );

}
