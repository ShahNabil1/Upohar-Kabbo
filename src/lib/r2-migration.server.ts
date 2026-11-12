/**
 * R2 bucket migration (server-only).
 *
 * When the R2 credentials are changed to a different bucket, the previously
 * effective configuration is snapshotted into `integration_credentials` under
 * `PREV_R2_*` keys. The admin can then run a migration that copies every
 * referenced media object into the new bucket and rewrites all stored links.
 *
 * This version is database-driven: it scans the URLs stored in Supabase
 * (product images, categories, promotions, etc.) instead of listing the old
 * bucket. That means the old R2 token only needs `GetObject` permission;
 * `ListBucket` is no longer required.
 */

import type { R2Config } from "./r2.server";

export const PREV_PREFIX = "PREV_";

const FIELDS = [
  ["R2_ACCOUNT_ID", "accountId"],
  ["R2_ACCESS_KEY_ID", "accessKeyId"],
  ["R2_SECRET_ACCESS_KEY", "secretAccessKey"],
  ["R2_BUCKET", "bucket"],
  ["R2_PUBLIC_BASE_URL", "publicBaseUrl"],
] as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Same bucket in the same account = nothing to migrate. */
export function sameBucket(a: R2Config, b: R2Config) {
  return a.accountId === b.accountId && a.bucket === b.bucket;
}

export async function savePreviousR2(cfg: R2Config) {
  const db = await admin();
  const rows = FIELDS.map(([key, prop]) => ({
    key: `${PREV_PREFIX}${key}`,
    value: String(cfg[prop]),
  }));
  await db.from("integration_credentials").upsert(rows, { onConflict: "key" });
}

export async function clearPreviousR2() {
  const db = await admin();
  await db
    .from("integration_credentials")
    .delete()
    .in(
      "key",
      FIELDS.map(([key]) => `${PREV_PREFIX}${key}`),
    );
}

export async function readPreviousR2(): Promise<R2Config | null> {
  const db = await admin();
  const { data, error } = await db
    .from("integration_credentials")
    .select("key, value")
    .in(
      "key",
      FIELDS.map(([key]) => `${PREV_PREFIX}${key}`),
    );
  if (error || !data?.length) return null;
  const map = new Map(data.map((row) => [row.key, (row.value ?? "").trim()]));
  const out: Record<string, string> = {};
  for (const [key, prop] of FIELDS) {
    const value = map.get(`${PREV_PREFIX}${key}`);
    if (!value) return null;
    out[prop] = value;
  }
  return {
    accountId: out["accountId"]!,
    accessKeyId: out["accessKeyId"]!,
    secretAccessKey: out["secretAccessKey"]!,
    bucket: out["bucket"]!,
    publicBaseUrl: out["publicBaseUrl"]!.replace(/\/+$/, ""),
  };
}

export type R2MigrateBatchResult = {
  copied: number;
  skipped: number;
  failed: number;
  errors: string[];
  /** Next offset, or null when every referenced object has been processed. */
  nextOffset: number | null;
  /** Total number of unique referenced objects to migrate. */
  total: number;
  lastKey: string | null;
  /** Set when the old bucket cannot be read at all — migration is impossible. */
  blocked: string | null;
};

type KeyRef = { key: string; sourceUrl: string };

const BATCH_SIZE = 50;

/**
 * Walk every known media URL column and collect the unique R2 object keys that
 * belong to the old public base URL. Uses `r2_key` when stored, otherwise
 * derives the key from the URL by stripping the base.
 */
async function collectKeys(from: R2Config): Promise<KeyRef[]> {
  const db = await admin();
  const base = from.publicBaseUrl.replace(/\/+$/, "");
  const prefix = `${base}/`;

  // Each entry: [table, column, optional r2_key column]
  const columns: { table: string; urlCol: string; keyCol?: string }[] = [
    { table: "categories", urlCol: "image_url" },
    { table: "subcategories", urlCol: "image_url" },
    { table: "products", urlCol: "og_image_url" },
    { table: "product_images", urlCol: "url", keyCol: "r2_key" },
    { table: "promotions", urlCol: "banner_url" },
    { table: "profiles", urlCol: "avatar_url" },
    { table: "landing_pages", urlCol: "og_image_url" },
  ];

  const seen = new Map<string, string>();

  for (const { table, urlCol, keyCol } of columns) {
    let page = 0;
    while (true) {
      const cols = `${urlCol}${keyCol ? `, ${keyCol}` : ""}`;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await (db as any)
        .from(table)
        .select(cols)
        .not(urlCol, "is", null)
        .like(urlCol, `${prefix}%`)
        .range(page * 1000, (page + 1) * 1000 - 1)) as {
        data: Record<string, string | null>[] | null;
        error: { message: string } | null;
      };

      if (res.error) {
        // Non-fatal: log and continue so one broken table does not block the rest.
        console.warn(`[r2-migration] could not read ${table}.${urlCol}:`, res.error.message);
        break;
      }

      const data = res.data ?? [];
      if (!data.length) break;

      for (const row of data) {
        const url = row[urlCol];
        if (!url) continue;
        const explicitKey = keyCol ? row[keyCol] : null;
        const key = explicitKey?.trim() || url.slice(prefix.length);
        if (!key) continue;
        seen.set(key, url);
      }

      if (data.length < 1000) break;
      page += 1;
    }
  }

  // landing_pages.content may contain image URLs inside JSONB.
  {
    let page = 0;
    while (true) {
      const builder = db.from("landing_pages") as unknown as {
        select: (columns: string) => {
          filter: (column: string, operator: string, value: string) => {
            range: (from: number, to: number) => Promise<unknown>;
          };
        };
      };
      const res = (await builder
        .select("content")
        .filter("content::text", "like", `%${prefix}%`)
        .range(page * 1000, (page + 1) * 1000 - 1)) as {
        data: { content: unknown }[] | null;
        error: { message: string } | null;
      };

      if (res.error) {
        console.warn("[r2-migration] could not read landing_pages.content:", res.error.message);
        break;
      }

      const data = res.data ?? [];
      if (!data.length) break;

      const urlPattern = new RegExp(
        `${escapeRegExp(prefix)}([^"'\\s<>|{}\\\\^\`\[\]]+)`,
        "g",
      );

      for (const row of data) {
        const content = JSON.stringify(row.content);
        let match;
        while ((match = urlPattern.exec(content)) !== null) {
          const key = decodeURIComponent(match[1] ?? "").split("?")[0];
          if (!key) continue;
          seen.set(key, `${prefix}${key}`);
        }
      }

      if (data.length < 1000) break;
      page += 1;
    }
  }

  return Array.from(seen.entries()).map(([key, sourceUrl]) => ({ key, sourceUrl }));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Copies one batch of referenced objects from the old bucket to the new one. */
export async function migrateBatch(offset = 0): Promise<R2MigrateBatchResult> {
  const { readR2Config, objectExists, copyObjectAcross } = await import("./r2.server");
  const to = await readR2Config();
  if (!to) throw new Error("New R2 configuration is incomplete.");
  const from = await readPreviousR2();
  if (!from) throw new Error("No previous bucket recorded — nothing to migrate.");
  if (sameBucket(from, to)) throw new Error("Source and destination bucket are the same.");

  const all = await collectKeys(from);
  const total = all.length;
  const batch = all.slice(offset, offset + BATCH_SIZE);

  // Pre-flight: confirm we can read from the old bucket before copying everything.
  const firstRef = batch[0];
  if (firstRef) {
    const { probeObjectRead } = await import("./r2.server");
    const probe = await probeObjectRead(from, firstRef.key);
    if (!probe.ok && (probe.status === 403 || probe.status === 401)) {
      return {
        copied: 0,
        skipped: 0,
        failed: 0,
        errors: [],
        nextOffset: null,
        total,
        lastKey: null,
        blocked:
          `Cannot read the old bucket "${from.bucket}" (${probe.status} ${probe.message}). ` +
          "The saved old R2 credentials lack GetObject permission, so files cannot be copied. " +
          "Fix the old bucket's API token, or press “Skip” to forget it.",
      };
    }
  }


  let copied = 0;
  let skipped = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const { key } of batch) {
    try {
      if (await objectExists(to, key)) {
        skipped += 1;
        continue;
      }
      await copyObjectAcross(from, to, key);
      copied += 1;
    } catch (err) {
      failed += 1;
      if (errors.length < 5) {
        errors.push(`${key}: ${err instanceof Error ? err.message : "copy failed"}`);
      }
    }
  }

  const nextOffset = offset + batch.length;
  return {
    copied,
    skipped,
    failed,
    errors,
    nextOffset: nextOffset < total ? nextOffset : null,
    total,
    lastKey: batch.at(-1)?.key ?? null,
    blocked: null,
  };
}

/** Rewrites every stored media link to the new public base URL. */
export async function finishMigration(): Promise<{ rewritten: number }> {
  const { readR2Config } = await import("./r2.server");
  const to = await readR2Config();
  const from = await readPreviousR2();
  if (!to || !from) throw new Error("Migration state is incomplete.");

  let rewritten = 0;
  if (from.publicBaseUrl !== to.publicBaseUrl) {
    const db = await admin();
    const { data, error } = await (
      db.rpc as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: number | null; error: { message: string } | null }>
    )("r2_rewrite_media_urls", { old_base: from.publicBaseUrl, new_base: to.publicBaseUrl });
    if (error) throw new Error(error.message);
    rewritten = data ?? 0;
  }
  await clearPreviousR2();
  return { rewritten };
}
