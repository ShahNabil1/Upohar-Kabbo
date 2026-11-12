/**
 * Integration credentials (server-only).
 *
 * Values live in `public.integration_credentials` (admin-only via RLS) and are
 * read here with the service-role client. Anything missing from the database
 * falls back to the matching environment variable, so existing deployments
 * keep working unchanged while the values are migrated into the admin panel.
 */

export const INTEGRATION_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
  "CLOUDFLARE_ANALYTICS_API_TOKEN",
  "BULKSMSBD_API_KEY",
  "BULKSMSBD_SENDER_ID",
  "BDCOURIER_API_KEY",
  "META_ACCESS_TOKEN",
  "META_AD_ACCOUNT_ID",
  "META_PIXEL_ID",
  "META_PAGE_ID",
  "META_BUSINESS_ID",
  "META_CATALOG_ID",
  "META_API_VERSION",
  "GTM_CONTAINER_ID",
  "META_CAPI_ACCESS_TOKEN",
  "META_TEST_EVENT_CODE",
  "TIKTOK_PIXEL_ID",
  "TIKTOK_EVENTS_ACCESS_TOKEN",
  "TIKTOK_TEST_EVENT_CODE",
  "GA4_MEASUREMENT_ID",
  "GA4_API_SECRET",
] as const;


export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

type CacheEntry = { values: Record<string, string>; at: number };

const TTL_MS = 30_000;
let cache: CacheEntry | null = null;

/** Drops the in-memory cache — called right after an admin saves or removes. */
export function clearIntegrationCache() {
  cache = null;
}

async function loadFromDb(): Promise<Record<string, string>> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("integration_credentials")
      .select("key, value");
    if (error) return {};
    const out: Record<string, string> = {};
    for (const row of data ?? []) {
      const value = (row.value ?? "").trim();
      if (value) out[row.key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

/** Env fallback, ignoring scaffold placeholders so they never look configured. */
function envValue(key: string): string {
  const v = (process.env[key] ?? "").trim();
  return /PLACEHOLDER/i.test(v) ? "" : v;
}

/** All managed values, database first with environment-variable fallback. */
export async function getIntegrationValues(): Promise<Record<string, string>> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    cache = { values: await loadFromDb(), at: now };
  }
  const out: Record<string, string> = {};
  for (const key of INTEGRATION_KEYS) {
    const fromDb = cache.values[key];
    const fromEnv = envValue(key);
    const value = (fromDb ?? fromEnv ?? "").trim();
    if (value) out[key] = value;
  }
  return out;
}

/** Where each managed key currently resolves from. */
export async function getIntegrationSources(): Promise<
  Record<IntegrationKey, "database" | "environment" | "missing">
> {
  const now = Date.now();
  if (!cache || now - cache.at > TTL_MS) {
    cache = { values: await loadFromDb(), at: now };
  }
  const out = {} as Record<IntegrationKey, "database" | "environment" | "missing">;
  for (const key of INTEGRATION_KEYS) {
    out[key] = cache.values[key]
      ? "database"
      : envValue(key)
        ? "environment"
        : "missing";
  }
  return out;
}

export async function getIntegrationValue(key: IntegrationKey): Promise<string | null> {
  const values = await getIntegrationValues();
  return values[key] ?? null;
}
