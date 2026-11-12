/**
 * Admin-facing server functions for the tracking debug view.
 * Thin wrappers only — all runtime logic lives in `*.server.ts` modules.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";

/**
 * Public tracking config for the browser. Only the GTM container id is
 * exposed — every pixel id and API secret stays server-side. The container is
 * what loads Meta Pixel, TikTok Pixel, GA4 and Microsoft Clarity.
 */
export const getGtmContainerId = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { readTrackingConfig } = await import("./tracking.server");
    const cfg = await readTrackingConfig();
    const id = cfg.gtmId.toUpperCase();
    return { gtmId: /^GTM-[A-Z0-9]{6,9}$/.test(id) ? id : "" };
  } catch {
    return { gtmId: "" };
  }
});

const listSchema = z.object({
  platform: z.enum(["all", "meta", "tiktok", "ga4"]).default("all"),
  status: z.enum(["all", "sent", "failed", "skipped"]).default("all"),
  search: z.string().trim().max(80).default(""),
  limit: z.number().int().min(10).max(200).default(50),
});

export type TrackingEventRow = {
  id: string;
  order_id: string | null;
  order_number: string | null;
  platform: string;
  event_name: string;
  event_id: string;
  status: string;
  message: string | null;
  match_keys: string[];
  emq: number | null;
  /** Raw API response, pretty-printed for the debug drawer. */
  response: string;
  attempts: number;
  created_at: string;
};

export const listTrackingEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    let query = db
      .from("tracking_events")
      .select(
        "id, order_id, platform, event_name, event_id, status, message, match_keys, emq, response, attempts, created_at, orders(order_number)",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.platform !== "all") query = query.eq("platform", data.platform);
    if (data.status !== "all") query = query.eq("status", data.status);
    if (data.search) query = query.ilike("event_id", `%${data.search}%`);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const events: TrackingEventRow[] = (rows ?? []).map((row) => {
      const r = row as unknown as Omit<TrackingEventRow, "response"> & {
        response: unknown;
        orders: { order_number: string } | null;
      };
      return {
        id: r.id,
        order_id: r.order_id,
        order_number: r.orders?.order_number ?? null,
        platform: r.platform,
        event_name: r.event_name,
        event_id: r.event_id,
        status: r.status,
        message: r.message,
        match_keys: r.match_keys ?? [],
        emq: r.emq,
        response: JSON.stringify(r.response ?? {}, null, 2).slice(0, 4000),
        attempts: r.attempts,
        created_at: r.created_at,
      };
    });

    // Rolling 7-day health summary, independent of the current filters.
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { data: recent } = await db
      .from("tracking_events")
      .select("platform, status, emq")
      .gte("created_at", since);

    const summary = { sent: 0, failed: 0, skipped: 0, emq: 0 };
    const byPlatform: Record<string, { sent: number; failed: number }> = {
      meta: { sent: 0, failed: 0 },
      tiktok: { sent: 0, failed: 0 },
      ga4: { sent: 0, failed: 0 },
    };
    let emqCount = 0;
    for (const row of (recent ?? []) as Array<{ platform: string; status: string; emq: number | null }>) {
      if (row.status === "sent") summary.sent += 1;
      else if (row.status === "failed") summary.failed += 1;
      else summary.skipped += 1;
      const p = byPlatform[row.platform];
      if (p) {
        if (row.status === "sent") p.sent += 1;
        else if (row.status === "failed") p.failed += 1;
      }
      if (row.status === "sent" && typeof row.emq === "number") {
        summary.emq += row.emq;
        emqCount += 1;
      }
    }
    summary.emq = emqCount ? Math.round((summary.emq / emqCount) * 10) / 10 : 0;

    return { events, summary, byPlatform };
  });

export const retryTrackingEventFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { retryTrackingEvent } = await import("./tracking-dispatch.server");
    return retryTrackingEvent(db, data.id);
  });

/** Re-run the whole event plan for one order, e.g. after fixing credentials. */
export const resendOrderTracking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ orderId: z.string().uuid(), status: z.string().min(1) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { dispatchOrderEvents } = await import("./tracking-dispatch.server");
    return dispatchOrderEvents(db, data.orderId, data.status);
  });
