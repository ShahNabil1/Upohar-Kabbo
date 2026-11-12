/**
 * Server-side conversion fan-out (server-only).
 *
 * Option A: the app itself calls this whenever an order is placed or its
 * status changes. It reads the order, rebuilds the visitor identity captured
 * at checkout (fbp/fbc/ttp/GA client id + hashed PII) and fans the event out
 * to Meta CAPI, TikTok Events API and GA4 Measurement Protocol.
 *
 * Every attempt is written to `tracking_events`, so the admin debug view can
 * show exactly what was sent, what came back and how strong the match was.
 * A partial unique index on (order_id, platform, event_name) WHERE status =
 * 'sent' guarantees each conversion is only counted once, even if a status is
 * toggled back and forth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";

import { readTrackingConfig, type TrackingConfig } from "./tracking.server";
import { SITE_URL } from "./site";

type Db = SupabaseClient<Database>;

export type Platform = "meta" | "tiktok" | "ga4";

type Attribution = Record<string, string | undefined>;

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  city: string | null;
  district: string | null;
  division: string | null;
  subtotal: number;
  delivery_charge: number;
  total: number;
  created_at: string;
  customer_ip: string | null;
  customer_user_agent: string | null;
  attribution: { first?: Attribution; last?: Attribution } | null;
  order_items: Array<{
    product_id: string | null;
    product_name: string;
    product_slug: string | null;
    variant_label: string | null;
    sku: string | null;
    unit_price: number;
    quantity: number;
    line_total: number;
    products?: {
      sku: string | null;
      brand: string | null;
      categories?: { name_en: string } | null;
    } | null;
  }>;
};

/* ------------------------------------------------------------------ utils */

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Meta/TikTok normalisation: trim + lowercase, then SHA-256. */
async function hashed(value: string | null | undefined): Promise<string | undefined> {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return undefined;
  return sha256Hex(v);
}

/** Bangladeshi numbers must be E.164 without the leading `+` before hashing. */
function normalizePhone(raw: string | null | undefined): string | undefined {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return `88${digits}`;
  if (digits.length === 10) return `880${digits}`;
  return digits;
}

function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.length > 1 ? (parts[parts.length - 1] ?? "") : "" };
}

function attrOf(order: OrderRow): Attribution {
  const a = order.attribution ?? {};
  // Last touch wins for click ids; first touch fills the gaps.
  return { ...(a.first ?? {}), ...(a.last ?? {}) };
}

type OrderItem = OrderRow["order_items"][number];

function contentIdOf(item: OrderItem): string {
  return item.sku || item.product_slug || item.product_id || item.product_name;
}

function categoryOf(item: OrderItem): string | undefined {
  return item.products?.categories?.name_en ?? undefined;
}

/** Catalogue-shaped line, so Meta/TikTok/GA4 can match products & variants. */
function lineOf(item: OrderItem) {
  return {
    id: contentIdOf(item),
    name: item.product_name,
    category: categoryOf(item),
    variant: item.variant_label ?? undefined,
    group: item.products?.sku ?? item.product_slug ?? undefined,
    brand: item.products?.brand ?? undefined,
    quantity: item.quantity,
    price: Number(item.unit_price),
  };
}

function landingUrl(order: OrderRow): string {
  const path = attrOf(order)["landing_page"];
  return path && path.startsWith("/") ? `${SITE_URL}${path}` : `${SITE_URL}/`;
}

/** Deterministic per order+platform+event, so browser & server dedupe. */
function eventIdFor(orderNumber: string, event: string): string {
  return `${orderNumber}.${event}`.toLowerCase().replace(/\s+/g, "-");
}

/* ------------------------------------------------------------- identities */

type UserData = {
  meta: Record<string, unknown>;
  tiktok: Record<string, unknown>;
  keys: string[];
};

async function buildUserData(order: OrderRow): Promise<UserData> {
  const a = attrOf(order);
  const phone = normalizePhone(order.customer_phone);
  const { first, last } = splitName(order.customer_name);

  const [ph, fn, ln, ct, em, ex] = await Promise.all([
    hashed(phone),
    hashed(first),
    hashed(last),
    hashed(order.city ?? order.district),
    hashed(order.customer_email),
    hashed(a["external_id"]),
  ]);

  const keys: string[] = [];
  const meta: Record<string, unknown> = {};
  const tiktok: Record<string, unknown> = {};

  // Not hashed by rule: IP, user agent, country, state (region).
  if (order.customer_ip) {
    meta["client_ip_address"] = order.customer_ip;
    tiktok["ip"] = order.customer_ip;
    keys.push("ip");
  }
  if (order.customer_user_agent) {
    meta["client_user_agent"] = order.customer_user_agent;
    tiktok["user_agent"] = order.customer_user_agent;
    keys.push("ua");
  }
  meta["country"] = await sha256Hex("bd"); // Meta requires country hashed.
  if (order.division) meta["st"] = await sha256Hex(order.division.trim().toLowerCase());

  // Hashed by rule: phone, name, city (+ email when present).
  if (ph) { meta["ph"] = ph; tiktok["phone"] = ph; keys.push("phone"); }
  if (fn) { meta["fn"] = fn; keys.push("name"); }
  if (ln) meta["ln"] = ln;
  if (ct) meta["ct"] = ct;
  if (em) { meta["em"] = em; tiktok["email"] = em; keys.push("email"); }
  if (ex) { meta["external_id"] = ex; tiktok["external_id"] = ex; keys.push("external_id"); }

  if (a["fbp"]) { meta["fbp"] = a["fbp"]; keys.push("fbp"); }
  if (a["fbc"]) { meta["fbc"] = a["fbc"]; keys.push("fbc"); }
  if (a["ttp"]) { tiktok["ttp"] = a["ttp"]; keys.push("ttp"); }
  if (a["ttclid"]) { tiktok["ttclid"] = a["ttclid"]; keys.push("ttclid"); }

  return { meta, tiktok, keys };
}

/* ------------------------------------------------------------- platforms */

type SendResult = { ok: boolean; message: string; response: unknown };

async function sendMeta(
  cfg: TrackingConfig,
  order: OrderRow,
  eventName: string,
  eventId: string,
  ud: UserData,
): Promise<SendResult> {
  const body: Record<string, unknown> = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: landingUrl(order),
        user_data: ud.meta,
        custom_data: {
          currency: "BDT",
          value: Number(order.total),
          order_id: order.order_number,
          num_items: order.order_items.reduce((s, i) => s + i.quantity, 0),
          content_type: "product",
          content_ids: order.order_items.map(contentIdOf),
          content_category: [
            ...new Set(order.order_items.map(categoryOf).filter(Boolean)),
          ].join(", "),
          contents: order.order_items.map((i) => {
            const l = lineOf(i);
            return {
              id: l.id,
              quantity: l.quantity,
              item_price: l.price,
              title: l.name,
              ...(l.category ? { category: l.category } : {}),
              ...(l.brand ? { brand: l.brand } : {}),
              ...(l.group ? { item_group_id: l.group } : {}),
            };
          }),
        },
      },
    ],
  };
  if (cfg.metaTestCode) body["test_event_code"] = cfg.metaTestCode;

  const res = await fetch(
    `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPixelId}/events?access_token=${encodeURIComponent(cfg.metaCapiToken)}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = (json["error"] ?? {}) as Record<string, unknown>;
    return {
      ok: false,
      message: String(err["error_user_msg"] ?? err["message"] ?? `Graph API error ${res.status}`),
      response: json,
    };
  }
  return { ok: true, message: `Accepted (${String(json["events_received"] ?? 1)} event)`, response: json };
}

async function sendTikTok(
  cfg: TrackingConfig,
  order: OrderRow,
  eventName: string,
  eventId: string,
  ud: UserData,
): Promise<SendResult> {
  const payload: Record<string, unknown> = {
    event_source: "web",
    event_source_id: cfg.tiktokPixelId,
    data: [
      {
        event: eventName,
        event_time: Math.floor(new Date(order.created_at).getTime() / 1000),
        event_id: eventId,
        user: ud.tiktok,
        page: { url: landingUrl(order) },
        properties: {
          currency: "BDT",
          value: Number(order.total),
          order_id: order.order_number,
          contents: order.order_items.map((i) => {
            const l = lineOf(i);
            return {
              content_id: l.id,
              content_type: "product",
              content_name: l.name,
              ...(l.category ? { content_category: l.category } : {}),
              ...(l.brand ? { brand: l.brand } : {}),
              quantity: l.quantity,
              price: l.price,
            };
          }),
        },
      },
    ],
  };
  if (cfg.tiktokTestCode) payload["test_event_code"] = cfg.tiktokTestCode;

  const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
    method: "POST",
    headers: { "content-type": "application/json", "Access-Token": cfg.tiktokToken },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const code = Number(json["code"] ?? -1);
  if (!res.ok || code !== 0) {
    return { ok: false, message: String(json["message"] ?? `TikTok API error ${res.status}`), response: json };
  }
  return { ok: true, message: "Accepted by TikTok", response: json };
}

async function sendGa4(
  cfg: TrackingConfig,
  order: OrderRow,
  eventName: string,
  eventId: string,
): Promise<SendResult> {
  const a = attrOf(order);
  // Without a real GA client id the hit cannot be joined to the web session;
  // a stable synthetic id at least keeps the conversion in the property.
  const clientId = a["ga_client_id"] ?? `${Math.abs(hashCode(order.order_number))}.${Math.floor(new Date(order.created_at).getTime() / 1000)}`;

  const res = await fetch(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(cfg.ga4MeasurementId)}&api_secret=${encodeURIComponent(cfg.ga4ApiSecret)}`,
    {
      method: "POST",
      body: JSON.stringify({
        client_id: clientId,
        ...(a["external_id"] ? { user_id: a["external_id"] } : {}),
        non_personalized_ads: false,
        events: [
          {
            name: eventName,
            params: {
              transaction_id: order.order_number,
              value: Number(order.total),
              shipping: Number(order.delivery_charge),
              currency: "BDT",
              engagement_time_msec: 1,
              ...(a["ga_session_id"] ? { session_id: a["ga_session_id"] } : {}),
              ...(a["utm_source"] ? { source: a["utm_source"] } : {}),
              ...(a["utm_medium"] ? { medium: a["utm_medium"] } : {}),
              ...(a["utm_campaign"] ? { campaign: a["utm_campaign"] } : {}),
              event_id: eventId,
              items: order.order_items.map((i) => {
                const l = lineOf(i);
                return {
                  item_id: l.id,
                  item_name: l.name,
                  ...(l.category ? { item_category: l.category } : {}),
                  ...(l.variant ? { item_variant: l.variant } : {}),
                  ...(l.brand ? { item_brand: l.brand } : {}),
                  ...(l.group ? { item_group_id: l.group } : {}),
                  price: l.price,
                  quantity: l.quantity,
                };
              }),
            },
          },
        ],
      }),
    },
  );
  if (!res.ok) return { ok: false, message: `Measurement Protocol error ${res.status}`, response: {} };
  return { ok: true, message: "Sent to GA4", response: { status: res.status } };
}

function hashCode(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h << 5) - h + value.charCodeAt(i);
  return h;
}

/* ------------------------------------------------------------------ plan */

type PlanEntry = { platform: Platform; event: string };

/**
 * Status → conversion mapping agreed with the business:
 *   confirmed / pending (order confirmed by admin) → Meta Purchase ·
 *     TikTok PlaceAnOrder · GA4 purchase
 *   delivered  → TikTok CompletePayment (TikTok's "purchase" event)
 *   cancelled / returned → GA4 refund
 *
 * A website order is created as `processing` (not yet verified), so no
 * conversion fires at checkout. When admin confirms it the order moves to
 * `pending` and the sale is counted once (tracking_events dedupe).
 */
export function eventPlan(status: string): PlanEntry[] {
  switch (status) {
    case "pending":
    case "confirmed":
      return [
        { platform: "meta", event: "Purchase" },
        { platform: "tiktok", event: "PlaceAnOrder" },
        { platform: "ga4", event: "purchase" },
      ];
    case "delivered":
      return [{ platform: "tiktok", event: "CompletePayment" }];
    case "cancelled":
    case "returned":
      return [{ platform: "ga4", event: "refund" }];
    default:
      return [];
  }
}


/* -------------------------------------------------------------- dispatch */

/** Rough Meta-style match-quality score (0-10) from the keys we could supply. */
function estimateEmq(keys: string[]): number {
  const weights: Record<string, number> = {
    fbc: 3, fbp: 2, ttclid: 3, ttp: 2, phone: 2,
    external_id: 1, email: 2, ip: 1, ua: 1, name: 1,
  };
  const score = keys.reduce((sum, k) => sum + (weights[k] ?? 0), 0);
  return Math.max(1, Math.min(10, Math.round(score)));
}

async function loadOrder(db: Db, orderId: string): Promise<OrderRow | null> {
  const { data } = await db
    .from("orders")
    .select(
      "id, order_number, customer_name, customer_phone, customer_email, city, district, division, subtotal, delivery_charge, total, created_at, customer_ip, customer_user_agent, attribution, order_items(product_id, product_name, product_slug, variant_label, sku, unit_price, quantity, line_total, products:product_id(sku, brand, categories:category_id(name_en)))",
    )
    .eq("id", orderId)
    .maybeSingle();
  return (data as unknown as OrderRow) ?? null;
}

/**
 * Fires every conversion mapped to `status` for one order. Never throws — a
 * tracking outage must not break the order pipeline; failures land in
 * `tracking_events` with status `failed` so they can be retried.
 */
export async function dispatchOrderEvents(
  db: Db,
  orderId: string,
  status: string,
): Promise<{ sent: number; failed: number; skipped: number }> {
  const plan = eventPlan(status);
  const result = { sent: 0, failed: 0, skipped: 0 };
  if (!plan.length) return result;

  let cfg: TrackingConfig;
  let order: OrderRow | null;
  try {
    [cfg, order] = await Promise.all([readTrackingConfig(), loadOrder(db, orderId)]);
  } catch {
    return result;
  }
  if (!order) return result;

  const ud = await buildUserData(order);
  const emq = estimateEmq(ud.keys);

  // Already-sent conversions are never repeated (server-side dedupe).
  const { data: doneRows } = await db
    .from("tracking_events")
    .select("platform, event_name")
    .eq("order_id", orderId)
    .eq("status", "sent");
  const done = new Set(
    ((doneRows ?? []) as Array<{ platform: string; event_name: string }>).map(
      (r) => `${r.platform}:${r.event_name}`,
    ),
  );

  for (const entry of plan) {
    if (done.has(`${entry.platform}:${entry.event}`)) {
      result.skipped += 1;
      continue;
    }

    const configured =
      entry.platform === "meta"
        ? Boolean(cfg.metaPixelId && cfg.metaCapiToken)
        : entry.platform === "tiktok"
          ? Boolean(cfg.tiktokPixelId && cfg.tiktokToken)
          : Boolean(cfg.ga4MeasurementId && cfg.ga4ApiSecret);

    const eventId = eventIdFor(order.order_number, entry.event);

    if (!configured) {
      result.skipped += 1;
      await logEvent(db, {
        orderId,
        platform: entry.platform,
        event: entry.event,
        eventId,
        ok: false,
        state: "skipped",
        message: "Credentials not configured in API & Integrations",
        keys: ud.keys,
        emq,
        response: {},
      });
      continue;
    }

    let outcome: SendResult;
    try {
      outcome =
        entry.platform === "meta"
          ? await sendMeta(cfg, order, entry.event, eventId, ud)
          : entry.platform === "tiktok"
            ? await sendTikTok(cfg, order, entry.event, eventId, ud)
            : await sendGa4(cfg, order, entry.event, eventId);
    } catch (error) {
      outcome = { ok: false, message: error instanceof Error ? error.message : "Network error", response: {} };
    }

    if (outcome.ok) result.sent += 1;
    else result.failed += 1;

    await logEvent(db, {
      orderId,
      platform: entry.platform,
      event: entry.event,
      eventId,
      ok: outcome.ok,
      state: outcome.ok ? "sent" : "failed",
      message: outcome.message,
      keys: ud.keys,
      emq,
      response: outcome.response,
    });
  }

  return result;
}

async function logEvent(
  db: Db,
  entry: {
    orderId: string;
    platform: Platform;
    event: string;
    eventId: string;
    ok: boolean;
    state: string;
    message: string;
    keys: string[];
    emq: number;
    response: unknown;
  },
) {
  try {
    await db.from("tracking_events").insert({
      order_id: entry.orderId,
      platform: entry.platform,
      event_name: entry.event,
      event_id: entry.eventId,
      status: entry.state,
      message: entry.message.slice(0, 500),
      match_keys: entry.keys,
      emq: entry.emq,
      request: { event: entry.event, platform: entry.platform },
      response: JSON.parse(JSON.stringify(entry.response ?? {})) as never,
    });
  } catch {
    // Logging must never break the order flow.
  }
}

/** Retry a single failed row from the admin debug view. */
export async function retryTrackingEvent(db: Db, eventRowId: string): Promise<{ ok: boolean; message: string }> {
  const { data } = await db
    .from("tracking_events")
    .select("id, order_id, platform, event_name")
    .eq("id", eventRowId)
    .maybeSingle();
  const row = data as { order_id: string | null; platform: string; event_name: string } | null;
  if (!row?.order_id) return { ok: false, message: "Event not found" };

  const statusForEvent =
    row.event_name === "CompletePayment" ? "delivered" : row.event_name === "refund" ? "cancelled" : "pending";
  const out = await dispatchOrderEvents(db, row.order_id, statusForEvent);
  return {
    ok: out.sent > 0,
    message: out.sent > 0 ? "Event re-sent" : out.skipped > 0 ? "Already sent or not configured" : "Retry failed",
  };
}
