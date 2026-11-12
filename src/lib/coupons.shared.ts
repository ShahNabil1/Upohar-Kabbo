import { z } from "zod";

export type CouponDiscountType = "percent" | "flat";
export type CouponAppliesTo = "all" | "products" | "categories";
export type CouponTargetType = "product" | "category";

export type CouponRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  cap_amount: number | null;
  min_spend: number;
  max_uses_total: number | null;
  max_uses_per_customer: number | null;
  applies_to: CouponAppliesTo;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  exclude_shipping: boolean;
  uses_count: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  targets: Array<{ target_type: CouponTargetType; target_id: string }>;
};

export type CouponValidation = {
  ok: boolean;
  discount: number;
  code: string | null;
  name: string | null;
  discountType: CouponDiscountType | null;
  reason: string | null;
  minSpend?: number;
};

/** Uppercase A-Z and 0-9 only — matches the client-side input mask. */
export const COUPON_CODE_RE = /^[A-Z0-9]{3,24}$/;

/** Strips anything that is not a capital English letter or digit. */
export const maskCouponCode = (value: string) =>
  value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);

export const couponCodeSchema = z
  .string()
  .trim()
  .transform((v) => maskCouponCode(v))
  .refine((v) => COUPON_CODE_RE.test(v), "Use 3-24 capital English letters or digits only");

export const couponUpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  code: couponCodeSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  discount_type: z.enum(["percent", "flat"]),
  discount_value: z.number().positive(),
  cap_amount: z.number().positive().optional().nullable(),
  min_spend: z.number().nonnegative().default(0),
  max_uses_total: z.number().int().positive().optional().nullable(),
  max_uses_per_customer: z.number().int().positive().optional().nullable(),
  applies_to: z.enum(["all", "products", "categories"]),
  starts_at: z.string().optional().nullable(),
  ends_at: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  exclude_shipping: z.boolean().default(true),
  targets: z
    .array(
      z.object({
        target_type: z.enum(["product", "category"]),
        target_id: z.string().uuid(),
      }),
    )
    .default([]),
});

export type CouponUpsertInput = z.infer<typeof couponUpsertSchema>;

export const couponValidateSchema = z.object({
  code: z.string().trim().min(1).max(40),
  subtotal: z.number().nonnegative(),
  productIds: z.array(z.string().uuid()).max(30).default([]),
  phone: z.string().trim().max(20).optional().nullable(),
});

/** Human-readable messages for the reasons the RPC can return. */
export function couponReasonMessage(reason: string | null, minSpend?: number): string {
  switch (reason) {
    case "not_found":
      return "This coupon code is not valid";
    case "inactive":
      return "This coupon is not active";
    case "not_started":
      return "This coupon has not started yet";
    case "expired":
      return "This coupon has expired";
    case "min_spend":
      return minSpend
        ? `Minimum purchase of ৳${minSpend} required to use this coupon`
        : "Minimum purchase requirement not met";
    case "usage_limit":
      return "This coupon has reached its usage limit";
    case "customer_limit":
      return "You have already used this coupon";
    case "not_applicable":
      return "This coupon does not apply to your selected items";
    default:
      return "This coupon could not be applied";
  }
}

