/**
 * Browser tracking foundation (client-safe).
 *
 * Every marketing event is pushed into the GTM `dataLayer` with a stable
 * `event_id`, so the same id can later be replayed server-side (Meta CAPI /
 * TikTok Events API / GA4 Measurement Protocol) and be de-duplicated.
 *
 * Nothing here loads a pixel — Meta Pixel, TikTok Pixel, GA4 and Clarity are
 * all configured inside the GTM container. This file only feeds them.
 */

import { useEffect, useRef } from "react";

import { getAttribution, visitorId } from "./attribution";

export type Surface = "site" | "landing";

export type TrackingItem = {
  /** MUST equal the catalog id (`sku`) used in /catalog.xml. */
  id: string;
  name?: string | undefined;
  category?: string | undefined;
  /** Variant label, e.g. "Size: M" — matches the catalogue variant row. */
  variant?: string | undefined;
  /** Parent product grouping (catalogue `item_group_id`). */
  item_group_id?: string | undefined;
  quantity: number;
  price: number;
};

type DataLayerRecord = Record<string, unknown>;

declare global {
  interface Window {
    dataLayer?: DataLayerRecord[];
  }
}

/** Which funnel the visitor is in — landing pages track separately. */
export function surfaceOf(pathname: string): Surface {
  return pathname.startsWith("/lp/") ? "landing" : "site";
}

/**
 * Stable event id shared by the browser event and its server-side twin.
 * Orders use the order number instead, so retries never double-count.
 */
export function newEventId(event: string): string {
  const vid = (visitorId() ?? "anon").replace(/-/g, "").slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${event}.${vid}.${Math.floor(Date.now() / 1000)}.${rand}`;
}

/** Funnel events that also get a server-side (CAPI) twin. */
const SERVER_TWIN = new Set(["view_item", "add_to_cart", "begin_checkout"]);

type TwinContent = { id: string; name?: string | undefined; category?: string | undefined; quantity: number; price: number };

/**
 * Replays a funnel event to Meta CAPI / TikTok Events API with the *same*
 * `event_id`, so both platforms de-duplicate the browser+server pair.
 * Fire-and-forget: a tracking failure must never affect the UI.
 */
function sendServerTwin(event: string, eventId: string, payload: DataLayerRecord, attribution: Record<string, string | undefined>) {
  if (!SERVER_TWIN.has(event)) return;
  const raw = Array.isArray(payload["contents"]) ? (payload["contents"] as Record<string, unknown>[]) : [];
  const contents: TwinContent[] = raw
    .map((c) => ({
      id: String(c["id"] ?? c["content_id"] ?? ""),
      name: c["content_name"] ? String(c["content_name"]) : undefined,
      category: c["content_category"] ? String(c["content_category"]) : undefined,
      quantity: Number(c["quantity"] ?? 1) || 1,
      price: Number(c["price"] ?? c["item_price"] ?? 0) || 0,
    }))
    .filter((c) => c.id);
  if (!contents.length) return;

  void import("./funnel-capi.functions")
    .then(({ trackFunnelEvent }) =>
      trackFunnelEvent({
        data: {
          event: event as "view_item" | "add_to_cart" | "begin_checkout",
          eventId,
          url: window.location.href,
          value: Number(payload["value"] ?? 0) || 0,
          contents,
          fbp: attribution["fbp"],
          fbc: attribution["fbc"],
          ttp: attribution["ttp"],
          ttclid: attribution["ttclid"],
          externalId: visitorId() ?? undefined,
        },
      }),
    )
    .catch(() => undefined);
}

/** Pushes an event into the GTM dataLayer (no-op during SSR). */
export function pushEvent(
  event: string,
  payload: DataLayerRecord = {},
  options?: { eventId?: string; surface?: Surface },
): string | undefined {
  if (typeof window === "undefined") return undefined;
  const eventId = options?.eventId ?? newEventId(event);
  const attribution = getAttribution().last ?? {};
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event,
    event_id: eventId,
    surface: options?.surface ?? surfaceOf(window.location.pathname),
    external_id: visitorId(),
    fbp: attribution.fbp,
    fbc: attribution.fbc,
    ttclid: attribution.ttclid,
    ttp: attribution.ttp,
    ...payload,
  });
  sendServerTwin(event, eventId, payload, attribution as Record<string, string | undefined>);
  return eventId;
}


/** GA4 / Meta friendly ecommerce block for a set of items. */
export function ecommerce(items: TrackingItem[], extra?: DataLayerRecord): DataLayerRecord {
  const value = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  return {
    ecommerce: {
      currency: "BDT",
      value,
      items: items.map((i) => ({
        item_id: i.id,
        item_name: i.name,
        item_category: i.category,
        item_variant: i.variant,
        item_group_id: i.item_group_id,
        price: i.price,
        quantity: i.quantity,
      })),
      ...extra,
    },
    content_type: "product",
    content_ids: items.map((i) => i.id),
    content_name: items[0]?.name,
    content_category: items[0]?.category,
    contents: items.map((i) => ({
      // Meta reads `id`; TikTok requires `content_id` (Video Shopping Ads).
      id: i.id,
      content_id: i.id,
      content_name: i.name,
      content_category: i.category,
      price: i.price,
      quantity: i.quantity,
      item_price: i.price,
      item_name: i.name,
      item_category: i.category,
      item_variant: i.variant,
      item_group_id: i.item_group_id,
    })),
    num_items: items.reduce((sum, i) => sum + i.quantity, 0),
    value,
    currency: "BDT",
  };
}

const SCROLL_STEPS = [25, 50, 75, 100] as const;

/**
 * Fires `scroll_depth` once per threshold (25/50/75/100%) for the current
 * page. Used on landing pages, where scroll is the main engagement signal.
 */
export function useScrollDepth(payload: DataLayerRecord = {}, enabled = true) {
  const fired = useRef<Set<number>>(new Set());
  const key = JSON.stringify(payload);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const seen = fired.current;
    seen.clear();

    const onScroll = () => {
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const percent =
        scrollable <= 0 ? 100 : ((window.scrollY + window.innerHeight) / doc.scrollHeight) * 100;
      for (const step of SCROLL_STEPS) {
        if (percent >= step && !seen.has(step)) {
          seen.add(step);
          pushEvent("scroll_depth", { ...payload, percent_scrolled: step });
        }
      }
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // `key` re-arms the tracker whenever the tracked page/product changes.
  }, [key, enabled, payload]);
}

/** Fires an event exactly once per mount (e.g. ViewContent / begin_checkout). */
export function useTrackOnce(event: string, payload: DataLayerRecord, enabled = true) {
  const key = `${event}:${JSON.stringify(payload)}`;
  const done = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || done.current === key) return;
    done.current = key;
    pushEvent(event, payload);
  }, [key, enabled, event, payload]);
}
