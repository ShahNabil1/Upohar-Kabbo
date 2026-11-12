/**
 * Server-side twins for the browser funnel events (server-only).
 *
 * The browser pushes `view_item` / `add_to_cart` / `begin_checkout` into GTM
 * (Meta Pixel + TikTok Pixel). This module replays the very same event with
 * the very same `event_id` to Meta Conversions API and the TikTok Events API,
 * so the platforms de-duplicate the pair and the match quality goes up
 * (server events carry IP, user agent, fbp/fbc/ttp/ttclid and external_id even
 * when the browser call is blocked by iOS/adblockers).
 *
 * Purchase is NOT handled here — it stays order-driven in
 * `tracking-dispatch.server.ts` and only fires when admin confirms the order.
 */

import { readTrackingConfig } from "./tracking.server";

export type FunnelEvent = "view_item" | "add_to_cart" | "begin_checkout";

export type FunnelContent = {
  id: string;
  name?: string | undefined;
  category?: string | undefined;
  quantity: number;
  price: number;
};

export type FunnelInput = {
  event: FunnelEvent;
  eventId: string;
  url: string;
  value: number;
  contents: FunnelContent[];
  fbp?: string | undefined;
  fbc?: string | undefined;
  ttp?: string | undefined;
  ttclid?: string | undefined;
  externalId?: string | undefined;
};

const META_NAME: Record<FunnelEvent, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
};

const TIKTOK_NAME: Record<FunnelEvent, string> = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
};

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input.trim().toLowerCase()));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function emqOf(keys: string[]): number {
  const weights: Record<string, number> = { fbc: 3, fbp: 2, ttclid: 3, ttp: 2, external_id: 1, ip: 1, ua: 1 };
  const score = keys.reduce((sum, k) => sum + (weights[k] ?? 0), 0);
  return Math.max(1, Math.min(10, Math.round(score)));
}

type Sent = { platform: "meta" | "tiktok"; ok: boolean; message: string; response: unknown };

/**
 * Fans one funnel event out to Meta + TikTok and logs every attempt into
 * `tracking_events` (order_id null) so the admin debug view shows them.
 * Never throws — tracking must not break the storefront.
 */
export async function sendFunnelEvent(
  input: FunnelInput,
  visitor: { ip: string | null; userAgent: string | null },
): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const cfg = await readTrackingConfig().catch(() => null);
  if (!cfg) return out;

  const eventTime = Math.floor(Date.now() / 1000);
  const keys: string[] = [];
  const metaUser: Record<string, unknown> = {};
  const tiktokUser: Record<string, unknown> = {};

  if (visitor.ip) {
    metaUser["client_ip_address"] = visitor.ip;
    tiktokUser["ip"] = visitor.ip;
    keys.push("ip");
  }
  if (visitor.userAgent) {
    metaUser["client_user_agent"] = visitor.userAgent;
    tiktokUser["user_agent"] = visitor.userAgent;
    keys.push("ua");
  }
  metaUser["country"] = await sha256Hex("bd");
  if (input.fbp) { metaUser["fbp"] = input.fbp; keys.push("fbp"); }
  if (input.fbc) { metaUser["fbc"] = input.fbc; keys.push("fbc"); }
  if (input.ttp) { tiktokUser["ttp"] = input.ttp; keys.push("ttp"); }
  if (input.ttclid) { tiktokUser["ttclid"] = input.ttclid; keys.push("ttclid"); }
  if (input.externalId) {
    const ex = await sha256Hex(input.externalId);
    metaUser["external_id"] = ex;
    tiktokUser["external_id"] = ex;
    keys.push("external_id");
  }

  const results: Sent[] = [];

  // ------------------------------------------------------------ Meta CAPI
  if (cfg.metaPixelId && cfg.metaCapiToken) {
    const body: Record<string, unknown> = {
      data: [
        {
          event_name: META_NAME[input.event],
          event_time: eventTime,
          event_id: input.eventId,
          action_source: "website",
          event_source_url: input.url,
          user_data: metaUser,
          custom_data: {
            currency: "BDT",
            value: input.value,
            content_type: "product",
            content_ids: input.contents.map((c) => c.id),
            content_name: input.contents[0]?.name,
            content_category: [...new Set(input.contents.map((c) => c.category).filter(Boolean))].join(", "),
            num_items: input.contents.reduce((s, c) => s + c.quantity, 0),
            contents: input.contents.map((c) => ({
              id: c.id,
              quantity: c.quantity,
              item_price: c.price,
              title: c.name,
              ...(c.category ? { category: c.category } : {}),
            })),
          },
        },
      ],
    };
    if (cfg.metaTestCode) body["test_event_code"] = cfg.metaTestCode;

    try {
      const res = await fetch(
        `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPixelId}/events?access_token=${encodeURIComponent(cfg.metaCapiToken)}`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      );
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const err = (json["error"] ?? {}) as Record<string, unknown>;
      results.push({
        platform: "meta",
        ok: res.ok,
        message: res.ok
          ? `Accepted (${String(json["events_received"] ?? 1)} event)`
          : String(err["error_user_msg"] ?? err["message"] ?? `Graph API error ${res.status}`),
        response: json,
      });
    } catch (error) {
      results.push({
        platform: "meta",
        ok: false,
        message: error instanceof Error ? error.message : "Network error",
        response: {},
      });
    }
  }

  // --------------------------------------------------------- TikTok Events
  if (cfg.tiktokPixelId && cfg.tiktokToken) {
    const payload: Record<string, unknown> = {
      event_source: "web",
      event_source_id: cfg.tiktokPixelId,
      data: [
        {
          event: TIKTOK_NAME[input.event],
          event_time: eventTime,
          event_id: input.eventId,
          user: tiktokUser,
          page: { url: input.url },
          properties: {
            currency: "BDT",
            value: input.value,
            content_type: "product",
            contents: input.contents.map((c) => ({
              content_id: c.id,
              content_type: "product",
              content_name: c.name,
              ...(c.category ? { content_category: c.category } : {}),
              quantity: c.quantity,
              price: c.price,
            })),
          },
        },
      ],
    };
    if (cfg.tiktokTestCode) payload["test_event_code"] = cfg.tiktokTestCode;

    try {
      const res = await fetch("https://business-api.tiktok.com/open_api/v1.3/event/track/", {
        method: "POST",
        headers: { "content-type": "application/json", "Access-Token": cfg.tiktokToken },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const ok = res.ok && Number(json["code"] ?? -1) === 0;
      results.push({
        platform: "tiktok",
        ok,
        message: ok ? "Accepted by TikTok" : String(json["message"] ?? `TikTok API error ${res.status}`),
        response: json,
      });
    } catch (error) {
      results.push({
        platform: "tiktok",
        ok: false,
        message: error instanceof Error ? error.message : "Network error",
        response: {},
      });
    }
  }

  for (const r of results) (r.ok ? out.sent++ : out.failed++);

  // Log every attempt for the admin debug view (best effort only).
  if (results.length) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.from("tracking_events").insert(
        results.map((r) => ({
          order_id: null,
          platform: r.platform,
          event_name: r.platform === "meta" ? META_NAME[input.event] : TIKTOK_NAME[input.event],
          event_id: input.eventId,
          status: r.ok ? "sent" : "failed",
          message: r.message.slice(0, 500),
          match_keys: keys,
          emq: emqOf(keys),
          request: { event: input.event, platform: r.platform, url: input.url },
          response: JSON.parse(JSON.stringify(r.response ?? {})) as never,
        })),
      );
    } catch {
      // Logging must never break the storefront.
    }
  }

  return out;
}
