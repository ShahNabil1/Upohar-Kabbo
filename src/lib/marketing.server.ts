/**
 * Marketing analytics — server-only helpers.
 *
 * Combines Meta Marketing API insights with our own order table so the admin
 * can compare platform-reported performance against real, in-store revenue
 * (blended ROAS) and money that actually got delivered (true ROAS).
 *
 * Every Graph API response is cached in-memory for a short window so the
 * dashboard can be refreshed freely without burning through Meta rate limits.
 */

import { actId, metaGet, metaPost, readMetaConfig, type MetaConfig } from "./meta.server";
import { channelOf, type AttributionPayload } from "./attribution";
import type {
  AttributionCampaignRow,
  AttributionChannelRow,
  AttributionProductRow,
  AudienceHealth,
  AudienceRow,
  CampaignLevel,
  CatalogHealth,
  ControlCenter,
  ControlRow,
  ControlThresholds,
  CampaignPerformance,
  CreativePerformance,
  DateRange,
  MarketingOverview,
  MarketingPreset,
  MarketingSeriesPoint,
  MetaMetrics,
  OrderMetrics,
  PixelHealth,
  ProductAttribution,
  RuleAction,
} from "./marketing-shared";

export { MARKETING_PRESETS } from "./marketing-shared";

const DAY = 86_400_000;
const CACHE_TTL_MS = 5 * 60_000;

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>, ttl = CACHE_TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

/** Drops every cached Graph API response (used by the manual refresh button). */
export function clearMarketingCache() {
  cache.clear();
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Resolve a preset into an inclusive `YYYY-MM-DD` range (UTC based). */
export function resolveRange(preset: MarketingPreset): DateRange {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  if (preset === "today") return { since: isoDay(end), until: isoDay(end), days: 1 };
  if (preset === "yesterday") {
    const y = new Date(end.getTime() - DAY);
    return { since: isoDay(y), until: isoDay(y), days: 1 };
  }
  const days = preset === "7d" ? 7 : preset === "14d" ? 14 : preset === "30d" ? 30 : 90;
  return { since: isoDay(new Date(end.getTime() - (days - 1) * DAY)), until: isoDay(end), days };
}

/** The equally long window immediately before `range`, for trend comparison. */
export function previousRange(range: DateRange): DateRange {
  const since = new Date(`${range.since}T00:00:00Z`).getTime();
  const prevUntil = new Date(since - DAY);
  const prevSince = new Date(since - range.days * DAY);
  return { since: isoDay(prevSince), until: isoDay(prevUntil), days: range.days };
}

type InsightAction = { action_type: string; value: string };
type InsightRow = {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  frequency?: string;
  cpm?: string;
  cpc?: string;
  ctr?: string;
  actions?: InsightAction[];
  action_values?: InsightAction[];
  purchase_roas?: InsightAction[];
};

const INSIGHT_FIELDS =
  "spend,impressions,clicks,reach,frequency,cpm,cpc,ctr,actions,action_values,purchase_roas";

const num = (v: string | number | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const PURCHASE_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
]);

function pickAction(list: InsightAction[] | undefined, match: (t: string) => boolean) {
  let best = 0;
  for (const a of list ?? []) if (match(a.action_type)) best = Math.max(best, num(a.value));
  return best;
}

function toMetrics(rows: InsightRow[]): MetaMetrics {
  let spend = 0;
  let impressions = 0;
  let clicks = 0;
  let reach = 0;
  let purchases = 0;
  let purchaseValue = 0;
  let addToCart = 0;
  let initiateCheckout = 0;
  let landingPageViews = 0;

  for (const r of rows) {
    spend += num(r.spend);
    impressions += num(r.impressions);
    clicks += num(r.clicks);
    reach += num(r.reach);
    purchases += pickAction(r.actions, (t) => PURCHASE_TYPES.has(t));
    purchaseValue += pickAction(r.action_values, (t) => PURCHASE_TYPES.has(t));
    addToCart += pickAction(r.actions, (t) => t.includes("add_to_cart"));
    initiateCheckout += pickAction(r.actions, (t) => t.includes("initiate_checkout"));
    landingPageViews += pickAction(r.actions, (t) => t === "landing_page_view");
  }

  return {
    spend,
    impressions,
    clicks,
    reach,
    frequency: reach > 0 ? impressions / reach : 0,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : 0,
    cpc: clicks > 0 ? spend / clicks : 0,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    purchases,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    addToCart,
    initiateCheckout,
    landingPageViews,
  };
}

async function fetchInsights(
  cfg: MetaConfig,
  range: DateRange,
  extra: Record<string, string> = {},
): Promise<InsightRow[]> {
  const key = JSON.stringify([cfg.adAccountId, cfg.version, range.since, range.until, extra]);
  return cached(key, async () => {
    const res = await metaGet<{ data?: InsightRow[] }>(cfg, `${actId(cfg.adAccountId)}/insights`, {
      fields: INSIGHT_FIELDS,
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      level: "account",
      limit: 500,
      ...extra,
    });
    return res.data ?? [];
  });
}

type OrderRow = { total: number | string; status: string; created_at: string };

const DELIVERED = new Set(["delivered", "partial_delivered"]);
const VOID = new Set(["cancelled", "returned", "lost_damaged"]);

export function toOrderMetrics(rows: OrderRow[]): OrderMetrics {
  let orders = 0;
  let revenue = 0;
  let deliveredOrders = 0;
  let deliveredRevenue = 0;
  let pendingOrders = 0;
  let cancelledOrders = 0;

  for (const r of rows) {
    const total = num(r.total);
    orders += 1;
    if (!VOID.has(r.status)) revenue += total;
    if (DELIVERED.has(r.status)) {
      deliveredOrders += 1;
      deliveredRevenue += total;
    }
    if (r.status === "pending") pendingOrders += 1;
    if (VOID.has(r.status)) cancelledOrders += 1;
  }

  const settled = deliveredOrders + cancelledOrders;
  return {
    orders,
    revenue,
    deliveredOrders,
    deliveredRevenue,
    pendingOrders,
    cancelledOrders,
    averageOrderValue: orders > 0 ? revenue / orders : 0,
    deliveryRate: settled > 0 ? (deliveredOrders / settled) * 100 : 0,
  };
}

type SupabaseLike = {
  from: (table: string) => {
    select: (cols: string) => {
      gte: (
        col: string,
        v: string,
      ) => {
        lte: (col: string, v: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

async function loadOrders(db: SupabaseLike, range: DateRange): Promise<OrderRow[]> {
  const { data } = await db
    .from("orders")
    .select("total, status, created_at")
    .gte("created_at", `${range.since}T00:00:00Z`)
    .lte("created_at", `${range.until}T23:59:59Z`);
  return (data ?? []) as OrderRow[];
}

const emptyMeta = (): MetaMetrics => toMetrics([]);

/** Builds the whole Marketing → Overview payload. */
export async function buildMarketingOverview(
  db: SupabaseLike,
  preset: MarketingPreset,
): Promise<MarketingOverview> {
  const range = resolveRange(preset);
  const prev = previousRange(range);
  const cfg = await readMetaConfig();

  const [orderRows, prevOrderRows] = await Promise.all([
    loadOrders(db, range),
    loadOrders(db, prev),
  ]);

  const orders = toOrderMetrics(orderRows);
  const ordersPrevious = toOrderMetrics(prevOrderRows);

  const base = {
    currency: "USD",
    accountName: "",
    range,
    orders,
    ordersPrevious,
  };

  if (!cfg) {
    return {
      ...base,
      connected: false,
      message: "Meta Marketing API is not configured yet.",
      meta: emptyMeta(),
      metaPrevious: emptyMeta(),
      series: dailySeries(range, [], orderRows),
      blendedRoas: 0,
      trueRoas: 0,
      blendedRoasPrevious: 0,
      trueRoasPrevious: 0,
      costPerOrder: 0,
      costPerDeliveredOrder: 0,
      spendShare: 0,
    };
  }

  let meta = emptyMeta();
  let metaPrevious = emptyMeta();
  let daily: InsightRow[] = [];
  let currency = "USD";
  let accountName = cfg.adAccountId;
  let message: string | undefined;
  let connected = true;

  try {
    const [acct, current, previous, dailyRows] = await Promise.all([
      cached(`acct:${cfg.adAccountId}:${cfg.version}`, () =>
        metaGet<{ name?: string; currency?: string }>(cfg, actId(cfg.adAccountId), {
          fields: "name,currency",
        }),
      ),
      fetchInsights(cfg, range),
      fetchInsights(cfg, prev),
      fetchInsights(cfg, range, { time_increment: "1" }),
    ]);
    currency = acct.currency || "USD";
    accountName = acct.name || cfg.adAccountId;
    meta = toMetrics(current);
    metaPrevious = toMetrics(previous);
    daily = dailyRows;
  } catch (error) {
    connected = false;
    message = error instanceof Error ? error.message : "Meta insights unavailable";
  }

  const blendedRoas = meta.spend > 0 ? orders.revenue / meta.spend : 0;
  const trueRoas = meta.spend > 0 ? orders.deliveredRevenue / meta.spend : 0;

  return {
    ...base,
    connected,
    ...(message ? { message } : {}),
    currency,
    accountName,
    meta,
    metaPrevious,
    series: dailySeries(range, daily, orderRows),
    blendedRoas,
    trueRoas,
    blendedRoasPrevious:
      metaPrevious.spend > 0 ? ordersPrevious.revenue / metaPrevious.spend : 0,
    trueRoasPrevious:
      metaPrevious.spend > 0 ? ordersPrevious.deliveredRevenue / metaPrevious.spend : 0,
    costPerOrder: orders.orders > 0 ? meta.spend / orders.orders : 0,
    costPerDeliveredOrder: orders.deliveredOrders > 0 ? meta.spend / orders.deliveredOrders : 0,
    spendShare: orders.revenue > 0 ? (meta.spend / orders.revenue) * 100 : 0,
  };
}

function dailySeries(
  range: DateRange,
  daily: InsightRow[],
  orderRows: OrderRow[],
): MarketingSeriesPoint[] {
  const points = new Map<string, MarketingSeriesPoint>();
  const start = new Date(`${range.since}T00:00:00Z`).getTime();
  for (let i = 0; i < range.days; i += 1) {
    const date = isoDay(new Date(start + i * DAY));
    points.set(date, {
      date,
      spend: 0,
      revenue: 0,
      deliveredRevenue: 0,
      orders: 0,
      metaPurchases: 0,
    });
  }

  for (const row of daily) {
    const date = row.date_start ?? "";
    const point = points.get(date);
    if (!point) continue;
    point.spend += num(row.spend);
    point.metaPurchases += pickAction(row.actions, (t) => PURCHASE_TYPES.has(t));
  }

  for (const row of orderRows) {
    const date = row.created_at.slice(0, 10);
    const point = points.get(date);
    if (!point) continue;
    const total = num(row.total);
    point.orders += 1;
    if (!VOID.has(row.status)) point.revenue += total;
    if (DELIVERED.has(row.status)) point.deliveredRevenue += total;
  }

  return [...points.values()];
}

/* ------------------------------------------------------------------ *
 * Campaign / ad-set / ad level performance
 * ------------------------------------------------------------------ */

type EntityRow = {
  id: string;
  name?: string;
  status?: string;
  effective_status?: string;
  objective?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};

const LEVEL_FIELDS: Record<CampaignLevel, string> = {
  campaign: "campaign_id,campaign_name",
  adset: "adset_id,adset_name,campaign_name",
  ad: "ad_id,ad_name,adset_name",
};

const EDGE: Record<CampaignLevel, string> = {
  campaign: "campaigns",
  adset: "adsets",
  ad: "ads",
};

const ENTITY_FIELDS: Record<CampaignLevel, string> = {
  campaign: "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
  adset: "id,name,status,effective_status,daily_budget,lifetime_budget",
  ad: "id,name,status,effective_status",
};

async function loadEntities(cfg: MetaConfig, level: CampaignLevel) {
  return cached(`ent:${level}:${cfg.adAccountId}:${cfg.version}`, async () => {
    const res = await metaGet<{ data?: EntityRow[] }>(
      cfg,
      `${actId(cfg.adAccountId)}/${EDGE[level]}`,
      { fields: ENTITY_FIELDS[level], limit: 200 },
    );
    const map = new Map<string, EntityRow>();
    for (const row of res.data ?? []) map.set(row.id, row);
    return map;
  });
}

/** Builds the Marketing → Campaigns payload for one hierarchy level. */
export async function buildCampaignPerformance(
  preset: MarketingPreset,
  level: CampaignLevel,
): Promise<CampaignPerformance> {
  const range = resolveRange(preset);
  const cfg = await readMetaConfig();
  const empty: CampaignPerformance = {
    connected: false,
    currency: "USD",
    level,
    range,
    rows: [],
    totals: emptyMeta(),
  };
  if (!cfg) {
    return {
      ...empty,
      message: "Meta Marketing API is not configured yet.",
    };
  }

  try {
    const [acct, rows, entities] = await Promise.all([
      cached(`acct:${cfg.adAccountId}:${cfg.version}`, () =>
        metaGet<{ name?: string; currency?: string }>(cfg, actId(cfg.adAccountId), {
          fields: "name,currency",
        }),
      ),
      fetchInsights(cfg, range, {
        level,
        fields: `${INSIGHT_FIELDS},${LEVEL_FIELDS[level]}`,
      }) as Promise<(InsightRow & Record<string, unknown>)[]>,
      loadEntities(cfg, level),
    ]);

    const built = rows.map((raw) => {
      const id = String(
        raw[`${level}_id` as keyof typeof raw] ?? raw["campaign_id" as keyof typeof raw] ?? "",
      );
      const name = String(raw[`${level}_name` as keyof typeof raw] ?? id);
      const parentName =
        level === "adset"
          ? ((raw["campaign_name" as keyof typeof raw] as string) ?? null)
          : level === "ad"
            ? ((raw["adset_name" as keyof typeof raw] as string) ?? null)
            : null;
      const m = toMetrics([raw]);
      const ent = entities.get(id);
      return {
        id,
        name,
        parentName,
        status: ent?.status ?? null,
        effectiveStatus: ent?.effective_status ?? null,
        objective: ent?.objective ?? null,
        dailyBudget: ent?.daily_budget ? num(ent.daily_budget) / 100 : null,
        lifetimeBudget: ent?.lifetime_budget ? num(ent.lifetime_budget) / 100 : null,
        spend: m.spend,
        impressions: m.impressions,
        reach: m.reach,
        frequency: m.frequency,
        clicks: m.clicks,
        ctr: m.ctr,
        cpc: m.cpc,
        cpm: m.cpm,
        purchases: m.purchases,
        purchaseValue: m.purchaseValue,
        roas: m.roas,
        addToCart: m.addToCart,
        initiateCheckout: m.initiateCheckout,
        landingPageViews: m.landingPageViews,
        costPerPurchase: m.purchases > 0 ? m.spend / m.purchases : 0,
      };
    });

    built.sort((a, b) => b.spend - a.spend);

    return {
      connected: true,
      currency: acct.currency || "USD",
      level,
      range,
      rows: built,
      totals: toMetrics(rows),
    };
  } catch (error) {
    return {
      ...empty,
      message: error instanceof Error ? error.message : "Meta insights unavailable",
    };
  }
}

/* ------------------------------------------------------------------ *
 * Creative performance (hook / hold / retention)
 * ------------------------------------------------------------------ */

const VIDEO_FIELDS = [
  "video_play_actions",
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p100_watched_actions",
  "video_avg_time_watched_actions",
].join(",");

type VideoRow = InsightRow & {
  ad_id?: string;
  ad_name?: string;
  campaign_name?: string;
  video_play_actions?: InsightAction[];
  video_thruplay_watched_actions?: InsightAction[];
  video_p25_watched_actions?: InsightAction[];
  video_p50_watched_actions?: InsightAction[];
  video_p75_watched_actions?: InsightAction[];
  video_p100_watched_actions?: InsightAction[];
  video_avg_time_watched_actions?: InsightAction[];
};

const sumAction = (list: InsightAction[] | undefined) =>
  (list ?? []).reduce((acc, a) => acc + num(a.value), 0);

type AdCreativeRow = {
  id: string;
  name?: string;
  effective_status?: string;
  preview_shareable_link?: string;
  creative?: {
    thumbnail_url?: string;
    video_id?: string;
    body?: string;
    object_story_spec?: { video_data?: unknown; link_data?: { message?: string } };
  };
};

async function loadAdCreatives(cfg: MetaConfig) {
  return cached(`creatives:${cfg.adAccountId}:${cfg.version}`, async () => {
    const res = await metaGet<{ data?: AdCreativeRow[] }>(
      cfg,
      `${actId(cfg.adAccountId)}/ads`,
      {
        fields:
          "id,name,effective_status,preview_shareable_link,creative{thumbnail_url,video_id,body,object_story_spec}",
        limit: 200,
      },
    );
    const map = new Map<string, AdCreativeRow>();
    for (const row of res.data ?? []) map.set(row.id, row);
    return map;
  });
}

/** Builds the Marketing → Creatives payload. */
export async function buildCreativePerformance(
  preset: MarketingPreset,
): Promise<CreativePerformance> {
  const range = resolveRange(preset);
  const cfg = await readMetaConfig();
  if (!cfg) {
    return {
      connected: false,
      message: "Meta Marketing API is not configured yet.",
      currency: "USD",
      range,
      rows: [],
    };
  }

  try {
    const [acct, rows, creatives] = await Promise.all([
      cached(`acct:${cfg.adAccountId}:${cfg.version}`, () =>
        metaGet<{ name?: string; currency?: string }>(cfg, actId(cfg.adAccountId), {
          fields: "name,currency",
        }),
      ),
      fetchInsights(cfg, range, {
        level: "ad",
        fields: `${INSIGHT_FIELDS},ad_id,ad_name,campaign_name,${VIDEO_FIELDS}`,
      }) as Promise<VideoRow[]>,
      loadAdCreatives(cfg),
    ]);

    const built = rows.map((raw) => {
      const m = toMetrics([raw]);
      const ad = creatives.get(raw.ad_id ?? "");
      const views3s = sumAction(raw.video_play_actions);
      const thru = sumAction(raw.video_thruplay_watched_actions);
      const p25 = sumAction(raw.video_p25_watched_actions);
      const p50 = sumAction(raw.video_p50_watched_actions);
      const p75 = sumAction(raw.video_p75_watched_actions);
      const p100 = sumAction(raw.video_p100_watched_actions);
      const avg = sumAction(raw.video_avg_time_watched_actions);
      const spec = ad?.creative?.object_story_spec;
      return {
        adId: raw.ad_id ?? "",
        name: raw.ad_name ?? ad?.name ?? raw.ad_id ?? "Untitled ad",
        campaignName: raw.campaign_name ?? null,
        status: ad?.effective_status ?? null,
        thumbnailUrl: ad?.creative?.thumbnail_url ?? null,
        permalink: ad?.preview_shareable_link ?? null,
        body: ad?.creative?.body ?? spec?.link_data?.message ?? null,
        isVideo: Boolean(ad?.creative?.video_id || spec?.video_data || views3s > 0),
        spend: m.spend,
        impressions: m.impressions,
        reach: m.reach,
        frequency: m.frequency,
        clicks: m.clicks,
        ctr: m.ctr,
        cpc: m.cpc,
        cpm: m.cpm,
        purchases: m.purchases,
        purchaseValue: m.purchaseValue,
        roas: m.roas,
        hookRate: m.impressions > 0 ? (views3s / m.impressions) * 100 : 0,
        holdRate: views3s > 0 ? (thru / views3s) * 100 : 0,
        videoViews3s: views3s,
        thruPlays: thru,
        avgWatchSeconds: avg,
        retention: {
          p25: views3s > 0 ? (p25 / views3s) * 100 : 0,
          p50: views3s > 0 ? (p50 / views3s) * 100 : 0,
          p75: views3s > 0 ? (p75 / views3s) * 100 : 0,
          p100: views3s > 0 ? (p100 / views3s) * 100 : 0,
        },
      };
    });

    built.sort((a, b) => b.spend - a.spend);

    return {
      connected: true,
      currency: acct.currency || "USD",
      range,
      rows: built,
    };
  } catch (error) {
    return {
      connected: false,
      message: error instanceof Error ? error.message : "Meta insights unavailable",
      currency: "USD",
      range,
      rows: [],
    };
  }
}

/* ------------------------------------------------------------------ *
 * Audience, catalog and pixel health (Marketing → Audiences)
 * ------------------------------------------------------------------ */

type RawAudience = {
  id: string;
  name?: string;
  subtype?: string;
  description?: string;
  approximate_count_lower_bound?: number;
  approximate_count_upper_bound?: number;
  retention_days?: number;
  delivery_status?: { code?: number; description?: string };
  operation_status?: { code?: number; description?: string };
  time_updated?: number;
};

const MIN_AUDIENCE_SIZE = 1000;

async function loadAudiences(cfg: MetaConfig): Promise<AudienceRow[]> {
  const res = await metaGet<{ data?: RawAudience[] }>(
    cfg,
    `${actId(cfg.adAccountId)}/customaudiences`,
    {
      fields:
        "id,name,subtype,description,approximate_count_lower_bound,approximate_count_upper_bound,retention_days,delivery_status,operation_status,time_updated",
      limit: 100,
    },
  );
  return (res.data ?? []).map((a) => {
    const lower = a.approximate_count_lower_bound ?? null;
    const upper = a.approximate_count_upper_bound ?? null;
    const approximateCount = upper ?? lower;
    return {
      id: a.id,
      name: a.name ?? a.id,
      subtype: a.subtype ?? null,
      description: a.description ?? null,
      approximateCount,
      retentionDays: a.retention_days ?? null,
      deliveryStatus: a.delivery_status?.description ?? null,
      operationStatus: a.operation_status?.description ?? null,
      updatedAt: a.time_updated ? new Date(a.time_updated * 1000).toISOString() : null,
      ready: (approximateCount ?? 0) >= MIN_AUDIENCE_SIZE,
    } satisfies AudienceRow;
  });
}

async function loadCatalogHealth(cfg: MetaConfig): Promise<CatalogHealth> {
  if (!cfg.catalogId) {
    return { configured: false, id: null, name: null, productCount: null, productSets: null, issues: [] };
  }
  const [meta, sets, diagnostics] = await Promise.all([
    metaGet<{ name?: string; product_count?: number }>(cfg, cfg.catalogId, {
      fields: "name,product_count",
    }).catch(() => ({}) as { name?: string; product_count?: number }),
    metaGet<{ summary?: { total_count?: number } }>(cfg, `${cfg.catalogId}/product_sets`, {
      summary: "total_count",
      limit: 1,
    }).catch(() => ({}) as { summary?: { total_count?: number } }),
    metaGet<{
      data?: {
        diagnostic_group?: string;
        severity?: string;
        title?: string;
        type?: string;
        affected_entity?: string;
        number_of_affected_items?: number;
      }[];
    }>(cfg, `${cfg.catalogId}/diagnostics`, { limit: 25 }).catch(() => ({ data: [] })),
  ]);

  return {
    configured: true,
    id: cfg.catalogId,
    name: meta.name ?? null,
    productCount: meta.product_count ?? null,
    productSets: sets.summary?.total_count ?? null,
    issues: (diagnostics.data ?? []).map((d) => ({
      severity: (d.severity ?? "WARNING").toLowerCase(),
      title: d.title ?? d.diagnostic_group ?? "Catalog issue",
      affectedCount: d.number_of_affected_items ?? null,
      type: d.type ?? d.diagnostic_group ?? null,
    })),
  };
}

async function loadPixelHealth(cfg: MetaConfig): Promise<PixelHealth | null> {
  const pixel = await metaGet<{
    id?: string;
    name?: string;
    last_fired_time?: string;
    automatic_matching_fields?: string[];
    enable_automatic_matching?: boolean;
  }>(cfg, cfg.pixelId, {
    fields: "id,name,last_fired_time,enable_automatic_matching,automatic_matching_fields",
  }).catch(() => null);
  if (!pixel) return null;

  const stats = await metaGet<{
    data?: { aggregation?: string; data?: { value?: string; count?: number }[] }[];
  }>(cfg, `${cfg.pixelId}/stats`, { aggregation: "event", limit: 1 }).catch(() => ({ data: [] }));

  const bucket = stats.data?.[0]?.data ?? [];
  const events = bucket
    .map((e) => ({ name: e.value ?? "unknown", count: e.count ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const lastFiredAt = pixel.last_fired_time ?? null;
  const hoursSinceLastEvent = lastFiredAt
    ? Math.max(0, Math.round((Date.now() - new Date(lastFiredAt).getTime()) / 3_600_000))
    : null;

  return {
    id: pixel.id ?? cfg.pixelId,
    name: pixel.name ?? null,
    lastFiredAt,
    hoursSinceLastEvent,
    matchRate: null,
    automaticMatching: pixel.enable_automatic_matching ?? null,
    events,
  };
}

/** Builds the Marketing → Audiences payload (audiences + catalog + pixel). */
export async function buildAudienceHealth(): Promise<AudienceHealth> {
  const cfg = await readMetaConfig();
  if (!cfg) {
    return {
      connected: false,
      message: "Meta Marketing API is not configured yet.",
      audiences: [],
      catalog: { configured: false, id: null, name: null, productCount: null, productSets: null, issues: [] },
      pixel: null,
      recommendations: [],
    };
  }

  try {
    const [audiences, catalog, pixel] = await Promise.all([
      cached(`aud:${cfg.adAccountId}:${cfg.version}`, () => loadAudiences(cfg)),
      cached(`cat:${cfg.catalogId ?? "none"}:${cfg.version}`, () => loadCatalogHealth(cfg)),
      cached(`pix:${cfg.pixelId}:${cfg.version}`, () => loadPixelHealth(cfg)),
    ]);

    const recommendations: AudienceHealth["recommendations"] = [];
    const tooSmall = audiences.filter((a) => !a.ready).length;
    if (!audiences.length) {
      recommendations.push({
        tone: "critical",
        text: "No custom audiences yet — create a purchaser exclusion list and a 180-day website visitor audience to unlock retargeting and Lookalikes.",
      });
    } else if (tooSmall) {
      recommendations.push({
        tone: "warning",
        text: `${tooSmall} audience(s) are below Meta's 1,000-person delivery floor and cannot be targeted yet.`,
      });
    } else {
      recommendations.push({ tone: "good", text: "All custom audiences are large enough to deliver." });
    }

    if (!audiences.some((a) => (a.subtype ?? "").toUpperCase() === "LOOKALIKE")) {
      recommendations.push({
        tone: "warning",
        text: "No Lookalike audience found — build a 1% Lookalike from your delivered-purchasers list for the cheapest cold traffic.",
      });
    }

    if (pixel?.hoursSinceLastEvent != null && pixel.hoursSinceLastEvent > 24) {
      recommendations.push({
        tone: "critical",
        text: `Pixel has not fired in ${pixel.hoursSinceLastEvent} hours — tracking is likely broken.`,
      });
    } else if (pixel?.lastFiredAt) {
      recommendations.push({ tone: "good", text: "Pixel is receiving events normally." });
    }

    if (!catalog.configured) {
      recommendations.push({
        tone: "warning",
        text: "No catalog ID saved — add it in API & Integrations to enable Dynamic Product Ads and catalog diagnostics.",
      });
    } else if (catalog.issues.some((i) => i.severity === "critical")) {
      recommendations.push({
        tone: "critical",
        text: "Meta reports critical catalog issues — affected products cannot be advertised.",
      });
    }

    return { connected: true, audiences, catalog, pixel, recommendations };
  } catch (err) {
    return {
      connected: false,
      message: err instanceof Error ? err.message : "Failed to load audience health.",
      audiences: [],
      catalog: { configured: false, id: null, name: null, productCount: null, productSets: null, issues: [] },
      pixel: null,
      recommendations: [],
    };
  }
}

/* ------------------------------------------------------------------ *
 * Control center — rule evaluation + live campaign controls
 * ------------------------------------------------------------------ */

function evaluateRule(
  row: { spend: number; purchases: number; roas: number; frequency: number },
  t: ControlThresholds,
): { action: RuleAction; reason: string } {
  if (row.spend < t.minSpend) {
    return { action: "watch", reason: `Only ${row.spend.toFixed(2)} spent — not enough data yet.` };
  }
  if (row.purchases === 0) {
    return { action: "pause", reason: `Spent ${row.spend.toFixed(2)} with zero purchases.` };
  }
  if (row.roas >= t.scaleRoas) {
    return {
      action: "scale",
      reason: `ROAS ${row.roas.toFixed(2)}x is above your ${t.scaleRoas}x scaling bar.`,
    };
  }
  if (row.roas < t.pauseRoas) {
    return {
      action: "pause",
      reason: `ROAS ${row.roas.toFixed(2)}x is below break-even (${t.pauseRoas}x).`,
    };
  }
  if (row.frequency >= 3) {
    return {
      action: "reduce",
      reason: `Frequency ${row.frequency.toFixed(1)} — audience fatigue, refresh creative or widen targeting.`,
    };
  }
  return { action: "watch", reason: `ROAS ${row.roas.toFixed(2)}x — profitable but not scale-ready.` };
}

/** Builds the Marketing → Control payload (performance + suggested action). */
export async function buildControlCenter(
  preset: MarketingPreset,
  level: CampaignLevel,
  thresholds: ControlThresholds,
): Promise<ControlCenter> {
  const perf = await buildCampaignPerformance(preset, level);
  const rows: ControlRow[] = perf.rows.map((r) => {
    const verdict = evaluateRule(r, thresholds);
    return {
      id: r.id,
      name: r.name,
      level,
      status: r.status,
      effectiveStatus: r.effectiveStatus,
      dailyBudget: r.dailyBudget,
      lifetimeBudget: r.lifetimeBudget,
      spend: r.spend,
      purchases: r.purchases,
      purchaseValue: r.purchaseValue,
      roas: r.roas,
      costPerPurchase: r.costPerPurchase,
      ctr: r.ctr,
      frequency: r.frequency,
      action: verdict.action,
      reason: verdict.reason,
    };
  });

  const order: Record<RuleAction, number> = { pause: 0, scale: 1, reduce: 2, watch: 3 };
  rows.sort((a, b) => order[a.action] - order[b.action] || b.spend - a.spend);

  return {
    connected: perf.connected,
    ...(perf.message ? { message: perf.message } : {}),
    currency: perf.currency,
    range: perf.range,
    level,
    thresholds,
    rows,
    summary: {
      spend: perf.totals.spend,
      revenue: perf.totals.purchaseValue,
      roas: perf.totals.roas,
      activeCount: rows.filter((r) => (r.effectiveStatus ?? r.status) === "ACTIVE").length,
    },
  };
}

const CONTROL_EDGE: Record<CampaignLevel, string> = {
  campaign: "campaign",
  adset: "adset",
  ad: "ad",
};

/** Pause or resume a campaign / ad set / ad. */
export async function setEntityStatus(id: string, status: "ACTIVE" | "PAUSED") {
  const cfg = await readMetaConfig();
  if (!cfg) throw new Error("Meta Marketing API is not configured.");
  await metaPost(cfg, id, { status });
  clearMarketingCache();
  return { ok: true as const, status };
}

/**
 * Set a new daily budget. Meta expects minor units (cents), so the value we
 * receive in account currency is converted before the write.
 */
export async function setDailyBudget(id: string, amount: number, level: CampaignLevel) {
  const cfg = await readMetaConfig();
  if (!cfg) throw new Error("Meta Marketing API is not configured.");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Budget must be greater than zero.");
  void CONTROL_EDGE[level];
  await metaPost(cfg, id, { daily_budget: Math.round(amount * 100) });
  clearMarketingCache();
  return { ok: true as const, dailyBudget: amount };
}

/* ------------------------------------------------------------------ *
 * Product-level attribution report
 * ------------------------------------------------------------------ */

type AttrOrderRow = {
  id: string;
  total: number | string;
  status: string;
  created_at: string;
  source: string | null;
  attribution: AttributionPayload | null;
  order_items: {
    product_id: string | null;
    product_name: string;
    product_slug: string | null;
    quantity: number | string;
    line_total: number | string;
  }[];
};

type AttrDb = {
  from: (table: string) => {
    select: (cols: string) => {
      gte: (
        col: string,
        v: string,
      ) => {
        lte: (col: string, v: string) => Promise<{ data: unknown; error: unknown }>;
      };
    };
  };
};

const normName = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

type Bucket = {
  key: string;
  campaignId: string | null;
  campaignName: string;
  channel: string;
  orders: number;
  revenue: number;
  deliveredRevenue: number;
  spend: number;
  matched: boolean;
  products: Map<string, { name: string; units: number; revenue: number }>;
};

/**
 * Joins real orders (with their captured attribution) to Meta campaign spend
 * so the admin can see which products each campaign actually sells, and what
 * the campaign-allocated ROAS per product looks like.
 */
export async function buildProductAttribution(
  db: AttrDb,
  preset: MarketingPreset,
): Promise<ProductAttribution> {
  const range = resolveRange(preset);
  const cfg = await readMetaConfig();

  const { data } = await db
    .from("orders")
    .select(
      "id, total, status, created_at, source, attribution, order_items(product_id, product_name, product_slug, quantity, line_total)",
    )
    .gte("created_at", `${range.since}T00:00:00Z`)
    .lte("created_at", `${range.until}T23:59:59Z`);

  const orders = ((data ?? []) as AttrOrderRow[]).filter((o) => o.status !== "incomplete");

  // --- Meta campaign spend -------------------------------------------------
  const spendById = new Map<string, number>();
  const spendByName = new Map<string, number>();
  let currency = "BDT";
  let connected = false;
  let message: string | undefined;
  let totalSpend = 0;

  if (cfg) {
    try {
      const [acct, rows] = await Promise.all([
        cached(`acct:${cfg.adAccountId}:${cfg.version}`, () =>
          metaGet<{ name?: string; currency?: string }>(cfg, actId(cfg.adAccountId), {
            fields: "name,currency",
          }),
        ),
        fetchInsights(cfg, range, {
          level: "campaign",
          fields: `${INSIGHT_FIELDS},${LEVEL_FIELDS.campaign}`,
        }) as Promise<(InsightRow & Record<string, unknown>)[]>,
      ]);
      currency = acct.currency || currency;
      connected = true;
      for (const raw of rows) {
        const id = String(raw["campaign_id"] ?? "");
        const name = String(raw["campaign_name"] ?? id);
        const spend = num(raw.spend);
        totalSpend += spend;
        if (id) spendById.set(id, (spendById.get(id) ?? 0) + spend);
        if (name) spendByName.set(normName(name), (spendByName.get(normName(name)) ?? 0) + spend);
      }
    } catch (error) {
      message = error instanceof Error ? error.message : "Meta insights unavailable";
    }
  } else {
    message = "Meta Marketing API is not configured yet — spend and ROAS stay empty.";
  }

  // --- Bucket orders by campaign ------------------------------------------
  const buckets = new Map<string, Bucket>();
  const channels = new Map<string, AttributionChannelRow>();
  const products = new Map<
    string,
    {
      productId: string | null;
      name: string;
      slug: string | null;
      orders: number;
      units: number;
      revenue: number;
      deliveredRevenue: number;
      deliveredOrders: number;
      cancelledOrders: number;
      spend: number;
      channelMix: Map<string, number>;
      campaignMix: Map<string, number>;
    }
  >();

  let revenue = 0;
  let deliveredRevenue = 0;
  let trackedOrders = 0;

  for (const o of orders) {
    const touch = o.attribution?.last ?? o.attribution?.first ?? {};
    const hasTouch = Object.keys(touch).some((k) => k !== "captured_at" && k !== "landing_page");
    const channel = touch.channel ?? (hasTouch ? channelOf(touch) : "direct");
    const campaignId = touch.campaign_id ?? null;
    const campaignName = touch.campaign_name ?? touch.utm_campaign ?? null;
    const key = campaignId ?? (campaignName ? `name:${normName(campaignName)}` : `channel:${channel}`);

    const total = num(o.total);
    const isVoid = VOID.has(o.status);
    const isDelivered = DELIVERED.has(o.status);
    const orderRevenue = isVoid ? 0 : total;
    const orderDelivered = isDelivered ? total : 0;
    revenue += orderRevenue;
    deliveredRevenue += orderDelivered;
    if (hasTouch) trackedOrders += 1;

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        key,
        campaignId,
        campaignName: campaignName ?? (campaignId ? `Campaign ${campaignId}` : channel),
        channel,
        orders: 0,
        revenue: 0,
        deliveredRevenue: 0,
        spend: 0,
        matched: false,
        products: new Map(),
      };
      buckets.set(key, bucket);
    }
    bucket.orders += 1;
    bucket.revenue += orderRevenue;
    bucket.deliveredRevenue += orderDelivered;

    const ch = channels.get(channel) ?? {
      channel,
      orders: 0,
      revenue: 0,
      deliveredRevenue: 0,
      spend: 0,
      roas: 0,
    };
    ch.orders += 1;
    ch.revenue += orderRevenue;
    ch.deliveredRevenue += orderDelivered;
    channels.set(channel, ch);

    const lineTotal = (o.order_items ?? []).reduce((sum, i) => sum + num(i.line_total), 0) || 1;

    for (const item of o.order_items ?? []) {
      const pKey = item.product_id ?? `name:${normName(item.product_name)}`;
      const share = num(item.line_total) / lineTotal;
      const p = products.get(pKey) ?? {
        productId: item.product_id,
        name: item.product_name,
        slug: item.product_slug,
        orders: 0,
        units: 0,
        revenue: 0,
        deliveredRevenue: 0,
        deliveredOrders: 0,
        cancelledOrders: 0,
        spend: 0,
        channelMix: new Map<string, number>(),
        campaignMix: new Map<string, number>(),
      };
      p.orders += 1;
      p.units += num(item.quantity);
      p.revenue += isVoid ? 0 : num(item.line_total);
      if (isDelivered) {
        p.deliveredOrders += 1;
        p.deliveredRevenue += num(item.line_total);
      }
      if (isVoid) p.cancelledOrders += 1;
      p.channelMix.set(channel, (p.channelMix.get(channel) ?? 0) + orderRevenue * share);
      p.campaignMix.set(bucket.key, (p.campaignMix.get(bucket.key) ?? 0) + orderRevenue * share);
      products.set(pKey, p);

      const bp = bucket.products.get(pKey) ?? {
        name: item.product_name,
        units: 0,
        revenue: 0,
      };
      bp.units += num(item.quantity);
      bp.revenue += isVoid ? 0 : num(item.line_total);
      bucket.products.set(pKey, bp);
    }
  }

  // --- Attach Meta spend to buckets ---------------------------------------
  let matchedSpend = 0;
  for (const bucket of buckets.values()) {
    const spend =
      (bucket.campaignId ? spendById.get(bucket.campaignId) : undefined) ??
      spendByName.get(normName(bucket.campaignName)) ??
      0;
    bucket.spend = spend;
    bucket.matched = spend > 0;
    matchedSpend += spend;
    const ch = channels.get(bucket.channel);
    if (ch) ch.spend += spend;
  }

  // Allocate each bucket's spend across products by revenue share.
  for (const bucket of buckets.values()) {
    if (bucket.spend <= 0 || bucket.revenue <= 0) continue;
    for (const [pKey, bp] of bucket.products) {
      const p = products.get(pKey);
      if (!p) continue;
      p.spend += bucket.spend * (bp.revenue / bucket.revenue);
    }
  }

  const pickTop = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const productRows: AttributionProductRow[] = [...products.values()]
    .map((p) => {
      const topCampaignKey = pickTop(p.campaignMix);
      const bucket = topCampaignKey ? buckets.get(topCampaignKey) : undefined;
      return {
        productId: p.productId,
        name: p.name,
        slug: p.slug,
        orders: p.orders,
        units: p.units,
        revenue: p.revenue,
        deliveredRevenue: p.deliveredRevenue,
        deliveredOrders: p.deliveredOrders,
        cancelledOrders: p.cancelledOrders,
        spend: p.spend,
        roas: p.spend > 0 ? p.revenue / p.spend : 0,
        trueRoas: p.spend > 0 ? p.deliveredRevenue / p.spend : 0,
        topChannel: pickTop(p.channelMix) ?? "direct",
        topCampaign: bucket && bucket.campaignId ? bucket.campaignName : (bucket?.campaignName ?? null),
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const campaignRows: AttributionCampaignRow[] = [...buckets.values()]
    .map((b) => ({
      key: b.key,
      campaignId: b.campaignId,
      campaignName: b.campaignName,
      channel: b.channel,
      orders: b.orders,
      revenue: b.revenue,
      deliveredRevenue: b.deliveredRevenue,
      spend: b.spend,
      roas: b.spend > 0 ? b.revenue / b.spend : 0,
      trueRoas: b.spend > 0 ? b.deliveredRevenue / b.spend : 0,
      matched: b.matched,
      topProducts: [...b.products.values()].sort((x, y) => y.revenue - x.revenue).slice(0, 4),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const channelRows = [...channels.values()]
    .map((c) => ({ ...c, roas: c.spend > 0 ? c.revenue / c.spend : 0 }))
    .sort((a, b) => b.revenue - a.revenue);

  return {
    connected,
    ...(message ? { message } : {}),
    currency,
    range,
    totals: {
      orders: orders.length,
      trackedOrders,
      untrackedOrders: orders.length - trackedOrders,
      revenue,
      deliveredRevenue,
      spend: totalSpend,
      matchedSpend,
      roas: totalSpend > 0 ? revenue / totalSpend : 0,
      trueRoas: totalSpend > 0 ? deliveredRevenue / totalSpend : 0,
    },
    products: productRows,
    campaigns: campaignRows,
    channels: channelRows,
  };
}
