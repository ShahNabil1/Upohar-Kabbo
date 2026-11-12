/**
 * Cron hook authentication secret (server-only).
 *
 * Source of truth order:
 *  1. `public.integration_credentials` row with key `CRON_HOOK_SECRET`
 *     (admin-only via RLS) — this is what `pg_cron` reads at call time, so
 *     scheduler and endpoint can never drift apart.
 *  2. `process.env.CRON_HOOK_SECRET` — deployment secret fallback.
 *
 * Both values are accepted so rotating either side never breaks the jobs.
 */

const TTL_MS = 30_000;
let cache: { value: string | null; at: number } | null = null;

async function readDbSecret(): Promise<string | null> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) return cache.value;
  let value: string | null = null;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integration_credentials")
      .select("value")
      .eq("key", "CRON_HOOK_SECRET")
      .maybeSingle();
    value = (data?.value ?? "").trim() || null;
  } catch {
    value = null;
  }
  cache = { value, at: now };
  return value;
}

/** True when the supplied `x-cron-secret` header matches a configured secret. */
export async function isValidCronSecret(supplied: string | null): Promise<boolean> {
  const candidate = (supplied ?? "").trim();
  if (!candidate) return false;
  const envSecret = (process.env["CRON_HOOK_SECRET"] ?? "").trim();
  if (envSecret && candidate === envSecret) return true;
  const dbSecret = await readDbSecret();
  return Boolean(dbSecret && candidate === dbSecret);
}

/** Mirrors the environment secret into the database when the row is empty. */
export async function ensureCronSecretRow(): Promise<"created" | "exists" | "skipped"> {
  const envSecret = (process.env["CRON_HOOK_SECRET"] ?? "").trim();
  const existing = await readDbSecret();
  if (existing) return "exists";
  if (!envSecret) return "skipped";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("integration_credentials")
    .upsert({ key: "CRON_HOOK_SECRET", value: envSecret }, { onConflict: "key" });
  cache = null;
  return "created";
}
