/**
 * Cloudflare Image Transformations (zone based, /cdn-cgi/image/…).
 *
 * Originals live untouched in R2; every visible image is resized, re-encoded
 * (AVIF/WebP via format=auto) and smart-cropped at Cloudflare's edge.
 * Browser-side compression is gone — the edge does the work now.
 */

/** Zone that has Transformations enabled. Sources must live on this zone. */
const ZONE_HOST = "upoharkabbo.com";
/**
 * Hosts that serve the app itself — their `/cdn-cgi/image/…` path is swallowed
 * by the app worker, so transformations must be requested on the asset host
 * (e.g. cdn.upoharkabbo.com) instead.
 */
const APP_HOSTS = new Set([ZONE_HOST, `www.${ZONE_HOST}`]);


/** Bucketed widths — fewer distinct variants means fewer billable transforms. */
export const IMAGE_WIDTHS = [160, 240, 320, 400, 480, 640, 768, 960, 1200, 1600, 1920] as const;

export type TransformOptions = {
  width: number;
  height?: number;
  /** cover = smart crop to the box, contain = fit inside, scale-down = never upscale. */
  fit?: "cover" | "contain" | "scale-down";
  /** auto = Cloudflare picks the most interesting region (faces, subject). */
  gravity?: "auto" | "center";
  quality?: number;
};

/** Snap an arbitrary pixel width up to the nearest bucket. */
export function bucketWidth(px: number): number {
  const last = IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]!;
  return IMAGE_WIDTHS.find((w) => w >= px) ?? last;
}

/**
 * Only assets hosted on a zone subdomain (e.g. cdn.upoharkabbo.com) can be
 * transformed — the apex/www hosts run the app worker and never expose
 * /cdn-cgi/image/.
 */
export function canTransform(src: string | null | undefined): src is string {
  if (!src) return false;
  if (src.includes("/cdn-cgi/")) return false;
  if (src.startsWith("data:") || src.startsWith("blob:")) return false;
  // Only absolute URLs on the zone can be transformed. Relative paths (bundled
  // assets, preview/dev hosts) must be served as-is.
  if (!/^https?:\/\//i.test(src)) return false;
  try {
    const host = new URL(src).hostname;
    if (APP_HOSTS.has(host)) return false;
    return host.endsWith(`.${ZONE_HOST}`);
  } catch {
    return false;
  }
}

/** Build a /cdn-cgi/image/ URL. Returns the original when it can't be transformed. */
export function cdnImage(src: string, opts: TransformOptions): string {
  if (!canTransform(src)) return src;
  const params = [
    `width=${Math.round(opts.width)}`,
    opts.height ? `height=${Math.round(opts.height)}` : null,
    `fit=${opts.fit ?? "cover"}`,
    `gravity=${opts.gravity ?? "auto"}`,
    `quality=${opts.quality ?? 82}`,
    "format=auto",
    "metadata=none",
    "onerror=redirect",
  ]
    .filter(Boolean)
    .join(",");
  // Requested on the asset host itself, using a path-relative source.
  const url = new URL(src);
  return `${url.origin}/cdn-cgi/image/${params}${url.pathname}${url.search}`;
}


/* ------------------------------------------------------------------ */
/* Per-device width memory                                             */
/* ------------------------------------------------------------------ */

const CACHE_KEY = "uk:img-width:v1";
const CACHE_LIMIT = 400;

type WidthCache = Record<string, number>;

function readCache(): WidthCache {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as WidthCache) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: WidthCache) {
  if (typeof localStorage === "undefined") return;
  try {
    const keys = Object.keys(cache);
    if (keys.length > CACHE_LIMIT) {
      for (const k of keys.slice(0, keys.length - CACHE_LIMIT)) delete cache[k];
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* storage full or blocked — transforms still work, just unmemoised */
  }
}

/** Width already served to this device for this image, if any. */
export function getCachedWidth(src: string): number | null {
  return readCache()[src] ?? null;
}

/** Remember the width so the same device always requests the same variant. */
export function rememberWidth(src: string, width: number) {
  const cache = readCache();
  if ((cache[src] ?? 0) >= width) return;
  cache[src] = width;
  writeCache(cache);
}
