/**
 * Meta (Facebook) Marketing API — server-only helpers.
 *
 * Credentials are managed from Admin → API & Integrations and read through the
 * shared integration-secrets store (database first, env fallback).
 */

import { getIntegrationValues } from "./integration-secrets.server";

export const META_DEFAULT_VERSION = "v21.0";

export type MetaConfig = {
  accessToken: string;
  adAccountId: string;
  pixelId: string;
  pageId: string;
  businessId: string | null;
  catalogId: string | null;
  version: string;
};

/** Ad account ids must be prefixed with `act_` for Graph API calls. */
export const actId = (id: string) => (id.startsWith("act_") ? id : `act_${id.replace(/\D/g, "")}`);

export async function readMetaConfig(): Promise<MetaConfig | null> {
  const v = await getIntegrationValues();
  const accessToken = v["META_ACCESS_TOKEN"] ?? "";
  const adAccountId = v["META_AD_ACCOUNT_ID"] ?? "";
  const pixelId = v["META_PIXEL_ID"] ?? "";
  const pageId = v["META_PAGE_ID"] ?? "";
  if (!accessToken || !adAccountId || !pixelId || !pageId) return null;
  return {
    accessToken,
    adAccountId,
    pixelId,
    pageId,
    businessId: v["META_BUSINESS_ID"] ?? null,
    catalogId: v["META_CATALOG_ID"] ?? null,
    version: v["META_API_VERSION"] || META_DEFAULT_VERSION,
  };
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: number,
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

/** Raw Graph API GET. `path` is relative, e.g. `act_123/campaigns`. */
export async function metaGet<T = unknown>(
  cfg: MetaConfig,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${cfg.version}/${path.replace(/^\//, "")}`);
  for (const [k, val] of Object.entries(params)) {
    if (val !== undefined && val !== "") url.searchParams.set(k, String(val));
  }
  url.searchParams.set("access_token", cfg.accessToken);

  const res = await fetch(url, { headers: { accept: "application/json" } });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = (
      body as {
        error?: {
          message?: string;
          code?: number;
          error_subcode?: number;
          type?: string;
          error_user_msg?: string;
          fbtrace_id?: string;
        };
      } | null
    )?.error;
    const bits = [
      err?.error_user_msg || err?.message || `HTTP ${res.status}`,
      err?.code !== undefined ? `code ${err.code}` : null,
      err?.error_subcode ? `subcode ${err.error_subcode}` : null,
      err?.type ?? null,
      err?.fbtrace_id ? `trace ${err.fbtrace_id}` : null,
      err?.code === 200 && !err?.error_subcode
        ? "App-level restriction: check App Dashboard → App Review / Business verification"
        : null,
    ].filter(Boolean);
    throw new MetaApiError(`${path.split("?")[0]} → ${bits.join(" · ")}`, res.status, err?.code);
  }


  return body as T;
}

export type MetaProbe = {
  ok: boolean;
  message: string;
  details: { label: string; value: string }[];
};

/** Live credential check: token scopes, ad account, pixel and page. */
export async function probeMeta(cfg: MetaConfig): Promise<MetaProbe> {
  const details: { label: string; value: string }[] = [];
  try {
    // Token introspection first — it explains most "blocked" style failures.
    try {
      const dbg = await metaGet<{
        data?: { scopes?: string[]; is_valid?: boolean; app_id?: string; type?: string };
      }>(cfg, "debug_token", { input_token: cfg.accessToken });
      const d = dbg.data ?? {};
      details.push({ label: "Token valid", value: d.is_valid ? "yes" : "no" });
      if (d.type) details.push({ label: "Token type", value: d.type });
      if (d.app_id) details.push({ label: "App ID", value: d.app_id });
      details.push({ label: "Scopes", value: (d.scopes ?? []).join(", ") || "none" });
    } catch (e) {
      details.push({
        label: "Token check",
        value: e instanceof Error ? e.message : "failed",
      });
    }

    const me = await metaGet<{ name?: string; id?: string }>(cfg, "me", { fields: "id,name" });
    details.push({ label: "Token owner", value: me.name || me.id || "—" });


    const acct = await metaGet<{
      name?: string;
      account_status?: number;
      currency?: string;
      amount_spent?: string;
      timezone_name?: string;
    }>(cfg, actId(cfg.adAccountId), {
      fields: "name,account_status,currency,amount_spent,timezone_name",
    });
    const statusMap: Record<number, string> = {
      1: "Active",
      2: "Disabled",
      3: "Unsettled",
      7: "Pending review",
      9: "In grace period",
      101: "Closed",
    };
    details.push({ label: "Ad account", value: acct.name || cfg.adAccountId });
    details.push({
      label: "Account status",
      value: statusMap[acct.account_status ?? 0] ?? String(acct.account_status ?? "—"),
    });
    details.push({ label: "Currency", value: acct.currency || "—" });
    details.push({ label: "Timezone", value: acct.timezone_name || "—" });

    const pixel = await metaGet<{ name?: string; last_fired_time?: string }>(cfg, cfg.pixelId, {
      fields: "name,last_fired_time",
    });
    details.push({ label: "Pixel", value: pixel.name || cfg.pixelId });
    details.push({
      label: "Pixel last fired",
      value: pixel.last_fired_time ? new Date(pixel.last_fired_time).toLocaleString() : "never",
    });

    const page = await metaGet<{ name?: string; fan_count?: number }>(cfg, cfg.pageId, {
      fields: "name,fan_count",
    });
    details.push({ label: "Page", value: page.name || cfg.pageId });

    if (cfg.catalogId) {
      try {
        const cat = await metaGet<{ name?: string; product_count?: number }>(cfg, cfg.catalogId, {
          fields: "name,product_count",
        });
        details.push({
          label: "Catalog",
          value: `${cat.name || cfg.catalogId} · ${cat.product_count ?? 0} products`,
        });
      } catch (e) {
        details.push({
          label: "Catalog",
          value: e instanceof Error ? e.message : "unreachable",
        });
      }
    }

    return { ok: true, message: "Connected", details };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Meta connection failed",
      details,
    };
  }
}

/** Write call against the Graph API (status changes, budget updates). */
export async function metaPost<T = unknown>(
  cfg: MetaConfig,
  path: string,
  body: Record<string, string | number>,
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${cfg.version}/${path.replace(/^\//, "")}`);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  form.set("access_token", cfg.accessToken);

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: form.toString(),
  });
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const err = (
      parsed as {
        error?: {
          message?: string;
          error_user_msg?: string;
          code?: number;
          error_subcode?: number;
          fbtrace_id?: string;
        };
      } | null
    )?.error;
    const bits = [
      err?.error_user_msg || err?.message || `HTTP ${res.status}`,
      err?.code !== undefined ? `code ${err.code}` : null,
      err?.error_subcode ? `subcode ${err.error_subcode}` : null,
      err?.fbtrace_id ? `trace ${err.fbtrace_id}` : null,
    ].filter(Boolean);
    throw new MetaApiError(`${path.split("?")[0]} → ${bits.join(" · ")}`, res.status, err?.code);
  }
  return parsed as T;
}
