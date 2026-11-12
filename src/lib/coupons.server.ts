import { COUPON_CODE_RE, maskCouponCode, type CouponDiscountType, type CouponValidation } from "./coupons.shared";

/**
 * Server-authoritative coupon check. The same routine runs again inside
 * placeOrder, so a tampered client can never award itself a discount.
 */
export async function evaluateCoupon(input: {
  code: string;
  subtotal: number;
  productIds: string[];
  phone: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
}): Promise<CouponValidation & { couponId: string | null }> {
  const fail = (reason: string): CouponValidation & { couponId: string | null } => ({
    ok: false,
    discount: 0,
    code: null,
    name: null,
    discountType: null,
    reason,
    couponId: null,
  });

  const code = maskCouponCode(input.code);
  if (!COUPON_CODE_RE.test(code)) return fail("not_found");

  const { data, error } = await input.db.rpc("validate_coupon", {
    _code: code,
    _subtotal: input.subtotal,
    _product_ids: input.productIds,
    _phone: input.phone,
  });
  if (error) return fail("error");

  const r = (data ?? {}) as Record<string, unknown>;
  if (!r["ok"]) {
    const failed = fail(String(r["reason"] ?? "error"));
    return r["min_spend"] != null ? { ...failed, minSpend: Number(r["min_spend"]) } : failed;
  }

  return {
    ok: true,
    discount: Number(r["discount"] ?? 0),
    code: (r["code"] as string) ?? code,
    name: (r["name"] as string) ?? null,
    discountType: (r["discount_type"] as CouponDiscountType) ?? null,
    reason: null,
    couponId: (r["coupon_id"] as string) ?? null,
    ...(r["min_spend"] != null ? { minSpend: Number(r["min_spend"]) } : {}),
  };
}

/** Records a redemption after an order is created; never blocks the order. */
export async function recordCouponRedemption(input: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  couponId: string;
  orderId: string;
  phone: string;
  amount: number;
}) {
  try {
    await input.db.from("coupon_redemptions").insert({
      coupon_id: input.couponId,
      order_id: input.orderId,
      phone: input.phone,
      discount_amount: input.amount,
    });
    const { data: row } = await input.db
      .from("coupons")
      .select("uses_count")
      .eq("id", input.couponId)
      .maybeSingle();
    await input.db
      .from("coupons")
      .update({ uses_count: Number(row?.uses_count ?? 0) + 1 })
      .eq("id", input.couponId);
  } catch {
    /* redemption logging must never fail an order */
  }
}

