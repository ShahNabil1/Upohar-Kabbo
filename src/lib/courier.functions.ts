import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin } from "./admin.server";
import type { CourierCheckResult } from "./courier.server";

const phoneSchema = z.object({
  phone: z.string().trim().min(6).max(20),
  refresh: z.boolean().optional().default(false),
});

/** BD Courier connection status — uses the dedicated /check-connection endpoint. */
export const courierConnectionStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { checkConnection } = await import("./courier.server");
    try {
      const res = await checkConnection();
      const data = (res["data"] ?? {}) as Record<string, unknown>;
      return {
        ok: Boolean(data["connected"] && data["authenticated"]),
        message: typeof res["message"] === "string" ? (res["message"] as string) : "Connected",
        serverTime: typeof data["server_time"] === "string" ? (data["server_time"] as string) : null,
      };
    } catch (error) {
      return { ok: false, message: (error as Error).message, serverTime: null };
    }
  });

/** BD Courier subscription plan + remaining search limits. */
export const courierPlan = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase, context.userId);
    const { myPlan } = await import("./courier.server");
    try {
      const res = await myPlan();
      const d = (res["data"] ?? {}) as Record<string, unknown>;
      const n = (v: unknown) => {
        const x = Number(v ?? 0);
        return Number.isFinite(x) ? x : 0;
      };
      return {
        ok: true,
        message: null as string | null,
        hasSubscription: Boolean(d["has_subscription"]),
        planName: typeof d["plan_name"] === "string" ? (d["plan_name"] as string) : "—",
        planType: typeof d["plan_type"] === "string" ? (d["plan_type"] as string) : "—",
        status: typeof d["status"] === "string" ? (d["status"] as string) : "—",
        expiresAt: typeof d["expires_at"] === "string" ? (d["expires_at"] as string) : null,
        daysRemaining: n(d["days_remaining"]),
        apiCalls: n(d["api_calls"]),
        callLimit: n(d["call_limit"]),
        paidCalls: n(d["paid_calls"]),
        paidLimit: n(d["paid_limit"]),
        remainingFreeCalls: n(d["remaining_free_calls"]),
        remainingPaidCalls: n(d["remaining_paid_calls"]),
      };
    } catch (error) {
      return {
        ok: false,
        message: (error as Error).message,
        hasSubscription: false,
        planName: "—",
        planType: "—",
        status: "—",
        expiresAt: null,
        daysRemaining: 0,
        apiCalls: 0,
        callLimit: 0,
        paidCalls: 0,
        paidLimit: 0,
        remainingFreeCalls: 0,
        remainingPaidCalls: 0,
      };
    }
  });

/**
 * Courier fraud report for a customer phone.
 * Reads the cached row first; only calls BD Courier when there is no cache yet
 * or when `refresh` is explicitly requested.
 */
export const courierCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => phoneSchema.parse(input))
  .handler(async ({ data, context }): Promise<CourierCheckResult | null> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const phone = data.phone.replace(/\s+/g, "");

    const { data: cached } = await db
      .from("courier_checks")
      .select("phone, data, checked_at")
      .eq("phone", phone)
      .maybeSingle();

    if (cached && !data.refresh) {
      const stored = cached.data as unknown as Omit<CourierCheckResult, "cached">;
      return { ...stored, checkedAt: cached.checked_at, cached: true };
    }

    const { fetchCourierCheck } = await import("./courier.server");
    let fresh: Omit<CourierCheckResult, "cached">;
    try {
      fresh = await fetchCourierCheck(phone);
    } catch (error) {
      if (cached) {
        const stored = cached.data as unknown as Omit<CourierCheckResult, "cached">;
        return { ...stored, checkedAt: cached.checked_at, cached: true };
      }
      throw error;
    }

    await db.from("courier_checks").upsert(
      {
        phone,
        success_ratio: fresh.summary.success_ratio,
        total_parcel: fresh.summary.total_parcel,
        success_parcel: fresh.summary.success_parcel,
        cancelled_parcel: fresh.summary.cancelled_parcel,
        data: JSON.parse(JSON.stringify(fresh)),
        checked_at: fresh.checkedAt,
      },
      { onConflict: "phone" },
    );

    return { ...fresh, cached: false };
  });

export type PhoneCourierBreakdown = {
  key: string;
  name: string;
  total: number;
  success: number;
  cancelled: number;
  ratio: number;
};

export type PhoneRatioSummary = {
  ratio: number;
  total: number;
  success: number;
  cancelled: number;
  couriers: PhoneCourierBreakdown[];
};

const BREAKDOWN_COURIERS = ["steadfast", "pathao", "carrybee", "redx"];

/** Cached ratios only (no API calls) for a batch of phones — used by the order list. */
export const courierCachedRatios = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phones: z.array(z.string().trim().min(6).max(20)).max(200) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<Record<string, PhoneRatioSummary>> => {
    if (data.phones.length === 0) return {};
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: rows } = await db
      .from("courier_checks")
      .select("phone, success_ratio, total_parcel, success_parcel, cancelled_parcel, data")
      .in("phone", [...new Set(data.phones)]);
    const map: Record<string, PhoneRatioSummary> = {};
    for (const row of rows ?? []) {
      const raw = (row.data ?? {}) as {
        couriers?: Array<{
          key?: string;
          name?: string;
          total_parcel?: number;
          success_parcel?: number;
          cancelled_parcel?: number;
          success_ratio?: number;
        }>;
      };
      const couriers = (raw.couriers ?? [])
        .filter((c) => BREAKDOWN_COURIERS.includes(String(c.key ?? "").toLowerCase()))
        .sort(
          (a, b) =>
            BREAKDOWN_COURIERS.indexOf(String(a.key).toLowerCase()) -
            BREAKDOWN_COURIERS.indexOf(String(b.key).toLowerCase()),
        )
        .map((c) => ({
          key: String(c.key ?? ""),
          name: String(c.name ?? c.key ?? ""),
          total: Number(c.total_parcel ?? 0),
          success: Number(c.success_parcel ?? 0),
          cancelled: Number(c.cancelled_parcel ?? 0),
          ratio: Math.round(Number(c.success_ratio ?? 0)),
        }));
      map[row.phone] = {
        ratio: Math.round(Number(row.success_ratio ?? 0)),
        total: Number(row.total_parcel ?? 0),
        success: Number(row.success_parcel ?? 0),
        cancelled: Number(row.cancelled_parcel ?? 0),
        couriers,
      };
    }
    return map;
  });
