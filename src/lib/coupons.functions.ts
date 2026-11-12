import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireAdmin, unwrap } from "./admin.server";
import { evaluateCoupon } from "./coupons.server";
import {
  couponUpsertSchema,
  couponValidateSchema,
  type CouponRow,
  type CouponValidation,
} from "./coupons.shared";

export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CouponRow[]> => {
    const db = await requireAdmin(context.supabase, context.userId);
    const rows = unwrap(
      await db
        .from("coupons")
        .select("*, coupon_targets(target_type, target_id)")
        .order("created_at", { ascending: false })
        .limit(500),
    ) as unknown as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      ...(r as unknown as CouponRow),
      discount_value: Number(r["discount_value"]),
      cap_amount: r["cap_amount"] == null ? null : Number(r["cap_amount"]),
      min_spend: Number(r["min_spend"] ?? 0),
      targets: (r["coupon_targets"] ?? []) as CouponRow["targets"],
    }));
  });

export const adminSaveCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => couponUpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    const payload = {
      code: data.code,
      name: data.name,
      description: data.description || null,
      discount_type: data.discount_type,
      discount_value: data.discount_value,
      cap_amount: data.discount_type === "percent" ? (data.cap_amount ?? null) : null,
      min_spend: data.min_spend ?? 0,
      max_uses_total: data.max_uses_total ?? null,
      max_uses_per_customer: data.max_uses_per_customer ?? null,
      applies_to: data.applies_to,
      starts_at: data.starts_at || null,
      ends_at: data.ends_at || null,
      is_active: data.is_active,
      exclude_shipping: data.exclude_shipping,
    };

    let couponId = data.id ?? null;
    if (couponId) {
      const { error } = await db.from("coupons").update(payload).eq("id", couponId);
      if (error) {
        throw new Error(
          error.code === "23505" ? "A coupon with this code already exists" : error.message,
        );
      }
    } else {
      const { data: row, error } = await db
        .from("coupons")
        .insert({ ...payload, created_by: context.userId })
        .select("id")
        .single();
      if (error) {
        throw new Error(
          error.code === "23505" ? "A coupon with this code already exists" : error.message,
        );
      }
      couponId = row.id;
    }

    await db.from("coupon_targets").delete().eq("coupon_id", couponId);
    if (data.applies_to !== "all" && data.targets.length) {
      const { error } = await db.from("coupon_targets").insert(
        data.targets.map((t) => ({
          coupon_id: couponId,
          target_type: t.target_type,
          target_id: t.target_id,
        })),
      );
      if (error) throw new Error(error.message);
    }

    return { id: couponId };
  });

export const adminToggleCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("coupons")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("coupons")
      .update({ deleted_at: new Date().toISOString(), is_active: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminRestoreCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("coupons")
      .update({ deleted_at: null, is_active: true })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Public, server-authoritative coupon check used by checkout and landing pages. */
export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => couponValidateSchema.parse(input))
  .handler(async ({ data }): Promise<CouponValidation> => {
    const { createPublicServerClient } = await import("./supabase-public");
    const result = await evaluateCoupon({
      code: data.code,
      subtotal: data.subtotal,
      productIds: data.productIds,
      phone: data.phone || null,
      db: createPublicServerClient(),
    });
    const { couponId: _couponId, ...rest } = result;
    return rest;
  });
