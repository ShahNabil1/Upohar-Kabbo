/** Canonical public origin of the storefront. Used by sitemap/catalog feeds and JSON-LD. */
export const SITE_URL = "https://upoharkabbo.com";

export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Build a page title that always ends with the brand and stays under 60
 * characters so search results don't get truncated.
 */
export function pageTitle(name: string, brand = "উপহারকাব্য", max = 60): string {
  const suffix = ` — ${brand}`;
  const available = max - suffix.length;
  if (name.length <= available) return `${name}${suffix}`;
  let cut = name.slice(0, available);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  return `${cut}…${suffix}`;
}
