import { createServerFn } from "@tanstack/react-start";

import { incompleteOrderSchema, orderLookupSchema, placeOrderSchema, shortLookupSchema } from "./order-schema";
import type { DeliveryArea } from "./order-schema";
import { deliveryChargeFor, normalizeDeliveryConfig } from "./delivery-rates";

export type PlacedOrder = {
  orderNumber: string;
  total: number;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
};

export type OrderSummary = {
  orderNumber: string;
  status: string;
  createdAt: string;
  customerName: string;
  customerPhone: string;
  addressLine: string;
  city: string;
  deliveryArea: string | null;
  upazila?: string | null;
  district?: string | null;
  division?: string | null;
  note?: string | null;
  subtotal: number;
  deliveryCharge: number;
  discount: number;
  total: number;
  courierProvider?: string | null;
  courierConsignmentId?: string | null;
  courierTrackingCode?: string | null;
  couponCode?: string | null;
  items: Array<{
    name: string;
    slug: string | null;
    variantLabel: string | null;
    imageUrl?: string | null;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
    comboSelections: Array<{
      itemNameBn: string;
      itemNameEn: string;
      quantity: number;
      variantLabelBn: string;
      variantLabelEn: string;
      sku: string | null;
    }>;
  }>;
};

// Delivery configuration (site-wide rate + per-product overrides) lives in
// `site_settings.delivery`; parsing is shared with the storefront.

/**
 * Places a cash-on-delivery order. Prices, stock and delivery charge are all
 * resolved server-side from the database — the client only sends ids and
 * quantities, never money.
 */
export const placeOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => placeOrderSchema.parse(input))
  .handler(async ({ data }): Promise<PlacedOrder> => {
    const { createPublicServerClient } = await import("./supabase-public");
    const db = createPublicServerClient();

    const { getRequestSecurityContext } = await import("./request-security.server");
    const security = await getRequestSecurityContext();

    const { verifyTurnstile } = await import("./turnstile.server");
    const captcha = await verifyTurnstile(data.captchaToken, security?.ip ?? null);
    if (!captcha.ok) throw new Error("CAPTCHA_FAILED");



    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const variantIds = [...new Set([
      ...data.items.map((i) => i.variantId).filter((v): v is string => Boolean(v)),
      ...data.items.flatMap((i) => i.comboSelections.map((selection) => selection.variantId)),
    ])];

    const [productsRes, settingsRes] = await Promise.all([
      db
        .from("products")
        .select("id, slug, name_bn, name_en, price, stock, sku, is_active")
        .in("id", productIds),
      db.from("site_settings").select("value").eq("key", "delivery").maybeSingle(),
    ]);

    const variantsRes = variantIds.length
      ? await db
          .from("product_variants")
          .select("id, product_id, value_bn, value_en, group_name_bn, group_name_en, price_delta, stock, sku, is_active")
          .in("id", variantIds)
      : { data: [], error: null };

    if (productsRes.error) throw new Error("Could not load products");
    const products = productsRes.data ?? [];
    const variants = variantsRes.data ?? [];

    const { loadComboChildren, buildComboSelections } = await import("./combo-selections.server");
    const comboChildren = await loadComboChildren(db, productIds);

    const lines = data.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product || !product.is_active) throw new Error("PRODUCT_UNAVAILABLE");

      const variant = item.variantId ? variants.find((v) => v.id === item.variantId) : null;
      if (item.variantId && (!variant || !variant.is_active || variant.product_id !== product.id)) {
        throw new Error("VARIANT_UNAVAILABLE");
      }

      const available = variant ? variant.stock : product.stock;
      if (available < item.quantity) throw new Error("OUT_OF_STOCK");

      const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0);
      for (const selection of item.comboSelections) {
        const childVariant = variants.find(
          (candidate) => candidate.id === selection.variantId && candidate.product_id === selection.itemId,
        );
        if (!childVariant || !childVariant.is_active) throw new Error("COMBO_VARIANT_UNAVAILABLE");
      }
      const comboSelections = buildComboSelections(
        comboChildren.get(product.id),
        item.comboSelections,
        variants as never,
      );

      return {
        product,
        variant,
        quantity: item.quantity,
        unitPrice,
        lineTotal: unitPrice * item.quantity,
        comboSelections,
      };
    });

    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const rates = normalizeDeliveryConfig(settingsRes.data?.value);

    const { findUpazila } = await import("./bd-geo");
    if (!findUpazila(data.division, data.district, data.upazila)) {
      throw new Error("INVALID_LOCATION");
    }
    const deliveryArea: DeliveryArea =
      data.district === "ঢাকা" || data.district === "Dhaka" ? "inside_dhaka" : "outside_dhaka";

    const deliveryCharge = deliveryChargeFor(
      rates,
      deliveryArea,
      subtotal,
      lines.map((l) => l.product.id),
    );

    // Coupons are re-validated server-side; the client's number is never trusted.
    let discount = 0;
    let couponId: string | null = null;
    if (data.couponCode) {
      const { evaluateCoupon } = await import("./coupons.server");
      const result = await evaluateCoupon({
        code: data.couponCode,
        subtotal,
        productIds: [...new Set(lines.map((l) => l.product.id))],
        phone: data.customerPhone,
        db,
      });
      if (!result.ok) throw new Error(`COUPON_${(result.reason ?? "error").toUpperCase()}`);
      discount = Math.min(Math.max(0, Math.round(result.discount)), subtotal);
      couponId = result.couponId;
    }

    const total = Math.max(0, subtotal + deliveryCharge - discount);

    // Guest checkout writes go through a security-definer routine so the
    // anonymous key never needs table-level write access.
    const { data: placed, error: orderError } = await db.rpc("checkout_place_order", {
      _order: {
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        customer_email: null,
        address_line: data.addressLine,
        city: data.district,
        division: data.division,
        district: data.district,
        upazila: data.upazila,
        delivery_area: deliveryArea,
        note: data.note || null,
        subtotal,
        delivery_charge: deliveryCharge,
        discount,
        total,
        source: data.source,
        customer_ip: security.ip,
        customer_user_agent: security.userAgent,
        device_fingerprint: data.deviceFingerprint,
        customer_ip_location: security.location,
        attribution: data.attribution ?? {},
      },
      _items: lines.map((l) => ({
        product_id: l.product.id,
        product_name: l.product.name_bn,
        product_slug: l.product.slug,
        variant_label: l.variant ? `${l.variant.group_name_bn}: ${l.variant.value_bn}` : null,
        sku: l.variant?.sku ?? l.product.sku,
        unit_price: l.unitPrice,
        quantity: l.quantity,
        line_total: l.lineTotal,
        combo_selections: l.comboSelections,
      })),
      ...(couponId ? { _coupon_id: couponId } : {}),
      _discount: discount,
    });

    const order = placed as { id?: string; order_number?: string } | null;
    if (orderError?.message.includes("ORDER_BLOCKED")) throw new Error("ORDER_BLOCKED");
    if (orderError || !order?.order_number) throw new Error("ORDER_FAILED");

    // No conversion event here: a website order lands as `processing`, which is
    // not yet a confirmed sale. Purchase fires when admin confirms the order
    // (processing → pending) — see eventPlan() in tracking-dispatch.server.ts.



    return { orderNumber: order.order_number, subtotal, deliveryCharge, discount, total };
  });


/** Order receipt lookup — requires both the order number and the phone used. */
/** Public delivery-charge configuration, used to preview totals at checkout. */
export const getDeliveryRates = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicServerClient } = await import("./supabase-public");
  const db = createPublicServerClient();
  const { data } = await db.from("site_settings").select("value").eq("key", "delivery").maybeSingle();
  return normalizeDeliveryConfig(data?.value);
});

export const getOrderSummary = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => orderLookupSchema.parse(input))
  .handler(async ({ data }): Promise<OrderSummary | null> => {
    const { createPublicServerClient } = await import("./supabase-public");
    const db = createPublicServerClient();

    const { data: raw } = await db.rpc("order_receipt", {
      _order_number: data.orderNumber,
      _phone: data.phone,
    });

    const order = raw as {
      order_number: string;
      status: string;
      created_at: string;
      customer_name: string;
      customer_phone: string;
      address_line: string;
      city: string;
      delivery_area: string | null;
      subtotal: number;
      delivery_charge: number;
      discount: number;
      total: number;
      items: Array<{
        product_name: string;
        product_slug: string | null;
        variant_label: string | null;
        unit_price: number;
        quantity: number;
        line_total: number;
        combo_selections?: Array<{
          item_name_bn?: string; item_name_en?: string; quantity?: number;
          variant_label_bn?: string; variant_label_en?: string; sku?: string | null;
        }>;
      }>;
    } | null;

    if (!order) return null;

    return {
      orderNumber: order.order_number,
      status: order.status,
      createdAt: order.created_at,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      addressLine: order.address_line,
      city: order.city,
      deliveryArea: order.delivery_area,
      subtotal: Number(order.subtotal),
      deliveryCharge: Number(order.delivery_charge),
      discount: Number(order.discount),
      total: Number(order.total),
      items: (order.items ?? []).map((i) => ({
        name: i.product_name,
        slug: i.product_slug,
        variantLabel: i.variant_label,
        unitPrice: Number(i.unit_price),
        quantity: i.quantity,
        lineTotal: Number(i.line_total),
        comboSelections: (i.combo_selections ?? []).map((selection) => ({
          itemNameBn: selection.item_name_bn ?? "",
          itemNameEn: selection.item_name_en ?? selection.item_name_bn ?? "",
          quantity: Number(selection.quantity ?? 1),
          variantLabelBn: selection.variant_label_bn ?? "",
          variantLabelEn: selection.variant_label_en ?? selection.variant_label_bn ?? "",
          sku: selection.sku ?? null,
        })),
      })),
    };
  });


/** Stable fingerprint of an abandoned checkout, used to de-duplicate captures. */
function captureSignature(input: {
  name: string;
  address: string;
  items: Array<{ product_name: string; variant_label: string | null; quantity: number }>;
}) {
  const items = input.items
    .map((i) => `${i.product_name}|${i.variant_label ?? ""}|${i.quantity}`)
    .sort()
    .join("~");
  return `${input.name.trim().toLowerCase()}#${input.address.trim().toLowerCase()}#${items}`;
}

/**
 * Captures an abandoned checkout (valid phone entered, order never placed).
 * Repeat visits from the same number update the existing record and append an
 * activity log entry instead of creating duplicate orders.
 */
export const captureIncompleteOrder = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => incompleteOrderSchema.parse(input))
  .handler(async ({ data }) => {
    const { createPublicServerClient } = await import("./supabase-public");
    const db = createPublicServerClient();
    const { getRequestSecurityContext } = await import("./request-security.server");
    const security = await getRequestSecurityContext();

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const variantIds = [...new Set([
      ...data.items.map((i) => i.variantId).filter(Boolean),
      ...data.items.flatMap((i) => i.comboSelections.map((selection) => selection.variantId)),
    ])] as string[];

    const productsRes = await db
      .from("products")
      .select("id, slug, name_bn, price, sku")
      .in("id", productIds);
    const variantsRes = variantIds.length
      ? await db
          .from("product_variants")
          .select("id, product_id, value_bn, value_en, group_name_bn, group_name_en, price_delta, sku")
          .in("id", variantIds)
      : { data: [], error: null };

    const products = productsRes.data ?? [];
    const variants = variantsRes.data ?? [];
    if (!products.length) return { ok: false as const };

    const { loadComboChildren, buildComboSelections } = await import("./combo-selections.server");
    const comboChildren = await loadComboChildren(db, productIds);

    const lines = data.items.flatMap((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return [];
      const variant = item.variantId ? variants.find((v) => v.id === item.variantId) : null;
      const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0);
      return [
        {
          product_id: product.id,
          product_name: product.name_bn,
          product_slug: product.slug,
          variant_label: variant ? `${variant.group_name_bn}: ${variant.value_bn}` : null,
          sku: variant?.sku ?? product.sku,
          unit_price: unitPrice,
          quantity: item.quantity,
          line_total: unitPrice * item.quantity,
          combo_selections: buildComboSelections(
            comboChildren.get(product.id),
            item.comboSelections as never,
            variants as never,
          ),

        },
      ];
    });
    if (!lines.length) return { ok: false as const };

    const subtotal = lines.reduce((sum, l) => sum + l.line_total, 0);
    const addressLine = [data.addressLine, data.upazila, data.district, data.division]
      .filter(Boolean)
      .join(", ");
    const name = data.customerName || "Unknown";

    const { data: stateRaw } = await db.rpc("checkout_incomplete_state", {
      _phone: data.customerPhone,
    });
    const state = stateRaw as {
      has_recent_order: boolean;
      existing: {
        id: string;
        customer_name: string | null;
        address_line: string | null;
        items: Array<{ product_name: string; variant_label: string | null; quantity: number }>;
      } | null;
    } | null;

    // Never capture when the same number already placed a real order in the last day.
    if (state?.has_recent_order) return { ok: false as const };

    const existing = state?.existing ?? null;
    const nextSignature = captureSignature({ name, address: addressLine, items: lines });

    const orderPayload = {
      customer_name: name,
      customer_phone: data.customerPhone,
      address_line: data.addressLine || addressLine || "—",
      city: data.district || "—",
      division: data.division || null,
      district: data.district || null,
      upazila: data.upazila || null,
      note: data.note || null,
      subtotal,
      source: data.source,
      customer_ip: security.ip,
      customer_user_agent: security.userAgent,
      device_fingerprint: data.deviceFingerprint,
      customer_ip_location: security.location,
      attribution: data.attribution ?? {},
    };

    if (existing) {
      const prevSignature = captureSignature({
        name: existing.customer_name ?? "",
        address: existing.address_line ?? "",
        items: existing.items ?? [],
      });
      const changed = prevSignature !== nextSignature;

      await db.rpc("checkout_save_incomplete", {
        _existing_id: existing.id,
        _order: orderPayload,
        _items: lines,
        _replace_items: changed,
        _activity_kind: changed ? "update" : "revisit",
        _activity_message: changed
          ? "Customer returned with updated checkout details"
          : "Customer returned and left checkout again with the same details",
        _activity_meta: { source: data.source, subtotal },
      });

      return { ok: true as const, deduplicated: true };
    }

    const { error } = await db.rpc("checkout_save_incomplete", {
      _existing_id: null as unknown as string,
      _order: orderPayload,
      _items: lines,
      _replace_items: true,
      _activity_kind: "capture",
      _activity_message: "Abandoned checkout captured from the website",
      _activity_meta: { source: data.source, subtotal },
    });
    if (error) return { ok: false as const };

    return { ok: true as const, deduplicated: false };
  });

/** Short receipt lookup — order number + last 4 digits of the customer phone. */
export const getOrderSummaryShort = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => shortLookupSchema.parse(input))
  .handler(async ({ data }): Promise<OrderSummary | null> => {
    const { createPublicServerClient } = await import("./supabase-public");
    const { mapReceipt } = await import("./order-receipt");
    const db = createPublicServerClient();
    const { data: raw } = await (
      db.rpc as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ data: unknown }>
    )("order_receipt_short", { _order_number: data.orderNumber, _p: data.p });
    return mapReceipt(raw as never) as OrderSummary | null;
  });
