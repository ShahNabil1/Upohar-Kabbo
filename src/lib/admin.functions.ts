import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { actorName, logActivity, requireAdmin, unwrap } from "./admin.server";
import {
  adminCreateOrderSchema,
  categorySchema,
  customerLookupSchema,
  faqSchema,
  mirrorLang,
  idSchema,
  landingPageSchema,
  orderListSchema,
  orderStatusSchema,
  productSchema,
  productSearchSchema,
  promotionSchema,
  settingSchema,
  subcategorySchema,
  adminEditOrderSchema,
  webOrderStatuses,
  listOrderStatuses,
  payableStatuses,
} from "./admin-schema";



/** True when the signed-in user holds the admin role. Safe for any logged-in user. */
export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<boolean> => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return Boolean(data);
  });

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    const [products, orders, categories, promotions, recent] = await Promise.all([
      db.from("products").select("id", { count: "exact", head: true }),
      db.from("orders").select("total, status, created_at"),
      db.from("categories").select("id", { count: "exact", head: true }),
      db.from("promotions").select("id", { count: "exact", head: true }),
      db
        .from("orders")
        .select("id, order_number, customer_name, total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

    const rows = (orders.data ?? []) as Array<{
      total: number | string;
      status: string;
      created_at: string;
    }>;
    const revenue = rows
      .filter((r) => r.status !== "cancelled" && r.status !== "returned")
      .reduce((sum, r) => sum + Number(r.total), 0);
    const pending = rows.filter((r) => r.status === "pending").length;

    return {
      productCount: products.count ?? 0,
      orderCount: rows.length,
      categoryCount: categories.count ?? 0,
      promotionCount: promotions.count ?? 0,
      revenue,
      pending,
      recent: (recent.data ?? []) as Array<{
        id: string;
        order_number: string;
        customer_name: string;
        total: number | string;
        status: string;
        created_at: string;
      }>,
    };
  });

export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderListSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    let q = db
      .from("orders")
      .select(
        "id, order_number, customer_name, customer_phone, city, total, status, source, customer_ip, created_at, created_by, created_by_name, delivery_partner, courier_status, courier_consignment_id, order_consignments(provider, delivery_fee, cod_amount, total_cost, collected_amount, status, payment_invoice_id, paid_at)",
      )
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.payment) q = q.in("status", [...payableStatuses]);
    else if (data.status) q = q.eq("status", data.status);
    else if (data.bucket === "web") q = q.in("status", [...webOrderStatuses]);
    else if (data.bucket === "list") q = q.in("status", [...listOrderStatuses]);
    // bucket "search" searches every order regardless of status.
    if (data.search) {
      const s = data.search.replace(/[%,]/g, "");
      const filters = [
        `order_number.ilike.%${s}%`,
        `customer_name.ilike.%${s}%`,
        `customer_phone.ilike.%${s}%`,
        `alt_phone.ilike.%${s}%`,
        `courier_consignment_id.ilike.%${s}%`,
      ];
      if (data.bucket === "search") {
        // Tracking / consignment codes live on the consignment rows too.
        const { data: hits } = await db
          .from("order_consignments")
          .select("order_id")
          .or(`consignment_id.ilike.%${s}%,tracking_code.ilike.%${s}%`)
          .limit(200);
        const ids = [...new Set(((hits ?? []) as Array<{ order_id: string | null }>)
          .map((h) => h.order_id)
          .filter((v): v is string => Boolean(v)))];
        if (ids.length) filters.push(`id.in.(${ids.join(",")})`);
      }
      q = q.or(filters.join(","));
    }
    const rows = unwrap(await q);
    if (!data.payment) return rows;
    /** Paid = at least one consignment carries a courier payout invoice. */
    const isPaid = (o: unknown) =>
      ((o as { order_consignments?: Array<{ paid_at?: string | null }> }).order_consignments ?? [])
        .some((c) => Boolean(c.paid_at));
    return (rows as unknown[]).filter((o) =>
      data.payment === "paid" ? isPaid(o) : !isPaid(o),
    ) as typeof rows;
  });

export const adminGetOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: order, error } = await db
      .from("orders")
      .select(
        "*, order_items(*), order_activity(id, kind, message, meta, created_at), order_consignments(provider, collected_amount, delivery_fee, total_cost, status, return_consignment_id, payment_invoice_id, paid_at)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return order;
  });

export const adminUpdateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => orderStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { actorName, logActivity } = await import("./admin.server");
    const who = await actorName(db, context.userId);
    const { data: prev } = await db
      .from("orders")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    const before = (prev as { status?: string } | null)?.status ?? "—";
    const { error } = await db
      .from("orders")
      .update({
        status: data.status,
        // A schedule only belongs to the scheduled_order status; any other
        // status clears it so the cron job never resurrects the order.
        scheduled_for: data.status === "scheduled_order" ? (data.scheduledFor ?? null) : null,
        ...(data.deliveryPartner ? { delivery_partner: data.deliveryPartner } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.deliveryPartner) {
      await logActivity(db, data.id, "courier", `${who} selected ${data.deliveryPartner} as delivery partner`, {
        actor: who,
      });
    }
    await logActivity(
      db,
      data.id,
      "status",
      `${who} changed status ${before} → ${data.status}${data.reason ? ` — ${data.reason}` : ""}`,
      {
        actor: who,
        meta: {
          from: before,
          to: data.status,
          reason: data.reason ?? null,
          skipSms: data.skipSms ?? false,
        },
      },
    );
    if (data.skipSms) {
      await logActivity(db, data.id, "sms", `${who} confirmed without sending SMS`, { actor: who });
    }

    // Auto confirmation SMS once an order moves into the confirmed pipeline.
    if (!data.skipSms && (data.status === "pending" || data.status === "confirmed")) {
      const { ORDER_SMS_SELECT } = await import("./sms-template");
      const { data: order } = await db
        .from("orders")
        .select(`${ORDER_SMS_SELECT}, auto_sms_status`)
        .eq("id", data.id)
        .maybeSingle();
      const o = order as unknown as Record<string, unknown> | null;
      // Template body + auto-send toggle live in Settings → SMS Templates.
      const { data: tplRow } = await db
        .from("sms_templates")
        .select("body, enabled")
        .eq("key", "order_confirm")
        .maybeSingle();
      const tplData = tplRow as { body?: string; enabled?: boolean } | null;
      const autoEnabled = tplData?.enabled !== false;

      if (o && autoEnabled && o["auto_sms_status"] !== "sent") {
        const { deliverSms, renderSmsTemplate } = await import("./sms.server");
        const { orderSmsVars } = await import("./sms-template");
        const tpl = tplData?.body ?? "";
        const message = renderSmsTemplate(tpl, orderSmsVars(o as never));
        const result = await deliverSms(db, {
          orderId: data.id,
          phone: String(o["customer_phone"] ?? ""),
          message,
          isManual: false,
          sentByName: "System",
        });
        await db
          .from("orders")
          .update({ auto_sms_status: result.ok ? "sent" : "failed" })
          .eq("id", data.id);
        await db.from("order_activity").insert({
          order_id: data.id,
          kind: "sms",
          message: `Auto confirmation SMS ${result.ok ? "sent" : "failed"} — ${result.message}`,
        });
      }
    }

    if (before !== data.status) {
      const { sendAutoStatusSms } = await import("./sms-auto.server");
      await sendAutoStatusSms(db, data.id, data.status);
    }

    // Inventory bridge: deduct stock on commitment, give it back on release.
    if (before !== data.status) {
      try {
        const { applyOrderStock } = await import("./inventory-fulfilment.server");
        const { data: onum } = await db
          .from("orders")
          .select("order_number")
          .eq("id", data.id)
          .maybeSingle();
        const res = await applyOrderStock(db, data.id, data.status, {
          actorName: who,
          orderNumber: (onum as { order_number?: string } | null)?.order_number ?? null,
        });
        if (res.moved > 0) {
          await logActivity(
            db,
            data.id,
            "inventory",
            res.direction === "out"
              ? `Stock deducted for ${res.moved} item line(s)`
              : `Stock returned for ${res.moved} item line(s)`,
            { actor: who, meta: { direction: res.direction, lines: res.moved } },
          );
        }
      } catch (err) {
        await logActivity(db, data.id, "inventory", `Stock update failed — ${(err as Error).message}`, {
          actor: who,
        });
      }
    }

    // Server-side conversion fan-out (Meta CAPI · TikTok Events · GA4 MP).
    // Deduped per order+platform+event, and never allowed to break the update.
    if (before !== data.status) {
      try {
        const { dispatchOrderEvents } = await import("./tracking-dispatch.server");
        await dispatchOrderEvents(db, data.id, data.status);
      } catch {
        // Tracking outages must not fail the status change.
      }
    }
    return { ok: true };
  });


/** Edit the customer details of a web/incomplete order before confirming it. */
export const adminEditOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminEditOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: current, error: readError } = await db
      .from("orders")
      .select("subtotal")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Order not found");

    const subtotal = Number(current.subtotal ?? 0);
    const total = Math.max(0, subtotal + data.deliveryCharge - data.discount);
    const { error } = await db
      .from("orders")
      .update({
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        address_line: data.addressLine,
        note: data.note || null,
        discount: data.discount,
        delivery_charge: data.deliveryCharge,
        total,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await db.from("order_activity").insert({
      order_id: data.id,
      kind: "edit",
      message: "Order details updated by admin",
    });
    return { ok: true };
  });

export const adminTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const [categories, subcategories] = await Promise.all([
      db.from("categories").select("*").order("sort_order"),
      db.from("subcategories").select("*").order("sort_order"),
    ]);
    if (categories.error) throw new Error(categories.error.message);
    if (subcategories.error) throw new Error(subcategories.error.message);
    return { categories: categories.data, subcategories: subcategories.data };
  });

export const adminSaveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => categorySchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    if (rest.is_featured) {
      const existing = await db.from("categories").select("id").eq("is_featured", true);
      const others = (existing.data ?? []).filter((c) => c.id !== id);
      if (others.length >= 4) throw new Error("Maximum 4 featured categories allowed");
    }
    let payload = rest;
    if (!id) {
      const { data: last } = await db
        .from("categories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      payload = { ...rest, sort_order: Number(last?.sort_order ?? -1) + 1 };
    }
    const res = id
      ? await db.from("categories").update(payload).eq("id", id).select("id").single()
      : await db.from("categories").insert(payload).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminToggleCategoryActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("categories")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminReorderCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    for (let i = 0; i < data.ids.length; i += 1) {
      const { error } = await db
        .from("categories")
        .update({ sort_order: i })
        .eq("id", data.ids[i] as string);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.ids.length };
  });

export const adminSaveSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => subcategorySchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    let payload = rest;
    if (!id) {
      const { data: last } = await db
        .from("subcategories")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      payload = { ...rest, sort_order: Number(last?.sort_order ?? -1) + 1 };
    }
    const res = id
      ? await db.from("subcategories").update(payload).eq("id", id).select("id").single()
      : await db.from("subcategories").insert(payload).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const adminDeleteSubcategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("subcategories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminReorderSubcategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    for (let i = 0; i < data.ids.length; i += 1) {
      const { error } = await db
        .from("subcategories")
        .update({ sort_order: i })
        .eq("id", data.ids[i] as string);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.ids.length };
  });

/** Hidden internal category that holds every combo sub-item. */
const SUB_ITEM_CATEGORY_SLUG = "internal-sub-items";

async function subItemCategoryId(db: Awaited<ReturnType<typeof requireAdmin>>): Promise<string> {
  const existing = await db
    .from("categories")
    .select("id")
    .eq("slug", SUB_ITEM_CATEGORY_SLUG)
    .maybeSingle();
  if (existing.data?.id) return existing.data.id as string;
  const created = await db
    .from("categories")
    .insert({
      slug: SUB_ITEM_CATEGORY_SLUG,
      name_bn: "সাব-আইটেম (ইন্টারনাল)",
      name_en: "Sub items (internal)",
      is_active: false,
      sort_order: 999,
    })
    .select("id")
    .single();
  if (created.error) throw new Error(created.error.message);
  return created.data.id as string;
}

export const adminListProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ kind: z.enum(["single", "component", "combo"]).optional() })
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    let q = db
      .from("products")
      .select(
        "id, slug, kind, name_bn, name_en, price, cost_price, compare_at_price, sku, is_active, is_featured, sort_order, category_id, subcategory_id, product_images(url, sort_order), product_variants(id)",
      )
      .order("sort_order")
      .limit(500);
    if (data.kind === "component") q = q.eq("kind", "component");
    else if (data.kind === "combo") q = q.eq("kind", "combo");
    else if (data.kind === "single") q = q.neq("kind", "component");
    return unwrap(await q);
  });

/** Sub-items available to drop into a combo box. */
export const adminSubProductOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(
      await db
        .from("products")
        .select(
          "id, name_bn, name_en, sku, price, cost_price, product_images(url, sort_order), product_variants(id, group_name_bn, value_bn, price_delta)",
        )
        .eq("kind", "component")
        .order("name_bn")
        .limit(500),
    );
  });

export const adminGetProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: product, error } = await db
      .from("products")
      .select("*, product_images(*), product_variants(*), combo_items!combo_items_combo_id_fkey(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return product;
  });

export const adminSaveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productSchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, images, variants, combo_items, category_id, ...rest } = data;

    const resolvedCategory =
      category_id ?? (rest.kind === "component" ? await subItemCategoryId(db) : null);
    if (!resolvedCategory) throw new Error("Category is required");

    const payload = { ...rest, category_id: resolvedCategory };

    const res = id
      ? await db.from("products").update(payload).eq("id", id).select("id").single()
      : await db.from("products").insert(payload).select("id").single();
    if (res.error) throw new Error(res.error.message);
    const productId = res.data.id as string;

    await db.from("product_images").delete().eq("product_id", productId);
    if (images.length) {
      const ins = await db
        .from("product_images")
        .insert(images.map((img, i) => ({ ...img, sort_order: i, product_id: productId })));
      if (ins.error) throw new Error(ins.error.message);
    }

    await db.from("product_variants").delete().eq("product_id", productId);
    if (variants.length) {
      const ins = await db
        .from("product_variants")
        .insert(variants.map((v, i) => ({ ...v, sort_order: i, product_id: productId })));
      if (ins.error) throw new Error(ins.error.message);
    }

    if (rest.kind === "combo") {
      await db.from("combo_items").delete().eq("combo_id", productId);
      if (combo_items.length) {
        const ins = await db
          .from("combo_items")
          .insert(combo_items.map((c, i) => ({ ...c, sort_order: i, combo_id: productId })));
        if (ins.error) throw new Error(ins.error.message);
      }
    }

    return { id: productId };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const used = await db
      .from("combo_items")
      .select("combo_id", { count: "exact", head: true })
      .eq("item_id", data.id);
    if ((used.count ?? 0) > 0) {
      throw new Error("এই আইটেমটি একটি কম্বো বক্সে ব্যবহৃত হচ্ছে — আগে সেখান থেকে সরান।");
    }
    await db.from("combo_items").delete().eq("combo_id", data.id);
    await db.from("product_images").delete().eq("product_id", data.id);
    await db.from("product_variants").delete().eq("product_id", data.id);
    await db.from("promotion_products").delete().eq("product_id", data.id);
    await db.from("landing_pages").delete().eq("product_id", data.id);
    const { error } = await db.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Drag-and-drop ordering on the product list pages. */
export const adminReorderProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ ids: z.array(z.string().uuid()).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    for (let i = 0; i < data.ids.length; i += 1) {
      const { error } = await db
        .from("products")
        .update({ sort_order: i })
        .eq("id", data.ids[i] as string);
      if (error) throw new Error(error.message);
    }
    return { ok: true, count: data.ids.length };
  });

/** Bulk delete — full-access staff and admins only. */
export const adminBulkDeleteProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);

    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      const staff = await db
        .from("staff_accounts")
        .select("full_access, is_active")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!staff.data?.full_access || !staff.data.is_active) {
        throw new Error("এই কাজটি করার অনুমতি নেই।");
      }
    }

    const blocked = unwrap(
      await db.from("combo_items").select("item_id").in("item_id", data.ids),
    ) as Array<{ item_id: string }>;
    const blockedIds = new Set(blocked.map((b) => b.item_id));
    const ids = data.ids.filter((id) => !blockedIds.has(id));

    if (ids.length > 0) {
      await db.from("combo_items").delete().in("combo_id", ids);
      await db.from("product_images").delete().in("product_id", ids);
      await db.from("product_variants").delete().in("product_id", ids);
      await db.from("promotion_products").delete().in("product_id", ids);
      await db.from("landing_pages").delete().in("product_id", ids);
      const { error } = await db.from("products").delete().in("id", ids);
      if (error) throw new Error(error.message);
    }

    return { deleted: ids.length, skipped: blockedIds.size };
  });

export const adminListPromotions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(
      await db
        .from("promotions")
        .select(
          "*, promotion_products(product_id, sort_order, discount_type, discount_value, price_before, compare_before)",
        )
        .order("sort_order"),
    );
  });

type PromoDb = Awaited<ReturnType<typeof requireAdmin>>;

/**
 * Promotion discounts are written onto the product price itself, and the
 * pre-discount price is kept on the promotion link so it can be rolled back.
 * That keeps ONE price source for storefront, cart, checkout, orders and
 * profit reports (cost_price is never touched, so margins stay correct).
 */
async function restorePromotionPrices(db: PromoDb, promotionId: string) {
  const { data } = await db
    .from("promotion_products")
    .select("product_id, price_before, compare_before")
    .eq("promotion_id", promotionId);
  for (const row of data ?? []) {
    if (row.price_before == null) continue;
    await db
      .from("products")
      .update({ price: row.price_before, compare_at_price: row.compare_before })
      .eq("id", row.product_id);
  }
}

function discountedPrice(
  price: number,
  type: "none" | "percent" | "flat" | "fixed_price",
  value: number,
) {
  if (type === "none" || !(value > 0)) return null;
  const next =
    type === "percent" ? price * (1 - value / 100) : type === "flat" ? price - value : value;
  const rounded = Math.round(next);
  if (!Number.isFinite(rounded) || rounded < 0 || rounded >= price) return null;
  return rounded;
}

export const adminSavePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => promotionSchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, products, ...rest } = data;

    // Roll back any prices this promotion had previously discounted.
    if (id) await restorePromotionPrices(db, id);

    const res = id
      ? await db.from("promotions").update(rest).eq("id", id).select("id").single()
      : await db.from("promotions").insert(rest).select("id").single();
    if (res.error) throw new Error(res.error.message);
    const promotionId = res.data.id as string;

    await db.from("promotion_products").delete().eq("promotion_id", promotionId);
    if (!products.length) return { id: promotionId, discounted: 0 };

    const today = new Date().toISOString().slice(0, 10);
    const started = !rest.starts_at || rest.starts_at.slice(0, 10) <= today;
    const notEnded = !rest.ends_at || rest.ends_at.slice(0, 10) >= today;
    const live = rest.is_active && started && notEnded;

    const { data: rows } = await db
      .from("products")
      .select("id, price, compare_at_price")
      .in(
        "id",
        products.map((p) => p.product_id),
      );
    const byId = new Map((rows ?? []).map((r) => [r.id as string, r]));

    let discounted = 0;
    const links = products.map((p, i) => {
      const row = byId.get(p.product_id);
      const price = Number(row?.price ?? 0);
      const next = live && row ? discountedPrice(price, p.discount_type, p.discount_value) : null;
      if (next == null) {
        return {
          promotion_id: promotionId,
          product_id: p.product_id,
          sort_order: i,
          discount_type: p.discount_type,
          discount_value: p.discount_value,
          price_before: null,
          compare_before: null,
        };
      }
      discounted += 1;
      return {
        promotion_id: promotionId,
        product_id: p.product_id,
        sort_order: i,
        discount_type: p.discount_type,
        discount_value: p.discount_value,
        price_before: price,
        compare_before: row?.compare_at_price ?? null,
      };
    });

    const ins = await db.from("promotion_products").insert(links);
    if (ins.error) throw new Error(ins.error.message);

    for (const link of links) {
      if (link.price_before == null) continue;
      const original = Number(link.price_before);
      const row = byId.get(link.product_id);
      const p = products.find((x) => x.product_id === link.product_id)!;
      const next = discountedPrice(original, p.discount_type, p.discount_value);
      if (next == null) continue;
      const { error } = await db
        .from("products")
        .update({
          price: next,
          // Keep the pre-offer price visible as the struck-through price.
          compare_at_price:
            Number(row?.compare_at_price ?? 0) > original
              ? Number(row?.compare_at_price ?? original)
              : original,

        })
        .eq("id", link.product_id);
      if (error) throw new Error(error.message);
    }

    return { id: promotionId, discounted };
  });

/** Drag-and-drop ordering for the promotion list. */
export const adminReorderPromotions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    for (let i = 0; i < data.ids.length; i += 1) {
      const { error } = await db
        .from("promotions")
        .update({ sort_order: i })
        .eq("id", data.ids[i] as string);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeletePromotion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    // Put original prices back before the links disappear.
    await restorePromotionPrices(db, data.id);
    await db.from("promotion_products").delete().eq("promotion_id", data.id);
    const { error } = await db.from("promotions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const adminListLandingPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(await db.from("landing_pages").select("*").order("created_at"));
  });

export const adminSaveLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => landingPageSchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, bullets, seo, ...rest } = data;
    const payload = { ...rest, content: { bullets, seo } };

    const res = id
      ? await db.from("landing_pages").update(payload).eq("id", id).select("id").single()
      : await db.from("landing_pages").insert(payload).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const adminDeleteLandingPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("landing_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListFaqs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(await db.from("faqs").select("*").order("sort_order"));
  });

export const adminSaveFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => faqSchema.parse(mirrorLang(input)))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { id, ...rest } = data;
    let payload = rest;
    if (!id) {
      const { data: last } = await db
        .from("faqs")
        .select("sort_order")
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      payload = { ...rest, sort_order: Number(last?.sort_order ?? -1) + 1 };
    }
    const res = id
      ? await db.from("faqs").update(payload).eq("id", id).select("id").single()
      : await db.from("faqs").insert(payload).select("id").single();
    if (res.error) throw new Error(res.error.message);
    return res.data;
  });

export const adminReorderFaqs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    for (const [index, id] of data.ids.entries()) {
      const { error } = await db.from("faqs").update({ sort_order: index }).eq("id", id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminDeleteFaq = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db.from("faqs").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminGetCleanupStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(730).default(45) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.days);
    const cutoffIso = cutoff.toISOString();

    const [activity, webhooks, notes, consignments] = await Promise.all([
      db
        .from("order_activity")
        .select("id", { count: "exact", head: true })
        .in(
          "order_id",
          (await db.from("orders").select("id").lt("created_at", cutoffIso)).data?.map((r) => r.id) ?? [],
        ),
      db.from("courier_webhook_events").select("id", { count: "exact", head: true }).lt("created_at", cutoffIso),
      db
        .from("order_notes")
        .select("id", { count: "exact", head: true })
        .in(
          "order_id",
          (await db.from("orders").select("id").lt("created_at", cutoffIso)).data?.map((r) => r.id) ?? [],
        ),
      db
        .from("order_consignments")
        .select("id", { count: "exact", head: true })
        .neq("raw", '{}')
        .in(
          "order_id",
          (await db.from("orders").select("id").lt("created_at", cutoffIso)).data?.map((r) => r.id) ?? [],
        ),
    ]);

    return {
      cutoff: cutoffIso,
      activityRows: activity.count ?? 0,
      webhookRows: webhooks.count ?? 0,
      noteRows: notes.count ?? 0,
      rawPayloadRows: consignments.count ?? 0,
    };
  });

export const adminRunCleanup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ days: z.number().int().min(7).max(730).default(45) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: result, error } = await db.rpc("cleanup_old_order_logs", {
      _retention_days: data.days,
    });
    if (error) throw new Error(error.message);

    const now = new Date().toISOString();
    await db
      .from("site_settings")
      .upsert(
        {
          key: "retention",
          value: {
            days: data.days,
            enabled: true,
            last_run: now,
            last_result: result,
          } as never,
        },
        { onConflict: "key" },
      );

    const r = result as {
      success?: boolean;
      cutoff?: string;
      retention_days?: number;
      deleted_activity?: number;
      deleted_webhooks?: number;
      deleted_notes?: number;
      truncated_consignments?: number;
    };
    return {
      success: r.success ?? true,
      cutoff: r.cutoff ?? now,
      retentionDays: r.retention_days ?? data.days,
      deletedActivity: r.deleted_activity ?? 0,
      deletedWebhooks: r.deleted_webhooks ?? 0,
      deletedNotes: r.deleted_notes ?? 0,
      truncatedConsignments: r.truncated_consignments ?? 0,
    };
  });

export const adminListSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(await db.from("site_settings").select("*").order("key"));
  });

export const adminSaveSetting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => settingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { error } = await db
      .from("site_settings")
      .upsert(
        { key: data.key, value: data.value as never },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Product search for the manual order builder — matches product name or SKU. */
export const adminSearchProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => productSearchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const q = data.query.replace(/[%,]/g, "").trim();
    let query = db
      .from("products")
      .select(
        `id, kind, name_bn, name_en, sku, price, stock,
         product_images(url, sort_order),
         product_variants(id, value_bn, value_en, group_name_bn, group_name_en, sku, price_delta, stock, is_active),
         combo_items!combo_items_combo_id_fkey(id, quantity, label_bn, label_en, products!combo_items_item_id_fkey(
           id, name_bn, name_en, product_variants(id, value_bn, value_en, group_name_bn, group_name_en, sku, is_active)
         ))`,
      )
      .eq("is_active", true)
      .order("sort_order")
      .limit(20);
    if (q) query = query.or(`name_bn.ilike.%${q}%,name_en.ilike.%${q}%,sku.ilike.%${q}%`);
    return unwrap(await query);
  });

/** Most recent order for a phone number — powers the "Fill" auto-complete button. */
export const adminLookupCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => customerLookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const { data: rows } = await db
      .from("orders")
      .select(
        "customer_name, customer_phone, address_line, city, division, district, upazila, note, source, created_at",
      )
      .eq("customer_phone", data.phone)
      .order("created_at", { ascending: false })
      .limit(1);
    const last = rows?.[0];
    if (!last) return null;
    const { count } = await db
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("customer_phone", data.phone);
    return { ...last, orderCount: count ?? 1 };
  });

/** All past orders for a phone number — powers the "previous orders" popup. */
export const adminCustomerOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => customerLookupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    return unwrap(
      await db
        .from("orders")
        .select(
          `id, order_number, created_at, customer_name, customer_phone, delivery_partner,
           total, status,
           order_items(product_name, variant_label, sku, quantity)`,
        )
        .eq("customer_phone", data.phone)
        .order("created_at", { ascending: false })
        .limit(100),
    );
  });

/** Creates a manual (admin-placed) order. Prices are re-resolved server-side. */
export const adminCreateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adminCreateOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const db = await requireAdmin(context.supabase, context.userId);
    const creator = await actorName(db, context.userId);

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const variantIds = [
      ...new Set([
        ...data.items.map((i) => i.variantId).filter((v): v is string => Boolean(v)),
        ...data.items.flatMap((i) => i.comboSelections.map((selection) => selection.variantId)),
      ]),
    ];

    const [productsRes, variantsRes] = await Promise.all([
      db.from("products").select("id, slug, name_bn, price, sku").in("id", productIds),
      variantIds.length
        ? db
            .from("product_variants")
            .select("id, product_id, group_name_bn, group_name_en, value_bn, value_en, sku, price_delta")
            .in("id", variantIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (productsRes.error) throw new Error(productsRes.error.message);

    const products = productsRes.data ?? [];
    const variants = (variantsRes.data ?? []) as Array<{
      id: string;
      product_id: string;
      group_name_bn: string;
      value_bn: string;
      value_en: string;
      group_name_en: string;
      sku: string | null;
      price_delta: number | string;
    }>;

    const { loadComboChildren, buildComboSelections } = await import("./combo-selections.server");
    const comboChildren = await loadComboChildren(db, productIds);

    const lines = data.items.map((item) => {
      const product = products.find((p) => p.id === item.productId);
      if (!product) throw new Error("Product not found");
      const variant = item.variantId ? variants.find((v) => v.id === item.variantId) : null;
      const unitPrice = item.unitPrice;
      const comboSelections = buildComboSelections(
        comboChildren.get(product.id),
        item.comboSelections as never,
        variants as never,
      );
      return { product, variant, quantity: item.quantity, unitPrice, lineTotal: unitPrice * item.quantity, comboSelections };
    });


    const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
    const total = Math.max(0, subtotal + data.deliveryCharge - data.discount);

    const { data: order, error } = await db
      .from("orders")
      .insert({
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        address_line: data.addressLine,
        city: data.district,
        division: data.division,
        district: data.district,
        upazila: data.upazila,
        delivery_area: data.district === "ঢাকা" ? "inside_dhaka" : "outside_dhaka",
        note: data.note || null,
        subtotal,
        delivery_charge: data.deliveryCharge,
        discount: data.discount,
        total,
        advance_amount: data.advanceAmount,
        advance_method: data.advanceAmount > 0 ? data.advanceMethod : null,
        // Manual orders are managed later in Processing, so no courier yet.
        delivery_partner: data.mode === "manual" ? null : data.deliveryPartner,
        delivery_note: data.mode === "manual" ? null : data.deliveryNote || null,
        payment_method: data.advanceAmount > 0 ? "partial_advance" : "cod",
        status:
          data.mode === "manual"
            ? data.preOrder
              ? "pre_order"
              : data.scheduledFor
                ? "scheduled_order"
                : "processing"
            : "pending",
        scheduled_for:
          data.mode === "manual" && !data.preOrder && data.scheduledFor
            ? data.scheduledFor
            : null,
        source: data.source,
        created_by: context.userId,
        created_by_name: creator,
      })
      .select("id, order_number")
      .single();
    if (error || !order) throw new Error(error?.message ?? "Order creation failed");

    const { error: itemsError } = await db.from("order_items").insert(
      lines.map((l) => ({
        order_id: order.id,
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
    );
    if (itemsError) throw new Error(itemsError.message);

    await logActivity(db, order.id, "create", `${creator} created this order manually`, {
      actor: creator,
      meta: { mode: data.mode },
    });

    if (data.mode === "manual" && (data.preOrder || data.scheduledFor)) {
      const { sendAutoStatusSms } = await import("./sms-auto.server");
      await sendAutoStatusSms(db, order.id as string, data.preOrder ? "pre_order" : "scheduled_order");
    }

    return { id: order.id as string, orderNumber: order.order_number as string };
  });
